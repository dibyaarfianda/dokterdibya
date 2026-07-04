jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const OperationPathologyService = require('../../services/OperationPathologyService');

function createDbMock(rows = []) {
    return {
        query: jest.fn(async () => [rows])
    };
}

describe('OperationPathologyService', () => {
    const originalFetch = global.fetch;
    const originalEnv = process.env.COMM_SERVICE_BASE_URL;

    afterEach(() => {
        global.fetch = originalFetch;
        process.env.COMM_SERVICE_BASE_URL = originalEnv;
    });

    test('returns filtered PA results from COMM penunjang data for a Gambiran audit row', async () => {
        process.env.COMM_SERVICE_BASE_URL = 'http://comm.test';
        const db = createDbMock([{
            id: 2550,
            facility: 'gambiran',
            case_id: 'med0000698349',
            mr_id: '538085',
            patient_name: 'Ny MAHMUDAH',
            operation_date: '2026-06-18',
            operation_name: 'TAH-BSO',
            doctor_key: 'latifa'
        }]);
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                caseId: 'med0000698349',
                facility: 'gambiran',
                results: [
                    { name: 'HPA BESAR_', value: 'Selesai', isDone: true, detailId: 7161, date: '2026-06-18' },
                    { name: 'DARAH LENGKAP_', value: 'Selesai', isDone: true, detailId: 875541 }
                ],
                files: [
                    { id: 1469235, title: 'HASIL_LAB_PK-DARAH_LENGKAP__18-06-2026', fileType: 'pdf' },
                    { id: 1469999, title: 'HASIL_PA-HPA_BESAR__18-06-2026', fileType: 'pdf' }
                ]
            })
        }));

        const service = new OperationPathologyService({ db });
        const result = await service.getForAuditRow(2550);

        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM operation_data_index'), [2550]);
        expect(global.fetch).toHaveBeenCalledWith(
            'http://comm.test/api/simrs/penunjang-cache/med0000698349?facility=gambiran',
            expect.objectContaining({ method: 'GET' })
        );
        expect(result.record).toEqual(expect.objectContaining({ id: 2550, case_id: 'med0000698349' }));
        expect(result.results).toHaveLength(1);
        expect(result.results[0]).toEqual(expect.objectContaining({ name: 'HPA BESAR_', detailId: 7161 }));
        expect(result.files).toHaveLength(1);
        expect(result.files[0]).toEqual(expect.objectContaining({
            id: 1469999,
            url: '/api/docboard/audit/gambiran/pathology-files/med0000698349/1469999'
        }));
        expect(result.summary).toEqual({ total: 1, done: 1, pending: 0, files: 1 });
    });

    test('falls back to live COMM penunjang endpoint when cache is not available', async () => {
        process.env.COMM_SERVICE_BASE_URL = 'http://comm.test';
        const db = createDbMock([{
            id: 2551,
            facility: 'gambiran',
            case_id: 'med0000698350',
            patient_name: 'Ny Fallback',
            doctor_key: 'dibya'
        }]);
        global.fetch = jest.fn(async (url) => {
            if (url.includes('/penunjang-cache/')) {
                return {
                    ok: false,
                    status: 404,
                    text: async () => JSON.stringify({ error: 'No cached penunjang data' })
                };
            }
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    caseId: 'med0000698350',
                    facility: 'gambiran',
                    results: [
                        { name: 'HPA KECIL_', value: 'Selesai', isDone: true, detailId: 9001 }
                    ],
                    files: []
                })
            };
        });

        const service = new OperationPathologyService({ db });
        const result = await service.getForAuditRow(2551);

        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            'http://comm.test/api/simrs/penunjang-cache/med0000698350?facility=gambiran',
            expect.objectContaining({ method: 'GET' })
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            'http://comm.test/api/simrs/penunjang/med0000698350?facility=gambiran',
            expect.objectContaining({ method: 'GET' })
        );
        expect(result.results).toHaveLength(1);
        expect(result.results[0]).toEqual(expect.objectContaining({ name: 'HPA KECIL_' }));
    });

    test('reports missing case id without calling COMM', async () => {
        const db = createDbMock([{ id: 9, facility: 'gambiran', case_id: null }]);
        global.fetch = jest.fn();

        const service = new OperationPathologyService({ db });
        const result = await service.getForAuditRow(9);

        expect(global.fetch).not.toHaveBeenCalled();
        expect(result.results).toEqual([]);
        expect(result.message).toBe('Case ID operasi belum tersedia');
    });

    test('keeps pathology modal loadable when cache is missing and live COMM fails', async () => {
        process.env.COMM_SERVICE_BASE_URL = 'http://comm.test';
        const db = createDbMock([{
            id: 3452,
            facility: 'gambiran',
            case_id: 'med0000695253',
            patient_name: 'Ny Cache Missing',
            doctor_key: 'latifa'
        }]);
        global.fetch = jest.fn(async (url) => {
            if (url.includes('/penunjang-cache/')) {
                return {
                    ok: false,
                    status: 404,
                    text: async () => JSON.stringify({ error: 'No cached penunjang data' })
                };
            }
            return {
                ok: false,
                status: 500,
                text: async () => JSON.stringify({ error: 'Gagal memuat hasil penunjang', details: 'fetch failed' })
            };
        });

        const service = new OperationPathologyService({ db });
        const result = await service.getForAuditRow(3452);

        expect(result.results).toEqual([]);
        expect(result.files).toEqual([]);
        expect(result.summary).toEqual({ total: 0, done: 0, pending: 0, files: 0 });
        expect(result.message).toContain('Hasil penunjang belum tersedia di cache');
    });

    test('does not treat radiology Thorax PA as pathology anatomy', () => {
        expect(OperationPathologyService.isPathologyResult({ name: 'THORAX PA_' })).toBe(false);
        expect(OperationPathologyService.isPathologyFile({ title: 'Radiologi_THORAX_PA__109666_131472_12-06-2026' })).toBe(false);
        expect(OperationPathologyService.isPathologyFile({ title: 'HASIL_PA-HPA_BESAR__18-06-2026' })).toBe(true);
    });

    test('proxies pathology file requests through COMM penunjang file endpoint', async () => {
        process.env.COMM_SERVICE_BASE_URL = 'http://comm.test';
        const pdfBytes = Buffer.from('%PDF-1.4');
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            headers: {
                get: key => ({
                    'content-type': 'application/pdf',
                    'x-filename': 'HASIL_PA-HPA_BESAR.pdf'
                }[key])
            },
            arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)
        }));

        const service = new OperationPathologyService({ db: createDbMock([]) });
        const result = await service.fetchPathologyFile('med0000698349', 1469999);

        expect(global.fetch).toHaveBeenCalledWith(
            'http://comm.test/api/simrs/penunjang-file/med0000698349/1469999?facility=gambiran',
            expect.objectContaining({ method: 'GET' })
        );
        expect(result.contentType).toBe('application/pdf');
        expect(result.filename).toBe('HASIL_PA-HPA_BESAR.pdf');
        expect(result.buffer.equals(pdfBytes)).toBe(true);
    });
});
