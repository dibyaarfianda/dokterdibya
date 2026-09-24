'use strict';

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../realtime-sync', () => ({ broadcast: jest.fn(), broadcastToRoom: jest.fn() }));

const medicalRecordDatabase = require('../helpers/medicalRecordDatabase');
const { MedicalRecordService } = require('../../services/MedicalRecordService');
const { UsgClinicalPhotoService } = require('../../services/UsgClinicalPhotoService');
const { mutateSundayClinicDocuments } = require('../../services/SundayClinicSaveEffects');

const photo = key => ({ name: 'synthetic.jpg', key, url: `/api/usg-photos/file/${key}`,
    type: 'image/jpeg', size: 4, storage: 'r2' });

function fixture() {
    const database = medicalRecordDatabase();
    const r2Storage = { deleteFile: jest.fn().mockResolvedValue({ success: true }) };
    const service = new UsgClinicalPhotoService({
        records: new MedicalRecordService(database), r2Storage,
        notify: jest.fn().mockResolvedValue({ success: true })
    });
    return { database, r2Storage, service };
}

test('two concurrent bulk/inbox photo appends retain both photos and immutable versions', async () => {
    const { database, service } = fixture();
    await Promise.all([
        service.appendPhotos({ patientId: 'fixture-a', mrId: 'TEST001', photos: [photo('usg-photos/a.jpg')], actor: { id: 4, name: 'Test' } }),
        service.appendPhotos({ patientId: 'fixture-a', mrId: 'TEST001', photos: [photo('usg-photos/b.jpg')], actor: { id: 4, name: 'Test' } })
    ]);
    expect(JSON.parse(database.state().records[0].record_data).photos).toEqual([photo('usg-photos/a.jpg'), photo('usg-photos/b.jpg')]);
    expect(database.state().records[0].version).toBe(2);
    expect(database.state().revisions).toHaveLength(2);
    expect(database.state().documents).toHaveLength(2);
});

test('document metadata failure rolls back medical row and revision', async () => {
    const { database, service } = fixture();
    database.failure = 'INSERT INTO patient_documents';
    await expect(service.appendPhotos({ patientId: 'fixture-a', mrId: 'TEST001', photos: [photo('usg-photos/a.jpg')], actor: { id: 4, name: 'Test' } }))
        .rejects.toThrow('Injected database failure');
    expect(database.state().records).toHaveLength(0);
    expect(database.state().revisions).toHaveLength(0);
    expect(database.state().documents).toHaveLength(0);
});

test('missing or mismatched canonical visit rejects without a medical claim', async () => {
    const { database, service } = fixture();
    await expect(service.appendPhotos({ patientId: 'fixture-a', mrId: null, photos: [photo('usg-photos/a.jpg')], actor: { id: 4 } }))
        .rejects.toMatchObject({ code: 'MR_REQUIRED' });
    await expect(service.appendPhotos({ patientId: 'fixture-b', mrId: 'TEST001', photos: [photo('usg-photos/a.jpg')], actor: { id: 4 } }))
        .rejects.toMatchObject({ code: 'PATIENT_SCOPE_MISMATCH' });
    expect(database.state().records).toHaveLength(0);
});

test('post-upload compensation removes only freshly uploaded keys after rollback', async () => {
    const { r2Storage, service } = fixture();
    const result = await service.compensateUploaded([photo('usg-photos/new.jpg')]);
    expect(result).toEqual({ attempted: 1, failed: 0 });
    expect(r2Storage.deleteFile).toHaveBeenCalledWith('usg-photos/new.jpg');
});

test('inbox string publication survives an unrelated USG field edit and scoped removal only changes metadata', async () => {
    const key = 'usg-photos/inbox-synthetic.jpg';
    const documents = [];
    let section = {};
    const connection = { query: jest.fn(async (sql, params) => {
        if (sql.includes('SELECT id, file_path FROM patient_documents')) return [documents.map(({ id, file_path }) => ({ id, file_path }))];
        if (sql.includes('SELECT id, file_url FROM patient_documents')) return [documents.map(({ id, file_url }) => ({ id, file_url }))];
        if (sql.includes('INSERT INTO patient_documents')) {
            documents.push({ id: documents.length + 1, file_url: params[3], file_path: params[4] });
            return [{ affectedRows: 1 }];
        }
        if (sql.includes('DELETE FROM patient_documents')) {
            const removed = new Set(params[0]);
            documents.splice(0, documents.length, ...documents.filter(doc => !removed.has(doc.id)));
            return [{ affectedRows: removed.size }];
        }
        return [{ affectedRows: 1 }];
    }) };
    const records = { saveInternalSections: jest.fn(async request => {
        section = request.sections[0].update(section);
        await request.mutateDocuments(connection, { patient_id: 'fixture-a', mr_id: 'TEST001' });
        return { data: section };
    }) };
    const r2Storage = { deleteFile: jest.fn() };
    const service = new UsgClinicalPhotoService({ records, r2Storage, notify: jest.fn() });
    await service.appendPhotos({ patientId: 'fixture-a', mrId: 'TEST001', photos: [key], actor: { id: 4 } });
    expect(documents).toHaveLength(1);
    section = { ...section, hasil_usg: 'synthetic update' };
    const scope = { patient_id: 'fixture-a', mr_id: 'TEST001', record_type: 'usg',
        record_data: section, visitId: 1, visitStatus: 'finalized', actor: { doctorId: 4 } };
    await mutateSundayClinicDocuments(connection, scope);
    expect(documents).toHaveLength(1);
    expect(documents[0].file_path).toBe(key);
    await mutateSundayClinicDocuments(connection, { ...scope, record_data: { ...section, photos: [] } });
    expect(documents).toHaveLength(0);
    expect(r2Storage.deleteFile).not.toHaveBeenCalled();
});
