const express = require('express');
const router = express.Router();
const db = require('../db');
const { validateOperationalSchemaScope } = require('../services/OperationalSchemaValidator');
const logger = require('../utils/logger');
const { verifyToken, verifyPatientToken } = require('../middleware/auth');

let tablesReady = false;
let tableSetupPromise = null;

async function ensureVotingTables() {
    return validateOperationalSchemaScope('polls');
}

function normalizeOptions(options) {
    if (!Array.isArray(options)) {
        return [];
    }

    return options
        .map((entry) => String(entry || '').trim())
        .filter((entry, index, arr) => entry.length > 0 && arr.indexOf(entry) === index)
        .slice(0, 10);
}

function normalizeOptionPayload(options) {
    if (!Array.isArray(options)) {
        return [];
    }

    const seen = new Set();
    const normalized = [];

    options.forEach((entry) => {
        let optionId = null;
        let optionText = '';

        if (typeof entry === 'string') {
            optionText = String(entry).trim();
        } else if (entry && typeof entry === 'object') {
            const parsedId = Number(entry.id);
            optionId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
            optionText = String(entry.option_text || entry.text || '').trim();
        }

        if (!optionText) {
            return;
        }

        const dedupeKey = optionText.toLowerCase();
        if (seen.has(dedupeKey)) {
            return;
        }
        seen.add(dedupeKey);

        normalized.push({
            id: optionId,
            option_text: optionText
        });
    });

    return normalized.slice(0, 10);
}

function extractUserId(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload.uid || payload.id || payload.user_id || payload.email || null;
}

function extractUserName(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload.name || payload.displayName || payload.fullName || payload.email || null;
}

function maskCommenterName(fullName) {
    const raw = String(fullName || '').trim();
    if (!raw) return 'P*****';

    return raw
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => {
            const first = word.charAt(0).toUpperCase();
            return first + '*'.repeat(Math.max(1, word.length - 1));
        })
        .join(' ');
}

async function getPollComments(pollId, currentPatientId = null, limit = 30) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
    const [rows] = await db.query(`
        SELECT
            c.id,
            c.poll_id,
            c.patient_id,
            c.comment_text,
            c.created_at,
            p.full_name,
            COUNT(l.id) AS like_count,
            MAX(CASE WHEN l.patient_id = ? THEN 1 ELSE 0 END) AS liked_by_me
        FROM poll_comments c
        LEFT JOIN patients p ON p.id = c.patient_id
        LEFT JOIN poll_comment_likes l ON l.comment_id = c.id
        WHERE c.poll_id = ?
        GROUP BY c.id
        ORDER BY c.created_at DESC
        LIMIT ?
    `, [currentPatientId || '', pollId, safeLimit]);

    return rows.map((row) => ({
        id: row.id,
        poll_id: row.poll_id,
        patient_id: row.patient_id,
        comment_text: row.comment_text,
        created_at: row.created_at,
        commenter_name: maskCommenterName(row.full_name),
        like_count: Number(row.like_count || 0),
        liked_by_me: Number(row.liked_by_me || 0) === 1
    }));
}

async function getPollResultById(pollId) {
    const [pollRows] = await db.query(`
        SELECT
            p.id,
            p.title,
            p.description,
            p.status,
            p.show_on_open,
            p.created_by,
            p.created_by_name,
            p.created_at,
            p.closed_at,
            COUNT(v.id) AS total_votes
        FROM polls p
        LEFT JOIN poll_votes v ON v.poll_id = p.id
        WHERE p.id = ?
        GROUP BY p.id
        LIMIT 1
    `, [pollId]);

    if (!pollRows.length) {
        return null;
    }

    const poll = pollRows[0];
    const totalVotes = Number(poll.total_votes || 0);

    const [optionRows] = await db.query(`
        SELECT
            o.id,
            o.poll_id,
            o.option_text,
            o.option_order,
            COUNT(v.id) AS vote_count
        FROM poll_options o
        LEFT JOIN poll_votes v ON v.option_id = o.id
        WHERE o.poll_id = ?
        GROUP BY o.id
        ORDER BY o.option_order ASC, o.id ASC
    `, [pollId]);

    const options = optionRows.map((option) => {
        const voteCount = Number(option.vote_count || 0);
        return {
            id: option.id,
            poll_id: option.poll_id,
            option_text: option.option_text,
            option_order: option.option_order,
            vote_count: voteCount,
            vote_percent: totalVotes > 0 ? Math.round((voteCount / totalVotes) * 10000) / 100 : 0
        };
    });

    return {
        ...poll,
        total_votes: totalVotes,
        options
    };
}

async function notifyPatientsForPoll(poll, mode = 'new') {
    try {
        const [patients] = await db.query(`
            SELECT id
            FROM patients
            WHERE status != 'deleted' OR status IS NULL
        `);

        if (!patients.length) {
            return;
        }

        let titlePrefix = 'Voting Baru';
        let defaultMessage = 'Buka portal pasien untuk ikut voting terbaru.';

        if (mode === 'reminder') {
            titlePrefix = 'Reminder Voting';
            defaultMessage = 'Yuk cek voting terbaru di portal pasien.';
        } else if (mode === 'update') {
            titlePrefix = 'Voting Diperbarui';
            defaultMessage = 'Ada pembaruan voting, cek detailnya di portal pasien.';
        }

        const title = `${titlePrefix}: ${String(poll.title || '').substring(0, 80)}`;
        const description = String(poll.description || '').trim();
        const message = description.length
            ? description.substring(0, 180)
            : defaultMessage;

        const values = patients.map((patient) => [
            patient.id,
            'poll',
            title,
            message,
            '/patient-menu.html#voting',
            'fa fa-poll-h',
            'text-warning'
        ]);

        const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
        await db.query(`
            INSERT INTO patient_notifications
            (patient_id, type, title, message, link, icon, icon_color)
            VALUES ${placeholders}
        `, values.flat());

        if (global.io) {
            global.io.emit('notification:new', {
                type: 'poll',
                poll_id: poll.id
            });
        }

        try {
            const pushService = require('../services/pushNotificationService');
            await pushService.sendToAll(
                titlePrefix,
                String(poll.title || '').substring(0, 100),
                {
                    type: 'poll',
                    poll_id: String(poll.id),
                    url: '/patient-menu.html#voting'
                }
            );
        } catch (pushError) {
            logger.warn('Poll push broadcast failed', { error: pushError.message, pollId: poll.id, mode });
        }
    } catch (error) {
        logger.error('Failed to notify patients for poll', {
            pollId: poll.id,
            mode,
            error: error.message
        });
    }
}

router.get('/staff/list', verifyToken, async (req, res) => {
    try {
        await ensureVotingTables();

        const [polls] = await db.query(`
            SELECT
                p.id,
                p.title,
                p.description,
                p.status,
                p.show_on_open,
                p.created_by,
                p.created_by_name,
                p.created_at,
                p.closed_at,
                COUNT(v.id) AS total_votes
            FROM polls p
            LEFT JOIN poll_votes v ON v.poll_id = p.id
            GROUP BY p.id
            ORDER BY (p.status = 'active') DESC, p.created_at DESC
            LIMIT 100
        `);

        const pollIds = polls.map((poll) => poll.id);
        const optionMap = new Map();

        if (pollIds.length) {
            const [optionRows] = await db.query(`
                SELECT
                    o.id,
                    o.poll_id,
                    o.option_text,
                    o.option_order,
                    COUNT(v.id) AS vote_count
                FROM poll_options o
                LEFT JOIN poll_votes v ON v.option_id = o.id
                WHERE o.poll_id IN (?)
                GROUP BY o.id
                ORDER BY o.poll_id ASC, o.option_order ASC, o.id ASC
            `, [pollIds]);

            optionRows.forEach((row) => {
                if (!optionMap.has(row.poll_id)) {
                    optionMap.set(row.poll_id, []);
                }
                optionMap.get(row.poll_id).push({
                    id: row.id,
                    poll_id: row.poll_id,
                    option_text: row.option_text,
                    option_order: row.option_order,
                    vote_count: Number(row.vote_count || 0)
                });
            });
        }

        const data = polls.map((poll) => {
            const options = optionMap.get(poll.id) || [];
            const totalVotes = Number(poll.total_votes || 0);

            return {
                ...poll,
                total_votes: totalVotes,
                options: options.map((option) => ({
                    ...option,
                    vote_percent: totalVotes > 0
                        ? Math.round((option.vote_count / totalVotes) * 10000) / 100
                        : 0
                }))
            };
        });

        res.json({ success: true, data });
    } catch (error) {
        logger.error('Failed to list staff polls', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal memuat voting' });
    }
});

router.post('/staff/create', verifyToken, async (req, res) => {
    try {
        await ensureVotingTables();

        const title = String(req.body?.title || '').trim();
        const description = String(req.body?.description || '').trim();
        const showOnOpen = req.body?.show_on_open === false || req.body?.show_on_open === 0 ? 0 : 1;
        const options = normalizeOptions(req.body?.options || []);

        if (!title) {
            return res.status(400).json({ success: false, message: 'Judul voting wajib diisi' });
        }

        if (options.length < 2) {
            return res.status(400).json({ success: false, message: 'Minimal 2 opsi jawaban' });
        }

        const userId = extractUserId(req.user);
        const userName = extractUserName(req.user) || 'Staff';

        const [insertPoll] = await db.query(`
            INSERT INTO polls (title, description, show_on_open, created_by, created_by_name)
            VALUES (?, ?, ?, ?, ?)
        `, [title, description || null, showOnOpen, userId, userName]);

        const pollId = insertPoll.insertId;

        const optionValues = options.map((option, index) => [pollId, option, index + 1]);
        await db.query(`
            INSERT INTO poll_options (poll_id, option_text, option_order)
            VALUES ?
        `, [optionValues]);

        const poll = await getPollResultById(pollId);

        if (global.io) {
            global.io.emit('poll:created', {
                poll_id: poll.id,
                title: poll.title,
                created_at: poll.created_at
            });
            global.io.emit('poll:updated', {
                poll_id: poll.id,
                total_votes: poll.total_votes
            });
        }

        notifyPatientsForPoll(poll, 'new').catch(() => {});

        res.json({
            success: true,
            message: 'Voting berhasil dibuat',
            data: poll
        });
    } catch (error) {
        logger.error('Failed to create poll', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal membuat voting' });
    }
});

router.put('/staff/:id/update', verifyToken, async (req, res) => {
    let connection;

    try {
        await ensureVotingTables();

        const pollId = Number(req.params.id);
        const title = String(req.body?.title || '').trim();
        const description = String(req.body?.description || '').trim();
        const showOnOpen = req.body?.show_on_open === false || req.body?.show_on_open === 0 ? 0 : 1;
        const options = normalizeOptionPayload(req.body?.options || []);

        if (!Number.isInteger(pollId) || pollId <= 0) {
            return res.status(400).json({ success: false, message: 'ID voting tidak valid' });
        }

        if (!title) {
            return res.status(400).json({ success: false, message: 'Judul voting wajib diisi' });
        }

        if (options.length < 2) {
            return res.status(400).json({ success: false, message: 'Minimal 2 opsi jawaban' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [pollRows] = await connection.query(
            'SELECT id FROM polls WHERE id = ? LIMIT 1',
            [pollId]
        );

        if (!pollRows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Voting tidak ditemukan' });
        }

        const [optionRows] = await connection.query(`
            SELECT
                o.id,
                o.option_text,
                COUNT(v.id) AS vote_count
            FROM poll_options o
            LEFT JOIN poll_votes v ON v.option_id = o.id
            WHERE o.poll_id = ?
            GROUP BY o.id
        `, [pollId]);

        const existingOptionMap = new Map(optionRows.map((row) => [Number(row.id), {
            id: Number(row.id),
            vote_count: Number(row.vote_count || 0)
        }]));

        const incomingOptionIds = new Set();
        for (const option of options) {
            if (!option.id) {
                continue;
            }

            if (!existingOptionMap.has(option.id)) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Data opsi voting tidak valid' });
            }
            incomingOptionIds.add(option.id);
        }

        const removedOptionIds = Array.from(existingOptionMap.values())
            .filter((row) => !incomingOptionIds.has(row.id))
            .map((row) => row.id);

        const blockedRemovedOptions = removedOptionIds.filter((id) => {
            const row = existingOptionMap.get(id);
            return row && row.vote_count > 0;
        });

        if (blockedRemovedOptions.length) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Opsi yang sudah dipilih pasien tidak bisa dihapus'
            });
        }

        await connection.query(
            'UPDATE polls SET title = ?, description = ?, show_on_open = ? WHERE id = ?',
            [title, description || null, showOnOpen, pollId]
        );

        for (let index = 0; index < options.length; index += 1) {
            const option = options[index];
            const optionOrder = index + 1;

            if (option.id) {
                await connection.query(
                    'UPDATE poll_options SET option_text = ?, option_order = ? WHERE id = ? AND poll_id = ?',
                    [option.option_text, optionOrder, option.id, pollId]
                );
            } else {
                await connection.query(
                    'INSERT INTO poll_options (poll_id, option_text, option_order) VALUES (?, ?, ?)',
                    [pollId, option.option_text, optionOrder]
                );
            }
        }

        if (removedOptionIds.length) {
            await connection.query(
                'DELETE FROM poll_options WHERE poll_id = ? AND id IN (?)',
                [pollId, removedOptionIds]
            );
        }

        await connection.commit();

        const poll = await getPollResultById(pollId);

        if (global.io) {
            global.io.emit('poll:updated', {
                poll_id: poll.id,
                total_votes: poll.total_votes,
                title: poll.title
            });
        }

        return res.json({
            success: true,
            message: 'Voting berhasil diperbarui',
            data: poll
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                logger.warn('Rollback failed when updating poll', { error: rollbackError.message });
            }
        }

        logger.error('Failed to update poll', { error: error.message });
        return res.status(500).json({ success: false, message: 'Gagal memperbarui voting' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

router.post('/staff/:id/notify', verifyToken, async (req, res) => {
    try {
        await ensureVotingTables();

        const pollId = Number(req.params.id);
        if (!Number.isInteger(pollId) || pollId <= 0) {
            return res.status(400).json({ success: false, message: 'ID voting tidak valid' });
        }

        const poll = await getPollResultById(pollId);
        if (!poll) {
            return res.status(404).json({ success: false, message: 'Voting tidak ditemukan' });
        }

        await notifyPatientsForPoll(poll, 'reminder');

        return res.json({
            success: true,
            message: 'Push notifikasi voting berhasil dikirim',
            data: { poll_id: pollId }
        });
    } catch (error) {
        logger.error('Failed to send poll reminder', { error: error.message });
        return res.status(500).json({ success: false, message: 'Gagal mengirim push notifikasi voting' });
    }
});

router.post('/staff/:id/close', verifyToken, async (req, res) => {
    try {
        await ensureVotingTables();

        const pollId = Number(req.params.id);
        if (!Number.isInteger(pollId) || pollId <= 0) {
            return res.status(400).json({ success: false, message: 'ID voting tidak valid' });
        }

        const [result] = await db.query(
            `UPDATE polls
             SET status = 'closed', closed_at = NOW()
             WHERE id = ? AND status = 'active'`,
            [pollId]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Voting tidak ditemukan atau sudah ditutup' });
        }

        const poll = await getPollResultById(pollId);

        if (global.io) {
            global.io.emit('poll:closed', { poll_id: pollId });
            global.io.emit('poll:updated', {
                poll_id: poll.id,
                total_votes: poll.total_votes
            });
        }

        res.json({ success: true, message: 'Voting ditutup', data: poll });
    } catch (error) {
        logger.error('Failed to close poll', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal menutup voting' });
    }
});

router.get('/patient/active', verifyPatientToken, async (req, res) => {
    try {
        await ensureVotingTables();

        const patientId = req.patient?.patientId || req.patient?.id;
        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        const [pollRows] = await db.query(`
            SELECT *
            FROM polls
            WHERE status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        `);

        if (!pollRows.length) {
            return res.json({ success: true, data: null });
        }

        const poll = pollRows[0];
        const fullResult = await getPollResultById(poll.id);

        const [voteRows] = await db.query(
            'SELECT option_id FROM poll_votes WHERE poll_id = ? AND patient_id = ? LIMIT 1',
            [poll.id, patientId]
        );

        const selectedOptionId = voteRows.length ? Number(voteRows[0].option_id) : null;
        const comments = await getPollComments(poll.id, patientId, 30);

        res.json({
            success: true,
            data: {
                ...fullResult,
                has_voted: selectedOptionId !== null,
                selected_option_id: selectedOptionId,
                comments
            }
        });
    } catch (error) {
        logger.error('Failed to get active patient poll', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal memuat voting aktif' });
    }
});

router.post('/patient/:id/vote', verifyPatientToken, async (req, res) => {
    try {
        await ensureVotingTables();

        const pollId = Number(req.params.id);
        const optionId = Number(req.body?.option_id);
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!Number.isInteger(pollId) || pollId <= 0 || !Number.isInteger(optionId) || optionId <= 0) {
            return res.status(400).json({ success: false, message: 'Data voting tidak valid' });
        }

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        const [pollRows] = await db.query(
            'SELECT id, status FROM polls WHERE id = ? LIMIT 1',
            [pollId]
        );

        if (!pollRows.length || pollRows[0].status !== 'active') {
            return res.status(404).json({ success: false, message: 'Voting tidak ditemukan atau sudah ditutup' });
        }

        const [optionRows] = await db.query(
            'SELECT id FROM poll_options WHERE id = ? AND poll_id = ? LIMIT 1',
            [optionId, pollId]
        );

        if (!optionRows.length) {
            return res.status(400).json({ success: false, message: 'Opsi voting tidak valid' });
        }

        try {
            await db.query(
                'INSERT INTO poll_votes (poll_id, option_id, patient_id) VALUES (?, ?, ?)',
                [pollId, optionId, patientId]
            );
        } catch (insertError) {
            if (String(insertError.code || '') === 'ER_DUP_ENTRY') {
                return res.status(409).json({ success: false, message: 'Anda sudah memilih pada voting ini' });
            }
            throw insertError;
        }

        const resultData = await getPollResultById(pollId);
        const comments = await getPollComments(pollId, patientId, 30);

        if (global.io) {
            global.io.emit('poll:voted', {
                poll_id: pollId,
                option_id: optionId,
                total_votes: resultData.total_votes
            });
            global.io.emit('poll:updated', {
                poll_id: pollId,
                total_votes: resultData.total_votes
            });
        }

        res.json({
            success: true,
            message: 'Terima kasih, pilihan Anda sudah tersimpan',
            data: {
                ...resultData,
                has_voted: true,
                selected_option_id: optionId,
                comments
            }
        });
    } catch (error) {
        logger.error('Failed to submit poll vote', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal menyimpan vote' });
    }
});

router.post('/patient/:id/comment', verifyPatientToken, async (req, res) => {
    try {
        await ensureVotingTables();

        const pollId = Number(req.params.id);
        const patientId = req.patient?.patientId || req.patient?.id;
        const commentText = String(req.body?.comment || '').trim();

        if (!Number.isInteger(pollId) || pollId <= 0) {
            return res.status(400).json({ success: false, message: 'ID voting tidak valid' });
        }

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        if (!commentText) {
            return res.status(400).json({ success: false, message: 'Komentar tidak boleh kosong' });
        }

        if (commentText.length > 800) {
            return res.status(400).json({ success: false, message: 'Komentar maksimal 800 karakter' });
        }

        const [pollRows] = await db.query(
            'SELECT id FROM polls WHERE id = ? LIMIT 1',
            [pollId]
        );

        if (!pollRows.length) {
            return res.status(404).json({ success: false, message: 'Voting tidak ditemukan' });
        }

        await db.query(
            'INSERT INTO poll_comments (poll_id, patient_id, comment_text) VALUES (?, ?, ?)',
            [pollId, patientId, commentText]
        );

        const comments = await getPollComments(pollId, patientId, 30);

        if (global.io) {
            global.io.emit('poll:comment', { poll_id: pollId });
        }

        res.json({
            success: true,
            message: 'Komentar berhasil dikirim',
            data: comments
        });
    } catch (error) {
        logger.error('Failed to submit poll comment', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal mengirim komentar' });
    }
});

router.post('/patient/:id/comments/:commentId/like', verifyPatientToken, async (req, res) => {
    try {
        await ensureVotingTables();

        const pollId = Number(req.params.id);
        const commentId = Number(req.params.commentId);
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!Number.isInteger(pollId) || pollId <= 0 || !Number.isInteger(commentId) || commentId <= 0) {
            return res.status(400).json({ success: false, message: 'ID tidak valid' });
        }

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        const [commentRows] = await db.query(
            'SELECT id FROM poll_comments WHERE id = ? AND poll_id = ? LIMIT 1',
            [commentId, pollId]
        );

        if (!commentRows.length) {
            return res.status(404).json({ success: false, message: 'Komentar tidak ditemukan' });
        }

        const [existingLike] = await db.query(
            'SELECT id FROM poll_comment_likes WHERE comment_id = ? AND patient_id = ? LIMIT 1',
            [commentId, patientId]
        );

        let liked = false;
        if (existingLike.length) {
            await db.query(
                'DELETE FROM poll_comment_likes WHERE comment_id = ? AND patient_id = ?',
                [commentId, patientId]
            );
            liked = false;
        } else {
            await db.query(
                'INSERT INTO poll_comment_likes (comment_id, patient_id) VALUES (?, ?)',
                [commentId, patientId]
            );
            liked = true;
        }

        const comments = await getPollComments(pollId, patientId, 30);

        if (global.io) {
            global.io.emit('poll:comment-like', {
                poll_id: pollId,
                comment_id: commentId
            });
        }

        res.json({
            success: true,
            liked,
            data: comments
        });
    } catch (error) {
        logger.error('Failed to toggle poll comment like', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal memproses like komentar' });
    }
});

module.exports = router;
