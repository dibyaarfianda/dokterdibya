'use strict';

jest.mock('../../db', () => ({ query: jest.fn() }));
const db = require('../../db');
const { resolve, ResolutionError } = require('../../services/CommAssessmentResolver');

const source = { facility: 'melinda', no_rm: 'HOSP-1', nik: '1234 5678 9012 3456', case_id: 'med0000001234' };
function fixture({ external = [{ patient_id: 'P1' }], records = [], intake = [], jobs = [], visits = [{ mr_id: 'DRD123' }], sections = [] } = {}) {
    db.query.mockImplementation(async sql => {
        if (sql.includes('FROM patient_external_ids')) return [external];
        if (sql.includes('FROM patient_records')) return [records];
        if (sql.includes('FROM patient_intake_submissions')) return [intake];
        if (sql.includes('FROM medify_import_jobs')) return [jobs];
        if (sql.includes('FROM sunday_clinic_records')) return [visits];
        if (sql.includes('FROM medical_records')) return [sections];
        throw new Error('Unexpected SQL');
    });
}
beforeEach(() => jest.clearAllMocks());
test('malformed source and unsupported facility fail before database access', async () => {
    await expect(resolve(null)).rejects.toMatchObject({ statusCode: 400 });
    await expect(resolve({ facility: 'klinik_private', no_rm: 'HOSP-1' })).rejects.toMatchObject({ statusCode: 400 });
    expect(db.query).not.toHaveBeenCalled();
});
test('missing strong evidence and visit fail closed', async () => {
    fixture({ external: [] });
    await expect(resolve(source)).rejects.toMatchObject({ statusCode: 404 });
    fixture({ visits: [] });
    await expect(resolve(source)).rejects.toMatchObject({ statusCode: 404 });
});
test('disagreeing patient evidence and multiple visits are conflicts', async () => {
    fixture({ jobs: [{ patient_id: 'P2' }] });
    await expect(resolve(source)).rejects.toMatchObject({ statusCode: 409 });
    fixture({ visits: [{ mr_id: 'DRD123' }, { mr_id: 'DRD124' }] });
    await expect(resolve(source)).rejects.toMatchObject({ statusCode: 409 });
});
test('safe exact match returns canonical scope and section without source identifiers', async () => {
    fixture({ records: [{ patient_id: 'P1' }], sections: [{ id: 7, version: 2, record_data: '{"comm":{"a":1}}' }] });
    expect(await resolve(source)).toEqual({ patientId: 'P1', mrId: 'DRD123', anamnesa: { id: 7, version: 2, data: { comm: { a: 1 } } } });
    expect(db.query.mock.calls.find(([sql]) => sql.includes('FROM sunday_clinic_records'))[1]).toEqual(['P1', 'rsia_melinda']);
});
test('duplicate section or invalid stored JSON fails closed', async () => {
    fixture({ sections: [{ id: 7 }, { id: 8 }] });
    await expect(resolve(source)).rejects.toMatchObject({ statusCode: 409 });
    fixture({ sections: [{ id: 7, version: 1, record_data: 'broken' }] });
    await expect(resolve(source)).rejects.toBeInstanceOf(ResolutionError);
});

test.each([
    ['melinda', 'rsia_melinda'],
    ['gambiran', 'rsud_gambiran'],
    ['bhayangkara', 'rs_bhayangkara']
])('case-only %s evidence binds the mapped Medify location %s', async (facility, location) => {
    const caseId = 'med0000001234';
    db.query.mockImplementation(async (sql, params) => {
        if (sql.includes('FROM medify_import_jobs')) return [params[0] === location && params[1] === caseId ? [{ patient_id: 'P1' }] : []];
        if (sql.includes('FROM sunday_clinic_records')) return [[{ mr_id: 'DRD123' }]];
        if (sql.includes('FROM medical_records')) return [[]];
        throw new Error('Unexpected SQL');
    });
    await expect(resolve({ facility, case_id: caseId })).resolves.toEqual({ patientId: 'P1', mrId: 'DRD123', anamnesa: null });
    expect(db.query.mock.calls.find(([sql]) => sql.includes('FROM medify_import_jobs'))[1]).toEqual([location, caseId]);
});

test('mapped Medify case patient conflicting with exact external identity is rejected', async () => {
    db.query.mockImplementation(async (sql, params) => {
        if (sql.includes('FROM patient_external_ids')) return [[{ patient_id: 'P1' }]];
        if (sql.includes('FROM medify_import_jobs')) return [params[0] === 'rsia_melinda' ? [{ patient_id: 'P2' }] : []];
        throw new Error('Visit lookup must not occur for conflicting identity');
    });
    await expect(resolve({ facility: 'melinda', no_rm: 'HOSP-1', case_id: 'med0000001234' }))
        .rejects.toMatchObject({ statusCode: 409, code: 'PATIENT_AMBIGUOUS' });
});
