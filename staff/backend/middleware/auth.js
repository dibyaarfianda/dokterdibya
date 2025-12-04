const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { ROLE_IDS, ROLE_NAMES, isSuperadminRole, isAdminRole } = require('../constants/roles');

// Ensure JWT_SECRET is set - fail fast if not
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('\x1b[31m%s\x1b[0m', 'FATAL ERROR: JWT_SECRET environment variable is not defined.');
    console.error('\x1b[31m%s\x1b[0m', 'Please set JWT_SECRET in your .env file before starting the server.');
    process.exit(1);
}

// Track failed login attempts (in production, use Redis)
const failedAttempts = new Map();
const MAX_FAILED_ATTEMPTS = parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS) || 5;
const LOCK_TIME_MS = parseInt(process.env.LOGIN_LOCK_TIME_MS) || 15 * 60 * 1000; // 15 minutes

/**
 * Record failed login attempt
 */
function recordFailedAttempt(email) {
    const key = email.toLowerCase();
    const now = Date.now();
    
    if (!failedAttempts.has(key)) {
        failedAttempts.set(key, []);
    }
    
    const attempts = failedAttempts.get(key);
    
    // Remove old attempts outside lock window
    const recentAttempts = attempts.filter(t => now - t < LOCK_TIME_MS);
    failedAttempts.set(key, [...recentAttempts, now]);
    
    return failedAttempts.get(key).length;
}

/**
 * Check if account is locked
 */
function isAccountLocked(email) {
    const key = email.toLowerCase();
    const now = Date.now();
    
    if (!failedAttempts.has(key)) {
        return false;
    }
    
    const attempts = failedAttempts.get(key);
    const recentAttempts = attempts.filter(t => now - t < LOCK_TIME_MS);
    
    return recentAttempts.length >= MAX_FAILED_ATTEMPTS;
}

/**
 * Clear failed attempts
 */
function clearFailedAttempts(email) {
    failedAttempts.delete(email.toLowerCase());
}

/**
 * Middleware to verify JWT token from Authorization header
 * Enhanced with better error logging and context tracking
 */
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const requestId = req.context?.requestId || 'unknown';
    
    if (!authHeader) {
        logger.warn('Missing authorization header', {
            requestId,
            ip: req.ip,
            path: req.path
        });
        return res.status(401).json({ 
            success: false, 
            message: 'Missing authorization header' 
        });
    }

    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        logger.warn('Invalid authorization header format', {
            requestId,
            format: parts[0],
            ip: req.ip
        });
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid authorization header format. Expected: Bearer <token>' 
        });
    }

    const token = parts[1];

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        
        // Log successful authentication
        logger.debug('Token verified successfully', {
            requestId,
            userId: payload.id,
            email: payload.email
        });
        
        next();
    } catch (err) {
        logger.warn('Token verification failed', {
            requestId,
            errorName: err.name,
            message: err.message,
            ip: req.ip
        });
        
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: 'Token has expired' 
            });
        }
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid token' 
        });
    }
}

/**
 * Middleware to check if user has required role
 * Now uses role_id (INT) for consistency
 * @param {...number} allowedRoleIds - Role IDs from ROLE_IDS constants
 */
function requireRole(...allowedRoleIds) {
    return (req, res, next) => {
        const requestId = req.context?.requestId || 'unknown';

        if (!req.user) {
            logger.warn('Missing user in requireRole middleware', {
                requestId,
                ip: req.ip,
                path: req.path
            });
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const userRoleId = req.user.role_id;

        // Superadmin (dokter) always has access
        if (req.user.is_superadmin || isSuperadminRole(userRoleId)) {
            logger.debug('Superadmin access granted', {
                requestId,
                userId: req.user.id,
                role_id: userRoleId
            });
            return next();
        }

        if (!allowedRoleIds.includes(userRoleId)) {
            logger.warn('Insufficient permissions', {
                requestId,
                userId: req.user.id,
                userRoleId,
                allowedRoleIds,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        logger.debug('Role authorization successful', {
            requestId,
            userId: req.user.id,
            role_id: userRoleId
        });

        next();
    };
}

/**
 * Middleware to verify patient JWT token
 * Similar to verifyToken but ensures user is a patient
 */
function verifyPatientToken(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const requestId = req.context?.requestId || 'unknown';

    if (!authHeader) {
        logger.warn('Missing authorization header (patient)', {
            requestId,
            ip: req.ip,
            path: req.path
        });
        return res.status(401).json({
            success: false,
            message: 'Missing authorization header'
        });
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({
            success: false,
            message: 'Invalid authorization header format'
        });
    }

    const token = parts[1];

    try {
        const payload = jwt.verify(token, JWT_SECRET);

        // Ensure this is a patient token
        if (payload.user_type !== 'patient' && payload.role !== 'patient') {
            logger.warn('Non-patient token used on patient endpoint', {
                requestId,
                userId: payload.id,
                userType: payload.user_type,
                role: payload.role
            });
            return res.status(403).json({
                success: false,
                message: 'This endpoint is for patients only'
            });
        }

        req.patient = payload;
        req.user = payload; // Also set req.user for compatibility

        logger.debug('Patient token verified', {
            requestId,
            patientId: payload.id,
            email: payload.email
        });

        next();
    } catch (err) {
        logger.warn('Patient token verification failed', {
            requestId,
            errorName: err.name,
            message: err.message,
            ip: req.ip
        });

        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired'
            });
        }
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
}

/**
 * Optional authentication middleware (doesn't fail if missing)
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    
    if (!authHeader) {
        return next(); // Continue without authentication
    }
    
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return next(); // Continue without authentication
    }

    const token = parts[1];

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
    } catch (err) {
        logger.debug('Optional auth token verification failed', { error: err.message });
    }
    
    next();
}

/**
 * Middleware to require superadmin access
 * Only allows users with is_superadmin=true or role_id=1 (dokter)
 */
function requireSuperadmin(req, res, next) {
    const requestId = req.context?.requestId || 'unknown';

    if (!req.user) {
        logger.warn('Missing user in requireSuperadmin middleware', {
            requestId,
            ip: req.ip,
            path: req.path
        });
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    if (req.user.is_superadmin || isSuperadminRole(req.user.role_id)) {
        logger.debug('Superadmin access granted', {
            requestId,
            userId: req.user.id,
            role_id: req.user.role_id,
            is_superadmin: req.user.is_superadmin
        });
        return next();
    }

    logger.warn('Superadmin access denied', {
        requestId,
        userId: req.user.id,
        role_id: req.user.role_id,
        path: req.path
    });
    return res.status(403).json({
        success: false,
        message: 'Superadmin access required'
    });
}

/**
 * Simple role-based access control middleware
 * Replaces the complex permission system with simple role checking
 * @param {...string} allowedRoles - Role names that are allowed (e.g., 'dokter', 'bidan', 'administrasi')
 *
 * Usage: requireRoles('dokter', 'bidan', 'managerial')
 * Superadmin/dokter always has access regardless of allowedRoles
 */
function requireRoles(...allowedRoles) {
    return (req, res, next) => {
        const requestId = req.context?.requestId || 'unknown';

        if (!req.user) {
            logger.warn('Missing user in requireRoles middleware', {
                requestId,
                ip: req.ip,
                path: req.path
            });
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Superadmin/dokter always has access
        if (req.user.is_superadmin || req.user.role === ROLE_NAMES.DOKTER || isSuperadminRole(req.user.role_id)) {
            logger.debug('Superadmin/dokter access granted', {
                requestId,
                userId: req.user.id,
                role: req.user.role
            });
            return next();
        }

        // Check if user's role is in allowed roles
        const userRole = req.user.role;
        if (allowedRoles.includes(userRole)) {
            logger.debug('Role access granted', {
                requestId,
                userId: req.user.id,
                role: userRole,
                allowedRoles
            });
            return next();
        }

        logger.warn('Access denied - role not allowed', {
            requestId,
            userId: req.user.id,
            userRole,
            allowedRoles,
            path: req.path
        });
        return res.status(403).json({
            success: false,
            message: 'Access denied for your role'
        });
    };
}

/**
 * Middleware to check if user has required permissions
 * Checks against role_permissions table
 * @param {...string} requiredPermissions - Permission names (e.g., 'announcements.view', 'patients.edit')
 *
 * Usage: requirePermission('announcements.view')
 *        requirePermission('patients.view', 'patients.edit') - requires ANY of these
 */
function requirePermission(...requiredPermissions) {
    // Lazy load db to avoid circular dependency
    let db = null;

    return async (req, res, next) => {
        const requestId = req.context?.requestId || 'unknown';

        if (!req.user) {
            logger.warn('Missing user in requirePermission middleware', {
                requestId,
                ip: req.ip,
                path: req.path
            });
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Superadmin/dokter always has access
        if (req.user.is_superadmin || req.user.role === ROLE_NAMES.DOKTER || isSuperadminRole(req.user.role_id)) {
            logger.debug('Superadmin/dokter permission granted', {
                requestId,
                userId: req.user.id,
                permissions: requiredPermissions
            });
            return next();
        }

        try {
            // Lazy load database connection
            if (!db) {
                db = require('../db');
            }

            const roleId = req.user.role_id;
            if (!roleId) {
                logger.warn('User has no role_id', {
                    requestId,
                    userId: req.user.id,
                    path: req.path
                });
                return res.status(403).json({
                    success: false,
                    message: 'User role not configured'
                });
            }

            // Check if user's role has ANY of the required permissions
            const placeholders = requiredPermissions.map(() => '?').join(', ');
            const [rows] = await db.query(
                `SELECT p.name
                 FROM role_permissions rp
                 JOIN permissions p ON rp.permission_id = p.id
                 WHERE rp.role_id = ? AND p.name IN (${placeholders})`,
                [roleId, ...requiredPermissions]
            );

            if (rows.length === 0) {
                logger.warn(`Permission denied: user=${req.user.id} role_id=${roleId} needs=[${requiredPermissions.join(',')}] path=${req.path}`);
                return res.status(403).json({
                    success: false,
                    message: 'Anda tidak memiliki izin untuk aksi ini'
                });
            }

            logger.debug('Permission granted', {
                requestId,
                userId: req.user.id,
                roleId,
                grantedPermissions: rows.map(r => r.name)
            });

            next();
        } catch (error) {
            logger.error('Error checking permissions', {
                requestId,
                error: error.message,
                requiredPermissions
            });
            return res.status(500).json({
                success: false,
                message: 'Error checking permissions'
            });
        }
    };
}

/**
 * Middleware to check menu access based on role_visibility table
 * @param {string} menuKey - The menu key to check (e.g., 'obat_alkes', 'keuangan')
 */
function requireMenuAccess(menuKey) {
    // Lazy load db to avoid circular dependency
    let db = null;

    return async (req, res, next) => {
        const requestId = req.context?.requestId || 'unknown';

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Superadmin/dokter always has access
        if (req.user.is_superadmin || req.user.role === ROLE_NAMES.DOKTER || isSuperadminRole(req.user.role_id)) {
            return next();
        }

        try {
            // Lazy load database connection
            if (!db) {
                db = require('../db');
            }

            const userRole = req.user.role;
            const [rows] = await db.query(
                'SELECT is_visible FROM role_visibility WHERE role_name = ? AND menu_key = ?',
                [userRole, menuKey]
            );

            // If no record found, default to no access
            if (rows.length === 0) {
                logger.warn('Menu access denied - no visibility record', {
                    requestId,
                    userId: req.user.id,
                    userRole,
                    menuKey,
                    path: req.path
                });
                return res.status(403).json({
                    success: false,
                    message: 'Akses ditolak untuk role Anda'
                });
            }

            if (!rows[0].is_visible) {
                logger.warn('Menu access denied - not visible for role', {
                    requestId,
                    userId: req.user.id,
                    userRole,
                    menuKey,
                    path: req.path
                });
                return res.status(403).json({
                    success: false,
                    message: 'Akses ditolak untuk role Anda'
                });
            }

            // Access granted
            next();
        } catch (error) {
            logger.error('Error checking menu access', {
                requestId,
                error: error.message,
                menuKey
            });
            // On error, deny access for security
            return res.status(500).json({
                success: false,
                message: 'Error checking access permissions'
            });
        }
    };
}

module.exports = {
    verifyToken,
    verifyPatientToken,
    requireRole,
    requireRoles,
    requireSuperadmin,
    requireMenuAccess,  // New: check menu visibility from database
    requirePermission,  // Deprecated
    optionalAuth,
    recordFailedAttempt,
    isAccountLocked,
    clearFailedAttempts,
    JWT_SECRET
};
