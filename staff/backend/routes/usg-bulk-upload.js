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
const {
    extractPatientName,
    extractDateFromFolder,
    isValidIsoDate,
    findBestNameMatches,
    getPatientsForDate,
    resolveVisitRecord
} = require('../services/UsgBulkUploadMatchingService');

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
 * Hospital location mappings
 */
const HOSPITAL_LOCATIONS = {
    klinik_private: 'Klinik Privat',
    rsia_melinda: 'RSIA Melinda',
    rsud_gambiran: 'RSUD Gambiran',
    rs_bhayangkara: 'RS Bhayangkara'
};

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

        if (!targetDate || !isValidIsoDate(targetDate)) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal USG harus dipilih dan valid'
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
        const patients = await getPatientsForDate(db, targetDate, hospital);
        logger.info('[BulkUSG] Found patients for date', { date: targetDate, hospital, count: patients.length });

        // Match folders to patients
        const folders = [];
        let matchedCount = 0;
        let noMatchCount = 0;

        for (const [folderName, folderData] of folderMap) {
            const extractedName = folderData.extractedName;

            if (folderData.dateFromFolder && folderData.dateFromFolder !== targetDate) {
                folders.push({
                    ...folderData,
                    matchedPatients: [],
                    status: 'date_mismatch',
                    reason: `Tanggal folder ${folderData.dateFromFolder} berbeda dari tanggal yang dipilih ${targetDate}`
                });
                noMatchCount++;
                continue;
            }

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

            // Match only against patients who visited the selected hospital on the selected date.
            const matchedPatients = findBestNameMatches(extractedName, patients);

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
                mr_category: p.mr_category,
                scr_id: p.scr_id
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

        if (!isValidIsoDate(date)) {
            return res.status(400).json({ success: false, message: 'Tanggal USG tidak valid' });
        }

        if (!hospital || !HOSPITAL_LOCATIONS[hospital]) {
            return res.status(400).json({ success: false, message: 'Lokasi rumah sakit tidak valid' });
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
            const { folderName, patient_id, mr_id, scr_id, files } = mapping;
            const folderDate = extractDateFromFolder(folderName);
            const recordDate = date;

            if (folderDate && folderDate !== date) {
                results.push({
                    folder: folderName,
                    status: 'skipped',
                    reason: 'Tanggal folder berbeda dari tanggal USG yang dipilih'
                });
                skipCount++;
                continue;
            }

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
                // Resolve the exact visit selected during preview. Never fall back to the latest DRD.
                const selectedVisit = await resolveVisitRecord(db, {
                    scrId: scr_id,
                    mrId: mr_id,
                    patientId: patient_id,
                    date,
                    hospital
                });

                let effectiveMrId;
                let targetRecordId;

                if (selectedVisit) {
                    effectiveMrId = selectedVisit.mr_id;
                    targetRecordId = selectedVisit.id;
                    logger.info('[BulkUSG] Using existing kunjungan at hospital', {
                        patient_id,
                        mr_id: effectiveMrId,
                        hospital,
                        record_id: targetRecordId
                    });
                } else {
                    // NO existing DRD - skip this folder (only PERIKSA button can create DRD)
                    logger.info('[BulkUSG] No existing DRD for patient at this hospital - skipping', {
                        patient_id,
                        hospital,
                        folder: folderName
                    });
                    results.push({
                        folder: folderName,
                        status: 'skipped',
                        reason: 'DRD untuk tanggal dan lokasi yang dipilih tidak ditemukan. Gunakan PERIKSA untuk membuat DRD kunjungan.'
                    });
                    skipCount++;
                    continue;
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
                        VALUES (?, ?, 'usg', ?, ?, NOW())
                    `, [patient_id, effectiveMrId, JSON.stringify(recordData), recordDate]);

                    logger.info('[BulkUSG] Created new USG record', {
                        patient_id,
                        mr_id: effectiveMrId,
                        photosAdded: uploadedPhotos.length
                    });
                }

                // Auto-publish to patient portal
                try {
                    for (const photo of uploadedPhotos) {
                        await db.query(
                            `INSERT INTO patient_documents
                             (patient_id, mr_id, document_type, title, file_url, file_path, file_name, file_type, file_size,
                              source, status, published_at, published_by, created_by, created_at)
                             VALUES (?, ?, 'usg_photo', ?, ?, ?, ?, ?, ?, 'clinic', 'published', NOW(), ?, ?, NOW())
                             ON DUPLICATE KEY UPDATE updated_at = NOW()`,
                            [patient_id, effectiveMrId, photo.name || 'Foto USG',
                             photo.url, photo.key || photo.filename, photo.name, photo.type || 'image/jpeg', photo.size || 0,
                             req.user.id || null, req.user.id || null]
                        );
                    }

                    // Send notification
                    const { createPatientNotification } = require('./patient-notifications');
                    await createPatientNotification({
                        patient_id,
                        type: 'document',
                        title: 'Foto USG Baru',
                        message: `${uploadedPhotos.length} foto USG baru telah tersedia. Klik untuk melihat.`,
                        link: '/album-usg.html',
                        icon: 'fa fa-image',
                        icon_color: 'text-primary'
                    });

                    // Broadcast for real-time refresh
                    const realtimeSync = require('../realtime-sync');
                    realtimeSync.broadcast({
                        type: 'usg:patient_updated',
                        patient_id,
                        mr_id: effectiveMrId,
                        added: uploadedPhotos.length,
                        removed: 0
                    });
                } catch (publishError) {
                    logger.warn('[BulkUSG] Auto-publish warning:', publishError);
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

        // Log to history table
        try {
            await db.query(`
                INSERT INTO usg_bulk_upload_logs
                (upload_date, hospital, hospital_name, zip_filename, total_folders, success_count, skipped_count, error_count, details, uploaded_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                date,
                hospital,
                HOSPITAL_LOCATIONS[hospital] || hospital,
                req.file.originalname,
                mappingsData.length,
                successCount,
                skipCount,
                errorCount,
                JSON.stringify(results),
                req.user?.name || req.user?.email || 'Unknown'
            ]);
        } catch (logError) {
            logger.error('[BulkUSG] Failed to log upload history', logError);
        }

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

/**
 * GET /api/usg-bulk-upload/history
 * Get bulk upload history
 */
router.get('/history', verifyToken, async (req, res) => {
    try {
        const { limit = 50, offset = 0, hospital, startDate, endDate } = req.query;

        let whereClause = '1=1';
        const params = [];

        if (hospital) {
            whereClause += ' AND hospital = ?';
            params.push(hospital);
        }

        if (startDate) {
            whereClause += ' AND upload_date >= ?';
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ' AND upload_date <= ?';
            params.push(endDate);
        }

        // Get total count
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total FROM usg_bulk_upload_logs WHERE ${whereClause}`,
            params
        );

        // Get history records
        const [rows] = await db.query(`
            SELECT
                id,
                upload_date,
                hospital,
                hospital_name,
                zip_filename,
                total_folders,
                success_count,
                skipped_count,
                error_count,
                details,
                uploaded_by,
                created_at
            FROM usg_bulk_upload_logs
            WHERE ${whereClause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), parseInt(offset)]);

        // Parse JSON details
        const history = rows.map(row => ({
            ...row,
            details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details
        }));

        res.json({
            success: true,
            history,
            total: countResult[0].total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        logger.error('[BulkUSG] Failed to get history', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil history: ' + error.message
        });
    }
});

module.exports = router;
