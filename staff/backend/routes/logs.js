// Activity Logs API Routes with Socket.io real-time support
// Save as /var/www/dokterdibya/staff/backend/routes/logs.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requirePermission } = require('../middleware/auth');

// GET /api/logs - Get recent activity logs
router.get('/api/logs', verifyToken, requirePermission('logs.view'), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const [rows] = await db.query(
            'SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ?',
            [limit]
        );
        
        res.json({
            success: true,
            data: rows
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
        
        const [result] = await db.query(
            'INSERT INTO activity_logs (user_id, user_name, action, details) VALUES (?, ?, ?, ?)',
            [user_id, user_name, action, details || null]
        );
        
        const [newLog] = await db.query(
            'SELECT * FROM activity_logs WHERE id = ?',
            [result.insertId]
        );
        
        // Emit to all connected clients via Socket.io
        if (router.io) {
            router.io.emit('newLog', newLog[0]);
        }
        
        res.json({
            success: true,
            message: 'Log created successfully',
            data: newLog[0]
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

// Export socket.io handler
router.setSocketIO = function(io) {
    router.io = io;
};

module.exports = router;

