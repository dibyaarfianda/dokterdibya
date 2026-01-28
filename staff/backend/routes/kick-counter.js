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

// All routes require patient authentication
router.use(verifyPatientToken);

/**
 * POST /api/kick-counter/session
 * Start a new kick counting session
 */
router.post('/session', async (req, res) => {
    try {
        const patientId = req.user.id;
        const now = new Date();
        const sessionDate = now.toISOString().split('T')[0];

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
        const patientId = req.user.id;
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
        const patientId = req.user.id;
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
        const patientId = req.user.id;
        const today = new Date().toISOString().split('T')[0];

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
        const patientId = req.user.id;

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
            const dateStr = date.toISOString().split('T')[0];

            const dayData = weekData.find(d => {
                const dDate = new Date(d.date).toISOString().split('T')[0];
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
        const patientId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
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
        const patientId = req.user.id;
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
