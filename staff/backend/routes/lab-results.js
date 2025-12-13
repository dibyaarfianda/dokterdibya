/**
 * Lab Results Routes
 * Handles file upload and AI interpretation for laboratory results
 * Supports both Cloudflare R2 (cloud) and local storage
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const { OPENAI_API_KEY, OPENAI_API_URL } = require('../services/openaiService');
const r2Storage = require('../services/r2Storage');

// Configure multer for memory storage (for R2 upload)
const memoryStorage = multer.memoryStorage();

// Configure multer for disk storage (fallback)
const diskStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/lab-results');
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
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images (JPEG, PNG) and PDF files are allowed'));
        }
    }
});

/**
 * POST /api/lab-results/upload
 * Upload lab result files to R2 or local storage
 */
router.post('/upload', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const files = [];

        // Check if R2 is configured
        if (r2Storage.isR2Configured()) {
            // Upload to Cloudflare R2
            for (const file of req.files) {
                logger.info(`Uploading file: ${file.originalname}, buffer size: ${file.buffer?.length || 0}, reported size: ${file.size}`);
                try {
                    const result = await r2Storage.uploadFile(
                        file.buffer,
                        file.originalname,
                        file.mimetype,
                        'lab-results'
                    );

                    files.push({
                        name: file.originalname,
                        filename: result.filename,
                        key: result.key,
                        // Use proxy URL instead of direct R2 URL to avoid regional network issues
                        url: `/api/lab-results/file/${result.key}`,
                        directUrl: result.url, // Keep direct URL for server-side use
                        type: file.mimetype,
                        size: file.size,
                        storage: 'r2',
                        uploadedAt: new Date().toISOString()
                    });
                } catch (uploadError) {
                    logger.error('R2 upload failed for file', {
                        file: file.originalname,
                        error: uploadError.message
                    });
                    // Continue with other files
                }
            }

            logger.info('Lab results uploaded to R2', {
                count: files.length,
                files: files.map(f => f.name)
            });
        } else {
            // Fallback to local storage
            for (const file of req.files) {
                files.push({
                    name: file.originalname,
                    filename: file.filename,
                    url: `/uploads/lab-results/${file.filename}`,
                    type: file.mimetype,
                    size: file.size,
                    storage: 'local',
                    uploadedAt: new Date().toISOString()
                });
            }

            logger.info('Lab results uploaded locally', {
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
        logger.error('Lab results upload error', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

/**
 * POST /api/lab-results/interpret
 * Interpret lab results using OpenAI GPT-4o Vision
 */
router.post('/interpret', async (req, res) => {
    try {
        const { files } = req.body;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files to interpret' });
        }

        if (!OPENAI_API_KEY) {
            return res.status(500).json({ error: 'OpenAI API key not configured' });
        }

        // Prepare images for OpenAI
        const imageContents = [];

        for (const file of files) {
            // Skip PDFs for now (would need PDF processing)
            if (file.type?.includes('pdf')) {
                continue;
            }

            if (file.type?.startsWith('image/')) {
                let base64Image;

                try {
                    if (file.storage === 'r2' && file.key) {
                        // Fetch from R2
                        const fileBuffer = await r2Storage.getFileBuffer(file.key);
                        base64Image = fileBuffer.toString('base64');
                    } else if (file.url?.startsWith('http')) {
                        // Fetch from URL (R2 public URL)
                        const response = await fetch(file.url);
                        const arrayBuffer = await response.arrayBuffer();
                        base64Image = Buffer.from(arrayBuffer).toString('base64');
                    } else {
                        // Read from local storage
                        const filePath = path.join(__dirname, '../../uploads/lab-results', file.filename);
                        const fileBuffer = await fs.readFile(filePath);
                        base64Image = fileBuffer.toString('base64');
                    }

                    const dataUrl = `data:${file.type};base64,${base64Image}`;

                    imageContents.push({
                        type: 'image_url',
                        image_url: {
                            url: dataUrl,
                            detail: 'high'
                        }
                    });
                } catch (error) {
                    logger.error(`Failed to read file for interpretation`, {
                        file: file.filename || file.key,
                        error: error.message
                    });
                }
            }
        }

        if (imageContents.length === 0) {
            return res.status(400).json({ error: 'No valid images to interpret' });
        }

        // Call OpenAI GPT-4o Vision
        const messages = [
            {
                role: 'system',
                content: `Anda adalah asisten medis profesional yang menginterpretasi hasil laboratorium.
Tugas Anda:
1. Analisis hasil laboratorium pada gambar yang diberikan
2. Identifikasi semua parameter yang diukur dan nilainya
3. Tandai nilai yang abnormal (di luar rentang normal)
4. Berikan interpretasi klinis yang jelas dan profesional
5. Sarankan tindak lanjut jika diperlukan

Format output:
## HASIL LABORATORIUM

### Parameter yang Diukur
[List semua parameter dengan nilai dan satuan]

### Analisis
[Interpretasi klinis untuk setiap parameter abnormal]

### Kesimpulan
[Ringkasan kondisi pasien berdasarkan hasil lab]

### Rekomendasi
[Saran tindak lanjut jika ada]

Gunakan bahasa Indonesia yang profesional dan mudah dipahami.`
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Mohon interpretasikan hasil laboratorium berikut:'
                    },
                    ...imageContents
                ]
            }
        ];

        const openaiResponse = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: messages,
                max_tokens: 2000,
                temperature: 0.3
            })
        });

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            logger.error('OpenAI API error', { status: openaiResponse.status, error: errorText });
            throw new Error('OpenAI API request failed');
        }

        const openaiResult = await openaiResponse.json();
        const interpretation = openaiResult.choices[0]?.message?.content || 'Gagal menginterpretasi hasil.';

        logger.info('Lab results interpreted', {
            filesCount: imageContents.length,
            interpretationLength: interpretation.length
        });

        res.json({
            success: true,
            interpretation
        });

    } catch (error) {
        logger.error('Lab results interpretation error', error);
        res.status(500).json({ error: 'Interpretation failed: ' + error.message });
    }
});

/**
 * DELETE /api/lab-results/:key
 * Delete a lab result file
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
            logger.info('Lab result deleted from R2', { key });
        } else {
            // Delete from local storage
            const filePath = path.join(__dirname, '../../uploads/lab-results', key);
            await fs.unlink(filePath);
            logger.info('Lab result deleted locally', { key });
        }

        res.json({ success: true });

    } catch (error) {
        logger.error('Lab result delete error', error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

/**
 * GET /api/lab-results/status
 * Check storage configuration status
 */
router.get('/status', (req, res) => {
    res.json({
        storage: r2Storage.isR2Configured() ? 'r2' : 'local',
        r2Configured: r2Storage.isR2Configured(),
        bucket: r2Storage.isR2Configured() ? r2Storage.R2_BUCKET_NAME : null
    });
});

/**
 * GET /api/lab-results/file/:key(*)
 * Proxy to serve R2 files through the backend (avoids regional network issues)
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
                '.pdf': 'application/pdf',
                '.gif': 'image/gif'
            };
            const contentType = contentTypes[ext] || 'application/octet-stream';

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            res.send(fileBuffer);
        } else {
            // Serve from local storage
            const filePath = path.join(__dirname, '../../uploads/lab-results', key);
            res.sendFile(filePath);
        }

    } catch (error) {
        logger.error('File proxy error', { error: error.message });
        res.status(404).json({ error: 'File not found' });
    }
});

module.exports = router;
