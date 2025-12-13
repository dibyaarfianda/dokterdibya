/**
 * R2 Storage Proxy Routes
 * Proxies R2 files through the backend server to avoid CDN connectivity issues
 */

const express = require('express');
const router = express.Router();
const r2Storage = require('../services/r2Storage');
const logger = require('../utils/logger');

// MIME type mapping
const MIME_TYPES = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
    'mp4': 'video/mp4',
    'webm': 'video/webm'
};

/**
 * GET /api/r2/:folder/*
 * Proxy R2 files through backend
 * Example: /api/r2/profile-photos/image-123.png
 */
router.get('/:folder/*', async (req, res) => {
    try {
        const folder = req.params.folder;
        const filePath = req.params[0]; // Everything after folder/
        const key = `${folder}/${filePath}`;

        if (!r2Storage.isR2Configured()) {
            return res.status(500).json({ success: false, message: 'R2 storage not configured' });
        }

        // Get file extension for content type
        const ext = filePath.split('.').pop().toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // Fetch file from R2
        const fileBuffer = await r2Storage.getFileBuffer(key);

        // Set caching headers (cache for 1 day on browser, 7 days on CDN)
        res.set({
            'Content-Type': contentType,
            'Content-Length': fileBuffer.length,
            'Cache-Control': 'public, max-age=86400, s-maxage=604800',
            'ETag': `"${Buffer.from(key).toString('base64').substring(0, 16)}"`,
        });

        res.send(fileBuffer);

    } catch (error) {
        logger.error('R2 proxy error', {
            error: error.message,
            path: req.path
        });

        // Return a 1x1 transparent PNG for image errors (prevents broken images)
        const ext = req.path.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            // 1x1 transparent PNG
            const transparentPng = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                'base64'
            );
            res.set('Content-Type', 'image/png');
            return res.send(transparentPng);
        }

        res.status(404).json({ success: false, message: 'File not found' });
    }
});

module.exports = router;
