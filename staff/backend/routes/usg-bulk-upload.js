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
const { verifyToken, requirePermission } = require('../middleware/auth');

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
 */
function fuzzyMatch(inputName, dbName) {
    if (!inputName || !dbName) return false;

    // Normalize both names (lowercase, remove non-letters)
    const input = inputName.toLowerCase().replace(/[^a-z]/g, '');
    const dbNorm = dbName.toLowerCase().replace(/[^a-z]/g, '');

    // Exact match
    if (input === dbNorm) return true;

    // Check if one contains the other (partial match)
    return dbNorm.includes(input) || input.includes(dbNorm);
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
 * Uses sunday_clinic_records (visit date) as primary source, fallback to appointments
 */
async function getPatientsForDate(date, hospital) {
    // First, try to find patients from sunday_clinic_records (actual visits)
    const [recordRows] = await db.query(`
        SELECT DISTINCT
            scr.patient_id,
            p.full_name,
            scr.mr_id,
            scr.mr_category,
            scr.id as scr_id
        FROM sunday_clinic_records scr
        LEFT JOIN patients p ON scr.patient_id = p.id
        WHERE DATE(scr.created_at) = ?
        AND scr.visit_location = ?
        ORDER BY p.full_name
    `, [date, hospital]);

    if (recordRows.length > 0) {
        return recordRows;
    }

    // Fallback: try appointments if no records found
    const [appointmentRows] = await db.query(`
        SELECT DISTINCT
            a.patient_id,
            p.full_name,
            scr.mr_id,
            scr.mr_category,
            scr.id as scr_id
        FROM appointments a
        LEFT JOIN patients p ON a.patient_id = p.id
        LEFT JOIN sunday_clinic_records scr ON a.patient_id = scr.patient_id
        WHERE a.appointment_date = ?
        AND a.hospital_location = ?
        AND a.status IN ('confirmed', 'completed')
        ORDER BY p.full_name
    `, [date, hospital]);

    return appointmentRows;
}

/**
 * POST /api/usg-bulk-upload/preview
 * Preview matches before upload
 */
router.post('/preview', verifyToken, requirePermission('medical_records.edit'), upload.single('zipFile'), async (req, res) => {
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

            if (parts.length < 2) continue; // Need at least date_folder/patient_folder/file

            // Detect date from first folder
            if (!detectedDate) {
                detectedDate = extractDateFromFolder(parts[0]);
            }

            // Get patient folder name (could be parts[0] or parts[1] depending on structure)
            let patientFolder = parts.length >= 2 ? parts[1] : parts[0];

            // If first part is just date, patient folder is second part
            if (parts[0].match(/^\d{8}$/) && parts.length >= 2) {
                patientFolder = parts[1];
            } else if (parts[0].match(/^\d{8}-/)) {
                // Patient folder is first part (flat structure)
                patientFolder = parts[0];
            }

            // Only include image files
            const ext = path.extname(entry.entryName).toLowerCase();
            if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext)) continue;

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
                message: 'Tidak dapat mendeteksi tanggal dari folder. Pastikan nama folder mengikuti format DDMMYYYY'
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

            // Find matching patients
            const matchedPatients = patients.filter(p => fuzzyMatch(extractedName, p.full_name));

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
router.post('/execute', verifyToken, requirePermission('medical_records.edit'), upload.single('zipFile'), async (req, res) => {
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

            if (!patient_id || !mr_id) {
                results.push({
                    folder: folderName,
                    status: 'skipped',
                    reason: 'No patient selected'
                });
                skipCount++;
                continue;
            }

            try {
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
                `, [patient_id, mr_id]);

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
                        mr_id,
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
                    `, [patient_id, mr_id, JSON.stringify(recordData)]);

                    logger.info('[BulkUSG] Created new USG record', {
                        patient_id,
                        mr_id,
                        photosAdded: uploadedPhotos.length
                    });
                }

                results.push({
                    folder: folderName,
                    status: 'success',
                    photosUploaded: uploadedPhotos.length,
                    patient_id,
                    mr_id
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
