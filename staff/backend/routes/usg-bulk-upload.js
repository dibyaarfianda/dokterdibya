/**
 * USG Bulk Upload Routes
 * Handles bulk upload of USG photos from all Sunday Clinic locations
 * Matches photos to patients based on folder names and appointment dates
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const db = require('../db');
const logger = require('../utils/logger');
const r2Storage = require('../services/r2Storage');
const { verifyToken } = require('../middleware/auth');

// Configure multer for ZIP file upload (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB max for ZIP files
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/zip' ||
            file.mimetype === 'application/x-zip-compressed' ||
            path.extname(file.originalname).toLowerCase() === '.zip') {
            cb(null, true);
        } else {
            cb(new Error('Only ZIP files are allowed'));
        }
    }
});

/**
 * Extract patient name from folder name
 * Input: "07122025-100332_NY. DESI"
 * Output: "DESI"
 */
function extractPatientName(folderName) {
    // Extract after the underscore
    const match = folderName.match(/_(.+)$/);
    if (!match) return null;

    let name = match[1];
    // Remove NY./Ny./ny. prefix (with optional space/dot)
    name = name.replace(/^(NY|Ny|ny)[.\s]*/i, '');
    return name.trim().toUpperCase();
}

/**
 * Extract date from folder name
 * Input: "07122025-100332_NY. DESI" or "07122025"
 * Output: "2025-12-07" (ISO format)
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
 * Handles cases like "ULVIATUL, NY_" matching "Ulviatul Fitriani"
 */
function fuzzyMatch(inputName, dbName) {
    if (!inputName || !dbName) return false;

    // Normalize both names (lowercase, remove non-letters)
    const input = inputName.toLowerCase().replace(/[^a-z]/g, '');
    const dbNorm = dbName.toLowerCase().replace(/[^a-z]/g, '');

    // Exact match
    if (input === dbNorm) return true;

    // Check if one contains the other (partial match)
    if (dbNorm.includes(input) || input.includes(dbNorm)) return true;

    // Check first name match (extract first word from both)
    const inputWords = inputName.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
    const dbWords = dbName.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);

    // First name must match
    if (inputWords[0] && dbWords[0] && inputWords[0].length >= 3) {
        // First name exact match
        if (inputWords[0] === dbWords[0]) return true;
        // First name contains
        if (dbWords[0].includes(inputWords[0]) || inputWords[0].includes(dbWords[0])) return true;
    }

    return false;
}

/**
 * Hospital location mappings
 */
const HOSPITAL_LOCATIONS = {
    klinik_private: 'Klinik Privat',
    rsia_melinda: 'RSIA Melinda',
    rsud_gambiran: 'RSUD Gambiran',
    rs_bhayangkara: 'RS Bhayangkara'
};

/**
 * Get patients with medical records on a specific date at specified hospital
 * Also includes patients who moved from other hospitals (have appointment at this hospital)
 * Returns only the LATEST MR for each patient
 */
async function getPatientsForDate(date, hospital) {
    // Get patients from:
    // 1. sunday_clinic_records at this hospital on this date
    // 2. appointments at this hospital on this date (even if their records are from other hospitals)
    const [rows] = await db.query(`
        SELECT
            p.id as patient_id,
            p.full_name,
            scr.mr_id,
            scr.mr_category,
            scr.id as scr_id
        FROM patients p
        LEFT JOIN sunday_clinic_records scr ON p.id = scr.patient_id
            AND scr.id = (
                SELECT id FROM sunday_clinic_records
                WHERE patient_id = p.id
                ORDER BY created_at DESC
                LIMIT 1
            )
        WHERE p.id IN (
            -- Patients with records at this hospital on this date
            SELECT DISTINCT patient_id FROM sunday_clinic_records
            WHERE DATE(created_at) = ? AND visit_location = ?
            UNION
            -- Patients with appointments at this hospital on this date
            SELECT DISTINCT patient_id FROM appointments
            WHERE appointment_date = ? AND hospital_location = ?
            AND status IN ('confirmed', 'completed')
        )
        ORDER BY p.full_name
    `, [date, hospital, date, hospital]);

    return rows;
}

/**
 * Search all patients by name for fuzzy matching (when patient moved hospitals)
 * Returns only the LATEST MR for each patient
 */
async function searchAllPatientsByName(searchName) {
    if (!searchName || searchName.length < 3) return [];

    // Normalize search name - extract first word
    const firstWord = searchName.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/)[0];
    if (!firstWord || firstWord.length < 3) return [];

    const [rows] = await db.query(`
        SELECT
            p.id as patient_id,
            p.full_name,
            scr.mr_id,
            scr.mr_category,
            scr.id as scr_id
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
        LIMIT 10
    `, [`${firstWord}%`]);

    return rows;
}

/**
 * POST /api/usg-bulk-upload/preview
 * Preview matches before upload
 */
router.post('/preview', verifyToken, upload.single('zipFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No ZIP file uploaded' });
        }

        logger.info('[BulkUSG] Processing ZIP file for preview', {
            filename: req.file.originalname,
            size: req.file.size
        });

        // Extract ZIP file
        const zip = new AdmZip(req.file.buffer);
        const zipEntries = zip.getEntries();

        // Group files by folder
        const folderMap = new Map();
        let detectedDate = null;

        for (const entry of zipEntries) {
            if (entry.isDirectory) continue;

            const entryPath = entry.entryName;
            const parts = entryPath.split('/').filter(p => p);

            // Need at least folder/file structure
            if (parts.length < 2) continue;

            // Only include image files
            const ext = path.extname(entry.entryName).toLowerCase();
            if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext)) continue;

            // Detect date from first folder if it looks like a date
            if (!detectedDate) {
                detectedDate = extractDateFromFolder(parts[0]);
            }

            // Determine patient folder based on structure
            let patientFolder;

            // Case 1: DDMMYYYY/PatientName/file.jpg (date folder at root)
            if (parts[0].match(/^\d{8}$/) && parts.length >= 3) {
                patientFolder = parts[1];
            }
            // Case 2: DDMMYYYY-PatientName/file.jpg (date prefix in folder name)
            else if (parts[0].match(/^\d{8}-/)) {
                patientFolder = parts[0];
            }
            // Case 3: PatientName/file.jpg (simple structure, no date)
            else {
                patientFolder = parts[0];
            }

            if (!folderMap.has(patientFolder)) {
                folderMap.set(patientFolder, {
                    folderName: patientFolder,
                    files: [],
                    extractedName: extractPatientName(patientFolder),
                    dateFromFolder: extractDateFromFolder(patientFolder)
                });
            }

            folderMap.get(patientFolder).files.push({
                name: path.basename(entry.entryName),
                path: entry.entryName,
                size: entry.header.size
            });
        }

        // Use date from request or detected from folder
        const targetDate = req.body.date || detectedDate;

        if (!targetDate) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal USG harus dipilih'
            });
        }

        // Get hospital from request (required)
        const hospital = req.body.hospital;
        if (!hospital || !HOSPITAL_LOCATIONS[hospital]) {
            return res.status(400).json({
                success: false,
                message: 'Lokasi rumah sakit harus dipilih'
            });
        }

        // Get patients for this date and hospital
        const patients = await getPatientsForDate(targetDate, hospital);
        logger.info('[BulkUSG] Found patients for date', { date: targetDate, hospital, count: patients.length });

        // Match folders to patients
        const folders = [];
        let matchedCount = 0;
        let noMatchCount = 0;

        for (const [folderName, folderData] of folderMap) {
            const extractedName = folderData.extractedName;

            if (!extractedName) {
                folders.push({
                    ...folderData,
                    matchedPatients: [],
                    status: 'no_match',
                    reason: 'Nama pasien tidak dapat diekstrak dari folder'
                });
                noMatchCount++;
                continue;
            }

            // Find matching patients from hospital-specific list first
            let matchedPatients = patients.filter(p => fuzzyMatch(extractedName, p.full_name));

            // If no match found, search ALL patients by name (for patients who moved hospitals)
            if (matchedPatients.length === 0) {
                const globalSearch = await searchAllPatientsByName(extractedName);
                matchedPatients = globalSearch.filter(p => fuzzyMatch(extractedName, p.full_name));
            }

            if (matchedPatients.length > 0) {
                folders.push({
                    ...folderData,
                    matchedPatients: matchedPatients.map(p => ({
                        patient_id: p.patient_id,
                        full_name: p.full_name,
                        mr_id: p.mr_id,
                        mr_category: p.mr_category,
                        scr_id: p.scr_id
                    })),
                    selectedPatient: matchedPatients.length === 1 ? matchedPatients[0].patient_id : null,
                    status: matchedPatients.length === 1 ? 'matched' : 'multiple_matches'
                });
                matchedCount++;
            } else {
                folders.push({
                    ...folderData,
                    matchedPatients: [],
                    status: 'no_match',
                    reason: 'Tidak ditemukan pasien dengan nama yang cocok'
                });
                noMatchCount++;
            }
        }

        // Sort folders by folder name
        folders.sort((a, b) => a.folderName.localeCompare(b.folderName));

        const totalFiles = folders.reduce((sum, f) => sum + f.files.length, 0);

        logger.info('[BulkUSG] Preview complete', {
            date: targetDate,
            totalFolders: folders.length,
            matched: matchedCount,
            noMatch: noMatchCount,
            totalFiles
        });

        res.json({
            success: true,
            date: targetDate,
            hospital,
            hospitalName: HOSPITAL_LOCATIONS[hospital],
            folders,
            allPatients: patients.map(p => ({
                patient_id: p.patient_id,
                full_name: p.full_name,
                mr_id: p.mr_id,
                mr_category: p.mr_category
            })),
            summary: {
                totalFolders: folders.length,
                matched: matchedCount,
                noMatch: noMatchCount,
                totalFiles
            }
        });

    } catch (error) {
        logger.error('[BulkUSG] Preview error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memproses ZIP file: ' + error.message
        });
    }
});

/**
 * GET /api/usg-bulk-upload/hospitals
 * Get available hospital locations
 */
router.get('/hospitals', verifyToken, (req, res) => {
    const hospitals = Object.entries(HOSPITAL_LOCATIONS).map(([key, name]) => ({
        value: key,
        label: name
    }));
    res.json({ success: true, hospitals });
});

/**
 * POST /api/usg-bulk-upload/execute
 * Execute bulk upload after preview confirmation
 */
router.post('/execute', verifyToken, upload.single('zipFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No ZIP file uploaded' });
        }

        const { mappings, date, hospital } = req.body;
        const mappingsData = JSON.parse(mappings || '[]');

        if (!mappingsData || mappingsData.length === 0) {
            return res.status(400).json({ success: false, message: 'No mappings provided' });
        }

        logger.info('[BulkUSG] Executing bulk upload', {
            date,
            hospital,
            mappingsCount: mappingsData.length
        });

        // Extract ZIP file
        const zip = new AdmZip(req.file.buffer);

        const results = [];
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const mapping of mappingsData) {
            const { folderName, patient_id, mr_id, files } = mapping;

            if (!patient_id) {
                results.push({
                    folder: folderName,
                    status: 'skipped',
                    reason: 'No patient selected'
                });
                skipCount++;
                continue;
            }

            try {
                // Check if patient has kunjungan at THIS hospital
                const [existingKunjungan] = await db.query(`
                    SELECT id, mr_id FROM sunday_clinic_records
                    WHERE patient_id = ? AND visit_location = ?
                    ORDER BY created_at DESC
                    LIMIT 1
                `, [patient_id, hospital]);

                let effectiveMrId;
                let targetRecordId;

                if (existingKunjungan.length > 0) {
                    // Use existing kunjungan at this hospital
                    effectiveMrId = existingKunjungan[0].mr_id;
                    targetRecordId = existingKunjungan[0].id;
                    logger.info('[BulkUSG] Using existing kunjungan at hospital', {
                        patient_id,
                        mr_id: effectiveMrId,
                        hospital,
                        record_id: targetRecordId
                    });
                } else {
                    // Create NEW kunjungan with NEW DRD using atomic transaction
                    // This prevents duplicate MR IDs from concurrent requests
                    const connection = await db.getConnection();
                    try {
                        await connection.beginTransaction();

                        // Lock table to get accurate MAX sequence
                        const [maxSeq] = await connection.query(`
                            SELECT MAX(mr_sequence) as max_seq FROM sunday_clinic_records FOR UPDATE
                        `);
                        const nextSeq = (maxSeq[0].max_seq || 0) + 1;
                        effectiveMrId = `DRD${String(nextSeq).padStart(4, '0')}`;

                        // Also update unified counter to stay in sync
                        await connection.query(`
                            UPDATE sunday_clinic_mr_counters
                            SET current_sequence = GREATEST(current_sequence, ?)
                            WHERE category = 'unified'
                        `, [nextSeq]);

                        const [patientInfo] = await connection.query(`SELECT full_name FROM patients WHERE id = ?`, [patient_id]);
                        const patientName = patientInfo[0]?.full_name || 'Unknown';
                        const folderPath = `${effectiveMrId}_${patientName.replace(/[^a-zA-Z0-9]/g, '_')}`;

                        // Get patient's last category (default obstetri for new patients)
                        const [lastCategory] = await connection.query(`
                            SELECT mr_category FROM sunday_clinic_records
                            WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1
                        `, [patient_id]);
                        const category = lastCategory[0]?.mr_category || 'obstetri';

                        const [insertResult] = await connection.query(`
                            INSERT INTO sunday_clinic_records
                            (mr_id, mr_sequence, patient_id, visit_location, folder_path, mr_category, status, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, 'draft', NOW(), NOW())
                        `, [effectiveMrId, nextSeq, patient_id, hospital, folderPath, category]);

                        await connection.commit();
                        targetRecordId = insertResult.insertId;

                        logger.info('[BulkUSG] Created new kunjungan with NEW DRD (atomic)', {
                            patient_id,
                            mr_id: effectiveMrId,
                            hospital,
                            category,
                            record_id: targetRecordId
                        });
                    } catch (txError) {
                        await connection.rollback();
                        throw txError;
                    } finally {
                        connection.release();
                    }
                }

                const uploadedPhotos = [];

                // Upload each file in the folder
                for (const file of files) {
                    const entry = zip.getEntry(file.path);
                    if (!entry) continue;

                    const fileBuffer = entry.getData();
                    const ext = path.extname(file.name).toLowerCase();
                    const mimeTypes = {
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                        '.gif': 'image/gif',
                        '.bmp': 'image/bmp'
                    };

                    // Upload to R2
                    const r2Result = await r2Storage.uploadFile(
                        fileBuffer,
                        `bulk-${patient_id}-${file.name}`,
                        mimeTypes[ext] || 'image/jpeg',
                        'usg-photos'
                    );

                    uploadedPhotos.push({
                        name: file.name,
                        filename: r2Result.filename,
                        key: r2Result.key,
                        url: `/api/usg-photos/file/${r2Result.key}`,
                        type: mimeTypes[ext] || 'image/jpeg',
                        size: fileBuffer.length,
                        storage: 'r2',
                        uploadedAt: new Date().toISOString(),
                        source: 'bulk-upload'
                    });
                }

                if (uploadedPhotos.length === 0) {
                    results.push({
                        folder: folderName,
                        status: 'error',
                        reason: 'No files uploaded'
                    });
                    errorCount++;
                    continue;
                }

                // Update medical record with new photos
                // First, get existing USG record
                const [existingRecords] = await db.query(`
                    SELECT id, record_data
                    FROM medical_records
                    WHERE patient_id = ? AND mr_id = ? AND record_type = 'usg'
                    ORDER BY created_at DESC
                    LIMIT 1
                `, [patient_id, effectiveMrId]);

                if (existingRecords.length > 0) {
                    // Append to existing record
                    const existingData = typeof existingRecords[0].record_data === 'string'
                        ? JSON.parse(existingRecords[0].record_data)
                        : existingRecords[0].record_data || {};

                    const existingPhotos = existingData.photos || [];
                    const updatedData = {
                        ...existingData,
                        photos: [...existingPhotos, ...uploadedPhotos]
                    };

                    await db.query(`
                        UPDATE medical_records
                        SET record_data = ?,
                            updated_at = NOW()
                        WHERE id = ?
                    `, [JSON.stringify(updatedData), existingRecords[0].id]);

                    logger.info('[BulkUSG] Updated existing USG record', {
                        patient_id,
                        mr_id: effectiveMrId,
                        record_id: existingRecords[0].id,
                        photosAdded: uploadedPhotos.length
                    });
                } else {
                    // Create new USG record
                    const recordData = {
                        photos: uploadedPhotos,
                        saved_at: new Date().toISOString(),
                        source: 'bulk-upload'
                    };

                    await db.query(`
                        INSERT INTO medical_records (patient_id, mr_id, record_type, record_data, created_at, updated_at)
                        VALUES (?, ?, 'usg', ?, NOW(), NOW())
                    `, [patient_id, effectiveMrId, JSON.stringify(recordData)]);

                    logger.info('[BulkUSG] Created new USG record', {
                        patient_id,
                        mr_id: effectiveMrId,
                        photosAdded: uploadedPhotos.length
                    });
                }

                results.push({
                    folder: folderName,
                    status: 'success',
                    photosUploaded: uploadedPhotos.length,
                    patient_id,
                    mr_id: effectiveMrId
                });
                successCount++;

            } catch (folderError) {
                logger.error('[BulkUSG] Error processing folder', {
                    folder: folderName,
                    error: folderError.message
                });
                results.push({
                    folder: folderName,
                    status: 'error',
                    reason: folderError.message
                });
                errorCount++;
            }
        }

        logger.info('[BulkUSG] Bulk upload complete', {
            success: successCount,
            skipped: skipCount,
            errors: errorCount
        });

        res.json({
            success: true,
            results,
            summary: {
                success: successCount,
                skipped: skipCount,
                errors: errorCount
            }
        });

    } catch (error) {
        logger.error('[BulkUSG] Execute error', error);
        res.status(500).json({
            success: false,
            message: 'Gagal upload: ' + error.message
        });
    }
});

module.exports = router;
