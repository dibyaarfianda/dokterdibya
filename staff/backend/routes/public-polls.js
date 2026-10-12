'use strict';

/**
 * Public anonymous polls (sisiwanita.id/polling.html?p=<slug>).
 *
 * Public endpoints need no login. Each poll accepts one response per IP
 * (or per device token when the admin turns one_per_ip off, e.g. for a
 * clinic waiting room where everybody shares one WiFi IP).
 *
 * Admin endpoints live under /admin and are dokter/superadmin only.
 */

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const sharp = require('sharp');
const db = require('../db');
const logger = require('../utils/logger');
const { verifyStaffToken, requireSuperadmin } = require('../middleware/auth');
const { getRequestIp } = require('../utils/patientAccessBlocklist');
const { validateOperationalSchemaScope } = require('../services/OperationalSchemaValidator');
const PublicPollClassifier = require('../services/PublicPollClassifier');

const router = express.Router();

const ANSWER_TYPES = ['text', 'single', 'multiple'];
const STATUSES = ['draft', 'active', 'closed'];
const MAX_ANSWER_LENGTH = 1000;
const MIN_ANSWER_LENGTH = 2;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const RESERVED_SLUGS = new Set(['admin']);
const PUBLIC_BASE_URL = (process.env.PUBLIC_POLL_BASE_URL || 'https://sisiwanita.id').replace(/\/+$/, '');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
        return cb(new Error('Format gambar harus JPG, PNG, WEBP, atau GIF'));
    }
});

const submitLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getRequestIp(req) || req.ip,
    message: { success: false, message: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.' }
});

function noStore(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

function parseJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function normalizeOptions(options) {
    const seen = new Set();
    return (Array.isArray(options) ? options : [])
        .map((entry) => String(entry || '').trim().slice(0, 200))
        .filter((entry) => {
            const key = entry.toLowerCase();
            if (!entry || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 20);
}

function normalizeCategories(categories) {
    return (Array.isArray(categories) ? categories : [])
        .map((entry, index) => ({
            id: Number.isInteger(Number(entry?.id)) && Number(entry.id) > 0 ? Number(entry.id) : null,
            name: String(entry?.name || '').trim().slice(0, 150),
            description: String(entry?.description || '').trim().slice(0, 1000) || null,
            sort_order: index
        }))
        .filter((entry) => entry.name)
        .slice(0, 50);
}

function publicPollUrl(slug) {
    return `${PUBLIC_BASE_URL}/polling.html?p=${encodeURIComponent(slug)}`;
}

function serializePoll(row, { includeAdmin = false } = {}) {
    const poll = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        question: row.question,
        description: row.description,
        answer_type: row.answer_type,
        options: parseJsonArray(row.options_json),
        placeholder: row.placeholder,
        thank_you_message: row.thank_you_message,
        status: row.status,
        one_per_ip: Boolean(row.one_per_ip),
        has_image: Boolean(row.header_image_mime),
        image_version: row.header_image_updated_at ? new Date(row.header_image_updated_at).getTime() : null
    };
    if (includeAdmin) {
        poll.ai_instructions = row.ai_instructions;
        poll.public_url = publicPollUrl(row.slug);
        poll.created_at = row.created_at;
        poll.updated_at = row.updated_at;
        if (row.response_count !== undefined) poll.response_count = Number(row.response_count);
    }
    return poll;
}

const POLL_COLUMNS = `id, slug, title, question, description, answer_type, options_json, placeholder,
    thank_you_message, ai_instructions, header_image_mime, header_image_updated_at, status,
    one_per_ip, created_at, updated_at`;

async function ensureSchema(req, res, next) {
    try {
        await validateOperationalSchemaScope('publicPolls');
        return next();
    } catch (error) {
        logger.error('Public polls schema unavailable', { error: error.message });
        return res.status(503).json({ success: false, message: 'Fitur polling belum siap (migrasi database belum dijalankan).' });
    }
}

async function loadCategories(pollId) {
    const [rows] = await db.query(
        'SELECT id, name, description, sort_order FROM public_poll_categories WHERE poll_id = ? ORDER BY sort_order, id',
        [pollId]
    );
    return rows;
}

async function loadPollById(pollId) {
    const [rows] = await db.query(`SELECT ${POLL_COLUMNS} FROM public_polls WHERE id = ?`, [pollId]);
    return rows[0] || null;
}

// ==================== AI classification ====================

async function classifyResponse(responseId) {
    const [rows] = await db.query(
        `SELECT r.id, r.poll_id, r.answer_text, r.manual_override, p.question, p.ai_instructions, p.answer_type
         FROM public_poll_responses r JOIN public_polls p ON p.id = r.poll_id
         WHERE r.id = ?`,
        [responseId]
    );
    const row = rows[0];
    if (!row || row.manual_override) return;

    const answerText = String(row.answer_text || '').trim();
    if (row.answer_type !== 'text' || !answerText) {
        await db.query("UPDATE public_poll_responses SET ai_status = 'skipped' WHERE id = ?", [responseId]);
        return;
    }

    const categories = await loadCategories(row.poll_id);
    try {
        const result = await PublicPollClassifier.classifyAnswer({
            poll: { question: row.question, ai_instructions: row.ai_instructions },
            categories,
            answerText
        });
        await db.query(
            `UPDATE public_poll_responses
             SET category_ids = ?, ai_status = 'done', ai_confidence = ?, ai_reason = ?, ai_model = ?, classified_at = NOW()
             WHERE id = ? AND manual_override = 0`,
            [JSON.stringify(result.categoryIds), result.confidence, result.reason, result.model, responseId]
        );
    } catch (error) {
        logger.warn('Public poll classification failed', { responseId, code: error.code, error: error.message });
        await db.query(
            "UPDATE public_poll_responses SET ai_status = 'failed', ai_reason = ? WHERE id = ? AND manual_override = 0",
            [String(error.message || 'Gagal').slice(0, 500), responseId]
        );
    }
}

// Sequential background queue so a burst of QR scans doesn't fan out into
// dozens of parallel API calls.
const classifyQueue = [];
let classifyRunning = false;

function enqueueClassification(responseIds) {
    for (const id of responseIds) {
        if (!classifyQueue.includes(id)) classifyQueue.push(id);
    }
    if (classifyRunning) return;
    classifyRunning = true;
    setImmediate(async () => {
        try {
            while (classifyQueue.length) {
                const id = classifyQueue.shift();
                await classifyResponse(id).catch((error) => {
                    logger.error('Public poll classify worker error', { id, error: error.message });
                });
            }
        } finally {
            classifyRunning = false;
        }
    });
}

// ==================== ADMIN (dokter/superadmin) ====================

const adminGuard = [verifyStaffToken, requireSuperadmin, ensureSchema];

router.get('/admin/polls', adminGuard, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT ${POLL_COLUMNS.split(',').map((c) => `p.${c.trim()}`).join(', ')},
                    (SELECT COUNT(*) FROM public_poll_responses r WHERE r.poll_id = p.id) AS response_count
             FROM public_polls p ORDER BY p.created_at DESC`
        );
        res.json({
            success: true,
            ai_configured: PublicPollClassifier.isConfigured(),
            ai_model: PublicPollClassifier.getModel(),
            data: rows.map((row) => serializePoll(row, { includeAdmin: true }))
        });
    } catch (error) {
        logger.error('List public polls failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal memuat polling' });
    }
});

router.get('/admin/polls/:id', adminGuard, async (req, res) => {
    try {
        const row = await loadPollById(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: 'Polling tidak ditemukan' });
        const poll = serializePoll(row, { includeAdmin: true });
        poll.categories = await loadCategories(row.id);
        res.json({ success: true, data: poll });
    } catch (error) {
        logger.error('Get public poll failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal memuat polling' });
    }
});

function validatePollPayload(body) {
    const errors = [];
    const slug = String(body.slug || '').trim().toLowerCase();
    const title = String(body.title || '').trim();
    const question = String(body.question || '').trim();
    const answerType = String(body.answer_type || 'text');
    const status = String(body.status || 'draft');
    const options = normalizeOptions(body.options);

    if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
        errors.push('Kode link hanya huruf kecil, angka, dan tanda minus (2-63 karakter)');
    }
    if (!title) errors.push('Judul wajib diisi');
    if (!question) errors.push('Pertanyaan wajib diisi');
    if (!ANSWER_TYPES.includes(answerType)) errors.push('Tipe jawaban tidak valid');
    if (!STATUSES.includes(status)) errors.push('Status tidak valid');
    if (answerType !== 'text' && options.length < 2) errors.push('Minimal 2 opsi jawaban');

    return {
        errors,
        values: {
            slug,
            title: title.slice(0, 200),
            question: question.slice(0, 2000),
            description: String(body.description || '').trim().slice(0, 2000) || null,
            answer_type: answerType,
            options_json: answerType === 'text' ? null : JSON.stringify(options),
            placeholder: String(body.placeholder || '').trim().slice(0, 255) || null,
            thank_you_message: String(body.thank_you_message || '').trim().slice(0, 2000) || null,
            ai_instructions: String(body.ai_instructions || '').trim().slice(0, 2000) || null,
            status,
            one_per_ip: body.one_per_ip === false || body.one_per_ip === 0 || body.one_per_ip === '0' ? 0 : 1
        },
        categories: normalizeCategories(body.categories)
    };
}

async function saveCategories(conn, pollId, categories) {
    const [existing] = await conn.query('SELECT id FROM public_poll_categories WHERE poll_id = ?', [pollId]);
    const existingIds = new Set(existing.map((row) => row.id));
    const keptIds = new Set();

    for (const category of categories) {
        if (category.id && existingIds.has(category.id)) {
            await conn.query(
                'UPDATE public_poll_categories SET name = ?, description = ?, sort_order = ? WHERE id = ? AND poll_id = ?',
                [category.name, category.description, category.sort_order, category.id, pollId]
            );
            keptIds.add(category.id);
        } else {
            const [result] = await conn.query(
                'INSERT INTO public_poll_categories (poll_id, name, description, sort_order) VALUES (?, ?, ?, ?)',
                [pollId, category.name, category.description, category.sort_order]
            );
            keptIds.add(result.insertId);
        }
    }

    const removed = [...existingIds].filter((id) => !keptIds.has(id));
    if (removed.length) {
        await conn.query('DELETE FROM public_poll_categories WHERE poll_id = ? AND id IN (?)', [pollId, removed]);
    }
}

async function upsertPoll(req, res, pollId) {
    const { errors, values, categories } = validatePollPayload(req.body || {});
    if (errors.length) return res.status(400).json({ success: false, message: errors.join('. ') });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        let id = pollId;
        if (id) {
            const [result] = await conn.query(
                `UPDATE public_polls SET slug = ?, title = ?, question = ?, description = ?, answer_type = ?,
                    options_json = ?, placeholder = ?, thank_you_message = ?, ai_instructions = ?, status = ?, one_per_ip = ?
                 WHERE id = ?`,
                [values.slug, values.title, values.question, values.description, values.answer_type,
                    values.options_json, values.placeholder, values.thank_you_message, values.ai_instructions,
                    values.status, values.one_per_ip, id]
            );
            if (!result.affectedRows) {
                await conn.rollback();
                return res.status(404).json({ success: false, message: 'Polling tidak ditemukan' });
            }
        } else {
            const [result] = await conn.query(
                `INSERT INTO public_polls (slug, title, question, description, answer_type, options_json, placeholder,
                    thank_you_message, ai_instructions, status, one_per_ip, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [values.slug, values.title, values.question, values.description, values.answer_type,
                    values.options_json, values.placeholder, values.thank_you_message, values.ai_instructions,
                    values.status, values.one_per_ip, req.user?.id ? String(req.user.id) : null]
            );
            id = result.insertId;
        }
        await saveCategories(conn, id, categories);
        await conn.commit();

        const row = await loadPollById(id);
        const poll = serializePoll(row, { includeAdmin: true });
        poll.categories = await loadCategories(id);
        return res.json({ success: true, data: poll });
    } catch (error) {
        await conn.rollback().catch(() => {});
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Kode link sudah dipakai polling lain' });
        }
        logger.error('Save public poll failed', { error: error.message });
        return res.status(500).json({ success: false, message: 'Gagal menyimpan polling' });
    } finally {
        conn.release();
    }
}

router.post('/admin/polls', adminGuard, (req, res) => upsertPoll(req, res, null));
router.put('/admin/polls/:id', adminGuard, (req, res) => upsertPoll(req, res, Number(req.params.id)));

router.delete('/admin/polls/:id', adminGuard, async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM public_polls WHERE id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Polling tidak ditemukan' });
        res.json({ success: true });
    } catch (error) {
        logger.error('Delete public poll failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal menghapus polling' });
    }
});

router.post('/admin/polls/:id/image', adminGuard, (req, res, next) => {
    upload.single('image')(req, res, (error) => {
        if (error) return res.status(400).json({ success: false, message: error.message });
        return next();
    });
}, async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'File gambar belum dipilih' });
    try {
        const image = await sharp(req.file.buffer, { animated: false })
            .rotate()
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
        const [result] = await db.query(
            "UPDATE public_polls SET header_image = ?, header_image_mime = 'image/webp', header_image_updated_at = NOW() WHERE id = ?",
            [image, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Polling tidak ditemukan' });
        res.json({ success: true, bytes: image.length });
    } catch (error) {
        logger.error('Upload public poll image failed', { error: error.message });
        res.status(400).json({ success: false, message: 'Gambar tidak bisa diproses' });
    }
});

router.get('/admin/polls/:id/image', adminGuard, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT header_image, header_image_mime FROM public_polls WHERE id = ?', [req.params.id]);
        if (!rows[0] || !rows[0].header_image) return res.status(404).end();
        res.set('Content-Type', rows[0].header_image_mime || 'image/webp');
        res.set('Cache-Control', 'private, no-store');
        res.send(rows[0].header_image);
    } catch (error) {
        logger.error('Get admin public poll image failed', { error: error.message });
        res.status(500).end();
    }
});

router.delete('/admin/polls/:id/image', adminGuard, async (req, res) => {
    try {
        await db.query(
            'UPDATE public_polls SET header_image = NULL, header_image_mime = NULL, header_image_updated_at = NULL WHERE id = ?',
            [req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        logger.error('Delete public poll image failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal menghapus gambar' });
    }
});

router.get('/admin/polls/:id/qr.png', adminGuard, async (req, res) => {
    try {
        const row = await loadPollById(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: 'Polling tidak ditemukan' });
        const width = Math.min(Math.max(Number(req.query.size) || 1024, 256), 2048);
        const png = await QRCode.toBuffer(publicPollUrl(row.slug), {
            type: 'png', width, margin: 2, errorCorrectionLevel: 'M'
        });
        res.set('Content-Type', 'image/png');
        res.set('Content-Disposition', `attachment; filename="qr-polling-${row.slug}.png"`);
        res.send(png);
    } catch (error) {
        logger.error('Public poll QR failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal membuat QR code' });
    }
});

router.get('/admin/polls/:id/summary', adminGuard, async (req, res) => {
    try {
        const row = await loadPollById(req.params.id);
        if (!row) return res.status(404).json({ success: false, message: 'Polling tidak ditemukan' });
        const categories = await loadCategories(row.id);
        const [responses] = await db.query(
            'SELECT selected_options, category_ids, ai_status FROM public_poll_responses WHERE poll_id = ?',
            [row.id]
        );

        const statusCounts = { pending: 0, done: 0, failed: 0, skipped: 0 };
        const categoryCounts = new Map(categories.map((c) => [c.id, 0]));
        let uncategorized = 0;
        const optionCounts = new Map(parseJsonArray(row.options_json).map((option) => [option, 0]));

        for (const response of responses) {
            statusCounts[response.ai_status] = (statusCounts[response.ai_status] || 0) + 1;
            if (row.answer_type === 'text') {
                if (response.ai_status !== 'done') continue;
                const ids = parseJsonArray(response.category_ids).map(Number).filter((id) => categoryCounts.has(id));
                if (!ids.length) uncategorized += 1;
                ids.forEach((id) => categoryCounts.set(id, categoryCounts.get(id) + 1));
            } else {
                parseJsonArray(response.selected_options).forEach((option) => {
                    if (optionCounts.has(option)) optionCounts.set(option, optionCounts.get(option) + 1);
                });
            }
        }

        const total = responses.length;
        const classified = statusCounts.done;
        res.json({
            success: true,
            data: {
                total_responses: total,
                classified,
                status_counts: statusCounts,
                categories: categories.map((category) => ({
                    id: category.id,
                    name: category.name,
                    count: categoryCounts.get(category.id) || 0,
                    percent: classified ? Math.round(((categoryCounts.get(category.id) || 0) / classified) * 1000) / 10 : 0
                })).sort((a, b) => b.count - a.count),
                uncategorized,
                options: [...optionCounts.entries()].map(([option, count]) => ({
                    option,
                    count,
                    percent: total ? Math.round((count / total) * 1000) / 10 : 0
                }))
            }
        });
    } catch (error) {
        logger.error('Public poll summary failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal memuat rekap' });
    }
});

router.get('/admin/polls/:id/responses', adminGuard, async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        const params = [req.params.id];
        let where = 'poll_id = ?';
        if (['pending', 'done', 'failed', 'skipped'].includes(req.query.status)) {
            where += ' AND ai_status = ?';
            params.push(req.query.status);
        }
        const [rows] = await db.query(
            `SELECT id, answer_text, selected_options, ip_address, category_ids, ai_status, ai_confidence,
                    ai_reason, ai_model, manual_override, created_at, classified_at
             FROM public_poll_responses WHERE ${where}
             ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM public_poll_responses WHERE ${where}`, params);
        res.json({
            success: true,
            total: Number(total),
            data: rows.map((row) => ({
                ...row,
                selected_options: parseJsonArray(row.selected_options),
                category_ids: parseJsonArray(row.category_ids).map(Number),
                manual_override: Boolean(row.manual_override)
            }))
        });
    } catch (error) {
        logger.error('List public poll responses failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal memuat jawaban' });
    }
});

router.put('/admin/responses/:responseId/categories', adminGuard, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT poll_id FROM public_poll_responses WHERE id = ?', [req.params.responseId]);
        if (!rows[0]) return res.status(404).json({ success: false, message: 'Jawaban tidak ditemukan' });
        const validIds = new Set((await loadCategories(rows[0].poll_id)).map((c) => c.id));
        const ids = [...new Set((Array.isArray(req.body?.category_ids) ? req.body.category_ids : []).map(Number))]
            .filter((id) => validIds.has(id));
        await db.query(
            `UPDATE public_poll_responses
             SET category_ids = ?, manual_override = 1, ai_status = 'done', ai_reason = 'Dikoreksi manual oleh admin', classified_at = NOW()
             WHERE id = ?`,
            [JSON.stringify(ids), req.params.responseId]
        );
        res.json({ success: true, category_ids: ids });
    } catch (error) {
        logger.error('Override public poll categories failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal menyimpan kategori' });
    }
});

router.delete('/admin/responses/:responseId', adminGuard, async (req, res) => {
    try {
        await db.query('DELETE FROM public_poll_responses WHERE id = ?', [req.params.responseId]);
        res.json({ success: true });
    } catch (error) {
        logger.error('Delete public poll response failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal menghapus jawaban' });
    }
});

// scope: "pending" (pending + failed, default) or "all" (re-run everything except manual overrides)
router.post('/admin/polls/:id/classify', adminGuard, async (req, res) => {
    try {
        if (!PublicPollClassifier.isConfigured()) {
            return res.status(400).json({ success: false, message: 'ANTHROPIC_API_KEY belum diset di server' });
        }
        const statusFilter = req.body?.scope === 'all'
            ? "ai_status IN ('pending', 'failed', 'done')"
            : "ai_status IN ('pending', 'failed')";
        const [rows] = await db.query(
            `SELECT id FROM public_poll_responses WHERE poll_id = ? AND manual_override = 0 AND ${statusFilter} ORDER BY id`,
            [req.params.id]
        );
        const ids = rows.map((row) => row.id);
        if (ids.length) {
            await db.query("UPDATE public_poll_responses SET ai_status = 'pending' WHERE id IN (?)", [ids]);
            enqueueClassification(ids);
        }
        res.json({ success: true, queued: ids.length });
    } catch (error) {
        logger.error('Queue public poll classification failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal memulai klasifikasi' });
    }
});

// ==================== PUBLIC (no login) ====================

async function loadPublicPoll(slug) {
    const normalized = String(slug || '').trim().toLowerCase();
    if (!SLUG_PATTERN.test(normalized)) return null;
    const [rows] = await db.query(`SELECT ${POLL_COLUMNS} FROM public_polls WHERE slug = ? AND status <> 'draft'`, [normalized]);
    return rows[0] || null;
}

function buildDedupeKey(poll, ip, deviceToken) {
    if (!poll.one_per_ip && /^[A-Za-z0-9_-]{16,64}$/.test(deviceToken || '')) {
        return `dev:${deviceToken}`;
    }
    return `ip:${ip}`;
}

router.get('/:slug', ensureSchema, async (req, res) => {
    noStore(res);
    try {
        const row = await loadPublicPoll(req.params.slug);
        if (!row) return res.status(404).json({ success: false, message: 'Polling tidak ditemukan' });
        const ip = getRequestIp(req);
        const dedupeKey = buildDedupeKey(row, ip, req.query.device);
        const [existing] = await db.query(
            'SELECT id FROM public_poll_responses WHERE poll_id = ? AND dedupe_key = ? LIMIT 1',
            [row.id, dedupeKey]
        );
        res.json({ success: true, data: { ...serializePoll(row), already_answered: existing.length > 0 } });
    } catch (error) {
        logger.error('Get public poll failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal memuat polling' });
    }
});

router.get('/:slug/image', ensureSchema, async (req, res) => {
    try {
        const normalized = String(req.params.slug || '').trim().toLowerCase();
        const [rows] = await db.query(
            "SELECT header_image, header_image_mime FROM public_polls WHERE slug = ? AND status <> 'draft'",
            [normalized]
        );
        const row = rows[0];
        if (!row || !row.header_image) return res.status(404).end();
        res.set('Content-Type', row.header_image_mime || 'image/webp');
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(row.header_image);
    } catch (error) {
        logger.error('Get public poll image failed', { error: error.message });
        res.status(500).end();
    }
});

router.post('/:slug/responses', submitLimiter, ensureSchema, async (req, res) => {
    noStore(res);
    try {
        const poll = await loadPublicPoll(req.params.slug);
        if (!poll) return res.status(404).json({ success: false, message: 'Polling tidak ditemukan' });
        if (poll.status !== 'active') {
            return res.status(410).json({ success: false, code: 'POLL_CLOSED', message: 'Polling ini sudah ditutup. Terima kasih.' });
        }

        let answerText = null;
        let selected = [];
        if (poll.answer_type === 'text') {
            answerText = String(req.body?.answer_text || '').trim();
            if (answerText.length < MIN_ANSWER_LENGTH) {
                return res.status(400).json({ success: false, message: 'Jawaban masih kosong' });
            }
            if (answerText.length > MAX_ANSWER_LENGTH) {
                return res.status(400).json({ success: false, message: `Jawaban maksimal ${MAX_ANSWER_LENGTH} karakter` });
            }
        } else {
            const options = parseJsonArray(poll.options_json);
            const picked = Array.isArray(req.body?.selected_options) ? req.body.selected_options.map(String) : [];
            selected = [...new Set(picked)].filter((option) => options.includes(option));
            if (!selected.length) return res.status(400).json({ success: false, message: 'Pilih salah satu jawaban' });
            if (poll.answer_type === 'single') selected = selected.slice(0, 1);
            const extra = String(req.body?.answer_text || '').trim();
            answerText = extra ? extra.slice(0, MAX_ANSWER_LENGTH) : null;
        }

        const ip = getRequestIp(req) || 'unknown';
        const dedupeKey = buildDedupeKey(poll, ip, req.body?.device_token);
        const aiStatus = poll.answer_type === 'text' ? 'pending' : 'skipped';

        let insertId;
        try {
            const [result] = await db.query(
                `INSERT INTO public_poll_responses (poll_id, answer_text, selected_options, ip_address, dedupe_key, user_agent, ai_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [poll.id, answerText, selected.length ? JSON.stringify(selected) : null, ip.slice(0, 64), dedupeKey.slice(0, 100),
                    String(req.headers['user-agent'] || '').slice(0, 255), aiStatus]
            );
            insertId = result.insertId;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ success: false, code: 'ALREADY_ANSWERED', message: 'Jawaban dari perangkat/jaringan ini sudah kami terima. Terima kasih!' });
            }
            throw error;
        }

        if (aiStatus === 'pending' && PublicPollClassifier.isConfigured()) {
            enqueueClassification([insertId]);
        }

        res.status(201).json({ success: true, message: poll.thank_you_message || 'Terima kasih, jawaban Anda sudah terkirim.' });
    } catch (error) {
        logger.error('Submit public poll response failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal mengirim jawaban. Coba lagi.' });
    }
});

module.exports = router;
module.exports._internal = { classifyResponse, buildDedupeKey, validatePollPayload };
