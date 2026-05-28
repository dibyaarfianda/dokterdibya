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

        const userId = req.user.id || req.user.new_id;
        const patientId = req.user.patient_id || userId || null;
        const patientName = is_anonymous ? null : (req.user.name || req.user.display_name || null);

        // Cek daily limit
        const [[{ count }]] = await db.execute(
            `SELECT COUNT(*) AS count FROM patient_feedback
             WHERE patient_id = ? AND DATE(created_at) = CURDATE()`,
            [patientId || 0]
        );
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
            `SELECT id, patient_id, patient_name, category, message, rating, is_anonymous, created_at
             FROM patient_feedback
             WHERE ${where}
             ORDER BY created_at DESC
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
