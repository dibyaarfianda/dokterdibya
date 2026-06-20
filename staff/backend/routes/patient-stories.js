const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyPatientToken, verifyStaffToken, requireRoles } = require('../middleware/auth');
const { ROLE_NAMES } = require('../constants/roles');
const logger = require('../utils/logger');

const CATEGORY_VALUES = new Set(['kehamilan', 'persalinan', 'program_hamil', 'pemulihan', 'lainnya']);
const STATUS_VALUES = new Set(['pending', 'published', 'rejected', 'archived']);
const AUTHOR_MODE_VALUES = new Set(['nickname', 'anonim']);
const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 3000;
const MAX_REASON_LENGTH = 300;
const MAX_MODERATION_NOTE_LENGTH = 500;

function setPatientNoCacheHeaders(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

function normalizeText(value) {
    return String(value || '').replace(/\r\n/g, '\n').trim();
}

function getInitialName(name) {
    const first = String(name || '').trim().charAt(0).toUpperCase();
    return first ? `${first}.` : 'Pasien';
}

function getAuthorDisplayName(row) {
    if (row.author_mode === 'anonim') return 'Anonim';
    return row.author_nickname || getInitialName(row.patient_name);
}

function mapPublicStory(row, currentPatientId = null) {
    return {
        id: row.id,
        title: row.title,
        body: row.body,
        category: row.category,
        author_mode: row.author_mode,
        author_display_name: getAuthorDisplayName(row),
        status: row.status,
        view_count: Number(row.view_count || 0),
        like_count: Number(row.like_count || 0),
        report_count: Number(row.report_count || 0),
        liked_by_me: Number(row.liked_by_me || 0) === 1,
        reported_by_me: Number(row.reported_by_me || 0) === 1,
        is_mine: currentPatientId ? row.patient_id === currentPatientId : false,
        created_at: row.created_at,
        updated_at: row.updated_at,
        moderation_note: row.patient_id === currentPatientId ? row.moderation_note : null
    };
}

function mapStaffStory(row) {
    return {
        id: row.id,
        title: row.title,
        body: row.body,
        category: row.category,
        author_mode: row.author_mode,
        author_display_name: getAuthorDisplayName(row),
        status: row.status,
        moderation_note: row.moderation_note,
        moderated_by: row.moderated_by,
        moderated_by_name: row.moderated_by_name,
        moderated_at: row.moderated_at,
        view_count: Number(row.view_count || 0),
        like_count: Number(row.like_count || 0),
        report_count: Number(row.report_count || 0),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function validateStoryInput(body) {
    const title = normalizeText(body.title);
    const storyBody = normalizeText(body.body);
    const category = CATEGORY_VALUES.has(body.category) ? body.category : 'lainnya';
    const authorMode = AUTHOR_MODE_VALUES.has(body.author_mode) ? body.author_mode : 'nickname';

    if (!title) return { valid: false, message: 'Judul wajib diisi' };
    if (title.length > MAX_TITLE_LENGTH) return { valid: false, message: `Judul maksimal ${MAX_TITLE_LENGTH} karakter` };
    if (!storyBody) return { valid: false, message: 'Isi cerita wajib diisi' };
    if (storyBody.length > MAX_BODY_LENGTH) return { valid: false, message: `Isi cerita maksimal ${MAX_BODY_LENGTH} karakter` };

    return { valid: true, title, body: storyBody, category, authorMode };
}

function getLimitOffset(query, defaultLimit = 20, maxLimit = 50) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
    const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
    return { limit, offset };
}

async function getStoryForPatient(storyId, patientId) {
    const [rows] = await db.query(
        `SELECT ps.*,
                p.full_name AS patient_name,
                pps.nickname AS author_nickname,
                EXISTS(
                    SELECT 1 FROM patient_story_reactions psr
                    WHERE psr.story_id = ps.id AND psr.patient_id = ?
                ) AS liked_by_me,
                EXISTS(
                    SELECT 1 FROM patient_story_reports pr
                    WHERE pr.story_id = ps.id AND pr.patient_id = ?
                ) AS reported_by_me
         FROM patient_stories ps
         LEFT JOIN patients p ON p.id = ps.patient_id
         LEFT JOIN patient_portal_settings pps ON pps.patient_id = ps.patient_id
         WHERE ps.id = ?
           AND (ps.status = 'published' OR ps.patient_id = ?)
         LIMIT 1`,
        [patientId, patientId, storyId, patientId]
    );
    return rows[0] || null;
}

router.get('/', verifyPatientToken, async (req, res) => {
    try {
        setPatientNoCacheHeaders(res);
        const patientId = req.patient.id;
        const { limit, offset } = getLimitOffset(req.query);
        const category = CATEGORY_VALUES.has(req.query.category) ? req.query.category : null;

        let query = `
            SELECT ps.id, ps.patient_id, ps.title, ps.body, ps.category, ps.author_mode, ps.status,
                   ps.view_count, ps.like_count, ps.report_count, ps.created_at, ps.updated_at,
                   p.full_name AS patient_name,
                   pps.nickname AS author_nickname,
                   EXISTS(
                       SELECT 1 FROM patient_story_reactions psr
                       WHERE psr.story_id = ps.id AND psr.patient_id = ?
                   ) AS liked_by_me,
                   EXISTS(
                       SELECT 1 FROM patient_story_reports pr
                       WHERE pr.story_id = ps.id AND pr.patient_id = ?
                   ) AS reported_by_me
            FROM patient_stories ps
            LEFT JOIN patients p ON p.id = ps.patient_id
            LEFT JOIN patient_portal_settings pps ON pps.patient_id = ps.patient_id
            WHERE ps.status = 'published'
        `;
        const params = [patientId, patientId];
        if (category) {
            query += ' AND ps.category = ?';
            params.push(category);
        }
        query += ' ORDER BY ps.published_sort_at DESC, ps.created_at DESC LIMIT ? OFFSET ?'
            .replace('ps.published_sort_at', 'COALESCE(ps.moderated_at, ps.created_at)');
        params.push(limit, offset);

        const [stories] = await db.query(query, params);
        res.json({
            success: true,
            data: stories.map(row => mapPublicStory(row, patientId))
        });
    } catch (error) {
        logger.error('Error loading patient stories:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat cerita' });
    }
});

router.get('/my', verifyPatientToken, async (req, res) => {
    try {
        setPatientNoCacheHeaders(res);
        const patientId = req.patient.id;
        const { limit, offset } = getLimitOffset(req.query, 30, 100);

        const [stories] = await db.query(
            `SELECT ps.*, p.full_name AS patient_name, pps.nickname AS author_nickname,
                    EXISTS(
                        SELECT 1 FROM patient_story_reactions psr
                        WHERE psr.story_id = ps.id AND psr.patient_id = ?
                    ) AS liked_by_me,
                    EXISTS(
                        SELECT 1 FROM patient_story_reports pr
                        WHERE pr.story_id = ps.id AND pr.patient_id = ?
                    ) AS reported_by_me
             FROM patient_stories ps
             LEFT JOIN patients p ON p.id = ps.patient_id
             LEFT JOIN patient_portal_settings pps ON pps.patient_id = ps.patient_id
             WHERE ps.patient_id = ?
             ORDER BY ps.created_at DESC
             LIMIT ? OFFSET ?`,
            [patientId, patientId, patientId, limit, offset]
        );

        res.json({
            success: true,
            data: stories.map(row => mapPublicStory(row, patientId))
        });
    } catch (error) {
        logger.error('Error loading my patient stories:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat cerita saya' });
    }
});

router.get('/admin/all', verifyStaffToken, requireRoles(ROLE_NAMES.DOKTER, ROLE_NAMES.ADMIN), async (req, res) => {
    try {
        const { limit, offset } = getLimitOffset(req.query, 50, 100);
        const status = STATUS_VALUES.has(req.query.status) ? req.query.status : null;
        const category = CATEGORY_VALUES.has(req.query.category) ? req.query.category : null;

        let query = `
            SELECT ps.*,
                   p.full_name AS patient_name,
                   pps.nickname AS author_nickname,
                   u.display_name AS moderated_by_name
            FROM patient_stories ps
            LEFT JOIN patients p ON p.id = ps.patient_id
            LEFT JOIN patient_portal_settings pps ON pps.patient_id = ps.patient_id
            LEFT JOIN users u ON u.new_id = ps.moderated_by
            WHERE 1=1
        `;
        const params = [];
        if (status) {
            query += ' AND ps.status = ?';
            params.push(status);
        }
        if (category) {
            query += ' AND ps.category = ?';
            params.push(category);
        }
        query += `
            ORDER BY
                CASE ps.status
                    WHEN 'pending' THEN 0
                    WHEN 'published' THEN 1
                    WHEN 'rejected' THEN 2
                    ELSE 3
                END,
                ps.created_at DESC
            LIMIT ? OFFSET ?
        `;
        params.push(limit, offset);

        const [stories] = await db.query(query, params);
        res.json({
            success: true,
            data: stories.map(mapStaffStory)
        });
    } catch (error) {
        logger.error('Error loading stories for moderation:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat data moderation' });
    }
});

router.get('/:id', verifyPatientToken, async (req, res) => {
    try {
        setPatientNoCacheHeaders(res);
        const patientId = req.patient.id;
        const story = await getStoryForPatient(req.params.id, patientId);
        if (!story) {
            return res.status(404).json({ success: false, message: 'Cerita tidak ditemukan' });
        }

        if (story.status === 'published' && story.patient_id !== patientId) {
            await db.query('UPDATE patient_stories SET view_count = view_count + 1 WHERE id = ?', [story.id]);
            story.view_count = Number(story.view_count || 0) + 1;
        }

        res.json({ success: true, data: mapPublicStory(story, patientId) });
    } catch (error) {
        logger.error('Error loading patient story detail:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat cerita' });
    }
});

router.post('/', verifyPatientToken, async (req, res) => {
    try {
        setPatientNoCacheHeaders(res);
        const validation = validateStoryInput(req.body || {});
        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message });
        }

        const [result] = await db.query(
            `INSERT INTO patient_stories (patient_id, title, body, category, author_mode, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [req.patient.id, validation.title, validation.body, validation.category, validation.authorMode]
        );

        res.status(201).json({
            success: true,
            message: 'Cerita berhasil dikirim dan menunggu review',
            id: result.insertId,
            status: 'pending'
        });
    } catch (error) {
        logger.error('Error submitting patient story:', error);
        res.status(500).json({ success: false, message: 'Gagal mengirim cerita' });
    }
});

router.post('/:id/reaction', verifyPatientToken, async (req, res) => {
    const conn = await db.getConnection();
    try {
        setPatientNoCacheHeaders(res);
        const patientId = req.patient.id;
        const story = await getStoryForPatient(req.params.id, patientId);
        if (!story || story.status !== 'published') {
            return res.status(404).json({ success: false, message: 'Cerita tidak ditemukan' });
        }

        await conn.beginTransaction();
        const [existing] = await conn.query(
            'SELECT id FROM patient_story_reactions WHERE story_id = ? AND patient_id = ? FOR UPDATE',
            [story.id, patientId]
        );

        let liked;
        if (existing.length) {
            await conn.query('DELETE FROM patient_story_reactions WHERE id = ?', [existing[0].id]);
            await conn.query('UPDATE patient_stories SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?', [story.id]);
            liked = false;
        } else {
            await conn.query(
                'INSERT INTO patient_story_reactions (story_id, patient_id) VALUES (?, ?)',
                [story.id, patientId]
            );
            await conn.query('UPDATE patient_stories SET like_count = like_count + 1 WHERE id = ?', [story.id]);
            liked = true;
        }

        const [counts] = await conn.query('SELECT like_count FROM patient_stories WHERE id = ?', [story.id]);
        await conn.commit();
        res.json({ success: true, liked, like_count: Number(counts[0]?.like_count || 0) });
    } catch (error) {
        try { await conn.rollback(); } catch (rollbackError) {}
        logger.error('Error toggling patient story reaction:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses dukungan' });
    } finally {
        conn.release();
    }
});

router.post('/:id/report', verifyPatientToken, async (req, res) => {
    const conn = await db.getConnection();
    try {
        setPatientNoCacheHeaders(res);
        const patientId = req.patient.id;
        const reason = normalizeText(req.body?.reason);
        if (!reason) {
            return res.status(400).json({ success: false, message: 'Alasan laporan wajib diisi' });
        }
        if (reason.length > MAX_REASON_LENGTH) {
            return res.status(400).json({ success: false, message: `Alasan maksimal ${MAX_REASON_LENGTH} karakter` });
        }

        const story = await getStoryForPatient(req.params.id, patientId);
        if (!story || story.status !== 'published') {
            return res.status(404).json({ success: false, message: 'Cerita tidak ditemukan' });
        }

        await conn.beginTransaction();
        const [result] = await conn.query(
            `INSERT INTO patient_story_reports (story_id, patient_id, reason)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE reason = VALUES(reason), updated_at = CURRENT_TIMESTAMP`,
            [story.id, patientId, reason]
        );
        if (result.affectedRows === 1) {
            await conn.query('UPDATE patient_stories SET report_count = report_count + 1 WHERE id = ?', [story.id]);
        }
        const [counts] = await conn.query('SELECT report_count FROM patient_stories WHERE id = ?', [story.id]);
        await conn.commit();
        res.json({
            success: true,
            message: result.affectedRows === 1 ? 'Laporan terkirim' : 'Laporan diperbarui',
            report_count: Number(counts[0]?.report_count || 0)
        });
    } catch (error) {
        try { await conn.rollback(); } catch (rollbackError) {}
        logger.error('Error reporting patient story:', error);
        res.status(500).json({ success: false, message: 'Gagal mengirim laporan' });
    } finally {
        conn.release();
    }
});

async function updateStoryStatus(req, res, nextStatus) {
    try {
        const note = normalizeText(req.body?.note);
        if (note.length > MAX_MODERATION_NOTE_LENGTH) {
            return res.status(400).json({ success: false, message: `Catatan maksimal ${MAX_MODERATION_NOTE_LENGTH} karakter` });
        }

        const [result] = await db.query(
            `UPDATE patient_stories
             SET status = ?, moderation_note = ?, moderated_by = ?, moderated_at = NOW()
             WHERE id = ?`,
            [nextStatus, note || null, req.user.id, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Cerita tidak ditemukan' });
        }

        res.json({ success: true, message: `Status cerita diubah menjadi ${nextStatus}` });
    } catch (error) {
        logger.error('Error updating patient story moderation status:', error);
        res.status(500).json({ success: false, message: 'Gagal mengubah status cerita' });
    }
}

router.patch('/admin/:id/approve', verifyStaffToken, requireRoles(ROLE_NAMES.DOKTER, ROLE_NAMES.ADMIN), (req, res) => {
    updateStoryStatus(req, res, 'published');
});

router.patch('/admin/:id/reject', verifyStaffToken, requireRoles(ROLE_NAMES.DOKTER, ROLE_NAMES.ADMIN), (req, res) => {
    updateStoryStatus(req, res, 'rejected');
});

router.patch('/admin/:id/archive', verifyStaffToken, requireRoles(ROLE_NAMES.DOKTER, ROLE_NAMES.ADMIN), (req, res) => {
    updateStoryStatus(req, res, 'archived');
});

module.exports = router;
