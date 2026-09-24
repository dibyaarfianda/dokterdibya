'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Writable } = require('node:stream');
const zlib = require('node:zlib');

const ALGORITHM_VERSION = 'legacy-nearest-visit-v1';
const SCHEMA_VERSION = '20260924_medical_record_versions';
const AUDITED = Object.freeze({
    safe: { count: 3, hash: '15518c6c8927470417df2e1066c1e5a0fac39219bef160b493d099364aa77314' },
    conflict: { count: 21, hash: '5f5e4a2168620cbfc0b1d8841a2c88ee018493166263ad9371cc7adae0f7203d' },
    complete: { count: 834, hash: '002d805d760a3d6c380c4b49967ee7db0b8f5b68f17516f4f47c51a396aaa9d3' },
    documents: { count: 3800, hash: '03058f8f3570a2fdb797e2c1e9d8cf94957c27489614e0bde0802817a9ef4ad1' }
});

class ReconciliationError extends Error {
    constructor(code) { super(code); this.name = 'ReconciliationError'; this.code = code; }
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonicalJson(value) {
    const normalize = item => {
        if (Array.isArray(item)) return item.map(normalize);
        if (item && typeof item === 'object') {
            if (item instanceof Date) return item.toISOString();
            return Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])]));
        }
        return item;
    };
    return JSON.stringify(normalize(value));
}
function digestObject(value) { return sha256(canonicalJson(value)); }
function requireHash(value, code = 'INVALID_HASH') {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new ReconciliationError(code);
}
function failIf(condition, code) { if (condition) throw new ReconciliationError(code); }

function assertExternalPath(filename) {
    failIf(typeof filename !== 'string' || !path.isAbsolute(filename), 'EXTERNAL_PATH_REQUIRED');
    let realParent;
    try { realParent = fs.realpathSync(path.dirname(filename)); }
    catch (_) { throw new ReconciliationError('EXTERNAL_PATH_REQUIRED'); }
    let directory = realParent;
    while (true) {
        if (fs.existsSync(path.join(directory, '.git'))) throw new ReconciliationError('GIT_PATH_FORBIDDEN');
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }
    const realFile = fs.existsSync(filename) ? fs.realpathSync(filename) : path.join(realParent, path.basename(filename));
    failIf(path.dirname(realFile) !== realParent, 'EXTERNAL_PATH_REQUIRED');
    return realFile;
}

function publishExclusive(temporary, destination) {
    // Same-filesystem hard link is an atomic no-replace publish. In contrast,
    // rename may replace a destination created after an existence check.
    fs.linkSync(temporary, destination);
    if (process.platform !== 'win32') {
        const directory = fs.openSync(path.dirname(destination), 'r');
        try { fs.fsyncSync(directory); }
        finally { fs.closeSync(directory); }
    }
}

async function verifyBackup(filename, expectedSha256) {
    requireHash(expectedSha256, 'BACKUP_CHECKSUM_REQUIRED');
    let stat;
    try { stat = fs.statSync(filename); }
    catch (_) { throw new ReconciliationError('BACKUP_UNAVAILABLE'); }
    failIf(!stat.isFile() || stat.size <= 0, 'BACKUP_UNAVAILABLE');
    const hash = crypto.createHash('sha256');
    try {
        for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
    } catch (_) { throw new ReconciliationError('BACKUP_UNAVAILABLE'); }
    const actual = hash.digest('hex');
    failIf(actual !== expectedSha256, 'BACKUP_CHECKSUM_MISMATCH');
    if (filename.toLowerCase().endsWith('.gz')) {
        try {
            await pipeline(fs.createReadStream(filename), zlib.createGunzip(),
                new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
        } catch (_) { throw new ReconciliationError('BACKUP_GZIP_INVALID'); }
    }
    return actual;
}

function writePrivateManifest(filename, manifest) {
    const destination = assertExternalPath(filename);
    const serialized = canonicalJson(manifest);
    const temporary = path.join(path.dirname(destination), `.medical-manifest-${crypto.randomUUID()}.tmp`);
    try {
        const descriptor = fs.openSync(temporary, 'wx', 0o600);
        try {
            fs.writeFileSync(descriptor, serialized, 'utf8');
            fs.fsyncSync(descriptor);
        } finally { fs.closeSync(descriptor); }
        fs.chmodSync(temporary, 0o600);
        failIf((fs.statSync(temporary).mode & 0o777) !== 0o600, 'MANIFEST_MODE_UNENFORCEABLE');
        publishExclusive(temporary, destination);
        failIf((fs.statSync(destination).mode & 0o777) !== 0o600, 'MANIFEST_MODE_UNENFORCEABLE');
        return sha256(serialized);
    } catch (error) {
        if (error?.code === 'EEXIST') throw new ReconciliationError('MANIFEST_EXISTS');
        if (error instanceof ReconciliationError) throw error;
        throw new ReconciliationError('MANIFEST_WRITE_FAILED');
    } finally {
        try { fs.unlinkSync(temporary); } catch (_) { /* no private temporary remains */ }
    }
}

function readPrivateManifest(filename, confirmationSha256) {
    requireHash(confirmationSha256, 'MANIFEST_CONFIRMATION_REQUIRED');
    const file = assertExternalPath(filename);
    let bytes;
    try {
        const stat = fs.statSync(file);
        failIf(!stat.isFile() || stat.size <= 0 || stat.size > 20_000_000, 'MANIFEST_UNAVAILABLE');
        failIf((stat.mode & 0o777) !== 0o600, 'MANIFEST_MODE_UNENFORCEABLE');
        bytes = fs.readFileSync(file);
    } catch (error) {
        if (error instanceof ReconciliationError) throw error;
        throw new ReconciliationError('MANIFEST_UNAVAILABLE');
    }
    failIf(sha256(bytes) !== confirmationSha256, 'MANIFEST_CHECKSUM_MISMATCH');
    let parsed;
    try { parsed = JSON.parse(bytes.toString('utf8')); }
    catch (_) { throw new ReconciliationError('MANIFEST_INVALID'); }
    failIf(canonicalJson(parsed) !== bytes.toString('utf8'), 'MANIFEST_NONCANONICAL');
    return parsed;
}

function parsedData(value) {
    try { return JSON.parse(value); }
    catch (_) { throw new ReconciliationError('INVALID_CLINICAL_JSON'); }
}

function sourceState(row) {
    return { id: row.id, patientId: row.patient_id, visitId: row.visit_id, mrId: row.mr_id,
        doctorId: row.doctor_id, doctorName: row.doctor_name,
        recordType: row.record_type, payloadSha256: sha256(row.record_data), createdAt: row.created_at_text,
        updatedAt: row.updated_at_text, version: Number(row.version) };
}
function visitState(row) {
    return { id: row.visit_row_id, patientId: row.visit_patient_id, mrId: row.candidate_mr_id,
        status: row.visit_status, location: row.visit_location,
        createdAt: row.visit_created_at_text, updatedAt: row.visit_updated_at_text,
        lastActivityAt: row.visit_last_activity_at_text };
}
function targetState(row) {
    if (row.target_id == null) return null;
    return { id: row.target_id, patientId: row.target_patient_id, mrId: row.target_mr_id,
        visitId: row.target_visit_id, doctorId: row.target_doctor_id, doctorName: row.target_doctor_name,
        recordType: row.target_record_type, payloadSha256: sha256(row.target_record_data),
        createdAt: row.target_created_at_text, updatedAt: row.target_updated_at_text,
        version: Number(row.target_version) };
}
function setHash(rows) { return sha256(rows.map(row => row.row_digest).join('')); }
function compareAggregate(actual, expected, category) {
    failIf(!expected || actual.count !== expected.count || actual.hash !== expected.hash,
        `AUDIT_${category.toUpperCase()}_DRIFT`);
}

function classifySnapshot({ rows, sourceCount, completeRows, documents, expected = AUDITED,
    schemaVersion, databaseVersion, snapshotAt, backupSha256 }) {
    failIf(schemaVersion !== SCHEMA_VERSION, 'SCHEMA_VERSION_MISSING');
    failIf(typeof databaseVersion !== 'string' || !databaseVersion.includes('MariaDB'), 'DATABASE_VERSION_UNSUPPORTED');
    requireHash(backupSha256, 'BACKUP_CHECKSUM_REQUIRED');
    failIf(!Array.isArray(rows) || !Array.isArray(completeRows) || !Array.isArray(documents), 'SNAPSHOT_INVALID');
    failIf(rows.length !== sourceCount, 'MISSING_CANDIDATE');
    const ordered = [...rows].sort((a, b) => Number(a.id) - Number(b.id));
    failIf(new Set(ordered.map(row => Number(row.id))).size !== ordered.length, 'DUPLICATE_SOURCE');
    const manifestRows = [];
    for (const row of ordered) {
        failIf(row.record_type === 'complete' || (row.mr_id != null && String(row.mr_id).trim()), 'SOURCE_SCOPE_DRIFT');
        failIf(!row.visit_row_id || !row.candidate_mr_id, 'MISSING_CANDIDATE');
        failIf(String(row.patient_id) !== String(row.visit_patient_id), 'PATIENT_MISMATCH');
        failIf(Number(row.nearest_distance_ties) !== 1, 'EQUAL_DISTANCE_TIE');
        failIf(row.distance_seconds == null || row.distance_seconds === '' ||
            !Number.isSafeInteger(Number(row.distance_seconds)) || Number(row.distance_seconds) < 0,
        'DISTANCE_INVALID');
        failIf(!Number.isSafeInteger(Number(row.version)) || Number(row.version) <= 0, 'SOURCE_VERSION_INVALID');
        parsedData(row.record_data);
        const conflict = row.target_id != null;
        if (conflict) {
            failIf(String(row.patient_id) !== String(row.target_patient_id) ||
                String(row.candidate_mr_id) !== String(row.target_mr_id) || row.record_type !== row.target_record_type,
            'TARGET_SCOPE_MISMATCH');
            failIf(!Number.isSafeInteger(Number(row.target_version)) || Number(row.target_version) <= 0,
                'TARGET_VERSION_INVALID');
            parsedData(row.target_record_data);
        }
        for (const key of ['row_digest', 'source_digest', 'visit_digest']) requireHash(row[key], 'ROW_DIGEST_INVALID');
        if (conflict) requireHash(row.target_digest, 'ROW_DIGEST_INVALID');
        else failIf(row.target_digest !== '<ABSENT>', 'ROW_DIGEST_INVALID');
        const source = sourceState(row), visit = visitState(row), target = targetState(row);
        const candidateDocuments = documents.filter(doc => String(doc.patient_id) === String(row.patient_id) &&
            String(doc.mr_id) === String(row.candidate_mr_id)).sort((a, b) => Number(a.id) - Number(b.id));
        const expectedPost = conflict ? source : { ...source, mrId: row.candidate_mr_id, version: source.version + 1 };
        manifestRows.push({ classification: conflict ? 'conflict' : 'safe', sourceRecordId: row.id,
            sourcePatientId: row.patient_id, sourceRecordType: row.record_type,
            candidateVisitRowId: row.visit_row_id, candidateMrId: row.candidate_mr_id,
            targetRecordId: conflict ? row.target_id : null, distanceSeconds: Number(row.distance_seconds),
            sourceDigest: digestObject(source), visitDigest: digestObject(visit),
            targetDigest: target ? digestObject(target) : '<ABSENT>',
            candidateDocumentSetDigest: digestObject(candidateDocuments), expectedPostDigest: digestObject(expectedPost),
            auditedRowDigest: row.row_digest });
    }
    for (const row of completeRows) {
        failIf(Number(row.valid_json) !== 1, 'INVALID_CLINICAL_JSON');
        requireHash(row.row_digest, 'ROW_DIGEST_INVALID');
    }
    for (const row of documents) requireHash(row.row_digest, 'DOCUMENT_DIGEST_INVALID');
    const safe = ordered.filter(row => row.target_id == null);
    const conflicts = ordered.filter(row => row.target_id != null);
    const aggregates = { safe: { count: safe.length, hash: setHash(safe) },
        conflict: { count: conflicts.length, hash: setHash(conflicts) },
        complete: { count: completeRows.length, hash: setHash(completeRows) },
        documents: { count: documents.length, hash: setHash(documents) } };
    for (const category of Object.keys(aggregates)) compareAggregate(aggregates[category], expected[category], category);
    const receipt = { algorithmVersion: ALGORITHM_VERSION, schemaVersion, databaseVersion, snapshotAt,
        backupSha256, counts: { safe: safe.length, conflict: conflicts.length,
            completeIgnored: completeRows.length, documents: documents.length },
        hashes: { safe: aggregates.safe.hash, conflict: aggregates.conflict.hash,
            completeIgnored: aggregates.complete.hash, documents: aggregates.documents.hash } };
    const manifest = { manifestVersion: 1, algorithmVersion: ALGORITHM_VERSION, schemaVersion, databaseVersion,
        snapshotAt, backupSha256, documentFullDigest: digestObject(documents),
        preReceipt: receipt, rows: manifestRows };
    return { manifest, receipt };
}

// The row digest and the three aggregate hashes deliberately reproduce the
// read-only 2026-09-24 audit's MariaDB SHA2/CONCAT_WS expressions byte-for-byte.
// The stronger private precondition digests additionally include version and
// the complete selected document rows.
const CLASSIFIED_SQL = `WITH legacy AS (
  SELECT * FROM medical_records WHERE (mr_id IS NULL OR TRIM(mr_id)='') AND record_type<>'complete'
), ranked AS (
  SELECT m.id source_id, s.id visit_row_id, s.patient_id visit_patient_id,
    s.mr_id candidate_mr_id, s.created_at visit_created_at, s.updated_at visit_updated_at,
    s.last_activity_at visit_last_activity_at,s.status visit_status,s.visit_location,
    ABS(TIMESTAMPDIFF(SECOND,m.created_at,s.created_at)) distance_seconds,
    ROW_NUMBER() OVER (PARTITION BY m.id ORDER BY
      ABS(TIMESTAMPDIFF(SECOND,m.created_at,s.created_at)),s.created_at,s.id) rn,
    RANK() OVER (PARTITION BY m.id ORDER BY
      ABS(TIMESTAMPDIFF(SECOND,m.created_at,s.created_at))) distance_rank
  FROM legacy m JOIN sunday_clinic_records s ON s.patient_id=m.patient_id
), nearest AS (SELECT * FROM ranked WHERE rn=1), ties AS (
  SELECT source_id,SUM(distance_rank=1) nearest_distance_ties FROM ranked GROUP BY source_id
), classified AS (
  SELECT m.id,m.patient_id,m.visit_id,m.mr_id,m.doctor_id,m.doctor_name,
    m.record_type,m.record_data,m.version,
    m.created_at,m.updated_at,n.visit_row_id,n.visit_patient_id,n.candidate_mr_id,
    n.visit_created_at,n.visit_updated_at,n.visit_last_activity_at,n.visit_status,n.visit_location,
    n.distance_seconds,
    t.nearest_distance_ties,x.id target_id,x.patient_id target_patient_id,
    x.visit_id target_visit_id,x.doctor_id target_doctor_id,x.doctor_name target_doctor_name,
    x.mr_id target_mr_id,x.record_type target_record_type,x.record_data target_record_data,
    x.version target_version,x.created_at target_created_at,x.updated_at target_updated_at,
    CASE WHEN x.id IS NULL THEN 'backfill_nonconflicting' ELSE 'conflict' END classification
  FROM legacy m JOIN nearest n ON n.source_id=m.id JOIN ties t ON t.source_id=m.id
  LEFT JOIN medical_records x ON x.mr_id=n.candidate_mr_id AND x.record_type=m.record_type
), digested AS (
  SELECT *,
    SHA2(CONCAT_WS('|','source-v1',id,SHA2(patient_id,256),COALESCE(visit_id,'<NULL>'),
      record_type,SHA2(record_data,256),DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s'),
      DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s')),256) source_digest,
    SHA2(CONCAT_WS('|','visit-v1',visit_row_id,SHA2(visit_patient_id,256),SHA2(candidate_mr_id,256),
      DATE_FORMAT(visit_created_at,'%Y-%m-%d %H:%i:%s'),
      DATE_FORMAT(visit_updated_at,'%Y-%m-%d %H:%i:%s'),
      DATE_FORMAT(visit_last_activity_at,'%Y-%m-%d %H:%i:%s')),256) visit_digest,
    CASE WHEN target_id IS NULL THEN '<ABSENT>' ELSE
      SHA2(CONCAT_WS('|','target-v1',target_id,SHA2(target_patient_id,256),SHA2(target_mr_id,256),
        target_record_type,SHA2(target_record_data,256),
        DATE_FORMAT(target_created_at,'%Y-%m-%d %H:%i:%s'),
        DATE_FORMAT(target_updated_at,'%Y-%m-%d %H:%i:%s')),256) END target_digest
  FROM classified
), rows_hashed AS (
  SELECT *,SHA2(CONCAT_WS('|','legacy-nearest-visit-v1',source_digest,visit_digest,
    distance_seconds,nearest_distance_ties,target_digest,classification),256) row_digest
  FROM digested
)
SELECT id,patient_id,visit_id,mr_id,doctor_id,doctor_name,record_type,record_data,version,
  visit_row_id,visit_patient_id,candidate_mr_id,visit_status,visit_location,
  distance_seconds,nearest_distance_ties,target_id,target_patient_id,target_mr_id,
  target_visit_id,target_doctor_id,target_doctor_name,
  target_record_type,target_record_data,target_version,source_digest,visit_digest,target_digest,row_digest,
  DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') created_at_text,
  DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s') updated_at_text,
  DATE_FORMAT(visit_created_at,'%Y-%m-%d %H:%i:%s') visit_created_at_text,
  DATE_FORMAT(visit_updated_at,'%Y-%m-%d %H:%i:%s') visit_updated_at_text,
  DATE_FORMAT(visit_last_activity_at,'%Y-%m-%d %H:%i:%s') visit_last_activity_at_text,
  DATE_FORMAT(target_created_at,'%Y-%m-%d %H:%i:%s') target_created_at_text,
  DATE_FORMAT(target_updated_at,'%Y-%m-%d %H:%i:%s') target_updated_at_text
FROM rows_hashed ORDER BY id`;

const COMPLETE_SQL = `SELECT /* legacy:complete */ id,JSON_VALID(record_data) valid_json,
  SHA2(CONCAT_WS('|','legacy-complete-v1',id,SHA2(patient_id,256),COALESCE(visit_id,'<NULL>'),
    record_type,SHA2(record_data,256),DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s'),
    DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s')),256) row_digest
  FROM medical_records WHERE (mr_id IS NULL OR TRIM(mr_id)='') AND record_type='complete' ORDER BY id`;
const DOCUMENT_SQL = `SELECT /* legacy:documents */ d.*,
  SHA2(CONCAT_WS('|','patient-document-pointer-v1',id,SHA2(patient_id,256),
    COALESCE(SHA2(mr_id,256),'<NULL>'),document_type,status,
    COALESCE(SHA2(file_path,256),'<NULL>'),COALESCE(SHA2(file_url,256),'<NULL>'),
    COALESCE(SHA2(source_data,256),'<NULL>'),DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s'),
    DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s')),256) row_digest
  FROM patient_documents d ORDER BY d.id`;
const DOCUMENT_LOCK_SQL = `${DOCUMENT_SQL} FOR UPDATE`;
const POST_ROWS_SQL = `SELECT /* legacy:post-rows */ m.*,
  DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') created_at_text,
  DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s') updated_at_text
  FROM medical_records m WHERE id IN (?) ORDER BY id FOR UPDATE`;

async function assertSchema(connection) {
    const [columns] = await connection.query(
        `SELECT TABLE_NAME,COLUMN_NAME,IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('medical_records','medical_record_revisions')`);
    const has = (table, column) => columns.some(item => item.TABLE_NAME === table && item.COLUMN_NAME === column);
    failIf(!columns.some(item => item.TABLE_NAME === 'medical_records' && item.COLUMN_NAME === 'version' &&
        item.IS_NULLABLE === 'NO'), 'SCHEMA_VERSION_MISSING');
    for (const column of ['medical_record_id', 'event_type', 'reconciliation_manifest_sha256', 'source_row_sha256',
        'metadata', 'before_snapshot', 'after_snapshot', 'changed_paths', 'from_version', 'to_version']) {
        failIf(!has('medical_record_revisions', column), 'SCHEMA_VERSION_MISSING');
    }
    const [indexes] = await connection.query(
        `SELECT INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX,NON_UNIQUE FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='medical_record_revisions'
           AND INDEX_NAME='uq_medical_reconciliation' ORDER BY SEQ_IN_INDEX`);
    failIf(indexes.length !== 3 || indexes.some(item => Number(item.NON_UNIQUE) !== 0) ||
        indexes.map(item => item.COLUMN_NAME).join(',') !==
        'reconciliation_manifest_sha256,medical_record_id,event_type', 'SCHEMA_VERSION_MISSING');
    const [medicalUnique] = await connection.query(
        `SELECT INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX,NON_UNIQUE FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='medical_records'
           AND INDEX_NAME='idx_mr_record_type' ORDER BY SEQ_IN_INDEX`);
    failIf(medicalUnique.length !== 2 || medicalUnique.some(item => Number(item.NON_UNIQUE) !== 0) ||
        medicalUnique.map(item => item.COLUMN_NAME).join(',') !== 'mr_id,record_type',
    'SCHEMA_VERSION_MISSING');
    const [triggers] = await connection.query(
        `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()
         AND EVENT_OBJECT_TABLE='medical_record_revisions'`);
    failIf(!['medical_record_revisions_no_update', 'medical_record_revisions_no_delete']
        .every(name => triggers.some(item => item.TRIGGER_NAME === name)), 'SCHEMA_VERSION_MISSING');
}

async function assertPopulationLockStorage(connection) {
    const [tables] = await connection.query(
        `SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('sunday_clinic_records','medical_records')`);
    failIf(tables.length !== 2 || tables.some(row => row.ENGINE !== 'InnoDB'), 'LOCK_STORAGE_UNSUPPORTED');
}

async function lockCurrentPopulation(connection) {
    // Under REPEATABLE READ, full PRIMARY-index locking scans hold next-key and
    // supremum-gap locks. They must precede the transaction's first consistent
    // read so the subsequent classification cannot use an older read view.
    await connection.query(
        `SELECT /* legacy:visit-population-locks */ id FROM sunday_clinic_records
         FORCE INDEX (PRIMARY) ORDER BY id FOR UPDATE`);
    await connection.query(
        `SELECT /* legacy:medical-population-locks */ id FROM medical_records
         FORCE INDEX (PRIMARY) ORDER BY id FOR UPDATE`);
}

async function loadSnapshot(connection) {
    const [[version]] = await connection.query('SELECT VERSION() AS database_version');
    failIf(!String(version?.database_version || '').includes('MariaDB'), 'DATABASE_VERSION_UNSUPPORTED');
    await assertSchema(connection);
    const [[count]] = await connection.query(
        `SELECT /* legacy:source-count */ COUNT(*) source_count FROM medical_records
         WHERE (mr_id IS NULL OR TRIM(mr_id)='') AND record_type<>'complete'`);
    const [rows] = await connection.query(CLASSIFIED_SQL);
    const [completeRows] = await connection.query(COMPLETE_SQL);
    const [documents] = await connection.query(DOCUMENT_SQL);
    return { rows, sourceCount: Number(count.source_count), completeRows, documents,
        schemaVersion: SCHEMA_VERSION, databaseVersion: version.database_version };
}

function assertManifestShape(manifest, expected, backupSha256) {
    failIf(!manifest || manifest.manifestVersion !== 1 || manifest.algorithmVersion !== ALGORITHM_VERSION ||
        manifest.schemaVersion !== SCHEMA_VERSION || manifest.backupSha256 !== backupSha256 ||
        !Array.isArray(manifest.rows) || manifest.rows.length !== expected.safe.count + expected.conflict.count,
    'MANIFEST_INVALID');
    const receipt = manifest.preReceipt;
    failIf(!receipt || receipt.hashes?.safe !== expected.safe.hash ||
        receipt.hashes?.conflict !== expected.conflict.hash || receipt.hashes?.completeIgnored !== expected.complete.hash ||
        receipt.hashes?.documents !== expected.documents.hash || receipt.counts?.safe !== expected.safe.count ||
        receipt.counts?.conflict !== expected.conflict.count || receipt.counts?.completeIgnored !== expected.complete.count ||
        receipt.counts?.documents !== expected.documents.count, 'MANIFEST_AUDIT_DRIFT');
    failIf(new Set(manifest.rows.map(row => Number(row.sourceRecordId))).size !== manifest.rows.length,
        'MANIFEST_DUPLICATE_SOURCE');
    failIf(manifest.rows.some((row, index) => index > 0 &&
        Number(manifest.rows[index - 1].sourceRecordId) >= Number(row.sourceRecordId)), 'MANIFEST_ORDER_INVALID');
    failIf(manifest.rows.filter(row => row.classification === 'safe').length !== expected.safe.count ||
        manifest.rows.filter(row => row.classification === 'conflict').length !== expected.conflict.count,
    'MANIFEST_CLASSIFICATION_INVALID');
}

function validateRevisions(revisions, manifest) {
    failIf(revisions.length !== manifest.rows.length, 'REVISION_SET_DRIFT');
    const byId = new Map(revisions.map(row => [Number(row.sourceId), row]));
    failIf(byId.size !== revisions.length, 'REVISION_SET_DRIFT');
    for (const entry of manifest.rows) {
        const revision = byId.get(Number(entry.sourceRecordId));
        failIf(!revision || revision.eventType !== (entry.classification === 'safe'
            ? 'legacy_backfill' : 'legacy_conflict_snapshot') ||
            revision.source_row_sha256 !== entry.sourceDigest, 'REVISION_SET_DRIFT');
    }
}

function targetStateFromRow(row) {
    return { id: row.id, patientId: row.patient_id, mrId: row.mr_id, visitId: row.visit_id,
        doctorId: row.doctor_id, doctorName: row.doctor_name, recordType: row.record_type,
        payloadSha256: sha256(row.record_data), createdAt: row.created_at_text,
        updatedAt: row.updated_at_text, version: Number(row.version) };
}
async function verifyPostState(connection, manifest, baselineDocuments, baselineComplete) {
    const ids = [...new Set(manifest.rows.flatMap(row => [row.sourceRecordId, row.targetRecordId]
        .filter(id => id != null)))].sort((a, b) => Number(a) - Number(b));
    const [rows] = await connection.query(POST_ROWS_SQL, [ids]);
    const byId = new Map(rows.map(row => [Number(row.id), row]));
    failIf(byId.size !== ids.length, 'POST_ROW_MISSING');
    for (const entry of manifest.rows) {
        const source = byId.get(Number(entry.sourceRecordId));
        failIf(!source || digestObject(sourceState(source)) !== entry.expectedPostDigest,
            'POST_SOURCE_DRIFT');
        if (entry.classification === 'conflict') {
            const target = byId.get(Number(entry.targetRecordId));
            failIf(!target || digestObject(targetStateFromRow(target)) !== entry.targetDigest,
                'POST_TARGET_DRIFT');
        }
    }
    const [completeRows] = await connection.query(COMPLETE_SQL);
    const [documents] = await connection.query(DOCUMENT_LOCK_SQL);
    failIf(completeRows.length !== baselineComplete.length || setHash(completeRows) !== setHash(baselineComplete),
        'COMPLETE_INVARIANT_FAILED');
    failIf(documents.length !== baselineDocuments.length || setHash(documents) !== setHash(baselineDocuments) ||
        digestObject(documents) !== digestObject(baselineDocuments), 'DOCUMENT_INVARIANT_FAILED');
}

async function lockManifestRows(connection, manifest) {
    const visitIds = [...new Set(manifest.rows.map(row => Number(row.candidateVisitRowId)))].sort((a, b) => a - b);
    const [visits] = await connection.query(
        `SELECT /* legacy:visit-locks */ id visit_row_id,patient_id visit_patient_id,mr_id candidate_mr_id,
          status visit_status,visit_location,
          DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') visit_created_at_text,
          DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s') visit_updated_at_text,
          DATE_FORMAT(last_activity_at,'%Y-%m-%d %H:%i:%s') visit_last_activity_at_text
         FROM sunday_clinic_records WHERE id IN (?) ORDER BY id FOR UPDATE`,
        [visitIds]);
    failIf(visits.length !== visitIds.length || visits.some((row, i) => Number(row.visit_row_id) !== visitIds[i]),
        'VISIT_LOCK_DRIFT');
    const medicalIds = [...new Set(manifest.rows.flatMap(row => [row.sourceRecordId, row.targetRecordId]
        .filter(id => id != null).map(Number)))].sort((a, b) => a - b);
    const [medical] = await connection.query(
        `SELECT /* legacy:medical-locks */ m.*,
          DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') created_at_text,
          DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s') updated_at_text
         FROM medical_records m WHERE id IN (?) ORDER BY id FOR UPDATE`,
        [medicalIds]);
    failIf(medical.length !== medicalIds.length || medical.some((row, i) => Number(row.id) !== medicalIds[i]),
        'MEDICAL_LOCK_DRIFT');
    return { visits, medical };
}

function verifyLockedPreconditions(locked, manifest, rerun) {
    const visits = new Map(locked.visits.map(row => [Number(row.visit_row_id), row]));
    const medical = new Map(locked.medical.map(row => [Number(row.id), row]));
    for (const entry of manifest.rows) {
        const visit = visits.get(Number(entry.candidateVisitRowId));
        failIf(!visit || digestObject(visitState(visit)) !== entry.visitDigest, 'LOCKED_VISIT_DRIFT');
        const source = medical.get(Number(entry.sourceRecordId));
        const expectedSource = rerun && entry.classification === 'safe'
            ? entry.expectedPostDigest : entry.sourceDigest;
        failIf(!source || digestObject(sourceState(source)) !== expectedSource, 'LOCKED_SOURCE_DRIFT');
        if (entry.classification === 'conflict') {
            const target = medical.get(Number(entry.targetRecordId));
            failIf(!target || digestObject(targetStateFromRow(target)) !== entry.targetDigest,
                'LOCKED_TARGET_DRIFT');
        }
    }
}

async function applyActions(connection, manifest, manifestSha256, classifiedRows) {
    const byId = new Map(classifiedRows.map(row => [Number(row.id), row]));
    for (const entry of manifest.rows) {
        const row = byId.get(Number(entry.sourceRecordId));
        failIf(!row, 'SOURCE_SCOPE_DRIFT');
        const sourceSnapshot = parsedData(row.record_data);
        const targetSnapshot = entry.classification === 'conflict' ? parsedData(row.target_record_data) : sourceSnapshot;
        const from = Number(row.version), to = entry.classification === 'safe' ? from + 1 : from;
        failIf(!Number.isSafeInteger(to) || to > 2147483647, 'VERSION_EXHAUSTED');
        const metadata = { algorithmVersion: ALGORITHM_VERSION, sourceDigest: entry.sourceDigest,
            visitDigest: entry.visitDigest, targetDigest: entry.targetDigest,
            candidateDocumentSetDigest: entry.candidateDocumentSetDigest,
            sourceMrSha256: row.mr_id == null ? '<NULL>' : sha256(String(row.mr_id)),
            candidateMrSha256: sha256(String(entry.candidateMrId)), expectedPostDigest: entry.expectedPostDigest };
        const event = entry.classification === 'safe' ? 'legacy_backfill' : 'legacy_conflict_snapshot';
        if (event === 'legacy_backfill') {
            const [occupied] = await connection.query(
                `SELECT /* legacy:target-gap */ id FROM medical_records
                 WHERE mr_id = ? AND record_type = ? FOR UPDATE`, [entry.candidateMrId, entry.sourceRecordType]);
            failIf(occupied.length !== 0, 'TARGET_GAP_CLOSED');
        }
        await connection.query(
            `INSERT INTO medical_record_revisions
             (reconciliation_manifest_sha256,medical_record_id,patient_id,mr_id,record_type,event_type,
              actor_id,from_version,to_version,before_snapshot,after_snapshot,changed_paths,
              source_row_sha256,metadata)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [manifestSha256, entry.sourceRecordId, entry.sourcePatientId,
                event === 'legacy_backfill' ? entry.candidateMrId : row.mr_id,
                entry.sourceRecordType, event, 'legacy-reconciliation', from, to,
                JSON.stringify(sourceSnapshot), JSON.stringify(targetSnapshot), JSON.stringify([]),
                entry.sourceDigest, JSON.stringify(metadata)]);
        if (event === 'legacy_backfill') {
            const [updated] = await connection.query(
                `UPDATE medical_records SET mr_id = ?, version = ?, updated_at = updated_at
                 WHERE id = ? AND patient_id = ? AND (mr_id IS NULL OR TRIM(mr_id)='')
                   AND record_type = ? AND version = ? AND record_data = ?
                   AND created_at = ? AND updated_at = ?`,
                [entry.candidateMrId, to, entry.sourceRecordId, entry.sourcePatientId,
                    entry.sourceRecordType, from, row.record_data, row.created_at_text, row.updated_at_text]);
            failIf(updated.affectedRows !== 1, 'CAS_FAILED');
        }
    }
}

function assertReceiptUnchanged(snapshot, expected, manifest, rerun) {
    const complete = { count: snapshot.completeRows.length, hash: setHash(snapshot.completeRows) };
    const documents = { count: snapshot.documents.length, hash: setHash(snapshot.documents) };
    compareAggregate(complete, expected.complete, 'complete');
    compareAggregate(documents, expected.documents, 'documents');
    failIf(digestObject(snapshot.documents) !== manifest.documentFullDigest, 'MANIFEST_LIVE_DRIFT');
    failIf(snapshot.rows.length !== snapshot.sourceCount, 'MISSING_CANDIDATE');
    if (rerun) {
        failIf(snapshot.rows.length !== expected.conflict.count ||
            snapshot.rows.some(row => row.target_id == null) || setHash(snapshot.rows) !== expected.conflict.hash,
        'RERUN_PRECONDITION_DRIFT');
    } else {
        const check = classifySnapshot({ ...snapshot, expected, snapshotAt: manifest.snapshotAt,
            backupSha256: manifest.backupSha256 });
        failIf(canonicalJson(check.manifest) !== canonicalJson(manifest), 'MANIFEST_LIVE_DRIFT');
    }
}

async function runReconciliation({ db, dbFactory, mode = 'dry-run', backupPath, backupSha256,
    manifestPath, confirmationSha256, confirmPhrase, expected = AUDITED,
    readManifest = readPrivateManifest, writeManifest = writePrivateManifest, now = () => new Date() }) {
    failIf(mode !== 'dry-run' && mode !== 'apply', 'MODE_INVALID');
    failIf(typeof manifestPath !== 'string', 'MANIFEST_PATH_REQUIRED');
    assertExternalPath(manifestPath);
    const verifiedBackupSha = await verifyBackup(backupPath, backupSha256);
    let manifest, manifestSha256;
    if (mode === 'apply') {
        failIf(confirmPhrase !== 'APPLY_LEGACY_MEDICAL_RECORDS', 'APPLY_CONFIRMATION_REQUIRED');
        requireHash(confirmationSha256, 'MANIFEST_CONFIRMATION_REQUIRED');
        manifest = readManifest(manifestPath, confirmationSha256);
        manifestSha256 = sha256(canonicalJson(manifest));
        failIf(manifestSha256 !== confirmationSha256, 'MANIFEST_CHECKSUM_MISMATCH');
        assertManifestShape(manifest, expected, verifiedBackupSha);
    }
    const database = db || (dbFactory && dbFactory());
    failIf(!database || typeof database.getConnection !== 'function', 'DATABASE_UNAVAILABLE');
    const connection = await database.getConnection();
    let transaction = false, advisory = false;
    try {
        if (mode === 'apply') {
            const [[lock]] = await connection.query(
                `SELECT GET_LOCK('medical-records-legacy-reconcile-v1',0) acquired`);
            failIf(Number(lock?.acquired) !== 1, 'ADVISORY_LOCK_UNAVAILABLE');
            advisory = true;
            await assertPopulationLockStorage(connection);
        }
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.query(mode === 'apply' ? 'START TRANSACTION' : 'START TRANSACTION WITH CONSISTENT SNAPSHOT');
        transaction = true;
        if (mode === 'apply') await lockCurrentPopulation(connection);
        let snapshot = await loadSnapshot(connection);
        if (mode === 'dry-run') {
            const classified = classifySnapshot({ ...snapshot, expected, snapshotAt: now().toISOString(),
                backupSha256: verifiedBackupSha });
            await connection.rollback(); transaction = false;
            manifestSha256 = writeManifest(manifestPath, classified.manifest);
            return { ...classified.receipt, manifestSha256 };
        }
        failIf(snapshot.databaseVersion !== manifest.databaseVersion, 'DATABASE_VERSION_DRIFT');
        const [revisions] = await connection.query(
            `SELECT /* legacy:existing-revisions */ medical_record_id sourceId,event_type eventType,
              source_row_sha256 FROM medical_record_revisions WHERE reconciliation_manifest_sha256 = ?
             ORDER BY medical_record_id`, [manifestSha256]);
        failIf(revisions.length !== 0 && revisions.length !== manifest.rows.length, 'PARTIAL_MANIFEST_APPLY');
        const rerun = revisions.length > 0;
        if (rerun) validateRevisions(revisions, manifest);
        assertReceiptUnchanged(snapshot, expected, manifest, rerun);
        const locked = await lockManifestRows(connection, manifest);
        verifyLockedPreconditions(locked, manifest, rerun);
        const [lockedDocuments] = await connection.query(DOCUMENT_LOCK_SQL);
        failIf(lockedDocuments.length !== expected.documents.count ||
            setHash(lockedDocuments) !== expected.documents.hash ||
            digestObject(lockedDocuments) !== manifest.documentFullDigest, 'LOCKED_DOCUMENT_DRIFT');
        // The first consistent snapshot was created after both full population
        // locks; a second plain SELECT would only reread that same snapshot.
        if (!rerun) await applyActions(connection, manifest, manifestSha256, snapshot.rows);
        await verifyPostState(connection, manifest, lockedDocuments, snapshot.completeRows);
        const [finalRevisions] = await connection.query(
            `SELECT /* legacy:existing-revisions */ medical_record_id sourceId,event_type eventType,
              source_row_sha256 FROM medical_record_revisions WHERE reconciliation_manifest_sha256 = ?
             ORDER BY medical_record_id`, [manifestSha256]);
        validateRevisions(finalRevisions, manifest);
        await connection.commit(); transaction = false;
        return { ...manifest.preReceipt, manifestSha256, idempotent: rerun };
    } catch (error) {
        if (transaction) await connection.rollback();
        throw error;
    } finally {
        if (advisory) {
            try { await connection.query(`SELECT RELEASE_LOCK('medical-records-legacy-reconcile-v1') released`); }
            finally { connection.release(); }
        } else connection.release();
    }
}

module.exports = { ALGORITHM_VERSION, SCHEMA_VERSION, AUDITED, ReconciliationError, sha256, canonicalJson,
    assertExternalPath, publishExclusive, verifyBackup, writePrivateManifest, readPrivateManifest, classifySnapshot,
    digestObject, sourceState, visitState, targetState, setHash, loadSnapshot, runReconciliation };
