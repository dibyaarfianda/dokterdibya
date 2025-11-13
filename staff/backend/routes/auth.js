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
    
    logger.info(`Patient detail retrieved: ${patients[0].fullname} (ID: ${patientId}) by ${req.user.email}`);
    sendSuccess(res, { patient: patients[0] });
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
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // Check if patient exists
        const [patients] = await connection.query(
            'SELECT id, full_name, email FROM patients WHERE id = ?',
            [patientId]
        );
        
        if (patients.length === 0) {
            await connection.rollback();
            connection.release();
            throw new AppError('Patient not found', HTTP_STATUS.NOT_FOUND);
        }
        
        const patient = patients[0];
        const deletionLog = {
            patient_id: patientId,
            patient_name: patient.full_name,
            patient_email: patient.email,
            deleted_data: {}
        };
        
        // URUTAN PENGHAPUSAN (sama seperti di patients.js)
        
        // 1. Hapus billing_items
        const [billingItemsResult] = await connection.query(
            'DELETE FROM billing_items WHERE billing_id IN (SELECT id FROM billings WHERE patient_id = ?)',
            [patientId]
        );
        deletionLog.deleted_data.billing_items = billingItemsResult.affectedRows;
        
        // 2. Hapus payment_transactions
        const [paymentResult] = await connection.query(
            'DELETE FROM payment_transactions WHERE billing_id IN (SELECT id FROM billings WHERE patient_id = ?)',
            [patientId]
        );
        deletionLog.deleted_data.payment_transactions = paymentResult.affectedRows;
        
        // 3. Hapus billings
        const [billingsResult] = await connection.query(
            'DELETE FROM billings WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.billings = billingsResult.affectedRows;
        
        // 4. Hapus patient_records
        const [recordsResult] = await connection.query(
            'DELETE FROM patient_records WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.patient_records = recordsResult.affectedRows;
        
        // 5. Hapus medical_records
        const [medicalResult] = await connection.query(
            'DELETE FROM medical_records WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.medical_records = medicalResult.affectedRows;
        
        // 6. Hapus medical_exams
        const [examsResult] = await connection.query(
            'DELETE FROM medical_exams WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.medical_exams = examsResult.affectedRows;
        
        // 7. Hapus visits
        const [visitsResult] = await connection.query(
            'DELETE FROM visits WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.visits = visitsResult.affectedRows;
        
        // 8. Hapus appointments
        const [appointmentsResult] = await connection.query(
            'DELETE FROM appointments WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.appointments = appointmentsResult.affectedRows;
        
        // 9. Hapus patient intake submissions (skip if table doesn't exist)
        try {
            const [intakeResult] = await connection.query(
                'DELETE FROM patient_intake_submissions WHERE patient_id = ?',
                [patientId]
            );
            deletionLog.deleted_data.patient_intake_submissions = intakeResult.affectedRows;
        } catch (intakeError) {
            // Table might not exist, skip
            deletionLog.deleted_data.patient_intake_submissions = 0;
        }
        
        // 10. Hapus web_patients_archive jika ada
        try {
            const [archiveResult] = await connection.query(
                'DELETE FROM web_patients_archive WHERE id = ?',
                [patientId]
            );
            deletionLog.deleted_data.web_patients_archive = archiveResult.affectedRows;
        } catch (archiveError) {
            // Table might not exist, skip
            deletionLog.deleted_data.web_patients_archive = 0;
        }
        
        // 11. TERAKHIR: Hapus patients
        await connection.query('DELETE FROM patients WHERE id = ?', [patientId]);
        
        await connection.commit();
        connection.release();
        
        logger.info(`Patient deleted: ${patient.full_name} (ID: ${patientId}) by user: ${req.user.email}`, deletionLog.deleted_data);
        
        sendSuccess(res, { 
            patient: patient,
            deleted_data: deletionLog.deleted_data
        }, `Patient ${patient.full_name} and all related data deleted successfully`);
        
    } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
    }
}));

module.exports = router;


