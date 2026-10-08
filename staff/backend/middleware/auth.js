const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { ROLE_IDS, ROLE_NAMES, isSuperadminRole, isAdminRole } = require('../constants/roles');
const { requestAuditFields } = require('../utils/requestAudit');
const { accessControlService } = require('../services/AccessControlService');
const { MENU_PERMISSION_MAP } = require('../config/accessControlRegistry');

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

// Access administration, doctor-account mutation, and emergency recovery are
// intentionally outside the delegable account matrix.
const NON_DELEGABLE_ACCOUNT_PERMISSIONS = new Set([
    'access.manage',
    'roles.create',
    'roles.delete',
    'roles.edit',
    'roles.manage_permissions',
    'roles.view',
    'users.manage_roles',
    'system.reset'
]);

function isDelegatedAccountPermission(req, requiredPermissions = []) {
    if (req?.disableImplicitAccountDelegation) return false;
    const access = req?.accountAccess;
    const decision = req?.accountAccessResolution;
    const permission = decision?.permission;
    const required = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    const granted = access?.permissions instanceof Set
        ? access.permissions.has(permission)
        : Array.isArray(access?.permissions) && access.permissions.includes(permission);
    return typeof permission === 'string'
        && !NON_DELEGABLE_ACCOUNT_PERMISSIONS.has(permission)
        && required.includes(permission)
        && granted;
}

function runWithoutImplicitAccountDelegation(req, guard, res, next) {
    const previous = req.disableImplicitAccountDelegation;
    req.disableImplicitAccountDelegation = true;
    try {
        return guard(req, res, next);
    } finally {
        if (previous === undefined) delete req.disableImplicitAccountDelegation;
        else req.disableImplicitAccountDelegation = previous;
    }
}

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
 * Reload the Staff account state for every protected request.
 * JWT claims establish identity only; current role and active status come from DB.
 */
async function verifyActiveStaff(req, res, next) {
    const requestId = req.context?.requestId || 'unknown';
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            message: 'Authentication required'
        });
    }

    try {
        const account = await accessControlService.getStaffAccountState(userId);
        if (!account || account.userType !== 'staff') {
            logger.warn('Staff account access denied', requestAuditFields(req, {
                requestId,
                reason: 'not_staff'
            }));
            return res.status(403).json({
                success: false,
                code: 'ACCESS_DENIED',
                message: 'Akses ditolak. Endpoint ini hanya untuk staff.'
            });
        }

        if (!account.isActive) {
            logger.warn('Inactive Staff account denied', requestAuditFields(req, {
                requestId,
                reason: 'inactive'
            }));
            return res.status(403).json({
                success: false,
                code: 'ACCOUNT_INACTIVE',
                message: 'Akun staff tidak aktif.'
            });
        }

        req.user = {
            ...req.user,
            role: account.roleName || req.user.role || null,
            role_id: account.roleId,
            user_type: 'staff',
            is_superadmin: account.isSuperadmin,
            is_active: true
        };
        req.accessPolicy = {
            mode: account.mode,
            access_version: account.accessVersion
        };
        return next();
    } catch (error) {
        logger.error('Active Staff verification failed', requestAuditFields(req, {
            requestId,
            error: error.message
        }));
        return res.status(500).json({
            success: false,
            code: 'ACCESS_CHECK_FAILED',
            message: 'Gagal memeriksa status akun.'
        });
    }
}

/**
 * Middleware to verify staff JWT token
 * Ensures user is NOT a patient - blocks patient tokens from accessing staff routes
 */
function verifyStaffToken(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const requestId = req.context?.requestId || 'unknown';

    if (!authHeader) {
        logger.warn('Missing authorization header (staff)', requestAuditFields(req, {
            requestId,
            ip: req.ip,
            path: req.path
        }));
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

        // Block patient tokens from accessing staff routes
        if (payload.user_type === 'patient' || payload.role === 'patient') {
            logger.warn('Patient token used on staff endpoint', requestAuditFields(req, {
                requestId,
                userId: payload.id,
                userType: payload.user_type,
                role: payload.role,
                path: req.path
            }));
            return res.status(403).json({
                success: false,
                message: 'Akses ditolak. Endpoint ini hanya untuk staff.'
            });
        }

        req.user = payload;

        logger.debug('Staff token verified', requestAuditFields(req, {
            requestId,
            userId: payload.id,
            role: payload.role
        }));

        next();
    } catch (err) {
        logger.warn('Staff token verification failed', requestAuditFields(req, {
            requestId,
            errorName: err.name,
            message: err.message,
            ip: req.ip
        }));

        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired'
            });
        }
        return res.status(401).json({
            success: false,
            message: 'Token tidak valid'
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

    const routedPermission = req.accountAccessResolution?.permission;
    if (isDelegatedAccountPermission(req, [routedPermission])) {
        return next();
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
        code: 'ACCESS_DENIED',
        message: 'Superadmin access required'
    });
}

function requireSuperadminOrAccountPermission(permission) {
    return function requireSuperadminOrAccountPermissionGuard(req, res, next) {
        if (isDelegatedAccountPermission(req, [permission])) return next();
        return runWithoutImplicitAccountDelegation(req, requireSuperadmin, res, next);
    };
}

function requireRolesOrAccountPermission(permission, ...allowedRoles) {
    const legacyGuard = requireRoles(...allowedRoles);
    return (req, res, next) => {
        if (isDelegatedAccountPermission(req, [permission])) return next();
        return runWithoutImplicitAccountDelegation(req, legacyGuard, res, next);
    };
}

function requireMenuAccessOrAccountPermission(menuKey, permission) {
    const legacyGuard = requireMenuAccess(menuKey);
    return (req, res, next) => {
        if (isDelegatedAccountPermission(req, [permission])) return next();
        return legacyGuard(req, res, next);
    };
}

/**
 * Require the literal dokter role.
 *
 * Unlike requireSuperadmin/requireRole, this middleware intentionally does not
 * honour the is_superadmin flag. It is used for clinical accounting actions
 * whose actor must be a doctor and must not be delegated through configurable
 * permissions or menu visibility.
 */
function requireDoctorRole(req, res, next) {
    const requestId = req.context?.requestId || 'unknown';

    if (!req.user) {
        logger.warn('Missing user in requireDoctorRole middleware', {
            requestId,
            ip: req.ip,
            path: req.path
        });
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    const routedPermission = req.accountAccessResolution?.permission;
    if (isDelegatedAccountPermission(req, [routedPermission])) {
        return next();
    }

    // Login may rewrite the role claim to "dokter" for legacy superadmin
    // compatibility. The immutable DB role_id is the only accepted source for
    // this fixed doctor-only action.
    const isDoctor = Number(req.user.role_id) === ROLE_IDS.DOKTER;
    if (isDoctor) {
        logger.debug('Doctor-only access granted', {
            requestId,
            userId: req.user.id,
            role_id: req.user.role_id,
            role: req.user.role
        });
        return next();
    }

    logger.warn('Doctor-only access denied', {
        requestId,
        userId: req.user.id,
        role_id: req.user.role_id,
        role: req.user.role,
        path: req.path
    });
    return res.status(403).json({
        success: false,
        code: 'DOCTOR_ROLE_REQUIRED',
        message: 'Aksi ini hanya dapat dilakukan oleh dokter.'
    });
}

function requireDoctorRoleOrAccountPermission(permission) {
    return function requireDoctorRoleOrAccountPermissionGuard(req, res, next) {
        if (isDelegatedAccountPermission(req, [permission])) return next();
        return runWithoutImplicitAccountDelegation(req, requireDoctorRole, res, next);
    };
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

        const routedPermission = req.accountAccessResolution?.permission;
        if (isDelegatedAccountPermission(req, [routedPermission])) {
            return next();
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
 * Checks the final per-account permission decision.
 * @param {...string} requiredPermissions - Permission names (e.g., 'announcements.view', 'patients.edit')
 *
 * Usage: requirePermission('announcements.view')
 *        requirePermission('patients.view', 'patients.edit') - requires ANY of these
 */
function requirePermission(...requiredPermissions) {
    return async (req, res, next) => {
        const requestId = req.context?.requestId || 'unknown';

        if (!req.user) {
            logger.warn('Missing user in requirePermission middleware', requestAuditFields(req, {
                requestId,
                ip: req.ip,
                path: req.path
            }));
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Superadmin/dokter always has access
        if (req.user.is_superadmin || req.user.role === ROLE_NAMES.DOKTER || isSuperadminRole(req.user.role_id)) {
            logger.debug('Superadmin/dokter permission granted', requestAuditFields(req, {
                requestId,
                userId: req.user.id,
                permissions: requiredPermissions
            }));
            return next();
        }

        // The global account boundary has already reloaded canonical grants
        // and matched this exact route.
        if (isDelegatedAccountPermission(req, requiredPermissions)) {
            return next();
        }

        try {
            const access = req.accountAccess || await accessControlService.getEffectiveAccess(req.user.id);
            if (!access.isActive) {
                return res.status(403).json({ success: false, code: 'ACCOUNT_INACTIVE', message: 'Akun staff tidak aktif.' });
            }
            if (!accessControlService.hasAnyPermission(access, requiredPermissions)) {
                logger.warn('Permission denied', requestAuditFields(req, {
                    userId: req.user.id, requiredPermissions, path: req.path
                }));
                return res.status(403).json({
                    success: false,
                    code: 'ACCESS_DENIED',
                    message: 'Anda tidak memiliki izin untuk aksi ini'
                });
            }

            logger.debug('Permission granted', requestAuditFields(req, {
                requestId,
                userId: req.user.id,
                grantedPermissions: requiredPermissions.filter(permission => access.permissions.has(permission))
            }));

            next();
        } catch (error) {
            logger.error('Error checking permissions', requestAuditFields(req, {
                requestId,
                error: error.message,
                requiredPermissions
            }));
            return res.status(500).json({
                success: false,
                message: 'Error checking permissions'
            });
        }
    };
}

/**
 * Compatibility middleware that maps the old menu key to its account permission.
 * @param {string} menuKey - The menu key to check (e.g., 'obat_alkes', 'keuangan')
 */
function requireMenuAccess(menuKey) {
    return async (req, res, next) => {
        const requestId = req.context?.requestId || 'unknown';

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Superadmin/dokter always has access.
        if (req.user.is_superadmin || req.user.role === ROLE_NAMES.DOKTER || isSuperadminRole(req.user.role_id)) {
            return next();
        }

        try {
            const permission = MENU_PERMISSION_MAP[menuKey];
            const access = req.accountAccess || await accessControlService.getEffectiveAccess(req.user.id);
            if (permission && access.permissions.has(permission)) return next();
            logger.warn('Menu compatibility permission denied', {
                requestId,
                userId: req.user.id,
                menuKey,
                permission,
                path: req.path
            });
            return res.status(403).json({
                success: false,
                code: 'ACCESS_DENIED',
                message: 'Akses ditolak untuk akun Anda'
            });
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
    verifyStaffToken,  // Block patients from staff routes
    verifyActiveStaff,
    requireRole,
    requireRoles,
    requireSuperadmin,
    requireSuperadminOrAccountPermission,
    requireRolesOrAccountPermission,
    requireMenuAccessOrAccountPermission,
    requireDoctorRole,
    requireDoctorRoleOrAccountPermission,
    requireMenuAccess,
    requirePermission,
    isDelegatedAccountPermission,
    optionalAuth,
    recordFailedAttempt,
    isAccountLocked,
    clearFailedAttempts,
    JWT_SECRET
};
