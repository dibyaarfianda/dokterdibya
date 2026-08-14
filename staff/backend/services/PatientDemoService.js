const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const BASELINE_PATH = path.join(__dirname, '../data/patient-demo-baseline.json');
const STATE_KEY = 'shared';
const MAX_STATE_BYTES = 512 * 1024;
const TOP_LEVEL_KEYS = new Set([
    'schemaVersion', 'profile', 'pregnancy', 'visits', 'bookings', 'documents',
    'notifications', 'billings', 'settings', 'trackers', 'workdesk', 'stories',
    'feedback', 'queue'
]);

function wibNow() {
    return new Date(Date.now() + (7 * 60 * 60 * 1000));
}

function formatDate(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function formatDateTime(date) {
    return `${formatDate(date)} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

function materializeRelativeDates(value, now = wibNow()) {
    if (Array.isArray(value)) return value.map((item) => materializeRelativeDates(item, now));
    if (!value || typeof value !== 'object') return value;
    if (Object.keys(value).length === 1 && Number.isFinite(value.wibDateOffset)) {
        const date = new Date(now.getTime() + (value.wibDateOffset * 86400000));
        return formatDate(date);
    }
    if (Object.keys(value).length === 1 && Number.isFinite(value.wibDateTimeOffsetHours)) {
        const date = new Date(now.getTime() + (value.wibDateTimeOffsetHours * 3600000));
        return formatDateTime(date);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materializeRelativeDates(item, now)]));
}

function buildBaseline(now = wibNow()) {
    const source = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const state = materializeRelativeDates(source, now);
    const edd = new Date(`${state.pregnancy.edd}T00:00:00+07:00`);
    state.pregnancy.eddFormatted = new Intl.DateTimeFormat('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
    }).format(edd);
    state.pregnancy.daysUntilEdd = Math.max(0, Math.ceil((edd.getTime() - Date.now()) / 86400000));
    state.bookings.forEach((booking) => {
        const date = new Date(`${booking.date}T00:00:00+07:00`);
        booking.dateFormatted = new Intl.DateTimeFormat('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
        }).format(date);
    });
    return validateState(state);
}

function validateState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid demo state');
    for (const key of Object.keys(state)) {
        if (!TOP_LEVEL_KEYS.has(key)) throw new Error(`Unknown demo state key: ${key}`);
    }
    for (const required of ['schemaVersion', 'profile', 'pregnancy', 'bookings', 'documents', 'notifications', 'settings', 'trackers', 'workdesk']) {
        if (state[required] == null) throw new Error(`Missing demo state key: ${required}`);
    }
    const serialized = JSON.stringify(state);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) throw new Error('Demo state is too large');
    return JSON.parse(serialized);
}

function parseState(row) {
    const raw = row?.state_json;
    return validateState(typeof raw === 'string' ? JSON.parse(raw) : raw);
}

async function ensureState() {
    const [rows] = await db.query('SELECT state_json FROM patient_demo_state WHERE state_key = ?', [STATE_KEY]);
    if (rows.length) return parseState(rows[0]);
    const baseline = buildBaseline();
    await db.query(
        'INSERT INTO patient_demo_state (state_key, schema_version, state_json, reset_at, updated_by) VALUES (?, ?, ?, NOW(), ?) ON DUPLICATE KEY UPDATE state_key = state_key',
        [STATE_KEY, baseline.schemaVersion, JSON.stringify(baseline), 'system']
    );
    return getState();
}

async function getState() {
    const [rows] = await db.query('SELECT state_json FROM patient_demo_state WHERE state_key = ?', [STATE_KEY]);
    return rows.length ? parseState(rows[0]) : ensureState();
}

async function updateState(sessionId, action, mutator) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT state_json FROM patient_demo_state WHERE state_key = ? FOR UPDATE', [STATE_KEY]);
        if (!rows.length) throw new Error('Demo state has not been initialized');
        const state = parseState(rows[0]);
        const next = validateState((await mutator(state)) || state);
        await connection.query(
            'UPDATE patient_demo_state SET state_json = ?, schema_version = ?, updated_by = ? WHERE state_key = ?',
            [JSON.stringify(next), next.schemaVersion, sessionId, STATE_KEY]
        );
        await connection.query(
            'INSERT INTO patient_demo_audit (session_id, action, method, path, metadata) VALUES (?, ?, ?, ?, ?)',
            [sessionId, action, 'WRITE', 'sandbox', JSON.stringify({ isolated: true })]
        );
        await connection.commit();
        return next;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function resetState(staffUserId) {
    const baseline = buildBaseline();
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query(
            `INSERT INTO patient_demo_state (state_key, schema_version, state_json, reset_at, updated_by)
             VALUES (?, ?, ?, NOW(), ?)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), state_json = VALUES(state_json), reset_at = NOW(), updated_at = NOW(), updated_by = VALUES(updated_by)`,
            [STATE_KEY, baseline.schemaVersion, JSON.stringify(baseline), String(staffUserId)]
        );
        await connection.query('UPDATE patient_demo_sessions SET revoked_at = NOW() WHERE revoked_at IS NULL');
        await connection.query(
            'INSERT INTO patient_demo_audit (staff_user_id, action, method, path, metadata) VALUES (?, ?, ?, ?, ?)',
            [String(staffUserId), 'reset', 'POST', '/api/patient-demo/reset', JSON.stringify({ schemaVersion: baseline.schemaVersion })]
        );
        await connection.commit();
        return baseline;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

function hashCode(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
}

async function createAccessCode(staffUserId) {
    await ensureState();
    const id = crypto.randomUUID();
    const code = crypto.randomBytes(24).toString('base64url');
    await db.query(
        `INSERT INTO patient_demo_sessions (id, code_hash, issued_by, code_expires_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 2 MINUTE))`,
        [id, hashCode(code), String(staffUserId)]
    );
    await audit({ sessionId: id, staffUserId, action: 'open_code_created', method: 'POST', path: '/api/patient-demo/sessions' });
    return { id, code, expiresInSeconds: 120 };
}

async function exchangeCode(code) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            `SELECT id, issued_by FROM patient_demo_sessions
             WHERE code_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND code_expires_at > NOW()
             FOR UPDATE`,
            [hashCode(code)]
        );
        if (!rows.length) {
            await connection.rollback();
            return null;
        }
        await connection.query(
            'UPDATE patient_demo_sessions SET used_at = NOW(), session_expires_at = DATE_ADD(NOW(), INTERVAL 60 MINUTE), last_seen_at = NOW() WHERE id = ?',
            [rows[0].id]
        );
        await connection.query(
            'INSERT INTO patient_demo_audit (session_id, staff_user_id, action, method, path, metadata) VALUES (?, ?, ?, ?, ?, ?)',
            [rows[0].id, rows[0].issued_by, 'code_exchanged', 'POST', '/api/patient-demo/exchange', JSON.stringify({ expiresInSeconds: 3600 })]
        );
        await connection.commit();
        return { id: rows[0].id, issuedBy: rows[0].issued_by, expiresInSeconds: 3600 };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function assertActiveSession(sessionId) {
    const [rows] = await db.query(
        `SELECT id FROM patient_demo_sessions
         WHERE id = ? AND used_at IS NOT NULL AND revoked_at IS NULL AND session_expires_at > NOW()`,
        [sessionId]
    );
    if (!rows.length) return false;
    await db.query('UPDATE patient_demo_sessions SET last_seen_at = NOW() WHERE id = ?', [sessionId]);
    return true;
}

async function getStatus() {
    await ensureState();
    const [[sessionRows], [stateRows]] = await Promise.all([
        db.query(`SELECT
            SUM(used_at IS NOT NULL AND revoked_at IS NULL AND session_expires_at > NOW()) AS active_sessions,
            MAX(created_at) AS last_opened_at
            FROM patient_demo_sessions`),
        db.query('SELECT schema_version, reset_at, updated_at FROM patient_demo_state WHERE state_key = ?', [STATE_KEY])
    ]);
    return {
        activeSessions: Number(sessionRows[0]?.active_sessions || 0),
        lastOpenedAt: sessionRows[0]?.last_opened_at || null,
        lastResetAt: stateRows[0]?.reset_at || null,
        updatedAt: stateRows[0]?.updated_at || null,
        schemaVersion: stateRows[0]?.schema_version || null
    };
}

async function audit({ sessionId = null, staffUserId = null, action, method = null, path: requestPath = null, metadata = {} }) {
    try {
        await db.query(
            'INSERT INTO patient_demo_audit (session_id, staff_user_id, action, method, path, metadata) VALUES (?, ?, ?, ?, ?, ?)',
            [sessionId, staffUserId == null ? null : String(staffUserId), action, method, requestPath, JSON.stringify(metadata)]
        );
    } catch (_error) {
        // Audit must never redirect a demo request into production handlers.
    }
}

module.exports = {
    STATE_KEY,
    buildBaseline,
    validateState,
    getState,
    updateState,
    resetState,
    createAccessCode,
    exchangeCode,
    assertActiveSession,
    getStatus,
    audit
};
