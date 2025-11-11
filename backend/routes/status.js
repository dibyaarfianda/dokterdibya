// User Status API Routes with Socket.io real-time support
// Save as /var/www/dibyaklinik/backend/routes/status.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requirePermission } = require('../middleware/auth');

// GET /api/status/online - Get all online users
router.get('/api/status/online', verifyToken, requirePermission('dashboard.view'), async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM user_status WHERE is_online = TRUE ORDER BY last_seen DESC'
        );
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching online users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch online users',
            error: error.message
        });
    }
});

// POST /api/status/heartbeat - Update user's online status
router.post('/api/status/heartbeat', verifyToken, requirePermission('dashboard.view'), async (req, res) => {
    try {
        const { user_id, user_name } = req.body;
        
        if (!user_id || !user_name) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: user_id, user_name'
            });
        }
        
        // Update or insert user status
        await db.query(
            `INSERT INTO user_status (user_id, user_name, is_online, last_seen)
             VALUES (?, ?, TRUE, NOW())
             ON DUPLICATE KEY UPDATE
             user_name = VALUES(user_name),
             is_online = TRUE,
             last_seen = NOW()`,
            [user_id, user_name]
        );
        
        // Emit status update to all clients
        if (router.io) {
            const [users] = await db.query(
                'SELECT * FROM user_status WHERE is_online = TRUE'
            );
            router.io.emit('statusUpdate', users);
        }
        
        res.json({
            success: true,
            message: 'Status updated'
        });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update status',
            error: error.message
        });
    }
});

// POST /api/status/offline - Set user offline
router.post('/api/status/offline', verifyToken, requirePermission('dashboard.view'), async (req, res) => {
    try {
        const { user_id } = req.body;
        
        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: user_id'
            });
        }
        
        await db.query(
            'UPDATE user_status SET is_online = FALSE, last_seen = NOW() WHERE user_id = ?',
            [user_id]
        );
        
        // Emit status update to all clients
        if (router.io) {
            const [users] = await db.query(
                'SELECT * FROM user_status WHERE is_online = TRUE'
            );
            router.io.emit('statusUpdate', users);
        }
        
        res.json({
            success: true,
            message: 'User set offline'
        });
    } catch (error) {
        console.error('Error setting offline:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set offline',
            error: error.message
        });
    }
});

// Export socket.io handler
router.setSocketIO = function(io) {
    router.io = io;
};

module.exports = router;

