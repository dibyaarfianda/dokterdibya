'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const notification = require('../utils/notification');
const logger = require('../utils/logger');
const PatientPasswordService = require('./PatientPasswordService');

const GENERIC_RESET_MESSAGE = 'If an account with that email exists, a password reset link has been sent.';
const LEGACY_RESET_MESSAGE = 'Link reset password telah dikirim ke email Anda. Silakan cek inbox atau folder spam.';

function makeResetToken() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

async function requestReset({ email, revealMissingEmail = false } = {}) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        return {
            success: false,
            status: 400,
            message: 'Email harus diisi'
        };
    }

    const [patients] = await db.query(
        'SELECT id, email, full_name FROM patients WHERE email = ?',
        [normalizedEmail]
    );

    if (patients.length === 0) {
        logger.warn(`Password reset requested for non-existent email: ${normalizedEmail}`);
        return {
            success: !revealMissingEmail,
            status: revealMissingEmail ? 404 : 200,
            message: revealMissingEmail ? 'Email tidak terdaftar dalam sistem kami' : GENERIC_RESET_MESSAGE
        };
    }

    const patient = patients[0];
    const token = makeResetToken();
    const hashedToken = await bcrypt.hash(token, 10);
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await db.query(
        'INSERT INTO patient_password_reset_tokens (patient_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [patient.id, hashedToken, expires]
    );

    const emailResult = await notification.sendPasswordResetEmail(patient.email, token, {
        patientName: patient.full_name,
        email: patient.email
    });

    if (!emailResult?.success) {
        logger.error(`Failed to send password reset email to ${normalizedEmail}`, { error: emailResult?.error });
    } else {
        logger.info(`Password reset email sent to ${normalizedEmail}`);
    }

    return {
        success: true,
        status: 200,
        message: revealMissingEmail ? LEGACY_RESET_MESSAGE : GENERIC_RESET_MESSAGE
    };
}

async function findCanonicalToken(token) {
    const [tokens] = await db.query(
        'SELECT id, patient_id, token_hash FROM patient_password_reset_tokens WHERE expires_at > NOW() AND used = 0'
    );

    for (const record of tokens) {
        if (await bcrypt.compare(token, record.token_hash)) {
            return record;
        }
    }

    return null;
}

async function findLegacyToken({ email, token }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;

    const [patients] = await db.query(
        `SELECT id, email, reset_token, reset_token_expires
         FROM patients
         WHERE email = ?`,
        [normalizedEmail]
    );

    if (patients.length === 0) return null;

    const patient = patients[0];
    if (patient.reset_token !== token) return null;
    if (!patient.reset_token_expires || new Date() > new Date(patient.reset_token_expires)) return null;

    return patient;
}

async function resetPassword({ email, token, newPassword } = {}) {
    if (!token || !newPassword) {
        return {
            success: false,
            status: 400,
            message: 'Token dan password baru harus diisi'
        };
    }

    if (newPassword.length < 8) {
        return {
            success: false,
            status: 400,
            message: 'Password minimal 8 karakter'
        };
    }

    const canonicalToken = await findCanonicalToken(token);
    if (canonicalToken) {
        await PatientPasswordService.hashAndUpdatePassword({
            patientId: canonicalToken.patient_id,
            plainPassword: newPassword
        });

        await db.query(
            'UPDATE patient_password_reset_tokens SET used = 1 WHERE patient_id = ?',
            [canonicalToken.patient_id]
        );

        return {
            success: true,
            status: 200,
            message: 'Password berhasil diubah! Silakan login dengan password baru Anda.'
        };
    }

    const legacyPatient = await findLegacyToken({ email, token });
    if (legacyPatient) {
        await PatientPasswordService.hashAndUpdatePassword({
            patientId: legacyPatient.id,
            plainPassword: newPassword
        });

        await db.query(
            'UPDATE patients SET reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = ?',
            [legacyPatient.id]
        );

        return {
            success: true,
            status: 200,
            message: 'Password berhasil diubah! Silakan login dengan password baru Anda.'
        };
    }

    return {
        success: false,
        status: 400,
        message: 'Token tidak valid atau sudah kedaluwarsa.'
    };
}

module.exports = {
    requestReset,
    resetPassword
};
