'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {
    classifySnapshot, verifyBackup, writePrivateManifest, readPrivateManifest,
    assertExternalPath, sha256, canonicalJson, SCHEMA_VERSION
} = require('../../services/LegacyMedicalReconciliation');

const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const synthetic = value => `TEST-${value}`;

function fixture() {
    const rows = Array.from({ length: 24 }, (_, index) => {
        const conflict = index >= 3;
        const id = index + 1;
        return {
            id, patient_id: synthetic(`P${id}`), visit_id: null, mr_id: null,
            record_type: index % 3 === 0 ? 'anamnesa' : index % 3 === 1 ? 'pemeriksaan_obstetri' : 'usg',
            record_data: JSON.stringify({ synthetic: id }), created_at_text: '2026-01-01 10:00:00',
            updated_at_text: '2026-01-01 10:00:00', version: 1,
            visit_row_id: 100 + id, visit_patient_id: synthetic(`P${id}`), candidate_mr_id: synthetic(`MR${id}`),
            visit_created_at_text: '2026-01-01 10:00:05', visit_updated_at_text: '2026-01-01 10:00:05',
            visit_last_activity_at_text: '2026-01-01 10:00:05', distance_seconds: 5,
            nearest_distance_ties: 1, target_id: conflict ? 200 + id : null,
            target_patient_id: conflict ? synthetic(`P${id}`) : null,
            target_mr_id: conflict ? synthetic(`MR${id}`) : null,
            target_record_type: conflict ? (index % 3 === 0 ? 'anamnesa' : index % 3 === 1 ? 'pemeriksaan_obstetri' : 'usg') : null,
            target_record_data: conflict ? JSON.stringify({ target: id }) : null,
            target_created_at_text: conflict ? '2026-01-01 10:00:05' : null,
            target_updated_at_text: conflict ? '2026-01-01 10:00:05' : null,
            target_version: conflict ? 2 : null,
            row_digest: digest(`candidate-${id}`),
            source_digest: digest(`source-${id}`), visit_digest: digest(`visit-${id}`),
            target_digest: conflict ? digest(`target-${id}`) : '<ABSENT>'
        };
    });
    const completeRows = Array.from({ length: 834 }, (_, index) => ({
        id: 1000 + index, valid_json: 1, row_digest: digest(`complete-${index}`)
    }));
    const documents = Array.from({ length: 3 }, (_, index) => ({
        id: index + 1, patient_id: synthetic(`P${index + 1}`), mr_id: synthetic(`MR${index + 1}`),
        row_digest: digest(`document-${index}`)
    }));
    const join = list => digest(list.map(item => item.row_digest).join(''));
    const expected = {
        safe: { count: 3, hash: join(rows.slice(0, 3)) },
        conflict: { count: 21, hash: join(rows.slice(3)) },
        complete: { count: 834, hash: join(completeRows) },
        documents: { count: 3, hash: join(documents) }
    };
    return { rows, completeRows, documents, expected };
}

test('exact synthetic 3/21/834 population yields deterministic private rows and sanitized receipt', () => {
    const input = fixture();
    const first = classifySnapshot({ ...input, sourceCount: 24, schemaVersion: SCHEMA_VERSION,
        databaseVersion: '10.11.13-MariaDB', snapshotAt: '2026-09-24T00:00:00.000Z', backupSha256: digest('backup') });
    const second = classifySnapshot({ ...input, sourceCount: 24, schemaVersion: SCHEMA_VERSION,
        databaseVersion: '10.11.13-MariaDB', snapshotAt: '2026-09-24T00:00:00.000Z', backupSha256: digest('backup') });
    expect(first).toEqual(second);
    expect(first.manifest.rows).toHaveLength(24);
    expect(first.manifest.rows.map(row => row.sourceRecordId)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(first.receipt.counts).toEqual({ safe: 3, conflict: 21, completeIgnored: 834, documents: 3 });
    expect(JSON.stringify(first.receipt)).not.toContain('TEST-');
    expect(first.manifest.rows[0].expectedPostDigest).toMatch(/^[a-f0-9]{64}$/);
});

test.each([
    ['missing candidate', input => { input.rows.pop(); }],
    ['equal-distance tie', input => { input.rows[0].nearest_distance_ties = 2; }],
    ['null distance', input => { input.rows[0].distance_seconds = null; }],
    ['source/visit patient mismatch', input => { input.rows[0].visit_patient_id = synthetic('OTHER'); }],
    ['target patient mismatch', input => { input.rows[3].target_patient_id = synthetic('OTHER'); }],
    ['invalid source JSON', input => { input.rows[0].record_data = '{'; }],
    ['invalid target JSON', input => { input.rows[3].target_record_data = '{'; }],
    ['count drift', input => { input.expected.safe.count = 4; }],
    ['hash drift', input => { input.expected.conflict.hash = digest('wrong'); }],
    ['invalid version', input => { input.rows[0].version = 0; }]
])('%s hard-stops before a manifest is returned', (_, alter) => {
    const input = fixture(); alter(input);
    expect(() => classifySnapshot({ ...input, sourceCount: 24, schemaVersion: SCHEMA_VERSION,
        databaseVersion: 'MariaDB', snapshotAt: '2026-09-24T00:00:00.000Z', backupSha256: digest('backup') }))
        .toThrow();
});

test('backup is required, checksum-bound, nonempty and gzip verified', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medical-reconcile-'));
    const backup = path.join(directory, 'synthetic.sql.gz');
    try {
        const bytes = zlib.gzipSync(Buffer.from('CREATE TABLE synthetic (id INT);'));
        fs.writeFileSync(backup, bytes);
        await expect(verifyBackup(backup, digest(bytes))).resolves.toBe(digest(bytes));
        await expect(verifyBackup(backup, digest('wrong'))).rejects.toThrow();
        fs.writeFileSync(backup, Buffer.from('not gzip'));
        await expect(verifyBackup(backup, digest('not gzip'))).rejects.toThrow();
        fs.writeFileSync(backup, Buffer.alloc(0));
        await expect(verifyBackup(backup, digest(''))).rejects.toThrow();
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('private manifest is atomic, mode 0600, canonical and SHA-confirmed; repo path is rejected', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medical-reconcile-'));
    const file = path.join(directory, 'manifest.json');
    try {
        const manifest = { version: 1, rows: [{ sourceRecordId: 1, patientId: synthetic('P1') }] };
        if (process.platform === 'win32') {
            expect(() => writePrivateManifest(file, manifest)).toThrow('MANIFEST_MODE_UNENFORCEABLE');
            expect(fs.existsSync(file)).toBe(false);
            expect(fs.readdirSync(directory)).toEqual([]);
            expect(() => assertExternalPath(path.resolve(__dirname, '../../../..', 'unsafe.json'))).toThrow();
            return;
        }
        const hash = writePrivateManifest(file, manifest);
        expect(fs.existsSync(file)).toBe(true);
        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
        expect(fs.readdirSync(directory)).toEqual(['manifest.json']);
        expect(fs.readFileSync(file, 'utf8')).toBe(canonicalJson(manifest));
        expect(readPrivateManifest(file, hash)).toEqual(manifest);
        expect(() => readPrivateManifest(file, digest('wrong'))).toThrow();
        fs.appendFileSync(file, ' ');
        expect(() => readPrivateManifest(file, sha256(fs.readFileSync(file)))).toThrow();
        expect(() => assertExternalPath(path.resolve(__dirname, '../../../..', 'unsafe.json'))).toThrow();
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('private manifest publication cannot overwrite a destination won by another writer', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medical-reconcile-'));
    const file = path.join(directory, 'manifest.json');
    const rename = fs.renameSync, link = fs.linkSync, stat = fs.statSync;
    const competitor = () => { if (!fs.existsSync(file)) fs.writeFileSync(file, 'competing private manifest'); };
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => { competitor(); return rename(from, to); });
    const linkSpy = jest.spyOn(fs, 'linkSync').mockImplementation((from, to) => { competitor(); return link(from, to); });
    const statSpy = jest.spyOn(fs, 'statSync').mockImplementation((target, ...args) => {
        const result = stat(target, ...args);
        return process.platform === 'win32' && String(target).startsWith(directory)
            ? { ...result, mode: (result.mode & ~0o777) | 0o600 } : result;
    });
    try {
        expect(() => writePrivateManifest(file, { rows: [{ sourceRecordId: 1 }] })).toThrow('MANIFEST_EXISTS');
        expect(fs.readFileSync(file, 'utf8')).toBe('competing private manifest');
        expect(fs.readdirSync(directory)).toEqual(['manifest.json']);
    } finally {
        statSpy.mockRestore(); linkSpy.mockRestore(); renameSpy.mockRestore();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
