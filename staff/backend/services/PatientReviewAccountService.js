'use strict';

/**
 * Review (test) accounts for payment-gateway reviewers.
 *
 * Patient login is Google-only. A review account is an ordinary patient row plus a row in
 * patient_review_accounts holding a bcrypt hash and an expiry date; only such patients can log in
 * with email + password (routes/patient-review-login.js). In Duitku sandbox mode only active
 * review accounts may go through prepay checkout (CheckupPrepayService).
 *
 * Login answers never reveal whether an email exists: an unknown email still runs one bcrypt
 * compare, and "expired" / "revoked" are only reported after the password matched.
 */

const crypto = require('crypto');

const BCRYPT_ROUNDS = 12;

const REVIEW_COLUMNS = 'id, patient_id, password_hash, label, expires_at, revoked_at, last_login_at, login_count';
const PATIENT_COLUMNS = 'id, full_name, email, phone, birth_date, photo_url, home_photo_url, google_id, status, profile_completed, intake_completed';

function toDate(value) {
    return value instanceof Date ? value : new Date(value);
}

function isMissingTable(error) {
    return !!error && error.code === 'ER_NO_SUCH_TABLE';
}

function createPatientReviewAccountService({ db, hasher = require('bcrypt'), clock = () => new Date() }) {
    let dummyHashPromise = null;
    const dummyHash = () => {
        if (!dummyHashPromise) dummyHashPromise = hasher.hash(crypto.randomBytes(18).toString('hex'), BCRYPT_ROUNDS);
        return dummyHashPromise;
    };

    async function findReviewRow(patientId) {
        try {
            const [rows] = await db.query(`SELECT ${REVIEW_COLUMNS} FROM patient_review_accounts WHERE patient_id = ? LIMIT 1`, [patientId]);
            return rows[0] || null;
        } catch (error) {
            if (isMissingTable(error)) return null;
            throw error;
        }
    }

    function isActiveRow(row, now) {
        return !!row && !row.revoked_at && toDate(row.expires_at) > now;
    }

    /**
     * @returns {Promise<{status:'ok'|'invalid'|'expired'|'revoked'|'inactive', patient?:Object, review?:Object}>}
     */
    async function authenticate(email, password) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        // Two separate queries: joining VARCHAR ids across tables can hit a collation mismatch.
        const [patients] = await db.query(`SELECT ${PATIENT_COLUMNS} FROM patients WHERE email = ? LIMIT 1`, [normalizedEmail]);
        const patient = patients[0] || null;
        const review = patient ? await findReviewRow(patient.id) : null;

        if (!review) {
            await hasher.compare(String(password || ''), await dummyHash());
            return { status: 'invalid' };
        }
        const matches = await hasher.compare(String(password || ''), review.password_hash);
        if (!matches) return { status: 'invalid' };

        if (review.revoked_at) return { status: 'revoked' };
        if (toDate(review.expires_at) <= clock()) return { status: 'expired' };
        if (patient.status && patient.status !== 'active') return { status: 'inactive' };
        return { status: 'ok', patient, review };
    }

    async function recordLogin(patientId) {
        await db.query(
            'UPDATE patient_review_accounts SET last_login_at = ?, login_count = login_count + 1 WHERE patient_id = ?',
            [clock(), patientId]
        );
    }

    async function isActiveReviewPatient(patientId) {
        if (!patientId) return false;
        const row = await findReviewRow(patientId);
        return isActiveRow(row, clock());
    }

    return { authenticate, recordLogin, isActiveReviewPatient, findReviewRow };
}

let defaultService = null;
function getPatientReviewAccountService() {
    if (!defaultService) defaultService = createPatientReviewAccountService({ db: require('../db') });
    return defaultService;
}

module.exports = {
    BCRYPT_ROUNDS,
    createPatientReviewAccountService,
    getPatientReviewAccountService
};
