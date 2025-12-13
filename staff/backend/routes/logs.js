/**
 * Activity Logs API Routes with Socket.io real-time support
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireSuperadmin, requireRoles } = require('../middleware/auth');
const activityLogger = require('../services/activityLogger');

// GET /api/logs - Get recent activity logs (staff with access)
router.get('/api/logs', verifyToken, async (req, res) => {
    try {
        const { user_id, action, start_date, end_date, limit, offset } = req.query;

        const logs = await activityLogger.getLogs({
            userId: user_id,
            action: action,
            startDate: start_date,
            endDate: end_date,
            limit: parseInt(limit) || 100,
            offset: parseInt(offset) || 0
        });

        res.json({
            success: true,
            data: logs,
            count: logs.length
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch logs',
            error: error.message
        });
    }
});

// GET /api/logs/summary - Get activity summary (superadmin only)
router.get('/api/logs/summary', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const summary = await activityLogger.getActionSummary(days);

        // Get total count
        const [totalResult] = await db.query(
            'SELECT COUNT(*) as total FROM activity_logs WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)',
            [days]
        );

        // Get unique users count
        const [usersResult] = await db.query(
            'SELECT COUNT(DISTINCT user_id) as unique_users FROM activity_logs WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)',
            [days]
        );

        // Get most active users
        const [activeUsers] = await db.query(
            `SELECT user_id, user_name, COUNT(*) as action_count, MAX(timestamp) as last_activity
             FROM activity_logs
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY user_id, user_name
             ORDER BY action_count DESC
             LIMIT 10`,
            [days]
        );

        res.json({
            success: true,
            data: {
                period_days: days,
                total_activities: totalResult[0].total,
                unique_users: usersResult[0].unique_users,
                by_action: summary,
                most_active_users: activeUsers
            }
        });
    } catch (error) {
        console.error('Error fetching log summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch summary',
            error: error.message
        });
    }
});

// GET /api/logs/user/:userId - Get activity for specific user (superadmin only)
router.get('/api/logs/user/:userId', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const days = parseInt(req.query.days) || 30;
        const limit = parseInt(req.query.limit) || 100;

        // Get summary
        const summary = await activityLogger.getUserSummary(userId, days);

        // Get recent logs
        const logs = await activityLogger.getLogs({
            userId: userId,
            limit: limit
        });

        // Get user info
        const [userInfo] = await db.query(
            'SELECT new_id as id, name, email, role FROM users WHERE new_id = ?',
            [userId]
        );

        res.json({
            success: true,
            data: {
                user: userInfo[0] || null,
                summary: summary,
                recent_logs: logs
            }
        });
    } catch (error) {
        console.error('Error fetching user logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user logs',
            error: error.message
        });
    }
});

// GET /api/logs/my - Get current user's activity
router.get('/api/logs/my', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 50;

        const logs = await activityLogger.getLogs({
            userId: userId,
            limit: limit
        });

        const summary = await activityLogger.getUserSummary(userId, 30);

        res.json({
            success: true,
            data: {
                logs: logs,
                summary: summary
            }
        });
    } catch (error) {
        console.error('Error fetching my logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch logs',
            error: error.message
        });
    }
});

// POST /api/logs - Create a new activity log
router.post('/api/logs', async (req, res) => {
    try {
        const { user_id, user_name, action, details } = req.body;

        if (!user_id || !user_name || !action) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: user_id, user_name, action'
            });
        }

        const newLog = await activityLogger.log(
            user_id,
            user_name,
            action,
            details,
            router.io
        );

        res.json({
            success: true,
            message: 'Log created successfully',
            data: newLog
        });
    } catch (error) {
        console.error('Error creating log:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create log',
            error: error.message
        });
    }
});

// GET /api/logs/actions - Get list of distinct actions for filtering
router.get('/api/logs/actions', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT DISTINCT action FROM activity_logs ORDER BY action'
        );
        res.json({
            success: true,
            data: rows.map(r => r.action)
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch actions'
        });
    }
});

// Export socket.io handler
router.setSocketIO = function(io) {
    router.io = io;
};

module.exports = router;
