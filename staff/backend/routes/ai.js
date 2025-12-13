/**
 * AI Routes
 * API endpoints for AI-powered features
 */

const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const { verifyToken } = require('../middleware/auth');

/**
 * POST /api/ai/demo/detect-category
 * PUBLIC DEMO - Smart triage without auth (for testing only)
 */
router.post('/api/ai/demo/detect-category', async (req, res) => {
    try {
        const { patientId, complaint, intakeData } = req.body;

        if (!patientId || !complaint) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID and complaint are required'
            });
        }

        const result = await aiService.detectVisitCategory({
            patientId,
            complaint,
            intakeData: intakeData || {}
        });

        res.json(result);

    } catch (error) {
        console.error('AI Detection API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to detect category',
            error: error.message
        });
    }
});

/**
 * POST /api/ai/detect-category
 * Smart triage - detect visit category from complaint (requires auth)
 *
 * Body: {
 *   patientId: string,
 *   complaint: string,
 *   intakeData: object (optional)
 * }
 */
router.post('/api/ai/detect-category', verifyToken, async (req, res) => {
    try {
        const { patientId, complaint, intakeData } = req.body;

        if (!patientId || !complaint) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID and complaint are required'
            });
        }

        const result = await aiService.detectVisitCategory({
            patientId,
            complaint,
            intakeData: intakeData || {}
        });

        res.json(result);

    } catch (error) {
        console.error('AI Detection API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to detect category',
            error: error.message
        });
    }
});

/**
 * GET /api/ai/summary/:patientId
 * Generate medical record summary for patient
 */
router.get('/api/ai/summary/:patientId', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;

        const result = await aiService.generateMedicalSummary(patientId);

        res.json(result);

    } catch (error) {
        console.error('AI Summary API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate summary',
            error: error.message
        });
    }
});

/**
 * POST /api/ai/validate-anamnesa
 * Validate anamnesa data consistency
 *
 * Body: {
 *   anamnesaData: object,
 *   category: string
 * }
 */
router.post('/api/ai/validate-anamnesa', verifyToken, async (req, res) => {
    try {
        const { anamnesaData, category } = req.body;

        if (!anamnesaData || !category) {
            return res.status(400).json({
                success: false,
                message: 'Anamnesa data and category are required'
            });
        }

        const result = await aiService.validateAnamnesa(anamnesaData, category);

        res.json(result);

    } catch (error) {
        console.error('AI Validation API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate anamnesa',
            error: error.message
        });
    }
});

/**
 * POST /api/ai/chatbot
 * Patient chatbot for common questions
 *
 * Body: {
 *   question: string,
 *   patientId: string (optional)
 * }
 */
router.post('/api/ai/chatbot', async (req, res) => {
    try {
        const { question, patientId } = req.body;

        if (!question) {
            return res.status(400).json({
                success: false,
                message: 'Question is required'
            });
        }

        const result = await aiService.chatbotResponse(question, patientId);

        res.json(result);

    } catch (error) {
        console.error('Chatbot API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Chatbot error',
            error: error.message
        });
    }
});

/**
 * POST /api/ai/demo/interview/questions
 * PUBLIC DEMO - Generate questions without auth
 */
router.post('/api/ai/demo/interview/questions', async (req, res) => {
    try {
        const { category, complaint, patientData } = req.body;

        if (!category || !complaint) {
            return res.status(400).json({
                success: false,
                message: 'Category and complaint are required'
            });
        }

        const result = await aiService.generateInterviewQuestions(
            category,
            complaint,
            patientData || {}
        );

        res.json(result);

    } catch (error) {
        console.error('AI Interview Questions API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate interview questions',
            error: error.message
        });
    }
});

/**
 * POST /api/ai/interview/questions
 * Generate smart interview questions based on category (requires auth)
 *
 * Body: {
 *   category: string,
 *   complaint: string,
 *   patientData: object (optional)
 * }
 */
router.post('/api/ai/interview/questions', verifyToken, async (req, res) => {
    try {
        const { category, complaint, patientData } = req.body;

        if (!category || !complaint) {
            return res.status(400).json({
                success: false,
                message: 'Category and complaint are required'
            });
        }

        const result = await aiService.generateInterviewQuestions(
            category,
            complaint,
            patientData || {}
        );

        res.json(result);

    } catch (error) {
        console.error('AI Interview Questions API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate interview questions',
            error: error.message
        });
    }
});

/**
 * POST /api/ai/demo/interview/process
 * PUBLIC DEMO - Process answers without auth
 */
router.post('/api/ai/demo/interview/process', async (req, res) => {
    try {
        const { category, complaint, answers } = req.body;

        if (!category || !complaint || !answers) {
            return res.status(400).json({
                success: false,
                message: 'Category, complaint, and answers are required'
            });
        }

        const result = await aiService.processInterviewAnswers(
            category,
            complaint,
            answers
        );

        res.json(result);

    } catch (error) {
        console.error('AI Process Interview API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process interview answers',
            error: error.message
        });
    }
});

/**
 * POST /api/ai/interview/process
 * Process interview answers and generate pre-anamnesa (requires auth)
 *
 * Body: {
 *   category: string,
 *   complaint: string,
 *   answers: [{question: string, answer: string}]
 * }
 */
router.post('/api/ai/interview/process', verifyToken, async (req, res) => {
    try {
        const { category, complaint, answers } = req.body;

        if (!category || !complaint || !answers) {
            return res.status(400).json({
                success: false,
                message: 'Category, complaint, and answers are required'
            });
        }

        const result = await aiService.processInterviewAnswers(
            category,
            complaint,
            answers
        );

        res.json(result);

    } catch (error) {
        console.error('AI Process Interview API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process interview answers',
            error: error.message
        });
    }
});

/**
 * GET /api/ai/daily-greeting
 * Generate daily motivational greeting using AI
 * Cached per user per day (changes at midnight)
 *
 * Returns: {
 *   success: boolean,
 *   data: {
 *     greeting: string,
 *     day: string,
 *     time: string,
 *     cachedUntil: string (ISO date)
 *   }
 * }
 */
router.get('/api/ai/daily-greeting', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const userName = req.user.name || req.user.email;
        const roleName = req.user.role_display_name || req.user.role || 'Staff';

        // Check cache first (stored in memory with date key)
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const cacheKey = `greeting_${userId}_${today}`;

        // Simple in-memory cache (consider Redis for production scaling)
        if (!global.greetingCache) {
            global.greetingCache = new Map();
        }

        // Clean old cache entries (older than today)
        for (const [key, value] of global.greetingCache.entries()) {
            if (!key.includes(today)) {
                global.greetingCache.delete(key);
            }
        }

        // Return cached greeting if exists
        if (global.greetingCache.has(cacheKey)) {
            const cached = global.greetingCache.get(cacheKey);
            return res.json({
                success: true,
                data: {
                    ...cached,
                    cached: true
                }
            });
        }

        // Generate new greeting
        const result = await aiService.generateDailyGreeting({
            userId,
            userName,
            roleName
        });

        if (result.success) {
            // Calculate midnight for cache expiry
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);

            const greetingData = {
                greeting: result.data.greeting,
                day: result.data.day,
                time: result.data.time,
                isWeekend: result.data.isWeekend,
                cachedUntil: tomorrow.toISOString(),
                generatedAt: new Date().toISOString()
            };

            // Cache for today
            global.greetingCache.set(cacheKey, greetingData);

            return res.json({
                success: true,
                data: {
                    ...greetingData,
                    cached: false
                },
                tokensUsed: result.tokensUsed
            });
        }

        res.json(result);

    } catch (error) {
        console.error('AI Daily Greeting API Error:', error);
        // Return fallback greeting on error
        res.json({
            success: true,
            data: {
                greeting: 'Selamat bekerja, semoga harimu menyenangkan!',
                fallback: true
            }
        });
    }
});

module.exports = router;
