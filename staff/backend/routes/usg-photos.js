/**
 * USG Photos Routes
 * Handles file upload for ultrasound photos
 * Supports both Cloudflare R2 (cloud) and local storage
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const r2Storage = require('../services/r2Storage');

// Configure multer for memory storage (for R2 upload)
const memoryStorage = multer.memoryStorage();

// Configure multer for disk storage (fallback)
const diskStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/usg-photos');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9]/g, '-')
            .substring(0, 50);
        cb(null, `${name}-${uniqueSuffix}${ext}`);
    }
});

// Use memory storage if R2 is configured, otherwise disk storage
const storage = r2Storage.isR2Configured() ? memoryStorage : diskStorage;

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|bmp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = file.mimetype.startsWith('image/');

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (JPEG, PNG, GIF, BMP)'));
        }
    }
});

/**
 * POST /api/usg-photos/upload
 * Upload USG photos to R2 or local storage
 */
router.post('/upload', upload.array('files', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const files = [];

        // Check if R2 is configured
        if (r2Storage.isR2Configured()) {
            // Upload to Cloudflare R2
            for (const file of req.files) {
                logger.info(`Uploading USG photo: ${file.originalname}, buffer size: ${file.buffer?.length || 0}`);
                try {
                    const result = await r2Storage.uploadFile(
                        file.buffer,
                        file.originalname,
                        file.mimetype,
                        'usg-photos'
                    );

                    files.push({
                        name: file.originalname,
                        filename: result.filename,
                        key: result.key,
                        // Use proxy URL to avoid regional network issues
                        url: `/api/usg-photos/file/${result.key}`,
                        directUrl: result.url, // Keep direct URL for server-side use
                        type: file.mimetype,
                        size: file.size,
                        storage: 'r2',
                        uploadedAt: new Date().toISOString()
                    });
                } catch (uploadError) {
                    logger.error('R2 upload failed for USG photo', {
                        file: file.originalname,
                        error: uploadError.message
                    });
                }
            }

            logger.info('USG photos uploaded to R2', {
                count: files.length,
                files: files.map(f => f.name)
            });
        } else {
            // Fallback to local storage
            for (const file of req.files) {
                files.push({
                    name: file.originalname,
                    filename: file.filename,
                    url: `/uploads/usg-photos/${file.filename}`,
                    type: file.mimetype,
                    size: file.size,
                    storage: 'local',
                    uploadedAt: new Date().toISOString()
                });
            }

            logger.info('USG photos uploaded locally', {
                count: files.length,
                files: files.map(f => f.name)
            });
        }

        if (files.length === 0) {
            return res.status(500).json({ error: 'Failed to upload files' });
        }

        res.json({
            success: true,
            files,
            storage: r2Storage.isR2Configured() ? 'r2' : 'local'
        });

    } catch (error) {
        logger.error('USG photos upload error', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

/**
 * DELETE /api/usg-photos/:key
 * Delete a USG photo
 */
router.delete('/:key(*)', async (req, res) => {
    try {
        const { key } = req.params;

        if (!key) {
            return res.status(400).json({ error: 'File key is required' });
        }

        if (r2Storage.isR2Configured() && key.includes('/')) {
            // Delete from R2
            await r2Storage.deleteFile(key);
            logger.info('USG photo deleted from R2', { key });
        } else {
            // Delete from local storage
            const filePath = path.join(__dirname, '../../uploads/usg-photos', key);
            await fs.unlink(filePath);
            logger.info('USG photo deleted locally', { key });
        }

        res.json({ success: true });

    } catch (error) {
        logger.error('USG photo delete error', error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

/**
 * GET /api/usg-photos/file/:key(*)
 * Proxy to serve R2 files through the backend
 */
router.get('/file/*', async (req, res) => {
    try {
        const key = req.params[0];

        if (!key) {
            return res.status(400).json({ error: 'File key is required' });
        }

        if (r2Storage.isR2Configured()) {
            // Get file from R2
            const fileBuffer = await r2Storage.getFileBuffer(key);

            // Determine content type from extension
            const ext = path.extname(key).toLowerCase();
            const contentTypes = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.bmp': 'image/bmp'
            };
            const contentType = contentTypes[ext] || 'image/jpeg';

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            res.send(fileBuffer);
        } else {
            // Serve from local storage
            const filePath = path.join(__dirname, '../../uploads/usg-photos', key);
            res.sendFile(filePath);
        }

    } catch (error) {
        logger.error('USG photo proxy error', { error: error.message });
        res.status(404).json({ error: 'File not found' });
    }
});

module.exports = router;
