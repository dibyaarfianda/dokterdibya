/**
 * USG Bulk Upload Routes
 * Handles bulk upload of USG photos from all Sunday Clinic locations
 * Matches photos to patients based on folder names and appointment dates
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const logger = require('../utils/logger');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const usgBulkUpload = require('../services/UsgBulkUploadService');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: usgBulkUpload.MAX_ZIP_BYTES
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

function sendServiceError(res, error, fallbackMessage) {
    const status = error.statusCode || 500;
    if (status >= 500) {
        logger.error('[BulkUSG] Route error', error);
    }
    return res.status(status).json({
        success: false,
        message: status >= 500 ? fallbackMessage + error.message : error.message
    });
}

router.post('/preview', verifyToken, upload.single('zipFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No ZIP file uploaded' });
        }

        logger.info('[BulkUSG] Processing ZIP file for preview', {
            filename: req.file.originalname,
            size: req.file.size
        });

        const preview = await usgBulkUpload.previewFromZipBuffer({
            buffer: req.file.buffer,
            date: req.body.date,
            hospital: req.body.hospital
        });

        logger.info('[BulkUSG] Preview complete', {
            date: preview.date,
            totalFolders: preview.summary.totalFolders,
            matched: preview.summary.matched,
            noMatch: preview.summary.noMatch,
            totalFiles: preview.summary.totalFiles
        });

        res.json(preview);
    } catch (error) {
        sendServiceError(res, error, 'Gagal memproses ZIP file: ');
    }
});

router.get('/hospitals', verifyToken, (req, res) => {
    const hospitals = Object.entries(usgBulkUpload.HOSPITAL_LOCATIONS).map(([value, label]) => ({
        value,
        label
    }));
    res.json({ success: true, hospitals });
});

router.get('/patients', verifyToken, async (req, res) => {
    try {
        const result = await usgBulkUpload.getPatients(req.query.date, req.query.hospital);
        res.json(result);
    } catch (error) {
        sendServiceError(res, error, 'Gagal mengambil pasien: ');
    }
});

router.post('/execute', verifyToken, upload.single('zipFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No ZIP file uploaded' });
        }

        const { mappings, date, hospital } = req.body;
        const mappingsData = JSON.parse(mappings || '[]');

        logger.info('[BulkUSG] Executing bulk upload', {
            date,
            hospital,
            mappingsCount: mappingsData.length
        });

        const result = await usgBulkUpload.executeFromZipBuffer({
            buffer: req.file.buffer,
            mappingsData,
            date,
            hospital,
            originalFilename: req.file.originalname,
            user: req.user
        });

        logger.info('[BulkUSG] Bulk upload complete', result.summary);
        res.json(result);
    } catch (error) {
        if (error instanceof SyntaxError) {
            return res.status(400).json({ success: false, message: 'Mappings JSON tidak valid' });
        }
        sendServiceError(res, error, 'Gagal upload: ');
    }
});

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

        const [countResult] = await db.query(
            `SELECT COUNT(*) as total FROM usg_bulk_upload_logs WHERE ${whereClause}`,
            params
        );

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
        `, [...params, parseInt(limit, 10), parseInt(offset, 10)]);

        const history = rows.map((row) => ({
            ...row,
            details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details
        }));

        res.json({
            success: true,
            history,
            total: countResult[0].total,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10)
        });
    } catch (error) {
        logger.error('[BulkUSG] Failed to get history', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil history: ' + error.message
        });
    }
});

router.get('/bot/config', verifyToken, async (req, res) => {
    try {
        const config = await usgBulkUpload.getBotConfig();
        res.json({
            success: true,
            ...config,
            defaultDate: usgBulkUpload.sundayClinicDateIso(),
            nextRun: 'Minggu 21:00 Asia/Jakarta'
        });
    } catch (error) {
        sendServiceError(res, error, 'Gagal membaca config bot: ');
    }
});

router.put('/bot/config', verifyToken, async (req, res) => {
    try {
        const config = await usgBulkUpload.saveBotConfig({
            enabled: req.body.enabled,
            sources: req.body.sources,
            user: req.user
        });
        res.json({ success: true, ...config });
    } catch (error) {
        sendServiceError(res, error, 'Gagal menyimpan config bot: ');
    }
});

router.post('/bot/run', verifyToken, async (req, res) => {
    try {
        const job = await usgBulkUpload.createBotJob({
            zipUrl: req.body.zipUrl,
            hospital: req.body.hospital,
            date: req.body.date,
            dryRun: Boolean(req.body.dryRun),
            force: Boolean(req.body.force),
            user: req.user,
            waitMs: Number.isFinite(Number(req.body.waitMs)) ? Number(req.body.waitMs) : 25000
        });
        const inFlight = ['queued', 'downloading', 'previewing', 'uploading'].includes(job?.status);
        res.status(inFlight ? 202 : 200).json({
            success: Boolean(job?.skipped) || job?.status !== 'failed',
            job
        });
    } catch (error) {
        sendServiceError(res, error, 'Gagal menjalankan upload bot: ');
    }
});

router.get('/bot/jobs', verifyToken, async (req, res) => {
    try {
        const jobs = await usgBulkUpload.listJobs({ limit: req.query.limit });
        res.json({ success: true, jobs });
    } catch (error) {
        sendServiceError(res, error, 'Gagal mengambil job: ');
    }
});

router.get('/bot/jobs/:id', verifyToken, async (req, res) => {
    try {
        const job = await usgBulkUpload.getJob(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job tidak ditemukan' });
        }
        res.json({ success: true, job });
    } catch (error) {
        sendServiceError(res, error, 'Gagal mengambil job: ');
    }
});

router.get('/bot/schedule', verifyToken, async (req, res) => {
    try {
        const config = await usgBulkUpload.getBotConfig();
        res.json({
            success: true,
            enabled: config.enabled,
            cron: config.cron,
            timezone: config.timezone,
            nextRun: 'Minggu 21:00 Asia/Jakarta',
            defaultDate: usgBulkUpload.sundayClinicDateIso(),
            sources: config.sources
        });
    } catch (error) {
        sendServiceError(res, error, 'Gagal membaca jadwal: ');
    }
});

router.post('/bot/schedule/run-now', verifyToken, async (req, res) => {
    try {
        const result = await usgBulkUpload.runConfiguredSources({
            force: Boolean(req.body?.force),
            dryRun: Boolean(req.body?.dryRun),
            user: req.user,
            date: req.body?.date
        });
        res.json({ success: !result.skipped, ...result });
    } catch (error) {
        sendServiceError(res, error, 'Gagal menjalankan jadwal: ');
    }
});

module.exports = router;
