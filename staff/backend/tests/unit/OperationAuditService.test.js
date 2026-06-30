jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const OperationAuditService = require('../../services/OperationAuditService');
const ExcelJS = require('exceljs');

function createDbMock(responses = []) {
    const calls = [];
    return {
        calls,
        query: jest.fn(async (sql, params = []) => {
            calls.push({ sql, params });
            const next = responses.shift();
            if (typeof next === 'function') return next(sql, params, calls);
            return next || [[]];
        })
    };
}

function row(overrides) {
    return {
        id: 1,
        facility: 'gambiran',
        source_key: 'gambiran:pendaftaran:1',
        case_id: 'med0001',
        simrs_operasi_id: '1',
        mr_id: 'GMB001',
        patient_name: 'Pasien Audit',
        operation_date: '2026-06-01',
        operation_time: '08:00:00',
        operation_name: 'SC',
        diagnosis: 'G2P1',
        status: 'Selesai',
        doctor_name: 'dr. Dibya Arfianda, SpOG',
        doctor_key: 'dibya',
        doctor_source: 'operator',
        patient_age: '34 tahun',
        fetched_at: '2026-06-02 01:00:00',
        last_synced_at: '2026-06-02 01:00:00',
        ...overrides
    };
}

describe('OperationAuditService', () => {
    test('lists Gambiran audit rows with same-patient repeat operation within 30 days', async () => {
        const db = createDbMock([
            [[row({ id: 1 }), row({
                id: 2,
                source_key: 'gambiran:pendaftaran:2',
                operation_date: '2026-06-20',
                doctor_key: 'tri_aji',
                doctor_name: 'dr. Tri Aji Wibowo, Sp.OG'
            })]]
        ]);
        const service = new OperationAuditService(db);

        const result = await service.getGambiranAudit({
            start: '2026-06-01',
            end: '2026-06-30',
            doctor: 'all',
            repeat: 'all'
        });

        expect(result.summary).toEqual(expect.objectContaining({
            total: 2,
            repeat_count: 1
        }));
        expect(result.data[0]).toEqual(expect.objectContaining({
            id: 1,
            repeat_within_30d: true,
            repeat_after: expect.objectContaining({
                id: 2,
                operation_date: '2026-06-20'
            })
        }));
        expect(result.data[1].repeat_within_30d).toBe(false);
    });

    test('applies doctor, operation text, and repeat-only filters to first operations', async () => {
        const db = createDbMock([
            [[
                row({ id: 1, doctor_key: 'latifa', doctor_name: 'dr. Latifa Maharani, Sp.OG', operation_name: 'Kuretase' }),
                row({
                    id: 2,
                    source_key: 'gambiran:pendaftaran:2',
                    operation_date: '2026-06-20',
                    doctor_key: 'dibya',
                    doctor_name: 'dr. Dibya Arfianda, SpOG',
                    operation_name: 'SC'
                }),
                row({
                    id: 3,
                    source_key: 'gambiran:pendaftaran:3',
                    mr_id: 'GMB002',
                    patient_name: 'Pasien Lain',
                    operation_date: '2026-06-05',
                    doctor_key: 'tri_aji',
                    doctor_name: 'dr. Tri Aji Wibowo, Sp.OG',
                    operation_name: 'SC'
                })
            ]]
        ]);
        const service = new OperationAuditService(db);

        const result = await service.getGambiranAudit({
            start: '2026-06-01',
            end: '2026-06-30',
            doctor: 'latifa',
            operation: 'kuret',
            repeat: 'yes'
        });

        expect(db.calls[0].sql).toContain("doctor_key IN ('dibya','tri_aji','latifa')");
        expect(db.calls[0].params).toEqual(['2026-06-01', '2026-07-30']);
        expect(result.summary.total).toBe(1);
        expect(result.summary.repeat_count).toBe(1);
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toEqual(expect.objectContaining({
            doctor_key: 'latifa',
            operation_name: 'Kuretase',
            patient_age: '34 tahun',
            repeat_within_30d: true
        }));
    });

    test('matches comma-separated operation filters case-insensitively', async () => {
        const db = createDbMock([
            [[
                row({ id: 1, operation_name: 'SVH + BSO' }),
                row({ id: 2, source_key: 'gambiran:pendaftaran:2', operation_name: 'TAH' }),
                row({ id: 3, source_key: 'gambiran:pendaftaran:3', operation_name: 'Kuretase' })
            ]]
        ]);
        const service = new OperationAuditService(db);

        const result = await service.getGambiranAudit({
            start: '2026-06-01',
            end: '2026-06-30',
            operation: 'svh, tah'
        });

        expect(result.summary.total).toBe(2);
        expect(result.data.map(item => item.operation_name)).toEqual(['SVH + BSO', 'TAH']);
    });

    test('applies patient, MR, diagnosis, status, doctor source, age, and sort filters', async () => {
        const db = createDbMock([
            [[
                row({
                    id: 1,
                    patient_name: 'Siti Audit',
                    mr_id: '537912',
                    patient_age: '38 tahun',
                    diagnosis: 'Mioma uteri',
                    status: 'Selesai',
                    doctor_source: 'operator',
                    operation_date: '2026-06-20'
                }),
                row({
                    id: 2,
                    source_key: 'gambiran:pendaftaran:2',
                    patient_name: 'Ani Audit',
                    mr_id: '537913',
                    patient_age: '29 tahun',
                    diagnosis: 'Abortus inkomplit',
                    status: 'Selesai',
                    doctor_source: 'operator',
                    operation_date: '2026-06-21'
                }),
                row({
                    id: 3,
                    source_key: 'gambiran:pendaftaran:3',
                    patient_name: 'Siti Audit',
                    mr_id: '537912',
                    patient_age: '38 tahun',
                    diagnosis: 'Mioma uteri',
                    status: 'Batal',
                    doctor_source: 'dpjp',
                    operation_date: '2026-06-25'
                })
            ]]
        ]);
        const service = new OperationAuditService(db);

        const result = await service.getGambiranAudit({
            start: '2026-06-01',
            end: '2026-06-30',
            patient: 'siti',
            mr: '5379',
            diagnosis: 'mioma',
            status: 'selesai',
            doctorSource: 'operator',
            ageMin: '35',
            ageMax: '40',
            sort: 'date_asc'
        });

        expect(result.summary.total).toBe(1);
        expect(result.data[0]).toEqual(expect.objectContaining({
            id: 1,
            patient_name: 'Siti Audit',
            mr_id: '537912',
            patient_age: '38 tahun',
            doctor_source: 'operator'
        }));
        expect(result.filters).toEqual(expect.objectContaining({
            patient: 'siti',
            mr: '5379',
            diagnosis: 'mioma',
            status: 'selesai',
            doctorSource: 'operator',
            ageMin: 35,
            ageMax: 40,
            sort: 'date_asc'
        }));
    });

    test('builds a formatted Gambiran audit XLSX export with summary and detail sheets', async () => {
        const db = createDbMock([
            [[row({
                id: 1,
                patient_name: 'Pasien Export',
                mr_id: '537912',
                patient_age: '38 tahun',
                operation_name: 'SVH',
                diagnosis: 'Mioma',
                doctor_key: 'tri_aji',
                doctor_name: 'dr. Tri Aji Wibowo, Sp.OG',
                operation_date: '2026-06-27'
            })]]
        ]);
        const service = new OperationAuditService(db);

        const exportResult = await service.buildGambiranAuditWorkbook({
            start: '2026-06-01',
            end: '2026-06-30',
            doctor: 'tri_aji',
            operation: 'svh'
        });

        expect(exportResult.filename).toBe('audit-gambiran-2026-06-01-2026-06-30.xlsx');
        expect(Buffer.isBuffer(exportResult.buffer)).toBe(true);
        expect(exportResult.rowCount).toBe(1);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(exportResult.buffer);
        expect(workbook.getWorksheet('Ringkasan')).toBeTruthy();
        expect(workbook.getWorksheet('Data Audit')).toBeTruthy();

        const dataSheet = workbook.getWorksheet('Data Audit');
        expect(dataSheet.getRow(1).values).toEqual(expect.arrayContaining([
            'Tanggal Operasi',
            'No. Rekam Medis',
            'Umur',
            'Jenis Operasi',
            'Operasi Ulang 30 Hari'
        ]));
        expect(dataSheet.getRow(2).values).toEqual(expect.arrayContaining([
            '2026-06-27',
            '537912',
            '38 tahun',
            'SVH',
            'Tidak'
        ]));
    });
});
