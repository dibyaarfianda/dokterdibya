'use strict';

const db = require('../db');
const logger = require('../utils/logger');
const { validateOperationalSchemaScope } = require('./OperationalSchemaValidator');

const SUSPENSION_CACHE_TTL_MS = 30 * 1000;
const MAX_REASON_LENGTH = 500;
const SUSPENDED_PATIENT_MESSAGE = 'Akun Anda ditangguhkan. Silakan hubungi staff melalui menu Pesan.';

let activeCache = { loadedAt: 0, map: new Map() };

function clearSuspensionCache() {
    activeCache = { loadedAt: 0, map: new Map() };
}

function toSuspensionView(row) {
    if (!row) return null;
    return {
        patient_id: row.patient_id,
        reason: row.reason || '',
        suspended_at: row.suspended_at || null,
        suspended_by_id: row.suspended_by_id || null,
        suspended_by_name: row.suspended_by_name || null
    };
}

async function loadActiveSuspensions() {
    const now = Date.now();
    if (now - activeCache.loadedAt < SUSPENSION_CACHE_TTL_MS) return activeCache.map;

    await validateOperationalSchemaScope('patientAccountSuspension');
    const [rows] = await db.query(
        `SELECT patient_id, reason, suspended_at, suspended_by_id, suspended_by_name
         FROM patient_account_suspensions
         WHERE is_suspended = 1`
    );
    const map = new Map(rows.map(row => [String(row.patient_id), toSuspensionView(row)]));
    activeCache = { loadedAt: now, map };
    return map;
}

/**
 * Suspension lookup for the patient API boundary. Fails open: a missing table or
 * DB hiccup must not lock every patient out of the portal.
 */
async function getActiveSuspension(patientId) {
    if (!patientId) return null;
    try {
        const map = await loadActiveSuspensions();
        return map.get(String(patientId)) || null;
    } catch (error) {
        logger.warn('Patient suspension lookup failed (fail-open)', { error: error.message });
        return null;
    }
}

async function getActiveSuspensionMap() {
    try {
        return await loadActiveSuspensions();
    } catch (error) {
        logger.warn('Patient suspension map unavailable', { error: error.message });
        return new Map();
    }
}

function staffIdentity(user) {
    return {
        id: user?.id != null ? String(user.id) : null,
        name: String(user?.name || user?.full_name || user?.email || 'Staff').slice(0, 150)
    };
}

async function insertLog(connection, { patientId, action, reason, staff, ipAddress }) {
    await connection.query(
        `INSERT INTO patient_account_suspension_log
            (patient_id, action, reason, staff_id, staff_name, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [patientId, action, reason || null, staff.id, staff.name, ipAddress ? String(ipAddress).slice(0, 64) : null]
    );
}

async function withTransaction(work) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
    }
}

async function suspendPatient({ patientId, reason, staffUser, ipAddress }) {
    await validateOperationalSchemaScope('patientAccountSuspension');
    const cleanReason = String(reason || '').replace(/\s+/g, ' ').trim();
    if (cleanReason.length < 5) {
        const error = new Error('Alasan penangguhan wajib diisi (minimal 5 karakter).');
        error.statusCode = 400;
        throw error;
    }
    if (cleanReason.length > MAX_REASON_LENGTH) {
        const error = new Error('Alasan penangguhan maksimal 500 karakter.');
        error.statusCode = 400;
        throw error;
    }

    const staff = staffIdentity(staffUser);
    const result = await withTransaction(async (connection) => {
        const [patients] = await connection.query('SELECT id, full_name FROM patients WHERE id = ? LIMIT 1', [patientId]);
        if (patients.length === 0) return null;

        await connection.query(
            `INSERT INTO patient_account_suspensions
                (patient_id, is_suspended, reason, suspended_at, suspended_by_id, suspended_by_name)
             VALUES (?, 1, ?, NOW(), ?, ?)
             ON DUPLICATE KEY UPDATE
                is_suspended = 1,
                reason = VALUES(reason),
                suspended_at = NOW(),
                suspended_by_id = VALUES(suspended_by_id),
                suspended_by_name = VALUES(suspended_by_name)`,
            [patientId, cleanReason, staff.id, staff.name]
        );
        await insertLog(connection, { patientId, action: 'suspend', reason: cleanReason, staff, ipAddress });
        return patients[0];
    });

    clearSuspensionCache();
    return result;
}

async function unsuspendPatient({ patientId, note, staffUser, ipAddress }) {
    await validateOperationalSchemaScope('patientAccountSuspension');
    const cleanNote = String(note || '').replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH);
    const staff = staffIdentity(staffUser);

    const result = await withTransaction(async (connection) => {
        const [rows] = await connection.query(
            `SELECT p.id, p.full_name, s.is_suspended
             FROM patients p
             LEFT JOIN patient_account_suspensions s ON s.patient_id = p.id
             WHERE p.id = ?
             LIMIT 1`,
            [patientId]
        );
        if (rows.length === 0) return null;
        if (Number(rows[0].is_suspended) !== 1) return { ...rows[0], alreadyActive: true };

        await connection.query(
            'UPDATE patient_account_suspensions SET is_suspended = 0 WHERE patient_id = ?',
            [patientId]
        );
        await insertLog(connection, { patientId, action: 'unsuspend', reason: cleanNote, staff, ipAddress });
        return rows[0];
    });

    clearSuspensionCache();
    return result;
}

async function getSuspensionDetail(patientId) {
    await validateOperationalSchemaScope('patientAccountSuspension');
    const [[current]] = await db.query(
        `SELECT patient_id, is_suspended, reason, suspended_at, suspended_by_id, suspended_by_name
         FROM patient_account_suspensions
         WHERE patient_id = ?`,
        [patientId]
    );
    const [history] = await db.query(
        `SELECT id, action, reason, staff_id, staff_name, created_at
         FROM patient_account_suspension_log
         WHERE patient_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
        [patientId]
    );
    return {
        is_suspended: Number(current?.is_suspended) === 1,
        suspension: Number(current?.is_suspended) === 1 ? toSuspensionView(current) : null,
        history
    };
}

module.exports = {
    SUSPENDED_PATIENT_MESSAGE,
    clearSuspensionCache,
    getActiveSuspension,
    getActiveSuspensionMap,
    getSuspensionDetail,
    suspendPatient,
    unsuspendPatient
};
