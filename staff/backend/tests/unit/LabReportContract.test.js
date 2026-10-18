jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../routes/patient-notifications', () => ({ createPatientNotification: jest.fn() }));
const fs = require('fs');
const path = require('path');
const registry = require('../../config/accessControlRegistry');
let domain = {};
try { domain = require('../../services/lab-report/domain'); } catch (_) { /* expected baseline */ }
const sample = () => ({ examined_at: '2026-10-18T15:00', technician: 'Petugas Uji', license: 'IZIN-UJI',
    parameters: [{ code: 'hb', name: 'Hemoglobin', panel: 'Darah Lengkap', raw_value: '10,0', unit: 'g/dL', reference: '12.0-15.5', reviewed: true, origin: 'manual' }], sources: [], review_confirmed: true });

describe('structured lab report contracts', () => {
    test('ambiguous thousands separators in reference ranges cannot produce false high/low flags', () => {
        expect(domain.flag({ reviewed: true, numeric_value: 9370, reference: '4.000-10.000' })).toBe('');
        expect(domain.flag({ reviewed: true, numeric_value: 9370, reference: '4,000-10,000' })).toBe('');
        expect(domain.flag({ reviewed: true, numeric_value: 12000, reference: '4000-10000' })).toBe('H');
    });
    test('requires a matching patient and a private clinic DRD, rejects ambiguous visits', () => {
        expect(typeof domain.assertVisit).toBe('function');
        const visit = { id: 1, mr_id: 'DRD001', patient_id: 'P001', visit_location: 'klinik_private' };
        expect(domain.assertVisit([visit], 'P001').id).toBe(1);
        expect(() => domain.assertVisit([visit], 'P002')).toThrow(/pasien/i);
        expect(() => domain.assertVisit([{ ...visit, visit_location: 'rsia_melinda' }], 'P001')).toThrow(/Klinik Privat/i);
        expect(() => domain.assertVisit([visit, visit], 'P001')).toThrow(/ambigu/i);
    });
    test('preserves raw numeric strings, flags ambiguous thousands and keeps BUN separate from urea', () => {
        expect(typeof domain.normalizeReport).toBe('function');
        const data = sample();
        data.parameters.push({ code: 'wbc', name: 'Leukosit', raw_value: '9.370', unit: 'sel/uL', reference: '', origin: 'ocr' });
        const report = domain.normalizeReport(data);
        expect(report.parameters[0]).toMatchObject({ raw_value: '10,0', numeric_value: 10 });
        expect(report.parameters[1]).toMatchObject({ raw_value: '9.370', numeric_value: null, needs_review: true });
        expect(domain.canonicalCode('Ureum')).not.toBe(domain.canonicalCode('BUN'));
        expect(domain.canonicalCode('SGOT')).toBe('ast');
        expect(domain.canonicalCode('SK')).toBe('creatinine');
    });
    test('publication requires reviewed nonempty parameters and resolved source identity', () => {
        expect(typeof domain.assertPublishable).toBe('function');
        expect(() => domain.assertPublishable(domain.normalizeReport(sample()))).not.toThrow();
        expect(() => domain.assertPublishable(domain.normalizeReport({ ...sample(), review_confirmed: false }))).toThrow(/periksa/i);
        expect(() => domain.assertPublishable(domain.normalizeReport({ ...sample(), source_warnings: ['Identitas berbeda'], identity_resolved: false }))).toThrow(/identitas/i);
        expect(() => domain.assertPublishable(domain.normalizeReport({ ...sample(), parameters: [] }))).toThrow(/parameter/i);
    });
    test('confirmed numbers cannot silently disagree with unambiguous raw values or stale raw values', () => {
        const data = sample();
        data.parameters[0].numeric_value = 3;
        expect(domain.normalizeReport(data).parameters[0].numeric_value).toBe(10);
        data.parameters[0] = { ...data.parameters[0], raw_value: '9.370', numeric_value: 9370, numeric_confirmed_for: '9.370' };
        expect(domain.normalizeReport(data).parameters[0].numeric_value).toBe(9370);
        data.parameters[0].raw_value = '8.370';
        expect(domain.normalizeReport(data).parameters[0].numeric_value).toBeNull();
        expect(domain.canonicalCode('SGOT / AST')).toBe('ast');
    });
    test('comparison only computes delta for the same analyte and unit', () => {
        expect(typeof domain.compareReports).toBe('function');
        const now = domain.normalizeReport(sample());
        const previous = domain.normalizeReport(sample()); previous.parameters[0].numeric_value = 9;
        expect(domain.compareReports(now, previous)[0].delta).toBe(1);
        previous.parameters[0].unit = 'g/L';
        expect(domain.compareReports(now, previous)[0].delta).toBeNull();
    });
    test('comparison PDF keeps the units with each historical value', () => {
        const pdf = require('../../services/lab-report/pdf');
        expect(typeof pdf.comparisonCells).toBe('function');
        const cells = pdf.comparisonCells({ name: 'GDA', raw_value: '110', unit: 'mg/dL', previous: { raw_value: '5.5', unit: 'mmol/L' }, delta: null });
        expect(cells[1]).toBe('5.5 mmol/L'); expect(cells[2]).toBe('110 mg/dL'); expect(cells[3]).toBe('-');
    });
    test('invalid calendar dates cannot silently move examination to another day', () => {
        expect(() => domain.normalizeReport({ ...sample(), examined_at: '2026-02-31T12:00' })).toThrow(/Tanggal/i);
    });
    test('access registry agrees with staff lab view, edit, publish, delete and export permissions', () => {
        const resolve = (method, routePath) => registry.resolveRouteAccess({ sourceFile: 'lab-reports', method, routePath, handlerPrefix: 'verifyStaffToken', fileMiddleware: '' })?.permission;
        expect(resolve('GET', '/')).toBe('lab_exam.view');
        expect(resolve('PATCH', '/:id')).toBe('lab_exam.edit');
        expect(resolve('POST', '/:id/publish')).toBe('patient_documents.create');
        expect(resolve('DELETE', '/:id')).toBe('medical_records.delete');
        expect(resolve('GET', '/:id/pdf')).toBe('medical_records.export');
        expect(registry.STAFF_NAVIGATION_MAP['nav-laboratorium']).toBe('lab_exam.view');
    });
    test('legacy penunjang synchronization excludes structured report documents', async () => {
        const db = require('../../db');
        db.query.mockResolvedValue([[]]);
        const sync = require('../../services/PatientDocumentSyncService');
        await sync.syncPenunjangLabResults({ patientId: 'P001', mrId: 'DRD001', files: [] });
        expect(db.query.mock.calls[0][0]).toMatch(/lab_report_id IS NULL/);
        const connection = { query: jest.fn().mockResolvedValue([[]]) };
        await sync.mutatePenunjangDocuments(connection, { patientId: 'P001', mrId: 'DRD001', files: [] });
        expect(connection.query.mock.calls[0][0]).toMatch(/lab_report_id IS NULL/);
    });
    test('patient document generic deletion cannot bypass structured report revision control', () => {
        const routes = fs.readFileSync(path.join(__dirname, '../../routes/patient-documents.js'), 'utf8');
        expect(routes).toMatch(/if\s*\(doc\.lab_report_id\)/);
    });
});
