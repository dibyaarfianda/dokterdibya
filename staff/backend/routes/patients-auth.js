const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const cache = require('../utils/cache');
const { deletePatientWithRelations } = require('../services/patientDeletion');
const r2Storage = require('../services/r2Storage');
const logger = require('../utils/logger');

// Configure multer for profile photo upload (memory storage for R2)
const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB max for profile photos
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Hanya file gambar (JPEG, PNG, WebP) yang diperbolehkan'));
    }
});

// JWT Secret - Should be in environment variable in production
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Google OAuth Client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Lazy load notification service to ensure .env is loaded first
let notificationService;
function getNotificationService() {
    if (!notificationService) {
        notificationService = require('../utils/notification');
    }
    return notificationService;
}

/**
 * Generate unique 5-digit medical record ID
 * Ensures no collision with existing patients
 */
async function generateUniqueMedicalRecordId() {
    const maxAttempts = 100;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Generate random 5-digit number (10000-99999)
        const randomId = String(Math.floor(Math.random() * 90000) + 10000);
        
        // Check if ID exists in patients table
        const [existingPatient] = await db.query(
            'SELECT id FROM patients WHERE id = ?',
            [randomId]
        );
        
        // If ID is unique, return it
        if (existingPatient.length === 0) {
            return randomId;
        }
    }
    
    // Fallback: use sequential ID if random generation fails
    const [rows] = await db.query(
        `SELECT LPAD(COALESCE(MAX(CAST(id AS UNSIGNED)), 0) + 1, 5, '0') AS nextId
        FROM patients`
    );
    
    return rows[0]?.nextId || '10000';
}

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Token tidak ditemukan' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token tidak valid' });
    }
};

// Register with email
async function handlePatientRegister(req, res) {
    try {
        const { fullname, email, phone, password } = req.body;

        // Validation
        if (!fullname || !email || !phone || !password) {
            return res.status(400).json({ message: 'Semua field harus diisi' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password minimal 6 karakter' });
        }

        // Check if email already exists
        const [existingUsers] = await db.query(
            'SELECT id FROM patients WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ message: 'Email sudah terdaftar' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate unique medical record ID
        const medicalRecordId = await generateUniqueMedicalRecordId();

        // Generate verification token (6 digit code)
        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Insert patient with email_verified = 0
        const [result] = await db.query(
            `INSERT INTO patients (
                id, full_name, email, phone, password,
                email_verified, verification_token, verification_token_expires,
                registration_date, status, patient_type
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, NOW(), 'active', 'web')`,
            [medicalRecordId, fullname, email, phone, hashedPassword, verificationToken, tokenExpires]
        );

        // For VARCHAR primary key, insertId is 0. Use medicalRecordId instead
        const patientId = medicalRecordId;

        // Send verification email
        try {
            const emailResult = await getNotificationService().sendVerificationEmail({
                to: email,
                userName: fullname,
                email,
                verificationCode: verificationToken
            });

            if (emailResult?.success) {
                console.log(`Verification email sent to ${email} with token: ${verificationToken}`);
            } else {
                console.warn('Verification email dispatch did not succeed', { email, error: emailResult?.error });
            }
        } catch (emailError) {
            console.error('Failed to send verification email:', emailError);
            // Continue even if email fails
        }

        // Generate JWT token (but mark as unverified)
        const token = jwt.sign(
            {
                id: patientId,
                email,
                fullname,
                role: 'patient',
                email_verified: false
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.status(201).json({
            message: 'Registrasi berhasil. Silakan cek email Anda untuk verifikasi.',
            token,
            user: {
                id: patientId,
                fullname,
                full_name: fullname, // Database field name
                email,
                phone,
                role: 'patient',
                email_verified: false
            },
            requires_verification: true
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat registrasi' });
    }
}

router.post('/register', handlePatientRegister);

// Login with email
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({ message: 'Email dan password harus diisi' });
        }
        
        // Find patient by email
        const [patients] = await db.query(
            'SELECT * FROM patients WHERE email = ? AND status = "active"',
            [email]
        );
        
        console.log('Patient login attempt:', email, 'Found:', patients.length);
        
        if (patients.length === 0) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }
        
        const patient = patients[0];
        console.log('Patient found:', patient.id, 'Has password:', !!patient.password);
        
        // Check if patient has a password (might be Google auth only)
        if (!patient.password) {
            return res.status(401).json({ message: 'Akun ini terdaftar dengan Google. Silakan login dengan Google.' });
        }
        
        // Verify password
        const isPasswordValid = await bcrypt.compare(password, patient.password);
        console.log('Password valid:', isPasswordValid);
        
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }
        
        // Generate medical record ID if not exists
        if (!patient.id) {
            const medicalRecordId = await generateUniqueMedicalRecordId();
            await db.query(
                'UPDATE patients SET id = ? WHERE id = ?',
                [medicalRecordId, patient.id]
            );
            patient.id = medicalRecordId;
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                id: patient.id,
                medicalRecordId: patient.id,
                email: patient.email, 
                full_name: patient.full_name,
                role: 'patient'
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        res.json({
            message: 'Login berhasil',
            token,
            user: {
                id: patient.id,
                medicalRecordId: patient.id,
                full_name: patient.full_name,
                fullname: patient.full_name,  // For frontend compatibility
                email: patient.email,
                phone: patient.phone,
                role: 'patient'
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat login' });
    }
});

// Google OAuth Login/Register
router.post('/auth/google', async (req, res) => {
    try {
        const { credential } = req.body;
        
        // Verify Google token
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        const { email, name, sub: googleId, picture } = payload;
        
        // Check if patient exists
        const [existingPatients] = await db.query(
            'SELECT * FROM patients WHERE email = ?',
            [email]
        );
        
        let patient;
        
        if (existingPatients.length > 0) {
            // Update Google ID if not set
            patient = existingPatients[0];
            
            // Generate medical record ID if not exists
            if (!patient.id) {
                const medicalRecordId = await generateUniqueMedicalRecordId();
                await db.query(
                    'UPDATE patients SET id = ?, google_id = ?, photo_url = ?, email_verified = 1 WHERE id = ?',
                    [medicalRecordId, googleId, picture, patient.id]
                );
                patient.id = medicalRecordId;
            } else if (!patient.google_id) {
                await db.query(
                    'UPDATE patients SET google_id = ?, photo_url = ?, email_verified = 1 WHERE id = ?',
                    [googleId, picture, patient.id]
                );
            } else {
                // Just ensure email is verified for existing Google users
                await db.query(
                    'UPDATE patients SET email_verified = 1, photo_url = ? WHERE id = ?',
                    [picture, patient.id]
                );
            }
            patient.email_verified = 1;
        } else {
            // Create new patient with medical record ID
            const medicalRecordId = await generateUniqueMedicalRecordId();
            
            const [result] = await db.query(
                `INSERT INTO patients (id, full_name, email, google_id, photo_url, email_verified, registration_date, status) 
                 VALUES (?, ?, ?, ?, ?, 1, NOW(), 'active')`,
                [medicalRecordId, name, email, googleId, picture]
            );
            
            patient = {
                id: medicalRecordId,
                medical_record_id: medicalRecordId,
                full_name: name,
                email,
                phone: null,
                google_id: googleId,
                photo_url: picture
            };
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                id: patient.id,
                medicalRecordId: patient.id,
                email: patient.email, 
                full_name: patient.full_name,
                fullname: patient.full_name,
                role: 'patient'
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        res.json({
            message: 'Login dengan Google berhasil',
            token,
            user: {
                id: patient.id,
                medicalRecordId: patient.id,
                full_name: patient.full_name,
                fullname: patient.full_name,
                email: patient.email,
                phone: patient.phone,
                photo_url: patient.photo_url,
                email_verified: 1,
                google_id: patient.google_id || googleId,
                role: 'patient'
            }
        });
        
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(401).json({ message: 'Autentikasi Google gagal' });
    }
});

// Verify token endpoint
router.get('/verify', verifyToken, (req, res) => {
    res.json({
        valid: true,
        user: req.user
    });
});

// Get current user profile
router.get('/profile', verifyToken, async (req, res) => {
    // Prevent browser caching - critical for multi-account scenarios
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        const [patients] = await db.query(
            `SELECT id, full_name, email, phone, photo_url,
                    DATE_FORMAT(birth_date, '%Y-%m-%d') as birth_date,
                    age, registration_date, profile_completed, email_verified, google_id, intake_completed, password
             FROM patients WHERE id = ?`,
            [req.user.id]
        );

        if (patients.length === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }

        // Map full_name to fullname and photo_url to profile_picture for frontend compatibility
        const patient = patients[0];

        // birth_date is already formatted as YYYY-MM-DD string from SQL DATE_FORMAT
        const mappedPatient = {
            ...patient,
            fullname: patient.full_name,
            profile_picture: patient.photo_url,
            has_password: patient.password ? 1 : 0
        };

        // Remove password from response (security)
        delete mappedPatient.password;

        res.json({ user: mappedPatient });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan' });
    }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const { full_name, fullname, email, phone, birth_date, age, profile_picture } = req.body;

        // Get current patient data
        const [currentPatient] = await db.query(
            'SELECT full_name, email, phone, photo_url FROM patients WHERE id = ?',
            [req.user.id]
        );
        
        if (currentPatient.length === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }
        
        // Use existing values if new ones not provided
        // Support both full_name and fullname for compatibility
        const updatedFullName = fullname || full_name || currentPatient[0].full_name;
        const updatedEmail = email || currentPatient[0].email;
        const updatedPhone = phone || currentPatient[0].phone;
        const updatedProfilePicture = profile_picture !== undefined ? profile_picture : currentPatient[0].photo_url;
        
        // Validation - only check if values exist (either new or existing)
        if (!updatedFullName || !updatedEmail || !updatedPhone) {
            return res.status(400).json({ message: 'Nama, email, dan nomor telepon harus diisi' });
        }
        
        // Validate email format if email is being updated
        if (email && email !== currentPatient[0].email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ message: 'Format email tidak valid' });
            }
            
            // Check if email is taken by another user
            const [existingUsers] = await db.query(
                'SELECT id FROM patients WHERE email = ? AND id != ?',
                [email, req.user.id]
            );
            
            if (existingUsers.length > 0) {
                return res.status(400).json({ message: 'Email sudah digunakan oleh pengguna lain' });
            }
        }
        
        // Update patient data
        await db.query(
            `UPDATE patients
             SET full_name = ?, email = ?, phone = ?, birth_date = ?, age = ?, photo_url = ?, updated_at = NOW()
             WHERE id = ?`,
            [updatedFullName, updatedEmail, updatedPhone, birth_date || null, age || null, updatedProfilePicture, req.user.id]
        );
        
        // Fetch updated profile
        const [updatedPatient] = await db.query(
            'SELECT id, full_name, email, phone, photo_url, birth_date, age, registration_date FROM patients WHERE id = ?',
            [req.user.id]
        );
        
        res.json({ 
            message: 'Profil berhasil diperbarui',
            user: updatedPatient[0]
        });
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat menyimpan profil' });
    }
});

/**
 * POST /api/patients/upload-photo
 * Upload profile photo to Cloudflare R2
 * Max size: 2MB, Allowed: JPEG, PNG, WebP
 */
router.post('/upload-photo', verifyToken, photoUpload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Tidak ada file yang diupload'
            });
        }

        const patientId = req.user.id;

        // Check if R2 is configured
        if (!r2Storage.isR2Configured()) {
            return res.status(500).json({
                success: false,
                message: 'Storage tidak dikonfigurasi'
            });
        }

        // Upload to R2
        const result = await r2Storage.uploadFile(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype,
            'profile-photos'
        );

        // Use proxy URL instead of direct R2 URL (avoids CDN connectivity issues)
        const proxyUrl = `/api/r2/${result.key}`;

        // Update patient photo_url in database with proxy URL
        await db.query(
            'UPDATE patients SET photo_url = ?, updated_at = NOW() WHERE id = ?',
            [proxyUrl, patientId]
        );

        logger.info('Profile photo uploaded', {
            patientId,
            fileKey: result.key,
            proxyUrl,
            size: req.file.size
        });

        res.json({
            success: true,
            message: 'Foto profil berhasil diupload',
            photo_url: proxyUrl
        });

    } catch (error) {
        logger.error('Upload photo error', { error: error.message });

        // Handle multer errors
        if (error.message.includes('File too large')) {
            return res.status(400).json({
                success: false,
                message: 'Ukuran file maksimal 2MB'
            });
        }

        if (error.message.includes('Hanya file gambar')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Gagal mengupload foto profil'
        });
    }
});

// POST /api/patients/set-password - Set password for Google Sign-In users
router.post('/set-password', verifyToken, async (req, res) => {
    try {
        const { password, confirm_password } = req.body;
        
        // Validation
        if (!password || !confirm_password) {
            return res.status(400).json({ 
                success: false,
                message: 'Password dan konfirmasi password harus diisi' 
            });
        }
        
        if (password !== confirm_password) {
            return res.status(400).json({ 
                success: false,
                message: 'Password dan konfirmasi password tidak cocok' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false,
                message: 'Password minimal 6 karakter' 
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Update patient password
        await db.query(
            'UPDATE patients SET password = ?, updated_at = NOW() WHERE id = ?',
            [hashedPassword, req.user.id]
        );
        
        res.json({ 
            success: true,
            message: 'Password berhasil diatur. Anda sekarang dapat login dengan email dan password.' 
        });
        
    } catch (error) {
        console.error('Set password error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Terjadi kesalahan saat mengatur password' 
        });
    }
});

// POST /api/patients/change-password - Change password (requires old password)
router.post('/change-password', verifyToken, async (req, res) => {
    try {
        const { old_password, new_password, confirm_password } = req.body;
        
        // Validation
        if (!old_password || !new_password || !confirm_password) {
            return res.status(400).json({ 
                success: false,
                message: 'Semua field harus diisi' 
            });
        }
        
        if (new_password !== confirm_password) {
            return res.status(400).json({ 
                success: false,
                message: 'Password baru dan konfirmasi tidak cocok' 
            });
        }
        
        if (new_password.length < 6) {
            return res.status(400).json({ 
                success: false,
                message: 'Password minimal 6 karakter' 
            });
        }
        
        // Get current patient data
        const [patients] = await db.query(
            'SELECT id, password FROM patients WHERE id = ?',
            [req.user.id]
        );
        
        if (patients.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Akun tidak ditemukan' 
            });
        }
        
        const patient = patients[0];
        
        // Check if patient has password set
        if (!patient.password) {
            return res.status(400).json({ 
                success: false,
                message: 'Anda belum pernah set password. Gunakan fitur "Set Password" terlebih dahulu.' 
            });
        }
        
        // Verify old password
        const isOldPasswordValid = await bcrypt.compare(old_password, patient.password);
        if (!isOldPasswordValid) {
            return res.status(401).json({ 
                success: false,
                message: 'Password lama tidak valid' 
            });
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(new_password, 10);
        
        // Update password
        await db.query(
            'UPDATE patients SET password = ?, updated_at = NOW() WHERE id = ?',
            [hashedPassword, req.user.id]
        );
        
        res.json({ 
            success: true,
            message: 'Password berhasil diubah' 
        });
        
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Terjadi kesalahan saat mengubah password' 
        });
    }
});

// Complete profile (first-time setup)
router.post('/complete-profile', verifyToken, async (req, res) => {
    try {
        const { fullname, phone, birth_date, age } = req.body;
        
        // Validation
        if (!fullname || !phone || !birth_date) {
            return res.status(400).json({ message: 'Nama, nomor telepon, dan tanggal lahir harus diisi' });
        }
        
        // Validate phone format (Indonesian mobile with country code 628)
        const phoneRegex = /^628\d{9,12}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ message: 'Format nomor telepon tidak valid. Harus dimulai dengan 628 dan 12-15 digit total' });
        }
        
        // Update patient data and mark profile as completed
        await db.query(
            `UPDATE patients 
             SET full_name = ?, phone = ?, birth_date = ?, age = ?, profile_completed = 1
             WHERE id = ?`,
            [fullname, phone, birth_date, age || null, req.user.id]
        );
        
        // Fetch updated profile
        const [updatedPatient] = await db.query(
            'SELECT id, full_name, email, phone, photo_url, birth_date, age, registration_date, profile_completed FROM patients WHERE id = ?',
            [req.user.id]
        );
        
        if (updatedPatient.length === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }
        
        const patient = updatedPatient[0];
        
        res.json({ 
            message: 'Profil berhasil dilengkapi',
            user: {
                id: patient.id,
                fullname: patient.full_name,
                email: patient.email,
                phone: patient.phone,
                photo_url: patient.photo_url,
                birth_date: patient.birth_date,
                age: patient.age,
                registration_date: patient.registration_date,
                profile_completed: patient.profile_completed
            }
        });
        
    } catch (error) {
        console.error('Complete profile error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat menyimpan profil' });
    }
});

// Get all web patients (Admin/Superadmin only)
router.get('/all', verifyToken, async (req, res) => {
    try {
        // Check if user has permission (you may want to add role check here)
        const [patients] = await db.query(
            `SELECT id, full_name, email, phone, birth_date, age, photo_url, 
                    registration_date, status, profile_completed, created_at, updated_at 
             FROM patients 
             ORDER BY registration_date DESC`
        );
        
        res.json({ patients });
        
    } catch (error) {
        console.error('Get all patients error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat mengambil data pasien' });
    }
});

// Delete web patient (Admin/Superadmin only)
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        if (!req.user.is_superadmin && !['admin', 'dokter'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Unauthorized. Admin access required.' });
        }

        const patientId = req.params.id;
        const { patient, deletedData } = await deletePatientWithRelations(patientId);

        if (!patient) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }

        cache.delPattern('patients:');
        if (cache.keys?.patient) {
            cache.del(cache.keys.patient(patientId));
        } else {
            cache.del(`patient:${patientId}`);
        }

        return res.json({
            message: `Pasien ${patient.full_name} dan seluruh data terkait berhasil dihapus`,
            patient,
            deleted_data: deletedData
        });
    } catch (error) {
        console.error('Delete patient error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat menghapus pasien' });
    }
});

// PATCH /api/patients/:id/status - Update patient status (Admin only)
router.patch('/:id/status', verifyToken, async (req, res) => {
    try {
        const { status } = req.body;
        const patientId = req.params.id;
        
        // Validate status
        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status. Must be "active" or "inactive"' 
            });
        }
        
        // Check if user is admin/superadmin
        if (!req.user.is_superadmin && !['admin', 'dokter'].includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized. Admin access required.' 
            });
        }
        
        // Update patient status
        const [result] = await db.query(
            'UPDATE patients SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, patientId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Patient not found' 
            });
        }
        
        res.json({ 
            success: true, 
            message: `Patient status updated to ${status}`,
            data: { id: patientId, status }
        });
        
    } catch (error) {
        console.error('Error updating patient status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update patient status', 
            error: error.message 
        });
    }
});

// POST /api/patients/verify-email - Verify email with token
router.post('/verify-email', async (req, res) => {
    try {
        const { email, token } = req.body;
        
        if (!email || !token) {
            return res.status(400).json({ message: 'Email dan token verifikasi harus diisi' });
        }
        
        // Find patient
        const [patients] = await db.query(
            `SELECT id, full_name, email, email_verified, verification_token, verification_token_expires 
             FROM patients 
             WHERE email = ?`,
            [email]
        );
        
        if (patients.length === 0) {
            return res.status(404).json({ message: 'Email tidak ditemukan' });
        }
        
        const patient = patients[0];
        
        // Check if already verified
        if (patient.email_verified) {
            return res.status(400).json({ message: 'Email sudah diverifikasi sebelumnya' });
        }
        
        // Check token
        if (patient.verification_token !== token) {
            return res.status(400).json({ message: 'Kode verifikasi tidak valid' });
        }
        
        // Check expiry
        const now = new Date();
        const expires = new Date(patient.verification_token_expires);
        if (now > expires) {
            return res.status(400).json({ message: 'Kode verifikasi sudah kadaluarsa. Silakan minta kode baru.' });
        }
        
        // Update email_verified
        await db.query(
            `UPDATE patients 
             SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL 
             WHERE id = ?`,
            [patient.id]
        );
        
        console.log(`Email verified for patient: ${patient.email} (ID: ${patient.id})`);
        
        res.json({ 
            success: true,
            message: 'Email berhasil diverifikasi!',
            user: {
                id: patient.id,
                full_name: patient.full_name,
                email: patient.email,
                email_verified: true
            }
        });
        
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat verifikasi email' });
    }
});

// POST /api/patients/resend-verification - Resend verification email
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ message: 'Email harus diisi' });
        }
        
        // Find patient
        const [patients] = await db.query(
            'SELECT id, full_name, email, email_verified FROM patients WHERE email = ?',
            [email]
        );
        
        if (patients.length === 0) {
            return res.status(404).json({ message: 'Email tidak ditemukan' });
        }
        
        const patient = patients[0];
        
        // Check if already verified
        if (patient.email_verified) {
            return res.status(400).json({ message: 'Email sudah diverifikasi' });
        }
        
        // Generate new verification token
        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        // Update token
        await db.query(
            'UPDATE patients SET verification_token = ?, verification_token_expires = ? WHERE id = ?',
            [verificationToken, tokenExpires, patient.id]
        );
        
        // Send verification email
        try {
            const emailResult = await getNotificationService().sendVerificationEmail({
                to: email,
                userName: patient.full_name,
                email,
                verificationCode: verificationToken
            });

            if (!emailResult?.success) {
                console.warn('Verification email resend did not succeed', { email, error: emailResult?.error });
            } else {
                console.log(`Verification email resent to ${email} with new token: ${verificationToken}`);
            }

            res.json({ 
                success: true,
                message: 'Kode verifikasi baru telah dikirim ke email Anda'
            });
            
        } catch (emailError) {
            console.error('Failed to resend verification email:', emailError);
            res.status(500).json({ message: 'Gagal mengirim email verifikasi' });
        }
        
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat mengirim ulang verifikasi' });
    }
});

// POST /api/patients/update-birthdate - Update patient birth date
router.post('/update-birthdate', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ message: 'Token tidak ditemukan' });
        }
        
        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ message: 'Token tidak valid' });
        }
        
        const patientId = decoded.id;
        const { birth_date } = req.body;
        
        // Validation
        if (!birth_date) {
            return res.status(400).json({ message: 'Tanggal lahir harus diisi' });
        }
        
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(birth_date)) {
            return res.status(400).json({ message: 'Format tanggal tidak valid (YYYY-MM-DD)' });
        }
        
        // Validate date is not in future
        const birthDate = new Date(birth_date);
        const today = new Date();
        if (birthDate > today) {
            return res.status(400).json({ message: 'Tanggal lahir tidak boleh di masa depan' });
        }
        
        // Update birth date
        await db.query(
            'UPDATE patients SET birth_date = ? WHERE id = ?',
            [birth_date, patientId]
        );
        
        res.json({
            message: 'Tanggal lahir berhasil disimpan',
            birth_date
        });
        
    } catch (error) {
        console.error('Update birthdate error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan saat menyimpan tanggal lahir' });
    }
});

// POST /api/patients/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false,
                message: 'Email harus diisi' 
            });
        }
        
        // Check if email exists
        const [patients] = await db.query(
            'SELECT id, full_name, email FROM patients WHERE email = ?',
            [email]
        );
        
        if (patients.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Email tidak terdaftar dalam sistem kami' 
            });
        }
        
        const patient = patients[0];
        
        // Generate reset token (6 digit code)
        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        // Save reset token to database
        await db.query(
            'UPDATE patients SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
            [resetToken, tokenExpires, patient.id]
        );
        
        // Send reset password email
        try {
            const emailResult = await getNotificationService().sendPasswordResetEmail(email, resetToken, {
                patientName: patient.full_name,
                email
            });

            if (!emailResult?.success) {
                console.warn('Password reset email dispatch did not succeed', { email, error: emailResult?.error });
            } else {
                console.log(`Password reset email sent to ${email} with token: ${resetToken}`);
            }

            res.json({ 
                success: true,
                message: 'Link reset password telah dikirim ke email Anda. Silakan cek inbox atau folder spam.'
            });
            
        } catch (emailError) {
            console.error('Failed to send reset password email:', emailError);
            res.status(500).json({ 
                success: false,
                message: 'Gagal mengirim email reset password. Silakan coba lagi.' 
            });
        }
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Terjadi kesalahan. Silakan coba lagi.' 
        });
    }
});

module.exports = router;
