#!/usr/bin/env node
/**
 * USG Inbox Auto-Processor
 *
 * Scans /var/www/dokterdibya/usg-inbox/{hospital}/ for new USG folders
 * Auto-matches to patients and uploads to R2
 *
 * Structure:
 *   /usg-inbox/melinda/   <- RSIA Melinda USG
 *   /usg-inbox/gambiran/  <- RSUD Gambiran USG
 *   /usg-inbox/klinik/    <- Klinik Privat USG
 *
 * Folder format: DDMMYYYY-HHMMSS_NY. PATIENT NAME
 * Example: 19122025-193500_NY. RAFIQA
 *
 * Run: node scripts/usg-inbox-processor.js
 * Cron: every 5 minutes
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db');
const r2Storage = require('../services/r2Storage');
const clinicalPhotos = require('../services/UsgClinicalPhotoService');
const logger = require('../utils/logger');

// Paths
const INBOX_DIR = '/var/www/dokterdibya/usg-inbox';
const DONE_DIR = '/var/www/dokterdibya/usg-done';
const FAILED_DIR = '/var/www/dokterdibya/usg-failed';

// Image extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];

// Hospital folder to visit_location mapping
const HOSPITAL_MAP = {
    'melinda': 'rsia_melinda',
    'gambiran': 'rsud_gambiran',
    'klinik': 'klinik_private'
};

/**
 * Extract patient name from folder name
 * Input: "19122025-193500_NY. RAFIQA" or "19122025-193500_RAFIQA"
 * Output: "RAFIQA"
 */
function extractPatientName(folderName) {
    // Extract after the underscore
    const match = folderName.match(/_(.+)$/);
    if (!match) return null;

    let name = match[1];
    // Remove NY./Ny./ny./TN./Tn. prefix (with optional space/dot)
    name = name.replace(/^(NY|Ny|ny|TN|Tn|tn)[.\s]*/i, '');
    return name.trim().toUpperCase();
}

/**
 * Extract date from folder name
 * Input: "19122025-193500_NY. RAFIQA"
 * Output: "2025-12-19" (ISO format)
 */
function extractDateFromFolder(folderName) {
    const match = folderName.match(/^(\d{8})/);
    if (!match) return null;

    const ddmmyyyy = match[1];
    const day = ddmmyyyy.substring(0, 2);
    const month = ddmmyyyy.substring(2, 4);
    const year = ddmmyyyy.substring(4, 8);
    return `${year}-${month}-${day}`;
}

/**
 * Fuzzy match patient names
 */
function fuzzyMatch(inputName, dbName) {
    if (!inputName || !dbName) return false;

    const input = inputName.toLowerCase().replace(/[^a-z]/g, '');
    const dbNorm = dbName.toLowerCase().replace(/[^a-z]/g, '');

    // Exact match
    if (input === dbNorm) return true;

    // Contains match
    if (dbNorm.includes(input) || input.includes(dbNorm)) return true;

    // First name match
    const inputWords = inputName.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
    const dbWords = dbName.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);

    if (inputWords[0] && dbWords[0] && inputWords[0].length >= 3) {
        if (inputWords[0] === dbWords[0]) return true;
        if (dbWords[0].includes(inputWords[0]) || inputWords[0].includes(dbWords[0])) return true;
    }

    return false;
}

/**
 * Search patients by name
 */
async function searchPatientsByName(searchName) {
    if (!searchName || searchName.length < 3) return [];

    const firstWord = searchName.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/)[0];
    if (!firstWord || firstWord.length < 3) return [];

    const [rows] = await db.query(`
        SELECT
            p.id as patient_id,
            p.full_name,
            scr.mr_id,
            scr.mr_category,
            scr.id as scr_id,
            scr.visit_location
        FROM patients p
        LEFT JOIN sunday_clinic_records scr ON p.id = scr.patient_id
            AND scr.id = (
                SELECT id FROM sunday_clinic_records
                WHERE patient_id = p.id
                ORDER BY created_at DESC
                LIMIT 1
            )
        WHERE LOWER(p.full_name) LIKE ?
        ORDER BY p.full_name
        LIMIT 20
    `, [`${firstWord}%`]);

    return rows;
}

/**
 * Resolve an existing canonical visit. An inbox folder alone cannot authorize
 * a new clinical visit; unmatched folders remain available in the failed queue.
 */
async function getOrCreateMedicalRecord(patientId, hospital, recordDate) {
    // Check if patient has kunjungan at this hospital
    const [existing] = await db.query(`
        SELECT scr.id, scr.mr_id FROM sunday_clinic_records scr
        WHERE scr.patient_id = ? AND scr.visit_location = ?
          AND (
              (scr.created_at >= ? AND scr.created_at < DATE_ADD(?, INTERVAL 1 DAY))
              OR EXISTS (
                  SELECT 1 FROM sunday_appointments sa
                  WHERE sa.id = scr.appointment_id AND sa.patient_id = scr.patient_id
                    AND sa.appointment_date = ? AND sa.status IN ('confirmed', 'completed')
              )
          )
        ORDER BY scr.id LIMIT 2
    `, [patientId, hospital, recordDate, recordDate, recordDate]);

    if (existing.length === 1 && /^[A-Za-z]+\d+$/.test(existing[0].mr_id || '')) {
        return { mrId: existing[0].mr_id, recordId: existing[0].id, isNew: false };
    }
    throw new Error('Canonical visit is required and must be unambiguous before inbox USG import');
}

/**
 * Upload images to R2 and update medical record
 */
async function uploadImages(folderPath, mrId, patientName, recordDate) {
    const files = await fs.readdir(folderPath);
    const imageFiles = files.filter(f => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));

    if (imageFiles.length === 0) {
        return { uploaded: 0, urls: [] };
    }

    const urls = [];
    // Convert YYYYMMDD to DDMMYYYY
    const ddmmyyyy = recordDate.substring(8, 10) + recordDate.substring(5, 7) + recordDate.substring(0, 4);

    try {
        for (let i = 0; i < imageFiles.length; i++) {
            const file = imageFiles[i];
            const filePath = path.join(folderPath, file);
            const fileBuffer = await fs.readFile(filePath);
            const ext = path.extname(file).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
            // uploadFile creates a fresh key; deterministic names would overwrite
            // an existing clinical object before the database transaction commits.
            const uploaded = await r2Storage.uploadFile(fileBuffer, `inbox-${randomUUID()}${ext}`, mimeType, `usg/${ddmmyyyy}`);
            urls.push(uploaded.key);
        }
    } catch (error) {
        await clinicalPhotos.compensateUploaded(urls);
        throw error;
    }

    return { uploaded: urls.length, urls };
}

/**
 * Save USG record to database
 */
async function saveUsgRecord(patientId, mrId, urls, recordDate) {
    if (urls.length === 0) return;
    return clinicalPhotos.appendPhotos({ patientId, mrId, photos: urls, recordDate,
        actor: { id: 'usg-inbox', name: 'USG Inbox' } });
}

/**
 * Process a single folder
 * @param {string} hospitalKey - Hospital folder name (melinda, gambiran, klinik)
 * @param {string} folderName - Patient folder name (DDMMYYYY-HHMMSS_NAME)
 */
async function processFolder(hospitalKey, folderName) {
    const folderPath = path.join(INBOX_DIR, hospitalKey, folderName);
    const hospital = HOSPITAL_MAP[hospitalKey];

    console.log('Processing USG inbox folder');

    // Extract info from folder name
    const patientName = extractPatientName(folderName);
    const recordDate = extractDateFromFolder(folderName) || new Date().toISOString().slice(0, 10);

    if (!patientName) {
        console.log(`  ✗ Cannot extract patient name`);
        return { success: false, reason: 'Cannot extract patient name' };
    }


    // Search for matching patient
    const patients = await searchPatientsByName(patientName);
    const matches = patients.filter(p => fuzzyMatch(patientName, p.full_name));

    if (matches.length === 0) {
        console.log(`  ✗ No matching patient found`);
        return { success: false, reason: 'No matching patient' };
    }

    if (matches.length > 1) {
        console.log('  Multiple matches found');
        return { success: false, reason: 'Multiple matches' };
    }

    const patient = matches[0];

    // Get or create medical record at THIS hospital
    const { mrId, recordId, isNew } = await getOrCreateMedicalRecord(patient.patient_id, hospital, recordDate);

    // Upload images
    const { uploaded, urls } = await uploadImages(folderPath, mrId, patient.full_name, recordDate);
    console.log(`  Uploaded: ${uploaded} images`);

    if (uploaded > 0) {
        // Save to database
        try {
            await saveUsgRecord(patient.patient_id, mrId, urls, recordDate);
        } catch (error) {
            await clinicalPhotos.compensateUploaded(urls);
            throw error;
        }
        console.log(`  ✓ Saved to database`);
    }

    return { success: true, mrId, uploaded, hospital };
}

/**
 * Move folder to done/failed directory
 */
async function moveFolder(hospitalKey, folderName, success) {
    const srcPath = path.join(INBOX_DIR, hospitalKey, folderName);
    const destDir = success ? DONE_DIR : FAILED_DIR;
    const destPath = path.join(destDir, `${new Date().toISOString().slice(0, 10)}_${hospitalKey}_${folderName}`);

    await fs.rename(srcPath, destPath);
    console.log(`  Moved to: ${success ? 'usg-done' : 'usg-failed'}`);
}

/**
 * Main processor
 */
async function main() {
    console.log('=== USG Inbox Processor ===');
    console.log(`Time: ${new Date().toISOString()}`);

    try {
        let successCount = 0;
        let failCount = 0;
        let totalFolders = 0;

        // Scan each hospital sub-folder
        for (const hospitalKey of Object.keys(HOSPITAL_MAP)) {
            const hospitalPath = path.join(INBOX_DIR, hospitalKey);

            // Check if hospital folder exists
            try {
                await fs.access(hospitalPath);
            } catch {
                continue; // Skip if folder doesn't exist
            }

            // Get patient folders in this hospital folder
            const items = await fs.readdir(hospitalPath);

            for (const item of items) {
                const itemPath = path.join(hospitalPath, item);
                const stat = await fs.stat(itemPath);

                if (!stat.isDirectory()) continue;

                totalFolders++;

                try {
                    const result = await processFolder(hospitalKey, item);
                    await moveFolder(hospitalKey, item, result.success);

                    if (result.success) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (err) {
                    console.error('  USG inbox folder failed');
                    await moveFolder(hospitalKey, item, false);
                    failCount++;
                }
            }
        }

        if (totalFolders === 0) {
            console.log('\nNo folders to process.');
        } else {
            console.log(`\n=== Complete ===`);
            console.log(`Success: ${successCount}, Failed: ${failCount}`);
        }

    } catch (err) {
        console.error('Fatal USG inbox processor error');
        process.exit(1);
    }

    process.exit(0);
}

if (require.main === module) main();

module.exports = { getOrCreateMedicalRecord, uploadImages, saveUsgRecord, processFolder };
