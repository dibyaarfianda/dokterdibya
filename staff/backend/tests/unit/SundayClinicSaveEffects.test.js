'use strict';

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../services/sunday-clinic/queue', () => ({ updateQueueStatus: jest.fn() }));
jest.mock('../../services/sunday-clinic/shared', () => ({
    MEDIFY_SOAP_SYNC_SECTIONS: new Set(['anamnesa', 'diagnosis', 'usg']),
    sundayClinicMedifySyncQueue: { enqueueDiagnosis: jest.fn() }
}));
jest.mock('../../services/appointmentScheduler', () => ({ autoCompleteOnPayment: jest.fn() }));
jest.mock('../../routes/patient-notifications', () => ({ createPatientNotification: jest.fn() }));
jest.mock('../../realtime-sync', () => ({ broadcast: jest.fn(), broadcastToRoom: jest.fn() }));
jest.mock('../../services/PatientDocumentSyncService', () => ({ mutatePenunjangDocuments: jest.fn() }));

const db = require('../../db');
const { updateQueueStatus } = require('../../services/sunday-clinic/queue');
const { sundayClinicMedifySyncQueue } = require('../../services/sunday-clinic/shared');
const scheduler = require('../../services/appointmentScheduler');
const { createPatientNotification } = require('../../routes/patient-notifications');
const realtime = require('../../realtime-sync');
const { mutatePenunjangDocuments } = require('../../services/PatientDocumentSyncService');
const { mutateSundayClinicDocuments, afterSundayClinicSave } = require('../../services/SundayClinicSaveEffects');

const scoped = (recordType, recordData = {}, extra = {}) => ({
    id: 17, patient_id: 'fixture-a', mr_id: 'TEST001', record_type: recordType,
    record_data: recordData, visitId: 1, visitStatus: 'draft', visitLocation: 'klinik_private',
    actor: { id: 'staff-1', doctorId: 3, name: 'Staff Fixture' }, ...extra
});
const result = (recordType, recordData = {}, extra = {}) => ({
    action: 'patch', recordType, version: 2, visitLocation: 'klinik_private',
    data: scoped(recordType, recordData), ...extra
});

beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue([[]]);
    mutatePenunjangDocuments.mockResolvedValue({ added: 0, removed: 0 });
});

test('USG document additions and removals use the supplied clinical transaction without precommit notification', async () => {
    const statements = [];
    const connection = { query: jest.fn(async (sql, params) => {
        statements.push({ sql, params });
        if (sql.includes('SELECT id, file_url FROM patient_documents')) return [[
            { id: 4, file_url: 'https://fixture.invalid/old.jpg' },
            { id: 5, file_url: 'https://fixture.invalid/keep.jpg' }
        ]];
        return [{ affectedRows: 1 }];
    }) };
    const change = await mutateSundayClinicDocuments(connection, scoped('usg', { photos: [
        { url: 'https://fixture.invalid/keep.jpg' },
        { url: 'https://fixture.invalid/new.jpg', name: 'USG Baru', key: 'new-key' }
    ] }));
    expect(change).toEqual({ added: 1, removed: 1, documentType: 'usg_photo' });
    expect(statements.find(entry => entry.sql.includes('DELETE FROM patient_documents')).params).toEqual([[4]]);
    expect(statements.find(entry => entry.sql.includes('INSERT INTO patient_documents')).params).toContain('https://fixture.invalid/new.jpg');
    expect(createPatientNotification).not.toHaveBeenCalled();
    expect(realtime.broadcastToRoom).not.toHaveBeenCalled();
});

test('resume publication records first publish in the transaction and blank content does not publish', async () => {
    const connection = { query: jest.fn(async sql => {
        if (sql.includes('SELECT full_name FROM patients')) return [[{ full_name: 'Synthetic Patient' }]];
        if (sql.includes('SELECT id FROM patient_documents')) return [[]];
        return [{ affectedRows: 1 }];
    }) };
    const change = await mutateSundayClinicDocuments(connection, scoped('resume_medis', { resume: 'Synthetic resume' }));
    expect(change).toEqual({ added: 1, removed: 0, documentType: 'resume_medis' });
    expect(connection.query.mock.calls.some(([sql, params]) =>
        sql.includes('INSERT INTO patient_documents') && params.some(value => typeof value === 'string' && value.includes('Synthetic resume')))).toBe(true);
    connection.query.mockClear();
    expect(await mutateSundayClinicDocuments(connection, scoped('resume_medis', { resume: '' }))).toBeUndefined();
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('patient_documents'))).toBe(false);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes("SET status = 'finalized'"))).toBe(true);
});

test('penunjang interpretation is upserted inside the same transaction as lab files', async () => {
    const connection = { query: jest.fn(async sql => {
        if (sql.includes('SELECT id FROM patient_documents')) return [[]];
        return [{ affectedRows: 1 }];
    }) };
    mutatePenunjangDocuments.mockResolvedValue({ added: 1, removed: 0 });
    const change = await mutateSundayClinicDocuments(connection, scoped('penunjang', {
        files: [{ url: 'https://fixture.invalid/lab.pdf' }], interpretation: 'Synthetic interpretation'
    }));
    expect(change).toEqual({ added: 1, removed: 0, documentType: 'lab_result' });
    expect(mutatePenunjangDocuments).toHaveBeenCalledWith(connection, {
        patientId: 'fixture-a', mrId: 'TEST001', files: [{ url: 'https://fixture.invalid/lab.pdf' }], actorUserId: 3
    });
    expect(connection.query.mock.calls.some(([sql, params]) =>
        sql.includes('INSERT INTO patient_documents') && sql.includes('lab_interpretation') &&
        params.some(value => typeof value === 'string' && value.includes('Synthetic interpretation')))).toBe(true);
});

test('clinic anamnesa updates queue after save but never queues Medify', async () => {
    await afterSundayClinicSave(result('anamnesa'), { user: { id: 'staff-1', name: 'Staff Fixture' } });
    expect(updateQueueStatus).toHaveBeenCalledWith('TEST001', 'anamnesa');
    expect(sundayClinicMedifySyncQueue.enqueueDiagnosis).not.toHaveBeenCalled();
    expect(realtime.broadcast).toHaveBeenCalledWith(expect.objectContaining({
        type: 'medical_record:updated', section: 'anamnesa'
    }));
    expect(realtime.broadcast.mock.calls[0][0]).not.toHaveProperty('mr_id');
});

test('Melinda diagnosis queues Medify unless the save explicitly skips sync', async () => {
    const saved = result('diagnosis', { diagnosis_utama: 'Synthetic diagnosis' }, { visitLocation: 'rsia_melinda' });
    await afterSundayClinicSave(saved, { user: { id: 'staff-1', name: 'Staff Fixture' } });
    expect(sundayClinicMedifySyncQueue.enqueueDiagnosis).toHaveBeenCalledWith(expect.objectContaining({
        mrId: 'TEST001', patientId: 'fixture-a', visitLocation: 'rsia_melinda',
        changedSection: 'diagnosis', diagnosisData: { diagnosis_utama: 'Synthetic diagnosis' }
    }));
    sundayClinicMedifySyncQueue.enqueueDiagnosis.mockClear();
    await afterSundayClinicSave(saved, { user: { id: 'staff-1' }, skipMedifySync: true });
    expect(sundayClinicMedifySyncQueue.enqueueDiagnosis).not.toHaveBeenCalled();
});

test('resume save completes a pending hospital appointment and finalizes only a draft visit', async () => {
    db.query.mockImplementation(async sql => {
        if (sql.includes('FROM appointments')) return [[{ id: 41, hospital_location: 'rsia_melinda' }]];
        if (sql.includes('SELECT visit_location, status')) return [[{ visit_location: 'rsia_melinda', status: 'draft' }]];
        return [{ affectedRows: 1 }];
    });
    await afterSundayClinicSave(result('resume_medis', { resume: 'Synthetic resume' }, {
        visitLocation: 'rsia_melinda', documentChange: { added: 1, removed: 0, documentType: 'resume_medis' }
    }), { user: { id: 'staff-1', new_id: 'staff-new' } });
    expect(scheduler.autoCompleteOnPayment).toHaveBeenCalledWith(41, 'Resume saved');
    expect(db.query.mock.calls.some(([sql]) => sql.includes("SET status = 'finalized'"))).toBe(false);
    expect(createPatientNotification).toHaveBeenCalledWith(expect.objectContaining({
        patient_id: 'fixture-a', title: 'Resume Medis Baru'
    }));
});

test('draft resume finalization is part of the supplied clinical transaction and failure propagates', async () => {
    const connection = { query: jest.fn(async sql => {
        if (sql.includes('SELECT full_name FROM patients')) return [[{ full_name: 'Synthetic Patient' }]];
        if (sql.includes('SELECT id FROM patient_documents')) return [[]];
        if (sql.includes("SET status = 'finalized'")) throw new Error('Injected finalization failure');
        return [{ affectedRows: 1 }];
    }) };
    await expect(mutateSundayClinicDocuments(connection, scoped('resume_medis', { resume: 'Synthetic resume' })))
        .rejects.toThrow('Injected finalization failure');
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('last_activity_at = NOW()'))).toBe(true);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes("SET status = 'finalized'"))).toBe(true);
    expect(createPatientNotification).not.toHaveBeenCalled();
    expect(realtime.broadcast).not.toHaveBeenCalled();
});

test('patient document refresh and notification occur only after committed save result', async () => {
    await afterSundayClinicSave(result('usg', { photos: [] }, {
        documentChange: { added: 2, removed: 1, documentType: 'usg_photo' }
    }), { user: { id: 'staff-1' } });
    expect(createPatientNotification).toHaveBeenCalledWith(expect.objectContaining({
        patient_id: 'fixture-a', title: 'Foto USG Baru', message: expect.stringContaining('2 foto')
    }));
    expect(realtime.broadcastToRoom).toHaveBeenCalledWith('patient:fixture-a', {
        type: 'usg:patient_updated', added: 2, removed: 1
    });
});
