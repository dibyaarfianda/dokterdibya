/**
 * MEDIFY Background Worker
 * Handles automatic daily sync of medical records from SIMRS
 *
 * Usage:
 *   node workers/medifyWorker.js --sync-all       # Sync all sources
 *   node workers/medifyWorker.js --sync melinda   # Sync only Melinda
 *   node workers/medifyWorker.js --sync gambiran  # Sync only Gambiran
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const pool = require('../utils/database');
const medifyService = require('../services/medifyPuppeteerService');

const SOURCES = {
    melinda: 'rsia_melinda',
    gambiran: 'rsud_gambiran'
};

/**
 * Find patients who need syncing for a source
 */
async function findPatientsToSync(source) {
    const [patients] = await pool.query(
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
    return patients;
}

/**
 * Create batch jobs for patients
 */
async function createBatchJobs(patients, source, createdBy = null) {
    if (patients.length === 0) {
        return { batchId: null, count: 0 };
    }

    const batchId = uuidv4();

    const values = patients.map(p => [
        batchId,
        p.id,
        p.full_name,
        p.age || calculateAge(p.birth_date),
        source,
        'pending',
        createdBy
    ]);

    await pool.query(
        `INSERT INTO medify_import_jobs
         (batch_id, patient_id, patient_name, patient_age, simrs_source, status, created_by)
         VALUES ?`,
        [values]
    );

    return { batchId, count: patients.length };
}

/**
 * Process a single batch
 */
async function processBatch(batchId, source) {
    console.log(`[MedifyWorker] Processing batch ${batchId} for ${source}`);

    const browser = await medifyService.getBrowser();
    let page = null;

    try {
        // Get all pending jobs
        const [jobs] = await pool.query(
            `SELECT id, patient_id, patient_name, patient_age
             FROM medify_import_jobs
             WHERE batch_id = ? AND status = 'pending'
             ORDER BY id`,
            [batchId]
        );

        if (jobs.length === 0) {
            console.log(`[MedifyWorker] No pending jobs in batch ${batchId}`);
            return;
        }

        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Login
        console.log(`[MedifyWorker] Logging in to ${source}...`);
        await medifyService.login(page, source);

        let successCount = 0;
        let failCount = 0;
        let skipCount = 0;

        // Process each job
        for (const job of jobs) {
            try {
                console.log(`[MedifyWorker] Processing: ${job.patient_name}`);

                // Update status to processing
                await pool.query(
                    `UPDATE medify_import_jobs SET status = 'processing' WHERE id = ?`,
                    [job.id]
                );

                // Get patient details
                const [[patient]] = await pool.query(
                    `SELECT id, full_name, birth_date, age, whatsapp as phone
                     FROM patients WHERE id = ?`,
                    [job.patient_id]
                );

                if (!patient) {
                    throw new Error('Patient not found in database');
                }

                // Navigate to history and search
                const config = medifyService.SIMRS_CONFIG[source];
                await page.goto(config.historyUrl, { waitUntil: 'networkidle0', timeout: 30000 });
                await page.waitForSelector('table', { timeout: 10000 });

                // Search by name
                const searchInput = await page.$('input[type="search"]');
                if (searchInput) {
                    await searchInput.click({ clickCount: 3 });
                    await searchInput.type(job.patient_name, { delay: 50 });
                    await medifyService.delay(2000);
                }

                // Get results
                const matchingPatients = await page.evaluate(() => {
                    const rows = document.querySelectorAll('table tbody tr');
                    const results = [];

                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 6) {
                            const patientCell = cells[2];
                            const patientName = patientCell?.innerText?.trim() || '';
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

                if (matchingPatients.length === 0) {
                    await pool.query(
                        `UPDATE medify_import_jobs
                         SET status = 'skipped',
                             simrs_patient_found = FALSE,
                             error_message = 'Patient not found in SIMRS',
                             completed_at = NOW()
                         WHERE id = ?`,
                        [job.id]
                    );
                    skipCount++;
                    continue;
                }

                // Get identity and verify match
                const firstMatch = matchingPatients[0];
                const identity = await medifyService.extractPatientIdentity(page, source, firstMatch.medId);
                const simrsPatient = { ...firstMatch, ...identity };
                const matchResult = medifyService.countMatchingFactors(simrsPatient, patient);

                if (matchResult.matchCount < 3) {
                    await pool.query(
                        `UPDATE medify_import_jobs
                         SET status = 'skipped',
                             simrs_patient_found = TRUE,
                             simrs_patient_id = ?,
                             error_message = ?,
                             completed_at = NOW()
                         WHERE id = ?`,
                        [firstMatch.medId, `Only ${matchResult.matchCount} matching factors: ${matchResult.factors.join(', ')}`, job.id]
                    );
                    skipCount++;
                    continue;
                }

                // Extract CPPT
                const cpptResult = await medifyService.extractCPPT(page, source, firstMatch.medId);

                // For now, just mark as success with raw data
                // TODO: Integrate with AI parsing and save to medical records
                await pool.query(
                    `UPDATE medify_import_jobs
                     SET status = 'success',
                         simrs_patient_found = TRUE,
                         simrs_patient_id = ?,
                         records_imported = 1,
                         completed_at = NOW()
                     WHERE id = ?`,
                    [firstMatch.medId, job.id]
                );

                // Update patient last sync
                await pool.query(
                    `UPDATE patients SET last_medify_sync = NOW() WHERE id = ?`,
                    [job.patient_id]
                );

                successCount++;
                console.log(`[MedifyWorker] Success: ${job.patient_name} -> ${firstMatch.medId}`);

            } catch (error) {
                console.error(`[MedifyWorker] Error processing ${job.patient_name}:`, error.message);

                await pool.query(
                    `UPDATE medify_import_jobs
                     SET status = 'failed',
                         error_message = ?,
                         completed_at = NOW()
                     WHERE id = ?`,
                    [error.message, job.id]
                );
                failCount++;
            }

            // Delay between requests
            await medifyService.delay(parseInt(process.env.MEDIFY_DELAY_BETWEEN_REQUESTS) || 5000);
        }

        console.log(`[MedifyWorker] Batch ${batchId} complete: ${successCount} success, ${failCount} failed, ${skipCount} skipped`);

    } catch (error) {
        console.error(`[MedifyWorker] Fatal error in batch ${batchId}:`, error);
    } finally {
        if (page) {
            await page.close();
        }
    }
}

/**
 * Sync a single source
 */
async function syncSource(source) {
    console.log(`\n[MedifyWorker] Starting sync for ${source}...`);

    try {
        // Check if credentials exist
        const [creds] = await pool.query(
            'SELECT id FROM medify_credentials WHERE simrs_source = ? AND is_active = TRUE',
            [source]
        );

        if (creds.length === 0) {
            console.log(`[MedifyWorker] No active credentials for ${source}, skipping`);
            return { success: false, reason: 'No credentials' };
        }

        // Find patients to sync
        const patients = await findPatientsToSync(source);
        console.log(`[MedifyWorker] Found ${patients.length} patients to sync`);

        if (patients.length === 0) {
            return { success: true, count: 0 };
        }

        // Create batch jobs
        const { batchId, count } = await createBatchJobs(patients, source, null);
        console.log(`[MedifyWorker] Created batch ${batchId} with ${count} jobs`);

        // Process batch
        await processBatch(batchId, source);

        return { success: true, batchId, count };

    } catch (error) {
        console.error(`[MedifyWorker] Error syncing ${source}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Sync all sources
 */
async function syncAll() {
    console.log('='.repeat(60));
    console.log(`[MedifyWorker] Starting sync-all at ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    const results = {};

    for (const [name, source] of Object.entries(SOURCES)) {
        results[name] = await syncSource(source);
    }

    console.log('\n[MedifyWorker] Sync complete. Results:', JSON.stringify(results, null, 2));

    // Close browser
    await medifyService.closeBrowser();

    return results;
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

/**
 * Main entry point
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--sync-all')) {
        await syncAll();
    } else if (args.includes('--sync')) {
        const sourceArg = args[args.indexOf('--sync') + 1];
        const source = SOURCES[sourceArg];

        if (!source) {
            console.error('Invalid source. Use: melinda or gambiran');
            process.exit(1);
        }

        await syncSource(source);
        await medifyService.closeBrowser();
    } else {
        console.log('Usage:');
        console.log('  node workers/medifyWorker.js --sync-all       # Sync all sources');
        console.log('  node workers/medifyWorker.js --sync melinda   # Sync only Melinda');
        console.log('  node workers/medifyWorker.js --sync gambiran  # Sync only Gambiran');
        process.exit(0);
    }

    // Give time for connections to close
    await new Promise(resolve => setTimeout(resolve, 2000));
    process.exit(0);
}

// Export for use as module
module.exports = {
    syncAll,
    syncSource,
    findPatientsToSync,
    createBatchJobs,
    processBatch
};

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('[MedifyWorker] Fatal error:', error);
        process.exit(1);
    });
}
