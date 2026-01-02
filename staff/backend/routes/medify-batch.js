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
 * Start a batch sync for a specific SIMRS source
 */
router.post('/sync/:source', verifyToken, requireDocterOrAdmin, async (req, res) => {
    const { source } = req.params;
    const userId = req.user.id;
    const userName = req.user.name;

    try {
        // Validate source
        if (!['rsia_melinda', 'rsud_gambiran'].includes(source)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid source. Must be rsia_melinda or rsud_gambiran'
            });
        }

        // Check if there's already a running sync for this source
        const running = await pool.query(
            `SELECT id FROM medify_import_jobs
             WHERE simrs_source = ? AND status IN ('pending', 'processing')
             LIMIT 1`,
            [source]
        );

        if (running && running.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'A sync is already in progress for this source'
            });
        }

        // Generate batch ID
        const batchId = uuidv4();

        // Find patients who need syncing
        const patients = await pool.query(
            `SELECT DISTINCT p.id, p.full_name, p.birth_date, p.age, p.whatsapp as alamat
             FROM patients p
             JOIN sunday_clinic_records scr ON p.id = scr.patient_id
             WHERE scr.visit_location = ?
               AND (p.last_medify_sync IS NULL
                    OR p.last_medify_sync < DATE_SUB(NOW(), INTERVAL 7 DAY))
             ORDER BY scr.created_at DESC
             LIMIT 100`,
            [source]
        );

        if (!patients || patients.length === 0) {
            return res.json({
                success: true,
                message: 'No patients need syncing',
                batchId,
                count: 0
            });
        }

        // Create job entries for each patient
        const values = patients.map(p => [
            batchId,
            p.id,
            p.full_name,
            p.age || calculateAge(p.birth_date),
            source,
            'pending',
            userId
        ]);

        await pool.query(
            `INSERT INTO medify_import_jobs
             (batch_id, patient_id, patient_name, patient_age, simrs_source, status, created_by)
             VALUES ?`,
            [values]
        );

        // Log activity
        await activityLogger.log(userId, userName, 'MEDIFY Sync Started',
            `Source: ${source}, Batch: ${batchId}, Patients: ${patients.length}`);

        // Start background processing (async - don't await)
        processSync(batchId, source).catch(err => {
            console.error('[Medify] Sync error:', err);
        });

        res.json({
            success: true,
            message: `Sync started for ${patients.length} patients`,
            batchId,
            count: patients.length
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
 * Background sync processor
 */
async function processSync(batchId, source) {
    console.log(`[Medify] Starting sync for batch ${batchId}`);

    const browser = await medifyService.getBrowser();
    let page = null;
    let isLoggedIn = false;

    try {
        // Get all pending jobs for this batch
        const jobs = await pool.query(
            `SELECT id, patient_id, patient_name, patient_age
             FROM medify_import_jobs
             WHERE batch_id = ? AND status = 'pending'
             ORDER BY id`,
            [batchId]
        );

        if (!jobs || jobs.length === 0) {
            console.log(`[Medify] No pending jobs for batch ${batchId}`);
            return;
        }

        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Login once
        await medifyService.login(page, source);
        isLoggedIn = true;

        // Process each job
        const totalJobs = jobs.length;
        let processedCount = 0;

        for (const job of jobs) {
            processedCount++;
            console.log(`[Medify] Processing job ${processedCount}/${totalJobs}: ${job.patient_name}`);

            try {
                // Update status to processing
                await pool.query(
                    `UPDATE medify_import_jobs SET status = 'processing' WHERE id = ?`,
                    [job.id]
                );

                // Emit progress via Socket.IO if available
                if (global.io) {
                    global.io.emit('medify_progress', {
                        batchId,
                        jobId: job.id,
                        patientName: job.patient_name,
                        status: 'processing',
                        current: processedCount,
                        total: totalJobs
                    });
                }

                // Get patient details from database
                const patientResult = await pool.query(
                    `SELECT id, full_name, birth_date, age, whatsapp as phone
                     FROM patients WHERE id = ?`,
                    [job.patient_id]
                );

                if (!patientResult || patientResult.length === 0) {
                    throw new Error('Patient not found');
                }
                const patient = patientResult[0];

                // Search for patient in SIMRS history
                // Navigate to history page and set date filter first
                const config = medifyService.SIMRS_CONFIG[source];
                await page.goto(config.historyUrl, { waitUntil: 'networkidle0', timeout: 60000 });

                // Wait for table
                await page.waitForSelector('table', { timeout: 15000 });
                await medifyService.delay(2000);

                // Set date filter (last 60 days to now)
                const today = new Date();
                const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);

                // Format as DD-MM-YYYY
                const formatDate = (d) => {
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    return `${day}-${month}-${year}`;
                };
                const dateFrom = formatDate(sixtyDaysAgo);
                const dateTo = formatDate(today);
                console.log(`[Medify] Setting date range: ${dateFrom} to ${dateTo}`);

                // Click Reset first to clear any previous filters
                await page.evaluate(() => {
                    const buttons = document.querySelectorAll('button.btn-info');
                    for (const btn of buttons) {
                        if (btn.innerText.includes('Reset')) {
                            btn.click();
                            return;
                        }
                    }
                });
                await medifyService.delay(2000);

                // For Gambiran: Select dr. Dibya Arfianda as DPJP filter
                if (source === 'rsud_gambiran') {
                    await page.evaluate(() => {
                        const dokterSelect = document.getElementById('dokter');
                        if (dokterSelect) {
                            // Find dr. Dibya option (value = 50)
                            const options = Array.from(dokterSelect.options);
                            const dibyaOption = options.find(o => o.text.toLowerCase().includes('dibya'));
                            if (dibyaOption) {
                                dokterSelect.value = dibyaOption.value;
                                dokterSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    });
                    await medifyService.delay(500);
                    console.log(`[Medify] Selected DPJP: dr. Dibya Arfianda`);
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

                // Click search button
                await page.evaluate(() => {
                    const buttons = document.querySelectorAll('button.btn-primary');
                    for (const btn of buttons) {
                        if (btn.innerText.includes('Cari')) {
                            btn.click();
                            return;
                        }
                    }
                });
                await medifyService.delay(3000);

                // Change DataTable to show 100 rows instead of 10
                await page.evaluate(() => {
                    const lengthSelect = document.querySelector('select[name="historiTable_length"]');
                    if (lengthSelect) {
                        lengthSelect.value = '100';
                        lengthSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
                await medifyService.delay(2000);

                // Get ALL patients from the table (don't use DataTable search - it doesn't work reliably)
                const allPatients = await page.evaluate(() => {
                    const rows = document.querySelectorAll('table tbody tr');
                    const results = [];

                    rows.forEach(row => {
                        const style = window.getComputedStyle(row);
                        if (style.display === 'none') return;

                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 6) {
                            // Cell 2 contains: "NUMBER\nNAME\nGender, Age"
                            const patientCell = cells[2];
                            const cellText = patientCell?.innerText?.trim() || '';
                            // Extract just the name (second line)
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
                                results.push({
                                    name: patientName,
                                    medId: medId,
                                    visitDate: visitDate
                                });
                            }
                        }
                    });

                    return results;
                });

                // Filter to find patients matching the search name (case insensitive)
                // Use longer words (4+ chars) to reduce false positives
                const searchName = job.patient_name.toLowerCase();
                const searchWords = searchName.split(/\s+/).filter(w => w.length >= 4); // Only words with 4+ chars

                const matchingPatients = allPatients.filter(p => {
                    const pName = p.name.toLowerCase();
                    // Check if any significant (long) word from search name appears in patient name
                    return searchWords.some(word => pName.includes(word));
                });

                console.log(`[Medify] Found ${allPatients.length} patients in table, ${matchingPatients.length} match "${job.patient_name}":`);
                if (matchingPatients.length > 0) {
                    console.log(`[Medify] Matches:`, matchingPatients.slice(0, 3).map(p => `${p.name} (${p.medId})`));
                }

                if (matchingPatients.length === 0) {
                    // No match found
                    await pool.query(
                        `UPDATE medify_import_jobs
                         SET status = 'skipped',
                             simrs_patient_found = FALSE,
                             error_message = 'Patient not found in SIMRS',
                             completed_at = NOW()
                         WHERE id = ?`,
                        [job.id]
                    );

                    // Emit skipped progress
                    if (global.io) {
                        global.io.emit('medify_progress', {
                            batchId,
                            jobId: job.id,
                            patientName: job.patient_name,
                            status: 'skipped',
                            error: 'Patient not found in SIMRS',
                            current: processedCount,
                            total: totalJobs
                        });
                    }
                    console.log(`[Medify] Skipped: ${job.patient_name} - not found in SIMRS`);
                    continue;
                }

                // Get identity for first match to verify
                const firstMatch = matchingPatients[0];
                const identity = await medifyService.extractPatientIdentity(page, source, firstMatch.medId);

                // Combine identity with match info
                const simrsPatient = {
                    ...firstMatch,
                    ...identity
                };

                // Check matching factors
                const matchResult = medifyService.countMatchingFactors(simrsPatient, patient);

                if (matchResult.matchCount < 3) {
                    const errorMsg = `Only ${matchResult.matchCount} matching factors: ${matchResult.factors.join(', ')}`;
                    await pool.query(
                        `UPDATE medify_import_jobs
                         SET status = 'skipped',
                             simrs_patient_found = TRUE,
                             simrs_patient_id = ?,
                             error_message = ?,
                             completed_at = NOW()
                         WHERE id = ?`,
                        [firstMatch.medId, errorMsg, job.id]
                    );

                    // Emit skipped progress
                    if (global.io) {
                        global.io.emit('medify_progress', {
                            batchId,
                            jobId: job.id,
                            patientName: job.patient_name,
                            status: 'skipped',
                            error: errorMsg,
                            current: processedCount,
                            total: totalJobs
                        });
                    }
                    console.log(`[Medify] Skipped: ${job.patient_name} - ${errorMsg}`);
                    continue;
                }

                // Extract CPPT
                const cpptResult = await medifyService.extractCPPT(page, source, firstMatch.medId);

                // Parse with AI
                const aiParseResult = await parseWithAI(cpptResult.rawText, 'obstetri');

                // Save to medical records
                const recordsSaved = await saveMedicalRecord(job.patient_id, source, aiParseResult);

                // Update job as success
                await pool.query(
                    `UPDATE medify_import_jobs
                     SET status = 'success',
                         simrs_patient_found = TRUE,
                         simrs_patient_id = ?,
                         records_imported = ?,
                         completed_at = NOW()
                     WHERE id = ?`,
                    [firstMatch.medId, recordsSaved, job.id]
                );

                // Update patient last sync
                await pool.query(
                    `UPDATE patients SET last_medify_sync = NOW() WHERE id = ?`,
                    [job.patient_id]
                );

                // Emit success
                if (global.io) {
                    global.io.emit('medify_progress', {
                        batchId,
                        jobId: job.id,
                        patientName: job.patient_name,
                        status: 'success',
                        recordsImported: recordsSaved
                    });
                }

            } catch (error) {
                console.error(`[Medify] Error processing job ${job.id}:`, error);

                await pool.query(
                    `UPDATE medify_import_jobs
                     SET status = 'failed',
                         error_message = ?,
                         completed_at = NOW()
                     WHERE id = ?`,
                    [error.message, job.id]
                );

                if (global.io) {
                    global.io.emit('medify_progress', {
                        batchId,
                        jobId: job.id,
                        patientName: job.patient_name,
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            // Delay between requests
            await medifyService.delay(parseInt(process.env.MEDIFY_DELAY_BETWEEN_REQUESTS) || 5000);
        }

    } catch (error) {
        console.error(`[Medify] Fatal sync error:`, error);
    } finally {
        if (page) {
            await page.close();
        }
        // Don't close browser - keep it for future syncs
    }

    console.log(`[Medify] Sync completed for batch ${batchId}`);

    // Emit completion
    if (global.io) {
        global.io.emit('medify_sync_complete', { batchId });
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

            await pool.query(
                `INSERT INTO sunday_clinic_records (mr_id, mr_sequence, patient_id, visit_location, import_source, created_at, last_activity_at)
                 VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                [mrId, nextSeq, patientId, visitLocation, `medify_${source}`]
            );
            console.log(`[Medify] Created new MR: ${mrId}`);
        }

        // Determine record types to save based on parsed data
        let recordsSaved = 0;
        const now = new Date();

        // Save anamnesa if present
        if (parsedData.subjective && Object.keys(parsedData.subjective).length > 0) {
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'anamnesa', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(parsedData.subjective), now]
            );
            recordsSaved++;
        }

        // Save pemeriksaan_obstetri if present
        if (parsedData.objective && Object.keys(parsedData.objective).length > 0) {
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'pemeriksaan_obstetri', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(parsedData.objective), now]
            );
            recordsSaved++;
        }

        // Save diagnosis if present
        if (parsedData.assessment && Object.keys(parsedData.assessment).length > 0) {
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'diagnosis', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(parsedData.assessment), now]
            );
            recordsSaved++;
        }

        // Save planning if present
        if (parsedData.plan && Object.keys(parsedData.plan).length > 0) {
            await pool.query(
                `INSERT INTO medical_records (mr_id, patient_id, record_type, record_data, created_at)
                 VALUES (?, ?, 'planning', ?, ?)
                 ON DUPLICATE KEY UPDATE record_data = VALUES(record_data), updated_at = NOW()`,
                [mrId, patientId, JSON.stringify(parsedData.plan), now]
            );
            recordsSaved++;
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

module.exports = router;
