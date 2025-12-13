/**
 * Activity Logger Service
 * Server-side activity logging for audit trails
 */

const db = require('../db');
const logger = require('../utils/logger');

// Action types
const ACTIONS = {
    // Auth
    LOGIN: 'Login',
    LOGOUT: 'Logout',
    LOGIN_FAILED: 'Login Failed',
    PASSWORD_CHANGE: 'Password Change',

    // Patients
    VIEW_PATIENT: 'View Patient',
    ADD_PATIENT: 'Add Patient',
    UPDATE_PATIENT: 'Update Patient',
    DELETE_PATIENT: 'Delete Patient',

    // Medical Records
    CREATE_MR: 'Create Medical Record',
    UPDATE_MR: 'Update Medical Record',
    DELETE_MR: 'Delete Medical Record',
    PRINT_RESUME: 'Print Resume Medis',

    // Documents
    SEND_DOCUMENT: 'Send Document',
    VIEW_DOCUMENT: 'View Document',
    SHARE_DOCUMENT: 'Share Document',

    // Inventory
    ADD_INVENTORY: 'Add Inventory',
    UPDATE_INVENTORY: 'Update Inventory',
    DELETE_INVENTORY: 'Delete Inventory',

    // Billing
    CREATE_INVOICE: 'Create Invoice',
    UPDATE_INVOICE: 'Update Invoice',
    FINALIZE_VISIT: 'Finalize Visit',

    // Admin
    UPDATE_ROLE: 'Update Role',
    UPDATE_USER: 'Update User',
    UPDATE_VISIBILITY: 'Update Visibility'
};

/**
 * Log an activity
 * @param {string} userId - User ID
 * @param {string} userName - User name
 * @param {string} action - Action type
 * @param {string} details - Additional details
 * @param {object} io - Socket.io instance for real-time broadcast (optional)
 */
async function log(userId, userName, action, details = null, io = null) {
    try {
        const [result] = await db.query(
            'INSERT INTO activity_logs (user_id, user_name, action, details) VALUES (?, ?, ?, ?)',
            [userId, userName, action, details]
        );

        // Fetch the created log
        const [logs] = await db.query(
            'SELECT * FROM activity_logs WHERE id = ?',
            [result.insertId]
        );

        const newLog = logs[0];

        // Broadcast via socket if available
        if (io) {
            io.emit('newLog', newLog);
        }

        logger.info(`Activity: ${action}`, {
            userId,
            userName,
            action,
            details
        });

        return newLog;
    } catch (error) {
        logger.error('Failed to log activity', {
            error: error.message,
            userId,
            action
        });
        // Don't throw - logging should not break operations
        return null;
    }
}

/**
 * Log from request context (extracts user from req.user)
 */
async function logFromRequest(req, action, details = null, io = null) {
    if (!req.user) {
        logger.warn('Cannot log activity: no user in request');
        return null;
    }

    return log(
        req.user.id,
        req.user.name || req.user.email || 'Unknown',
        action,
        details,
        io
    );
}

/**
 * Get activity logs with optional filters
 */
async function getLogs(options = {}) {
    const {
        userId,
        action,
        startDate,
        endDate,
        limit = 100,
        offset = 0
    } = options;

    let query = 'SELECT * FROM activity_logs WHERE 1=1';
    const params = [];

    if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
    }

    if (action) {
        query += ' AND action = ?';
        params.push(action);
    }

    if (startDate) {
        query += ' AND timestamp >= ?';
        params.push(startDate);
    }

    if (endDate) {
        query += ' AND timestamp <= ?';
        params.push(endDate);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [rows] = await db.query(query, params);
    return rows;
}

/**
 * Get activity summary by user
 */
async function getUserSummary(userId, days = 7) {
    const [rows] = await db.query(
        `SELECT action, COUNT(*) as count, MAX(timestamp) as last_activity
         FROM activity_logs
         WHERE user_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY action
         ORDER BY count DESC`,
        [userId, days]
    );
    return rows;
}

/**
 * Get activity summary by action
 */
async function getActionSummary(days = 7) {
    const [rows] = await db.query(
        `SELECT action, COUNT(*) as count, COUNT(DISTINCT user_id) as unique_users
         FROM activity_logs
         WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY action
         ORDER BY count DESC`,
        [days]
    );
    return rows;
}

module.exports = {
    ACTIONS,
    log,
    logFromRequest,
    getLogs,
    getUserSummary,
    getActionSummary
};
