'use strict';

/**
 * PatientPasswordService
 *
 * CRITICAL: Patient credentials are stored in TWO tables:
 * - patients.password (legacy)
 * - users.password_hash (used by login!)
 *
 * This service ensures BOTH tables are always updated together.
 * NEVER update patient passwords directly - always use this service!
 */

const db = require('../db');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

/**
 * Update patient password in BOTH tables
 * @param {Object} options
 * @param {number} [options.patientId] - Patient ID (from patients table)
 * @param {string} [options.email] - Patient email (required if patientId not provided)
 * @param {string} options.hashedPassword - Already hashed password (bcrypt)
 * @returns {Promise<boolean>} - Success status
 */
async function updatePassword({ patientId, email, hashedPassword }) {
    if (!hashedPassword) {
        throw new Error('hashedPassword is required');
    }

    if (!patientId && !email) {
        throw new Error('Either patientId or email is required');
    }

    try {
        // Get email if only patientId provided
        if (!email && patientId) {
            const [[patient]] = await db.query(
                'SELECT email FROM patients WHERE id = ?',
                [patientId]
            );
            if (!patient) {
                throw new Error(`Patient not found with ID: ${patientId}`);
            }
            email = patient.email;
        }

        // Update patients table
        if (patientId) {
            await db.query(
                'UPDATE patients SET password = ?, updated_at = NOW() WHERE id = ?',
                [hashedPassword, patientId]
            );
        } else {
            await db.query(
                'UPDATE patients SET password = ?, updated_at = NOW() WHERE email = ?',
                [hashedPassword, email]
            );
        }

        // Update users table (THIS IS WHAT LOGIN CHECKS!)
        const [result] = await db.query(
            `UPDATE users SET password_hash = ?, updated_at = NOW()
             WHERE email = ? AND user_type = 'patient'`,
            [hashedPassword, email]
        );

        if (result.affectedRows === 0) {
            logger.warn(`No user record found for patient email: ${email} - users table not updated`);
        }

        logger.info(`Patient password updated for: ${email} (both tables)`);
        return true;

    } catch (error) {
        logger.error('Failed to update patient password', {
            patientId,
            email,
            error: error.message
        });
        throw error;
    }
}

/**
 * Hash and update patient password
 * Convenience method that handles hashing
 * @param {Object} options
 * @param {number} [options.patientId] - Patient ID
 * @param {string} [options.email] - Patient email
 * @param {string} options.plainPassword - Plain text password to hash
 * @returns {Promise<boolean>}
 */
async function hashAndUpdatePassword({ patientId, email, plainPassword }) {
    if (!plainPassword) {
        throw new Error('plainPassword is required');
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    return updatePassword({ patientId, email, hashedPassword });
}

module.exports = {
    updatePassword,
    hashAndUpdatePassword
};
