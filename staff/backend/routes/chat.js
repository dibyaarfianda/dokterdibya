// Chat API Routes with Socket.io real-time support
// Save as /var/www/dokterdibya/staff/backend/routes/chat.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const { validateChatMessage } = require('../middleware/validation');
const { verifyToken } = require('../middleware/auth');

// GET /api/chat/messages - Get recent chat messages
// All authenticated users have access to chat (no specific permission required)
router.get('/api/chat/messages', verifyToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const [rows] = await db.query(
            'SELECT id, user_id, user_name, user_photo, message, timestamp as created_at FROM chat_messages ORDER BY timestamp DESC LIMIT ?',
            [limit]
        );
        
        // Reverse to show oldest first
        rows.reverse();
        
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching chat messages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chat messages',
            error: error.message
        });
    }
});

// POST /api/chat/send - Send a chat message
// All authenticated users have access to chat (no specific permission required)
router.post('/api/chat/send', verifyToken, validateChatMessage, async (req, res) => {
    try {
        const userId = req.user?.id;
        const userEmail = req.user?.email;
        const { message } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

    let userName = null;
    let finalPhoto = null;
    const requestPhoto = typeof req.body.user_photo === 'string' ? req.body.user_photo : null;

        try {
            const [userRows] = await db.query(
                'SELECT name, email, photo_url FROM users WHERE new_id = ? LIMIT 1',
                [userId]
            );

            if (userRows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User profile not found'
                });
            }

            const userRecord = userRows[0];
            userName = userRecord.name || userRecord.email || userEmail;
            finalPhoto = userRecord.photo_url || null;
            if (finalPhoto && finalPhoto.startsWith('data:')) {
                finalPhoto = null;
            }
            if (finalPhoto && finalPhoto.length > 1000) {
                finalPhoto = null;
            }
        } catch (lookupError) {
            console.warn('Failed to fetch chat user profile:', lookupError.message);
            userName = userEmail || 'Pengguna';
        }

        const [result] = await db.query(
            'INSERT INTO chat_messages (user_id, user_name, user_photo, message, timestamp) VALUES (?, ?, ?, ?, NOW())',
            [userId, userName, finalPhoto, message]
        );
        
        const [newMessage] = await db.query(
            'SELECT id, user_id, user_name, user_photo, message, timestamp as created_at FROM chat_messages WHERE id = ?',
            [result.insertId]
        );

        if (newMessage.length > 0) {
            if (!newMessage[0].user_name && userName) {
                newMessage[0].user_name = userName;
            }
            if (!newMessage[0].user_photo) {
                if (finalPhoto) {
                    newMessage[0].user_photo = finalPhoto;
                } else if (requestPhoto) {
                    newMessage[0].user_photo = requestPhoto;
                }
            }
        }
        
        // Emit to all connected clients via Socket.io
        if (router.io) {
            router.io.emit('chat:message', newMessage[0]);
        }
        
        res.json({
            success: true,
            message: 'Message sent successfully',
            data: newMessage[0]
        });
    } catch (error) {
        console.error('Error sending chat message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
});

// Export socket.io handler
router.setSocketIO = function(io) {
    router.io = io;
};

module.exports = router;

