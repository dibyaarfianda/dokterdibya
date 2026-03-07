/**
 * Async PDF Queue — decouples PDF generation from request lifecycle.
 *
 * Instead of blocking the HTTP response while PDFKit renders + R2 uploads,
 * callers submit a job and poll for status. This keeps p95 latency low for
 * billing/finalize endpoints.
 *
 * Flow:
 *   1. POST /api/pdf/queue  → creates a job, returns { jobId, status: 'queued' }
 *   2. Worker picks job from the in-memory queue, generates PDF, uploads to R2
 *   3. GET  /api/pdf/queue/:jobId → returns status + downloadUrl when done
 *
 * Concurrency:  MAX_CONCURRENT workers (default 2, env PDF_QUEUE_CONCURRENCY)
 * Retention:    Completed jobs kept for JOB_TTL_MS (default 30 min) then pruned
 * Failure:      Jobs retry up to MAX_RETRIES (default 2) with exponential backoff
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = parseInt(process.env.PDF_QUEUE_CONCURRENCY, 10) || 2;
const MAX_RETRIES    = parseInt(process.env.PDF_QUEUE_MAX_RETRIES, 10) || 2;
const JOB_TTL_MS     = parseInt(process.env.PDF_QUEUE_JOB_TTL_MS, 10) || 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Map<string, Job>} */
const jobs = new Map();

/** @type {Job[]} */
const queue = [];

let activeWorkers = 0;

// ---------------------------------------------------------------------------
// Job class
// ---------------------------------------------------------------------------

/**
 * @typedef {'queued'|'processing'|'completed'|'failed'} JobStatus
 */

class Job {
    constructor(type, payload) {
        this.id = crypto.randomBytes(8).toString('hex');
        this.type = type;           // 'invoice' | 'etiket' | 'resume_medis'
        this.payload = payload;     // { billingData, patientData, recordData }
        this.status = 'queued';
        this.result = null;         // { r2Key, downloadUrl, filename, size }
        this.error = null;
        this.attempts = 0;
        this.createdAt = Date.now();
        this.completedAt = null;
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue a PDF generation job.
 * @param {'invoice'|'etiket'|'resume_medis'} type
 * @param {object} payload  { billingData, patientData, recordData }
 * @returns {{ jobId: string, status: string }}
 */
function enqueue(type, payload) {
    const job = new Job(type, payload);
    jobs.set(job.id, job);
    queue.push(job);
    logger.info(`[PDFQueue] Job ${job.id} enqueued (type=${type})`);
    _drain();
    return { jobId: job.id, status: job.status };
}

/**
 * Get job status and result.
 * @param {string} jobId
 * @returns {object|null}
 */
function getJob(jobId) {
    const job = jobs.get(jobId);
    if (!job) return null;
    return {
        jobId: job.id,
        type: job.type,
        status: job.status,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
    };
}

/**
 * Get queue stats for metrics.
 */
function getStats() {
    let queued = 0, processing = 0, completed = 0, failed = 0;
    for (const job of jobs.values()) {
        if (job.status === 'queued') queued++;
        else if (job.status === 'processing') processing++;
        else if (job.status === 'completed') completed++;
        else if (job.status === 'failed') failed++;
    }
    return {
        queued,
        processing,
        completed,
        failed,
        activeWorkers,
        maxConcurrent: MAX_CONCURRENT,
        totalJobs: jobs.size,
    };
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

async function _drain() {
    while (activeWorkers < MAX_CONCURRENT && queue.length > 0) {
        const job = queue.shift();
        if (!job || job.status !== 'queued') continue;
        activeWorkers++;
        _process(job).finally(() => {
            activeWorkers--;
            _drain(); // check if more work available
        });
    }
}

async function _process(job) {
    job.status = 'processing';
    job.attempts++;

    try {
        const PDFGenerator = require('../utils/pdf-generator');
        const pdfGen = new PDFGenerator();

        let result;
        const { billingData, patientData, recordData } = job.payload;

        switch (job.type) {
            case 'invoice':
                result = await pdfGen.generateInvoice(billingData, patientData, recordData);
                break;
            case 'etiket':
                result = await pdfGen.generateEtiket(billingData, patientData, recordData);
                break;
            case 'resume_medis':
                result = await pdfGen.generateResumeMedis(
                    job.payload.resumeData || billingData,
                    patientData,
                    recordData
                );
                break;
            default:
                throw new Error(`Unknown PDF job type: ${job.type}`);
        }

        // Get signed download URL
        const r2Storage = require('./r2Storage');
        let downloadUrl = null;
        if (result.r2Key) {
            try {
                downloadUrl = await r2Storage.getSignedDownloadUrl(result.r2Key, 3600);
            } catch {
                // R2 signing may fail; store key for later retrieval
            }
        }

        job.status = 'completed';
        job.completedAt = Date.now();
        job.result = {
            r2Key: result.r2Key,
            filename: result.filename,
            size: result.size,
            downloadUrl,
        };
        logger.info(`[PDFQueue] Job ${job.id} completed (${job.completedAt - job.createdAt}ms)`);
    } catch (err) {
        if (job.attempts < MAX_RETRIES) {
            // Retry with backoff
            const backoffMs = Math.min(1000 * Math.pow(2, job.attempts), 10000);
            logger.warn(`[PDFQueue] Job ${job.id} failed attempt ${job.attempts}, retrying in ${backoffMs}ms`, {
                error: err.message,
            });
            job.status = 'queued';
            setTimeout(() => {
                queue.push(job);
                _drain();
            }, backoffMs);
        } else {
            job.status = 'failed';
            job.completedAt = Date.now();
            job.error = err.message;
            logger.error(`[PDFQueue] Job ${job.id} permanently failed after ${job.attempts} attempts`, {
                error: err.message,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Pruning — remove old completed/failed jobs
// ---------------------------------------------------------------------------

setInterval(() => {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
        if ((job.status === 'completed' || job.status === 'failed') && job.completedAt && job.completedAt < cutoff) {
            jobs.delete(id);
        }
    }
}, 5 * 60 * 1000); // prune every 5 min

module.exports = { enqueue, getJob, getStats };
