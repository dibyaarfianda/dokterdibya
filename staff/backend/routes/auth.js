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
const { deletePatientWithRelations } = require('../services/patientDeletion');

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
    const resolvedRole = user.is_superadmin ? 'superadmin' :
                         user.user_type === 'staff' ? 'staff' :
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

    const token = jwt.sign(
        {
            id: userId,
            name: user.name || 'Staff',
            role: roleForToken,
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
            is_superadmin: user.is_superadmin || false
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
            is_superadmin: user.is_superadmin || false
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

// POST /api/auth/change-password - Change user password
router.post('/api/auth/change-password', verifyToken, validatePasswordChange, asyncHandler(async (req, res) => {
    const userId = req.user?.id;
    
    if (!userId) {
        throw new AppError('Invalid token payload', HTTP_STATUS.BAD_REQUEST);
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const [rows] = await db.query('SELECT password_hash FROM users WHERE new_id = ?', [userId]);

    if (rows.length === 0) {
        throw new AppError(ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, rows[0].password_hash);

    if (!isPasswordValid) {
        throw new AppError('Invalid current password', HTTP_STATUS.UNAUTHORIZED);
    }

    // Hash and update new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE new_id = ?', [newPasswordHash, userId]);

    logger.info(`Password changed for user ID: ${userId}`);

    sendSuccess(res, null, SUCCESS_MESSAGES.PASSWORD_CHANGED);
}));

// Get all web patients (Admin only)
router.get('/api/admin/web-patients', verifyToken, asyncHandler(async (req, res) => {
    // Log for debugging
    logger.info(`Web patients request from user: ${req.user.email} (${req.user.role})`);
    
    // Check if user is admin/superadmin
    if (!['superadmin', 'admin'].includes(req.user.role)) {
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
    if (!['superadmin', 'admin'].includes(req.user.role)) {
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
        const patientPhone = patients[0].phone;
        if (patientPhone) {
            const normalizedPhone = patientPhone.replace(/\D/g, '').slice(-10);
            const [intakeRows] = await db.query(
                `SELECT submission_id, quick_id, payload, status, high_risk, created_at, updated_at
                 FROM patient_intake_submissions 
                 WHERE RIGHT(REPLACE(phone, '-', ''), 10) = ? 
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [normalizedPhone]
            );
            
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
    if (!['superadmin', 'admin'].includes(req.user.role)) {
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
    if (req.user.role !== 'superadmin') {
        logger.warn(`Unauthorized chat logs deletion attempt by ${req.user.email} (${req.user.role})`);
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
    if (req.user.role !== 'superadmin') {
        logger.warn(`Unauthorized sync attempt by ${req.user.email} (${req.user.role})`);
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
    if (!['superadmin', 'admin'].includes(req.user.role)) {
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


module.exports = router;


