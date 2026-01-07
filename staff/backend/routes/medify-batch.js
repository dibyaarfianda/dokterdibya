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

// Restrict to dokter and admin roles
const requireDocterOrAdmin = requireRoles('dokter', 'admin');

/**
 * POST /api/medify-batch/sync/:source
 * Sync medical records from SIMRS for a specific date
 * Scrapes SIMRS once, matches against ALL patients in DB
 */
router.post('/sync/:source', verifyToken, requireDocterOrAdmin, async (req, res) => {
    const { source } = req.params;
    const { date } = req.body; // Required: target date (YYYY-MM-DD)
    const userId = req.user.id;
    const userName = req.user.name;

    if (!date) {
        return res.status(400).json({
            success: false,
            message: 'Date is required (format: YYYY-MM-DD)'
        });
    }

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
            `Source: ${source}, Batch: ${batchId}, Date: ${date}`);

        // Start background processing (async - don't await)
        processSync(batchId, source, date, userId).catch(err => {
            console.error('[Medify] Sync error:', err);
        });

        res.json({
            success: true,
            message: `Sync dimulai untuk tanggal ${date}`,
            batchId
        });

    } catch (error) {
        console.error('[Medify] Error starting sync:', error);
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
            global.io.emit('medify_progress', {
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
            console.log(`[Medify] Processing ${i + 1}/${simrsPatients.length}: ${simrsPatient.name}`);
            emitProgress('matching', {
                message: `Mencocokkan: ${simrsPatient.name}`,
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
                console.log(`[Medify] No name match for ${simrsPatient.name}`);
                noMatches.push({ name: simrsPatient.name, reason: 'no_name_match' });
                continue;
            }

            // Extract full identity from SIMRS for proper matching
            console.log(`[Medify] Extracting identity for ${simrsPatient.name}...`);
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
                console.log(`[Medify] MATCH: ${simrsPatient.name} → ${bestMatch.full_name} (${bestScore} factors: ${bestFactors.join(', ')})`);
                matches.push({
                    simrsPatient: { ...simrsPatient, ...identity },
                    dbPatient: bestMatch,
                    matchScore: bestScore,
                    matchFactors: bestFactors
                });
            } else {
                console.log(`[Medify] No strong match for ${simrsPatient.name} (best: ${bestScore} factors)`);
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
            global.io.emit('medify_sync_complete', {
                batchId,
                stats: stats[0] || { total: 0, success: 0, failed: 0, skipped: 0 }
            });
        }

    } catch (error) {
        console.error(`[Medify] Sync error:`, error);
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
            global.io.emit('medify_sync_complete', {
                batchId,
                error: error.message,
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
        `SELECT id, patient_id, patient_name, simrs_med_id
         FROM medify_import_jobs
         WHERE batch_id = ? AND status = 'pending'`,
        [batchId]
    );

    console.log(`[Medify] Processing ${jobs.length} CPPT extractions...`);

    // Emit progress helper for this phase
    const emitExtractProgress = (data) => {
        if (global.io) {
            global.io.emit('medify_progress', {
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
            message: `Ekstrak: ${job.patient_name}`,
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
            console.log(`[Medify] Parsing CPPT for ${job.patient_name}...`);
            const aiParseResult = await parseWithAI(cpptResult.rawText, 'obstetri');

            // Save to medical record (creates DRD if needed)
            console.log(`[Medify] Saving medical record for ${job.patient_name}...`);
            const recordsSaved = await saveMedicalRecord(job.patient_id, source, aiParseResult);

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

            console.log(`[Medify] CPPT extracted and saved for ${job.patient_name} (${recordsSaved} sections)`);

        } catch (error) {
            console.error(`[Medify] CPPT extraction failed for ${job.patient_name}:`, error.message);
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
        console.error('[Medify] Error getting status:', error);
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
        console.error('[Medify] Error getting history:', error);
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
        console.error('[Medify] Error getting jobs:', error);
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
        console.error('[Medify] Error saving credentials:', error);
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
    const { source } = req.body;

    try {
        if (!['rsia_melinda', 'rsud_gambiran'].includes(source)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid source'
            });
        }

        const browser = await medifyService.getBrowser();
        const page = await browser.newPage();

        try {
            await medifyService.login(page, source);
            await page.close();

            res.json({
                success: true,
                message: 'Connection successful'
            });

        } catch (error) {
            await page.close();
            res.status(400).json({
                success: false,
                message: `Connection failed: ${error.message}`
            });
        }

    } catch (error) {
        console.error('[Medify] Error testing connection:', error);
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

        console.log(`[Medify Test] Starting test sync: ${simrsSearchName} → ${targetPatient[0].full_name}`);

        // Log activity
        await activityLogger.log(userId, userName, 'MEDIFY Test Sync Started',
            `Target: ${targetPatient[0].full_name}, SIMRS Search: ${simrsSearchName}, Source: ${source}`);

        // Start test sync in background
        testSyncProcess(targetPatientId, targetPatient[0].full_name, simrsSearchName, source, { dateStart, dateEnd })
            .then(result => {
                console.log(`[Medify Test] Test sync completed:`, result);
            })
            .catch(err => {
                console.error('[Medify Test] Test sync error:', err);
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
        console.error('[Medify Test] Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Test sync processor - single patient
 */
async function testSyncProcess(targetPatientId, targetPatientName, simrsSearchName, source, options = {}) {
    console.log(`[Medify Test] Processing: ${simrsSearchName} → ${targetPatientName}`);

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
            console.log(`[Medify Test] DPJP filter:`, dpjpResult);

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
            console.log(`[Medify Test] DPJP filter error (continuing):`, dpjpError.message);
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
        console.log(`[Medify Test] Search words: ${searchWords.join(', ')}`);
        console.log(`[Medify Test] Total patients in table: ${allPatients.length}`);
        console.log(`[Medify Test] First 20 patients:`, allPatients.map(p => p.name).slice(0, 20));

        const matchingPatients = allPatients.filter(p => {
            const pName = p.name.toLowerCase();
            // Require ALL search words to match
            return searchWords.every(word => pName.includes(word));
        });

        console.log(`[Medify Test] Found ${matchingPatients.length} matches for "${simrsSearchName}"`);

        if (matchingPatients.length === 0) {
            throw new Error(`Patient "${simrsSearchName}" not found in SIMRS`);
        }

        // Get first match
        const firstMatch = matchingPatients[0];
        console.log(`[Medify Test] Using match: ${firstMatch.name} (${firstMatch.medId})`);

        // Extract CPPT
        const cpptResult = await medifyService.extractCPPT(page, source, firstMatch.medId);
        console.log(`[Medify Test] CPPT extracted, length: ${cpptResult.rawText.length}`);

        // Parse with AI
        const aiParseResult = await parseWithAI(cpptResult.rawText, 'obstetri');
        console.log(`[Medify Test] AI parse complete`);

        // Save to target patient (creates new DRD)
        const recordsSaved = await saveMedicalRecord(targetPatientId, source, aiParseResult);
        console.log(`[Medify Test] Saved ${recordsSaved} record sections`);

        // Get the new MR ID
        const newMR = await pool.query(
            `SELECT mr_id FROM sunday_clinic_records
             WHERE patient_id = ? AND visit_location = ?
             ORDER BY created_at DESC LIMIT 1`,
            [targetPatientId, source]
        );

        const mrId = newMR && newMR.length > 0 ? newMR[0].mr_id : null;
        console.log(`[Medify Test] New MR ID: ${mrId}`);

        // Generate resume and publish to portal
        if (mrId) {
            await generateAndPublishResume(targetPatientId, mrId);
        }

        return {
            success: true,
            targetPatientId,
            mrId,
            recordsSaved,
            simrsMatch: firstMatch.name
        };

    } catch (error) {
        console.error(`[Medify Test] Error:`, error);
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
async function generateAndPublishResume(patientId, mrId) {
    try {
        console.log(`[Medify] Generating resume for ${patientId} / ${mrId}`);

        // Fetch patient data
        const patients = await pool.query(
            'SELECT * FROM patients WHERE id = ?',
            [patientId]
        );

        if (!patients || patients.length === 0) {
            console.error(`[Medify] Patient ${patientId} not found`);
            return;
        }

        const patient = patients[0];
        const identitas = {
            nama: patient.full_name,
            tanggal_lahir: patient.birth_date,
            umur: patient.age,
            alamat: patient.address,
            no_telp: patient.phone
        };

        // Fetch medical records for this visit - get LATEST record for each type
        const records = await pool.query(
            `SELECT record_type, record_data FROM medical_records
             WHERE mr_id = ? AND record_type != 'resume_medis'
             ORDER BY created_at DESC`,
            [mrId]
        );

        if (!records || records.length === 0) {
            console.error(`[Medify] No records found for ${mrId}`);
            return;
        }

        // Organize records by type - use FIRST occurrence (which is LATEST due to ORDER BY DESC)
        const recordsByType = {};
        records.forEach(record => {
            if (!recordsByType[record.record_type]) {
                let data = record.record_data;
                if (typeof data === 'string') {
                    try { data = JSON.parse(data); } catch (e) {}
                }
                recordsByType[record.record_type] = data;
            }
        });

        // Generate resume using the function from medical-records.js
        const { generateMedicalResume } = require('./medical-records');
        const resume = generateMedicalResume(identitas, recordsByType, { obat: [], tindakan: [] });

        // Save resume to medical_records
        const now = new Date();
        await pool.query(
            `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
             VALUES (?, ?, 'resume_medis', ?, ?)
             ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
            [mrId, patientId, JSON.stringify({ resume, saved_at: now.toISOString() }), now]
        );
        console.log(`[Medify] Resume saved to medical_records`);

        // Get today's date for title
        const dateStr = now.toLocaleDateString('id-ID', {
            day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta'
        });

        // Insert into patient_documents with status='published'
        const docTitle = `Resume Medis - ${patient.full_name} - ${dateStr}`;
        await pool.query(
            `INSERT INTO patient_documents
             (patient_id, mr_id, document_type, title, file_url, file_name, file_type, status, source, description, created_at)
             VALUES (?, ?, 'resume_medis', ?, ?, ?, 'text/plain', 'published', 'clinic', 'Auto-generated from MEDIFY sync', NOW())`,
            [patientId, mrId, docTitle, `resume:${mrId}`, `resume_${mrId}.txt`]
        );
        console.log(`[Medify] Resume published to patient_documents`);

        // Create patient notification
        await pool.query(
            `INSERT INTO patient_notifications
             (patient_id, type, title, message, created_at)
             VALUES (?, 'document', 'Resume Medis Baru', ?, NOW())`,
            [patientId, `Resume medis kunjungan ${mrId} telah tersedia di portal Anda.`]
        );
        console.log(`[Medify] Patient notification created`);

        return true;

    } catch (error) {
        console.error(`[Medify] Error generating/publishing resume:`, error);
        return false;
    }
}

/**
 * Parse CPPT text with AI using medical-import's parseWithAI
 */
async function parseWithAI(text, category) {
    const medicalImport = require('./medical-import');

    // Use the exported parseWithAI function
    if (medicalImport.parseWithAI) {
        try {
            console.log(`[Medify] Sending to AI for parsing, text length: ${text.length}`);
            console.log(`[Medify] Text preview: ${text.substring(0, 500)}...`);
            const parsed = await medicalImport.parseWithAI(text, category);
            console.log(`[Medify] AI parsing successful`);
            console.log(`[Medify] Parsed keys: ${Object.keys(parsed).join(', ')}`);
            console.log(`[Medify] Subjective keys: ${Object.keys(parsed.subjective || {}).join(', ')}`);
            return parsed;
        } catch (error) {
            console.error(`[Medify] AI parsing failed:`, error.message);
            // Return basic structure with raw text if AI fails
            return {
                subjective: { keluhan_utama: text.substring(0, 500) },
                objective: {},
                assessment: {},
                plan: {},
                rawText: text
            };
        }
    }

    // Fallback if parseWithAI not available
    return {
        subjective: { keluhan_utama: text.substring(0, 500) },
        objective: {},
        assessment: {},
        plan: {},
        rawText: text
    };
}

/**
 * Save medical record to database
 */
async function saveMedicalRecord(patientId, source, parsedData) {
    try {
        // Map source to visit_location
        const visitLocation = source === 'rsia_melinda' ? 'rsia_melinda' : 'rsud_gambiran';

        // Find the most recent sunday_clinic_record for this patient at this location
        let existingRecord = await pool.query(
            `SELECT mr_id FROM sunday_clinic_records
             WHERE patient_id = ? AND visit_location = ?
             ORDER BY created_at DESC LIMIT 1`,
            [patientId, visitLocation]
        );

        let mrId;
        if (existingRecord && existingRecord.length > 0) {
            mrId = existingRecord[0].mr_id;
            console.log(`[Medify] Using existing MR: ${mrId}`);
        } else {
            // Create new sunday_clinic_record
            // Get next MR sequence
            const seqResult = await pool.query(
                `SELECT COALESCE(MAX(mr_sequence), 0) + 1 as next_seq FROM sunday_clinic_records FOR UPDATE`
            );
            const nextSeq = seqResult[0]?.next_seq || 1;
            mrId = `DRD${String(nextSeq).padStart(4, '0')}`;

            // Generate folder_path: DDMMYYYY-SEQ_PATIENTID
            const today = new Date();
            const dateStr = String(today.getDate()).padStart(2, '0') +
                String(today.getMonth() + 1).padStart(2, '0') +
                today.getFullYear();
            const folderPath = `${dateStr}-${nextSeq}_${patientId}`;

            await pool.query(
                `INSERT INTO sunday_clinic_records (mr_id, mr_sequence, patient_id, visit_location, import_source, folder_path, created_at, last_activity_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [mrId, nextSeq, patientId, visitLocation, `medify_${source}`, folderPath]
            );
            console.log(`[Medify] Created new MR: ${mrId}`);
        }

        // Determine record types to save based on parsed data
        let recordsSaved = 0;
        const now = new Date();
        // Format: YYYY-MM-DDTHH:MM (required by form datetime inputs)
        const recordDatetime = now.toISOString().slice(0, 16);

        // Helper to convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
        const convertDateFormat = (dateStr) => {
            if (!dateStr) return null;
            // Match DD/MM/YYYY or DD-MM-YYYY
            const match = dateStr.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
            if (match) {
                let [, day, month, year] = match;
                // Handle 2-digit year
                if (year.length === 2) {
                    year = (parseInt(year) > 50 ? '19' : '20') + year;
                }
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            return dateStr; // Return as-is if can't parse
        };

        // Build anamnesa data - map field names to match form expectations
        const anamnesaData = {
            record_datetime: recordDatetime,
            keluhan_utama: parsedData.subjective?.keluhan_utama,
            // Map field names: rps → riwayat_kehamilan_saat_ini, etc.
            riwayat_kehamilan_saat_ini: parsedData.subjective?.rps,
            detail_riwayat_penyakit: parsedData.subjective?.rpd,
            riwayat_keluarga: parsedData.subjective?.rpk,
            // Convert dates to YYYY-MM-DD format for form inputs
            hpht: convertDateFormat(parsedData.subjective?.hpht),
            hpl: convertDateFormat(parsedData.subjective?.hpl),
            // Copy obstetric fields from assessment to anamnesa (form expects them here)
            gravida: parsedData.assessment?.gravida ?? parsedData.subjective?.gravida,
            para: parsedData.assessment?.para ?? parsedData.subjective?.para,
            abortus: parsedData.assessment?.abortus ?? parsedData.subjective?.abortus,
            anak_hidup: parsedData.assessment?.anak_hidup ?? parsedData.subjective?.anak_hidup
        };

        // Save anamnesa if present
        if (anamnesaData && Object.keys(anamnesaData).length > 0) {
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'anamnesa', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(anamnesaData), now]
            );
            recordsSaved++;
            console.log(`[Medify] Saved anamnesa for ${mrId}`);
        }

        // Save physical_exam (vital signs) if present
        const physicalExamData = {
            record_datetime: recordDatetime,
            keadaan_umum: parsedData.objective?.keadaan_umum,
            tensi: parsedData.objective?.tensi,
            nadi: parsedData.objective?.nadi,
            suhu: parsedData.objective?.suhu,
            spo2: parsedData.objective?.spo2,
            rr: parsedData.objective?.rr,
            gcs: parsedData.objective?.gcs,
            tinggi_badan: parsedData.objective?.tinggi_badan || parsedData.identity?.tinggi_badan,
            berat_badan: parsedData.objective?.berat_badan || parsedData.identity?.berat_badan
        };
        // Save if any vital sign is present
        if (physicalExamData.tensi || physicalExamData.nadi || physicalExamData.suhu ||
            physicalExamData.keadaan_umum || physicalExamData.tinggi_badan || physicalExamData.berat_badan) {
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'physical_exam', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(physicalExamData), now]
            );
            recordsSaved++;
            console.log(`[Medify] Saved physical_exam for ${mrId}`);
        }

        // Save pemeriksaan_obstetri if present (obstetric-specific findings)
        const obstetriData = {
            record_datetime: recordDatetime,
            // TFU, DJJ, leopold, etc. would go here if parsed
            ...parsedData.objective
        };
        if (parsedData.objective && Object.keys(parsedData.objective).length > 0) {
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'pemeriksaan_obstetri', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(obstetriData), now]
            );
            recordsSaved++;
            console.log(`[Medify] Saved pemeriksaan_obstetri for ${mrId}`);
        }

        // Save usg (USG data from objective) if present
        const usgData = {
            record_datetime: recordDatetime,
            hasil_usg: parsedData.objective?.usg,
            berat_janin: parsedData.objective?.berat_janin,
            presentasi: parsedData.objective?.presentasi || parsedData.assessment?.presentasi,
            plasenta: parsedData.objective?.plasenta,
            ketuban: parsedData.objective?.ketuban
        };
        // Save if USG text or fetal weight is present
        if (usgData.hasil_usg || usgData.berat_janin || usgData.presentasi) {
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'usg', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(usgData), now]
            );
            recordsSaved++;
            console.log(`[Medify] Saved usg for ${mrId}`);
        }

        // Save penunjang (lab results) if present
        const penunjangData = {
            record_datetime: recordDatetime,
            hasil_lab: parsedData.objective?.hasil_lab,
            catatan: parsedData.objective?.catatan_penunjang
        };
        if (penunjangData.hasil_lab) {
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'penunjang', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(penunjangData), now]
            );
            recordsSaved++;
            console.log(`[Medify] Saved penunjang for ${mrId}`);
        }

        // Save diagnosis if present
        if (parsedData.assessment && Object.keys(parsedData.assessment).length > 0) {
            const diagnosisData = { record_datetime: recordDatetime, ...parsedData.assessment };
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'diagnosis', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(diagnosisData), now]
            );
            recordsSaved++;
            console.log(`[Medify] Saved diagnosis for ${mrId}`);
        }

        // Save planning if present
        if (parsedData.plan && Object.keys(parsedData.plan).length > 0) {
            const planData = { record_datetime: recordDatetime, ...parsedData.plan };
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'planning', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(planData), now]
            );
            recordsSaved++;
            console.log(`[Medify] Saved planning for ${mrId}`);
        }

        // Update last_activity_at on sunday_clinic_records
        await pool.query(
            `UPDATE sunday_clinic_records SET last_activity_at = NOW() WHERE mr_id = ?`,
            [mrId]
        );

        console.log(`[Medify] Saved ${recordsSaved} record sections for ${mrId}`);
        return recordsSaved;

    } catch (error) {
        console.error(`[Medify] Error saving medical record:`, error);
        return 0;
    }
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
        console.error('[Medify] Error getting last batch:', error);
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
        console.error('[Medify] Error loading review data:', error);
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
        console.error('[Medify] Error loading preview:', error);
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
                await generateAndPublishResume(patientId, mrId);

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
                    VALUES (?, ?, ?, 'document', '/patient-dashboard.html#documents', NOW())
                `, [patientId, 'Dokumen Baru Tersedia', `Resume medis dan dokumen pemeriksaan Anda sudah tersedia di portal pasien.`]);

                results.push({ patientId, mrId, success: true });

            } catch (patientError) {
                console.error(`[Medify] Error sending for ${patientId}:`, patientError);
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
        console.error('[Medify] Error sending to portal:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
