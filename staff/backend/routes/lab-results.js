/**
 * Lab Results Routes
 * Handles file upload and AI interpretation for laboratory results
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const { OPENAI_API_KEY, OPENAI_API_URL } = require('../services/openaiService');

// Configure multer for file uploads
const storage = multer.diskStorage({
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
 * Upload lab result files
 */
router.post('/upload', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const files = req.files.map(file => ({
            name: file.originalname,
            filename: file.filename,
            url: `/uploads/lab-results/${file.filename}`,
            type: file.mimetype,
            size: file.size,
            uploadedAt: new Date().toISOString()
        }));

        logger.info('Lab results uploaded', {
            count: files.length,
            files: files.map(f => f.name)
        });

        res.json({
            success: true,
            files
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
                // Read file and convert to base64
                const filePath = path.join(__dirname, '../../uploads/lab-results', file.filename);
                try {
                    const fileBuffer = await fs.readFile(filePath);
                    const base64Image = fileBuffer.toString('base64');
                    const dataUrl = `data:${file.type};base64,${base64Image}`;

                    imageContents.push({
                        type: 'image_url',
                        image_url: {
                            url: dataUrl,
                            detail: 'high'
                        }
                    });
                } catch (error) {
                    logger.error(`Failed to read file ${file.filename}`, error);
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

module.exports = router;
