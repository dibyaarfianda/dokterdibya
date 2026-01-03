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
const db = require('../db');
const r2Storage = require('../services/r2Storage');
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
 * Get or create medical record for patient
 */
async function getOrCreateMedicalRecord(patientId, hospital, recordDate) {
    // Check if patient has kunjungan at this hospital
    const [existing] = await db.query(`
        SELECT id, mr_id FROM sunday_clinic_records
        WHERE patient_id = ? AND visit_location = ?
        ORDER BY created_at DESC
        LIMIT 1
    `, [patientId, hospital]);

    if (existing.length > 0) {
        return { mrId: existing[0].mr_id, recordId: existing[0].id, isNew: false };
    }

    // Create new kunjungan with atomic transaction
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [maxSeq] = await connection.query(`
            SELECT MAX(mr_sequence) as max_seq FROM sunday_clinic_records FOR UPDATE
        `);
        const nextSeq = (maxSeq[0].max_seq || 0) + 1;
        const mrId = `DRD${String(nextSeq).padStart(4, '0')}`;

        await connection.query(`
            UPDATE sunday_clinic_mr_counters
            SET current_sequence = GREATEST(current_sequence, ?)
            WHERE category = 'unified'
        `, [nextSeq]);

        const [patientInfo] = await connection.query(`SELECT full_name FROM patients WHERE id = ?`, [patientId]);
        const patientName = patientInfo[0]?.full_name || 'Unknown';
        const folderPath = `${mrId}_${patientName.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const [lastCategory] = await connection.query(`
            SELECT mr_category FROM sunday_clinic_records
            WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1
        `, [patientId]);
        const category = lastCategory[0]?.mr_category || 'obstetri';

        const [insertResult] = await connection.query(`
            INSERT INTO sunday_clinic_records
            (mr_id, mr_sequence, patient_id, visit_location, folder_path, mr_category, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, NOW())
        `, [mrId, nextSeq, patientId, hospital, folderPath, category, recordDate]);

        await connection.commit();
        connection.release();

        return { mrId, recordId: insertResult.insertId, isNew: true };
    } catch (err) {
        await connection.rollback();
        connection.release();
        throw err;
    }
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
    const dateFolder = recordDate.replace(/-/g, '').split('').reverse().join('');
    // Convert YYYYMMDD to DDMMYYYY
    const ddmmyyyy = recordDate.substring(8, 10) + recordDate.substring(5, 7) + recordDate.substring(0, 4);

    for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const filePath = path.join(folderPath, file);
        const fileBuffer = await fs.readFile(filePath);
        const ext = path.extname(file).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

        // R2 key: usg/{DDMMYYYY}/{MR_ID}_{index}.{ext}
        const r2Key = `usg/${ddmmyyyy}/${mrId}_${i + 1}${ext}`;

        await r2Storage.uploadFile(fileBuffer, r2Key, mimeType);
        urls.push(r2Key);

        console.log(`  Uploaded: ${file} -> ${r2Key}`);
    }

    return { uploaded: urls.length, urls };
}

/**
 * Save USG record to database
 */
async function saveUsgRecord(patientId, mrId, urls, recordDate) {
    if (urls.length === 0) return;

    // Get existing USG record
    const [existing] = await db.query(`
        SELECT id, record_data FROM medical_records
        WHERE mr_id = ? AND record_type = 'usg'
        ORDER BY created_at DESC LIMIT 1
    `, [mrId]);

    if (existing.length > 0) {
        // Append to existing
        const existingData = JSON.parse(existing[0].record_data || '{}');
        const existingPhotos = existingData.photos || [];
        existingData.photos = [...existingPhotos, ...urls];

        await db.query(`
            UPDATE medical_records SET record_data = ?, updated_at = NOW()
            WHERE id = ?
        `, [JSON.stringify(existingData), existing[0].id]);
    } else {
        // Create new
        const recordData = {
            record_datetime: `${recordDate}T00:00`,
            record_date: recordDate,
            photos: urls
        };

        await db.query(`
            INSERT INTO medical_records (patient_id, mr_id, record_type, record_data, created_at, updated_at)
            VALUES (?, ?, 'usg', ?, NOW(), NOW())
        `, [patientId, mrId, JSON.stringify(recordData)]);
    }
}

/**
 * Process a single folder
 * @param {string} hospitalKey - Hospital folder name (melinda, gambiran, klinik)
 * @param {string} folderName - Patient folder name (DDMMYYYY-HHMMSS_NAME)
 */
async function processFolder(hospitalKey, folderName) {
    const folderPath = path.join(INBOX_DIR, hospitalKey, folderName);
    const hospital = HOSPITAL_MAP[hospitalKey];

    console.log(`\nProcessing: ${hospitalKey}/${folderName}`);

    // Extract info from folder name
    const patientName = extractPatientName(folderName);
    const recordDate = extractDateFromFolder(folderName) || new Date().toISOString().slice(0, 10);

    if (!patientName) {
        console.log(`  ✗ Cannot extract patient name`);
        return { success: false, reason: 'Cannot extract patient name' };
    }

    console.log(`  Name: ${patientName}, Date: ${recordDate}, Hospital: ${hospital}`);

    // Search for matching patient
    const patients = await searchPatientsByName(patientName);
    const matches = patients.filter(p => fuzzyMatch(patientName, p.full_name));

    if (matches.length === 0) {
        console.log(`  ✗ No matching patient found`);
        return { success: false, reason: 'No matching patient' };
    }

    if (matches.length > 1) {
        console.log(`  ✗ Multiple matches found: ${matches.map(m => m.full_name).join(', ')}`);
        return { success: false, reason: 'Multiple matches', matches: matches.map(m => m.full_name) };
    }

    const patient = matches[0];
    console.log(`  Matched: ${patient.full_name} (${patient.patient_id})`);

    // Get or create medical record at THIS hospital
    const { mrId, recordId, isNew } = await getOrCreateMedicalRecord(patient.patient_id, hospital, recordDate);
    console.log(`  MR: ${mrId} ${isNew ? '(new)' : '(existing)'}`);

    // Upload images
    const { uploaded, urls } = await uploadImages(folderPath, mrId, patient.full_name, recordDate);
    console.log(`  Uploaded: ${uploaded} images`);

    if (uploaded > 0) {
        // Save to database
        await saveUsgRecord(patient.patient_id, mrId, urls, recordDate);
        console.log(`  ✓ Saved to database`);
    }

    return { success: true, patient: patient.full_name, mrId, uploaded, hospital };
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
                    console.error(`  ✗ Error: ${err.message}`);
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
        console.error('Fatal error:', err);
        process.exit(1);
    }

    process.exit(0);
}

main();
