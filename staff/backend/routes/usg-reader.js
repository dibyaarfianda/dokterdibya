/**
 * USG Image Reader API
 * Uses GPT-4 Vision to extract data from ultrasound images
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/auth');
const { OPENAI_API_KEY, OPENAI_API_URL } = require('../services/openaiService');
const logger = require('../utils/logger');

// Configure multer for image upload (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
        }
    }
});

/**
 * AI Prompt for USG image analysis
 */
const USG_READER_PROMPT = `You are an expert ultrasound image analyzer for obstetrics and gynecology.
Analyze this ultrasound image and extract ALL visible measurements and data.

Return ONLY valid JSON (no markdown, no code blocks, no explanation).

CRITICAL: For biometry measurements (BPD, AC, FL, HC, CRL), ultrasound machines show TWO values:
1. The raw measurement in cm/mm (e.g., "BPD: 8.25 cm")
2. The corresponding Gestational Age in weeks+days (e.g., "GA 33w2d" or "33W1D")

You MUST extract the GESTATIONAL AGE (weeks) for biometry, NOT the raw cm value.
Example: If you see "BPD 8.25cm GA 33w2d" → bpd should be 33.3 (33 weeks + 2/7 days)

For OBSTETRIC ultrasound, extract:
{
  "type": "obstetri",
  "trimester": "first|second|third" (determine from measurements),
  "measurements": {
    "gs": null or number (Gestational Sac - GA in weeks, e.g., 6.5),
    "crl": null or number (Crown Rump Length - raw value in cm for T1),
    "bpd": null or number (Biparietal Diameter - GA in WEEKS, e.g., 33.3 for 33w2d),
    "bpd_cm": null or number (BPD raw measurement in cm if needed),
    "hc": null or number (Head Circumference - GA in WEEKS),
    "ac": null or number (Abdominal Circumference - GA in WEEKS, e.g., 34.0 for 34w0d),
    "ac_cm": null or number (AC raw measurement in cm if needed),
    "fl": null or number (Femur Length - GA in WEEKS, e.g., 32.7 for 32w5d),
    "fl_cm": null or number (FL raw measurement in cm if needed),
    "hl": null or number (Humerus Length - GA in WEEKS),
    "efw": null or number (Estimated Fetal Weight in GRAMS, e.g., 2150),
    "afi": null or number (Amniotic Fluid Index in cm, e.g., 12.5),
    "nt": null or number (Nuchal Translucency in mm, e.g., 1.2)
  },
  "gestational_age": {
    "weeks": null or number (composite/average GA),
    "days": null or number (0-6),
    "source": "CRL|BPD|composite|AUA|etc"
  },
  "edd": null or "YYYY-MM-DD" (Expected Delivery Date / HPL if shown),
  "lmp": null or "YYYY-MM-DD" (Last Menstrual Period / HPHT if shown),
  "fetal_heart_rate": null or number (FHR in bpm),
  "presentation": null or "cephalic|breech|transverse",
  "placenta_location": null or "anterior|posterior|fundal|lateral|previa",
  "gender": null or "male|female",
  "fetus_count": "single|multiple",
  "findings": "Brief description of what's visible",
  "raw_text": ["Array of all text visible on the image"]
}

For GYNECOLOGIC ultrasound, extract:
{
  "type": "ginekologi",
  "organ": "uterus|ovary|etc",
  "measurements": {
    "uterus_length": null or number (cm),
    "uterus_width": null or number (cm),
    "uterus_height": null or number (cm),
    "endometrium_thickness": null or number (mm),
    "right_ovary_size": null or "LxWxH cm",
    "left_ovary_size": null or "LxWxH cm",
    "dominant_follicle": null or number (mm),
    "cyst_size": null or "dimensions"
  },
  "findings": "Brief description",
  "raw_text": ["Array of all text visible"]
}

IMPORTANT:
1. For BPD, AC, FL, HC: Extract the GESTATIONAL AGE in weeks (with decimal for days, e.g., 33w2d = 33.3)
2. Convert weeks+days to decimal: 33w2d = 33 + (2/7) = 33.29 ≈ 33.3
3. EFW should be in GRAMS (e.g., 2150, not 2.15kg)
4. AFI should be in cm (e.g., 12.5)
5. NT should be in mm (e.g., 1.2)
6. If a value is not visible, use null
7. Read ALL text on the image including patient info, dates, machine settings
8. Detect machine brand/model if visible (Samsung, GE, Mindray, etc.)`;

/**
 * POST /api/usg-reader/analyze
 * Analyze a single USG image
 * Body: trimester (first|second|screening|third), type (obstetri|ginekologi)
 */
router.post('/analyze', verifyToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image uploaded'
            });
        }

        if (!OPENAI_API_KEY) {
            return res.status(500).json({
                success: false,
                message: 'OpenAI API key not configured'
            });
        }

        // Get user-specified context
        const userTrimester = req.body.trimester || 'second';
        const userType = req.body.type || 'obstetri';

        logger.info('[USG Reader] Analyzing image', {
            filename: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            userTrimester,
            userType
        });

        // Convert image to base64
        const base64Image = req.file.buffer.toString('base64');
        const imageDataUrl = `data:${req.file.mimetype};base64,${base64Image}`;

        // Call GPT-4 Vision
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: USG_READER_PROMPT
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Analyze this ultrasound image and extract all visible data.'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageDataUrl,
                                    detail: 'high'
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 2000,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('[USG Reader] OpenAI API error:', errorText);
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
            throw new Error('No response from OpenAI');
        }

        // Parse JSON from response
        let jsonStr = content.trim();
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.slice(7);
        }
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.slice(3);
        }
        if (jsonStr.endsWith('```')) {
            jsonStr = jsonStr.slice(0, -3);
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonStr.trim());
        } catch (parseError) {
            logger.error('[USG Reader] Failed to parse AI response:', jsonStr);
            throw new Error('Failed to parse AI response as JSON');
        }

        // Map to form fields based on type and USER-SPECIFIED trimester
        const formData = mapToFormFields(parsed, userTrimester, userType);

        logger.info('[USG Reader] Analysis complete', {
            type: userType,
            trimester: userTrimester,
            hasGA: !!parsed.gestational_age?.weeks
        });

        res.json({
            success: true,
            data: {
                raw: parsed,
                formData: formData,
                type: userType,
                trimester: userTrimester,
                confidence: calculateConfidence(parsed)
            }
        });

    } catch (error) {
        logger.error('[USG Reader] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to analyze image: ' + error.message
        });
    }
});

/**
 * POST /api/usg-reader/analyze-batch
 * Analyze multiple USG images
 */
router.post('/analyze-batch', verifyToken, upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No images uploaded'
            });
        }

        logger.info('[USG Reader] Batch analyzing', { count: req.files.length });

        const results = [];

        for (const file of req.files) {
            try {
                const base64Image = file.buffer.toString('base64');
                const imageDataUrl = `data:${file.mimetype};base64,${base64Image}`;

                const response = await fetch(OPENAI_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        messages: [
                            { role: 'system', content: USG_READER_PROMPT },
                            {
                                role: 'user',
                                content: [
                                    { type: 'text', text: 'Analyze this ultrasound image.' },
                                    { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
                                ]
                            }
                        ],
                        max_tokens: 2000,
                        temperature: 0.1
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    let content = data.choices[0]?.message?.content || '';

                    // Clean JSON
                    if (content.startsWith('```json')) content = content.slice(7);
                    if (content.startsWith('```')) content = content.slice(3);
                    if (content.endsWith('```')) content = content.slice(0, -3);

                    const parsed = JSON.parse(content.trim());
                    results.push({
                        filename: file.originalname,
                        success: true,
                        data: parsed,
                        formData: mapToFormFields(parsed)
                    });
                } else {
                    results.push({
                        filename: file.originalname,
                        success: false,
                        error: 'API error'
                    });
                }
            } catch (fileError) {
                results.push({
                    filename: file.originalname,
                    success: false,
                    error: fileError.message
                });
            }
        }

        // Merge results into single form data
        const mergedFormData = mergeResults(results);

        res.json({
            success: true,
            data: {
                results,
                merged: mergedFormData,
                totalImages: req.files.length,
                successCount: results.filter(r => r.success).length
            }
        });

    } catch (error) {
        logger.error('[USG Reader] Batch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to analyze images: ' + error.message
        });
    }
});

/**
 * Map parsed AI data to form fields
 * @param {Object} parsed - AI parsed data
 * @param {string} userTrimester - User-specified trimester (first|second|screening|third)
 * @param {string} userType - User-specified type (obstetri|ginekologi)
 */
function mapToFormFields(parsed, userTrimester = 'second', userType = 'obstetri') {
    if (!parsed) return {};

    if (userType === 'ginekologi') {
        return {
            type: 'ginekologi',
            uterus_length: parsed.measurements?.uterus_length,
            uterus_width: parsed.measurements?.uterus_width,
            uterus_height: parsed.measurements?.uterus_height,
            endometrium: parsed.measurements?.endometrium_thickness,
            right_ovary: parsed.measurements?.right_ovary_size,
            left_ovary: parsed.measurements?.left_ovary_size,
            dominant_follicle: parsed.measurements?.dominant_follicle,
            findings: parsed.findings
        };
    }

    // Obstetri - map to USER-SPECIFIED trimester fields
    const trimester = userTrimester;
    // Map trimester to field prefix
    let prefix;
    if (trimester === 'first') prefix = 't1';
    else if (trimester === 'second') prefix = 't2';
    else if (trimester === 'screening') prefix = 'scr';
    else prefix = 't3';

    const formData = {
        type: 'obstetri',
        trimester: trimester,
        [`${prefix}_date`]: new Date().toISOString().split('T')[0]
    };

    // Map measurements
    if (parsed.measurements) {
        if (parsed.measurements.gs) formData.t1_gs = parsed.measurements.gs;
        if (parsed.measurements.crl) formData.t1_crl = parsed.measurements.crl;
        if (parsed.measurements.bpd) formData[`${prefix}_bpd`] = parsed.measurements.bpd;
        if (parsed.measurements.ac) formData[`${prefix}_ac`] = parsed.measurements.ac;
        if (parsed.measurements.fl) formData[`${prefix}_fl`] = parsed.measurements.fl;
        if (parsed.measurements.efw) formData[`${prefix}_efw`] = parsed.measurements.efw;
        if (parsed.measurements.afi) formData[`${prefix}_afi`] = parsed.measurements.afi;
        if (parsed.measurements.nt) formData.t1_nt = parsed.measurements.nt;
    }

    // Map other fields
    if (parsed.gestational_age?.weeks) {
        formData[`${prefix}_ga_weeks`] = parsed.gestational_age.weeks;
    }
    if (parsed.fetal_heart_rate) {
        formData[`${prefix}_heart_rate`] = parsed.fetal_heart_rate;
    }
    if (parsed.edd) {
        formData[`${prefix}_edd`] = parsed.edd;
    }
    if (parsed.presentation) {
        formData[`${prefix}_presentation`] = parsed.presentation;
    }
    if (parsed.placenta_location) {
        formData[`${prefix}_placenta`] = parsed.placenta_location;
    }
    if (parsed.gender) {
        formData[`${prefix}_gender`] = parsed.gender;
    }
    if (parsed.fetus_count) {
        formData[`${prefix}_fetus_count`] = parsed.fetus_count;
    }

    return formData;
}

/**
 * Determine trimester from measurements
 */
function determineTrimester(parsed) {
    if (!parsed) return 'second';

    // If CRL is present, likely first trimester
    if (parsed.measurements?.crl) return 'first';

    // If GA is known, use it
    if (parsed.gestational_age?.weeks) {
        const weeks = parsed.gestational_age.weeks;
        if (weeks <= 13) return 'first';
        if (weeks <= 27) return 'second';
        return 'third';
    }

    // Default to second trimester (most common)
    return 'second';
}

/**
 * Merge multiple image results
 */
function mergeResults(results) {
    const merged = {
        type: 'obstetri',
        trimester: 'second'
    };

    for (const result of results) {
        if (!result.success || !result.formData) continue;

        // Take the first valid type/trimester
        if (result.formData.type && !merged.type) {
            merged.type = result.formData.type;
        }
        if (result.formData.trimester && !merged.trimester) {
            merged.trimester = result.formData.trimester;
        }

        // Merge all fields, preferring non-null values
        for (const [key, value] of Object.entries(result.formData)) {
            if (value !== null && value !== undefined && !merged[key]) {
                merged[key] = value;
            }
        }
    }

    return merged;
}

/**
 * Calculate confidence score
 */
function calculateConfidence(parsed) {
    if (!parsed) return { score: 0, total: 10, percentage: 0 };

    let score = 0;
    let total = 10;

    // Check key fields
    if (parsed.type) score++;
    if (parsed.measurements?.bpd || parsed.measurements?.crl) score++;
    if (parsed.measurements?.fl) score++;
    if (parsed.measurements?.ac) score++;
    if (parsed.measurements?.efw) score++;
    if (parsed.gestational_age?.weeks) score++;
    if (parsed.fetal_heart_rate) score++;
    if (parsed.presentation) score++;
    if (parsed.placenta_location) score++;
    if (parsed.findings) score++;

    return {
        score,
        total,
        percentage: Math.round((score / total) * 100)
    };
}

/**
 * POST /api/usg-reader/analyze-url
 * Analyze USG image from existing URL (for bulk uploaded photos)
 */
router.post('/analyze-url', verifyToken, async (req, res) => {
    try {
        const { imageUrl, trimester = 'second', type = 'obstetri' } = req.body;

        if (!imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'Image URL is required'
            });
        }

        if (!OPENAI_API_KEY) {
            return res.status(500).json({
                success: false,
                message: 'OpenAI API key not configured'
            });
        }

        logger.info('[USG Reader] Analyzing image from URL', {
            imageUrl: imageUrl.substring(0, 50) + '...',
            trimester,
            type
        });

        // Fetch image from URL (could be R2 signed URL or local)
        let imageDataUrl;

        // Check if it's a local API URL - need to get signed URL from R2
        if (imageUrl.startsWith('/api/usg-photos/file/')) {
            // Extract R2 key from URL and get signed URL
            const r2Key = imageUrl.replace('/api/usg-photos/file/', '');
            const r2Storage = require('../services/r2Storage');

            // Get signed URL that can be fetched
            const signedUrl = await r2Storage.getSignedDownloadUrl(r2Key, 300);

            // Fetch from signed URL
            const response = await fetch(signedUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch image from R2: ${response.status}`);
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            imageDataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
        } else if (imageUrl.startsWith('http')) {
            // External URL - fetch and convert
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.status}`);
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            imageDataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
        } else {
            // Assume it's already a data URL
            imageDataUrl = imageUrl;
        }

        // Call GPT-4 Vision
        const aiResponse = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: USG_READER_PROMPT },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Analyze this ultrasound image and extract all visible data.' },
                            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
                        ]
                    }
                ],
                max_tokens: 2000,
                temperature: 0.1
            })
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            logger.error('[USG Reader] OpenAI API error:', errorText);
            throw new Error(`OpenAI API error: ${aiResponse.status}`);
        }

        const data = await aiResponse.json();
        let content = data.choices[0]?.message?.content;

        if (!content) {
            throw new Error('No response from OpenAI');
        }

        // Parse JSON
        if (content.startsWith('```json')) content = content.slice(7);
        if (content.startsWith('```')) content = content.slice(3);
        if (content.endsWith('```')) content = content.slice(0, -3);

        const parsed = JSON.parse(content.trim());
        const formData = mapToFormFields(parsed, trimester, type);

        logger.info('[USG Reader] URL analysis complete', {
            type,
            trimester,
            hasGA: !!parsed.gestational_age?.weeks
        });

        res.json({
            success: true,
            data: {
                raw: parsed,
                formData: formData,
                type: type,
                trimester: trimester,
                confidence: calculateConfidence(parsed)
            }
        });

    } catch (error) {
        logger.error('[USG Reader] URL analysis error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to analyze image: ' + error.message
        });
    }
});

module.exports = router;
