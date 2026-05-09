/**
 * Patient Questions Route - Tanya Dokter
 * Q&A feature between patients and doctor
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const NodeCache = require('node-cache');
const { verifyToken, verifyPatientToken } = require('../middleware/auth');

// Short-lived cache for badge count (polled every ~10s by staff panel)
const pqCountCache = new NodeCache({ stdTTL: 30, checkperiod: 10, useClones: false });
const multer = require('multer');
const r2Storage = require('../services/r2Storage');
const { generateId } = require('../utils/idGenerator');
const whatsappService = require('../services/whatsappService');

const TANYA_WA_NOTIFY_ENABLED = process.env.TANYA_WA_NOTIFY_ENABLED === 'true';
const TANYA_WA_DOCTOR_PHONE = process.env.TANYA_WA_DOCTOR_PHONE || '';
const TANYA_WA_DOCTOR_USER_ID = process.env.TANYA_WA_DOCTOR_USER_ID || '';
const TANYA_WA_WEBHOOK_SECRET = process.env.TANYA_WA_WEBHOOK_SECRET || '';
const STAFF_PANEL_URL = process.env.STAFF_PANEL_URL || 'https://dokterdibya.com/staff/public/index-adminlte.html';

// Multer setup for image upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Middleware: Only dokter can reply/close
const requireDokter = (req, res, next) => {
    if (req.user.role !== 'dokter') {
        return res.status(403).json({
            success: false,
            message: 'Hanya dokter yang dapat menjawab pertanyaan'
        });
    }
    next();
};

// Helper: Generate question ID
function generateQuestionId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `QST${timestamp}${random}`;
}

function truncateForWhatsApp(text, maxLen = 700) {
    const content = String(text || '').trim();
    if (!content) return '-';
    if (content.length <= maxLen) return content;
    return `${content.slice(0, maxLen - 3)}...`;
}

// Helper: Check if patient can ask new question
async function canAskNewQuestion(patientId) {
    try {
        // 1. Get subscription tier
        const [subscriptions] = await db.query(
            `SELECT tier, questions_per_week, is_active, expires_at
             FROM tanya_subscriptions
             WHERE patient_id = ? AND is_active = TRUE
             AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY created_at DESC LIMIT 1`,
            [patientId]
        );

        const sub = subscriptions[0];
        const questionsPerWeek = sub?.questions_per_week || 1; // Default free tier
        const tier = sub?.tier || 'free';

        // 2. Check if has open thread (not closed)
        const [openThreads] = await db.query(
            `SELECT id FROM patient_questions
             WHERE patient_id = ? AND status != 'closed'`,
            [patientId]
        );

        if (openThreads.length > 0) {
            return {
                canAsk: false,
                reason: 'thread_open',
                openThreadId: openThreads[0].id,
                tier,
                limit: questionsPerWeek
            };
        }

        // 3. Count questions this week (rolling 7 days)
        const [weeklyCount] = await db.query(
            `SELECT COUNT(*) as count FROM patient_questions
             WHERE patient_id = ?
             AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
            [patientId]
        );

        const used = weeklyCount[0].count;

        if (used >= questionsPerWeek) {
            // Find oldest question this week to calculate next available
            const [oldest] = await db.query(
                `SELECT created_at FROM patient_questions
                 WHERE patient_id = ?
                 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                 ORDER BY created_at ASC LIMIT 1`,
                [patientId]
            );

            const nextAvailable = oldest[0]
                ? new Date(oldest[0].created_at.getTime() + 7 * 24 * 60 * 60 * 1000)
                : null;

            return {
                canAsk: false,
                reason: 'weekly_quota',
                used,
                limit: questionsPerWeek,
                tier,
                nextAvailable
            };
        }

        return {
            canAsk: true,
            used,
            limit: questionsPerWeek,
            tier,
            remaining: questionsPerWeek - used
        };
    } catch (error) {
        console.error('Error checking quota:', error);
        throw error;
    }
}

// ==================== PATIENT ENDPOINTS ====================

/**
 * GET /api/patient-questions/can-ask
 * Check if patient can submit new question
 */
router.get('/can-ask', verifyPatientToken, async (req, res) => {
    try {
        const result = await canAskNewQuestion(req.patient.id);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error checking can-ask:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * GET /api/patient-questions
 * Get patient's own questions with replies
 */
router.get('/', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient.id;

        // Get all questions for this patient with doctor info
        const [questions] = await db.query(
            `SELECT pq.*,
                    u.name as doctor_name,
                    u.specialty as doctor_specialty,
                    u.specialty_label as doctor_specialty_label,
                    (SELECT COUNT(*) FROM question_replies WHERE question_id = pq.id) as reply_count,
                    (SELECT MAX(created_at) FROM question_replies WHERE question_id = pq.id) as last_reply_at
             FROM patient_questions pq
             LEFT JOIN users u ON pq.assigned_doctor_id = u.new_id
             WHERE pq.patient_id = ?
             ORDER BY pq.created_at DESC`,
            [patientId]
        );

        // Get replies for each question with actual doctor name
        for (const question of questions) {
            const doctorName = question.doctor_name || 'Dokter';
            const [replies] = await db.query(
                `SELECT qr.*,
                        CASE WHEN qr.sender_type = 'doctor' THEN ? ELSE 'Anda' END as sender_name
                 FROM question_replies qr
                 WHERE qr.question_id = ?
                 ORDER BY qr.created_at ASC`,
                [doctorName, question.id]
            );
            question.replies = replies;
        }

        // Get quota info
        const quota = await canAskNewQuestion(patientId);

        res.json({
            success: true,
            questions,
            quota
        });
    } catch (error) {
        console.error('Error getting patient questions:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * POST /api/patient-questions
 * Submit new question
 */
router.post('/', verifyPatientToken, upload.single('image'), async (req, res) => {
    try {
        const patientId = req.patient.id;
        const { question_text, doctor_id } = req.body;

        // Validate question text
        if (!question_text || question_text.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Pertanyaan tidak boleh kosong'
            });
        }

        if (question_text.length > 2000) {
            return res.status(400).json({
                success: false,
                message: 'Pertanyaan terlalu panjang (maksimal 2000 karakter)'
            });
        }

        // Validate doctor_id if provided
        let assignedDoctorId = null;
        let specialtyRequested = null;

        if (doctor_id) {
            const [doctors] = await db.query(
                `SELECT new_id, name, specialty, specialty_label
                 FROM users
                 WHERE new_id = ? AND role = 'dokter' AND is_available_for_qa = 1`,
                [doctor_id]
            );

            if (doctors.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Dokter tidak tersedia untuk konsultasi'
                });
            }

            assignedDoctorId = doctors[0].new_id;
            specialtyRequested = doctors[0].specialty;
        } else {
            // If no doctor specified, assign to default (first available)
            const [defaultDoctors] = await db.query(
                `SELECT new_id, specialty FROM users
                 WHERE role = 'dokter' AND is_available_for_qa = 1
                 ORDER BY name ASC LIMIT 1`
            );

            if (defaultDoctors.length > 0) {
                assignedDoctorId = defaultDoctors[0].new_id;
                specialtyRequested = defaultDoctors[0].specialty;
            }
        }

        // Check quota
        const quota = await canAskNewQuestion(patientId);
        if (!quota.canAsk) {
            let message = 'Anda tidak dapat mengajukan pertanyaan saat ini.';
            if (quota.reason === 'thread_open') {
                message = 'Anda masih memiliki percakapan yang belum selesai.';
            } else if (quota.reason === 'weekly_quota') {
                message = `Kuota pertanyaan minggu ini sudah habis (${quota.used}/${quota.limit}). `;
                if (quota.nextAvailable) {
                    message += `Anda dapat bertanya lagi pada ${new Date(quota.nextAvailable).toLocaleDateString('id-ID')}.`;
                }
            }
            return res.status(400).json({ success: false, message });
        }

        // Generate question ID
        const questionId = generateQuestionId();

        // Upload image if provided
        let imageUrl = null;
        if (req.file) {
            const filename = `q_${Date.now()}.${req.file.mimetype.split('/')[1]}`;
            const uploadResult = await r2Storage.uploadFile(
                req.file.buffer,
                filename,
                req.file.mimetype,
                `patient-questions/${questionId}`
            );
            imageUrl = uploadResult.key;
        }

        // Insert question with doctor assignment
        await db.query(
            `INSERT INTO patient_questions (id, patient_id, question_text, image_url, status, assigned_doctor_id, specialty_requested, created_at)
             VALUES (?, ?, ?, ?, 'open', ?, ?, NOW())`,
            [questionId, patientId, question_text.trim(), imageUrl, assignedDoctorId, specialtyRequested]
        );

        // Send notification to assigned doctor
        try {
            const [patient] = await db.query(
                'SELECT COALESCE(full_name, name) as patient_name FROM patients WHERE id = ?',
                [patientId]
            );
            const patientName = patient[0]?.patient_name || `Patient ${patientId}`;

            console.log(`New question from ${patientName}: ${questionId} -> Doctor: ${assignedDoctorId}`);

            if (TANYA_WA_NOTIFY_ENABLED && TANYA_WA_DOCTOR_PHONE) {
                const [doctorRows] = await db.query(
                    'SELECT name FROM users WHERE new_id = ? LIMIT 1',
                    [assignedDoctorId]
                );
                const doctorName = doctorRows[0]?.name || 'Dokter';
                const questionPreview = truncateForWhatsApp(question_text, 650);

                const waMessage = `📩 *Tanya Dokter Baru*\n\n` +
                    `ID: ${questionId}\n` +
                    `Pasien: ${patientName}\n` +
                    `Dokter: ${doctorName}\n\n` +
                    `Pertanyaan:\n${questionPreview}\n\n` +
                    `Balas dari WhatsApp dengan format:\n` +
                    `${questionId}: [jawaban Anda]\n\n` +
                    `Buka panel staff:\n${STAFF_PANEL_URL}`;

                const waResult = await whatsappService.sendAuto(TANYA_WA_DOCTOR_PHONE, waMessage);
                if (!waResult.success) {
                    const waLink = whatsappService.generateWaLink(TANYA_WA_DOCTOR_PHONE, waMessage);
                    console.warn('Tanya Dokter WhatsApp auto-send failed, use manual link:', waLink || '(link unavailable)');
                }
            }
        } catch (e) {
            console.error('Error sending notification:', e);
        }

        res.json({
            success: true,
            message: 'Pertanyaan berhasil dikirim',
            questionId,
            assignedDoctorId,
            quota: await canAskNewQuestion(patientId)
        });
    } catch (error) {
        console.error('Error submitting question:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * GET /api/patient-questions/:id
 * Get question detail (patient can only view their own)
 */
router.get('/:id', verifyPatientToken, async (req, res) => {
    try {
        const questionId = req.params.id;
        const patientId = req.patient.id;

        const [questions] = await db.query(
            `SELECT pq.*,
                    u.name as doctor_name,
                    u.specialty as doctor_specialty,
                    u.specialty_label as doctor_specialty_label
             FROM patient_questions pq
             LEFT JOIN users u ON pq.assigned_doctor_id = u.new_id
             WHERE pq.id = ? AND pq.patient_id = ?`,
            [questionId, patientId]
        );

        if (questions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pertanyaan tidak ditemukan'
            });
        }

        const question = questions[0];
        const doctorName = question.doctor_name || 'Dokter';

        // Get replies with actual doctor name
        const [replies] = await db.query(
            `SELECT qr.*,
                    CASE WHEN qr.sender_type = 'doctor' THEN ? ELSE 'Anda' END as sender_name
             FROM question_replies qr
             WHERE qr.question_id = ?
             ORDER BY qr.created_at ASC`,
            [doctorName, questionId]
        );

        question.replies = replies;

        // Get signed URLs for images
        if (question.image_url) {
            question.image_signed_url = await r2Storage.getSignedDownloadUrl(question.image_url, 3600);
        }
        for (const reply of question.replies) {
            if (reply.image_url) {
                reply.image_signed_url = await r2Storage.getSignedDownloadUrl(reply.image_url, 3600);
            }
        }

        res.json({ success: true, question });
    } catch (error) {
        console.error('Error getting question detail:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==================== STAFF ENDPOINTS ====================

/**
 * GET /api/patient-questions/all
 * Get all questions (staff view)
 * Dokter users only see their assigned questions
 */
router.get('/staff/all', verifyToken, async (req, res) => {
    try {
        const { status, search, doctor_id, page = 1, limit } = req.query;
        const parsedPage = Math.max(1, parseInt(page, 10) || 1);
        const parsedLimit = (limit === undefined || limit === null || limit === '' || String(limit).toLowerCase() === 'all')
            ? null
            : Math.max(1, parseInt(limit, 10) || 1);
        const offset = parsedLimit ? (parsedPage - 1) * parsedLimit : 0;
        const currentUser = req.user;

        let whereClause = '1=1';
        const params = [];

        // If current user is dokter (not superadmin), only show their assigned questions
        if (currentUser.role === 'dokter' && !currentUser.is_superadmin) {
            whereClause += ' AND pq.assigned_doctor_id = ?';
            params.push(currentUser.new_id);
        } else if (doctor_id) {
            // Superadmin/other staff can filter by doctor
            whereClause += ' AND pq.assigned_doctor_id = ?';
            params.push(doctor_id);
        }

        if (status && status !== 'all') {
            whereClause += ' AND pq.status = ?';
            params.push(status);
        }

        if (search) {
            whereClause += ' AND (p.full_name LIKE ? OR pq.question_text LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Get questions with patient info, subscription tier, and doctor info
        const questionsQuery = `SELECT pq.*,
                    p.full_name as patient_name,
                    p.birth_date,
                    COALESCE(ts.tier, 'free') as subscription_tier,
                    u.name as doctor_name,
                    u.specialty as doctor_specialty,
                    u.specialty_label as doctor_specialty_label,
                    (SELECT COUNT(*) FROM question_replies WHERE question_id = pq.id) as reply_count,
                    (SELECT MAX(created_at) FROM question_replies WHERE question_id = pq.id) as last_reply_at
             FROM patient_questions pq
             JOIN patients p ON pq.patient_id = p.id
             LEFT JOIN tanya_subscriptions ts ON pq.patient_id = ts.patient_id AND ts.is_active = TRUE
             LEFT JOIN users u ON pq.assigned_doctor_id = u.new_id
             WHERE ${whereClause}
             ORDER BY
                 CASE pq.status
                     WHEN 'open' THEN 1
                     WHEN 'answered' THEN 2
                     WHEN 'closed' THEN 3
                 END,
                 pq.created_at DESC`;

        const questionsQueryWithLimit = parsedLimit
            ? `${questionsQuery}\n             LIMIT ? OFFSET ?`
            : questionsQuery;

        const questionsParams = parsedLimit
            ? [...params, parsedLimit, offset]
            : params;

        const [questions] = await db.query(questionsQueryWithLimit, questionsParams);

        // Get total count
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total
             FROM patient_questions pq
             JOIN patients p ON pq.patient_id = p.id
             WHERE ${whereClause}`,
            params
        );

        res.json({
            success: true,
            questions,
            pagination: {
                page: parsedPage,
                limit: parsedLimit,
                total: countResult[0].total,
                totalPages: parsedLimit ? Math.ceil(countResult[0].total / parsedLimit) : 1
            }
        });
    } catch (error) {
        console.error('Error getting all questions:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * GET /api/patient-questions/staff/count
 * Get unanswered questions count (for badge)
 */
router.get('/staff/count', verifyToken, async (req, res) => {
    try {
        const cached = pqCountCache.get('open-count');
        if (cached !== undefined) return res.json(cached);

        const [result] = await db.query(
            `SELECT COUNT(*) as count FROM patient_questions WHERE status = 'open'`
        );
        const response = { success: true, count: result[0].count };
        pqCountCache.set('open-count', response);
        res.json(response);
    } catch (error) {
        console.error('Error getting count:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * GET /api/patient-questions/staff/:id
 * Get question detail with patient info (staff view)
 */
router.get('/staff/:id', verifyToken, async (req, res) => {
    try {
        const questionId = req.params.id;

        const [questions] = await db.query(
            `SELECT pq.*,
                    p.full_name as patient_name,
                    p.birth_date,
                    p.phone,
                    p.email,
                    COALESCE(ts.tier, 'free') as subscription_tier,
                    u.name as doctor_name,
                    u.specialty as doctor_specialty,
                    u.specialty_label as doctor_specialty_label
             FROM patient_questions pq
             JOIN patients p ON pq.patient_id = p.id
             LEFT JOIN tanya_subscriptions ts ON pq.patient_id = ts.patient_id AND ts.is_active = TRUE
             LEFT JOIN users u ON pq.assigned_doctor_id = u.new_id
             WHERE pq.id = ?`,
            [questionId]
        );

        if (questions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pertanyaan tidak ditemukan'
            });
        }

        const question = questions[0];
        const doctorName = question.doctor_name || 'Dokter';

        // Get replies with actual doctor name
        const [replies] = await db.query(
            `SELECT qr.*,
                    CASE
                        WHEN qr.sender_type = 'doctor' THEN ?
                        ELSE (SELECT full_name FROM patients WHERE id = qr.sender_id)
                    END as sender_name
             FROM question_replies qr
             WHERE qr.question_id = ?
             ORDER BY qr.created_at ASC`,
            [doctorName, questionId]
        );

        question.replies = replies;

        // Get signed URLs for images
        if (question.image_url) {
            question.image_signed_url = await r2Storage.getSignedDownloadUrl(question.image_url, 3600);
        }
        for (const reply of replies) {
            if (reply.image_url) {
                reply.image_signed_url = await r2Storage.getSignedDownloadUrl(reply.image_url, 3600);
            }
        }

        // Get patient's obstetric info if available
        try {
            const [records] = await db.query(
                `SELECT record_data FROM sunday_clinic_records
                 WHERE patient_id = ? AND record_type = 'anamnesa_obstetri'
                 ORDER BY created_at DESC LIMIT 1`,
                [question.patient_id]
            );

            if (records.length > 0 && records[0].record_data) {
                const data = JSON.parse(records[0].record_data);
                question.obstetric_info = {
                    gravida: data.gravida,
                    para: data.para,
                    abortus: data.abortus
                };
            }
        } catch (e) {
            // Ignore if no obstetric data
        }

        res.json({ success: true, question });
    } catch (error) {
        console.error('Error getting question detail:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * POST /api/patient-questions/staff/:id/reply
 * Doctor sends reply (DOKTER ONLY)
 * Only assigned doctor (or superadmin) can reply
 */
router.post('/staff/:id/reply', verifyToken, requireDokter, upload.single('image'), async (req, res) => {
    try {
        const questionId = req.params.id;
        const currentUser = req.user;
        const { message } = req.body;

        // Validate
        if (!message || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Balasan tidak boleh kosong'
            });
        }

        // Check question exists and get doctor info
        const [questions] = await db.query(
            `SELECT pq.*, u.name as doctor_name
             FROM patient_questions pq
             LEFT JOIN users u ON pq.assigned_doctor_id = u.new_id
             WHERE pq.id = ?`,
            [questionId]
        );

        if (questions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pertanyaan tidak ditemukan'
            });
        }

        const question = questions[0];

        // Check if current user is assigned doctor or superadmin
        const currentUserId = currentUser.new_id || currentUser.id;
        if (!currentUser.is_superadmin && question.assigned_doctor_id !== currentUserId) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak dapat membalas pertanyaan ini. Pertanyaan ditujukan untuk dokter lain.'
            });
        }

        if (question.status === 'closed') {
            return res.status(400).json({
                success: false,
                message: 'Thread sudah ditutup'
            });
        }

        // Upload image if provided
        let imageUrl = null;
        if (req.file) {
            const filename = `r_${Date.now()}.${req.file.mimetype.split('/')[1]}`;
            const uploadResult = await r2Storage.uploadFile(
                req.file.buffer,
                filename,
                req.file.mimetype,
                `patient-questions/${questionId}`
            );
            imageUrl = uploadResult.key;
        }

        // Insert reply - use new_id if available, fallback to id
        const senderId = currentUser.new_id || currentUser.id;
        await db.query(
            `INSERT INTO question_replies (question_id, sender_type, sender_id, message, image_url, created_at)
             VALUES (?, 'doctor', ?, ?, ?, NOW())`,
            [questionId, senderId, message.trim(), imageUrl]
        );

        // Update question status to answered
        if (question.status === 'open') {
            await db.query(
                `UPDATE patient_questions SET status = 'answered' WHERE id = ?`,
                [questionId]
            );
        }

        // Send push notification to patient with actual doctor name
        const doctorName = question.doctor_name || currentUser.name || 'Dokter';
        try {
            await db.query(
                `INSERT INTO patient_notifications (patient_id, type, title, message, link, created_at)
                 VALUES (?, 'system', ?, 'Pertanyaan Anda telah dijawab. Tap untuk melihat.', ?, NOW())`,
                [question.patient_id, `${doctorName} Menjawab`, `/tanya-dokter.html?questionId=${encodeURIComponent(questionId)}`]
            );
        } catch (e) {
            console.error('Error creating notification:', e);
        }

        res.json({
            success: true,
            message: 'Balasan berhasil dikirim'
        });
    } catch (error) {
        console.error('Error sending reply:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * POST /api/patient-questions/staff/:id/close
 * Close thread (DOKTER ONLY)
 * Only assigned doctor (or superadmin) can close
 */
router.post('/staff/:id/close', verifyToken, requireDokter, async (req, res) => {
    try {
        const questionId = req.params.id;
        const currentUser = req.user;

        // Check question exists with doctor info
        const [questions] = await db.query(
            `SELECT pq.*, u.name as doctor_name
             FROM patient_questions pq
             LEFT JOIN users u ON pq.assigned_doctor_id = u.new_id
             WHERE pq.id = ?`,
            [questionId]
        );

        if (questions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pertanyaan tidak ditemukan'
            });
        }

        const question = questions[0];

        // Check if current user is assigned doctor or superadmin
        const currentUserId = currentUser.new_id || currentUser.id;
        if (!currentUser.is_superadmin && question.assigned_doctor_id !== currentUserId) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak dapat menutup pertanyaan ini. Pertanyaan ditujukan untuk dokter lain.'
            });
        }

        if (question.status === 'closed') {
            return res.status(400).json({
                success: false,
                message: 'Thread sudah ditutup'
            });
        }

        // Close the thread
        await db.query(
            `UPDATE patient_questions SET status = 'closed', closed_at = NOW() WHERE id = ?`,
            [questionId]
        );

        // Notify patient with actual doctor name
        const doctorName = question.doctor_name || currentUser.name || 'Dokter';
        try {
            await db.query(
                `INSERT INTO patient_notifications (patient_id, type, title, message, link, created_at)
                 VALUES (?, 'system', 'Percakapan Selesai', ?, ?, NOW())`,
                [question.patient_id, `Percakapan Anda dengan ${doctorName} telah selesai. Anda dapat mengajukan pertanyaan baru.`, `/tanya-dokter.html?questionId=${encodeURIComponent(questionId)}`]
            );
        } catch (e) {
            console.error('Error creating notification:', e);
        }

        res.json({
            success: true,
            message: 'Thread berhasil ditutup'
        });
    } catch (error) {
        console.error('Error closing thread:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * POST /api/patient-questions/whatsapp/webhook
 * Inbound WhatsApp webhook for doctor reply.
 * Expected message format: QSTXXXX: isi jawaban
 */
router.get('/whatsapp/webhook', async (req, res) => {
    try {
        if (!TANYA_WA_NOTIFY_ENABLED) {
            return res.status(503).json({ success: false, message: 'WhatsApp integration disabled' });
        }

        if (TANYA_WA_WEBHOOK_SECRET) {
            const incomingSecret = req.headers['x-tanya-wa-secret'] || req.query.secret;
            if (incomingSecret !== TANYA_WA_WEBHOOK_SECRET) {
                return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
            }
        }

        return res.json({
            success: true,
            message: 'WhatsApp webhook endpoint active. Use POST with payload message format: QSTXXXX: isi jawaban.'
        });
    } catch (error) {
        console.error('Error checking WhatsApp webhook:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/whatsapp/webhook', async (req, res) => {
    try {
        if (!TANYA_WA_NOTIFY_ENABLED) {
            return res.status(503).json({ success: false, message: 'WhatsApp integration disabled' });
        }

        if (TANYA_WA_WEBHOOK_SECRET) {
            const incomingSecret = req.headers['x-tanya-wa-secret'] || req.query.secret || req.body.secret;
            if (incomingSecret !== TANYA_WA_WEBHOOK_SECRET) {
                return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
            }
        }

        const rawFrom = req.body.sender || req.body.from || req.body.number || req.body.phone || '';
        const rawText = req.body.message || req.body.text || req.body.body || req.body.chat || '';
        const text = String(rawText || '').trim();

        if (!text) {
            return res.status(400).json({ success: false, message: 'Empty message payload' });
        }

        const expectedPhone = whatsappService.formatPhoneNumber(TANYA_WA_DOCTOR_PHONE || '');
        const incomingPhone = whatsappService.formatPhoneNumber(String(rawFrom || ''));
        if (expectedPhone && incomingPhone && expectedPhone !== incomingPhone) {
            return res.status(403).json({ success: false, message: 'Sender phone not allowed' });
        }

        const match = text.match(/(QST[A-Z0-9]+)\s*[:\-]\s*([\s\S]+)/i);
        if (!match) {
            return res.status(400).json({
                success: false,
                message: 'Invalid format. Use: QSTXXXX: isi jawaban'
            });
        }

        const questionId = match[1].toUpperCase();
        const replyMessage = String(match[2] || '').trim();
        if (!replyMessage) {
            return res.status(400).json({ success: false, message: 'Reply message is empty' });
        }

        const [questions] = await db.query(
            `SELECT pq.id, pq.patient_id, pq.status, pq.assigned_doctor_id,
                    u.name as assigned_doctor_name
             FROM patient_questions pq
             LEFT JOIN users u ON pq.assigned_doctor_id = u.new_id
             WHERE pq.id = ?`,
            [questionId]
        );

        if (questions.length === 0) {
            return res.status(404).json({ success: false, message: 'Question not found' });
        }

        const question = questions[0];
        if (question.status === 'closed') {
            return res.status(400).json({ success: false, message: 'Thread already closed' });
        }

        const senderDoctorId = question.assigned_doctor_id || TANYA_WA_DOCTOR_USER_ID;
        if (!senderDoctorId) {
            return res.status(400).json({ success: false, message: 'No doctor mapping found for this question' });
        }

        const [doctorRows] = await db.query(
            `SELECT new_id, name
             FROM users
             WHERE new_id = ? AND role = 'dokter'
             LIMIT 1`,
            [senderDoctorId]
        );

        if (doctorRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Doctor user not found' });
        }

        const doctor = doctorRows[0];

        await db.query(
            `INSERT INTO question_replies (question_id, sender_type, sender_id, message, image_url, created_at)
             VALUES (?, 'doctor', ?, ?, NULL, NOW())`,
            [questionId, doctor.new_id, replyMessage]
        );

        if (question.status === 'open') {
            await db.query(
                `UPDATE patient_questions SET status = 'answered' WHERE id = ?`,
                [questionId]
            );
        }

        await db.query(
            `INSERT INTO patient_notifications (patient_id, type, title, message, link, created_at)
             VALUES (?, 'system', ?, 'Pertanyaan Anda telah dijawab. Tap untuk melihat.', ?, NOW())`,
            [question.patient_id, `${doctor.name || 'Dokter'} Menjawab`, `/tanya-dokter.html?questionId=${encodeURIComponent(questionId)}`]
        );

        res.json({
            success: true,
            message: 'Reply accepted from WhatsApp webhook',
            questionId
        });
    } catch (error) {
        console.error('Error processing WhatsApp webhook:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
