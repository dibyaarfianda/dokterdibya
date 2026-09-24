'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
    runReconciliation, classifySnapshot, SCHEMA_VERSION, sha256, canonicalJson
} = require('../../services/LegacyMedicalReconciliation');

const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const date = '2026-01-01 10:00:00';
function fixture() {
    const rows = Array.from({ length: 24 }, (_, i) => {
        const id = i + 1, type = ['anamnesa', 'pemeriksaan_obstetri', 'usg'][i % 3];
        return { id, patient_id: `TEST-P${id}`, visit_id: null, mr_id: null,
            doctor_id: 3, doctor_name: 'Synthetic Doctor', record_type: type,
            record_data: JSON.stringify({ synthetic: id }), created_at_text: date, updated_at_text: date, version: 1,
            visit_row_id: 100 + id, visit_patient_id: `TEST-P${id}`, candidate_mr_id: `TEST-MR${id}`,
            visit_status: 'draft', visit_location: 'rsia_melinda',
            visit_created_at_text: date, visit_updated_at_text: date, visit_last_activity_at_text: date,
            distance_seconds: 0, nearest_distance_ties: 1, target_id: i < 3 ? null : 200 + id,
            target_patient_id: i < 3 ? null : `TEST-P${id}`, target_mr_id: i < 3 ? null : `TEST-MR${id}`,
            target_record_type: i < 3 ? null : type,
            target_visit_id: i < 3 ? null : null,
            target_doctor_id: i < 3 ? null : 3,
            target_doctor_name: i < 3 ? null : 'Synthetic Doctor',
            target_record_data: i < 3 ? null : JSON.stringify({ target: id }),
            target_created_at_text: i < 3 ? null : date, target_updated_at_text: i < 3 ? null : date,
            target_version: i < 3 ? null : 2,
            source_digest: hash(`source-${id}`), visit_digest: hash(`visit-${id}`),
            target_digest: i < 3 ? '<ABSENT>' : hash(`target-${id}`), row_digest: hash(`row-${id}`) };
    });
    const completeRows = Array.from({ length: 834 }, (_, i) => ({ id: 1000 + i, valid_json: 1,
        row_digest: hash(`complete-${i}`) }));
    const documents = [{ id: 1, patient_id: 'TEST-P1', mr_id: 'TEST-MR1', row_digest: hash('doc') }];
    const set = values => hash(values.map(item => item.row_digest).join(''));
    const expected = { safe: { count: 3, hash: set(rows.slice(0, 3)) },
        conflict: { count: 21, hash: set(rows.slice(3)) },
        complete: { count: 834, hash: set(completeRows) }, documents: { count: 1, hash: set(documents) } };
    const manifest = classifySnapshot({ rows, sourceCount: 24, completeRows, documents, expected,
        schemaVersion: SCHEMA_VERSION, databaseVersion: '10.11.13-MariaDB',
        snapshotAt: '2026-09-24T00:00:00.000Z', backupSha256: hash('synthetic backup') }).manifest;
    return { rows, completeRows, documents, expected, manifest };
}

function database(input, options = {}) {
    const state = { rows: structuredClone(input.rows), completeRows: structuredClone(input.completeRows),
        documents: structuredClone(input.documents), revisions: [], commits: 0, rollbacks: 0, events: [] };
    let before;
    const connection = {
        async query(sql, params = []) {
            const statement = String(sql).replace(/\s+/g, ' ').trim();
            state.events.push(statement);
            if (statement.includes('GET_LOCK(')) return [[{ acquired: options.lockDenied ? 0 : 1 }]];
            if (statement.includes('RELEASE_LOCK(')) return [[{ released: 1 }]];
            if (statement.startsWith('SET ')) return [[], []];
            if (statement.startsWith('START TRANSACTION')) { before = structuredClone(state); return [[], []]; }
            if (statement.startsWith('SELECT VERSION()')) return [[{ database_version: '10.11.13-MariaDB' }]];
            if (statement.includes('information_schema.COLUMNS')) return [[
                ...(options.schemaMissing ? [] : [
                { TABLE_NAME: 'medical_records', COLUMN_NAME: 'version', IS_NULLABLE: 'NO' },
                ]),
                ...['medical_record_id', 'event_type', 'reconciliation_manifest_sha256', 'source_row_sha256', 'metadata',
                    'before_snapshot', 'after_snapshot', 'changed_paths', 'from_version', 'to_version'].map(COLUMN_NAME =>
                    ({ TABLE_NAME: 'medical_record_revisions', COLUMN_NAME }))
            ]];
            if (statement.includes('information_schema.STATISTICS') && statement.includes("TABLE_NAME='medical_records'"))
                return [options.targetUniqueMissing ? [] : [
                    { INDEX_NAME: 'idx_mr_record_type', COLUMN_NAME: 'mr_id', SEQ_IN_INDEX: 1, NON_UNIQUE: 0 },
                    { INDEX_NAME: 'idx_mr_record_type', COLUMN_NAME: 'record_type', SEQ_IN_INDEX: 2, NON_UNIQUE: 0 }
                ]];
            if (statement.includes('information_schema.STATISTICS')) return [[
                { INDEX_NAME: 'uq_medical_reconciliation', COLUMN_NAME: 'reconciliation_manifest_sha256', SEQ_IN_INDEX: 1, NON_UNIQUE: 0 },
                { INDEX_NAME: 'uq_medical_reconciliation', COLUMN_NAME: 'medical_record_id', SEQ_IN_INDEX: 2, NON_UNIQUE: 0 },
                { INDEX_NAME: 'uq_medical_reconciliation', COLUMN_NAME: 'event_type', SEQ_IN_INDEX: 3, NON_UNIQUE: 0 }
            ]];
            if (statement.includes('information_schema.TRIGGERS')) return [[
                { TRIGGER_NAME: 'medical_record_revisions_no_update' },
                { TRIGGER_NAME: 'medical_record_revisions_no_delete' }
            ]];
            if (statement.includes('legacy:source-count')) return [[{ source_count: state.rows.filter(row => !row.mr_id).length }]];
            if (statement.startsWith('WITH legacy AS')) return [structuredClone(
                (options.staleSnapshotOnLock ? before.rows : state.rows).filter(row => !row.mr_id))];
            if (statement.includes('legacy:complete')) return [structuredClone(state.completeRows)];
            if (statement.includes('legacy:documents')) return [structuredClone(
                options.staleDocumentSnapshotOnLock && !statement.includes('FOR UPDATE')
                    ? before.documents : state.documents)];
            if (statement.includes('legacy:existing-revisions')) return [[...state.revisions.filter(row => row.manifestSha === params[0])]];
            if (statement.includes('legacy:visit-locks')) {
                if (options.staleSnapshotOnLock) state.rows[0].record_data = JSON.stringify({ synthetic: 'concurrent edit' });
                if (options.staleDocumentSnapshotOnLock) state.documents[0].title = 'concurrent metadata edit';
                return [[...params[0].map(id => {
                    const row = state.rows.find(item => item.visit_row_id === id);
                    return { visit_row_id: id, visit_patient_id: row.visit_patient_id,
                        candidate_mr_id: row.candidate_mr_id, visit_status: row.visit_status,
                        visit_location: row.visit_location, visit_created_at_text: row.visit_created_at_text,
                        visit_updated_at_text: row.visit_updated_at_text,
                        visit_last_activity_at_text: row.visit_last_activity_at_text };
                })]];
            }
            if (statement.includes('legacy:medical-locks')) {
                const result = [];
                for (const id of params[0]) {
                    const source = state.rows.find(row => row.id === id);
                    if (source) { result.push(structuredClone(source)); continue; }
                    const target = state.rows.find(row => row.target_id === id);
                    result.push({ id, patient_id: target.target_patient_id, visit_id: target.target_visit_id,
                        mr_id: target.target_mr_id, doctor_id: target.target_doctor_id,
                        doctor_name: target.target_doctor_name, record_type: target.target_record_type,
                        record_data: target.target_record_data, created_at_text: target.target_created_at_text,
                        updated_at_text: target.target_updated_at_text, version: target.target_version });
                }
                return [result];
            }
            if (statement.includes('legacy:target-gap')) return [[...state.rows.filter(row => row.mr_id === params[0] && row.record_type === params[1])]];
            if (statement.includes('legacy:post-rows')) {
                const result = [];
                for (const row of state.rows) {
                    if (params[0].includes(row.id)) result.push({ ...row, post_kind: 'source' });
                    if (row.target_id && params[0].includes(row.target_id)) result.push({
                        id: row.target_id, patient_id: row.target_patient_id, visit_id: null, mr_id: row.target_mr_id,
                        doctor_id: row.target_doctor_id, doctor_name: row.target_doctor_name,
                        record_type: row.target_record_type, record_data: row.target_record_data,
                        created_at_text: row.target_created_at_text, updated_at_text: row.target_updated_at_text,
                        version: row.target_version, post_kind: 'target'
                    });
                }
                return [result];
            }
            if (statement.startsWith('INSERT INTO medical_record_revisions')) {
                state.revisions.push({ manifestSha: params[0], sourceId: params[1], eventType: params[5],
                    source_row_sha256: params[12], before_snapshot: params[9], after_snapshot: params[10],
                    metadata: params[13], changed_paths: params[11], from_version: params[7], to_version: params[8] });
                if (options.documentMutation) state.documents[0].title = 'Changed during transaction';
                return [{ affectedRows: 1 }];
            }
            if (statement.startsWith('UPDATE medical_records SET mr_id')) {
                if (options.casFailure) return [{ affectedRows: 0 }];
                const row = state.rows.find(item => item.id === params[2]);
                if (!row || row.mr_id) return [{ affectedRows: 0 }];
                row.mr_id = params[0]; row.version = params[1];
                return [{ affectedRows: 1 }];
            }
            throw new Error(`Unexpected synthetic SQL: ${statement.slice(0, 90)}`);
        },
        async commit() { state.commits++; before = undefined; },
        async rollback() {
            state.rollbacks++;
            if (before) {
                state.rows = before.rows; state.revisions = before.revisions; state.documents = before.documents;
                before = undefined;
            }
        },
        release() { state.events.push('RELEASE_CONNECTION'); }
    };
    return { state, getConnection: async () => connection };
}

async function withBackup(task) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medical-reconcile-'));
    const backupPath = path.join(directory, 'synthetic.sql');
    fs.writeFileSync(backupPath, 'synthetic backup');
    try { return await task({ directory, backupPath, backupSha256: hash('synthetic backup') }); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test('apply locks visits before medical rows, backfills exactly three metadata rows, snapshots 21 conflicts and preserves documents', async () => withBackup(async backup => {
    const input = fixture(), db = database(input);
    const result = await runReconciliation({ db, mode: 'apply', expected: input.expected, manifestPath: path.join(backup.directory, 'manifest.json'),
        confirmationSha256: sha256(canonicalJson(input.manifest)), confirmPhrase: 'APPLY_LEGACY_MEDICAL_RECORDS',
        readManifest: () => input.manifest, ...backup });
    expect(result.counts).toEqual({ safe: 3, conflict: 21, completeIgnored: 834, documents: 1 });
    expect(db.state.rows.slice(0, 3).map(row => [row.mr_id, row.version, row.updated_at_text]))
        .toEqual([["TEST-MR1", 2, date], ["TEST-MR2", 2, date], ["TEST-MR3", 2, date]]);
    expect(db.state.rows.slice(3).every(row => row.mr_id === null && row.version === 1)).toBe(true);
    expect(db.state.revisions).toHaveLength(24);
    expect(db.state.revisions.filter(row => row.eventType === 'legacy_backfill')).toHaveLength(3);
    expect(db.state.revisions.filter(row => row.eventType === 'legacy_conflict_snapshot')).toHaveLength(21);
    expect(db.state.revisions[0]).toMatchObject({ from_version: 1, to_version: 2,
        before_snapshot: JSON.stringify({ synthetic: 1 }), after_snapshot: JSON.stringify({ synthetic: 1 }),
        changed_paths: '[]' });
    expect(db.state.revisions[3]).toMatchObject({ from_version: 1, to_version: 1,
        before_snapshot: JSON.stringify({ synthetic: 4 }), after_snapshot: JSON.stringify({ target: 4 }),
        changed_paths: '[]' });
    expect(JSON.parse(db.state.revisions[0].metadata)).toMatchObject({
        sourceDigest: input.manifest.rows[0].sourceDigest,
        expectedPostDigest: input.manifest.rows[0].expectedPostDigest
    });
    expect(db.state.documents).toEqual(input.documents);
    expect(db.state.completeRows).toEqual(input.completeRows);
    expect(db.state.events.findIndex(sql => sql.includes('legacy:visit-locks')))
        .toBeLessThan(db.state.events.findIndex(sql => sql.includes('legacy:medical-locks')));
    expect(db.state.commits).toBe(1);
}));

test('same-manifest rerun is idempotent and does not append duplicate revisions', async () => withBackup(async backup => {
    const input = fixture(), db = database(input);
    const args = { db, mode: 'apply', expected: input.expected, manifestPath: path.join(backup.directory, 'manifest.json'),
        confirmationSha256: sha256(canonicalJson(input.manifest)), confirmPhrase: 'APPLY_LEGACY_MEDICAL_RECORDS',
        readManifest: () => input.manifest, ...backup };
    await runReconciliation(args);
    const second = await runReconciliation(args);
    expect(second.idempotent).toBe(true);
    expect(db.state.revisions).toHaveLength(24);
    expect(db.state.rows.slice(0, 3).every(row => row.version === 2)).toBe(true);
}));

test.each([
    ['advisory lock unavailable', { lockDenied: true }],
    ['compare-and-set failure', { casFailure: true }],
    ['document changed inside transaction', { documentMutation: true }],
    ['versioned schema missing', { schemaMissing: true }],
    ['unique MR/type index missing', { targetUniqueMissing: true }]
])('%s leaves every medical, complete and document row unchanged', async (_, options) => withBackup(async backup => {
    const input = fixture(), db = database(input, options);
    await expect(runReconciliation({ db, mode: 'apply', expected: input.expected,
        manifestPath: path.join(backup.directory, 'manifest.json'), confirmationSha256: sha256(canonicalJson(input.manifest)),
        confirmPhrase: 'APPLY_LEGACY_MEDICAL_RECORDS', readManifest: () => input.manifest, ...backup })).rejects.toThrow();
    expect(db.state.rows).toEqual(input.rows);
    expect(db.state.revisions).toHaveLength(0);
    expect(db.state.documents).toEqual(input.documents);
    expect(db.state.completeRows).toEqual(input.completeRows);
    expect(db.state.commits).toBe(0);
    expect(db.state.events.at(-1)).toBe('RELEASE_CONNECTION');
}));

test('dry-run checks backup before connecting and emits only aggregate receipt', async () => withBackup(async backup => {
    const input = fixture(), db = database(input);
    let written;
    const output = await runReconciliation({ db, expected: input.expected,
        manifestPath: path.join(backup.directory, 'manifest.json'), ...backup,
        now: () => new Date(input.manifest.snapshotAt),
        writeManifest: (_filename, value) => { written = value; return sha256(canonicalJson(value)); } });
    expect(written.rows).toHaveLength(24);
    expect(output.counts).toEqual({ safe: 3, conflict: 21, completeIgnored: 834, documents: 1 });
    expect(JSON.stringify(output)).not.toContain('TEST-P');
    expect(db.state.revisions).toHaveLength(0);
    expect(db.state.rollbacks).toBe(1);
    let opened = 0;
    await expect(runReconciliation({ dbFactory: () => { opened++; return db; }, expected: input.expected,
        manifestPath: path.join(backup.directory, 'other.json'), backupPath: backup.backupPath,
        backupSha256: hash('bad') })).rejects.toThrow('BACKUP_CHECKSUM_MISMATCH');
    expect(opened).toBe(0);
}));

test('document metadata drift omitted by the audited pointer hash still invalidates the private manifest', async () => withBackup(async backup => {
    const input = fixture();
    input.documents[0].title = 'Changed since dry-run';
    const db = database(input);
    await expect(runReconciliation({ db, mode: 'apply', expected: input.expected,
        manifestPath: path.join(backup.directory, 'manifest.json'), confirmationSha256: sha256(canonicalJson(input.manifest)),
        confirmPhrase: 'APPLY_LEGACY_MEDICAL_RECORDS', readManifest: () => input.manifest, ...backup }))
        .rejects.toThrow('MANIFEST_LIVE_DRIFT');
    expect(db.state.revisions).toHaveLength(0);
    expect(db.state.commits).toBe(0);
}));

test.each([
    ['source doctor attribution', input => { input.rows[0].doctor_name = 'Changed Doctor'; }],
    ['selected visit status', input => { input.rows[0].visit_status = 'finalized'; }]
])('%s drift invalidates private mutable preconditions despite unchanged audited set hash', async (_, alter) => withBackup(async backup => {
    const input = fixture(); alter(input);
    const db = database(input);
    await expect(runReconciliation({ db, mode: 'apply', expected: input.expected,
        manifestPath: path.join(backup.directory, 'manifest.json'), confirmationSha256: sha256(canonicalJson(input.manifest)),
        confirmPhrase: 'APPLY_LEGACY_MEDICAL_RECORDS', readManifest: () => input.manifest, ...backup }))
        .rejects.toThrow('MANIFEST_LIVE_DRIFT');
    expect(db.state.revisions).toHaveLength(0);
}));

test('tampered manifest or missing explicit confirmation never opens a database connection', async () => withBackup(async backup => {
    const input = fixture(); let opened = 0;
    const db = { getConnection: async () => { opened++; throw new Error('must not connect'); } };
    await expect(runReconciliation({ db, mode: 'apply', expected: input.expected,
        manifestPath: path.join(backup.directory, 'manifest.json'), confirmationSha256: hash('wrong'),
        confirmPhrase: 'APPLY_LEGACY_MEDICAL_RECORDS', readManifest: () => input.manifest, ...backup })).rejects.toThrow();
    await expect(runReconciliation({ db, mode: 'apply', expected: input.expected,
        manifestPath: path.join(backup.directory, 'manifest.json'), confirmationSha256: sha256(canonicalJson(input.manifest)),
        readManifest: () => input.manifest, ...backup })).rejects.toThrow();
    expect(opened).toBe(0);
}));

test('locked current source drift aborts even when the consistent snapshot still shows audited preconditions', async () => withBackup(async backup => {
    const input = fixture(), db = database(input, { staleSnapshotOnLock: true });
    await expect(runReconciliation({ db, mode: 'apply', expected: input.expected,
        manifestPath: path.join(backup.directory, 'manifest.json'), confirmationSha256: sha256(canonicalJson(input.manifest)),
        confirmPhrase: 'APPLY_LEGACY_MEDICAL_RECORDS', readManifest: () => input.manifest, ...backup }))
        .rejects.toThrow('LOCKED_SOURCE_DRIFT');
    expect(db.state.revisions).toHaveLength(0);
    expect(db.state.commits).toBe(0);
}));

test('current document metadata drift aborts despite a stale consistent snapshot', async () => withBackup(async backup => {
    const input = fixture(), db = database(input, { staleDocumentSnapshotOnLock: true });
    await expect(runReconciliation({ db, mode: 'apply', expected: input.expected,
        manifestPath: path.join(backup.directory, 'manifest.json'), confirmationSha256: sha256(canonicalJson(input.manifest)),
        confirmPhrase: 'APPLY_LEGACY_MEDICAL_RECORDS', readManifest: () => input.manifest, ...backup }))
        .rejects.toThrow('LOCKED_DOCUMENT_DRIFT');
    expect(db.state.revisions).toHaveLength(0);
    expect(db.state.commits).toBe(0);
}));
