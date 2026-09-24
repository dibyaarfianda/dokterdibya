'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockDb = require('../helpers/medicalRecordDatabase')();
jest.mock('../../db', () => mockDb);
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn() }));
jest.mock('../../services/activityLogger', () => ({ logFromRequest: jest.fn(), ACTIONS: {} }));
jest.mock('../../services/PatientDocumentSyncService', () => ({ syncPenunjangLabResults: jest.fn(), mutatePenunjangDocuments: jest.fn() }));
jest.mock('../../services/SundayClinicSaveEffects', () => ({
    mutateSundayClinicDocuments: jest.fn(),
    afterSundayClinicSave: jest.fn()
}));
jest.mock('../../realtime-sync', () => ({
    broadcast: jest.fn(event => { mockDb.events.push({ kind: 'broadcast', event }); }),
    broadcastToRoom: jest.fn((room, event) => { mockDb.events.push({ kind: 'patient-broadcast', room, event }); })
}));
const logger = require('../../utils/logger');
const { mutatePenunjangDocuments } = require('../../services/PatientDocumentSyncService');
const { mutateSundayClinicDocuments, afterSundayClinicSave } = require('../../services/SundayClinicSaveEffects');
const { ROLE_IDS, ROLE_NAMES } = require('../../constants/roles');
const router = require('../../routes/medical-records');
const app = express();
app.use(express.json());
app.use(router);
const token = role => jwt.sign({ id: 'verified-actor', name: 'Synthetic Staff', role: ROLE_NAMES[role], role_id: ROLE_IDS[role] }, process.env.JWT_SECRET);
const auth = (req, role = 'DOKTER') => req.set('Authorization', `Bearer ${token(role)}`);
const create = (extra = {}, role) => auth(request(app).post('/api/medical-records'), role).send({ patientId: 'fixture-a', mrId: 'TEST001', type: 'usg', data: { nested: { a: 'old', b: 'old' }, notes: 'old', nullable: 'old' }, ...extra });
const patch = (id, changes, version = 1) => auth(request(app).patch(`/api/medical-records/${id}`)).set('If-Match', `"${version}"`).send({ changes });
const reset = (extra = {}, version = 1, role) => auth(request(app).post('/api/medical-records/TEST001/sections/usg/reset'), role).set('If-Match', `"${version}"`).send({ patientId: 'fixture-a', ...extra });
const record = () => mockDb.state().records[0];

beforeEach(() => {
    mockDb.reset(); mockDb.failure = null; jest.clearAllMocks();
    mutateSundayClinicDocuments.mockImplementation((connection, row) => row.record_type === 'penunjang'
        ? mutatePenunjangDocuments(connection, { patientId: row.patient_id, mrId: row.mr_id,
            files: row.record_data.files, actorUserId: row.actor.doctorId })
        : undefined);
    afterSundayClinicSave.mockImplementation(async result => {
        if (result.documentChange) require('../../realtime-sync').broadcastToRoom(`patient:${result.data.patient_id}`, {
            type: 'document:patient_updated', document_type: result.recordType === 'penunjang' ? 'lab_result' : result.recordType,
            added: result.documentChange.added, removed: result.documentChange.removed
        });
    });
});

test('USG metadata failure rolls back the versioned clinical write', async () => {
    mutateSundayClinicDocuments.mockRejectedValueOnce(new Error('metadata unavailable'));
    const response = await create({ type: 'usg', data: { photos: [] } });
    expect(response.status).toBe(500);
    expect(mockDb.state().records).toHaveLength(0);
    expect(mockDb.state().revisions).toHaveLength(0);
    expect(afterSundayClinicSave).not.toHaveBeenCalled();
});

test('Sunday postcommit effects follow the committed versioned save', async () => {
    afterSundayClinicSave.mockImplementationOnce(async () => {
        mockDb.events.push({ kind: 'sunday-postcommit' });
    });
    const response = await create({ type: 'usg', data: { photos: [] } });
    expect(response.status).toBe(201);
    expect(mockDb.events.findIndex(event => event.kind === 'sunday-postcommit'))
        .toBeGreaterThan(mockDb.events.findIndex(event => event.kind === 'commit'));
    expect(mutateSundayClinicDocuments).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        mr_id: 'TEST001', patient_id: 'fixture-a', record_type: 'usg'
    }));
});

test('penunjang metadata failure rolls back the clinical create and emits no refresh', async () => {
    mutatePenunjangDocuments.mockRejectedValueOnce(new Error('metadata unavailable'));
    const response = await create({ type: 'penunjang', data: { files: [] } });
    expect(response.status).toBe(500);
    expect(mockDb.state().records).toHaveLength(0);
    expect(mockDb.state().revisions).toHaveLength(0);
    expect(mockDb.events.some(event => event.kind === 'broadcast')).toBe(false);
});

test('penunjang patient refresh follows committed metadata and omits identifiers from payload', async () => {
    mutatePenunjangDocuments.mockResolvedValueOnce({ added: 1, removed: 0 });
    const response = await create({ type: 'penunjang', data: { files: [] } });
    expect(response.status).toBe(201);
    const commit = mockDb.events.findIndex(event => event.kind === 'commit');
    const refresh = mockDb.events.findIndex(event => event.kind === 'patient-broadcast');
    expect(refresh).toBeGreaterThan(commit);
    expect(mockDb.events[refresh].event).toEqual({ type: 'document:patient_updated', document_type: 'lab_result', added: 1, removed: 0 });
});

test('postcommit refresh failure does not turn a persisted penunjang save into a retryable error', async () => {
    const realtime = require('../../realtime-sync');
    mutatePenunjangDocuments.mockResolvedValueOnce({ added: 1, removed: 0 });
    realtime.broadcastToRoom.mockImplementationOnce(() => { throw new Error('transport unavailable'); });
    const response = await create({ type: 'penunjang', data: { files: [] } });
    expect(response.status).toBe(201);
    expect(mockDb.state().records).toHaveLength(1);
});

test('create requires canonical MR and rejects unknown or mismatched patient scope', async () => {
    expect((await create({ mrId: undefined })).status).toBe(400);
    expect((await create({ mrId: 'TEST999' })).status).toBe(404);
    expect((await create({ patientId: 'fixture-b' })).status).toBe(409);
    expect(mockDb.state().records).toHaveLength(0);
});

test('create trusts verified actor, returns ETag, appends revision and serializes first-create', async () => {
    const responses = await Promise.all([create({ doctorId: 'forged', doctorName: 'forged' }), create()]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const created = responses.find(r => r.status === 201);
    expect(created.headers.etag).toBe('"1"');
    expect(created.body.data.version).toBe(1);
    expect(record().doctor_id).toBeNull(); // synthetic nonnumeric actor cannot impersonate an integer doctor ID
    expect(record().doctor_name).toBe('Synthetic Staff');
    expect(mockDb.state().records).toHaveLength(1);
    expect(mockDb.state().revisions).toHaveLength(1);
    expect(mockDb.state().revisions[0]).toMatchObject({ actor_id: 'verified-actor', event_type: 'create', from_version: 0, to_version: 1 });
});

test.each(['ADMIN', 'MANAGERIAL', 'FRONT_OFFICE'])('reset permission denies %s before mutation', async role => {
    expect((await reset({}, 1, role)).status).toBe(403);
    expect(mockDb.events.some(e => e.kind === 'begin')).toBe(false);
});

test('reset rejects anonymous and patient principals', async () => {
    expect((await request(app).post('/api/medical-records/TEST001/sections/usg/reset').send({})).status).toBe(401);
    const patient = jwt.sign({ id: 'fixture-a', role: 'patient', user_type: 'patient', role_id: ROLE_IDS.DOKTER }, process.env.JWT_SECRET);
    expect((await request(app).post('/api/medical-records/TEST001/sections/usg/reset').set('Authorization', `Bearer ${patient}`).send({})).status).toBe(403);
});

test.each(['DOKTER', 'BIDAN'])('reset allows %s with exact scope and preserves null-MR collateral', async role => {
    await create();
    mockDb.state().records.push({ ...record(), id: 99, mr_id: null }, { ...record(), id: 100, mr_id: 'TEST002' });
    mockDb.state().documents.push(
        { id: 1, patient_id: 'fixture-a', mr_id: 'TEST001', document_type: 'usg_photo' },
        { id: 2, patient_id: 'fixture-a', mr_id: null, document_type: 'usg_photo' },
        { id: 3, patient_id: 'fixture-a', mr_id: 'TEST002', document_type: 'usg_photo' },
        { id: 4, patient_id: 'fixture-a', mr_id: 'TEST001', document_type: 'lab_result' });
    const response = await reset({}, 1, role);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, deletedCount: 1, version: 2 });
    expect(response.headers.etag).toBe('"2"');
    expect(mockDb.state().records.map(r => r.id)).toEqual([99, 100]);
    expect(mockDb.state().documents.map(r => r.id)).toEqual([2, 3, 4]);
    expect(mockDb.state().revisions[1]).toMatchObject({ event_type: 'reset', from_version: 1, to_version: 2, after_snapshot: null });
});

test('patch requires version; rejects malformed version and missing record', async () => {
    await create();
    expect((await auth(request(app).patch('/api/medical-records/1')).send({ changes: [] })).status).toBe(428);
    expect((await auth(request(app).patch('/api/medical-records/1')).set('If-Match', 'W/"1"').send({ changes: [] })).status).toBe(400);
    expect((await patch(999, [{ path: '/notes', before: 'old', after: 'new' }])).status).toBe(404);
});

test('external section type claim cannot patch a different section', async () => {
    await create();
    const response = await auth(request(app).patch('/api/medical-records/1'))
        .set('If-Match', '"1"').send({ mrId: 'TEST001', recordType: 'penunjang',
            changes: [{ path: '/notes', before: 'old', after: 'wrong-section' }] });
    expect(response.status).toBe(404);
    expect(record().version).toBe(1);
});

test('patch preserves disjoint stale edits and deliberate empty/null values', async () => {
    await create();
    expect((await patch(1, [{ path: '/nested/a', before: 'old', after: 'staff-a' }])).status).toBe(200);
    const response = await patch(1, [{ path: '/nested/b', before: 'old', after: 'staff-b' }, { path: '/notes', before: 'old', after: '' }, { path: '/nullable', before: 'old', after: null }]);
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"3"');
    expect(JSON.parse(record().record_data)).toEqual({ nested: { a: 'staff-a', b: 'staff-b' }, notes: '', nullable: null });
    expect(mockDb.state().revisions[2].before_snapshot).toContain('staff-a');
});

test.each([
    ['/nested/a', 'old', 'second'],
    ['/nested', { a: 'old', b: 'old' }, { a: 'second', b: 'second' }],
    ['', { nested: { a: 'old', b: 'old' }, notes: 'old', nullable: 'old' }, {}]
])('stale overlapping pointer %s conflicts without write', async (path, before, after) => {
    await create();
    await patch(1, [{ path: '/nested/a', before: 'old', after: 'first' }]);
    expect((await patch(1, [{ path, before, after }])).status).toBe(409);
    expect(record().version).toBe(2);
});

test('stale descendant conflicts after an ancestor replacement even when leaf unchanged', async () => {
    await create();
    await patch(1, [{ path: '/nested', before: { a: 'old', b: 'old' }, after: { a: 'old', b: 'changed' } }]);
    expect((await patch(1, [{ path: '/nested/a', before: 'old', after: 'second' }])).status).toBe(409);
});

test('unavailable base or unversioned server mutation fails 412', async () => {
    await create();
    await patch(1, [{ path: '/notes', before: 'old', after: 'new' }]);
    mockDb.state().revisions = [];
    expect((await patch(1, [{ path: '/nested/a', before: 'old', after: 'new' }])).status).toBe(412);
});

test('legacy MR-only backfill revision forces a stale client to reload instead of guessing a clinical base', async () => {
    await create();
    record().version = 2;
    mockDb.state().revisions.push({ medical_record_id: record().id, patient_id: record().patient_id,
        mr_id: record().mr_id, record_type: record().record_type, event_type: 'legacy_backfill',
        actor_id: 'legacy-reconciliation', from_version: 1, to_version: 2,
        before_snapshot: record().record_data, after_snapshot: record().record_data, changed_paths: '[]' });
    expect((await patch(1, [{ path: '/notes', before: 'old', after: 'stale' }])).status).toBe(412);
    expect(record().record_data).toContain('"notes":"old"');
});

test.each(['INSERT INTO medical_record_revisions', 'DELETE FROM medical_records', 'DELETE FROM patient_documents'])('reset rolls back medical/doc state on %s failure and emits nothing', async failure => {
    await create();
    mockDb.state().documents.push({ id: 1, patient_id: 'fixture-a', mr_id: 'TEST001', document_type: 'usg_photo' });
    const before = JSON.stringify(mockDb.state());
    mockDb.events.length = 0;
    mockDb.failure = failure;
    expect((await reset()).status).toBe(500);
    expect(JSON.stringify(mockDb.state())).toBe(before);
    expect(mockDb.events.some(e => e.kind === 'rollback')).toBe(true);
    expect(mockDb.events.some(e => e.kind === 'broadcast')).toBe(false);
});

test('post-commit event contains no identifiers or clinical fields; rollback never emits', async () => {
    await create();
    const emitted = mockDb.events.findIndex(e => e.kind === 'broadcast');
    expect(emitted).toBeGreaterThan(mockDb.events.findIndex(e => e.kind === 'commit'));
    expect(mockDb.events[emitted].event).toEqual({ type: 'medical_record:changed', action: 'create', recordType: 'usg', count: 1 });
    const operational = logger.info.mock.calls.filter(([message]) => message === 'Medical record mutation committed');
    expect(operational).toHaveLength(1);
    expect(JSON.stringify(operational)).not.toMatch(/fixture|TEST001|verified-actor|Synthetic|nested/);
});

test('reset/recreate never reuses prior ETag version', async () => {
    await create(); await reset();
    const response = await create();
    expect(response.headers.etag).toBe('"3"');
    expect((await reset({}, 1)).status).toBe(412);
});

test('legacy by-type adapter cannot broaden scope and direct ID mutations are retired', async () => {
    await create();
    expect((await auth(request(app).delete('/api/medical-records/by-type/usg')).query({ patientId: 'fixture-a' }).set('If-Match', '"1"')).status).toBe(400);
    expect((await auth(request(app).delete('/api/medical-records/1'))).status).toBe(410);
    expect((await auth(request(app).put('/api/medical-records/1')).send({ data: {} })).status).toBe(410);
    expect(mockDb.state().records).toHaveLength(1);
    expect((await auth(request(app).delete('/api/medical-records/by-type/usg')).query({ patientId: 'fixture-a', mrId: 'TEST001' }).set('If-Match', '"1"')).status).toBe(200);
});

test('reset rejects missing patient, wrong patient, unsupported section and missing row', async () => {
    await create();
    expect((await reset({ patientId: undefined })).status).toBe(400);
    expect((await reset({ patientId: 'fixture-b' })).status).toBe(409);
    expect((await auth(request(app).post('/api/medical-records/TEST001/sections/anamnesa/reset')).set('If-Match', '"1"').send({ patientId: 'fixture-a' })).status).toBe(400);
    await reset();
    expect((await reset()).status).toBe(404);
});

test('RFC 6901 escaping and explicitly absent field differ from null', async () => {
    await create({ data: { 'a/b': { '~key': 'old' }, nullable: null } });
    expect((await patch(1, [{ path: '/a~1b/~0key', before: 'old', after: '' }])).status).toBe(200);
    expect((await patch(1, [{ path: '/missing', before: null, after: 'new' }], 2)).status).toBe(409);
    expect((await patch(1, [{ path: '/nullable', before: null, beforeExists: false, after: 'new' }], 2)).status).toBe(409);
    expect((await patch(1, [{ path: '/missing', before: null, beforeExists: false, after: null }], 2)).status).toBe(200);
    expect(JSON.parse(record().record_data)).toEqual({ 'a/b': { '~key': '' }, nullable: null, missing: null });
});

test.each(['/nested/~2', '/__proto__/polluted', '/constructor/prototype/polluted', '/missing/a'])('invalid pointer %s cannot mutate state', async path => {
    await create();
    expect((await patch(1, [{ path, before: null, beforeExists: false, after: 'unsafe' }])).status).toBe(400);
    expect(record().version).toBe(1);
    expect({}.polluted).toBeUndefined();
});

test('arrays conflict atomically for stale distinct-index edits', async () => {
    await create({ data: { photos: ['a', 'b'] } });
    expect((await patch(1, [{ path: '/photos/0', before: 'a', after: 'first' }])).status).toBe(200);
    expect((await patch(1, [{ path: '/photos/1', before: 'b', after: 'second' }])).status).toBe(409);
    expect(JSON.parse(record().record_data).photos).toEqual(['first', 'b']);
});

test('overlap detection survives an edit-revert ABA history', async () => {
    await create();
    await patch(1, [{ path: '/notes', before: 'old', after: 'temporary' }]);
    await patch(1, [{ path: '/notes', before: 'temporary', after: 'old' }], 2);
    expect((await patch(1, [{ path: '/notes', before: 'old', after: 'stale' }])).status).toBe(409);
});

test('a discontinuous or corrupt revision cannot be used as a stale base', async () => {
    await create();
    await patch(1, [{ path: '/notes', before: 'old', after: 'changed' }]);
    mockDb.state().revisions[1].before_snapshot = '{invalid';
    expect((await patch(1, [{ path: '/nested/a', before: 'old', after: 'new' }])).status).toBe(412);
    expect(record().version).toBe(2);
});

test('revision history whose last snapshot differs from stored data is unavailable', async () => {
    await create();
    await patch(1, [{ path: '/notes', before: 'old', after: 'changed' }]);
    record().record_data = JSON.stringify({ nested: { a: 'bypass', b: 'old' }, notes: 'changed', nullable: 'old' });
    expect((await patch(1, [{ path: '/nullable', before: 'old', after: null }])).status).toBe(412);
});

test('patch cannot address detached null-MR records or mismatched patient scope', async () => {
    await create();
    mockDb.state().records.push({ ...record(), id: 98, mr_id: null });
    expect((await patch(98, [{ path: '/notes', before: 'old', after: 'new' }])).status).toBe(404);
    expect((await auth(request(app).patch('/api/medical-records/1')).set('If-Match', '"1"').send({ patientId: 'fixture-b', changes: [{ path: '/notes', before: 'old', after: 'new' }] })).status).toBe(409);
});

test('resume reset deletes only exact resume document metadata', async () => {
    await create({ type: 'resume_medis' });
    mockDb.state().documents.push(
        { id: 1, patient_id: 'fixture-a', mr_id: 'TEST001', document_type: 'resume_medis' },
        { id: 2, patient_id: 'fixture-a', mr_id: 'TEST002', document_type: 'resume_medis' },
        { id: 3, patient_id: 'fixture-a', mr_id: 'TEST001', document_type: 'usg_photo' });
    const response = await auth(request(app).post('/api/medical-records/TEST001/sections/resume_medis/reset')).set('If-Match', '"1"').send({ patientId: 'fixture-a' });
    expect(response.status).toBe(200);
    expect(mockDb.state().documents.map(d => d.id)).toEqual([2, 3]);
});

test('reset missing precondition and stale version leave records untouched', async () => {
    await create();
    expect((await auth(request(app).post('/api/medical-records/TEST001/sections/usg/reset')).send({ patientId: 'fixture-a' })).status).toBe(428);
    expect((await reset({}, 2)).status).toBe(412);
    expect(record().version).toBe(1);
});

test('transactional document hook rolls back create and patch instead of swallowing metadata failure', async () => {
    const service = require('../../services/MedicalRecordService');
    const principal = { id: 'verified-actor', name: 'Synthetic Staff' };
    const failingHook = async connection => {
        await connection.query('DELETE FROM patient_documents WHERE patient_id = ? AND mr_id = ? AND document_type IN (?)', ['fixture-a', 'TEST001', ['usg_photo']]);
        throw new Error('Injected metadata failure');
    };
    await expect(service.create({ mrId: 'TEST001', recordType: 'usg', data: {}, actor: principal, mutateDocuments: failingHook })).rejects.toThrow('Injected metadata failure');
    expect(mockDb.state().records).toHaveLength(0);
    expect(mockDb.state().revisions).toHaveLength(0);
    await create();
    mockDb.events.length = 0;
    await expect(service.patch({ id: 1, ifMatch: '"1"', changes: [{ path: '/notes', before: 'old', after: 'new' }], actor: principal, mutateDocuments: failingHook })).rejects.toThrow('Injected metadata failure');
    expect(record().version).toBe(1);
    expect(mockDb.events.some(e => e.kind === 'broadcast')).toBe(false);
});

test('realtime failure after commit cannot turn a persisted save into a retryable error', async () => {
    require('../../realtime-sync').broadcast.mockImplementationOnce(() => { throw new Error('emit failed'); });
    expect((await create()).status).toBe(201);
    expect(record().version).toBe(1);
    expect(mockDb.events.some(e => e.kind === 'rollback')).toBe(false);
});

test('nonlocking locator cannot authorize a record whose patient changed before the visit lock', async () => {
    await create();
    const original = mockDb.getConnection;
    mockDb.getConnection = async () => {
        record().patient_id = 'fixture-b';
        mockDb.state().visits[0].patient_id = 'fixture-b';
        return original();
    };
    try {
        expect((await patch(1, [{ path: '/notes', before: 'old', after: 'new' }])).status).toBe(404);
        expect(record().version).toBe(1);
    } finally { mockDb.getConnection = original; }
});

describe('review round 1 fixed reset role boundary and request privacy', () => {
    const mrMarker = 'PRIVATERESET999';
    const patientMarker = 'PRIVATE_PATIENT_SENTINEL';
    const principal = (role, extra = {}) => ({ id: 'verified-actor', name: 'Synthetic Staff', role: ROLE_NAMES[role], role_id: ROLE_IDS[role], ...extra });
    const resetRequest = (legacy, actor, mrId = 'TEST001', patientId = 'fixture-a', target = app) => {
        let req = legacy
            ? request(target).delete('/api/medical-records/by-type/usg').query({ mrId, patientId })
            : request(target).post(`/api/medical-records/${mrId}/sections/usg/reset`).send({ patientId });
        if (actor) req = req.set('Authorization', `Bearer ${jwt.sign(actor, process.env.JWT_SECRET)}`);
        return req.set('If-Match', '"1"');
    };

    test.each([false, true])('canonical/legacy=%s denies nonclinical overrides and unexpected permission before any transaction', async legacy => {
        await create();
        mockDb.state().documents.push({ id: 1, patient_id: 'fixture-a', mr_id: 'TEST001', document_type: 'usg_photo' });
        const cases = [
            principal('ADMIN', { is_superadmin: true, role: ROLE_NAMES.DOKTER }),
            principal('ADMIN', { role: ROLE_NAMES.DOKTER }),
            principal('FRONT_OFFICE', { is_superadmin: true }),
            principal('MANAGERIAL'),
            principal('DOKTER', { role_id: undefined, is_superadmin: true }),
            principal('DOKTER', { role_id: String(ROLE_IDS.DOKTER) })
        ];
        const query = mockDb.query;
        // Simulate an accidental policy grant: fixed clinical role policy must
        // deny these principals even if the configurable permission grants access.
        mockDb.query = async (sql, params) => sql.includes('FROM role_permissions')
            ? [[{ name: 'medical_records.reset_section' }]] : query(sql, params);
        try {
            for (const actor of cases) {
                const before = JSON.stringify(mockDb.state());
                mockDb.events.length = 0;
                expect((await resetRequest(legacy, actor)).status).toBe(403);
                expect(mockDb.events.some(e => ['begin', 'commit', 'broadcast'].includes(e.kind))).toBe(false);
                expect(JSON.stringify(mockDb.state())).toBe(before);
            }
        } finally { mockDb.query = query; }
    });

    test.each(['ADMIN', 'MANAGERIAL', 'FRONT_OFFICE'])('direct service reset rejects %s with superadmin and rewritten role', async role => {
        await create();
        mockDb.events.length = 0;
        const service = require('../../services/MedicalRecordService');
        const before = JSON.stringify(mockDb.state());
        await expect(service.reset({ mrId: 'TEST001', patientId: 'fixture-a', recordType: 'usg', ifMatch: '"1"',
            actor: principal(role, { role: ROLE_NAMES.DOKTER, is_superadmin: true }) })).rejects.toMatchObject({ statusCode: 403 });
        expect(mockDb.events.some(e => e.kind === 'begin')).toBe(false);
        expect(JSON.stringify(mockDb.state())).toBe(before);
    });

    test.each(['DOKTER', 'BIDAN'])('legacy reset retains permitted %s success and safe grant logs', async role => {
        mockDb.state().visits[0] = { id: 1, mr_id: mrMarker, patient_id: patientMarker };
        expect((await create({ mrId: mrMarker, patientId: patientMarker })).status).toBe(201);
        Object.values(logger).forEach(fn => fn.mockClear());
        expect((await resetRequest(true, principal(role, { id: patientMarker, name: mrMarker }), mrMarker, patientMarker)).status).toBe(200);
        const output = JSON.stringify(Object.values(logger).flatMap(fn => fn.mock.calls));
        expect(output).not.toContain(mrMarker);
        expect(output).not.toContain(patientMarker);
    });

    test.each([false, true])('canonical/legacy=%s reset keeps MR/patient markers out of every logger level', async legacy => {
        mockDb.state().visits[0] = { id: 1, mr_id: mrMarker, patient_id: patientMarker };
        expect((await create({ mrId: mrMarker, patientId: patientMarker })).status).toBe(201);
        const query = mockDb.query;
        mockDb.query = async (sql, params) => sql.includes('FROM role_permissions') ? [[]] : query(sql, params);
        const attempts = [
            [undefined, 401],
            [{ id: patientMarker, role: 'patient', user_type: 'patient' }, 403],
            [principal('ADMIN', { id: patientMarker, name: mrMarker }), 403],
            // A genuine clinical role without its configured permission exercises
            // requirePermission's denial logger after the fixed-role guard.
            [principal('BIDAN', { id: patientMarker, name: mrMarker }), 403],
            [principal('DOKTER', { id: patientMarker, name: mrMarker }), 200]
        ];
        try {
            for (const [actor, status] of attempts) {
                Object.values(logger).forEach(fn => fn.mockClear());
                mockDb.events.length = 0;
                expect((await resetRequest(legacy, actor, mrMarker, patientMarker)).status).toBe(status);
                const calls = Object.entries(logger).flatMap(([level, fn]) => fn.mock.calls.map(args => ({ level, args })));
                expect(calls.length).toBeGreaterThan(0);
                expect(JSON.stringify(calls)).not.toContain(mrMarker);
                expect(JSON.stringify(calls)).not.toContain(patientMarker);
                if (status !== 200) expect(mockDb.events.some(e => ['begin', 'commit', 'broadcast'].includes(e.kind))).toBe(false);
            }
        } finally { mockDb.query = query; }
    });

    test('unmarked auth endpoints retain their useful nonidentifier log path', async () => {
        const other = express();
        const { verifyStaffToken, requirePermission } = require('../../middleware/auth');
        other.get('/api/operational-status', verifyStaffToken, (req, res) => res.sendStatus(204));
        other.get('/api/operational-permission', verifyStaffToken, requirePermission('operations.manage'), (req, res) => res.sendStatus(204));
        expect((await request(other).get('/api/operational-status')).status).toBe(401);
        expect(logger.warn).toHaveBeenCalledWith('Missing authorization header (staff)', expect.objectContaining({ path: '/api/operational-status' }));
        expect((await auth(request(other).get('/api/operational-permission'), 'ADMIN')).status).toBe(403);
        expect(logger.warn).toHaveBeenCalledWith('Permission denied', expect.objectContaining({ path: '/api/operational-permission', requiredPermissions: ['operations.manage'] }));
    });

    test.each([false, true])('canonical/legacy=%s upstream access/performance and actual server patient guard logs are also private', async legacy => {
        const fs = require('fs');
        const path = require('path');
        const vm = require('vm');
        const server = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
        const guardSource = server.split('// ==================== PATIENT ACCESS BLOCKER ====================')[1]
            .split('// ==================== END PATIENT ACCESS BLOCKER ====================')[0];
        const target = express();
        const { requestLogger, performanceLogger } = require('../../middleware/requestLogger');
        const savedEnv = { slow: process.env.METRICS_LOG_SLOW_REQUESTS, threshold: process.env.METRICS_SLOW_REQUEST_MS, summary: process.env.ENABLE_METRICS_SUMMARY_LOG };
        process.env.METRICS_LOG_SLOW_REQUESTS = 'true';
        process.env.METRICS_SLOW_REQUEST_MS = '0';
        process.env.ENABLE_METRICS_SUMMARY_LOG = 'false';
        const { metricsMiddleware, getMetrics } = require('../../middleware/metrics');
        for (const [key, value] of Object.entries({ METRICS_LOG_SLOW_REQUESTS: savedEnv.slow, METRICS_SLOW_REQUEST_MS: savedEnv.threshold, ENABLE_METRICS_SUMMARY_LOG: savedEnv.summary })) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        target.use(metricsMiddleware, requestLogger, performanceLogger, express.json());
        let blocked = false;
        vm.runInNewContext(guardSource, {
            app: target, require, logger,
            process: { env: { ...process.env, PATIENT_AUTH_BLOCKLIST_ENABLED: 'true' } },
            ...require('../../security/patientRouteAccess'),
            ...require('../../utils/requestAudit'),
            isPatientIdentityBlocked: () => blocked,
            isPatientRequestIpBlocked: async () => false,
            rememberBlockedPatientRequestIp: () => {},
            BLOCKED_PATIENT_MESSAGE: 'Access blocked',
            console: { log: (...args) => logger.info(...args) }
        });
        target.use(router);
        mockDb.state().visits[0] = { id: 1, mr_id: mrMarker, patient_id: patientMarker };
        expect((await create({ mrId: mrMarker, patientId: patientMarker })).status).toBe(201);
        const attempts = [
            [undefined, 401, false],
            [{ id: patientMarker, email: `${patientMarker}@example.test`, role: 'patient', user_type: 'patient' }, 403, false],
            [{ id: patientMarker, email: `${patientMarker}@example.test`, role: 'patient', user_type: 'patient' }, 403, true],
            [principal('ADMIN', { id: patientMarker }), 403, false],
            [principal('DOKTER', { id: patientMarker }), 200, false]
        ];
        for (const [actor, status, blocklisted] of attempts) {
            blocked = blocklisted;
            Object.values(logger).forEach(fn => fn.mockClear());
            mockDb.events.length = 0;
            expect((await resetRequest(legacy, actor, mrMarker, patientMarker, target)).status).toBe(status);
            const output = JSON.stringify(Object.values(logger).flatMap(fn => fn.mock.calls));
            expect(logger.http).toHaveBeenCalled();
            expect(output).not.toContain(mrMarker);
            expect(output).not.toContain(patientMarker);
            if (status !== 200) expect(mockDb.events.some(e => e.kind === 'begin')).toBe(false);
        }
        expect(JSON.stringify(getMetrics())).not.toContain(mrMarker);
        expect(JSON.stringify(getMetrics())).not.toContain(patientMarker);
    });
});
