'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyPatientToken, verifyToken, requireSuperadmin } = require('../middleware/auth');

// Rate limit: max 10 feedback per patient per hari
const DAILY_LIMIT = 10;

function setNoCacheHeaders(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

function toNullableInt(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const str = String(value).trim();
    if (!str) {
        return null;
    }
    if (!/^\d+$/.test(str)) {
        return null;
    }
    const parsed = Number.parseInt(str, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

async function resolveFeedbackPatientId(user) {
    const directCandidates = [
        user?.new_id,
        user?.user_id,
        user?.patient_id,
        user?.id,
    ];

    for (const candidate of directCandidates) {
        const parsed = toNullableInt(candidate);
        if (parsed !== null) {
            return parsed;
        }
    }

    const email = String(user?.email || '').trim();
    if (!email) {
        return null;
    }

    try {
        const [rows] = await db.execute(
            'SELECT new_id FROM users WHERE email = ? LIMIT 1',
            [email]
        );
        if (!rows.length) {
            return null;
        }
        return toNullableInt(rows[0].new_id);
    } catch (error) {
        return null;
    }
}

/**
 * POST /api/patient-feedback
 * Kirim feedback dari pasien. Bisa berulang kali, max 10/hari.
 */
router.post('/', verifyPatientToken, async (req, res) => {
    setNoCacheHeaders(res);
    try {
        const { category = 'umum', message, rating = null, is_anonymous = false } = req.body;

        if (!message || !String(message).trim()) {
            return res.status(400).json({ success: false, message: 'Pesan feedback tidak boleh kosong' });
        }
        if (message.length > 2000) {
            return res.status(400).json({ success: false, message: 'Pesan terlalu panjang (maks 2000 karakter)' });
        }
        const validCategories = ['umum', 'fitur', 'bug', 'saran', 'layanan', 'lainnya'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({ success: false, message: 'Kategori tidak valid' });
        }
        if (rating !== null && (rating < 1 || rating > 5)) {
            return res.status(400).json({ success: false, message: 'Rating harus antara 1-5' });
        }

        const patientId = await resolveFeedbackPatientId(req.user);
        const patientName = is_anonymous
            ? null
            : (req.user.name || req.user.display_name || req.user.fullname || req.user.full_name || null);

        // Cek daily limit
        let count = 0;
        if (patientId !== null) {
            const [[row]] = await db.execute(
                `SELECT COUNT(*) AS count FROM patient_feedback
                 WHERE patient_id = ? AND DATE(created_at) = CURDATE()`,
                [patientId]
            );
            count = Number(row?.count || 0);
        } else {
            const fallbackName = String(patientName || 'anon').trim();
            const [[row]] = await db.execute(
                `SELECT COUNT(*) AS count FROM patient_feedback
                 WHERE patient_id IS NULL
                   AND patient_name = ?
                   AND DATE(created_at) = CURDATE()`,
                [fallbackName]
            );
            count = Number(row?.count || 0);
        }

        if (count >= DAILY_LIMIT) {
            return res.status(429).json({ success: false, message: `Batas pengiriman feedback hari ini sudah tercapai (maks ${DAILY_LIMIT}x/hari)` });
        }

        await db.execute(
            `INSERT INTO patient_feedback (patient_id, patient_name, category, message, rating, is_anonymous)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [patientId, patientName, category, String(message).trim(), rating, is_anonymous ? 1 : 0]
        );

        res.json({ success: true, message: 'Terima kasih atas masukan Anda!' });
    } catch (err) {
        console.error('[patient-feedback] POST error:', err);
        res.status(500).json({ success: false, message: 'Gagal menyimpan feedback' });
    }
});

/**
 * GET /api/patient-feedback (admin only)
 * Lihat semua feedback
 */
router.get('/', verifyToken, requireSuperadmin, async (req, res) => {
    setNoCacheHeaders(res);
    try {
        const { category, limit = 50, offset = 0 } = req.query;
        let where = '1=1';
        const params = [];
        if (category) { where += ' AND category = ?'; params.push(category); }

        const [rows] = await db.execute(
            `SELECT pf.id,
                    pf.patient_id,
                    pf.patient_name,
                    pf.category,
                    pf.message,
                    pf.rating,
                    pf.is_anonymous,
                    pf.created_at,
                    p.full_name AS patient_real_name,
                    pps.nickname AS patient_nickname,
                    u.name AS user_display_name
             FROM patient_feedback pf
             LEFT JOIN users u ON u.new_id = pf.patient_id
             LEFT JOIN patients p ON p.email = u.email
             LEFT JOIN patient_portal_settings pps ON pps.patient_id = p.id
             WHERE ${where}
             ORDER BY pf.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );
        const [[{ total }]] = await db.execute(
            `SELECT COUNT(*) AS total FROM patient_feedback WHERE ${where}`, params
        );
        res.json({ success: true, data: rows, total });
    } catch (err) {
        console.error('[patient-feedback] GET error:', err);
        res.status(500).json({ success: false, message: 'Gagal mengambil data feedback' });
    }
});

module.exports = router;
