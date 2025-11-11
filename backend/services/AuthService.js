/**
 * Authentication Service
 * Business logic for user authentication
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../utils/database');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { HTTP_STATUS, ERROR_MESSAGES, SUCCESS_MESSAGES } = require('../config/constants');

if (!process.env.JWT_SECRET) {
    logger.error('FATAL: JWT_SECRET is not set in environment variables');
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

class AuthService {
    /**
     * Authenticate user with username and password
     */
    async login(username, password) {
        // Find user
        const user = await db.queryOne(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (!user) {
            logger.warn('Login failed: user not found', { username });
            throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
        }
        
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
            logger.warn('Login failed: invalid password', { username, userId: user.id });
            throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
        }
        
        // Generate token
        const token = this._generateToken(user);
        
        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        
        logger.info('User logged in successfully', { username, userId: user.id });
        
        return {
            token,
            user: userWithoutPassword
        };
    }
    
    /**
     * Get user by ID
     */
    async getUserById(userId) {
        const user = await db.queryOne(
            'SELECT id, username, full_name, role FROM users WHERE id = ?',
            [userId]
        );
        
        if (!user) {
            throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
        }
        
        return user;
    }
    
    /**
     * Change user password
     */
    async changePassword(userId, oldPassword, newPassword) {
        // Get user with password
        const user = await db.queryOne(
            'SELECT * FROM users WHERE id = ?',
            [userId]
        );
        
        if (!user) {
            throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
        }
        
        // Verify old password
        const isValidPassword = await bcrypt.compare(oldPassword, user.password);
        
        if (!isValidPassword) {
            logger.warn('Password change failed: invalid old password', { userId });
            throw new AppError('Invalid old password', HTTP_STATUS.BAD_REQUEST);
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password
        await db.updateById('users', userId, { password: hashedPassword });
        
        logger.info('Password changed successfully', { userId, username: user.username });
    }
    
    /**
     * Reset user password (admin function)
     */
    async resetPassword(userId, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        const affectedRows = await db.updateById('users', userId, { 
            password: hashedPassword 
        });
        
        if (affectedRows === 0) {
            throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
        }
        
        logger.info('Password reset by admin', { userId });
    }
    
    /**
     * Verify JWT token
     */
    verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            logger.warn('Token verification failed', { error: error.message });
            throw new AppError('Invalid or expired token', HTTP_STATUS.UNAUTHORIZED);
        }
    }
    
    /**
     * Generate JWT token
     */
    _generateToken(user) {
        return jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
    }
}

module.exports = new AuthService();
