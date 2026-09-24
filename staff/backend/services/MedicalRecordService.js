'use strict';

const { isDeepStrictEqual } = require('node:util');
const db = require('../db');
const logger = require('../utils/logger');
const realtimeSync = require('../realtime-sync');
const { ROLE_IDS } = require('../constants/roles');

const RECORD_TYPES = new Set(['identitas', 'anamnesa', 'physical_exam', 'pemeriksaan_obstetri',
    'pemeriksaan_ginekologi', 'usg', 'lab', 'penunjang', 'diagnosis', 'planning', 'resume_medis']);
const RESET_DOCUMENT_TYPES = {
    usg: ['usg_photo', 'usg_2d', 'usg_4d', 'patient_usg'],
    resume_medis: ['resume_medis']
};
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clone = value => JSON.parse(JSON.stringify(value));
const parse = value => typeof value === 'string' ? JSON.parse(value) : clone(value);

class MedicalRecordError extends Error {
    constructor(statusCode, code, message) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}
const fail = (status, code, message) => { throw new MedicalRecordError(status, code, message); };

function parseIfMatch(value) {
    if (value === undefined || value === null || value === '') fail(428, 'PRECONDITION_REQUIRED', 'If-Match is required');
    if (typeof value !== 'string' || !/^"[1-9]\d*"$/.test(value)) fail(400, 'INVALID_ETAG', 'Use a quoted positive integer ETag');
    const version = Number(value.slice(1, -1));
    if (!Number.isSafeInteger(version) || version > 2147483647) fail(400, 'INVALID_ETAG', 'Invalid version');
    return version;
}

function normalizeMrId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z]+\d+$/.test(value.trim()) || value.trim().length > 20) {
        fail(400, 'MR_REQUIRED', 'A canonical MR is required');
    }
    return value.trim().toUpperCase();
}

function validateJson(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) {
        fail(400, 'INVALID_DATA', 'Data must contain JSON values only');
    }
    for (const key of Object.keys(value)) validateJson(value[key]);
}

function validateData(data) {
    validateJson(data);
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'INVALID_DATA', 'Section data must be a JSON object');
}

function pointer(path) {
    if (typeof path !== 'string' || (path !== '' && !path.startsWith('/')) || /~(?![01])/u.test(path)) {
        fail(400, 'INVALID_POINTER', 'Use RFC 6901 JSON Pointer paths');
    }
    const parts = path === '' ? [] : path.slice(1).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (parts.some(p => ['__proto__', 'constructor', 'prototype'].includes(p))) fail(400, 'INVALID_POINTER', 'Unsafe path');
    return parts;
}

const overlaps = (a, b) => a.every((part, index) => part === b[index]) || b.every((part, index) => part === a[index]);

// Arrays are atomic conflict units. Numeric pointer updates are supported, but
// concurrent updates anywhere in the same array require a fresh base.
function conflictPath(data, parts) {
    let node = data;
    for (let i = 0; i < parts.length; i++) {
        if (Array.isArray(node)) return parts.slice(0, i);
        node = node && typeof node === 'object' && owns(node, parts[i]) ? node[parts[i]] : undefined;
    }
    return parts;
}

function readPointer(data, parts) {
    let node = data;
    for (const part of parts) {
        if (Array.isArray(node) && !/^(0|[1-9]\d*)$/.test(part)) fail(400, 'INVALID_POINTER', 'Invalid array index');
        if (!node || typeof node !== 'object' || !owns(node, part)) return { exists: false };
        node = node[part];
    }
    return { exists: true, value: node };
}

function applyPointer(data, parts, value) {
    if (!parts.length) { validateData(value); return clone(value); }
    let node = data;
    for (const part of parts.slice(0, -1)) {
        if (!node || typeof node !== 'object' || !owns(node, part)) fail(400, 'INVALID_POINTER', 'Pointer parent is missing');
        node = node[part];
    }
    const key = parts[parts.length - 1];
    if (!node || typeof node !== 'object') fail(400, 'INVALID_POINTER', 'Pointer parent is not a container');
    if (Array.isArray(node) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= node.length)) {
        fail(400, 'INVALID_POINTER', 'Replace an existing array index or the whole array');
    }
    node[key] = clone(value);
    return data;
}

function validateChanges(changes) {
    if (!Array.isArray(changes) || !changes.length || changes.length > 500) fail(400, 'INVALID_CHANGES', 'Supply 1 to 500 changes');
    const paths = [];
    for (const change of changes) {
        if (!change || !owns(change, 'before') || !owns(change, 'after') ||
            (owns(change, 'beforeExists') && typeof change.beforeExists !== 'boolean')) {
            fail(400, 'INVALID_CHANGES', 'Each change requires path, before and after');
        }
        validateJson(change.before); validateJson(change.after);
        const parts = pointer(change.path);
        if (paths.some(path => overlaps(path, parts))) fail(400, 'INVALID_CHANGES', 'Changes must not overlap each other');
        paths.push(parts);
    }
    return paths;
}

class MedicalRecordService {
    constructor(pool = db) { this.pool = pool; }

    async transaction(work) {
        const connection = await this.pool.getConnection();
        let begun = false;
        let committed = false;
        let outcome;
        try {
            await connection.beginTransaction(); begun = true;
            outcome = await work(connection);
            await connection.commit(); committed = true;
        } catch (error) {
            if (begun && !committed) await connection.rollback();
            throw error;
        } finally { connection.release(); }
        // These effects are operational only; the immutable clinical audit has
        // already committed. No identifiers, payloads or raw errors enter logs/events.
        const event = { type: 'medical_record:changed', action: outcome.action, recordType: outcome.recordType, count: 1 };
        try { logger.info('Medical record mutation committed', event); } catch (_) { /* telemetry only */ }
        try { realtimeSync.broadcast(event); } catch (_) { /* refresh falls back to HTTP */ }
        return outcome;
    }

    actor(actor) {
        if (!actor?.id || actor.user_type === 'patient' || actor.role === 'patient') fail(403, 'STAFF_REQUIRED', 'Verified staff actor required');
        return { id: String(actor.id), name: actor.name || null };
    }

    assertResetRole(principal) {
        this.actor(principal);
        // Fixed clinical policy: JWT role_id is authoritative. Neither rewritten
        // role names, configurable grants nor is_superadmin extend reset access.
        if (![ROLE_IDS.DOKTER, ROLE_IDS.BIDAN].includes(principal.role_id)) {
            fail(403, 'CLINICAL_RESET_ROLE_REQUIRED', 'Section reset requires a doctor or midwife role');
        }
    }

    async lockVisit(connection, mrId, suppliedPatient, visitCreation) {
        let [visits] = await connection.query('SELECT * FROM sunday_clinic_records WHERE mr_id = ? ORDER BY id FOR UPDATE', [mrId]);
        if (!visits.length && visitCreation) {
            await connection.query(
                `INSERT INTO sunday_clinic_records (mr_id, patient_id, visit_location, created_at, last_activity_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [mrId, suppliedPatient, visitCreation.visitLocation, visitCreation.visitDateTime, visitCreation.visitDateTime]);
            [visits] = await connection.query('SELECT * FROM sunday_clinic_records WHERE mr_id = ? ORDER BY id FOR UPDATE', [mrId]);
        }
        if (!visits.length) fail(404, 'VISIT_NOT_FOUND', 'Visit not found');
        if (visits.length !== 1) fail(409, 'AMBIGUOUS_VISIT', 'Visit scope is ambiguous');
        const visit = visits[0];
        if (suppliedPatient !== undefined && String(suppliedPatient) !== String(visit.patient_id)) fail(409, 'PATIENT_SCOPE_MISMATCH', 'Patient does not match visit');
        return visit;
    }

    async lockSection(connection, visit, mrId, recordType) {
        const [rows] = await connection.query(
            'SELECT * FROM medical_records WHERE patient_id = ? AND mr_id = ? AND record_type = ? ORDER BY id FOR UPDATE',
            [visit.patient_id, mrId, recordType]);
        if (rows.length > 1) fail(409, 'AMBIGUOUS_SECTION', 'Section requires reconciliation');
        return rows[0];
    }

    async revision(connection, row, actor, action, before, after, version, paths) {
        await connection.query(
            `INSERT INTO medical_record_revisions
             (medical_record_id, patient_id, mr_id, record_type, event_type, actor_id,
              from_version, to_version, before_snapshot, after_snapshot, changed_paths)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [row.id, row.patient_id, row.mr_id, row.record_type, action, actor.id,
                row.version || 0, version, before === null ? null : JSON.stringify(before),
                after === null ? null : JSON.stringify(after), JSON.stringify(paths)]);
    }

    // Trusted server adapters provide a whole batch before any write. The
    // updater runs only after visit and exact section locks in this transaction.
    // Browser and external callers must use create/PATCH with ETags instead.
    async saveInternalSections({ mrId, patientId, sections, actor: principal, mutateDocuments, visitCreation }) {
        mrId = normalizeMrId(mrId);
        const actor = this.actor(principal);
        if (!Array.isArray(sections) || !sections.length || sections.length > RECORD_TYPES.size ||
            sections.some(section => !RECORD_TYPES.has(section.recordType) ||
                (typeof section.update !== 'function' && !owns(section, 'data'))) ||
            new Set(sections.map(section => section.recordType)).size !== sections.length) {
            fail(400, 'INVALID_SECTIONS', 'Unique routine sections are required');
        }
        if (visitCreation && (!['klinik_private', 'rsia_melinda', 'rsud_gambiran', 'rs_bhayangkara'].includes(visitCreation.visitLocation) ||
            !visitCreation.visitDateTime || !patientId)) {
            fail(400, 'INVALID_VISIT', 'A valid import visit is required');
        }
        return this.transaction(async connection => {
            const visit = await this.lockVisit(connection, mrId, patientId, visitCreation);
            const saved = [];
            for (const section of [...sections].sort((a, b) => a.recordType.localeCompare(b.recordType))) {
                const existing = await this.lockSection(connection, visit, mrId, section.recordType);
                if (section.createOnly && existing) fail(409, 'SECTION_EXISTS', 'Section exists; use a versioned PATCH');
                let before = null;
                if (existing) {
                    try { before = parse(existing.record_data); validateData(before); }
                    catch (_) { fail(412, 'BASE_UNAVAILABLE', 'Section data requires reconciliation'); }
                }
                const after = typeof section.update === 'function' ? section.update(before === null ? {} : clone(before)) : section.data;
                validateData(after);
                if (before !== null && isDeepStrictEqual(before, after)) {
                    saved.push({ ...existing, record_data: clone(before) });
                    continue;
                }
                let row;
                let version;
                if (existing) {
                    version = Number(existing.version) + 1;
                    if (!Number.isInteger(version) || version > 2147483647) fail(409, 'VERSION_EXHAUSTED', 'Version limit reached');
                    const [updated] = await connection.query(
                        'UPDATE medical_records SET record_data = ?, doctor_id = ?, doctor_name = ?, version = ?, updated_at = NOW() WHERE id = ? AND mr_id = ? AND patient_id = ? AND version = ?',
                        [JSON.stringify(after), actor.id, actor.name, version, existing.id, mrId, visit.patient_id, existing.version]);
                    if (updated.affectedRows !== 1) fail(409, 'CHANGE_CONFLICT', 'Section changed during save');
                    row = existing;
                } else {
                    const [history] = await connection.query(
                        'SELECT MAX(to_version) AS last_version FROM medical_record_revisions WHERE mr_id = ? AND record_type = ?', [mrId, section.recordType]);
                    version = Number(history[0].last_version || 0) + 1;
                    if (version > 2147483647) fail(409, 'VERSION_EXHAUSTED', 'Version limit reached');
                    const [result] = await connection.query(
                        'INSERT INTO medical_records (patient_id, mr_id, doctor_id, doctor_name, record_type, record_data, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [visit.patient_id, mrId, actor.id, actor.name, section.recordType, JSON.stringify(after), version]);
                    row = { id: result.insertId, patient_id: visit.patient_id, mr_id: mrId, record_type: section.recordType, version: version - 1 };
                }
                await this.revision(connection, row, actor, existing ? 'patch' : 'create', before, after, version, ['']);
                const scoped = { ...row, version, record_data: clone(after), actor };
                if (mutateDocuments) await mutateDocuments(connection, scoped);
                saved.push(scoped);
            }
            return { action: 'internal_batch', recordType: saved.length === 1 ? saved[0].record_type : 'multiple',
                version: saved.length === 1 ? saved[0].version : null, data: saved };
        });
    }

    async create({ mrId, patientId, recordType, data, actor: principal, mutateDocuments }) {
        mrId = normalizeMrId(mrId);
        if (!RECORD_TYPES.has(recordType)) fail(400, 'INVALID_RECORD_TYPE', 'Unsupported section type');
        validateData(data);
        const actor = this.actor(principal);
        return this.transaction(async connection => {
            const visit = await this.lockVisit(connection, mrId, patientId);
            const existing = await this.lockSection(connection, visit, mrId, recordType);
            if (existing) fail(409, 'SECTION_EXISTS', 'Section exists; use PATCH with its ETag');
            const [history] = await connection.query(
                'SELECT MAX(to_version) AS last_version FROM medical_record_revisions WHERE mr_id = ? AND record_type = ?', [mrId, recordType]);
            const version = Number(history[0].last_version || 0) + 1;
            if (version > 2147483647) fail(409, 'VERSION_EXHAUSTED', 'Version limit reached');
            const [result] = await connection.query(
                `INSERT INTO medical_records (patient_id, mr_id, doctor_id, doctor_name, record_type, record_data, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [visit.patient_id, mrId, actor.id, actor.name, recordType, JSON.stringify(data), version]);
            const row = { id: result.insertId, patient_id: visit.patient_id, mr_id: mrId, record_type: recordType, version: version - 1 };
            await this.revision(connection, row, actor, 'create', null, data, version, ['']);
            const documentChange = mutateDocuments ? await mutateDocuments(connection, { ...row, version, record_data: clone(data), actor }) : undefined;
            return { action: 'create', recordType, version, documentChange, data: { ...row, version, record_data: clone(data) } };
        });
    }

    async patch({ id, mrId, patientId, recordType, changes, ifMatch, actor: principal, mutateDocuments }) {
        const baseVersion = parseIfMatch(ifMatch);
        const paths = validateChanges(changes);
        const actor = this.actor(principal);
        if (!/^[1-9]\d*$/.test(String(id))) fail(400, 'INVALID_RECORD_ID', 'Invalid record ID');
        // Locator is nonlocking; its identity is revalidated after taking the
        // visit lock. It conveys no authority to mutate a detached/null-MR row.
        const [located] = await this.pool.query('SELECT id, mr_id, patient_id, record_type FROM medical_records WHERE id = ?', [id]);
        const locator = located[0];
        if (!locator || !locator.mr_id) fail(404, 'RECORD_NOT_FOUND', 'Scoped record not found');
        if (mrId !== undefined && normalizeMrId(mrId) !== locator.mr_id) fail(404, 'RECORD_NOT_FOUND', 'Scoped record not found');
        mrId = normalizeMrId(locator.mr_id);
        return this.transaction(async connection => {
            const visit = await this.lockVisit(connection, mrId, patientId);
            const [rows] = await connection.query(
                'SELECT * FROM medical_records WHERE id = ? AND mr_id = ? AND patient_id = ? FOR UPDATE', [id, mrId, visit.patient_id]);
            const row = rows[0];
            if (!row || String(row.id) !== String(id) || String(row.patient_id) !== String(visit.patient_id) ||
                String(row.patient_id) !== String(locator.patient_id) || row.mr_id !== mrId || row.record_type !== locator.record_type) {
                fail(404, 'RECORD_NOT_FOUND', 'Scoped record not found');
            }
            if (recordType !== undefined && recordType !== row.record_type) fail(404, 'RECORD_NOT_FOUND', 'Scoped record not found');
            if (!RECORD_TYPES.has(row.record_type)) fail(400, 'INVALID_RECORD_TYPE', 'Legacy section is read-only');
            let current;
            try { current = parse(row.record_data); validateData(current); }
            catch (_) { fail(412, 'BASE_UNAVAILABLE', 'Section data requires reconciliation'); }
            const currentVersion = Number(row.version);
            if (!Number.isInteger(currentVersion) || currentVersion < 1 || baseVersion > currentVersion) fail(412, 'BASE_UNAVAILABLE', 'Reload the section');
            let base = current;
            let revisions = [];
            if (baseVersion < currentVersion) {
                [revisions] = await connection.query(
                    `SELECT * FROM medical_record_revisions WHERE medical_record_id = ? AND to_version > ? AND to_version <= ? ORDER BY to_version`,
                    [row.id, baseVersion, currentVersion]);
                try {
                    revisions = revisions.map(revision => {
                        const before = parse(revision.before_snapshot);
                        const after = parse(revision.after_snapshot);
                        const changed = parse(revision.changed_paths);
                        validateData(before); validateData(after);
                        if (!Array.isArray(changed) || !changed.length) throw new Error('Missing history paths');
                        return { ...revision, before, after, paths: changed.map(pointer) };
                    });
                } catch (_) { fail(412, 'BASE_UNAVAILABLE', 'Reload the section'); }
                let expected = baseVersion;
                let previous;
                for (const revision of revisions) {
                    if (revision.from_version !== expected || revision.to_version !== expected + 1 || revision.before_snapshot === null || revision.after_snapshot === null ||
                        (previous !== undefined && !isDeepStrictEqual(previous, revision.before))) {
                        fail(412, 'BASE_UNAVAILABLE', 'Reload the section');
                    }
                    previous = revision.after; expected++;
                }
                if (expected !== currentVersion || !isDeepStrictEqual(previous, current)) fail(412, 'BASE_UNAVAILABLE', 'Reload the section');
                base = revisions[0].before;
            }
            for (let i = 0; i < changes.length; i++) {
                const change = changes[i];
                const value = readPointer(base, paths[i]);
                if (value.exists !== (change.beforeExists !== false) || (value.exists && !isDeepStrictEqual(value.value, change.before))) {
                    fail(409, 'CHANGE_CONFLICT', 'A changed field does not match its base');
                }
                const incoming = conflictPath(base, paths[i]);
                for (const revision of revisions) {
                    if (revision.paths.some(path => overlaps(incoming, conflictPath(revision.before, path)) || overlaps(incoming, conflictPath(revision.after, path)))) {
                        fail(409, 'CHANGE_CONFLICT', 'A changed field was edited by another save');
                    }
                }
            }
            let after = clone(current);
            changes.forEach((change, i) => { after = applyPointer(after, paths[i], change.after); });
            const version = currentVersion + 1;
            if (version > 2147483647) fail(409, 'VERSION_EXHAUSTED', 'Version limit reached');
            const [updated] = await connection.query(
                'UPDATE medical_records SET record_data = ?, doctor_id = ?, doctor_name = ?, version = ?, updated_at = NOW() WHERE id = ? AND mr_id = ? AND patient_id = ? AND version = ?',
                [JSON.stringify(after), actor.id, actor.name, version, row.id, mrId, visit.patient_id, currentVersion]);
            if (updated.affectedRows !== 1) fail(409, 'CHANGE_CONFLICT', 'Section changed during save');
            await this.revision(connection, row, actor, 'patch', current, after, version, changes.map(change => change.path));
            const documentChange = mutateDocuments ? await mutateDocuments(connection, { ...row, version, record_data: clone(after), actor }) : undefined;
            return { action: 'patch', recordType: row.record_type, version, documentChange,
                data: { ...row, doctor_id: actor.id, doctor_name: actor.name, version, record_data: after } };
        });
    }

    async reset({ mrId, patientId, recordType, ifMatch, actor: principal }) {
        this.assertResetRole(principal);
        mrId = normalizeMrId(mrId);
        if (typeof patientId !== 'string' || !patientId.trim()) fail(400, 'PATIENT_REQUIRED', 'Exact patient scope required');
        if (!owns(RESET_DOCUMENT_TYPES, recordType)) fail(400, 'INVALID_RESET_TYPE', 'Only USG and resume may be reset');
        const baseVersion = parseIfMatch(ifMatch);
        const actor = this.actor(principal);
        return this.transaction(async connection => {
            const visit = await this.lockVisit(connection, mrId, patientId);
            const row = await this.lockSection(connection, visit, mrId, recordType);
            if (!row) fail(404, 'RECORD_NOT_FOUND', 'Section not found');
            if (Number(row.version) !== baseVersion) fail(412, 'PRECONDITION_FAILED', 'Reload the section before resetting');
            const docTypes = RESET_DOCUMENT_TYPES[recordType];
            await connection.query(
                'SELECT id FROM patient_documents WHERE patient_id = ? AND mr_id = ? AND document_type IN (?) ORDER BY id FOR UPDATE',
                [visit.patient_id, mrId, docTypes]);
            const version = baseVersion + 1;
            if (version > 2147483647) fail(409, 'VERSION_EXHAUSTED', 'Version limit reached');
            await this.revision(connection, row, actor, 'reset', parse(row.record_data), null, version, ['']);
            const [deleted] = await connection.query(
                'DELETE FROM medical_records WHERE id = ? AND patient_id = ? AND mr_id = ? AND record_type = ? AND version = ?',
                [row.id, visit.patient_id, mrId, recordType, baseVersion]);
            if (deleted.affectedRows !== 1) fail(409, 'CHANGE_CONFLICT', 'Section changed during reset');
            const [documents] = await connection.query(
                'DELETE FROM patient_documents WHERE patient_id = ? AND mr_id = ? AND document_type IN (?)', [visit.patient_id, mrId, docTypes]);
            // Physical objects are intentionally retained. No R2 action may run
            // here: metadata and immutable tombstone are the transaction boundary.
            return { action: 'reset', recordType, version, deletedCount: 1, deletedDocuments: documents.affectedRows };
        });
    }
}

module.exports = new MedicalRecordService();
module.exports.MedicalRecordService = MedicalRecordService;
module.exports.MedicalRecordError = MedicalRecordError;
module.exports.parseIfMatch = parseIfMatch;
