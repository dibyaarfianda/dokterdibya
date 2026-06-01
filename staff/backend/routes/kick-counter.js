/**
 * Kick Counter API Routes
 *
 * Allows patients to track fetal movements (kicks)
 * Recommended: 10+ kicks in 2 hours is normal
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyPatientToken } = require('../middleware/auth');

const MAX_ACTIVE_SESSION_MINUTES = 120;

let tablesReady = false;
let tablesPromise = null;

async function ensureKickCounterTables() {
    if (tablesReady) return;
    if (tablesPromise) return tablesPromise;

    tablesPromise = (async () => {
        await db.query(`
            CREATE TABLE IF NOT EXISTS kick_counter_sessions (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                patient_id VARCHAR(50) NOT NULL,
                session_date DATE NOT NULL,
                start_time DATETIME NOT NULL,
                end_time DATETIME NULL,
                kick_count INT NOT NULL DEFAULT 0,
                duration_minutes INT NULL,
                status ENUM('active','completed') NOT NULL DEFAULT 'active',
                notes TEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_kick_sessions_patient_date (patient_id, session_date),
                KEY idx_kick_sessions_patient_status (patient_id, status),
                KEY idx_kick_sessions_start_time (start_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS kick_counter_kicks (
                id INT UNSIGNED NOT NULL AUTO_INCREMENT,
                session_id INT UNSIGNED NOT NULL,
                kick_time DATETIME NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_kicks_session (session_id),
                KEY idx_kicks_time (kick_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        tablesReady = true;
    })().catch((error) => {
        tablesPromise = null;
        throw error;
    });

    return tablesPromise;
}

function formatDateLocal(dateValue = new Date()) {
    const d = new Date(dateValue);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getPatientId(req) {
    return req.patient?.id ||
        req.patient?.patientId ||
        req.patient?.patient_id ||
        req.user?.id ||
        req.user?.patientId ||
        req.user?.patient_id ||
        req.user?.medicalRecordId;
}

function requirePatientId(req, res) {
    const patientId = getPatientId(req);
    if (!patientId) {
        res.status(401).json({
            success: false,
            message: 'Patient ID tidak ditemukan di token'
        });
        return null;
    }
    return patientId;
}

function setNoCacheHeaders(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
}

async function closeStaleActiveSessions(patientId) {
    if (!patientId) return 0;

    const [result] = await db.query(
        `UPDATE kick_counter_sessions
         SET status = 'completed',
             end_time = DATE_ADD(start_time, INTERVAL ? MINUTE),
             duration_minutes = ?
         WHERE patient_id = ?
           AND status = 'active'
           AND (
                session_date < CURDATE()
                OR start_time <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
           )`,
        [MAX_ACTIVE_SESSION_MINUTES, MAX_ACTIVE_SESSION_MINUTES, patientId, MAX_ACTIVE_SESSION_MINUTES]
    );

    return Number(result?.affectedRows || 0);
}

router.use(setNoCacheHeaders);

// All routes require patient authentication
router.use(verifyPatientToken);
router.use(async (req, res, next) => {
    try {
        await ensureKickCounterTables();
        next();
    } catch (error) {
        console.error('Error ensuring kick counter tables:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menyiapkan data kick counter'
        });
    }
});

/**
 * POST /api/kick-counter/session
 * Start a new kick counting session
 */
router.post('/session', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        const now = new Date();
        const sessionDate = formatDateLocal(now);

        // Auto-recover stale active sessions from previous days or overlong sessions.
        await closeStaleActiveSessions(patientId);

        // Check if there's already an active session
        const [existing] = await db.query(
            `SELECT id FROM kick_counter_sessions
             WHERE patient_id = ? AND status = 'active'
             LIMIT 1`,
            [patientId]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Sudah ada sesi aktif. Selesaikan dulu sebelum memulai yang baru.'
            });
        }

        // Create new session
        const [result] = await db.query(
            `INSERT INTO kick_counter_sessions
             (patient_id, session_date, start_time, status)
             VALUES (?, ?, NOW(), 'active')`,
            [patientId, sessionDate]
        );

        const [session] = await db.query(
            `SELECT * FROM kick_counter_sessions WHERE id = ?`,
            [result.insertId]
        );

        res.json({
            success: true,
            session: session[0]
        });
    } catch (error) {
        console.error('Error starting kick session:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/kick-counter/kick
 * Record a single kick
 */
router.post('/kick', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        const { session_id } = req.body;

        if (!session_id) {
            return res.status(400).json({
                success: false,
                message: 'session_id diperlukan'
            });
        }

        // Verify session belongs to patient and is active
        const [sessions] = await db.query(
            `SELECT * FROM kick_counter_sessions
             WHERE id = ? AND patient_id = ? AND status = 'active'`,
            [session_id, patientId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sesi tidak ditemukan atau sudah selesai'
            });
        }

        // Record the kick
        const [kickResult] = await db.query(
            `INSERT INTO kick_counter_kicks (session_id, kick_time) VALUES (?, NOW())`,
            [session_id]
        );

        // Update session kick count
        await db.query(
            `UPDATE kick_counter_sessions
             SET kick_count = kick_count + 1,
                 duration_minutes = TIMESTAMPDIFF(MINUTE, start_time, NOW())
             WHERE id = ?`,
            [session_id]
        );

        // Get updated session
        const [updated] = await db.query(
            `SELECT kick_count, duration_minutes FROM kick_counter_sessions WHERE id = ?`,
            [session_id]
        );

        res.json({
            success: true,
            kick: {
                id: kickResult.insertId,
                kick_time: new Date().toISOString()
            },
            session: updated[0]
        });
    } catch (error) {
        console.error('Error recording kick:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * PUT /api/kick-counter/session/:id/end
 * End a counting session
 */
router.put('/session/:id/end', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        const sessionId = req.params.id;

        // Verify session belongs to patient
        const [sessions] = await db.query(
            `SELECT * FROM kick_counter_sessions
             WHERE id = ? AND patient_id = ?`,
            [sessionId, patientId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sesi tidak ditemukan'
            });
        }

        // End the session
        await db.query(
            `UPDATE kick_counter_sessions
             SET status = 'completed',
                 end_time = NOW(),
                 duration_minutes = TIMESTAMPDIFF(MINUTE, start_time, NOW())
             WHERE id = ?`,
            [sessionId]
        );

        // Get updated session
        const [updated] = await db.query(
            `SELECT * FROM kick_counter_sessions WHERE id = ?`,
            [sessionId]
        );

        res.json({
            success: true,
            session: updated[0]
        });
    } catch (error) {
        console.error('Error ending kick session:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/kick-counter/today
 * Get today's sessions
 */
router.get('/today', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        const today = formatDateLocal();

        // Keep today's summary clean by closing stale active sessions first.
        await closeStaleActiveSessions(patientId);

        const [sessions] = await db.query(
            `SELECT * FROM kick_counter_sessions
             WHERE patient_id = ? AND session_date = ?
             ORDER BY start_time DESC`,
            [patientId, today]
        );

        // Calculate today's total
        const totalKicks = sessions.reduce((sum, s) => sum + s.kick_count, 0);
        const totalSessions = sessions.length;

        // Check for alert condition
        const currentHour = new Date().getHours();
        const alert = totalKicks < 10 && currentHour >= 18;

        res.json({
            success: true,
            sessions,
            summary: {
                total_kicks: totalKicks,
                total_sessions: totalSessions,
                avg_per_session: totalSessions > 0 ? Math.round(totalKicks / totalSessions * 10) / 10 : 0
            },
            alert,
            alert_message: alert ? 'Gerakan bayi hari ini kurang dari 10 kali. Hubungi dokter jika khawatir.' : null
        });
    } catch (error) {
        console.error('Error getting today sessions:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/kick-counter/stats
 * Get weekly statistics for chart
 */
router.get('/stats', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;

        // Get last 7 days data
        const [weekData] = await db.query(
            `SELECT
                session_date as date,
                SUM(kick_count) as kicks,
                COUNT(*) as sessions
             FROM kick_counter_sessions
             WHERE patient_id = ?
               AND session_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY session_date
             ORDER BY session_date ASC`,
            [patientId]
        );

        // Fill in missing days with 0
        const week = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = formatDateLocal(date);

            const dayData = weekData.find(d => {
                const dDate = formatDateLocal(d.date);
                return dDate === dateStr;
            });

            week.push({
                date: dateStr,
                kicks: dayData ? parseInt(dayData.kicks) : 0,
                sessions: dayData ? parseInt(dayData.sessions) : 0
            });
        }

        // Calculate average
        const totalKicks = week.reduce((sum, d) => sum + d.kicks, 0);
        const daysWithData = week.filter(d => d.kicks > 0).length;
        const averageDaily = daysWithData > 0 ? Math.round(totalKicks / daysWithData * 10) / 10 : 0;

        // Today's data
        const today = week[week.length - 1];
        const currentHour = new Date().getHours();
        const alert = today.kicks < 10 && currentHour >= 18;

        res.json({
            success: true,
            stats: {
                today: {
                    kicks: today.kicks,
                    sessions: today.sessions
                },
                week,
                average_daily: averageDaily,
                alert,
                alert_message: alert ? 'Gerakan bayi hari ini kurang dari 10 kali. Hubungi dokter jika khawatir.' : null
            }
        });
    } catch (error) {
        console.error('Error getting kick stats:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/kick-counter/history
 * Get historical sessions (paginated)
 */
router.get('/history', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const requestedLimit = parseInt(req.query.limit, 10) || 20;
        const limit = Math.min(Math.max(requestedLimit, 1), 50);
        const offset = (page - 1) * limit;

        const [sessions] = await db.query(
            `SELECT * FROM kick_counter_sessions
             WHERE patient_id = ?
             ORDER BY session_date DESC, start_time DESC
             LIMIT ? OFFSET ?`,
            [patientId, limit, offset]
        );

        const [countResult] = await db.query(
            `SELECT COUNT(*) as total FROM kick_counter_sessions WHERE patient_id = ?`,
            [patientId]
        );

        res.json({
            success: true,
            sessions,
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error('Error getting kick history:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * DELETE /api/kick-counter/session/:id
 * Delete a session
 */
router.delete('/session/:id', async (req, res) => {
    try {
        const patientId = requirePatientId(req, res);
        if (!patientId) return;
        const sessionId = req.params.id;

        // Verify session belongs to patient
        const [sessions] = await db.query(
            `SELECT * FROM kick_counter_sessions
             WHERE id = ? AND patient_id = ?`,
            [sessionId, patientId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sesi tidak ditemukan'
            });
        }

        // Delete kicks first (FK constraint)
        await db.query(
            `DELETE FROM kick_counter_kicks WHERE session_id = ?`,
            [sessionId]
        );

        // Delete session
        await db.query(
            `DELETE FROM kick_counter_sessions WHERE id = ?`,
            [sessionId]
        );

        res.json({
            success: true,
            message: 'Sesi berhasil dihapus'
        });
    } catch (error) {
        console.error('Error deleting kick session:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
