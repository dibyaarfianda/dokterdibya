/**
 * MEDIFY Batch Import Routes
 * API endpoints for batch syncing medical records from SIMRS
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../utils/database');
const { verifyToken, requireRoles } = require('../middleware/auth');
const activityLogger = require('../services/activityLogger');
const medifyService = require('../services/medifyPuppeteerService');
const httpService = require('../services/medifyHttpService');
const medifyRecords = require('../services/MedifyRecordImportService');

// Restrict to dokter and admin roles
const requireDocterOrAdmin = requireRoles('dokter', 'admin');

/**
 * POST /api/medify-batch/sync/:source
 * Sync medical records from SIMRS for a specific date
 * Scrapes SIMRS once, matches against ALL patients in DB
 */
router.post('/sync/:source', verifyToken, requireDocterOrAdmin, async (req, res) => {
    const { source } = req.params;
    const { date, mode } = req.body; // mode: 'http' | 'puppeteer' (default)
    const userId = req.user.id;
    const userName = req.user.name;

    if (!date) {
        return res.status(400).json({
            success: false,
            message: 'Date is required (format: YYYY-MM-DD)'
        });
    }

    // Validate sync mode
    const syncMode = mode === 'http' ? 'http' : 'puppeteer';

    try {
        // Validate source
        if (!['rsia_melinda', 'rsud_gambiran'].includes(source)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid source. Must be rsia_melinda or rsud_gambiran'
            });
        }

        // Check if there's already a running sync
        const running = await pool.query(
            `SELECT id FROM medify_import_jobs
             WHERE simrs_source = ? AND status IN ('pending', 'processing')
             LIMIT 1`,
            [source]
        );

        if (running && running.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Sync sedang berjalan untuk source ini'
            });
        }

        // Generate batch ID
        const batchId = uuidv4();

        // Log activity
        await activityLogger.log(userId, userName, 'MEDIFY Sync Started',
            `Source: ${source}, Batch: ${batchId}, Date: ${date}, Mode: ${syncMode}`);

        // Start background processing (async - don't await)
        const syncFn = syncMode === 'http' ? processSyncHttp : processSync;
        syncFn(batchId, source, date, userId).catch(err => {
            console.error('[Medify] Sync error');
        });

        res.json({
            success: true,
            message: `Sync dimulai untuk tanggal ${date} (mode: ${syncMode})`,
            batchId,
            mode: syncMode
        });

    } catch (error) {
        console.error('[Medify] Error starting sync');
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Process sync in background
 * 1. Login once
 * 2. Scrape SIMRS once for the date
 * 3. Match each SIMRS patient against ALL patients in DB
 * 4. Extract CPPT only for matches
 */
async function processSync(batchId, source, targetDate, userId) {
    console.log(`[Medify] Starting sync for ${source} on ${targetDate}`);

    // Helper to emit progress
    const emitProgress = (phase, data) => {
        if (global.io) {
            global.io.to('staff').emit('medify_progress', {
                batchId,
                phase,
                ...data
            });
        }
    };

    const browser = await medifyService.getBrowser();
    const page = await browser.newPage();

    try {
        // Set viewport and timeout
        await page.setViewport({ width: 1920, height: 1080 });
        page.setDefaultTimeout(60000);

        // Step 1: Login once
        emitProgress('login', { message: 'Logging in to SIMRS...' });
        console.log(`[Medify] Logging in to ${source}...`);
        await medifyService.login(page, source);
        console.log(`[Medify] Login successful`);
        emitProgress('login', { message: 'Login successful', done: true });

        // Step 2: Scrape history for target date (SIMRS uses YYYY-MM-DD format)
        emitProgress('scrape', { message: 'Searching patient history...' });
        console.log(`[Medify] Searching history for ${targetDate}...`);
        const simrsPatients = await medifyService.searchPatientHistory(page, source, targetDate, targetDate);
        console.log(`[Medify] Found ${simrsPatients.length} Dr. Dibya patients in SIMRS`);
        emitProgress('scrape', { message: `Found ${simrsPatients.length} patients in SIMRS`, total: simrsPatients.length, done: true });

        if (simrsPatients.length === 0) {
            await page.close();
            console.log(`[Medify] No patients found in SIMRS for ${targetDate}`);
            emitProgress('complete', { message: 'No patients found', matches: 0, noMatches: 0 });
            return;
        }

        // Step 3: Get ALL patients from our database
        const dbPatients = await pool.query(
            `SELECT p.id, p.full_name, p.birth_date, p.age, p.whatsapp
             FROM patients p
             WHERE p.full_name IS NOT NULL`
        );
        console.log(`[Medify] Loaded ${dbPatients.length} patients from database`);

        // Helper: normalize name for quick comparison
        const normalizeName = (name) => {
            if (!name) return '';
            return name.toLowerCase()
                .replace(/^(ny\.?|tn\.?|sdr\.?|sdri\.?|dr\.?|drg\.?)\s*/i, '')
                .replace(/[.,]/g, '')
                .trim();
        };

        // Step 4: For each SIMRS patient, find matching DB patient
        emitProgress('matching', { message: 'Mencocokkan pasien...', total: simrsPatients.length, current: 0 });
        const matches = [];
        const noMatches = [];

        for (let i = 0; i < simrsPatients.length; i++) {
            const simrsPatient = simrsPatients[i];
            console.log(`[Medify] Processing ${i + 1}/${simrsPatients.length}`);
            emitProgress('matching', {
                message: 'Mencocokkan pasien...',
                total: simrsPatients.length,
                current: i + 1
            });

            // Quick name filter - find potential matches
            const simrsNameNorm = normalizeName(simrsPatient.name);
            const potentialMatches = dbPatients.filter(dbp => {
                const dbNameNorm = normalizeName(dbp.full_name);
                // Check if names share at least one word
                const simrsWords = simrsNameNorm.split(/\s+/);
                const dbWords = dbNameNorm.split(/\s+/);
                return simrsWords.some(sw => sw.length >= 3 && dbWords.some(dw => dw.includes(sw) || sw.includes(dw)));
            });

            if (potentialMatches.length === 0) {
                console.log('[Medify] No name match');
                noMatches.push({ name: simrsPatient.name, reason: 'no_name_match' });
                continue;
            }

            // Extract full identity from SIMRS for proper matching
            console.log('[Medify] Extracting identity');
            const identity = await medifyService.extractPatientIdentity(page, source, simrsPatient.medId);
            await medifyService.delay(1000);

            // Full 5-factor matching against potential matches
            let bestMatch = null;
            let bestScore = 0;
            let bestFactors = [];

            for (const dbPatient of potentialMatches) {
                const result = medifyService.countMatchingFactors(
                    { ...simrsPatient, ...identity },
                    dbPatient
                );
                if (result.matchCount > bestScore) {
                    bestScore = result.matchCount;
                    bestMatch = dbPatient;
                    bestFactors = result.factors;
                }
            }

            if (bestScore >= 3) {
                console.log(`[Medify] Match by ${bestScore} factors`);
                matches.push({
                    simrsPatient: { ...simrsPatient, ...identity },
                    dbPatient: bestMatch,
                    matchScore: bestScore,
                    matchFactors: bestFactors
                });
            } else {
                console.log(`[Medify] No strong match (${bestScore} factors)`);
                noMatches.push({ name: simrsPatient.name, reason: `only_${bestScore}_factors` });
            }
        }

        console.log(`[Medify] Matching complete: ${matches.length} matches, ${noMatches.length} no matches`);
        emitProgress('matching', {
            message: `Selesai: ${matches.length} pasien cocok`,
            total: simrsPatients.length,
            current: simrsPatients.length,
            matches: matches.length,
            done: true
        });

        // Step 5: Create import jobs only for matches
        if (matches.length > 0) {
            const values = matches.map(m => [
                batchId,
                m.dbPatient.id,
                m.dbPatient.full_name,
                m.dbPatient.age || calculateAge(m.dbPatient.birth_date),
                source,
                'pending',
                userId,
                m.simrsPatient.medId,
                m.matchScore,
                m.matchFactors.join(',')
            ]);

            await pool.query(
                `INSERT INTO medify_import_jobs
                 (batch_id, patient_id, patient_name, patient_age, simrs_source, status, created_by, simrs_med_id, match_score, match_factors)
                 VALUES ?`,
                [values]
            );

            // Step 6: Process CPPT extraction for each match
            await processSyncJobs(batchId, source, page);
        }

        await page.close();
        console.log(`[Medify] Sync complete for ${source}`);

        // Emit completion
        emitProgress('complete', { message: 'Sync selesai' });

        // Get stats and emit sync_complete
        const stats = await pool.query(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
            FROM medify_import_jobs WHERE batch_id = ?
        `, [batchId]);

        if (global.io) {
            global.io.to('staff').emit('medify_sync_complete', {
                batchId,
                stats: stats[0] || { total: 0, success: 0, failed: 0, skipped: 0 }
            });
        }

    } catch (error) {
        console.error('[Medify] Sync error');
        await page.close();

        // Mark any pending jobs as failed
        await pool.query(
            `UPDATE medify_import_jobs
             SET status = 'failed', error_message = ?
             WHERE batch_id = ? AND status = 'pending'`,
            [error.message, batchId]
        );

        // Emit error
        if (global.io) {
            global.io.to('staff').emit('medify_sync_complete', {
                batchId,
                error: 'Sync failed',
                stats: { total: 0, success: 0, failed: 0, skipped: 0 }
            });
        }
    }
}

/**
 * Process sync jobs (extract CPPT for each pending job)
 */
async function processSyncJobs(batchId, source, page) {
    const jobs = await pool.query(
        `SELECT id, patient_id, patient_name, simrs_med_id, created_by
         FROM medify_import_jobs
         WHERE batch_id = ? AND status = 'pending'`,
        [batchId]
    );

    console.log(`[Medify] Processing ${jobs.length} CPPT extractions...`);

    // Emit progress helper for this phase
    const emitExtractProgress = (data) => {
        if (global.io) {
            global.io.to('staff').emit('medify_progress', {
                batchId,
                phase: 'extract',
                ...data
            });
        }
    };

    emitExtractProgress({ message: 'Mengekstrak rekam medis...', total: jobs.length, current: 0 });

    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        emitExtractProgress({
            message: 'Mengekstrak rekam medis...',
            total: jobs.length,
            current: i + 1
        });
        try {
            // Mark as processing
            await pool.query(
                `UPDATE medify_import_jobs SET status = 'processing' WHERE id = ?`,
                [job.id]
            );

            // Extract CPPT using medId stored in job
            const cpptResult = await medifyService.extractCPPT(page, source, job.simrs_med_id);
            await medifyService.delay(2000);

            if (cpptResult.skipReason) {
                // No Dr. Dibya CPPT found
                await pool.query(
                    `UPDATE medify_import_jobs
                     SET status = 'skipped', error_message = ?, completed_at = NOW()
                     WHERE id = ?`,
                    [cpptResult.skipReason, job.id]
                );
                continue;
            }

            // Parse CPPT with AI
            console.log('[Medify] Parsing CPPT');
            const aiParseResult = await parseWithAI(cpptResult.rawText, 'obstetri');

            // Save to medical record (creates DRD if needed)
            console.log('[Medify] Saving medical record');
            const recordsSaved = await saveMedicalRecord(job.patient_id, source, aiParseResult,
                { id: job.created_by || 'medify-sync', name: 'Medify Sync' });

            // Save CPPT data and update status
            await pool.query(
                `UPDATE medify_import_jobs
                 SET status = 'success',
                     cppt_data = ?,
                     records_imported = ?,
                     completed_at = NOW()
                 WHERE id = ?`,
                [JSON.stringify(cpptResult), recordsSaved, job.id]
            );

            console.log(`[Medify] CPPT saved (${recordsSaved} sections)`);

        } catch (error) {
            console.error('[Medify] CPPT extraction failed');
            await pool.query(
                `UPDATE medify_import_jobs
                 SET status = 'failed', error_message = ?, completed_at = NOW()
                 WHERE id = ?`,
                [error.message, job.id]
            );
        }
    }
}

// =============================================================================
// HTTP MODE - processSyncHttp
// =============================================================================

/**
 * Process sync using HTTP mode (no browser required).
 * Same flow as processSync but uses direct HTTP requests.
 */
async function processSyncHttp(batchId, source, targetDate, userId) {
    console.log(`[Medify-HTTP] Starting sync for ${source} on ${targetDate}`);

    const emitProgress = (phase, data) => {
        if (global.io) {
            global.io.to('staff').emit('medify_progress', { batchId, phase, ...data });
        }
    };

    const session = httpService.createSession(source);

    try {
        // Step 1: Login
        emitProgress('login', { message: 'Logging in to SIMRS (HTTP mode)...' });
        console.log(`[Medify-HTTP] Logging in to ${source}...`);
        await session.login();
        console.log(`[Medify-HTTP] Login successful`);
        emitProgress('login', { message: 'Login successful', done: true });

        // Step 2: Scrape history for target date
        emitProgress('scrape', { message: 'Searching patient history...' });
        console.log(`[Medify-HTTP] Searching history for ${targetDate}...`);
        const simrsPatients = await session.searchPatientHistory(targetDate, targetDate);
        console.log(`[Medify-HTTP] Found ${simrsPatients.length} Dr. Dibya patients in SIMRS`);
        emitProgress('scrape', {
            message: `Found ${simrsPatients.length} patients in SIMRS`,
            total: simrsPatients.length,
            done: true
        });

        if (simrsPatients.length === 0) {
            await session.close();
            console.log(`[Medify-HTTP] No patients found for ${targetDate}`);
            emitProgress('complete', { message: 'No patients found', matches: 0, noMatches: 0 });
            return;
        }

        // Step 3: Get ALL patients from our database
        const dbPatients = await pool.query(
            `SELECT p.id, p.full_name, p.birth_date, p.age, p.whatsapp
             FROM patients p
             WHERE p.full_name IS NOT NULL`
        );
        console.log(`[Medify-HTTP] Loaded ${dbPatients.length} patients from database`);

        const normalizeName = (name) => {
            if (!name) return '';
            return name.toLowerCase()
                .replace(/^(ny\.?|tn\.?|sdr\.?|sdri\.?|dr\.?|drg\.?)\s*/i, '')
                .replace(/[.,]/g, '')
                .trim();
        };

        // Step 4: Match SIMRS patients against DB patients
        emitProgress('matching', { message: 'Mencocokkan pasien...', total: simrsPatients.length, current: 0 });
        const matches = [];
        const noMatches = [];

        for (let i = 0; i < simrsPatients.length; i++) {
            const simrsPatient = simrsPatients[i];
            console.log(`[Medify-HTTP] Processing ${i + 1}/${simrsPatients.length}`);
            emitProgress('matching', {
                message: 'Mencocokkan pasien...',
                total: simrsPatients.length,
                current: i + 1
            });

            // Quick name filter
            const simrsNameNorm = normalizeName(simrsPatient.name);
            const potentialMatches = dbPatients.filter(dbp => {
                const dbNameNorm = normalizeName(dbp.full_name);
                const simrsWords = simrsNameNorm.split(/\s+/);
                const dbWords = dbNameNorm.split(/\s+/);
                return simrsWords.some(sw => sw.length >= 3 && dbWords.some(dw => dw.includes(sw) || sw.includes(dw)));
            });

            if (potentialMatches.length === 0) {
                console.log('[Medify-HTTP] No name match');
                noMatches.push({ name: simrsPatient.name, reason: 'no_name_match' });
                continue;
            }

            // Extract identity via HTTP
            console.log('[Medify-HTTP] Extracting identity');
            const identity = await session.extractPatientIdentity(simrsPatient.medId);
            await httpService.delay(500); // Smaller delay than puppeteer

            // 5-factor matching
            let bestMatch = null;
            let bestScore = 0;
            let bestFactors = [];

            for (const dbPatient of potentialMatches) {
                const result = httpService.countMatchingFactors(
                    { ...simrsPatient, ...identity },
                    dbPatient
                );
                if (result.matchCount > bestScore) {
                    bestScore = result.matchCount;
                    bestMatch = dbPatient;
                    bestFactors = result.factors;
                }
            }

            if (bestScore >= 3) {
                console.log(`[Medify-HTTP] Match by ${bestScore} factors`);
                matches.push({
                    simrsPatient: { ...simrsPatient, ...identity },
                    dbPatient: bestMatch,
                    matchScore: bestScore,
                    matchFactors: bestFactors
                });
            } else {
                console.log(`[Medify-HTTP] No strong match (${bestScore} factors)`);
                noMatches.push({ name: simrsPatient.name, reason: `only_${bestScore}_factors` });
            }
        }

        console.log(`[Medify-HTTP] Matching complete: ${matches.length} matches, ${noMatches.length} no matches`);
        emitProgress('matching', {
            message: `Selesai: ${matches.length} pasien cocok`,
            total: simrsPatients.length,
            current: simrsPatients.length,
            matches: matches.length,
            done: true
        });

        // Step 5: Create import jobs
        if (matches.length > 0) {
            const values = matches.map(m => [
                batchId,
                m.dbPatient.id,
                m.dbPatient.full_name,
                m.dbPatient.age || calculateAge(m.dbPatient.birth_date),
                source,
                'pending',
                userId,
                m.simrsPatient.medId,
                m.matchScore,
                m.matchFactors.join(',')
            ]);

            await pool.query(
                `INSERT INTO medify_import_jobs
                 (batch_id, patient_id, patient_name, patient_age, simrs_source, status, created_by, simrs_med_id, match_score, match_factors)
                 VALUES ?`,
                [values]
            );

            // Step 6: Process CPPT extraction via HTTP
            await processSyncJobsHttp(batchId, source, session);
        }

        await session.close();
        console.log(`[Medify-HTTP] Sync complete for ${source}`);

        emitProgress('complete', { message: 'Sync selesai' });

        // Get stats and emit completion
        const stats = await pool.query(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
            FROM medify_import_jobs WHERE batch_id = ?
        `, [batchId]);

        if (global.io) {
            global.io.to('staff').emit('medify_sync_complete', {
                batchId,
                stats: stats[0] || { total: 0, success: 0, failed: 0, skipped: 0 }
            });
        }

    } catch (error) {
        console.error('[Medify-HTTP] Sync error');
        await session.close();

        await pool.query(
            `UPDATE medify_import_jobs
             SET status = 'failed', error_message = ?
             WHERE batch_id = ? AND status = 'pending'`,
            [error.message, batchId]
        );

        if (global.io) {
            global.io.to('staff').emit('medify_sync_complete', {
                batchId,
                error: 'Sync failed',
                stats: { total: 0, success: 0, failed: 0, skipped: 0 }
            });
        }
    }
}

/**
 * Process sync jobs using HTTP mode (extract CPPT for each pending job)
 */
async function processSyncJobsHttp(batchId, source, session) {
    const jobs = await pool.query(
        `SELECT id, patient_id, patient_name, simrs_med_id, created_by
         FROM medify_import_jobs
         WHERE batch_id = ? AND status = 'pending'`,
        [batchId]
    );

    console.log(`[Medify-HTTP] Processing ${jobs.length} CPPT extractions...`);

    const emitExtractProgress = (data) => {
        if (global.io) {
            global.io.to('staff').emit('medify_progress', { batchId, phase: 'extract', ...data });
        }
    };

    emitExtractProgress({ message: 'Mengekstrak rekam medis...', total: jobs.length, current: 0 });

    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        emitExtractProgress({
            message: 'Mengekstrak rekam medis...',
            total: jobs.length,
            current: i + 1
        });
        try {
            await pool.query(
                `UPDATE medify_import_jobs SET status = 'processing' WHERE id = ?`,
                [job.id]
            );

            // Extract CPPT via HTTP
            const cpptResult = await session.extractCPPT(job.simrs_med_id);
            await httpService.delay(500);

            if (cpptResult.skipReason) {
                await pool.query(
                    `UPDATE medify_import_jobs
                     SET status = 'skipped', error_message = ?, completed_at = NOW()
                     WHERE id = ?`,
                    [cpptResult.skipReason, job.id]
                );
                continue;
            }

            // Parse CPPT with AI
            console.log('[Medify-HTTP] Parsing CPPT');
            const aiParseResult = await parseWithAI(cpptResult.rawText, 'obstetri');

            // Save to medical record
            console.log('[Medify-HTTP] Saving medical record');
            const recordsSaved = await saveMedicalRecord(job.patient_id, source, aiParseResult,
                { id: job.created_by || 'medify-sync', name: 'Medify Sync' });

            await pool.query(
                `UPDATE medify_import_jobs
                 SET status = 'success',
                     cppt_data = ?,
                     records_imported = ?,
                     completed_at = NOW()
                 WHERE id = ?`,
                [JSON.stringify(cpptResult), recordsSaved, job.id]
            );

            console.log(`[Medify-HTTP] CPPT saved (${recordsSaved} sections)`);

        } catch (error) {
            console.error('[Medify-HTTP] CPPT extraction failed');
            await pool.query(
                `UPDATE medify_import_jobs
                 SET status = 'failed', error_message = ?, completed_at = NOW()
                 WHERE id = ?`,
                [error.message, job.id]
            );
        }
    }
}

/**
 * GET /api/medify-batch/status
 * Get current sync status
 */
router.get('/status', verifyToken, async (req, res) => {
    try {
        // Get latest batch status
        const batches = await pool.query(
            `SELECT
                batch_id,
                simrs_source,
                MIN(created_at) as started_at,
                MAX(completed_at) as completed_at,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
             FROM medify_import_jobs
             WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
             GROUP BY batch_id, simrs_source
             ORDER BY started_at DESC
             LIMIT 5`
        );

        // Get current processing job
        const currentJob = await pool.query(
            `SELECT patient_name, simrs_source, status
             FROM medify_import_jobs
             WHERE status = 'processing'
             LIMIT 1`
        );

        res.json({
            success: true,
            batches: batches || [],
            currentJob: currentJob && currentJob.length > 0 ? currentJob[0] : null,
            isRunning: currentJob && currentJob.length > 0
        });

    } catch (error) {
        console.error('[Medify] Error getting status');
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/medify-batch/history
 * Get sync history
 */
router.get('/history', verifyToken, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    try {
        const history = await pool.query(
            `SELECT
                batch_id,
                simrs_source,
                MIN(created_at) as started_at,
                MAX(completed_at) as completed_at,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
                SUM(records_imported) as records_imported
             FROM medify_import_jobs
             GROUP BY batch_id, simrs_source
             ORDER BY started_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const countResult = await pool.query(
            'SELECT COUNT(DISTINCT batch_id) as total FROM medify_import_jobs'
        );
        const total = countResult && countResult.length > 0 ? countResult[0].total : 0;

        res.json({
            success: true,
            history: history || [],
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[Medify] Error getting history');
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/medify-batch/jobs/:batchId
 * Get detailed job list for a batch
 */
router.get('/jobs/:batchId', verifyToken, async (req, res) => {
    const { batchId } = req.params;

    try {
        const jobs = await pool.query(
            `SELECT id, patient_id, patient_name, patient_age, status,
                    simrs_patient_found, simrs_patient_id, records_imported,
                    error_message, created_at, completed_at
             FROM medify_import_jobs
             WHERE batch_id = ?
             ORDER BY id`,
            [batchId]
        );

        res.json({
            success: true,
            batchId,
            jobs: jobs || []
        });

    } catch (error) {
        console.error('[Medify] Error getting jobs');
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/medify-batch/credentials
 * Update SIMRS credentials (admin only)
 */
router.post('/credentials', verifyToken, requireRoles('dokter'), async (req, res) => {
    const { source, username, password } = req.body;
    const userId = req.user.id;
    const userName = req.user.name;

    try {
        if (!source || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Source, username, and password are required'
            });
        }

        if (!['rsia_melinda', 'rsud_gambiran'].includes(source)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid source'
            });
        }

        await medifyService.saveCredentials(source, username, password);

        await activityLogger.log(userId, userName, 'MEDIFY Credentials Updated',
            `Source: ${source}`);

        res.json({
            success: true,
            message: 'Credentials saved successfully'
        });

    } catch (error) {
        console.error('[Medify] Error saving credentials');
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/medify-batch/test-connection
 * Test SIMRS connection with credentials
 */
router.post('/test-connection', verifyToken, requireRoles('dokter'), async (req, res) => {
    const { source, mode } = req.body;

    try {
        if (!['rsia_melinda', 'rsud_gambiran'].includes(source)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid source'
            });
        }

        // HTTP mode test
        if (mode === 'http') {
            const session = httpService.createSession(source);
            try {
                await session.login();
                await session.close();

                res.json({
                    success: true,
                    message: 'Connection successful (HTTP mode)',
                    mode: 'http'
                });
            } catch (error) {
                await session.close();
                res.status(400).json({
                    success: false,
                    message: `Connection failed (HTTP): ${error.message}`
                });
            }
            return;
        }

        // Puppeteer mode test (default)
        const browser = await medifyService.getBrowser();
        const page = await browser.newPage();

        try {
            await medifyService.login(page, source);
            await page.close();

            res.json({
                success: true,
                message: 'Connection successful (Puppeteer mode)',
                mode: 'puppeteer'
            });

        } catch (error) {
            await page.close();
            res.status(400).json({
                success: false,
                message: `Connection failed: ${error.message}`
            });
        }

    } catch (error) {
        console.error('[Medify] Error testing connection');
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/medify-batch/credentials-status
 * Check if credentials are configured
 */
router.get('/credentials-status', verifyToken, async (req, res) => {
    try {
        const creds = await pool.query(
            `SELECT simrs_source, is_active FROM medify_credentials`
        );

        const status = {
            rsia_melinda: false,
            rsud_gambiran: false
        };

        if (creds && creds.length > 0) {
            creds.forEach(c => {
                if (c.is_active) {
                    status[c.simrs_source] = true;
                }
            });
        }

        res.json({
            success: true,
            credentials: status
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/medify-batch/test-sync
 * Test sync: fetch data from SIMRS using one patient's name, save to another patient
 * Used for testing the full sync flow without modifying real patient data
 */
router.post('/test-sync', verifyToken, requireDocterOrAdmin, async (req, res) => {
    const { targetPatientId, simrsSearchName, source, dateStart, dateEnd } = req.body;
    const userId = req.user.id;
    const userName = req.user.name;

    try {
        // Validate inputs
        if (!targetPatientId || !simrsSearchName || !source) {
            return res.status(400).json({
                success: false,
                message: 'targetPatientId, simrsSearchName, and source are required'
            });
        }

        if (!['rsia_melinda', 'rsud_gambiran'].includes(source)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid source. Must be rsia_melinda or rsud_gambiran'
            });
        }

        // Check if target patient exists
        const targetPatient = await pool.query(
            `SELECT id, full_name, birth_date, age FROM patients WHERE id = ?`,
            [targetPatientId]
        );

        if (!targetPatient || targetPatient.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Target patient ${targetPatientId} not found`
            });
        }

        console.log('[Medify Test] Starting test sync');

        // Log activity
        await activityLogger.log(userId, userName, 'MEDIFY Test Sync Started', `Source: ${source}`);

        // Start test sync in background
        testSyncProcess(targetPatientId, targetPatient[0].full_name, simrsSearchName, source, { dateStart, dateEnd }, req.user)
            .then(result => {
                console.log(`[Medify Test] Test sync ${result.success ? 'completed' : 'failed'}`);
            })
            .catch(err => {
                console.error('[Medify Test] Test sync error');
            });

        res.json({
            success: true,
            message: `Test sync started: searching SIMRS for "${simrsSearchName}", will save to ${targetPatient[0].full_name}`,
            targetPatientId,
            targetPatientName: targetPatient[0].full_name,
            simrsSearchName,
            source
        });

    } catch (error) {
        console.error('[Medify Test] Error');
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Test sync processor - single patient
 */
async function testSyncProcess(targetPatientId, targetPatientName, simrsSearchName, source, options = {}, actor) {
    console.log('[Medify Test] Processing');

    const browser = await medifyService.getBrowser();
    let page = null;

    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        // Login to SIMRS
        const loginSuccess = await medifyService.login(page, source);
        if (!loginSuccess) {
            throw new Error('Failed to login to SIMRS');
        }
        console.log(`[Medify Test] Logged in to ${source}`);

        // Navigate to history page
        const config = medifyService.SIMRS_CONFIG[source];
        await page.goto(config.historyUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await page.waitForSelector('table', { timeout: 15000 });
        await medifyService.delay(2000);

        // Set date filter
        const today = new Date();
        const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const formatDate = (d) => {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}-${month}-${year}`;
        };

        const dateFrom = options.dateStart || formatDate(sevenDaysAgo);
        const dateTo = options.dateEnd || formatDate(today);
        console.log(`[Medify Test] Date range: ${dateFrom} to ${dateTo}`);

        // Click Reset first
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button.btn-info');
            for (const btn of buttons) {
                if (btn.innerText.includes('Reset')) {
                    btn.click();
                    return;
                }
            }
        });
        await medifyService.delay(1500);

        // Select dokter Dibya using the searchable dropdown (Select2)
        try {
            // First find and set the underlying select element directly
            const dpjpResult = await page.evaluate(() => {
                // Find the select element for Dokter/DPJP
                const selects = document.querySelectorAll('select');
                for (const sel of selects) {
                    const label = sel.closest('.form-group, .col, div')?.querySelector('label');
                    const labelText = label?.innerText?.toLowerCase() || '';
                    const selId = sel.id?.toLowerCase() || '';
                    const selName = sel.name?.toLowerCase() || '';

                    if (labelText.includes('dokter') || labelText.includes('dpjp') ||
                        selId.includes('dokter') || selId.includes('dpjp') ||
                        selName.includes('dokter') || selName.includes('dpjp')) {

                        // Find option containing "dibya"
                        const options = sel.querySelectorAll('option');
                        for (const opt of options) {
                            if (opt.innerText.toLowerCase().includes('dibya')) {
                                // Set the value directly
                                sel.value = opt.value;
                                // Trigger change event for Select2 to update
                                sel.dispatchEvent(new Event('change', { bubbles: true }));
                                // Also try jQuery trigger if available
                                if (window.$ && $(sel).trigger) {
                                    $(sel).trigger('change');
                                }
                                return {
                                    found: true,
                                    selected: opt.innerText.trim(),
                                    value: opt.value,
                                    selectId: sel.id || sel.name
                                };
                            }
                        }
                        return { found: false, error: 'Dibya option not found in select options', selectId: sel.id };
                    }
                }
                return { found: false, error: 'Dokter/DPJP select element not found' };
            });
            console.log(`[Medify Test] DPJP filter found: ${dpjpResult.found}`);

            // If direct select didn't work, try the visual Select2 interaction
            if (!dpjpResult.found) {
                console.log(`[Medify Test] Trying Select2 visual interaction...`);
                // Click the Select2 container to open dropdown
                await page.evaluate(() => {
                    const select2Containers = document.querySelectorAll('.select2-container, .select2-selection');
                    for (const container of select2Containers) {
                        const label = container.closest('.form-group, .col, div')?.querySelector('label');
                        if (label?.innerText?.toLowerCase().includes('dokter')) {
                            container.click();
                            return true;
                        }
                    }
                    return false;
                });
                await medifyService.delay(500);
                await page.keyboard.type('dibya', { delay: 100 });
                await medifyService.delay(1500);

                // Click the matching option
                await page.evaluate(() => {
                    const options = document.querySelectorAll('.select2-results__option');
                    for (const opt of options) {
                        if (opt.innerText.toLowerCase().includes('dibya')) {
                            opt.click();
                            return true;
                        }
                    }
                    return false;
                });
            }

            await medifyService.delay(1000); // Wait for filter to apply

        } catch (dpjpError) {
            console.log('[Medify Test] DPJP filter error (continuing)');
        }

        // Set date range
        await page.evaluate((from, to) => {
            const fromEl = document.querySelector('#tanggalMulai');
            const toEl = document.querySelector('#tanggalAkhir');
            if (fromEl) {
                fromEl.value = from;
                fromEl.dispatchEvent(new Event('input', { bubbles: true }));
                fromEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (toEl) {
                toEl.value = to;
                toEl.dispatchEvent(new Event('input', { bubbles: true }));
                toEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, dateFrom, dateTo);
        await medifyService.delay(500);

        // First change DataTable to show ALL rows before searching
        await page.evaluate(() => {
            const lengthSelect = document.querySelector('select[name="historiTable_length"]');
            if (lengthSelect) {
                // Check if "-1" (All) option exists, otherwise use max available
                const allOption = Array.from(lengthSelect.options).find(o => o.value === '-1' || o.text.toLowerCase().includes('all'));
                if (allOption) {
                    lengthSelect.value = allOption.value;
                } else {
                    // Use the last (largest) option
                    lengthSelect.value = lengthSelect.options[lengthSelect.options.length - 1].value;
                }
                lengthSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await medifyService.delay(2000);

        // Click search
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button.btn-primary');
            for (const btn of buttons) {
                if (btn.innerText.includes('Cari')) {
                    btn.click();
                    return;
                }
            }
        });
        await medifyService.delay(5000); // Wait longer for all rows to load

        // Get all patients from table
        const allPatients = await page.evaluate(() => {
            const rows = document.querySelectorAll('table tbody tr');
            const results = [];
            rows.forEach(row => {
                const style = window.getComputedStyle(row);
                if (style.display === 'none') return;

                const cells = row.querySelectorAll('td');
                if (cells.length >= 6) {
                    const patientCell = cells[2];
                    const cellText = patientCell?.innerText?.trim() || '';
                    const lines = cellText.split('\n');
                    const patientName = lines.length >= 2 ? lines[1].trim() : cellText;

                    const dateCell = cells[5];
                    const visitDate = dateCell?.innerText?.trim() || '';

                    const actionCell = cells[cells.length - 1];
                    const actionLink = actionCell?.querySelector('a[href*="/kasus/"]');
                    let medId = null;

                    if (actionLink) {
                        const href = actionLink.getAttribute('href');
                        const match = href.match(/\/kasus\/([\w]+)/);
                        if (match) {
                            medId = match[1];
                        }
                    }

                    if (patientName && medId) {
                        results.push({ name: patientName, medId, visitDate });
                    }
                }
            });
            return results;
        });

        // Search for simrsSearchName - use ALL words (min 2 chars to filter single letters)
        const searchName = simrsSearchName.toLowerCase().trim();
        const searchWords = searchName.split(/\s+/).filter(w => w.length >= 2);

        // Debug: log all patients found
        console.log(`[Medify Test] Search terms: ${searchWords.length}`);
        console.log(`[Medify Test] Total patients in table: ${allPatients.length}`);
        // Names and external case IDs must not enter diagnostics.

        const matchingPatients = allPatients.filter(p => {
            const pName = p.name.toLowerCase();
            // Require ALL search words to match
            return searchWords.every(word => pName.includes(word));
        });

        console.log(`[Medify Test] Found ${matchingPatients.length} matches`);

        if (matchingPatients.length === 0) {
            throw new Error(`Patient "${simrsSearchName}" not found in SIMRS`);
        }

        // Get first match
        const firstMatch = matchingPatients[0];
        console.log('[Medify Test] Using match');

        // Extract CPPT
        const cpptResult = await medifyService.extractCPPT(page, source, firstMatch.medId);
        console.log(`[Medify Test] CPPT extracted, length: ${cpptResult.rawText.length}`);

        // Parse with AI
        const aiParseResult = await parseWithAI(cpptResult.rawText, 'obstetri');
        console.log(`[Medify Test] AI parse complete`);

        // Save to target patient (creates new DRD)
        const recordsSaved = await saveMedicalRecord(targetPatientId, source, aiParseResult, actor);
        console.log(`[Medify Test] Saved ${recordsSaved} record sections`);

        // Get the new MR ID
        const newMR = await pool.query(
            `SELECT mr_id FROM sunday_clinic_records
             WHERE patient_id = ? AND visit_location = ?
             ORDER BY created_at DESC LIMIT 1`,
            [targetPatientId, source]
        );

        const mrId = newMR && newMR.length > 0 ? newMR[0].mr_id : null;
        console.log('[Medify Test] Canonical visit resolved');

        // Generate resume and publish to portal
        if (mrId) {
            await generateAndPublishResume(targetPatientId, mrId, actor);
        }

        return {
            success: true,
            targetPatientId,
            mrId,
            recordsSaved,
            simrsMatch: firstMatch.name
        };

    } catch (error) {
        console.error('[Medify Test] Error');
        return {
            success: false,
            error: error.message
        };
    } finally {
        if (page) {
            await page.close();
        }
    }
}

/**
 * Generate resume medis and publish to patient portal
 */
async function generateAndPublishResume(patientId, mrId, actor) {
    const patients = await pool.query('SELECT * FROM patients WHERE id = ?', [patientId]);
    if (patients.length !== 1) throw new Error('Medify resume patient not found');
    const patient = patients[0];
    const records = await pool.query(
        `SELECT record_type, record_data FROM medical_records
         WHERE mr_id = ? AND record_type != 'resume_medis'
         ORDER BY created_at DESC, id DESC`, [mrId]);
    if (!records.length) throw new Error('Medify resume source sections not found');

    const recordsByType = {};
    for (const record of records) {
        if (Object.prototype.hasOwnProperty.call(recordsByType, record.record_type)) continue;
        recordsByType[record.record_type] = typeof record.record_data === 'string'
            ? JSON.parse(record.record_data) : record.record_data;
    }
    const identitas = {
        nama: patient.full_name,
        tanggal_lahir: patient.birth_date,
        umur: patient.age,
        alamat: patient.address,
        no_telp: patient.phone
    };
    const { generateMedicalResume } = require('./medical-records');
    const resume = generateMedicalResume(identitas, recordsByType, { obat: [], tindakan: [] });
    await medifyRecords.publishResume({ patientId, mrId, resume, patientName: patient.full_name, actor });
    return true;
}
/**
 * Save medical record to database
 */
async function saveMedicalRecord(patientId, source, parsedData, actor) {
    const result = await medifyRecords.saveParsedRecord({ patientId, source, parsedData, actor });
    return result.recordsSaved;
}
/**
 * Calculate age from birth date
 */
function calculateAge(birthDate) {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// ============================================================================
// REVIEW & SEND TO PORTAL ENDPOINTS
// ============================================================================

/**
 * GET /api/medify-batch/last-batch
 * Get the most recent batch with successful syncs
 */
router.get('/last-batch', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT batch_id, simrs_source, COUNT(*) as total,
                   SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                   MAX(created_at) as created_at
            FROM medify_import_jobs
            GROUP BY batch_id, simrs_source
            HAVING success_count > 0
            ORDER BY created_at DESC
            LIMIT 1
        `);

        if (result.length > 0) {
            res.json({
                success: true,
                batchId: result[0].batch_id,
                source: result[0].simrs_source,
                successCount: result[0].success_count,
                createdAt: result[0].created_at
            });
        } else {
            res.json({ success: false, message: 'No batch found' });
        }
    } catch (error) {
        console.error('[Medify] Error getting last batch');
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/medify-batch/review/:batchId
 * Get patients ready for review and send to portal
 */
router.get('/review/:batchId', verifyToken, async (req, res) => {
    const { batchId } = req.params;

    try {
        // Get all successful jobs from this batch with patient info
        // Use subquery to get only the LATEST MR for each patient at that location
        const jobs = await pool.query(`
            SELECT
                mij.id as job_id,
                mij.patient_id,
                mij.patient_name,
                mij.records_imported,
                mij.portal_sent_at,
                mij.simrs_source,
                scr.mr_id,
                scr.created_at as visit_date,
                p.full_name,
                p.phone,
                p.whatsapp
            FROM medify_import_jobs mij
            JOIN patients p ON mij.patient_id = p.id
            LEFT JOIN sunday_clinic_records scr
                ON mij.patient_id = scr.patient_id
                AND scr.visit_location = mij.simrs_source
                AND scr.id = (
                    SELECT id FROM sunday_clinic_records scr2
                    WHERE scr2.patient_id = mij.patient_id
                    AND scr2.visit_location = mij.simrs_source
                    ORDER BY scr2.created_at DESC
                    LIMIT 1
                )
            WHERE mij.batch_id = ? AND mij.status = 'success'
            ORDER BY mij.id DESC
        `, [batchId]);

        // For each patient, check document availability
        const result = await Promise.all(jobs.map(async (job) => {
            // Check for resume_medis
            const resumeRecords = await pool.query(`
                SELECT id FROM medical_records
                WHERE mr_id = ? AND record_type = 'resume_medis' LIMIT 1
            `, [job.mr_id]);

            // Check for USG photos
            const usgDocs = await pool.query(`
                SELECT id, file_url, title FROM patient_documents
                WHERE mr_id = ? AND document_type = 'usg_photo' AND status != 'deleted'
            `, [job.mr_id]);

            // Check for lab files (from penunjang record)
            const penunjangRecords = await pool.query(`
                SELECT record_data FROM medical_records
                WHERE mr_id = ? AND record_type = 'penunjang' LIMIT 1
            `, [job.mr_id]);

            let labFiles = [];
            if (penunjangRecords.length > 0) {
                try {
                    const data = JSON.parse(penunjangRecords[0].record_data);
                    labFiles = data.files || [];
                } catch (e) {}
            }

            // Check if already sent to portal (has published documents or portal_sent_at set)
            const sentDocs = await pool.query(`
                SELECT COUNT(*) as count FROM patient_documents
                WHERE mr_id = ? AND status = 'published' AND document_type = 'resume_medis'
            `, [job.mr_id]);

            return {
                jobId: job.job_id,
                patientId: job.patient_id,
                patientName: job.full_name || job.patient_name,
                phone: job.whatsapp || job.phone,
                mrId: job.mr_id,
                visitDate: job.visit_date,
                source: job.simrs_source,
                recordsImported: job.records_imported,
                documents: {
                    hasResume: resumeRecords.length > 0,
                    usgPhotos: usgDocs,
                    labFiles: labFiles,
                    usgCount: usgDocs.length,
                    labCount: labFiles.length
                },
                alreadySent: sentDocs[0].count > 0 || !!job.portal_sent_at,
                sentAt: job.portal_sent_at
            };
        }));

        res.json({
            success: true,
            batchId,
            patients: result,
            summary: {
                total: result.length,
                sent: result.filter(r => r.alreadySent).length,
                pending: result.filter(r => !r.alreadySent).length
            }
        });

    } catch (error) {
        console.error('[Medify] Error loading review data');
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/medify-batch/patient-preview/:patientId/:mrId
 * Get detailed preview for a patient (resume content, USG thumbnails, lab files)
 */
router.get('/patient-preview/:patientId/:mrId', verifyToken, async (req, res) => {
    const { patientId, mrId } = req.params;

    try {
        // Get resume content
        const resumeRecords = await pool.query(`
            SELECT record_data FROM medical_records
            WHERE mr_id = ? AND record_type = 'resume_medis'
            ORDER BY id DESC LIMIT 1
        `, [mrId]);

        let resumeContent = null;
        if (resumeRecords.length > 0) {
            try {
                const data = JSON.parse(resumeRecords[0].record_data);
                resumeContent = data.resume;
            } catch (e) {}
        }

        // Get USG photos with URLs
        const usgPhotos = await pool.query(`
            SELECT id, title, file_url, file_name, created_at
            FROM patient_documents
            WHERE mr_id = ? AND document_type = 'usg_photo' AND status != 'deleted'
            ORDER BY created_at DESC
        `, [mrId]);

        // Get lab files from penunjang
        const penunjangRecords = await pool.query(`
            SELECT record_data FROM medical_records
            WHERE mr_id = ? AND record_type = 'penunjang'
            ORDER BY id DESC LIMIT 1
        `, [mrId]);

        let labFiles = [];
        let labInterpretation = null;
        if (penunjangRecords.length > 0) {
            try {
                const data = JSON.parse(penunjangRecords[0].record_data);
                labFiles = data.files || [];
                labInterpretation = data.interpretation || data.hasil_lab || null;
            } catch (e) {}
        }

        res.json({
            success: true,
            patientId,
            mrId,
            preview: {
                resume: resumeContent
                    ? resumeContent.substring(0, 1000) + (resumeContent.length > 1000 ? '...' : '')
                    : null,
                resumeFull: resumeContent,
                usgPhotos: usgPhotos.map(p => ({
                    id: p.id,
                    title: p.title,
                    thumbnailUrl: p.file_url,
                    fileName: p.file_name
                })),
                labFiles: labFiles.map(f => ({
                    name: f.name || f.fileName,
                    url: f.url || f.fileUrl,
                    type: f.type || 'file'
                })),
                labInterpretation
            }
        });

    } catch (error) {
        console.error('[Medify] Error loading preview');
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/medify-batch/send-to-portal
 * Send documents to patient portal (single or bulk)
 */
router.post('/send-to-portal', verifyToken, async (req, res) => {
    const { batchId, patientIds } = req.body;
    const userId = req.user.id;
    const userName = req.user.name;

    try {
        if (!patientIds || patientIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one patient ID is required'
            });
        }

        const results = [];

        for (const patientId of patientIds) {
            try {
                // Get MR ID for this patient from the batch
                const jobsForPatient = await pool.query(`
                    SELECT mij.id, mij.simrs_source, scr.mr_id
                    FROM medify_import_jobs mij
                    LEFT JOIN sunday_clinic_records scr
                        ON mij.patient_id = scr.patient_id
                        AND scr.visit_location = mij.simrs_source
                        AND scr.id = (
                            SELECT id FROM sunday_clinic_records scr2
                            WHERE scr2.patient_id = mij.patient_id
                            AND scr2.visit_location = mij.simrs_source
                            ORDER BY scr2.created_at DESC
                            LIMIT 1
                        )
                    WHERE mij.batch_id = ? AND mij.patient_id = ? AND mij.status = 'success'
                    LIMIT 1
                `, [batchId, patientId]);

                if (jobsForPatient.length === 0) {
                    results.push({ patientId, success: false, error: 'Job not found' });
                    continue;
                }

                const mrId = jobsForPatient[0].mr_id;

                if (!mrId) {
                    results.push({ patientId, success: false, error: 'No MR ID found' });
                    continue;
                }

                // Generate and publish resume
                await generateAndPublishResume(patientId, mrId, req.user);

                // Also publish USG photos if available
                await pool.query(`
                    UPDATE patient_documents
                    SET status = 'published', published_at = NOW(), published_by = ?
                    WHERE mr_id = ? AND document_type = 'usg_photo' AND status != 'published'
                `, [userId, mrId]);

                // Mark job as sent
                await pool.query(`
                    UPDATE medify_import_jobs
                    SET portal_sent_at = NOW(), portal_sent_by = ?
                    WHERE batch_id = ? AND patient_id = ?
                `, [userId, batchId, patientId]);

                // Create patient notification
                const patientData = await pool.query(`SELECT full_name FROM patients WHERE id = ?`, [patientId]);
                const patientName = patientData[0]?.full_name || 'Pasien';

                await pool.query(`
                    INSERT INTO patient_notifications (patient_id, title, message, type, link, created_at)
                    VALUES (?, ?, ?, 'document', '/patient-menu.html', NOW())
                `, [patientId, 'Dokumen Baru Tersedia', `Resume medis dan dokumen pemeriksaan Anda sudah tersedia di portal pasien.`]);

                results.push({ patientId, mrId, success: true });

            } catch (patientError) {
                console.error('[Medify] Error sending to portal for one patient');
                results.push({ patientId, success: false, error: patientError.message });
            }
        }

        // Log activity
        const successCount = results.filter(r => r.success).length;
        await activityLogger.log(userId, userName, 'MEDIFY Send to Portal',
            `Batch: ${batchId}, Sent: ${successCount}/${patientIds.length}`);

        res.json({
            success: true,
            results,
            summary: {
                total: patientIds.length,
                success: successCount,
                failed: patientIds.length - successCount
            }
        });

    } catch (error) {
        console.error('[Medify] Error sending to portal');
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
