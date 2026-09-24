'use strict';

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../realtime-sync', () => ({ broadcast: jest.fn(), broadcastToRoom: jest.fn() }));

const medicalRecordDatabase = require('../helpers/medicalRecordDatabase');
const { MedicalRecordService } = require('../../services/MedicalRecordService');
const { UsgClinicalPhotoService } = require('../../services/UsgClinicalPhotoService');

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
