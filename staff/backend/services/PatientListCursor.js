'use strict';

const crypto = require('node:crypto');

class PatientCursorError extends Error {
    constructor() {
        super('Invalid or incompatible patient cursor');
        this.statusCode = 400;
        this.code = 'INVALID_PATIENT_CURSOR';
    }
}

function limitOf(raw) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 50;
}

function scopeOf(options) {
    return crypto.createHash('sha256').update(JSON.stringify({ v: 2, ...options })).digest('hex');
}

function cursorKey() {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET required for patient cursors');
    return crypto.createHash('sha256').update('patient-list-cursor-v2\0').update(process.env.JWT_SECRET).digest();
}

function encodeCursor(row, terms, scope, page) {
    const keys = terms.map(term => {
        const value = row[term.field];
        return value instanceof Date ? value.toISOString() : value == null ? null : String(value);
    });
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', cursorKey(), iv);
    cipher.setAAD(Buffer.from('patients:list:v2'));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ v: 2, scope, keys, page }), 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([2]), iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function decodeCursor(token, scope, terms) {
    if (token === undefined || token === null) return null;
    if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new PatientCursorError();
    let decoded;
    try {
        const bytes = Buffer.from(token, 'base64url');
        if (bytes.toString('base64url') !== token || bytes.length < 30 || bytes[0] !== 2) throw new PatientCursorError();
        const decipher = crypto.createDecipheriv('aes-256-gcm', cursorKey(), bytes.subarray(1, 13));
        decipher.setAAD(Buffer.from('patients:list:v2'));
        decipher.setAuthTag(bytes.subarray(13, 29));
        decoded = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString('utf8'));
    } catch (_) { throw new PatientCursorError(); }
    if (!decoded || decoded.v !== 2 || decoded.scope !== scope || !Array.isArray(decoded.keys) ||
        decoded.keys.length !== terms.length || !Number.isSafeInteger(decoded.page) || decoded.page < 1 ||
        decoded.keys.some(value => value !== null && (typeof value !== 'string' || value.length > 255)) ||
        !decoded.keys[terms.length - 1]) throw new PatientCursorError();
    return decoded;
}

function seekAfter(terms, cursor) {
    if (!cursor) return { sql: '', params: [] };
    const params = [];
    function branch(index) {
        const term = terms[index];
        const raw = cursor.keys[index];
        const value = term.date && typeof raw === 'string' && /^\d{4}-\d\d-\d\dT/.test(raw) ? new Date(raw) : raw;
        if (value instanceof Date && Number.isNaN(value.getTime())) throw new PatientCursorError();
        let after;
        if (value === null) after = term.direction === 'ASC' ? `${term.column} IS NOT NULL` : '0=1';
        else {
            after = term.direction === 'ASC' ? `${term.column} > ?` : `(${term.column} < ? OR ${term.column} IS NULL)`;
            params.push(value);
        }
        if (index === terms.length - 1) return after;
        const equal = value === null ? `${term.column} IS NULL` : `${term.column} = ?`;
        if (value !== null) params.push(value);
        return `(${after} OR (${equal} AND ${branch(index + 1)}))`;
    }
    return { sql: branch(0), params };
}

module.exports = { PatientCursorError, limitOf, scopeOf, encodeCursor, decodeCursor, seekAfter };
