'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function clientFixture(sectionRow, persistedRow = null) {
    const filename = path.resolve(__dirname, '../../../public/scripts/sunday-clinic/utils/api-client.js');
    const source = fs.readFileSync(filename, 'utf8')
        .replace(/^import .*;\s*$/gm, '')
        .replace('export default new APIClient();', 'globalThis.client = new APIClient();');
    const state = { currentMrId: 'TEST001', medicalRecords: { byType: sectionRow ? { usg: sectionRow } : {} },
        persistedMedicalRecords: { byType: persistedRow ? { usg: persistedRow } : {} }, dirtyRevision: 4 };
    const stateManager = {
        get: key => state[key],
        set: (key, value) => { state[key] = value; },
        replaceSectionData: jest.fn((section, data) => { state.medicalRecords.byType[section] = { ...(state.medicalRecords.byType[section] || {}), data }; }),
        markClean: jest.fn()
    };
    const fetch = jest.fn();
    const context = { API_ENDPOINTS: { RECORDS: '/api/sunday-clinic/records' }, TOKEN_KEY: 'token', stateManager,
        window: { getToken: () => 'synthetic-token' }, localStorage: { setItem: jest.fn() },
        fetch, console: { error: jest.fn() }, globalThis: {} };
    vm.runInNewContext(source, context, { filename });
    return { client: context.globalThis.client, fetch, stateManager, state };
}

function response(status, body, etag) {
    return { ok: status < 400, status, statusText: `HTTP ${status}`,
        headers: { get: name => name.toLowerCase() === 'etag' ? etag : null },
        json: async () => body };
}

describe('Sunday Clinic versioned medical client', () => {
    test('creates only an absent section with canonical MR and retains quoted ETag', async () => {
        const fixture = clientFixture(null);
        fixture.fetch.mockResolvedValue(response(201, { success: true, version: 1,
            data: { id: 7, mr_id: 'TEST001', patient_id: 'fixture-a', record_data: { notes: '' }, version: 1 } }, '"1"'));
        await fixture.client.saveSection('TEST001', 'usg', { notes: '' });
        const [url, options] = fixture.fetch.mock.calls[0];
        expect(url).toBe('/api/medical-records');
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({ mrId: 'TEST001', type: 'usg', data: { notes: '' } });
        expect(fixture.state.medicalRecords.byType.usg.etag).toBe('"1"');
    });

    test('patches changed paths with If-Match and keeps deliberate null and empty string', async () => {
        const fixture = clientFixture({ id: 7, mrId: 'TEST001', patientId: 'fixture-a', version: 3,
            etag: '"3"', data: { notes: 'old', nested: { finding: 'old' }, keep: 1 } });
        fixture.fetch.mockResolvedValue(response(200, { success: true, version: 4,
            data: { id: 7, record_data: { notes: '', nested: { finding: null }, keep: 1 }, version: 4 } }, '"4"'));
        await fixture.client.saveSection('TEST001', 'usg', { notes: '', nested: { finding: null }, keep: 1 });
        const [url, options] = fixture.fetch.mock.calls[0];
        expect(url).toBe('/api/medical-records/7');
        expect(options.method).toBe('PATCH');
        expect(options.headers['If-Match']).toBe('"3"');
        expect(JSON.parse(options.body)).toEqual({ mrId: 'TEST001', patientId: 'fixture-a', recordType: 'usg', changes: [
            { path: '/notes', before: 'old', after: '' },
            { path: '/nested/finding', before: 'old', after: null }
        ] });
        expect(fixture.state.medicalRecords.byType.usg.etag).toBe('"4"');
    });

    test.each([409, 412, 428])('keeps draft and dirty state after HTTP %i', async status => {
        const fixture = clientFixture({ id: 7, mrId: 'TEST001', patientId: 'fixture-a', version: 3,
            etag: '"3"', data: { notes: 'old' } });
        fixture.fetch.mockResolvedValue(response(status, { message: 'Reload section' }));
        await expect(fixture.client.saveSection('TEST001', 'usg', { notes: 'unsaved' })).rejects.toMatchObject({ status });
        expect(fixture.state.medicalRecords.byType.usg.data).toEqual({ notes: 'old' });
        expect(fixture.stateManager.markClean).not.toHaveBeenCalled();
    });

    test('unchanged section performs no write and clears only the same dirty revision', async () => {
        const fixture = clientFixture({ id: 7, version: 3, etag: '"3"', data: { notes: 'same' } });
        const result = await fixture.client.saveSection('TEST001', 'usg', { notes: 'same' });
        expect(result.success).toBe(true);
        expect(fixture.fetch).not.toHaveBeenCalled();
        expect(fixture.stateManager.markClean).toHaveBeenCalledWith(4);
    });

    test('patch compares imported draft with persisted snapshot, not already-updated display state', async () => {
        const row = { id: 7, mrId: 'TEST001', patientId: 'fixture-a', version: 3,
            etag: '"3"', data: { notes: 'imported' } };
        const fixture = clientFixture(row, { ...row, data: { notes: 'previous' } });
        fixture.fetch.mockResolvedValue(response(200, { success: true, version: 4,
            data: { id: 7, mr_id: 'TEST001', patient_id: 'fixture-a', record_data: { notes: 'imported' } } }, '"4"'));
        await fixture.client.saveSection('TEST001', 'usg', { notes: 'imported' });
        expect(fixture.fetch).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fixture.fetch.mock.calls[0][1].body).changes).toEqual([
            { path: '/notes', before: 'previous', after: 'imported' }
        ]);
        expect(fixture.state.persistedMedicalRecords.byType.usg.version).toBe(4);
    });

    test('does not replace a newer local draft when a save completes', async () => {
        const row = { id: 7, mrId: 'TEST001', patientId: 'fixture-a', version: 3,
            etag: '"3"', data: { notes: 'old' } };
        const fixture = clientFixture(row, row);
        fixture.fetch.mockImplementation(async () => {
            fixture.state.dirtyRevision = 5;
            fixture.state.medicalRecords.byType.usg.data = { notes: 'newer draft' };
            return response(200, { success: true, version: 4,
                data: { id: 7, mr_id: 'TEST001', patient_id: 'fixture-a', record_data: { notes: 'submitted' } } }, '"4"');
        });
        await fixture.client.saveSection('TEST001', 'usg', { notes: 'submitted' });
        expect(fixture.state.medicalRecords.byType.usg.data).toEqual({ notes: 'newer draft' });
        expect(fixture.state.persistedMedicalRecords.byType.usg.data).toEqual({ notes: 'submitted' });
        expect(fixture.stateManager.replaceSectionData).not.toHaveBeenCalled();
        expect(fixture.stateManager.markClean).not.toHaveBeenCalled();
    });

    test('reset sends exact MR and patient scope with section ETag', async () => {
        const row = { id: 7, mrId: 'TEST001', patientId: 'fixture-a', version: 3, etag: '"3"', data: { notes: 'old' } };
        const fixture = clientFixture(row, row);
        fixture.fetch.mockResolvedValue(response(200, { success: true, deletedCount: 1, version: 4 }, '"4"'));
        await fixture.client.resetSection('TEST001', 'usg');
        const [url, options] = fixture.fetch.mock.calls[0];
        expect(url).toBe('/api/medical-records/TEST001/sections/usg/reset');
        expect(options.method).toBe('POST');
        expect(options.headers['If-Match']).toBe('"3"');
        expect(JSON.parse(options.body)).toEqual({ patientId: 'fixture-a' });
    });

    test('reset refuses missing version without calling the server', async () => {
        const fixture = clientFixture({ id: 7, mrId: 'TEST001', patientId: 'fixture-a', data: {} });
        await expect(fixture.client.resetSection('TEST001', 'usg')).rejects.toMatchObject({ status: 428 });
        expect(fixture.fetch).not.toHaveBeenCalled();
    });
});
