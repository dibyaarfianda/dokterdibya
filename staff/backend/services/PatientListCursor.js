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
    return crypto.createHash('sha256').update(JSON.stringify({ v: 1, ...options })).digest('hex');
}

function encodeCursor(row, terms, scope, page) {
    const keys = terms.map(term => {
        const value = row[term.field];
        return value instanceof Date ? value.toISOString() : value == null ? null : String(value);
    });
    return Buffer.from(JSON.stringify({ v: 1, scope, keys, page })).toString('base64url');
}

function decodeCursor(token, scope, terms) {
    if (token === undefined || token === null) return null;
    if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new PatientCursorError();
    let decoded;
    try {
        const text = Buffer.from(token, 'base64url').toString('utf8');
        if (Buffer.from(text).toString('base64url') !== token) throw new PatientCursorError();
        decoded = JSON.parse(text);
    } catch (_) { throw new PatientCursorError(); }
    if (!decoded || decoded.v !== 1 || decoded.scope !== scope || !Array.isArray(decoded.keys) ||
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
