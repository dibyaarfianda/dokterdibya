'use strict';

const databaseFactory = require('../helpers/medicalRecordDatabase');
const { MedicalRecordService } = require('../../services/MedicalRecordService');

test('internal batch locks one visit and rolls every section back when later metadata fails', async () => {
    const database = databaseFactory();
    const service = new MedicalRecordService(database);
    await expect(service.saveInternalSections({
        mrId: 'TEST001', patientId: 'fixture-a', actor: { id: 'internal-import' },
        sections: [
            { recordType: 'anamnesa', data: { keluhan_utama: '' } },
            { recordType: 'penunjang', data: { files: [] } }
        ],
        mutateDocuments: async (_connection, row) => {
            if (row.record_type === 'penunjang') throw new Error('metadata unavailable');
        }
    })).rejects.toThrow('metadata unavailable');
    expect(database.state().records).toEqual([]);
    expect(database.state().revisions).toEqual([]);
    expect(database.events.filter(event => event.kind === 'begin')).toHaveLength(1);
    expect(database.events.filter(event => event.kind === 'rollback')).toHaveLength(1);
});

test('internal append reads current photos under the visit lock and creates a revision', async () => {
    const database = databaseFactory();
    const service = new MedicalRecordService(database);
    await service.create({ mrId: 'TEST001', patientId: 'fixture-a', recordType: 'usg',
        data: { photos: [{ url: '/first' }] }, actor: { id: 'internal-import' } });
    const result = await service.saveInternalSections({
        mrId: 'TEST001', patientId: 'fixture-a', actor: { id: 'internal-import' },
        sections: [{ recordType: 'usg', update: current => ({ ...current, photos: [...current.photos, { url: '/second' }] }) }]
    });
    expect(result.data[0].record_data.photos).toEqual([{ url: '/first' }, { url: '/second' }]);
    expect(result.data[0].version).toBe(2);
    expect(database.state().revisions.map(row => row.event_type)).toEqual(['create', 'patch']);
});

test('import visit creation and section save share one rollback boundary', async () => {
    const database = databaseFactory();
    database.state().visits = [];
    const service = new MedicalRecordService(database);
    await expect(service.saveInternalSections({
        mrId: 'TEST002', patientId: 'fixture-a', actor: { id: 'importer' },
        visitCreation: { visitLocation: 'rsia_melinda', visitDateTime: '2026-09-24 10:00:00' },
        sections: [{ recordType: 'pemeriksaan_obstetri', data: { notes: '' } }],
        mutateDocuments: async () => { throw new Error('later failure'); }
    })).rejects.toThrow('later failure');
    expect(database.state().visits).toEqual([]);
    expect(database.state().records).toEqual([]);
});

test('external import create-only precondition cannot replace an existing section', async () => {
    const database = databaseFactory();
    const service = new MedicalRecordService(database);
    await service.create({ mrId: 'TEST001', patientId: 'fixture-a', recordType: 'usg',
        data: { notes: 'existing' }, actor: { id: 'staff-a' } });
    await expect(service.saveInternalSections({ mrId: 'TEST001', patientId: 'fixture-a',
        actor: { id: 'staff-a' }, sections: [{ recordType: 'usg', data: { notes: 'incoming' }, createOnly: true }]
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(JSON.parse(database.state().records[0].record_data)).toEqual({ notes: 'existing' });
});
