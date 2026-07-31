const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { validateOperationalSchemaScope } = require('../services/OperationalSchemaValidator');
const cache = require('../utils/cache');
const { deletePatientWithRelations } = require('../services/patientDeletion');
const r2Storage = require('../services/r2Storage');
const logger = require('../utils/logger');
const PatientPasswordService = require('../services/PatientPasswordService');
const PatientPasswordResetService = require('../services/PatientPasswordResetService');
const PatientPortalSettingsService = require('../services/PatientPortalSettingsService');
const { ROLE_NAMES, isSuperadminRole } = require('../constants/roles');
const patientActivityLogger = require('../services/patientActivityLogger');
const pushService = require('../services/pushNotificationService');
const {
    BLOCKED_PATIENT_MESSAGE,
    isPatientIdentityBlocked,
    isPatientRequestIpBlocked,
    rememberBlockedPatientRequestIp
} = require('../utils/patientAccessBlocklist');
const PATIENT_AUTH_BLOCKLIST_ENABLED = process.env.PATIENT_AUTH_BLOCKLIST_ENABLED === 'true';

const PATIENT_AUTH_COLUMNS = [
    'id',
    'full_name',
    'email',
    'phone',
    'birth_date',
    'age',
    'password',
    'google_id',
    'photo_url',
    'home_photo_url',
    'registration_date',
    'status',
    'profile_completed',
    'intake_completed',
    'email_verified'
].join(', ');

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

// JWT Secret - Required in environment variable
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET must be defined in environment variables');
    process.exit(1);
}
const PATIENT_JWT_EXPIRES_IN = process.env.PATIENT_JWT_EXPIRES_IN || '24h';

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

let birthTestimonialColumnsReady = false;

async function ensureBirthTestimonialColumns() {
    return validateOperationalSchemaScope('birthTestimonials');
}

/**
 * Generate unique patient ID in format P{year}{sequence}
 * Example: P2025001, P2025002, etc.
 * Matches the web version format
 */
async function generateUniqueMedicalRecordId() {
    const year = new Date().getFullYear();

    // Get the highest ID for this year
    const [maxIdResult] = await db.query(
        `SELECT id FROM patients WHERE id LIKE 'P${year}%' ORDER BY id DESC LIMIT 1`
    );

    let nextNumber = 1;
    if (maxIdResult.length > 0) {
        const lastId = maxIdResult[0].id;
        const lastNumber = parseInt(lastId.substring(5)); // Remove 'P2025'
        nextNumber = lastNumber + 1;
    }

    const patientId = `P${year}${String(nextNumber).padStart(3, '0')}`;
    return patientId;
}

function formatDateOnlyLocal(value) {
    if (!value) return null;
    if (typeof value === 'string') return value.split('T')[0];
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

// Check if registration code is required
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

// Validate and consume registration code
async function validateAndConsumeCode(code, patientId) {
    if (!code) return { valid: false, message: 'Kode registrasi harus diisi' };

    const normalizedCode = code.toUpperCase().trim();

    // Check if code exists and is valid
    const [codes] = await db.query(
        `SELECT * FROM registration_codes
         WHERE code = ? AND status = 'active' AND expires_at > NOW()`,
        [normalizedCode]
    );

    if (codes.length === 0) {
        // Check if code exists but expired
        const [expiredCodes] = await db.query(
            'SELECT * FROM registration_codes WHERE code = ?',
            [normalizedCode]
        );

        if (expiredCodes.length > 0) {
            const existingCode = expiredCodes[0];
            // Only check 'used' status for private codes (is_public = 0)
            if (existingCode.status === 'used' && existingCode.is_public === 0) {
                return { valid: false, message: 'Kode registrasi sudah digunakan' };
            } else if (existingCode.status === 'expired' || new Date(existingCode.expires_at) < new Date()) {
                return { valid: false, message: 'Kode registrasi sudah kadaluarsa' };
            }
        }

        return { valid: false, message: 'Kode registrasi tidak valid' };
    }

    const codeData = codes[0];

    // Only mark non-public codes as used (public codes stay active for multiple registrations)
    if (codeData.is_public === 0) {
        await db.query(
            `UPDATE registration_codes
             SET status = 'used', used_at = NOW(), used_by_patient_id = ?
             WHERE code = ? AND is_public = 0`,
            [patientId, normalizedCode]
        );
    }

    return { valid: true, codeData };
}

// Register with email
async function handlePatientRegister(req, res) {
    return res.status(410).json({
        success: false,
        google_only: true,
        message: 'Pendaftaran lewat email sudah ditutup. Silakan daftar dengan Google.'
    });

    try {
        const { fullname, email, phone, password, registration_code } = req.body;

        if (PATIENT_AUTH_BLOCKLIST_ENABLED && await isPatientRequestIpBlocked(req)) {
            logger.warn(`Patient registration blocked by IP blocklist: ${email}`);
            return res.status(403).json({
                success: false,
                message: BLOCKED_PATIENT_MESSAGE
            });
        }

        // Validation
        if (!fullname || !email || !phone || !password) {
            return res.status(400).json({ message: 'Semua field harus diisi' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password minimal 6 karakter' });
        }

        if (PATIENT_AUTH_BLOCKLIST_ENABLED && isPatientIdentityBlocked({ name: fullname })) {
            rememberBlockedPatientRequestIp(req);
            logger.warn(`Patient registration blocked by name blocklist: ${email}`);
            return res.status(403).json({
                success: false,
                message: BLOCKED_PATIENT_MESSAGE
            });
        }

        // Check if registration code is required
        const codeRequired = await isRegistrationCodeRequired();
        if (codeRequired && !registration_code) {
            return res.status(400).json({
                message: 'Kode registrasi diperlukan. Hubungi klinik untuk mendapatkan kode.',
                code_required: true
            });
        }

        // Validate registration code (if required)
        if (codeRequired) {
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
                        return res.status(400).json({ message: 'Kode registrasi sudah digunakan' });
                    } else if (existingCode.status === 'expired' || new Date(existingCode.expires_at) < new Date()) {
                        return res.status(400).json({ message: 'Kode registrasi sudah kadaluarsa' });
                    }
                }

                return res.status(400).json({ message: 'Kode registrasi tidak valid' });
            }
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

        // Mark registration code as used (if code was required and NOT a public code)
        if (codeRequired && registration_code) {
            const normalizedCode = registration_code.toUpperCase().trim();
            // Only mark non-public codes as used (public codes can be reused)
            await db.query(
                `UPDATE registration_codes
                 SET status = 'used', used_at = NOW(), used_by_patient_id = ?
                 WHERE code = ? AND is_public = 0`,
                [patientId, normalizedCode]
            );
            console.log(`Registration code ${normalizedCode} used by patient ${patientId}`);
        }

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
            { expiresIn: PATIENT_JWT_EXPIRES_IN }
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
    return res.status(410).json({
        success: false,
        google_only: true,
        message: 'Login lewat email sudah ditutup. Silakan masuk dengan Google.'
    });

    try {
        const { email, password } = req.body;

        if (PATIENT_AUTH_BLOCKLIST_ENABLED && await isPatientRequestIpBlocked(req)) {
            logger.warn(`Patient login blocked by IP blocklist: ${email}`);
            return res.status(403).json({
                success: false,
                message: BLOCKED_PATIENT_MESSAGE
            });
        }
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({ message: 'Email dan password harus diisi' });
        }
        
        // Find patient by email
        const [patients] = await db.query(
            `SELECT ${PATIENT_AUTH_COLUMNS} FROM patients WHERE email = ? AND status = "active"`,
            [email]
        );
        
        console.log('Patient login attempt:', email, 'Found:', patients.length);
        
        if (patients.length === 0) {
            return res.status(401).json({ message: 'Email atau password salah' });
        }
        
        const patient = patients[0];
        console.log('Patient found:', patient.id, 'Has password:', !!patient.password);

        if (PATIENT_AUTH_BLOCKLIST_ENABLED && isPatientIdentityBlocked({ name: patient.full_name })) {
            rememberBlockedPatientRequestIp(req);
            logger.warn(`Patient login blocked by name blocklist: ${patient.email}`);
            return res.status(403).json({
                success: false,
                message: BLOCKED_PATIENT_MESSAGE
            });
        }

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
            { expiresIn: PATIENT_JWT_EXPIRES_IN }
        );
        
        // Check if intake form is completed
        const intakeCompleted = patient.intake_completed === 1;

        // Track login activity (fire-and-forget)
        patientActivityLogger.logActivity(patient.id, patientActivityLogger.EVENTS.LOGIN, null, req);

        res.json({
            message: 'Login berhasil',
            success: true,
            token,
            intake_completed: intakeCompleted,
            user: {
                id: patient.id,
                medicalRecordId: patient.id,
                full_name: patient.full_name,
                fullname: patient.full_name,  // For frontend compatibility
                email: patient.email,
                phone: patient.phone,
                intake_completed: intakeCompleted,
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
        if (PATIENT_AUTH_BLOCKLIST_ENABLED && await isPatientRequestIpBlocked(req)) {
            logger.warn('[GOOGLE-AUTH] Blocked by IP blocklist');
            return res.status(403).json({
                success: false,
                message: BLOCKED_PATIENT_MESSAGE
            });
        }

        // Accept both 'credential' (web) and 'idToken' (mobile native) field names
        const idToken = req.body.credential || req.body.idToken;
        const registrationCode = req.body.registration_code || req.body.registrationCode;
        const appVersion = req.body.app_version;

        console.log(`[GOOGLE-AUTH] Request received - hasIdToken: ${!!req.body.idToken}, hasCredential: ${!!req.body.credential}, appVersion: ${appVersion}, regCode: ${registrationCode || 'none'}`);

        // Minimum app version required for new registrations (must have registration code flow)
        const MIN_APP_VERSION = '1.0.3';

        if (!idToken) {
            return res.status(400).json({ message: 'Token tidak ditemukan' });
        }

        // Android client IDs for native sign-in
        const ANDROID_CLIENT_ID = '738335602560-5napmglm15g8jr5c1j0ienc9v8ptnsnt.apps.googleusercontent.com';
        const ANDROID_CLIENT_ID_CAPACITOR = '738335602560-s5mgu5cgu40gc70uciegqtkckug1lg62.apps.googleusercontent.com';

        // DEBUG: Decode token to see its audience (without verification)
        try {
            const tokenParts = idToken.split('.');
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            console.log('[GOOGLE-AUTH] Token audience (aud):', payload.aud);
            console.log('[GOOGLE-AUTH] Token azp:', payload.azp);
            console.log('[GOOGLE-AUTH] Expected audiences:', [GOOGLE_CLIENT_ID, ANDROID_CLIENT_ID, ANDROID_CLIENT_ID_CAPACITOR]);
        } catch (e) {
            console.log('[GOOGLE-AUTH] Could not decode token for debug:', e.message);
        }

        // Verify Google token - accept Web and all Android client IDs
        const ticket = await googleClient.verifyIdToken({
            idToken: idToken,
            audience: [GOOGLE_CLIENT_ID, ANDROID_CLIENT_ID, ANDROID_CLIENT_ID_CAPACITOR]
        });

        const payload = ticket.getPayload();
        const { email, name, sub: googleId, picture } = payload;

        if (PATIENT_AUTH_BLOCKLIST_ENABLED && isPatientIdentityBlocked({ name })) {
            rememberBlockedPatientRequestIp(req);
            logger.warn(`[GOOGLE-AUTH] Blocked by name blocklist: ${email}`);
            return res.status(403).json({
                success: false,
                message: BLOCKED_PATIENT_MESSAGE
            });
        }

        // Check if patient exists
        const [existingPatients] = await db.query(
            `SELECT ${PATIENT_AUTH_COLUMNS} FROM patients WHERE email = ?`,
            [email]
        );

        let patient;
        let isNewPatient = false;

        if (existingPatients.length > 0) {
            // Update Google ID if not set
            patient = existingPatients[0];

            if (PATIENT_AUTH_BLOCKLIST_ENABLED && isPatientIdentityBlocked({ name: patient.full_name })) {
                rememberBlockedPatientRequestIp(req);
                logger.warn(`[GOOGLE-AUTH] Existing patient blocked by name blocklist: ${patient.email}`);
                return res.status(403).json({
                    success: false,
                    message: BLOCKED_PATIENT_MESSAGE
                });
            }

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
            // NEW PATIENT
            isNewPatient = true;

            // Check if this is a mobile app request (uses idToken, not credential from web)
            const isMobileApp = req.body.idToken && !req.body.credential;

            // CRITICAL: Old mobile apps that don't send app_version cannot register new patients
            // They must update to v1.0.3+ which has the registration code flow
            if (isMobileApp && !appVersion) {
                logger.warn(`Old mobile app without version tried to register new patient: ${email}`);
                return res.status(400).json({
                    message: 'Versi aplikasi sudah tidak didukung. Silakan update aplikasi ke versi terbaru.',
                    update_required: true,
                    min_version: MIN_APP_VERSION
                });
            }

            // Version check for mobile app - old versions cannot register new patients
            if (appVersion) {
                // Compare semantic versions (e.g., "1.0.2" vs "1.0.3")
                const compareVersions = (v1, v2) => {
                    const parts1 = v1.split('.').map(Number);
                    const parts2 = v2.split('.').map(Number);
                    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
                        const p1 = parts1[i] || 0;
                        const p2 = parts2[i] || 0;
                        if (p1 < p2) return -1;
                        if (p1 > p2) return 1;
                    }
                    return 0;
                };

                if (compareVersions(appVersion, MIN_APP_VERSION) < 0) {
                    logger.warn(`Old app version ${appVersion} tried to register new patient: ${email}`);
                    return res.status(400).json({
                        message: 'Versi aplikasi sudah tidak didukung. Silakan update aplikasi ke versi terbaru.',
                        update_required: true,
                        min_version: MIN_APP_VERSION,
                        current_version: appVersion
                    });
                }
            }

            // Check if registration code is required (from settings)
            const codeRequired = await isRegistrationCodeRequired();
            console.log(`[GOOGLE-AUTH] New patient ${email} - codeRequired: ${codeRequired}, registrationCode: ${registrationCode || 'none'}, appVersion: ${appVersion || 'none'}`);

            let validCode = null;

            if (codeRequired) {
                // Registration code is required
                if (!registrationCode) {
                    console.log(`[GOOGLE-AUTH] Blocking new patient ${email} - no registration code provided`);
                    return res.status(400).json({
                        message: 'Kode registrasi diperlukan untuk pendaftaran baru. Hubungi klinik untuk mendapatkan kode.',
                        code_required: true,
                        is_new_patient: true
                    });
                }

                // Validate registration code
                const normalizedCode = registrationCode.toUpperCase().trim();
                const [validCodes] = await db.query(
                    `SELECT * FROM registration_codes
                     WHERE code = ? AND status = 'active' AND expires_at > NOW()`,
                    [normalizedCode]
                );

                if (validCodes.length === 0) {
                    // Check if code exists but expired/used
                    const [expiredCodes] = await db.query(
                        'SELECT * FROM registration_codes WHERE code = ?',
                        [normalizedCode]
                    );

                    if (expiredCodes.length > 0) {
                        const existingCode = expiredCodes[0];
                        if (existingCode.status === 'used') {
                            return res.status(400).json({
                                message: 'Kode registrasi sudah digunakan',
                                code_required: true
                            });
                        } else if (new Date(existingCode.expires_at) < new Date()) {
                            return res.status(400).json({
                                message: 'Kode registrasi sudah kadaluarsa',
                                code_required: true
                            });
                        }
                    }

                    return res.status(400).json({
                        message: 'Kode registrasi tidak valid',
                        code_required: true
                    });
                }

                validCode = validCodes[0];
            }

            // Create new patient with medical record ID
            // Use Google display name as temporary; user still forced to complete profile (profile_completed=0)
            const medicalRecordId = await generateUniqueMedicalRecordId();
            const tempName = name || email.split('@')[0];

            const [result] = await db.query(
                `INSERT INTO patients (id, full_name, email, google_id, photo_url, email_verified, registration_date, status, patient_type, profile_completed)
                 VALUES (?, ?, ?, ?, ?, 1, NOW(), 'active', 'web', 0)`,
                [medicalRecordId, tempName, email, googleId, picture]
            );

            // Mark non-public registration code as used (if code was required and provided)
            if (validCode && !validCode.is_public) {
                await db.query(
                    `UPDATE registration_codes
                     SET status = 'used', used_at = NOW(), used_by_patient_id = ?
                     WHERE id = ?`,
                    [medicalRecordId, validCode.id]
                );
            }

            console.log(`New Google patient registered: ${email}${validCode ? ` with code ${validCode.code}` : ' (no code required)'}`);

            patient = {
                id: medicalRecordId,
                medical_record_id: medicalRecordId,
                full_name: tempName,
                email,
                phone: null,
                google_id: googleId,
                photo_url: picture,
                profile_completed: 0
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
            { expiresIn: PATIENT_JWT_EXPIRES_IN }
        );
        
        // Ensure user record exists in users table for new patients
        if (isNewPatient) {
            const [existingUser] = await db.query(
                'SELECT new_id FROM users WHERE email = ?',
                [patient.email]
            );

            if (existingUser.length === 0) {
                // Use patient's medical record ID as user ID (they're linked)
                await db.query(
                    `INSERT INTO users (new_id, email, name, user_type, password_hash, created_at)
                     VALUES (?, ?, ?, 'patient', '', NOW())`,
                    [patient.id, patient.email, patient.full_name]
                );
            }
        }

        // Check if profile is incomplete (needs full_name/phone/birth_date)
        const needsProfileCompletion = !patient.full_name || !patient.phone || !patient.birth_date;

        // Check if intake form is completed
        const intakeCompleted = patient.intake_completed === 1;

        // Track login activity (fire-and-forget)
        patientActivityLogger.logActivity(patient.id, patientActivityLogger.EVENTS.LOGIN, null, req);

        res.json({
            message: isNewPatient ? 'Pendaftaran dengan Google berhasil' : 'Login dengan Google berhasil',
            token,
            is_new_patient: isNewPatient,
            needs_profile_completion: needsProfileCompletion,
            intake_completed: intakeCompleted,
            user: {
                id: patient.id,
                medicalRecordId: patient.id,
                full_name: patient.full_name,
                fullname: patient.full_name,
                email: patient.email,
                phone: patient.phone,
                birth_date: formatDateOnlyLocal(patient.birth_date),
                photo_url: patient.photo_url,
                home_photo_url: patient.home_photo_url || null,
                email_verified: 1,
                google_id: patient.google_id || googleId,
                intake_completed: intakeCompleted,
                profile_completed: patient.profile_completed || 0,
                role: 'patient'
            }
        });

    } catch (error) {
        console.error('[GOOGLE-AUTH] Error:', error.message);
        console.error('[GOOGLE-AUTH] Full error:', error);
        res.status(401).json({ message: 'Autentikasi Google gagal', debug: error.message });
    }
});

// Google OAuth Code Exchange (for mobile app)
router.post('/google-auth-code', async (req, res) => {
    try {
        if (PATIENT_AUTH_BLOCKLIST_ENABLED && await isPatientRequestIpBlocked(req)) {
            logger.warn('[GOOGLE-AUTH-CODE] Blocked by IP blocklist');
            return res.status(403).json({
                success: false,
                message: BLOCKED_PATIENT_MESSAGE
            });
        }

        const { code, redirectUri, registration_code: registrationCode } = req.body;
        console.log('[GOOGLE-AUTH-CODE] Received request with code length:', code?.length || 0, 'regCode:', registrationCode || 'none');

        if (!code) {
            console.log('[GOOGLE-AUTH] No code provided');
            return res.status(400).json({ success: false, message: 'Kode otorisasi tidak ditemukan' });
        }

        // Build token request params
        // For Android app, redirect_uri should be empty string
        const tokenParams = {
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            grant_type: 'authorization_code'
        };

        // Only add redirect_uri if it's not empty (web uses URL, Android uses empty)
        if (redirectUri) {
            tokenParams.redirect_uri = redirectUri;
        }

        // Exchange authorization code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(tokenParams)
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('[GOOGLE-AUTH] Token error:', tokenData);
            return res.status(401).json({ success: false, message: 'Gagal mengambil token: ' + tokenData.error_description });
        }
        console.log('[GOOGLE-AUTH] Token exchange successful');

        // Get user info using access token
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });

        const userInfo = await userInfoResponse.json();
        const { email, name, id: googleId, picture } = userInfo;
        console.log('[GOOGLE-AUTH] User info:', { email, name, googleId: googleId?.substring(0, 8) + '...' });

        if (!email) {
            console.log('[GOOGLE-AUTH] No email in user info');
            return res.status(401).json({ success: false, message: 'Tidak dapat mengambil email dari akun Google' });
        }

        if (PATIENT_AUTH_BLOCKLIST_ENABLED && isPatientIdentityBlocked({ name })) {
            rememberBlockedPatientRequestIp(req);
            logger.warn(`[GOOGLE-AUTH-CODE] Blocked by name blocklist: ${email}`);
            return res.status(403).json({
                success: false,
                message: BLOCKED_PATIENT_MESSAGE
            });
        }

        // Check if patient exists
        const [existingPatients] = await db.query(
            `SELECT ${PATIENT_AUTH_COLUMNS} FROM patients WHERE email = ?`,
            [email]
        );

        let patient;

        if (existingPatients.length > 0) {
            patient = existingPatients[0];
            console.log('[GOOGLE-AUTH] Existing patient found:', patient.id);

            if (PATIENT_AUTH_BLOCKLIST_ENABLED && isPatientIdentityBlocked({ name: patient.full_name })) {
                rememberBlockedPatientRequestIp(req);
                logger.warn(`[GOOGLE-AUTH-CODE] Existing patient blocked by name blocklist: ${patient.email}`);
                return res.status(403).json({
                    success: false,
                    message: BLOCKED_PATIENT_MESSAGE
                });
            }

            // Update Google ID and photo if needed
            await db.query(
                'UPDATE patients SET google_id = COALESCE(google_id, ?), photo_url = ?, email_verified = 1 WHERE id = ?',
                [googleId, picture, patient.id]
            );
            patient.email_verified = 1;
            patient.photo_url = picture;
        } else {
            // NEW PATIENT - Check registration code requirement
            const codeRequired = await isRegistrationCodeRequired();
            console.log('[GOOGLE-AUTH-CODE] New patient', email, '- codeRequired:', codeRequired, 'registrationCode:', registrationCode || 'none');

            if (codeRequired) {
                if (!registrationCode) {
                    console.log('[GOOGLE-AUTH-CODE] Blocking new patient', email, '- no registration code provided');
                    return res.status(400).json({
                        success: false,
                        message: 'Kode registrasi diperlukan untuk pendaftaran baru.',
                        code_required: true,
                        is_new_patient: true
                    });
                }

                // Validate registration code
                const [codes] = await db.query(
                    `SELECT * FROM registration_codes
                     WHERE code = ? AND status = 'active' AND expires_at > NOW()`,
                    [registrationCode]
                );

                if (codes.length === 0) {
                    console.log('[GOOGLE-AUTH-CODE] Invalid registration code:', registrationCode);
                    return res.status(400).json({
                        success: false,
                        message: 'Kode registrasi tidak valid atau sudah kadaluarsa.',
                        code_required: true,
                        is_new_patient: true
                    });
                }
                console.log('[GOOGLE-AUTH-CODE] Registration code validated:', registrationCode);
            }

            // Create new patient
            // Use Google display name as temporary; user still forced to complete profile (profile_completed=0)
            const medicalRecordId = await generateUniqueMedicalRecordId();
            const tempName = name || email.split('@')[0];
            console.log('[GOOGLE-AUTH-CODE] Creating new patient:', medicalRecordId, 'for email:', email);

            await db.query(
                `INSERT INTO patients (id, full_name, email, google_id, photo_url, email_verified, registration_date, status, patient_type, profile_completed)
                 VALUES (?, ?, ?, ?, ?, 1, NOW(), 'active', 'web', 0)`,
                [medicalRecordId, tempName, email, googleId, picture]
            );

            patient = {
                id: medicalRecordId,
                full_name: tempName,
                email,
                phone: null,
                google_id: googleId,
                photo_url: picture,
                profile_completed: 0
            };
            console.log('[GOOGLE-AUTH-CODE] Patient created successfully');
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
            { expiresIn: PATIENT_JWT_EXPIRES_IN }
        );

        const intakeCompleted = patient.intake_completed === 1;
        const needsProfileCompletion = !patient.full_name || !patient.phone || !patient.birth_date;

        // Track login activity (fire-and-forget)
        patientActivityLogger.logActivity(patient.id, patientActivityLogger.EVENTS.LOGIN, null, req);

        res.json({
            success: true,
            message: 'Login dengan Google berhasil',
            token,
            intake_completed: intakeCompleted,
            needs_profile_completion: needsProfileCompletion,
            user: {
                id: patient.id,
                medicalRecordId: patient.id,
                full_name: patient.full_name,
                fullname: patient.full_name,
                email: patient.email,
                phone: patient.phone,
                birth_date: formatDateOnlyLocal(patient.birth_date),
                photo_url: patient.photo_url,
                home_photo_url: patient.home_photo_url || null,
                email_verified: 1,
                google_id: patient.google_id || googleId,
                intake_completed: intakeCompleted,
                profile_completed: patient.profile_completed || 0,
                role: 'patient'
            }
        });

    } catch (error) {
        console.error('Google auth code error:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses login Google' });
    }
});

// ==================== PUSH TOKEN ENDPOINTS ====================

// Register push token (PWA web push or FCM mobile)
router.post('/push-token', verifyToken, async (req, res) => {
    try {
        var patientId = req.user?.id;
        var { platform, token, endpoint, p256dh, auth } = req.body;

        if (!platform) {
            return res.status(400).json({ success: false, message: 'platform is required (web/android/ios)' });
        }

        var tokenData;
        if (platform === 'web') {
            if (!endpoint) {
                return res.status(400).json({ success: false, message: 'endpoint is required for web push' });
            }
            tokenData = { endpoint: endpoint, p256dh: p256dh, auth: auth };
        } else {
            if (!token) {
                return res.status(400).json({ success: false, message: 'token is required for mobile push' });
            }
            tokenData = { token: token };
        }

        var result = await pushService.registerToken(patientId, platform, tokenData);

        if (result.success) {
            // Also update legacy patients.fcm_token for backward compat (mobile only)
            if (platform !== 'web' && token) {
                db.query('UPDATE patients SET fcm_token = ? WHERE id = ?', [token, patientId])
                    .catch(function() {});
            }
            res.json({ success: true, message: 'Push token registered' });
        } else {
            res.status(400).json({ success: false, message: result.error });
        }
    } catch (error) {
        console.error('Error registering push token:', error);
        res.status(500).json({ success: false, message: 'Failed to register push token' });
    }
});

// Unregister push token
router.delete('/push-token', verifyToken, async (req, res) => {
    try {
        var patientId = req.user?.id;
        var tokenValue = req.body?.token || req.body?.endpoint;

        if (!tokenValue) {
            // If no specific token, remove all tokens for this patient
            await pushService.unregisterAllTokens(patientId);
        } else {
            await pushService.unregisterToken(patientId, tokenValue);
        }

        // Also clear legacy column
        db.query('UPDATE patients SET fcm_token = NULL WHERE id = ?', [patientId])
            .catch(function() {});

        res.json({ success: true, message: 'Push token unregistered' });
    } catch (error) {
        console.error('Error unregistering push token:', error);
        res.status(500).json({ success: false, message: 'Failed to unregister push token' });
    }
});

// Legacy FCM token endpoints (backward compat for existing mobile app)
router.post('/fcm-token', verifyToken, async (req, res) => {
    try {
        var patientId = req.user?.id;
        var fcm_token = req.body?.fcm_token;

        if (!fcm_token) {
            return res.status(400).json({ success: false, message: 'FCM token is required' });
        }

        await pushService.registerToken(patientId, 'android', { token: fcm_token });
        await db.query('UPDATE patients SET fcm_token = ? WHERE id = ?', [fcm_token, patientId]);

        res.json({ success: true, message: 'FCM token registered successfully' });
    } catch (error) {
        console.error('Error registering FCM token:', error);
        res.status(500).json({ success: false, message: 'Failed to register FCM token' });
    }
});

router.delete('/fcm-token', verifyToken, async (req, res) => {
    try {
        var patientId = req.user?.id;

        var [rows] = await db.query('SELECT fcm_token FROM patients WHERE id = ?', [patientId]);
        if (rows[0]?.fcm_token) {
            await pushService.unregisterToken(patientId, rows[0].fcm_token);
        }

        await db.query('UPDATE patients SET fcm_token = NULL WHERE id = ?', [patientId]);

        res.json({ success: true, message: 'FCM token unregistered successfully' });
    } catch (error) {
        console.error('Error unregistering FCM token:', error);
        res.status(500).json({ success: false, message: 'Failed to unregister FCM token' });
    }
});

// Track page view (fire-and-forget, responds immediately)
router.post('/track-page', verifyToken, (req, res) => {
    const pageName = req.body && req.body.page_name;
    if (pageName && req.user && req.user.id) {
        patientActivityLogger.logActivity(
            req.user.id,
            patientActivityLogger.EVENTS.VIEW_HALAMAN,
            { page_name: pageName, detail: pageName },
            req
        );
    }
    res.json({ ok: true });
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

router.get('/portal-settings', verifyToken, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        const settings = await PatientPortalSettingsService.getSettings(req.user.id);
        res.json({ success: true, settings });
    } catch (error) {
        logger.error('Portal settings load error', { patientId: req.user.id, error: error.message });
        res.status(500).json({ success: false, message: 'Gagal mengambil pengaturan portal' });
    }
});

router.put('/portal-settings', verifyToken, async (req, res) => {
    try {
        const settings = await PatientPortalSettingsService.saveSettings(req.user.id, req.body || {});
        res.json({ success: true, settings });
    } catch (error) {
        logger.error('Portal settings save error', { patientId: req.user.id, error: error.message });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.statusCode ? error.message : 'Gagal menyimpan pengaturan portal'
        });
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
            'SELECT id, full_name, email, phone, photo_url, home_photo_url, birth_date, age, registration_date FROM patients WHERE id = ?',
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
function handleProfilePhotoUpload(req, res, next) {
    photoUpload.single('photo')(req, res, (error) => {
        if (!error) return next();

        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'Ukuran file melebihi batas maksimal 2 MB'
            });
        }

        return res.status(400).json({
            success: false,
            message: error.message || 'File foto tidak valid'
        });
    });
}

router.post('/upload-photo', verifyToken, handleProfilePhotoUpload, async (req, res) => {
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
                message: 'Ukuran file melebihi batas maksimal 2 MB'
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

// POST /api/patients/upload-home-photo - Upload home/beranda photo to R2
const homePhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp/;
        if (allowed.test(file.mimetype) && allowed.test(path.extname(file.originalname).toLowerCase())) {
            return cb(null, true);
        }
        cb(new Error('Hanya file gambar (JPEG, PNG, WebP) yang diperbolehkan'));
    }
});

router.post('/upload-home-photo', verifyToken, (req, res, next) => {
    homePhotoUpload.single('photo')(req, res, (err) => {
        if (!err) return next();
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file melebihi batas 5 MB' : (err.message || 'File tidak valid');
        return res.status(400).json({ success: false, message: msg });
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada file yang diupload' });
        if (!r2Storage.isR2Configured()) return res.status(500).json({ success: false, message: 'Storage tidak dikonfigurasi' });

        const patientId = req.user.id;

        // Delete old home photo from R2 if exists
        const [existing] = await db.query('SELECT home_photo_r2_key FROM patients WHERE id = ?', [patientId]);
        const oldKey = existing[0] && existing[0].home_photo_r2_key;
        if (oldKey) {
            try { await r2Storage.deleteFile(oldKey); } catch (e) { logger.warn('Failed to delete old home photo', { key: oldKey, error: e.message }); }
        }

        // Upload new photo to R2
        const result = await r2Storage.uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'home-photos');
        const proxyUrl = `/api/r2/${result.key}`;

        await db.query(
            'UPDATE patients SET home_photo_r2_key = ?, home_photo_url = ?, updated_at = NOW() WHERE id = ?',
            [result.key, proxyUrl, patientId]
        );

        logger.info('Home photo uploaded', { patientId, key: result.key });
        res.json({ success: true, home_photo_url: proxyUrl });

    } catch (error) {
        logger.error('Upload home photo error', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal mengupload foto beranda' });
    }
});

// DELETE /api/patients/home-photo - Remove home/beranda photo
router.delete('/home-photo', verifyToken, async (req, res) => {
    try {
        const patientId = req.user.id;
        const [existing] = await db.query('SELECT home_photo_r2_key FROM patients WHERE id = ?', [patientId]);
        const oldKey = existing[0] && existing[0].home_photo_r2_key;
        if (oldKey) {
            try { await r2Storage.deleteFile(oldKey); } catch (e) { logger.warn('Failed to delete home photo from R2', { key: oldKey }); }
        }
        await db.query('UPDATE patients SET home_photo_r2_key = NULL, home_photo_url = NULL, updated_at = NOW() WHERE id = ?', [patientId]);
        res.json({ success: true });
    } catch (error) {
        logger.error('Delete home photo error', { error: error.message });
        res.status(500).json({ success: false, message: 'Gagal menghapus foto beranda' });
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
        
        // Update password in BOTH tables using centralized service
        await PatientPasswordService.hashAndUpdatePassword({
            patientId: req.user.id,
            email: req.user.email,
            plainPassword: password
        });

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
        
        // Update password in BOTH tables using centralized service
        await PatientPasswordService.hashAndUpdatePassword({
            patientId: req.user.id,
            email: req.user.email,
            plainPassword: new_password
        });

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
        const { fullname, phone, birth_date, age, registration_code } = req.body;

        const { google_flow } = req.body;

        // Validation
        if (!fullname || !phone || !birth_date) {
            return res.status(400).json({ message: 'Nama, nomor telepon, dan tanggal lahir harus diisi' });
        }

        // Validate phone format (Indonesian mobile with country code 628)
        const phoneRegex = /^628\d{9,12}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ message: 'Format nomor telepon tidak valid. Harus dimulai dengan 628 dan 12-15 digit total' });
        }

        // Check if user is a Google Sign-In user (skip registration code for them)
        let isGoogleUser = false;
        if (google_flow) {
            const [patientCheck] = await db.query(
                'SELECT google_id FROM patients WHERE id = ?',
                [req.user.id]
            );
            isGoogleUser = patientCheck.length > 0 && !!patientCheck[0].google_id;
        }

        let regCode = null;

        if (!isGoogleUser) {
            // Registration code required for non-Google users
            if (!registration_code) {
                return res.status(400).json({ message: 'Kode registrasi wajib diisi' });
            }

            // Validate registration code
            const [regCodes] = await db.query(
                `SELECT * FROM registration_codes
                 WHERE code = ? AND status = 'active' AND expires_at > NOW()`,
                [registration_code.toUpperCase()]
            );

            if (regCodes.length === 0) {
                return res.status(400).json({ message: 'Kode registrasi tidak valid atau sudah kadaluarsa' });
            }

            regCode = regCodes[0];

            // If code has a specific phone, validate it matches
            if (regCode.phone && regCode.phone !== phone) {
                return res.status(400).json({ message: 'Nomor telepon tidak sesuai dengan kode registrasi' });
            }
        }

        // Update patient data and mark profile as completed
        // Also set whatsapp = phone so both fields are populated
        await db.query(
            `UPDATE patients
             SET full_name = ?, phone = ?, whatsapp = ?, birth_date = ?, age = ?, profile_completed = 1, patient_type = 'web'
             WHERE id = ?`,
            [fullname, phone, phone, birth_date, age || null, req.user.id]
        );

        // Also update users table name
        await db.query(
            'UPDATE users SET name = ? WHERE email = (SELECT email FROM patients WHERE id = ?)',
            [fullname, req.user.id]
        ).catch(() => {}); // Non-critical

        // Mark registration code as used (only for non-Google-flow, non-public codes)
        if (regCode && !regCode.is_public) {
            await db.query(
                `UPDATE registration_codes
                 SET status = 'used', used_at = NOW(), used_by_patient_id = ?
                 WHERE id = ?`,
                [req.user.id, regCode.id]
            );
        }

        // Fetch updated profile
        const [updatedPatient] = await db.query(
            'SELECT id, full_name, email, phone, photo_url, home_photo_url, birth_date, age, registration_date, profile_completed FROM patients WHERE id = ?',
            [req.user.id]
        );

        if (updatedPatient.length === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }

        const patient = updatedPatient[0];

        res.json({
            success: true,
            message: 'Profil berhasil dilengkapi',
            user: {
                id: patient.id,
                fullname: patient.full_name,
                email: patient.email,
                phone: patient.phone,
                photo_url: patient.photo_url,
                home_photo_url: patient.home_photo_url || null,
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

// Complete profile with full intake data (Android app)
router.post('/complete-profile-full', verifyToken, async (req, res) => {
    try {
        const {
            patient_name,
            patient_phone,
            patient_dob,
            patient_age,
            nik,
            patient_emergency_contact,
            patient_address,
            patient_marital_status,
            patient_husband_name,
            husband_age,
            husband_job,
            patient_occupation,
            patient_education,
            patient_insurance,
            registration_code
        } = req.body;

        // Validation
        if (!patient_name || !patient_phone || !patient_dob) {
            return res.status(400).json({ message: 'Nama, nomor telepon, dan tanggal lahir harus diisi' });
        }

        // Validate registration code is required
        if (!registration_code) {
            return res.status(400).json({ message: 'Kode registrasi wajib diisi' });
        }

        // Validate phone format
        const phoneRegex = /^628\d{9,12}$/;
        if (!phoneRegex.test(patient_phone)) {
            return res.status(400).json({ message: 'Format nomor telepon tidak valid' });
        }

        // Validate registration code
        const [regCodes] = await db.query(
            `SELECT * FROM registration_codes
             WHERE code = ? AND status = 'active' AND expires_at > NOW()`,
            [registration_code.toUpperCase()]
        );

        if (regCodes.length === 0) {
            return res.status(400).json({ message: 'Kode registrasi tidak valid atau sudah kadaluarsa' });
        }

        const regCode = regCodes[0];

        // If code has a specific phone, validate it matches
        if (regCode.phone && regCode.phone !== patient_phone) {
            return res.status(400).json({ message: 'Nomor telepon tidak sesuai dengan kode registrasi' });
        }

        // Calculate age from birth date
        let age = patient_age;
        if (!age && patient_dob) {
            const birthDate = new Date(patient_dob);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
        }

        // Update patient data
        await db.query(
            `UPDATE patients
             SET full_name = ?, phone = ?, birth_date = ?, age = ?, profile_completed = 1, intake_completed = 1
             WHERE id = ?`,
            [patient_name, patient_phone, patient_dob, age || null, req.user.id]
        );

        // Create intake submission payload
        const intakePayload = {
            patient_name,
            patient_phone,
            patient_dob,
            patient_age: age,
            nik: nik || null,
            patient_emergency_contact: patient_emergency_contact || null,
            patient_address: patient_address || null,
            patient_marital_status: patient_marital_status || null,
            patient_husband_name: patient_husband_name || null,
            husband_age: husband_age || null,
            husband_job: husband_job || null,
            patient_occupation: patient_occupation || null,
            patient_education: patient_education || null,
            patient_insurance: patient_insurance || null,
            source: 'android_app',
            submitted_at: new Date().toISOString()
        };

        // Check if intake submission exists
        const [existingIntake] = await db.query(
            'SELECT id FROM patient_intake_submissions WHERE patient_id = ?',
            [req.user.id]
        );

        if (existingIntake.length > 0) {
            // Update existing
            await db.query(
                `UPDATE patient_intake_submissions
                 SET full_name = ?, phone = ?, birth_date = ?, nik = ?, payload = ?, updated_at = NOW()
                 WHERE patient_id = ?`,
                [patient_name, patient_phone, patient_dob, nik || null, JSON.stringify(intakePayload), req.user.id]
            );
        } else {
            // Create new submission
            const submissionId = 'AND-' + Date.now().toString(36).toUpperCase();
            await db.query(
                `INSERT INTO patient_intake_submissions
                 (submission_id, patient_id, full_name, phone, birth_date, nik, payload, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', NOW())`,
                [submissionId, req.user.id, patient_name, patient_phone, patient_dob, nik || null, JSON.stringify(intakePayload)]
            );
        }

        // Mark registration code as used (only for non-public codes)
        if (!regCode.is_public) {
            await db.query(
                `UPDATE registration_codes
                 SET status = 'used', used_at = NOW(), used_by_patient_id = ?
                 WHERE id = ?`,
                [req.user.id, regCode.id]
            );
        }

        // Fetch updated profile
        const [updatedPatient] = await db.query(
            'SELECT id, full_name, email, phone, photo_url, home_photo_url, birth_date, age, registration_date, profile_completed FROM patients WHERE id = ?',
            [req.user.id]
        );

        if (updatedPatient.length === 0) {
            return res.status(404).json({ message: 'Pasien tidak ditemukan' });
        }

        const patient = updatedPatient[0];

        res.json({
            success: true,
            message: 'Profil berhasil dilengkapi',
            user: {
                id: patient.id,
                fullname: patient.full_name,
                email: patient.email,
                phone: patient.phone,
                photo_url: patient.photo_url,
                home_photo_url: patient.home_photo_url || null,
                birth_date: patient.birth_date,
                age: patient.age,
                registration_date: patient.registration_date,
                profile_completed: patient.profile_completed
            }
        });

    } catch (error) {
        console.error('Complete profile full error:', error);
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

// Delete web patient (Superadmin/Dokter only)
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        if (!req.user.is_superadmin && !isSuperadminRole(req.user.role_id)) {
            return res.status(403).json({ message: 'Unauthorized. Superadmin access required.' });
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
                message: 'Status tidak valid. Harus "active" atau "inactive"'
            });
        }

        // Check if user is admin/superadmin
        if (!req.user.is_superadmin && !isAdminRole(req.user.role_id)) {
            return res.status(403).json({
                success: false,
                message: 'Akses ditolak. Hanya admin yang dapat melakukan ini.'
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
                message: 'Pasien tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: `Status pasien berhasil diubah menjadi ${status}`,
            data: { id: patientId, status }
        });

    } catch (error) {
        console.error('Error updating patient status:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengubah status pasien',
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
        const result = await PatientPasswordResetService.requestReset({
            email,
            revealMissingEmail: true
        });

        res.status(result.status || (result.success ? 200 : 400)).json({
            success: result.success,
            message: result.message
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan. Silakan coba lagi.'
        });
    }
});

// POST /api/patients/verify-reset-token - Verify reset token before showing password form
router.post('/verify-reset-token', async (req, res) => {
    try {
        const { email, token } = req.body;

        if (!email || !token) {
            return res.status(400).json({
                success: false,
                message: 'Email dan kode verifikasi harus diisi'
            });
        }

        // Find patient with valid reset token
        const [patients] = await db.query(
            `SELECT id, full_name, email, reset_token, reset_token_expires
             FROM patients
             WHERE email = ?`,
            [email]
        );

        if (patients.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Email tidak ditemukan'
            });
        }

        const patient = patients[0];

        // Check token
        if (patient.reset_token !== token) {
            return res.status(400).json({
                success: false,
                message: 'Kode verifikasi tidak valid'
            });
        }

        // Check expiry
        const now = new Date();
        const expires = new Date(patient.reset_token_expires);
        if (now > expires) {
            return res.status(400).json({
                success: false,
                message: 'Kode verifikasi sudah kadaluarsa. Silakan minta kode baru.'
            });
        }

        res.json({
            success: true,
            message: 'Kode valid. Silakan masukkan password baru.',
            patientName: patient.full_name
        });

    } catch (error) {
        console.error('Verify reset token error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan. Silakan coba lagi.'
        });
    }
});

// POST /api/patients/reset-password - Reset password with token
router.post('/reset-password', async (req, res) => {
    try {
        const { email, token, password, confirm_password } = req.body;

        // Validation
        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: 'Kode verifikasi dan password baru harus diisi'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password minimal 8 karakter'
            });
        }

        if (confirm_password && password !== confirm_password) {
            return res.status(400).json({
                success: false,
                message: 'Password dan konfirmasi password tidak cocok'
            });
        }

        const result = await PatientPasswordResetService.resetPassword({
            email,
            token,
            newPassword: password
        });

        res.status(result.status || (result.success ? 200 : 400)).json({
            success: result.success,
            message: result.message
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan. Silakan coba lagi.'
        });
    }
});

// ==================== PREGNANCY TRACKER ====================

/**
 * GET /pregnancy-tracker
 * Get pregnancy tracker data for logged-in patient
 * Uses EDD from latest USG record
 */
router.get('/pregnancy-tracker', verifyToken, async (req, res) => {
    // Prevent browser caching
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');

    try {
        const patientId = req.user.id;

        // Get latest USG record with EDD for this patient
        const [usgRecords] = await db.query(`
            SELECT
                record_data,
                created_at as record_date
            FROM medical_records
            WHERE patient_id = ?
            AND record_type = 'usg'
            AND JSON_EXTRACT(record_data, '$.edd') IS NOT NULL
            AND JSON_EXTRACT(record_data, '$.edd') != ''
            AND JSON_EXTRACT(record_data, '$.edd') != 'null'
            ORDER BY created_at DESC
            LIMIT 1
        `, [patientId]);

        if (!usgRecords || usgRecords.length === 0) {
            return res.json({
                success: true,
                data: null,
                message: 'Belum ada data USG dengan HPL'
            });
        }

        const usgData = typeof usgRecords[0].record_data === 'string'
            ? JSON.parse(usgRecords[0].record_data)
            : usgRecords[0].record_data;

        const edd = usgData.edd; // EDD = Estimated Delivery Date = HPL
        if (!edd) {
            return res.json({
                success: true,
                data: null,
                message: 'HPL belum tersedia dari USG'
            });
        }

        // Calculate pregnancy week from EDD
        // Pregnancy is ~40 weeks, so HPHT = EDD - 280 days
        const eddDate = new Date(edd);
        const today = new Date();
        const hphtEstimate = new Date(eddDate);
        hphtEstimate.setDate(hphtEstimate.getDate() - 280);

        // Calculate days pregnant
        const daysPregnant = Math.floor((today - hphtEstimate) / (1000 * 60 * 60 * 24));
        const weeksPregnant = Math.floor(daysPregnant / 7);
        const daysExtra = daysPregnant % 7;

        // Days until EDD
        const daysUntilEdd = Math.floor((eddDate - today) / (1000 * 60 * 60 * 24));

        // Auto-hide if HPL + 14 days (2 weeks) has passed
        // This assumes patient has delivered
        const GRACE_PERIOD_DAYS = 14;
        if (daysUntilEdd < -GRACE_PERIOD_DAYS) {
            return res.json({
                success: true,
                data: null,
                message: 'Kehamilan sudah selesai (HPL + 2 minggu telah berlalu)'
            });
        }

        // Trimester calculation
        let trimester = 1;
        if (weeksPregnant >= 28) trimester = 3;
        else if (weeksPregnant >= 14) trimester = 2;

        // Baby size comparison by week
        const babySizes = {
            4: { size: 'Biji Poppy', emoji: 'Ã°Å¸Å’Â±', length: '0.1 cm' },
            5: { size: 'Biji Wijen', emoji: 'Ã°Å¸Å’Â±', length: '0.2 cm' },
            6: { size: 'Biji Lentil', emoji: 'Ã°Å¸Â«Ëœ', length: '0.4 cm' },
            7: { size: 'Blueberry', emoji: 'Ã°Å¸Â«Â', length: '1 cm' },
            8: { size: 'Raspberry', emoji: 'Ã°Å¸Ââ€¡', length: '1.6 cm' },
            9: { size: 'Anggur', emoji: 'Ã°Å¸Ââ€¡', length: '2.3 cm' },
            10: { size: 'Kurma', emoji: 'Ã°Å¸Â«â€™', length: '3.1 cm' },
            11: { size: 'Jeruk Limau', emoji: 'Ã°Å¸Ââ€¹', length: '4.1 cm' },
            12: { size: 'Jeruk Nipis', emoji: 'Ã°Å¸Ââ€¹', length: '5.4 cm' },
            13: { size: 'Lemon', emoji: 'Ã°Å¸Ââ€¹', length: '7.4 cm' },
            14: { size: 'Jeruk', emoji: 'Ã°Å¸ÂÅ ', length: '8.7 cm' },
            15: { size: 'Apel', emoji: 'Ã°Å¸ÂÅ½', length: '10.1 cm' },
            16: { size: 'Alpukat', emoji: 'Ã°Å¸Â¥â€˜', length: '11.6 cm' },
            17: { size: 'Pir', emoji: 'Ã°Å¸ÂÂ', length: '13 cm' },
            18: { size: 'Paprika', emoji: 'Ã°Å¸Â«â€˜', length: '14.2 cm' },
            19: { size: 'Tomat Besar', emoji: 'Ã°Å¸Ââ€¦', length: '15.3 cm' },
            20: { size: 'Pisang', emoji: 'Ã°Å¸ÂÅ’', length: '16.4 cm' },
            21: { size: 'Wortel', emoji: 'Ã°Å¸Â¥â€¢', length: '26.7 cm' },
            22: { size: 'Jagung', emoji: 'Ã°Å¸Å’Â½', length: '27.8 cm' },
            23: { size: 'Mangga', emoji: 'Ã°Å¸Â¥Â­', length: '28.9 cm' },
            24: { size: 'Jagung Besar', emoji: 'Ã°Å¸Å’Â½', length: '30 cm' },
            25: { size: 'Terong', emoji: 'Ã°Å¸Ââ€ ', length: '34.6 cm' },
            26: { size: 'Brokoli', emoji: 'Ã°Å¸Â¥Â¦', length: '35.6 cm' },
            27: { size: 'Kembang Kol', emoji: 'Ã°Å¸Â¥Â¬', length: '36.6 cm' },
            28: { size: 'Terong Besar', emoji: 'Ã°Å¸Ââ€ ', length: '37.6 cm' },
            29: { size: 'Labu Siam', emoji: 'Ã°Å¸Å½Æ’', length: '38.6 cm' },
            30: { size: 'Kubis', emoji: 'Ã°Å¸Â¥Â¬', length: '39.9 cm' },
            31: { size: 'Kelapa', emoji: 'Ã°Å¸Â¥Â¥', length: '41.1 cm' },
            32: { size: 'Nangka', emoji: 'Ã°Å¸ÂË†', length: '42.4 cm' },
            33: { size: 'Nanas', emoji: 'Ã°Å¸ÂÂ', length: '43.7 cm' },
            34: { size: 'Melon', emoji: 'Ã°Å¸ÂË†', length: '45 cm' },
            35: { size: 'Melon Besar', emoji: 'Ã°Å¸ÂË†', length: '46.2 cm' },
            36: { size: 'Pepaya', emoji: 'Ã°Å¸ÂË†', length: '47.4 cm' },
            37: { size: 'Labu', emoji: 'Ã°Å¸Å½Æ’', length: '48.6 cm' },
            38: { size: 'Labu Besar', emoji: 'Ã°Å¸Å½Æ’', length: '49.8 cm' },
            39: { size: 'Semangka Mini', emoji: 'Ã°Å¸Ââ€°', length: '50.7 cm' },
            40: { size: 'Semangka', emoji: 'Ã°Å¸Ââ€°', length: '51.2 cm' }
        };

        const weekClamped = Math.max(4, Math.min(40, weeksPregnant));
        const babySize = babySizes[weekClamped] || babySizes[40];

        // Weekly milestone tips
        const weeklyTips = {
            4: 'Embrio mulai berkembang. Istirahat cukup dan konsumsi asam folat.',
            8: 'Jantung bayi mulai berdetak! Jaga pola makan sehat.',
            12: 'Risiko keguguran menurun. Trimester pertama hampir selesai.',
            16: 'Bayi mulai bergerak! Anda mungkin merasakan gerakan halus.',
            20: 'USG tengah kehamilan. Bayi sudah bisa mendengar suara Anda.',
            24: 'Bayi aktif bergerak. Jaga hidrasi dan istirahat cukup.',
            28: 'Trimester ketiga dimulai! Persiapkan perlengkapan bayi.',
            32: 'Bayi semakin besar. Kontrol rutin sangat penting.',
            36: 'Hampir waktunya! Bayi sudah siap posisi lahir.',
            40: 'Selamat! Waktu persalinan sudah dekat. Tetap tenang dan siap.'
        };

        // Get closest tip
        const tipWeek = Object.keys(weeklyTips)
            .map(Number)
            .filter(w => w <= weeksPregnant)
            .pop() || 4;
        const tip = weeklyTips[tipWeek];

        res.json({
            success: true,
            data: {
                edd: edd,
                eddFormatted: new Date(edd).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }),
                weeksPregnant: weeksPregnant,
                daysExtra: daysExtra,
                daysUntilEdd: Math.max(0, daysUntilEdd),
                trimester: trimester,
                progressPercent: Math.min(100, Math.round((weeksPregnant / 40) * 100)),
                babySize: babySize,
                tip: tip,
                usgDate: usgRecords[0].record_date
            }
        });

    } catch (error) {
        console.error('Pregnancy tracker error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat data kehamilan'
        });
    }
});

/**
 * GET /medications
 * Get current medications/prescriptions for logged-in patient
 */
router.get('/medications', verifyToken, async (req, res) => {
    try {
        const patientId = req.user.id;

        // Get planning records with terapi data from the last 90 days
        const [medications] = await db.query(`
            SELECT
                mr.id,
                mr.mr_id,
                mr.created_at as visit_date,
                JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.terapi')) as terapi,
                CASE
                    WHEN mr.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1
                    ELSE 0
                END as is_current
            FROM medical_records mr
            WHERE mr.patient_id = ?
            AND mr.record_type = 'planning'
            AND JSON_EXTRACT(mr.record_data, '$.terapi') IS NOT NULL
            AND JSON_EXTRACT(mr.record_data, '$.terapi') != ''
            AND JSON_EXTRACT(mr.record_data, '$.terapi') != 'null'
            AND mr.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
            ORDER BY mr.created_at DESC
            LIMIT 10
        `, [patientId]);

        res.json({
            success: true,
            data: medications
        });

    } catch (error) {
        console.error('Medications error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat data obat'
        });
    }
});

/**
 * GET /birth-record
 * Get birth congratulations data for logged-in patient
 */
router.get('/birth-record', verifyToken, async (req, res) => {
    try {
        await ensureBirthTestimonialColumns();

        const patientId = req.user.id;

        // Get published, non-dismissed birth congratulations for this patient
        const [birthRecords] = await db.query(`
            SELECT
                id,
                child_number,
                baby_name,
                birth_date,
                birth_time,
                birth_weight as weight,
                birth_length as length,
                gender,
                photo_url,
                photo_r2_key,
                message,
                patient_testimonial,
                patient_testimonial_submitted_at,
                doctor_name,
                theme_color,
                patient_dismissed
            FROM birth_congratulations
            WHERE patient_id = ?
            AND is_published = 1
            AND patient_dismissed = 0
            ORDER BY child_number ASC
            LIMIT 1
        `, [patientId]);

        if (birthRecords.length === 0) {
            return res.json({
                success: true,
                birth: null
            });
        }

        const birth = birthRecords[0];

        // If photo_r2_key exists but photo_url is expired, generate new signed URL
        if (birth.photo_r2_key && birth.photo_url) {
            try {
                // Generate fresh signed URL (valid for 7 days)
                const signedUrl = await r2Storage.getSignedDownloadUrl(birth.photo_r2_key, 7 * 24 * 60 * 60);
                birth.photo_url = signedUrl;
            } catch (err) {
                console.error('Error generating signed URL for birth photo:', err);
                // Keep existing URL as fallback
            }
        }

        delete birth.photo_r2_key;

        res.json({
            success: true,
            birth: birth
        });

    } catch (error) {
        console.error('Birth record error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat data kelahiran'
        });
    }
});

// ==================== DAILY EMPOWERING QUOTE ====================
// Single quote per day, same for ALL patients, cached globally
router.get('/daily-quote', verifyToken, async (req, res) => {
    try {
        const today = new Date();
        const dateKey = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

        if (!global.patientQuoteCache) global.patientQuoteCache = {};

        if (global.patientQuoteCache.date === dateKey) {
            return res.json({ success: true, data: global.patientQuoteCache.data, cached: true });
        }

        const aiService = require('../services/aiService');
        const result = await aiService.generatePatientDailyQuote();

        if (result.success) {
            global.patientQuoteCache = { date: dateKey, data: result.data };
        }

        res.json({ success: true, data: result.data });
    } catch (error) {
        console.error('Daily quote error:', error);
        res.json({
            success: true,
            data: { quote: 'Setiap langkah yang kau ambil hari ini adalah hadiah untuk masa depan keluargamu.' }
        });
    }
});

module.exports = router;
