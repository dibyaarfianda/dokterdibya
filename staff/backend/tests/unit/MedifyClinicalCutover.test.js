'use strict';

const fs = require('node:fs');
const path = require('node:path');
const routeSource = fs.readFileSync(path.resolve(__dirname, '../../routes/medify-batch.js'), 'utf8');

test('Medify route delegates all section and resume writes and cannot swallow clinical errors as zero or false', () => {
    expect(routeSource).toMatch(/MedifyRecordImportService/);
    expect(routeSource).not.toMatch(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+medical_records\b/i);
    expect(routeSource).not.toMatch(/return recordsSaved;[\s\S]*?catch \(error\) \{[\s\S]*?return 0;/);
});

test('background test-sync carries the authenticated actor into both clinical writes', () => {
    expect(routeSource).toMatch(/testSyncProcess\(targetPatientId,[\s\S]*?\{ dateStart, dateEnd \},\s*req\.user\)/);
    const processor = routeSource.slice(routeSource.indexOf('async function testSyncProcess('),
        routeSource.indexOf('async function generateAndPublishResume('));
    expect(processor).not.toContain('req.user');
    expect(processor).toContain('saveMedicalRecord(targetPatientId, source, aiParseResult, actor)');
    expect(processor).toContain('generateAndPublishResume(targetPatientId, mrId, actor)');
});

const { MedifyRecordImportService } = require('../../services/MedifyRecordImportService');
const medicalRecordDatabase = require('../helpers/medicalRecordDatabase');
const { MedicalRecordService } = require('../../services/MedicalRecordService');

function fixture() {
    const records = { saveInternalSections: jest.fn().mockResolvedValue({ mrId: 'TEST001', data: [{ record_type: 'anamnesa' }] }) };
    const notify = jest.fn().mockResolvedValue({ success: true });
    return { records, notify, service: new MedifyRecordImportService({ records, notify }) };
}

test('all extracted sections enter one service transaction and a failed section rejects the job', async () => {
    const { records, service } = fixture();
    records.saveInternalSections.mockRejectedValueOnce(new Error('Injected later section failure'));
    await expect(service.saveParsedRecord({ patientId: 'fixture-a', source: 'rsia_melinda',
        actor: { id: 3 }, parsedData: { subjective: { keluhan_utama: 'synthetic' },
            objective: { tensi: '120/80' }, assessment: { diagnosis: 'synthetic' }, plan: { notes: 'synthetic' } } }))
        .rejects.toThrow('Injected later section failure');
    expect(records.saveInternalSections).toHaveBeenCalledTimes(1);
    expect(records.saveInternalSections.mock.calls[0][0].sections.map(section => section.recordType))
        .toEqual(expect.arrayContaining(['anamnesa', 'physical_exam', 'pemeriksaan_obstetri', 'diagnosis', 'planning']));
});

test('resume document failure rejects before a sent/success outcome', async () => {
    const { records, service, notify } = fixture();
    records.saveInternalSections.mockRejectedValueOnce(new Error('Injected resume document failure'));
    await expect(service.publishResume({ patientId: 'fixture-a', mrId: 'TEST001', resume: 'synthetic',
        patientName: 'Synthetic', actor: { id: 3 } })).rejects.toThrow('Injected resume document failure');
    expect(notify).not.toHaveBeenCalled();
});

test('invalid Medify source is rejected before entering a clinical transaction', async () => {
    const { records, service } = fixture();
    await expect(service.saveParsedRecord({ patientId: 'fixture-a', source: 'unknown', actor: { id: 3 }, parsedData: {} }))
        .rejects.toThrow('Invalid Medify source');
    expect(records.saveInternalSections).not.toHaveBeenCalled();
});

test('new Medify visit, every section and counter increment roll back together on revision failure', async () => {
    const database = medicalRecordDatabase();
    database.state().visits = [];
    database.failure = 'INSERT INTO medical_record_revisions';
    const service = new MedifyRecordImportService({ records: new MedicalRecordService(database), notify: jest.fn() });
    await expect(service.saveParsedRecord({ patientId: 'fixture-a', source: 'rsia_melinda', actor: { id: 3 },
        parsedData: { subjective: { keluhan_utama: 'synthetic' }, objective: { tensi: '120/80' } } }))
        .rejects.toThrow('Injected database failure');
    expect(database.state().visits).toHaveLength(0);
    expect(database.state().records).toHaveLength(0);
    expect(database.state().revisions).toHaveLength(0);
    expect(database.state().counter).toBe(1);
    expect(database.events.filter(event => event.kind === 'rollback')).toHaveLength(1);
});
