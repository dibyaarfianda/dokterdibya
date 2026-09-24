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

test('Medify republish replaces the document content read by the patient resolver', async () => {
    const document = { id: 9, patient_id: 'fixture-a', mr_id: 'TEST001', document_type: 'resume_medis',
        source_data: JSON.stringify({ content: 'Old synthetic resume' }), file_url: null };
    let section = { resume: 'Old synthetic resume' };
    let failDocumentUpdate = false;
    const query = jest.fn(async (sql, params) => {
        if (sql.includes('SELECT id FROM patient_documents')) return [[{ id: document.id }]];
        if (sql.includes('SELECT id, document_type, title, description, source_data')) return [[document]];
        if (sql.includes('UPDATE patient_documents')) {
            if (failDocumentUpdate) throw new Error('Injected document update failure');
            document.source_data = params.find(value => typeof value === 'string' && value.includes('New synthetic resume')) || document.source_data;
            return [{ affectedRows: 1 }];
        }
        if (sql.includes('SELECT record_data FROM medical_records')) return [[{ record_data: JSON.stringify(section) }]];
        return [[]];
    });
    const records = { saveInternalSections: jest.fn(async request => {
        const before = structuredClone(section);
        section = request.sections[0].data;
        try { await request.mutateDocuments({ query }, { patient_id: 'fixture-a', mr_id: 'TEST001' }); }
        catch (error) { section = before; throw error; }
    }) };
    const notify = jest.fn();
    const service = new MedifyRecordImportService({ records, notify });
    await service.publishResume({ patientId: 'fixture-a', mrId: 'TEST001', resume: 'New synthetic resume',
        patientName: 'Synthetic', actor: { id: 3 } });
    const db = require('../../db');
    const originalQuery = db.query;
    db.query = query;
    try {
        const router = require('../../routes/patient-documents');
        const handler = router.stack.find(layer => layer.route?.path === '/:id/content').route.stack.at(-1).handle;
        const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await handler({ params: { id: '9' }, patient: { patientId: 'fixture-a' } }, response);
        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
            document: expect.objectContaining({ content: 'New synthetic resume' })
        }));
    } finally { db.query = originalQuery; }
    expect(notify).toHaveBeenCalledTimes(1);
    failDocumentUpdate = true;
    await expect(service.publishResume({ patientId: 'fixture-a', mrId: 'TEST001', resume: 'Never published',
        patientName: 'Synthetic', actor: { id: 3 } })).rejects.toThrow('Injected document update failure');
    expect(section.resume).toBe('New synthetic resume');
    expect(notify).toHaveBeenCalledTimes(1);
});

test('Medify resume document UPDATE failure rolls back the real section/revision transaction and cannot notify success', async () => {
    const database = medicalRecordDatabase();
    const existing = { id: 9, patient_id: 'fixture-a', mr_id: 'TEST001', document_type: 'resume_medis',
        source_data: JSON.stringify({ content: 'Old synthetic resume' }) };
    database.state().documents.push(existing);
    database.failure = 'UPDATE patient_documents';
    const notify = jest.fn();
    const service = new MedifyRecordImportService({ records: new MedicalRecordService(database), notify });
    await expect(service.publishResume({ patientId: 'fixture-a', mrId: 'TEST001', resume: 'New synthetic resume',
        patientName: 'Synthetic', actor: { id: 3 } })).rejects.toThrow('Injected database failure');
    expect(database.state().records).toHaveLength(0);
    expect(database.state().revisions).toHaveLength(0);
    expect(database.state().documents).toEqual([existing]);
    expect(database.events.filter(event => event.kind === 'rollback')).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
});

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
