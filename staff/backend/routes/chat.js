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
        // JOIN with users table only for name and role_id (not photo_url - it's a LONGTEXT with base64 data)
        const [rows] = await db.query(
            `SELECT
                cm.id,
                cm.user_id,
                COALESCE(u.name, cm.user_name) as user_name,
                cm.user_photo,
                u.role_id,
                cm.message,
                cm.timestamp as created_at
            FROM chat_messages cm
            LEFT JOIN users u ON cm.user_id = u.new_id
            ORDER BY cm.timestamp DESC
            LIMIT ?`,
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
    let userRoleId = null;
    const requestPhoto = typeof req.body.user_photo === 'string' ? req.body.user_photo : null;

        try {
            const [userRows] = await db.query(
                'SELECT name, email, role_id FROM users WHERE new_id = ? LIMIT 1',
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
            finalPhoto = null; // photo stored at message-send time; avoid fetching 466KB base64 LONGTEXT
            userRoleId = userRecord.role_id || null;
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
            // Add role_id for badge color in chat
            newMessage[0].role_id = userRoleId;
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

// GET /api/users/:userId/photo - Serve staff profile photo (public, no auth needed for img src)
router.get('/api/users/:userId/photo', async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await db.query(
            'SELECT photo_url FROM users WHERE new_id = ? LIMIT 1',
            [userId]
        );

        if (!rows.length || !rows[0].photo_url) {
            return res.redirect('/staff/public/images/avatarwanita.png');
        }

        const photo = rows[0].photo_url;

        // If it's a relative or absolute URL path, redirect to it
        if (photo.startsWith('/') || photo.startsWith('http')) {
            return res.redirect(photo);
        }

        // If it's a base64 data URL (data:image/...), parse and serve as binary
        const match = photo.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match) {
            const mimeType = match[1];
            const buffer = Buffer.from(match[2], 'base64');
            res.set('Content-Type', mimeType);
            res.set('Cache-Control', 'public, max-age=3600');
            return res.send(buffer);
        }

        // Fallback
        res.redirect('/staff/public/images/avatarwanita.png');
    } catch (err) {
        console.error('Error serving user photo:', err);
        res.redirect('/staff/public/images/avatarwanita.png');
    }
});

module.exports = router;

