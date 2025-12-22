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
const { deletePatientWithRelations, deletePatientByEmail } = require('../services/patientDeletion');
const { ROLE_IDS, isSuperadminRole } = require('../constants/roles');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// POST /api/auth/login
router.post('/api/auth/login', validateLogin, asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const [rows] = await db.query(
        `SELECT
            u.new_id,
            u.name,
            u.email,
            u.password_hash,
            u.role,
            u.role_id,
            u.photo_url,
            u.user_type,
            u.is_superadmin,
            u.profile_completed,
            u.must_change_password,
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

    const userId = user.new_id;

    // Set role based on user type and superadmin status
    // Use actual role from DB (e.g., managerial, bidan, front_office) for role_visibility to work
    const resolvedRole = user.is_superadmin ? 'dokter' :
                         user.role || user.resolved_role_name || 'viewer';
    const resolvedRoleDisplay = user.resolved_role_display || resolvedRole || null;
    const roleForToken = resolvedRole;

    if (!user.role && user.resolved_role_name) {
        try {
            await db.query('UPDATE users SET role = ? WHERE new_id = ?', [user.resolved_role_name, userId]);
        } catch (updateErr) {
            logger.warn(`Failed to backfill role column for user ${userId}: ${updateErr.message}`);
        }
    }

    if (!isPasswordValid) {
        throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
    }

    // Prevent patients from accessing admin panel
    if (user.user_type === 'patient') {
        logger.warn(`Patient attempted admin login: ${user.email}`);
        throw new AppError('Akses ditolak. Pasien tidak dapat mengakses panel admin.', HTTP_STATUS.FORBIDDEN);
    }

    const token = jwt.sign(
        {
            id: userId,
            name: user.name || 'Staff',
            role: roleForToken,
            role_id: user.role_id || null,
            user_type: user.user_type || 'patient',
            is_superadmin: user.is_superadmin || false
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info(`User logged in: ${user.email}`);

    sendSuccess(res, {
        token,
        user: {
            id: userId,
            name: user.name,
            email: user.email,
            role: roleForToken,
            role_id: user.role_id || null,
            role_display_name: resolvedRoleDisplay || roleForToken,
            photo_url: user.photo_url,
            user_type: user.user_type || 'patient',
            is_superadmin: user.is_superadmin || false,
            profile_completed: user.profile_completed || false,
            must_change_password: user.must_change_password || false
        }
    }, SUCCESS_MESSAGES.LOGIN_SUCCESS);
}));

// POST /api/auth/patient-login - Patient login endpoint
router.post('/api/auth/patient-login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new AppError(ERROR_MESSAGES.MISSING_CREDENTIALS, HTTP_STATUS.BAD_REQUEST);
    }

    const [rows] = await db.query(
        `SELECT
            u.new_id,
            u.name,
            u.email,
            u.password_hash,
            u.role,
            u.role_id,
            u.user_type,
            u.is_superadmin,
            u.photo_url,
            r.name AS resolved_role_name,
            r.display_name AS resolved_role_display
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.email = ?`,
        [email]
    );

    if (rows.length === 0) {
        throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
    }

    const user = rows[0];
    const userId = user.new_id;
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
        throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
    }

    // Only allow patients to login via this endpoint
    if (user.user_type !== 'patient') {
        logger.warn(`Non-patient attempted patient login: ${user.email}`);
        throw new AppError('Akses ditolak. Silakan gunakan halaman login staff.', HTTP_STATUS.FORBIDDEN);
    }

    const token = jwt.sign(
        {
            id: userId,
            email: user.email,
            name: user.name || 'Patient',
            role: 'patient',
            user_type: 'patient',
            is_superadmin: false
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info(`Patient logged in: ${user.email}`);

    sendSuccess(res, {
        token,
        user: {
            id: userId,
            name: user.name,
            email: user.email,
            role: 'patient',
            user_type: 'patient',
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
            u.new_id,
            u.name,
            u.email,
            u.role,
            u.role_id,
            u.photo_url,
            u.user_type,
            u.is_superadmin,
            u.profile_completed,
            r.name AS resolved_role_name,
            r.display_name AS resolved_role_display
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.new_id = ?`,
        [userId]
    );

    if (rows.length === 0) {
        throw new AppError(ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const user = rows[0];
    const resolvedRole = user.role || user.resolved_role_name || null;
    const resolvedRoleDisplay = user.resolved_role_display || resolvedRole || null;
    const roleForClient = resolvedRole || 'viewer';

    // Get user permissions based on role_id
    let permissions = [];
    if (user.role_id) {
        const [permRows] = await db.query(
            `SELECT p.name FROM permissions p
             JOIN role_permissions rp ON p.id = rp.permission_id
             WHERE rp.role_id = ?`,
            [user.role_id]
        );
        permissions = permRows.map(p => p.name);
    }
    
    // Superadmin has all permissions
    if (user.is_superadmin || user.role === 'dokter') {
        const [allPerms] = await db.query('SELECT name FROM permissions');
        permissions = allPerms.map(p => p.name);
    }

    sendSuccess(res, {
        user: {
            id: user.new_id,
            name: user.name,
            email: user.email,
            role: roleForClient,
            role_id: user.role_id || null,
            role_display_name: resolvedRoleDisplay || roleForClient,
            photo_url: user.photo_url,
            user_type: user.user_type || 'patient',
            is_superadmin: user.is_superadmin || false,
            profile_completed: user.profile_completed || false,
            permissions: permissions
        }
    });
}));

// GET /api/staff/verify - Verify staff token (for Sunday Clinic and other staff apps)
router.get('/api/staff/verify', verifyToken, asyncHandler(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError('Invalid token payload', HTTP_STATUS.BAD_REQUEST);
    }

    const [rows] = await db.query(
        `SELECT
            u.new_id,
            u.name,
            u.email,
            u.role,
            u.role_id,
            u.photo_url,
            u.user_type,
            u.is_superadmin,
            r.name AS resolved_role_name,
            r.display_name AS resolved_role_display
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.new_id = ?
        LIMIT 1`,
        [userId]
    );

    if (rows.length === 0) {
        throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);
    }

    const user = rows[0];
    const roleForClient = user.role || 'staff';
    const resolvedRoleDisplay = user.resolved_role_display;

    sendSuccess(res, {
        id: user.new_id,
        name: user.name,
        username: user.name, // Add username for compatibility
        email: user.email,
        role: roleForClient,
        role_id: user.role_id || null,
        role_display_name: resolvedRoleDisplay || roleForClient,
        photo_url: user.photo_url,
        user_type: user.user_type || 'staff',
        is_superadmin: user.is_superadmin || false
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
        const query = `UPDATE users SET ${updates.join(', ')} WHERE new_id = ?`;
        await db.query(query, values);
        
        res.json({ success: true, message: 'Profile updated' });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ success: false, message: 'Failed to update profile', error: err.message });
    }
});

// POST /api/auth/set-initial-password - Set password for first time (no current password required)
router.post('/api/auth/set-initial-password', verifyToken, asyncHandler(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError('Invalid token payload', HTTP_STATUS.BAD_REQUEST);
    }

    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        throw new AppError('Password minimal 6 karakter', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if user exists and is eligible for initial password set
    const [rows] = await db.query('SELECT profile_completed FROM users WHERE new_id = ?', [userId]);

    if (rows.length === 0) {
        throw new AppError(ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    // Only allow if profile not yet completed
    if (rows[0].profile_completed) {
        throw new AppError('Profile sudah lengkap. Gunakan fitur ubah password.', HTTP_STATUS.BAD_REQUEST);
    }

    // Hash and update new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE new_id = ?', [newPasswordHash, userId]);

    logger.info(`Initial password set for user ID: ${userId}`);

    sendSuccess(res, null, 'Password berhasil disimpan');
}));

// POST /api/auth/mark-profile-completed - Mark profile as completed
router.post('/api/auth/mark-profile-completed', verifyToken, asyncHandler(async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError('Invalid token payload', HTTP_STATUS.BAD_REQUEST);
    }

    await db.query('UPDATE users SET profile_completed = 1 WHERE new_id = ?', [userId]);

    logger.info(`Profile marked as completed for user ID: ${userId}`);

    sendSuccess(res, null, 'Profile berhasil dilengkapi');
}));

// POST /api/auth/change-password - Change user password
router.post('/api/auth/change-password', verifyToken, validatePasswordChange, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    logger.info(`[PASSWORD CHANGE] Attempt for user ID: ${userId}`);

    if (!userId) {
        logger.error('[PASSWORD CHANGE] No user ID in token');
        throw new AppError('Token tidak valid', HTTP_STATUS.BAD_REQUEST);
    }

    const { currentPassword, newPassword } = req.body;
    logger.info(`[PASSWORD CHANGE] Has currentPassword: ${!!currentPassword}, Has newPassword: ${!!newPassword}`);

    // Verify current password
    const [rows] = await db.query('SELECT password_hash FROM users WHERE new_id = ?', [userId]);
    logger.info(`[PASSWORD CHANGE] Found ${rows.length} user(s) with new_id: ${userId}`);

    if (rows.length === 0) {
        logger.error(`[PASSWORD CHANGE] User not found with new_id: ${userId}`);
        throw new AppError(ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    logger.info(`[PASSWORD CHANGE] Current password valid: ${isPasswordValid}`);

    if (!isPasswordValid) {
        logger.warn(`[PASSWORD CHANGE] Invalid current password for user: ${userId}`);
        throw new AppError('Password saat ini salah', HTTP_STATUS.UNAUTHORIZED);
    }

    // Hash and update new password, also clear must_change_password flag
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const [updateResult] = await db.query(
        'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE new_id = ?',
        [newPasswordHash, userId]
    );
    logger.info(`[PASSWORD CHANGE] Update result - affected rows: ${updateResult.affectedRows}`);

    if (updateResult.affectedRows === 0) {
        logger.error(`[PASSWORD CHANGE] No rows updated for user: ${userId}`);
        throw new AppError('Gagal mengubah password', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    logger.info(`[PASSWORD CHANGE] Password changed successfully for user ID: ${userId}`);
    sendSuccess(res, null, SUCCESS_MESSAGES.PASSWORD_CHANGED);
}));

// Get all web patients (Admin only)
router.get('/api/admin/web-patients', verifyToken, asyncHandler(async (req, res) => {
    // Log for debugging
    logger.info(`Web patients request from user: ${req.user.email} (${req.user.role})`);
    
    // Check if user is admin/superadmin
    if (!req.user.is_superadmin && !['dokter', 'admin'].includes(req.user.role)) {
        logger.warn(`Unauthorized web patients access attempt by ${req.user.email} (${req.user.role})`);
        throw new AppError('Unauthorized access - Admin role required', HTTP_STATUS.FORBIDDEN);
    }
    
    const [patients] = await db.query(
        `SELECT id, full_name AS fullname, email, phone, birth_date, age, photo_url, 
                registration_date, status, profile_completed, created_at, updated_at 
         FROM patients 
         ORDER BY registration_date DESC`
    );
    
    logger.info(`Returning ${patients.length} web patients to ${req.user.email}`);
    sendSuccess(res, { patients });
}));

// Get single web patient detail (Admin only)
router.get('/api/admin/web-patients/:id', verifyToken, asyncHandler(async (req, res) => {
    // Check if user is admin/superadmin
    if (!req.user.is_superadmin && !['dokter', 'admin'].includes(req.user.role)) {
        logger.warn(`Unauthorized web patient detail access attempt by ${req.user.email} (${req.user.role})`);
        throw new AppError('Unauthorized access - Admin role required', HTTP_STATUS.FORBIDDEN);
    }
    
    const patientId = req.params.id;
    
    const [patients] = await db.query(
        `SELECT id, full_name AS fullname, email, phone, birth_date, age, photo_url, google_id,
                registration_date, status, profile_completed, created_at, updated_at 
         FROM patients 
         WHERE id = ?`,
        [patientId]
    );
    
    if (patients.length === 0) {
        throw new AppError('Patient not found', HTTP_STATUS.NOT_FOUND);
    }
    
    // Get patient intake submission from database
    let intake = null;
    try {
        // Priority 1: Match by patient_id (most reliable)
        let [intakeRows] = await db.query(
            `SELECT submission_id, quick_id, payload, status, high_risk, created_at, updated_at
             FROM patient_intake_submissions
             WHERE patient_id = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [patientId]
        );

        // Priority 2: Match by phone number (fallback for legacy data)
        if (intakeRows.length === 0) {
            const patientPhone = patients[0].phone;
            if (patientPhone) {
                const normalizedPhone = patientPhone.replace(/\D/g, '').slice(-10);
                [intakeRows] = await db.query(
                    `SELECT submission_id, quick_id, payload, status, high_risk, created_at, updated_at
                     FROM patient_intake_submissions
                     WHERE RIGHT(REPLACE(phone, '-', ''), 10) = ?
                     ORDER BY created_at DESC
                     LIMIT 1`,
                    [normalizedPhone]
                );
            }
        }

        if (intakeRows.length > 0) {
            const row = intakeRows[0];
            intake = {
                submissionId: row.submission_id,
                quickId: row.quick_id,
                payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
                status: row.status,
                highRisk: row.high_risk,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            };
        }
    } catch (intakeError) {
        logger.error('Failed to load patient intake', { patientId, error: intakeError.message });
        // Don't fail the whole request, just don't include intake data
    }
    
    logger.info(`Patient detail retrieved: ${patients[0].fullname} (ID: ${patientId}) by ${req.user.email}`);
    sendSuccess(res, { patient: patients[0], intake });
}));

// Update web patient status (Admin only)
router.patch('/api/admin/web-patients/:id/status', verifyToken, asyncHandler(async (req, res) => {
    // Check if user is admin/superadmin
    if (!req.user.is_superadmin && !['dokter', 'admin'].includes(req.user.role)) {
        logger.warn(`Unauthorized web patient status update attempt by ${req.user.email} (${req.user.role})`);
        throw new AppError('Unauthorized access - Admin role required', HTTP_STATUS.FORBIDDEN);
    }
    
    const patientId = req.params.id;
    const { status } = req.body;
    
    // Validate status
    if (!['active', 'inactive', 'suspended'].includes(status)) {
        throw new AppError('Invalid status value', HTTP_STATUS.BAD_REQUEST);
    }
    
    // Check if patient exists
    const [patients] = await db.query(
        'SELECT id, full_name AS fullname FROM patients WHERE id = ?',
        [patientId]
    );
    
    if (patients.length === 0) {
        throw new AppError('Patient not found', HTTP_STATUS.NOT_FOUND);
    }
    
    // Update status
    await db.query(
        'UPDATE patients SET status = ?, updated_at = NOW() WHERE id = ?',
        [status, patientId]
    );
    
    logger.info(`Patient status updated: ${patients[0].fullname} (ID: ${patientId}) to ${status} by ${req.user.email}`);
    
    sendSuccess(res, { patient: patients[0], newStatus: status }, `Patient status updated to ${status}`);
}));

// Clear all chat logs (Superadmin only)
router.delete('/api/admin/clear-chat-logs', verifyToken, asyncHandler(async (req, res) => {
    // Check if user is superadmin
    if (!req.user.is_superadmin && !isSuperadminRole(req.user.role_id)) {
        logger.warn(`Unauthorized chat logs deletion attempt by ${req.user.email} (role_id: ${req.user.role_id})`);
        throw new AppError('Unauthorized access - Superadmin role required', HTTP_STATUS.FORBIDDEN);
    }
    
    // Get count before deletion
    const [countResult] = await db.query('SELECT COUNT(*) as total FROM chat_messages');
    const totalMessages = countResult[0].total;
    
    // Delete all chat messages
    await db.query('DELETE FROM chat_messages');
    
    logger.warn(`ALL CHAT LOGS DELETED by ${req.user.email} - ${totalMessages} messages removed`);
    
    sendSuccess(res, { deletedCount: totalMessages }, `Successfully deleted ${totalMessages} chat messages`);
}));

// Sync all web patients to patients table (Superadmin only)
router.post('/api/admin/sync-web-patients', verifyToken, asyncHandler(async (req, res) => {
    // Check if user is superadmin
    if (!req.user.is_superadmin && !isSuperadminRole(req.user.role_id)) {
        logger.warn(`Unauthorized sync attempt by ${req.user.email} (role_id: ${req.user.role_id})`);
        throw new AppError('Unauthorized access - Superadmin role required', HTTP_STATUS.FORBIDDEN);
    }
    
    // Get all completed web patients
    const [webPatients] = await db.query(
        `SELECT id, fullname, email, phone, birth_date, age, google_id, photo_url, password, registration_date, status 
         FROM web_patients 
         WHERE profile_completed = 1`
    );
    
    let syncedCount = 0;
    let skippedCount = 0;
    let errors = [];
    
    for (const webPatient of webPatients) {
        try {
            // Check if already exists in patients table
            const [existing] = await db.query(
                'SELECT id FROM patients WHERE email = ? OR phone = ? LIMIT 1',
                [webPatient.email, webPatient.phone]
            );
            
            if (existing.length > 0) {
                skippedCount++;
                continue;
            }
            
            // Get the next patient ID
            const [maxId] = await db.query(
                "SELECT id FROM patients WHERE id REGEXP '^P[0-9]+$' ORDER BY CAST(SUBSTRING(id, 2) AS UNSIGNED) DESC LIMIT 1"
            );
            
            let nextNumber = 1;
            if (maxId.length > 0 && maxId[0].id) {
                const currentNumber = parseInt(maxId[0].id.substring(1));
                nextNumber = currentNumber + 1;
            }
            
            const newPatientId = 'P' + String(nextNumber).padStart(3, '0');
            
            // Insert into patients table
            await db.query(
                `INSERT INTO patients 
                 (id, full_name, whatsapp, phone, birth_date, age, email, google_id, photo_url, password, registration_date, status, is_pregnant, visit_count) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
                [
                    newPatientId,
                    webPatient.fullname,
                    webPatient.phone,
                    webPatient.phone,
                    webPatient.birth_date,
                    webPatient.age,
                    webPatient.email,
                    webPatient.google_id,
                    webPatient.photo_url,
                    webPatient.password,
                    webPatient.registration_date,
                    webPatient.status || 'active'
                ]
            );
            
            syncedCount++;
            logger.info(`Synced web patient ${webPatient.email} to patients table with ID ${newPatientId}`);
            
        } catch (error) {
            errors.push({ email: webPatient.email, error: error.message });
            logger.error(`Error syncing web patient ${webPatient.email}:`, error);
        }
    }
    
    logger.info(`Web patients sync completed by ${req.user.email} - Synced: ${syncedCount}, Skipped: ${skippedCount}, Errors: ${errors.length}`);
    
    sendSuccess(res, { 
        syncedCount, 
        skippedCount, 
        errorsCount: errors.length,
        errors: errors.slice(0, 10) // Only return first 10 errors
    }, `Sync completed: ${syncedCount} synced, ${skippedCount} skipped`);
}));

// Delete web patient (Admin only)
router.delete('/api/admin/web-patients/:id', verifyToken, asyncHandler(async (req, res) => {
    // Check if user is admin/superadmin
    if (!req.user.is_superadmin && !['dokter', 'admin'].includes(req.user.role)) {
        throw new AppError('Unauthorized access', HTTP_STATUS.FORBIDDEN);
    }
    
    const patientId = req.params.id;
    const { patient, deletedData } = await deletePatientWithRelations(patientId);

    if (!patient) {
        throw new AppError('Patient not found', HTTP_STATUS.NOT_FOUND);
    }

    logger.info(`Patient deleted: ${patient.full_name} (ID: ${patientId}) by user: ${req.user.email}`, deletedData);

    sendSuccess(res, {
        patient,
        deleted_data: deletedData
    }, `Patient ${patient.full_name} and all related data deleted successfully`);
}));

// ++ Forgot Password Flow ++

// POST /api/auth/forgot-password
router.post('/api/auth/forgot-password', asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) {
        throw new AppError('Email is required', HTTP_STATUS.BAD_REQUEST);
    }

    // 1. Check if patient exists
    const [patients] = await db.query('SELECT id, email, full_name FROM patients WHERE email = ?', [email]);
    if (patients.length === 0) {
        // We don't want to reveal if an email exists or not for security reasons
        logger.warn(`Password reset requested for non-existent email: ${email}`);
        return sendSuccess(res, null, 'If an account with that email exists, a password reset link has been sent.');
    }
    const patient = patients[0];

    // 2. Generate a secure random token
    const token = require('crypto').randomBytes(3).toString('hex').toUpperCase(); // 6-digit hex token
    const expires = new Date(Date.now() + 3600000); // 1 hour expiry

    // 3. Hash the token before storing
    const hashedToken = await bcrypt.hash(token, 10);

    // 4. Store the hashed token in the database
    try {
        await db.query(
            'INSERT INTO patient_password_reset_tokens (patient_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [patient.id, hashedToken, expires]
        );
    } catch (dbError) {
        handleDatabaseError(dbError);
    }

    // 5. Send the email with the plain token
    const notification = require('../utils/notification');
    const emailResult = await notification.sendPasswordResetEmail(patient.email, token, {
        patientName: patient.full_name,
        email: patient.email
    });

    if (!emailResult.success) {
        logger.error(`Failed to send password reset email to ${email}`, { error: emailResult.error });
        // Even if email fails, we don't want to leak info. The user can try again.
    } else {
        logger.info(`Password reset email sent to ${email}`);
    }

    sendSuccess(res, null, 'If an account with that email exists, a password reset link has been sent.');
}));


// POST /api/auth/reset-password
router.post('/api/auth/reset-password', asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        throw new AppError('Token and new password are required', HTTP_STATUS.BAD_REQUEST);
    }
    
    if (newPassword.length < 8) {
        throw new AppError('Password must be at least 8 characters long', HTTP_STATUS.BAD_REQUEST);
    }

    // 1. Find all non-expired tokens
    const [tokens] = await db.query(
        'SELECT id, patient_id, token_hash FROM patient_password_reset_tokens WHERE expires_at > NOW() AND used = 0'
    );

    if (tokens.length === 0) {
        throw new AppError('Invalid or expired token.', HTTP_STATUS.BAD_REQUEST);
    }

    let validTokenRecord = null;
    let patientId = null;

    // 2. Find the matching token by comparing hashes
    for (const record of tokens) {
        const isMatch = await bcrypt.compare(token, record.token_hash);
        if (isMatch) {
            validTokenRecord = record;
            patientId = record.patient_id;
            break;
        }
    }

    if (!validTokenRecord) {
        throw new AppError('Invalid or expired token.', HTTP_STATUS.BAD_REQUEST);
    }

    // 3. Hash the new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 4. Update the patient's password
    try {
        await db.query(
            'UPDATE patients SET password = ? WHERE id = ?',
            [newPasswordHash, patientId]
        );
    } catch (dbError) {
        handleDatabaseError(dbError);
    }

    // 5. Mark the token as used
    try {
        await db.query('UPDATE patient_password_reset_tokens SET used = 1 WHERE id = ?', [validTokenRecord.id]);
    } catch (dbError) {
        // Log this error but don't fail the request, as the password has been updated.
        logger.error(`Failed to mark reset token as used: ${validTokenRecord.id}`, { error: dbError.message });
    }
    
    // Optionally, invalidate all other tokens for this user
    try {
        await db.query('UPDATE patient_password_reset_tokens SET used = 1 WHERE patient_id = ?', [patientId]);
    } catch (dbError) {
        logger.error(`Failed to invalidate other tokens for patient: ${patientId}`, { error: dbError.message });
    }


    logger.info(`Password has been reset for patient ID: ${patientId}`);
    sendSuccess(res, null, 'Password has been reset successfully. You can now log in with your new password.');
}));

// POST /api/auth/register - Patient registration with email verification
router.post('/api/auth/register', asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        throw new AppError('Valid email is required', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if email already exists
    const [existingUsers] = await db.query(
        'SELECT new_id FROM users WHERE email = ?',
        [email]
    );

    if (existingUsers.length > 0) {
        return sendError(res, 'Email sudah terdaftar', HTTP_STATUS.BAD_REQUEST);
    }

    // Generate 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    // Store verification code in database
    await db.query(
        `INSERT INTO email_verifications (email, code, verification_token, expires_at, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [email, otpCode, verificationToken, expiresAt]
    );

    // Send verification email
    const notificationService = require('../utils/notification');

    const subject = 'Kode Verifikasi dokterDIBYA';
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: 'Arial', sans-serif; background: #f3f4f6; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #0066FF 0%, #0052CC 100%); padding: 40px 20px; text-align: center; color: white; }
                .header h1 { margin: 0; font-size: 28px; }
                .content { padding: 40px 30px; text-align: center; }
                .otp-code { font-size: 48px; font-weight: bold; letter-spacing: 8px; color: #0066FF; background: #f3f4f6; padding: 20px; border-radius: 12px; margin: 30px 0; }
                .info { color: #6b7280; font-size: 14px; margin-top: 30px; }
                .footer { background: #f9fafb; padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>dokterDIBYA</h1>
                </div>
                <div class="content">
                    <h2>Kode Verifikasi Email Anda</h2>
                    <p>Masukkan kode berikut untuk melanjutkan pendaftaran:</p>
                    <div class="otp-code">${otpCode}</div>
                    <p class="info">
                        Kode ini akan kedaluwarsa dalam <strong>2 menit</strong>.<br>
                        Jika Anda tidak mendaftar, abaikan email ini.
                    </p>
                </div>
                <div class="footer">
                    © 2025 dokterDIBYA. All rights reserved.
                </div>
            </div>
        </body>
        </html>
    `;

    try {
        await notificationService.sendEmail({
            to: email,
            subject,
            html,
            text: `Kode verifikasi Anda: ${otpCode}. Kode berlaku selama 2 menit.`
        });
        logger.info(`Verification email sent to: ${email}`);
    } catch (emailError) {
        logger.error('Failed to send verification email', { email, error: emailError.message });
        // Continue anyway - email sending is best effort
    }

    sendSuccess(res, {
        verification_token: verificationToken,
        message: 'Kode verifikasi telah dikirim ke email Anda'
    });
}));

// POST /api/auth/verify-email - Email verification
router.post('/api/auth/verify-email', asyncHandler(async (req, res) => {
    const { email, code, verification_token } = req.body;

    if (!email || !code || !verification_token) {
        throw new AppError('Email, code, and verification token are required', HTTP_STATUS.BAD_REQUEST);
    }

    // Validate code format
    if (code.length !== 6 || !/^\d+$/.test(code)) {
        return sendError(res, 'Kode verifikasi harus 6 digit angka', HTTP_STATUS.BAD_REQUEST);
    }

    // Check verification code in database
    const [rows] = await db.query(
        `SELECT id, code, expires_at, verified_at
         FROM email_verifications
         WHERE email = ? AND verification_token = ? AND verified_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [email, verification_token]
    );

    if (rows.length === 0) {
        return sendError(res, 'Kode verifikasi tidak valid atau sudah digunakan', HTTP_STATUS.BAD_REQUEST);
    }

    const verification = rows[0];

    // Check if code has expired
    if (new Date() > new Date(verification.expires_at)) {
        return sendError(res, 'Kode verifikasi sudah kedaluwarsa', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if code matches
    if (verification.code !== code) {
        return sendError(res, 'Kode verifikasi salah', HTTP_STATUS.BAD_REQUEST);
    }

    // Mark as verified
    const verifiedToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    await db.query(
        `UPDATE email_verifications
         SET verified_at = NOW(), verified_token = ?
         WHERE id = ?`,
        [verifiedToken, verification.id]
    );

    logger.info(`Email verified for: ${email}`);

    sendSuccess(res, {
        verified_token: verifiedToken,
        message: 'Email verified successfully'
    });
}));

// POST /api/auth/resend-verification - Resend verification code
router.post('/api/auth/resend-verification', asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        throw new AppError('Valid email is required', HTTP_STATUS.BAD_REQUEST);
    }

    // Check rate limiting - max 3 resends in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recentAttempts] = await db.query(
        `SELECT COUNT(*) as count
         FROM email_verifications
         WHERE email = ? AND created_at > ?`,
        [email, oneHourAgo]
    );

    if (recentAttempts[0].count >= 5) {
        return sendError(res, 'Terlalu banyak permintaan. Silakan coba lagi nanti.', HTTP_STATUS.TOO_MANY_REQUESTS);
    }

    // Generate new 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    // Store new verification code in database
    await db.query(
        `INSERT INTO email_verifications (email, code, verification_token, expires_at, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [email, otpCode, verificationToken, expiresAt]
    );

    // Send verification email
    const notificationService = require('../utils/notification');

    const subject = 'Kode Verifikasi dokterDIBYA';
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: 'Arial', sans-serif; background: #f3f4f6; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #0066FF 0%, #0052CC 100%); padding: 40px 20px; text-align: center; color: white; }
                .header h1 { margin: 0; font-size: 28px; }
                .content { padding: 40px 30px; text-align: center; }
                .otp-code { font-size: 48px; font-weight: bold; letter-spacing: 8px; color: #0066FF; background: #f3f4f6; padding: 20px; border-radius: 12px; margin: 30px 0; }
                .info { color: #6b7280; font-size: 14px; margin-top: 30px; }
                .footer { background: #f9fafb; padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>dokterDIBYA</h1>
                </div>
                <div class="content">
                    <h2>Kode Verifikasi Email Anda</h2>
                    <p>Masukkan kode berikut untuk melanjutkan pendaftaran:</p>
                    <div class="otp-code">${otpCode}</div>
                    <p class="info">
                        Kode ini akan kedaluwarsa dalam <strong>2 menit</strong>.<br>
                        Jika Anda tidak mendaftar, abaikan email ini.
                    </p>
                </div>
                <div class="footer">
                    © 2025 dokterDIBYA. All rights reserved.
                </div>
            </div>
        </body>
        </html>
    `;

    try {
        await notificationService.sendEmail({
            to: email,
            subject,
            html,
            text: `Kode verifikasi Anda: ${otpCode}. Kode berlaku selama 2 menit.`
        });
        logger.info(`Verification email resent to: ${email}`);
    } catch (emailError) {
        logger.error('Failed to resend verification email', { email, error: emailError.message });
    }

    sendSuccess(res, {
        verification_token: verificationToken,
        message: 'Kode verifikasi baru telah dikirim ke email Anda'
    });
}));

// DELETE /api/admin/cleanup-email - Clean up patient by email from dual-table system (Superadmin only)
router.delete('/api/admin/cleanup-email/:email', verifyToken, asyncHandler(async (req, res) => {
    // Check if user is superadmin
    if (!req.user.is_superadmin && !isSuperadminRole(req.user.role_id)) {
        logger.warn(`Unauthorized email cleanup attempt by ${req.user.email} (role_id: ${req.user.role_id})`);
        throw new AppError('Unauthorized access - Superadmin role required', HTTP_STATUS.FORBIDDEN);
    }

    const email = req.params.email;
    const result = await deletePatientByEmail(email);

    if (!result.found) {
        throw new AppError('Email not found in system', HTTP_STATUS.NOT_FOUND);
    }

    logger.info(`Email cleanup: ${email} (Patient ID: ${result.patientId}) by ${req.user.email}`, result.deletedData);

    sendSuccess(res, {
        email: result.email,
        patient_id: result.patientId,
        deleted_data: result.deletedData
    }, `Email ${email} cleaned up from all tables successfully`);
}));

// Helper: Check if registration code is required
async function isRegistrationCodeRequired() {
    try {
        const [settings] = await db.query(
            "SELECT setting_value FROM settings WHERE setting_key = 'registration_code_required'"
        );
        return settings.length > 0 && settings[0].setting_value === 'true';
    } catch (error) {
        // Default to required if settings table doesn't exist
        return true;
    }
}

// POST /api/auth/set-password - Set password after verification (with profile data)
router.post('/api/auth/set-password', asyncHandler(async (req, res) => {
    const { email, password, verified_token, fullname, phone, birth_date, age, registration_code } = req.body;

    if (!email || !password || !verified_token) {
        throw new AppError('Email, password, and verified token are required', HTTP_STATUS.BAD_REQUEST);
    }

    if (password.length < 8) {
        throw new AppError('Password harus minimal 8 karakter', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if registration code is required
    const codeRequired = await isRegistrationCodeRequired();
    if (codeRequired) {
        if (!registration_code) {
            return sendError(res, 'Kode registrasi diperlukan. Hubungi klinik untuk mendapatkan kode.', HTTP_STATUS.BAD_REQUEST, { code_required: true });
        }

        const normalizedCode = registration_code.toUpperCase().trim();
        const [validCodes] = await db.query(
            `SELECT * FROM registration_codes
             WHERE code = ? AND status = 'active' AND expires_at > NOW()`,
            [normalizedCode]
        );

        if (validCodes.length === 0) {
            // Check if code exists but expired or used
            const [expiredCodes] = await db.query(
                'SELECT * FROM registration_codes WHERE code = ?',
                [normalizedCode]
            );

            if (expiredCodes.length > 0) {
                const existingCode = expiredCodes[0];
                // Only check 'used' for private codes (public codes can be reused)
                if (existingCode.status === 'used' && existingCode.is_public === 0) {
                    return sendError(res, 'Kode registrasi sudah digunakan', HTTP_STATUS.BAD_REQUEST);
                } else if (existingCode.status === 'expired' || new Date(existingCode.expires_at) < new Date()) {
                    return sendError(res, 'Kode registrasi sudah kadaluarsa', HTTP_STATUS.BAD_REQUEST);
                }
            }

            return sendError(res, 'Kode registrasi tidak valid', HTTP_STATUS.BAD_REQUEST);
        }
    }

    // Check if email already exists
    const [existingUsers] = await db.query(
        'SELECT new_id FROM users WHERE email = ?',
        [email]
    );

    if (existingUsers.length > 0) {
        return sendError(res, 'Email sudah terdaftar', HTTP_STATUS.BAD_REQUEST);
    }

    // Generate user ID - use patient ID format
    const year = new Date().getFullYear();
    const [maxIdResult] = await db.query(
        `SELECT id FROM patients WHERE id LIKE 'P${year}%' ORDER BY id DESC LIMIT 1`
    );

    let nextNumber = 1;
    if (maxIdResult.length > 0) {
        const lastId = maxIdResult[0].id;
        const lastNumber = parseInt(lastId.substring(5)); // Remove 'P2025'
        nextNumber = lastNumber + 1;
    }

    const userId = `P${year}${String(nextNumber).padStart(3, '0')}`;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    await db.query(
        `INSERT INTO users (new_id, email, password_hash, user_type, role, is_active, created_at)
         VALUES (?, ?, ?, 'patient', 'user', 1, NOW())`,
        [userId, email, passwordHash]
    );

    // Create patient record with profile data from complete-profile page
    const patientName = fullname || 'New Patient';
    const patientPhone = phone || null;
    const patientBirthDate = birth_date || null;
    const patientAge = age || null;

    await db.query(
        `INSERT INTO patients (id, email, full_name, phone, whatsapp, birth_date, age, status, patient_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'web', NOW())`,
        [userId, email, patientName, patientPhone, patientPhone, patientBirthDate, patientAge]
    );

    // Mark registration code as used (only for private codes - public codes stay active)
    if (codeRequired && registration_code) {
        const normalizedCode = registration_code.toUpperCase().trim();
        await db.query(
            `UPDATE registration_codes
             SET status = 'used', used_at = NOW(), used_by_patient_id = ?
             WHERE code = ? AND is_public = 0`,
            [userId, normalizedCode]
        );
        logger.info(`Registration code ${normalizedCode} used by patient ${userId}`);
    }

    // Generate JWT token
    const token = jwt.sign(
        {
            id: userId,
            email: email,
            role: 'user',
            user_type: 'patient',
            is_superadmin: false
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info(`New patient account created: ${userId} - ${email}`);

    sendSuccess(res, {
        token,
        user_id: userId,
        message: 'Account created successfully'
    });
}));


module.exports = router;


