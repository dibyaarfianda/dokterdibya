'use strict';

const crypto = require('crypto');
const db = require('../db');
const logger = require('../utils/logger');
const { validateSundayClinicSchema } = require('./SundayClinicSchemaValidator');

const TABLE_NAME = 'sunday_clinic_medify_sync_jobs';
const WORKER_INTERVAL_MS = parseInt(process.env.SUNDAY_CLINIC_MEDIFY_SYNC_POLL_MS || '4000', 10);
const MAX_RETRIES = parseInt(process.env.SUNDAY_CLINIC_MEDIFY_SYNC_MAX_RETRIES || '4', 10);
const BASE_RETRY_DELAY_MS = parseInt(process.env.SUNDAY_CLINIC_MEDIFY_SYNC_RETRY_DELAY_MS || '15000', 10);

const GLOBAL_SYNC_ENABLED = process.env.SUNDAY_CLINIC_MEDIFY_SYNC_ENABLED !== '0';
const DIAGNOSIS_SYNC_ENABLED = process.env.SUNDAY_CLINIC_PUSH_DIAGNOSIS_ENABLED !== '0';
const TERAPI_SYNC_ENABLED = process.env.SUNDAY_CLINIC_PUSH_TERAPI_ENABLED !== '0';

const COMM_BASE_URL = (
    process.env.COMM_SERVICE_BASE_URL ||
    process.env.COMM_BASE_URL ||
    'http://127.0.0.1:3002'
).replace(/\/+$/, '');

const COMM_CPPT_PATH = process.env.COMM_CPPT_PATH || '/api/simrs/cppt';
const COMM_OUTBOUND_API_KEY = process.env.COMM_OUTBOUND_API_KEY || '';
const COMM_SIMRS_EMAIL = process.env.COMM_SIMRS_EMAIL || '';
const COMM_SIMRS_PASSWORD = process.env.COMM_SIMRS_PASSWORD || '';

let ensureTablePromise = null;
let workerStarted = false;
let isProcessing = false;

function nowDateTimeParts(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    const date = Number.isNaN(d.valueOf()) ? new Date() : d;

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');

    return {
        tanggal: `${yyyy}-${mm}-${dd}`,
        jam: `${hh}:${mi}`
    };
}

function parseJson(value) {
    if (!value) {
        return null;
    }
    if (typeof value === 'object') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        return null;
    }
}

function normalizeText(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).trim();
}

function toJobId() {
    return `msq_${crypto.randomBytes(8).toString('hex')}`;
}

function shouldProcessJobType(jobType) {
    if (!GLOBAL_SYNC_ENABLED) {
        return false;
    }
    if (jobType === 'diagnosis') {
        return DIAGNOSIS_SYNC_ENABLED;
    }
    if (jobType === 'terapi') {
        return TERAPI_SYNC_ENABLED;
    }
    return false;
}

function toFacility(visitLocation) {
    if (visitLocation === 'rsia_melinda') {
        return 'melinda';
    }
    return null;
}

function toSimrsSource(visitLocation) {
    if (visitLocation === 'rsia_melinda') {
        return 'rsia_melinda';
    }
    return null;
}

function formatTherapyPlan(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return '';
    }

    const lines = items.map((item, index) => {
        const name = normalizeText(item.name || item.item_name || item.obat_name || 'Obat');
        const quantity = Number(item.quantity || 1);
        const unit = normalizeText(item.unit || 'tablet');
        const caraPakai = normalizeText(item.caraPakai || item.cara_pakai || item.cara_pakai_text);
        const latinSig = normalizeText(item.latinSig || item.latin_sig);
        const usage = caraPakai || latinSig || '-';

        return `${index + 1}. ${name} ${quantity} ${unit} - ${usage}`;
    });

    return `Terapi:\n${lines.join('\n')}`;
}

function buildSubjective(anamnesa) {
    if (!anamnesa) {
        return '';
    }

    const lines = [];
    const keluhanUtama = normalizeText(anamnesa.keluhan_utama || anamnesa.keluhanUtama || anamnesa.chief_complaint);
    const riwayatKehamilan = normalizeText(anamnesa.riwayat_kehamilan_saat_ini || anamnesa.riwayatKehamilanSaatIni);
    const detailRiwayat = normalizeText(anamnesa.detail_riwayat_penyakit || anamnesa.detailRiwayatPenyakit);
    const riwayatKeluarga = normalizeText(anamnesa.riwayat_keluarga || anamnesa.riwayatKeluarga);

    if (keluhanUtama) {
        lines.push(`Keluhan utama: ${keluhanUtama}`);
    }
    if (riwayatKehamilan) {
        lines.push(`Riwayat kehamilan saat ini: ${riwayatKehamilan}`);
    }
    if (detailRiwayat) {
        lines.push(`Riwayat penyakit: ${detailRiwayat}`);
    }
    if (riwayatKeluarga) {
        lines.push(`Riwayat keluarga: ${riwayatKeluarga}`);
    }

    return lines.join('\n').trim();
}

function buildUsgSummary(usg) {
    if (!usg || typeof usg !== 'object') {
        return '';
    }

    const flatSummaryParts = [];
    const hasilUsg = normalizeText(usg.hasil_usg || usg.findings || usg.usg);
    const presentasi = normalizeText(usg.presentasi);
    const plasenta = normalizeText(usg.plasenta);
    const ketuban = normalizeText(usg.ketuban);
    const beratJanin = normalizeText(usg.berat_janin);

    if (hasilUsg) {
        flatSummaryParts.push(hasilUsg);
    }
    if (presentasi) {
        flatSummaryParts.push(`Presentasi ${presentasi}`);
    }
    if (plasenta) {
        flatSummaryParts.push(`Plasenta ${plasenta}`);
    }
    if (ketuban) {
        flatSummaryParts.push(`Ketuban ${ketuban}`);
    }
    if (beratJanin) {
        flatSummaryParts.push(`EFW ${beratJanin}`);
    }

    if (flatSummaryParts.length > 0) {
        return `USG: ${flatSummaryParts.join(', ')}`;
    }

    const trimesterMap = {
        first: usg.trimester_1,
        second: usg.trimester_2,
        third: usg.trimester_3
    };
    const activeTrimester = trimesterMap[usg.current_trimester] || usg.trimester_3 || usg.trimester_2 || usg.trimester_1;

    if (!activeTrimester || typeof activeTrimester !== 'object') {
        return '';
    }

    const summaryParts = [];
    const trimesterLabel = normalizeText(usg.current_trimester);
    const trimesterDate = normalizeText(activeTrimester.date);
    const gaFromEdd = normalizeText(activeTrimester.ga_from_edd || activeTrimester.ga_weeks);
    const fetusCount = normalizeText(activeTrimester.fetus_count || activeTrimester.embryo_count);
    const gender = normalizeText(activeTrimester.gender);
    const presentationSummary = normalizeText(activeTrimester.presentation || activeTrimester.fetus_lie);
    const placentaSummary = normalizeText(activeTrimester.placenta || activeTrimester.placenta_previa);
    const afi = normalizeText(activeTrimester.afi);
    const efw = normalizeText(activeTrimester.efw);
    const notes = normalizeText(activeTrimester.notes);

    if (trimesterLabel) {
        summaryParts.push(`Trimester ${trimesterLabel}`);
    }
    if (trimesterDate) {
        summaryParts.push(`Tanggal ${trimesterDate}`);
    }
    if (gaFromEdd) {
        summaryParts.push(`UK ${gaFromEdd}`);
    }
    if (fetusCount) {
        summaryParts.push(`Janin ${fetusCount}`);
    }
    if (gender) {
        summaryParts.push(`Gender ${gender}`);
    }
    if (presentationSummary) {
        summaryParts.push(`Presentasi ${presentationSummary}`);
    }
    if (placentaSummary) {
        summaryParts.push(`Plasenta ${placentaSummary}`);
    }
    if (afi) {
        summaryParts.push(`AFI ${afi}`);
    }
    if (efw) {
        summaryParts.push(`EFW ${efw}`);
    }
    if (notes) {
        summaryParts.push(`Catatan ${notes}`);
    }

    return summaryParts.length > 0 ? `USG: ${summaryParts.join(', ')}` : '';
}

function buildObjective(physicalExam, pemeriksaanObstetri, usg) {
    const lines = [];
    if (physicalExam && typeof physicalExam === 'object') {
        const tensi = normalizeText(physicalExam.tekanan_darah || physicalExam.tensi);
        const nadi = normalizeText(physicalExam.nadi);
        const suhu = normalizeText(physicalExam.suhu);
        const rr = normalizeText(physicalExam.respirasi || physicalExam.rr);
        const bb = normalizeText(physicalExam.berat_badan);
        const tb = normalizeText(physicalExam.tinggi_badan);

        if (tensi) {
            lines.push(`Tensi: ${tensi}`);
        }
        if (nadi) {
            lines.push(`Nadi: ${nadi}`);
        }
        if (suhu) {
            lines.push(`Suhu: ${suhu}`);
        }
        if (rr) {
            lines.push(`Respirasi: ${rr}`);
        }
        if (bb) {
            lines.push(`Berat badan: ${bb}`);
        }
        if (tb) {
            lines.push(`Tinggi badan: ${tb}`);
        }
    }

    const obstetriFindings = normalizeText(pemeriksaanObstetri?.findings);
    if (obstetriFindings) {
        lines.push(`Pemeriksaan obstetri: ${obstetriFindings}`);
    }

    const usgSummary = buildUsgSummary(usg);
    if (usgSummary) {
        lines.push(usgSummary);
    }

    return lines.join('\n').trim();
}

async function ensureTable() {
    if (ensureTablePromise) {
        return ensureTablePromise;
    }

    ensureTablePromise = validateSundayClinicSchema().catch((error) => {
        logger.error('[SundayClinicMedifySyncQueue] Required schema is unavailable', {
            error: error.message
        });
        throw error;
    });

    return ensureTablePromise;
}

function startWorkerIfNeeded() {
    if (workerStarted) {
        return;
    }

    workerStarted = true;

    setInterval(() => {
        processPendingJobs().catch((error) => {
            logger.error('[SundayClinicMedifySyncQueue] Worker tick failed', {
                error: error.message
            });
        });
    }, WORKER_INTERVAL_MS);

    // Run once shortly after startup.
    setTimeout(() => {
        processPendingJobs().catch((error) => {
            logger.error('[SundayClinicMedifySyncQueue] Initial worker tick failed', {
                error: error.message
            });
        });
    }, 1500);
}

async function enqueue(jobType, input) {
    await ensureTable();
    startWorkerIfNeeded();

    if (!shouldProcessJobType(jobType)) {
        return { queued: false, reason: 'sync_disabled' };
    }

    const facility = toFacility(input.visitLocation);
    if (!facility) {
        return { queued: false, reason: 'unsupported_location' };
    }

    const jobId = toJobId();
    const payload = {
        ...input,
        facility,
        source: toSimrsSource(input.visitLocation),
        enqueued_at: new Date().toISOString()
    };

    await db.query(
        `INSERT INTO ${TABLE_NAME}
         (job_id, mr_id, patient_id, visit_location, job_type, status, payload_json, created_by)
         VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
        [
            jobId,
            input.mrId,
            String(input.patientId),
            input.visitLocation,
            jobType,
            JSON.stringify(payload),
            input.createdBy || null
        ]
    );

    return { queued: true, jobId };
}

async function enqueueDiagnosis(input) {
    return enqueue('diagnosis', input);
}

async function enqueueTerapi(input) {
    return enqueue('terapi', input);
}

async function resolveCaseId(patientId, source) {
    const [rows] = await db.query(
        `SELECT simrs_med_id
         FROM medify_import_jobs
         WHERE patient_id = ?
           AND simrs_source = ?
           AND simrs_med_id IS NOT NULL
           AND status = 'success'
         ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
         LIMIT 1`,
        [patientId, source]
    );

    if (!rows.length) {
        return null;
    }

    return rows[0].simrs_med_id || null;
}

async function loadSectionDataByType(mrId, types) {
    const [rows] = await db.query(
        `SELECT record_type, record_data
         FROM medical_records
         WHERE mr_id = ?
           AND record_type IN (${types.map(() => '?').join(',')})
         ORDER BY COALESCE(updated_at, created_at) DESC, id DESC`,
        [mrId, ...types]
    );

    const byType = {};
    for (const row of rows) {
        if (!byType[row.record_type]) {
            byType[row.record_type] = parseJson(row.record_data) || {};
        }
    }

    return byType;
}

function mergePlanning(existingPlanning, therapyPlan) {
    const cleanedExisting = normalizeText(existingPlanning);
    const cleanedTherapy = normalizeText(therapyPlan);

    if (cleanedExisting && cleanedTherapy) {
        return `${cleanedExisting}\n\n${cleanedTherapy}`;
    }
    return cleanedExisting || cleanedTherapy;
}

async function buildCommPayload(jobRow) {
    const payload = parseJson(jobRow.payload_json) || {};
    const source = payload.source || toSimrsSource(jobRow.visit_location);
    const facility = payload.facility || toFacility(jobRow.visit_location);

    if (!facility || !source) {
        return {
            skipReason: 'unsupported_source_or_facility'
        };
    }

    const caseId = await resolveCaseId(jobRow.patient_id, source);
    if (!caseId) {
        return {
            skipReason: 'missing_case_id'
        };
    }

    const sectionData = await loadSectionDataByType(jobRow.mr_id, [
        'anamnesa',
        'physical_exam',
        'pemeriksaan_obstetri',
        'usg',
        'diagnosis',
        'planning'
    ]);

    const diagnosisPayload = payload.diagnosisData || {};
    const diagnosisRecord = sectionData.diagnosis || {};
    const planningRecord = sectionData.planning || {};

    const subjective = buildSubjective(sectionData.anamnesa);
    const objective = buildObjective(sectionData.physical_exam, sectionData.pemeriksaan_obstetri, sectionData.usg);

    const diagnosisUtama = normalizeText(
        diagnosisPayload.diagnosis_utama ||
        diagnosisPayload.diagnosisUtama ||
        diagnosisRecord.diagnosis_utama ||
        diagnosisRecord.diagnosisUtama
    );

    const diagnosisSekunder = normalizeText(
        diagnosisPayload.diagnosis_sekunder ||
        diagnosisPayload.diagnosisSekunder ||
        diagnosisRecord.diagnosis_sekunder ||
        diagnosisRecord.diagnosisSekunder
    );

    let assessment = diagnosisUtama;
    if (diagnosisSekunder) {
        assessment = assessment
            ? `${assessment}\nDiagnosis sekunder: ${diagnosisSekunder}`
            : `Diagnosis sekunder: ${diagnosisSekunder}`;
    }

    const existingPlanning = normalizeText(planningRecord.rencana || planningRecord.planning || planningRecord.plan || planningRecord.terapi);
    const terapiFromQueue = formatTherapyPlan(payload.therapyItems || []);
    const planning = mergePlanning(existingPlanning, terapiFromQueue);

    if (!subjective && !objective && !assessment && !planning) {
        return {
            skipReason: 'empty_soap_payload'
        };
    }

    const dateSource = payload.eventAt ||
        diagnosisPayload.record_datetime ||
        diagnosisPayload.recordDatetime ||
        planningRecord.record_datetime ||
        new Date().toISOString();

    const dt = nowDateTimeParts(dateSource);

    const body = {
        facility,
        caseId,
        subjective,
        objective,
        assessment,
        planning,
        tanggal: dt.tanggal,
        jam: dt.jam
    };

    if (COMM_SIMRS_EMAIL && COMM_SIMRS_PASSWORD) {
        body.simrsEmail = COMM_SIMRS_EMAIL;
        body.simrsPassword = COMM_SIMRS_PASSWORD;
    }

    return { body };
}

async function sendToComm(body) {
    const url = `${COMM_BASE_URL}${COMM_CPPT_PATH}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const headers = {
        'Content-Type': 'application/json'
    };

    if (COMM_OUTBOUND_API_KEY) {
        headers['X-API-Key'] = COMM_OUTBOUND_API_KEY;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });

        const rawText = await response.text();
        let parsed;
        try {
            parsed = rawText ? JSON.parse(rawText) : {};
        } catch {
            parsed = { raw: rawText };
        }

        if (!response.ok || parsed.success === false) {
            const message = parsed.error || parsed.message || `COMM request failed (${response.status})`;
            const error = new Error(message);
            error.status = response.status;
            error.response = parsed;
            throw error;
        }

        return parsed;
    } finally {
        clearTimeout(timeout);
    }
}

function retryDelayMs(attempt) {
    const exp = Math.max(0, attempt - 1);
    return Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, exp), 5 * 60 * 1000);
}

async function markCompleted(id, result) {
    await db.query(
        `UPDATE ${TABLE_NAME}
         SET status = 'completed',
             result_json = ?,
             error_message = NULL,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [JSON.stringify(result || {}), id]
    );
}

async function markSkipped(id, reason) {
    await db.query(
        `UPDATE ${TABLE_NAME}
         SET status = 'skipped',
             result_json = ?,
             error_message = ?,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [JSON.stringify({ skipped: true, reason }), reason, id]
    );
}

async function markFailedOrRetry(jobRow, error) {
    const message = error && error.message ? error.message : 'Unknown error';

    if (jobRow.attempt_count < MAX_RETRIES) {
        const delay = retryDelayMs(jobRow.attempt_count);
        const delaySeconds = Math.max(1, Math.ceil(delay / 1000));
        await db.query(
            `UPDATE ${TABLE_NAME}
             SET status = 'retrying',
                 next_retry_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
                 error_message = ?,
                 last_error_at = NOW(),
                 updated_at = NOW()
             WHERE id = ?`,
            [delaySeconds, message, jobRow.id]
        );
        return;
    }

    await db.query(
        `UPDATE ${TABLE_NAME}
         SET status = 'failed',
             error_message = ?,
             last_error_at = NOW(),
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [message, jobRow.id]
    );
}

async function claimNextJob() {
    await ensureTable();

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query(
            `SELECT id, job_id, mr_id, patient_id, visit_location, job_type, status, attempt_count, payload_json
             FROM ${TABLE_NAME}
             WHERE status IN ('queued', 'retrying')
               AND (next_retry_at IS NULL OR next_retry_at <= NOW())
             ORDER BY id ASC
             LIMIT 1
             FOR UPDATE`
        );

        if (!rows.length) {
            await connection.commit();
            return null;
        }

        const job = rows[0];

        await connection.query(
            `UPDATE ${TABLE_NAME}
             SET status = 'processing',
                 attempt_count = attempt_count + 1,
                 updated_at = NOW()
             WHERE id = ?`,
            [job.id]
        );

        await connection.commit();

        job.attempt_count = Number(job.attempt_count || 0) + 1;
        return job;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function processPendingJobs() {
    if (!GLOBAL_SYNC_ENABLED || isProcessing) {
        return;
    }

    isProcessing = true;
    try {
        while (true) {
            const job = await claimNextJob();
            if (!job) {
                break;
            }

            try {
                const prepared = await buildCommPayload(job);
                if (prepared.skipReason) {
                    await markSkipped(job.id, prepared.skipReason);
                    continue;
                }

                const commResult = await sendToComm(prepared.body);
                await markCompleted(job.id, {
                    comm: commResult,
                    sent_at: new Date().toISOString(),
                    jobType: job.job_type
                });

                logger.info('[SundayClinicMedifySyncQueue] Job completed', {
                    jobId: job.job_id,
                    mrId: job.mr_id,
                    type: job.job_type
                });
            } catch (jobError) {
                await markFailedOrRetry(job, jobError);
                logger.warn('[SundayClinicMedifySyncQueue] Job processing failed', {
                    jobId: job.job_id,
                    mrId: job.mr_id,
                    type: job.job_type,
                    attempt: job.attempt_count,
                    error: jobError.message
                });
            }
        }
    } catch (error) {
        logger.error('[SundayClinicMedifySyncQueue] Worker loop crashed', {
            error: error.message
        });
    } finally {
        isProcessing = false;
    }
}

async function getStats() {
    await ensureTable();

    const [rows] = await db.query(
        `SELECT
            SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
            SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
            SUM(CASE WHEN status = 'retrying' THEN 1 ELSE 0 END) AS retrying,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped
         FROM ${TABLE_NAME}`
    );

    const data = rows[0] || {};
    return {
        queued: Number(data.queued || 0),
        processing: Number(data.processing || 0),
        retrying: Number(data.retrying || 0),
        completed: Number(data.completed || 0),
        failed: Number(data.failed || 0),
        skipped: Number(data.skipped || 0)
    };
}

async function getJobsByMr(mrId, limit = 20) {
    await ensureTable();

    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Number(limit), 1), 100) : 20;
    const [rows] = await db.query(
        `SELECT job_id, mr_id, patient_id, visit_location, job_type, status,
                attempt_count, error_message, result_json, created_at, updated_at, completed_at
         FROM ${TABLE_NAME}
         WHERE mr_id = ?
         ORDER BY id DESC
         LIMIT ?`,
        [mrId, safeLimit]
    );

    return rows.map((row) => ({
        jobId: row.job_id,
        mrId: row.mr_id,
        patientId: row.patient_id,
        visitLocation: row.visit_location,
        type: row.job_type,
        status: row.status,
        attempts: row.attempt_count,
        error: row.error_message,
        result: parseJson(row.result_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at
    }));
}

startWorkerIfNeeded();

module.exports = {
    enqueueDiagnosis,
    enqueueTerapi,
    getStats,
    getJobsByMr,
    processPendingJobs
};
