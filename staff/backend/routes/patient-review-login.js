'use strict';

/**
 * Email + password login for review (test) accounts only.
 * POST /api/patients/review-login  { email, password }
 *
 * Normal patients keep logging in with Google; /api/patients/login stays closed (410).
 * The token and the response have exactly the shape of the Google login
 * (routes/patients-auth.js, google-auth-code), so the portal treats the session the same way.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const defaultLogger = require('../utils/logger');

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 200;

function formatDateOnlyLocal(value) {
    if (!value) return null;
    if (typeof value === 'string') return value.split('T')[0];
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function createDefaultLimiter() {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        skipSuccessfulRequests: true,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, code: 'REVIEW_LOGIN_RATE_LIMITED', message: 'Terlalu banyak percobaan masuk. Coba lagi 15 menit lagi.' }
    });
}

function createPatientReviewLoginRouter({
    service,
    jwtSecret,
    expiresIn = process.env.PATIENT_JWT_EXPIRES_IN || '24h',
    limiter = createDefaultLimiter(),
    activityLogger,
    logger = defaultLogger
} = {}) {
    const router = express.Router();
    const reviewAccounts = () => service || require('../services/PatientReviewAccountService').getPatientReviewAccountService();
    const secret = () => jwtSecret || require('../middleware/auth').JWT_SECRET;
    const activity = () => activityLogger || require('../services/patientActivityLogger');

    router.post('/', limiter, async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        if (!email || !password || email.length > MAX_EMAIL_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
            return res.status(400).json({ success: false, code: 'INVALID_INPUT', message: 'Email dan password wajib diisi' });
        }

        try {
            const result = await reviewAccounts().authenticate(email, password);
            if (result.status === 'invalid') {
                return res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Email atau password salah' });
            }
            if (result.status === 'expired') {
                return res.status(403).json({ success: false, code: 'REVIEW_ACCOUNT_EXPIRED', message: 'Masa berlaku akun uji sudah berakhir. Hubungi admin@dokterdibya.com.' });
            }
            if (result.status !== 'ok') {
                return res.status(403).json({ success: false, code: 'REVIEW_ACCOUNT_DISABLED', message: 'Akun uji tidak aktif. Hubungi admin@dokterdibya.com.' });
            }

            const patient = result.patient;
            const token = jwt.sign(
                {
                    id: patient.id,
                    medicalRecordId: patient.id,
                    email: patient.email,
                    full_name: patient.full_name,
                    fullname: patient.full_name,
                    role: 'patient'
                },
                secret(),
                { expiresIn }
            );

            try {
                await reviewAccounts().recordLogin(patient.id);
            } catch (error) {
                logger.warn('[ReviewLogin] Failed to record login', { patientId: patient.id, message: error.message });
            }
            const activityLog = activity();
            activityLog.logActivity(patient.id, activityLog.EVENTS.LOGIN, null, req);

            const intakeCompleted = patient.intake_completed === 1;
            const needsProfileCompletion = !patient.full_name || !patient.phone || !patient.birth_date;
            return res.json({
                success: true,
                message: 'Login akun uji berhasil',
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
                    photo_url: patient.photo_url || null,
                    home_photo_url: patient.home_photo_url || null,
                    email_verified: 1,
                    google_id: patient.google_id || null,
                    intake_completed: intakeCompleted,
                    profile_completed: patient.profile_completed || 0,
                    role: 'patient'
                }
            });
        } catch (error) {
            logger.error('[ReviewLogin] Login failed', { message: error.message });
            return res.status(500).json({ success: false, message: 'Gagal memproses login' });
        }
    });

    return router;
}

module.exports = { createPatientReviewLoginRouter };
