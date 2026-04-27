const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken, verifyPatientToken } = require('../middleware/auth');

let tablesReady = false;
let tableSetupPromise = null;

async function ensureVotingTables() {
    if (tablesReady) {
        return;
    }

    if (tableSetupPromise) {
        await tableSetupPromise;
        return;
    }

    tableSetupPromise = (async () => {
        await db.query(`
            CREATE TABLE IF NOT EXISTS polls (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(180) NOT NULL,
                description TEXT NULL,
                status ENUM('active','closed') NOT NULL DEFAULT 'active',
                show_on_open TINYINT(1) NOT NULL DEFAULT 1,
                created_by VARCHAR(120) NULL,
                created_by_name VARCHAR(190) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                closed_at DATETIME NULL,
                INDEX idx_polls_status_created (status, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS poll_options (
                id INT AUTO_INCREMENT PRIMARY KEY,
                poll_id INT NOT NULL,
                option_text VARCHAR(255) NOT NULL,
                option_order INT NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_poll_options_poll (poll_id),
                CONSTRAINT fk_poll_options_poll
                    FOREIGN KEY (poll_id) REFERENCES polls(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS poll_votes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                poll_id INT NOT NULL,
                option_id INT NOT NULL,
                patient_id VARCHAR(64) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_poll_patient (poll_id, patient_id),
                INDEX idx_poll_votes_poll (poll_id),
                INDEX idx_poll_votes_option (option_id),
                CONSTRAINT fk_poll_votes_poll
                    FOREIGN KEY (poll_id) REFERENCES polls(id)
                    ON DELETE CASCADE,
                CONSTRAINT fk_poll_votes_option
                    FOREIGN KEY (option_id) REFERENCES poll_options(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        tablesReady = true;
    })();

    try {
        await tableSetupPromise;
    } finally {
        tableSetupPromise = null;
    }
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

function extractUserId(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload.uid || payload.id || payload.user_id || payload.email || null;
}

function extractUserName(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return payload.name || payload.displayName || payload.fullName || payload.email || null;
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

async function notifyPatientsForNewPoll(poll) {
    try {
        const [patients] = await db.query(`
            SELECT id
            FROM patients
            WHERE status != 'deleted' OR status IS NULL
        `);

        if (!patients.length) {
            return;
        }

        const title = `Voting Baru: ${String(poll.title || '').substring(0, 80)}`;
        const description = String(poll.description || '').trim();
        const message = description.length
            ? description.substring(0, 180)
            : 'Buka portal pasien untuk ikut voting terbaru.';

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
                'Voting Baru',
                String(poll.title || '').substring(0, 100),
                {
                    type: 'poll',
                    poll_id: String(poll.id),
                    url: '/patient-menu.html#voting'
                }
            );
        } catch (pushError) {
            logger.warn('Poll push broadcast failed', { error: pushError.message, pollId: poll.id });
        }
    } catch (error) {
        logger.error('Failed to notify patients for new poll', {
            pollId: poll.id,
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

        notifyPatientsForNewPoll(poll).catch(() => {});

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

        res.json({
            success: true,
            data: {
                ...fullResult,
                has_voted: selectedOptionId !== null,
                selected_option_id: selectedOptionId
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
                selected_option_id: optionId
            }
        });
    } catch (error) {
        logger.error('Failed to submit poll vote', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal menyimpan vote' });
    }
});

module.exports = router;
