// Auth API for VPS (save as /var/www/dokterdibya/staff/backend/routes/auth.js)
const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { verifyToken, JWT_SECRET } = require('../middleware/auth');
const { validateLogin, validatePasswordChange } = require('../middleware/validation');
const { asyncHandler, AppError, handleDatabaseError } = require('../middleware/errorHandler');
const { sendSuccess, sendError } = require('../utils/response');
const { HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } = require('../config/constants');
const logger = require('../utils/logger');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// POST /api/auth/login
router.post('/api/auth/login', validateLogin, asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const [rows] = await db.query(
        `SELECT 
            u.id,
            u.name,
            u.email,
            u.password_hash,
            u.role,
            u.role_id,
            u.photo_url,
            r.name AS resolved_role_name,
            r.display_name AS resolved_role_display
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.email = ?`,
        [email]
    );

    if (rows.length === 0) {
        console.log('User not found in database');
        throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
    }

    const user = rows[0];

    const isPasswordValid = await bcrypt.compare(password, user.password_hash || '');

    const resolvedRole = user.role || user.resolved_role_name || null;
    const resolvedRoleDisplay = user.resolved_role_display || resolvedRole || null;
    const roleForToken = resolvedRole || 'viewer';

    if (!user.role && user.resolved_role_name) {
        try {
            await db.query('UPDATE users SET role = ? WHERE id = ?', [user.resolved_role_name, user.id]);
        } catch (updateErr) {
            logger.warn(`Failed to backfill role column for user ${user.id}: ${updateErr.message}`);
        }
    }

    if (!isPasswordValid) {
        throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
    }

    const token = jwt.sign(
        { id: user.id, email: user.email, role: roleForToken },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info(`User logged in: ${user.email}`);

    sendSuccess(res, {
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: roleForToken,
            role_id: user.role_id || null,
            role_display_name: resolvedRoleDisplay || roleForToken,
            photo_url: user.photo_url
        }
    }, SUCCESS_MESSAGES.LOGIN_SUCCESS);
}));

// GET /api/auth/me
router.get('/api/auth/me', verifyToken, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    
    if (!userId) {
        throw new AppError('Invalid token payload', HTTP_STATUS.BAD_REQUEST);
    }

    const [rows] = await db.query(
        `SELECT 
            u.id,
            u.name,
            u.email,
            u.role,
            u.role_id,
            u.photo_url,
            r.name AS resolved_role_name,
            r.display_name AS resolved_role_display
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.id = ?`,
        [userId]
    );

    if (rows.length === 0) {
        throw new AppError(ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const user = rows[0];
    const resolvedRole = user.role || user.resolved_role_name || null;
    const resolvedRoleDisplay = user.resolved_role_display || resolvedRole || null;
    const roleForClient = resolvedRole || 'viewer';

    sendSuccess(res, { 
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: roleForClient,
            role_id: user.role_id || null,
            role_display_name: resolvedRoleDisplay || roleForClient,
            photo_url: user.photo_url
        }
    });
}));

// PUT /api/auth/profile - Update user profile
router.put('/api/auth/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(400).json({ success: false, message: 'Invalid token payload' });
        
        const { name, photo_url } = req.body;
        
        // Build update query dynamically based on what's provided
        const updates = [];
        const values = [];
        
        if (name) {
            updates.push('name = ?');
            updates.push('display_name = ?');
            values.push(name, name);
        }
        
        if (photo_url !== undefined) {
            updates.push('photo_url = ?');
            values.push(photo_url);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        
        values.push(userId);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        await db.query(query, values);
        
        res.json({ success: true, message: 'Profile updated' });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ success: false, message: 'Failed to update profile', error: err.message });
    }
});

// POST /api/auth/change-password - Change user password
router.post('/api/auth/change-password', verifyToken, validatePasswordChange, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    
    if (!userId) {
        throw new AppError('Invalid token payload', HTTP_STATUS.BAD_REQUEST);
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    
    if (rows.length === 0) {
        throw new AppError(ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    
    if (!isPasswordValid) {
        throw new AppError('Invalid current password', HTTP_STATUS.UNAUTHORIZED);
    }

    // Hash and update new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [newPasswordHash, userId]);

    logger.info(`Password changed for user ID: ${userId}`);

    sendSuccess(res, null, SUCCESS_MESSAGES.PASSWORD_CHANGED);
}));

module.exports = router;


