jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
let exportsUnderTest = {};
try { exportsUnderTest = require('../../services/lab-report/ocr'); } catch (_) { /* red baseline */ }
let Service;
try { Service = require('../../services/lab-report/service').LabReportService; } catch (_) { /* red baseline */ }
describe('lab report external boundaries', () => {
    test('blurred empty output and multiple identities/dates stay explicit review candidates', async () => {
        const candidate = { patient_names: ['UJI A', 'UJI B'], examination_dates: ['2026-10-17','2026-10-18'], warnings: ['Foto buram, nilai belum terbaca.'], parameters: [], specimen_date: '' };
        const client = { chat: { completions: { create: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(candidate) } }] }) } } };
        const result = await exportsUnderTest.extractLab({ files: [{ buffer: Buffer.from('test'), mimetype: 'image/png' }], client });
        expect(result.parameters).toEqual([]);
        expect(result.source_warnings.join(' ')).toMatch(/buram/);
        expect(result.source_warnings.join(' ')).toMatch(/beberapa pasien/);
        expect(result.source_warnings.join(' ')).toMatch(/beberapa tanggal/);
        expect(result.source_warnings.join(' ')).toMatch(/Isi manual/);
    });
    test('malformed model parameters are rejected at the server boundary', async () => {
        const candidate = { patient_names: ['UJI'], examination_dates: [], warnings: [], parameters: [null], specimen_date: '' };
        const client = { chat: { completions: { create: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(candidate) } }] }) } } };
        await expect(exportsUnderTest.extractLab({ files: [{ buffer: Buffer.from('test'), mimetype: 'image/png' }], client })).rejects.toMatchObject({ code: 'OCR_INVALID' });
    });
    test('retained and incoming source bytes share one 30 MB budget before upload', async () => {
        const storage = { uploadFile: jest.fn(), deleteFile: jest.fn() };
        const service = new Service({ pool: {}, storage });
        service.transaction = async work => work({});
        service.raw = async () => ({ id: 1, version: 1, patient_id: 'P1', mr_id: 'DRD1', report_data: JSON.stringify({ sources: [{ id: 'stored', key: 'own', size: 25 * 1024 * 1024 }] }) });
        service.visit = async () => ({ id: 1 });
        await expect(service.save({ id: 1, version: 1, patient_id: 'P1', mr_id: 'DRD1', actor: { id: 'staff' },
            data: { examined_at: '2026-10-18T10:00', parameters: [], sources: [{ id: 'stored' }] },
            files: [{ originalname: 'new.png', mimetype: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024) }] })).rejects.toMatchObject({ code: 'FILES_TOO_LARGE' });
        expect(storage.uploadFile).not.toHaveBeenCalled();
    });
    test('OCR uses strict structured extraction and flags identity differences without patient selection', async () => {
        expect(typeof exportsUnderTest.extractLab).toBe('function');
        const candidate = { patient_names: ['ORANG LAIN'], examination_dates: ['2026-10-17'], warnings: [], parameters: [{ name: 'SGOT', value: '22', unit: 'U/L', reference: '0-35', panel: 'Fungsi Hati', page: 1, source_index: 1 }], specimen_date: '2026-10-17' };
        const create = jest.fn().mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(candidate) } }] });
        const result = await exportsUnderTest.extractLab({ files: [{ buffer: Buffer.from('test'), mimetype: 'image/png', originalname: 'test.png' }], patientName: 'PASIEN UJI', examinedAt: '2026-10-18T10:00', client: { chat: { completions: { create } } } });
        expect(create.mock.calls[0][0].response_format.json_schema.strict).toBe(true);
        expect(result.parameters[0]).toMatchObject({ code: 'ast', raw_value: '22', reviewed: false, origin: 'ocr' });
        expect(result.source_warnings.join(' ')).toMatch(/identitas/i);
        expect(result).not.toHaveProperty('patient_id');
    });
    test('OCR includes PDF bytes and fails visibly on incomplete or refused model output', async () => {
        expect(typeof exportsUnderTest.extractLab).toBe('function');
        const create = jest.fn().mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] });
        await expect(exportsUnderTest.extractLab({ files: [{ buffer: Buffer.from('%PDF'), mimetype: 'application/pdf', originalname: 'lab.pdf' }], client: { chat: { completions: { create } } } })).rejects.toThrow(/lengkap/i);
        expect(create.mock.calls[0][0].messages[1].content.some(part => part.type === 'file')).toBe(true);
    });
    test('transaction rolls back before releasing connection on failures', async () => {
        expect(typeof Service).toBe('function');
        const connection = { beginTransaction: jest.fn(), rollback: jest.fn(), commit: jest.fn(), release: jest.fn() };
        const service = new Service({ pool: { getConnection: async () => connection } });
        await expect(service.transaction(async () => { throw new Error('storage unavailable'); })).rejects.toThrow('storage unavailable');
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });
    test('saved-source OCR accepts only this report server-owned files and keeps stable IDs', async () => {
        expect(typeof Service?.prototype.ocrSources).toBe('function');
        const storage = { getFileBuffer: jest.fn(async () => Buffer.from('fixture')) };
        const service = new Service({ pool: {}, storage });
        service.raw = async () => ({ patient_name: 'UJI', report_data: JSON.stringify({ examined_at: '2026-10-18T12:00', sources: [{ id: 'owned', key: 'private-own.png', name: 'Own.png', type: 'image/png' }] }) });
        await expect(service.ocrSources(1, ['other-report'])).rejects.toThrow(/sumber/i);
        expect(storage.getFileBuffer).not.toHaveBeenCalled();
        const result = await service.ocrSources(1, ['owned']); expect(result.sourceIds).toEqual(['owned']);
        expect(storage.getFileBuffer).toHaveBeenCalledWith('private-own.png');
    });
});
