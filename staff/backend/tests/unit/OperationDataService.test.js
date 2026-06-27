jest.mock('../../services/r2Storage', () => ({
    R2_BUCKET_NAME: 'test-bucket',
    uploadJson: jest.fn(),
    getJson: jest.fn()
}));

jest.mock('../../db', () => ({
    query: jest.fn()
}));

const operationData = require('../../services/OperationDataService');
const db = require('../../db');
const r2Storage = require('../../services/r2Storage');

describe('OperationDataService doctor metadata', () => {
    beforeEach(() => {
        db.query.mockReset();
    });

    test('normalizes doctor_name, doctor_key, and doctor_source from archive items', () => {
        const item = operationData.normalizeIndexItem({
            facility: 'gambiran',
            source_key: 'gambiran:pendaftaran:123',
            patient_name: 'Pasien Audit',
            operation_date: '2026-06-01',
            r2_key: 'operation-data/gambiran/2026-06-01/item.json',
            doctor_name: 'dr. Tri Aji Wibowo, Sp.OG',
            doctor_key: 'tri_aji',
            doctor_source: 'operator'
        });

        expect(item).toEqual(expect.objectContaining({
            doctorName: 'dr. Tri Aji Wibowo, Sp.OG',
            doctorKey: 'tri_aji',
            doctorSource: 'operator'
        }));
    });

    test('normalizes patient_age from archive items', () => {
        const item = operationData.normalizeIndexItem({
            facility: 'gambiran',
            source_key: 'gambiran:pendaftaran:123',
            patient_name: 'Pasien Audit',
            patient_age: '34 tahun',
            operation_date: '2026-06-01',
            r2_key: 'operation-data/gambiran/2026-06-01/item.json'
        });

        expect(item.patientAge).toBe('34 tahun');
    });

    test('upsertIndex writes doctor metadata to operation_data_index', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);

        await operationData.upsertIndex([{
            facility: 'gambiran',
            source_key: 'gambiran:pendaftaran:123',
            patient_name: 'Pasien Audit',
            operation_date: '2026-06-01',
            r2_key: 'operation-data/gambiran/2026-06-01/item.json',
            doctor_name: 'dr. Latifa Maharani, Sp.OG',
            doctor_key: 'latifa',
            doctor_source: 'operator'
        }]);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('doctor_name');
        expect(sql).toContain('doctor_key');
        expect(sql).toContain('doctor_source');
        expect(params).toEqual(expect.arrayContaining([
            'dr. Latifa Maharani, Sp.OG',
            'latifa',
            'operator'
        ]));
    });

    test('upsertIndex writes patient age to operation_data_index', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);

        await operationData.upsertIndex([{
            facility: 'gambiran',
            source_key: 'gambiran:pendaftaran:123',
            patient_name: 'Pasien Audit',
            patient_age: '34 tahun',
            operation_date: '2026-06-01',
            r2_key: 'operation-data/gambiran/2026-06-01/item.json'
        }]);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('patient_age');
        expect(params).toEqual(expect.arrayContaining(['34 tahun']));
    });

    test('archiveRecords derives doctor metadata from legacy payload DPJP when index item has none', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        r2Storage.uploadJson.mockResolvedValue({ key: 'operation-data/gambiran/2026-06-18/item.json' });

        await operationData.archiveRecords([{
            index_item: {
                facility: 'gambiran',
                source_key: 'gambiran:med0001:123',
                patient_name: 'Pasien Lama',
                operation_date: '2026-06-18',
                r2_key: 'operation-data/gambiran/2026-06-18/item.json'
            },
            payload: {
                patient: {
                    raw: {
                        dpjp: 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.'
                    }
                }
            }
        }]);

        const [, params] = db.query.mock.calls[0];
        expect(params).toEqual(expect.arrayContaining([
            'dr. Dibya Arfianda, SpOG, M.Ked.Klin.',
            'dibya',
            'dpjp'
        ]));
    });

    test('archiveRecords prefers Gambiran operator over Dibya DPJP for audit doctor metadata', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        r2Storage.uploadJson.mockResolvedValue({ key: 'operation-data/gambiran/2026-06-18/item.json' });

        await operationData.archiveRecords([{
            index_item: {
                facility: 'gambiran',
                source_key: 'gambiran:med0001:124',
                patient_name: 'Pasien Operator',
                operation_date: '2026-06-18',
                r2_key: 'operation-data/gambiran/2026-06-18/item-operator.json'
            },
            payload: {
                facility: 'gambiran',
                patient: {
                    raw: {
                        dpjp: 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.'
                    }
                },
                registration: {
                    operator_name: 'dr. Tri Aji Wibowo, Sp.OG'
                }
            }
        }]);

        const [, params] = db.query.mock.calls[0];
        expect(params).toEqual(expect.arrayContaining([
            'dr. Tri Aji Wibowo, Sp.OG',
            'tri_aji',
            'operator'
        ]));
    });

    test('archiveRecords derives medical record number from registration patient_id when report has none', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        r2Storage.uploadJson.mockResolvedValue({ key: 'operation-data/gambiran/2026-06-18/item-mr.json' });

        await operationData.archiveRecords([{
            index_item: {
                facility: 'gambiran',
                source_key: 'gambiran:pendaftaran:19196',
                patient_name: 'Pasien RM',
                operation_date: '2026-06-18',
                r2_key: 'operation-data/gambiran/2026-06-18/item-mr.json'
            },
            payload: {
                facility: 'gambiran',
                patient: {
                    simrs_patient_id: '537912'
                },
                registration: {
                    patient_id: '537912',
                    operator_name: 'dr. Tri Aji Wibowo, Sp.OG'
                }
            }
        }]);

        const [, params] = db.query.mock.calls[0];
        expect(params).toEqual(expect.arrayContaining(['537912']));
    });

    test('backfillDoctorMetadataFromPayload updates existing Gambiran index rows from R2 payloads', async () => {
        db.query
            .mockResolvedValueOnce([[{
                id: 2550,
                facility: 'gambiran',
                r2_key: 'operation-data/gambiran/2026-06-18/item.json',
                r2_bucket: 'test-bucket'
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        r2Storage.getJson.mockResolvedValue({
            patient: {
                raw: {
                    dpjp: 'dr. Latifa Maharani, Sp.OG'
                }
            }
        });

        const result = await operationData.backfillDoctorMetadataFromPayload({ facility: 'gambiran', limit: 10 });

        expect(result).toEqual(expect.objectContaining({
            scanned: 1,
            updated: 1
        }));
        expect(db.query.mock.calls[1][0]).toContain('UPDATE operation_data_index');
        expect(db.query.mock.calls[1][1]).toEqual([
            'dr. Latifa Maharani, Sp.OG',
            'latifa',
            'dpjp',
            2550
        ]);
    });

    test('backfillMedicalRecordNumbersFromPayload updates existing rows from R2 patient identifiers', async () => {
        db.query
            .mockResolvedValueOnce([[{
                id: 3429,
                facility: 'gambiran',
                r2_key: 'operation-data/gambiran/2026-06-27/item.json',
                r2_bucket: 'test-bucket'
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        r2Storage.getJson.mockResolvedValue({
            patient: {
                simrs_patient_id: '537912'
            },
            registration: {
                patient_id: '537912'
            }
        });

        const result = await operationData.backfillMedicalRecordNumbersFromPayload({ facility: 'gambiran', limit: 10 });

        expect(result).toEqual(expect.objectContaining({
            scanned: 1,
            updated: 1
        }));
        expect(db.query.mock.calls[1][0]).toContain('UPDATE operation_data_index');
        expect(db.query.mock.calls[1][1]).toEqual(['537912', 3429]);
    });

    test('updatePatientAges updates existing rows by source key', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);

        const result = await operationData.updatePatientAges([
            { source_key: 'gambiran:pendaftaran:19196', patient_age: '28 tahun' }
        ]);

        expect(result).toEqual({
            received: 1,
            updated: 1,
            errors: []
        });
        expect(db.query.mock.calls[0][0]).toContain('UPDATE operation_data_index');
        expect(db.query.mock.calls[0][1]).toEqual(['28 tahun', 'gambiran:pendaftaran:19196']);
    });

    test('list treats comma-separated operation search terms as case-insensitive OR terms', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 2 }]])
            .mockResolvedValueOnce([[]]);

        await operationData.list({
            q: 'svh, TAH',
            start: '2026-06-01',
            end: '2026-06-30'
        });

        const [countSql, countParams] = db.query.mock.calls[0];
        expect(countSql).toContain('LOWER(COALESCE(operation_name');
        expect(countSql).toContain(' OR ');
        expect(countParams).toEqual([
            '2026-06-01',
            '2026-06-30',
            '%svh%',
            '%svh%',
            '%svh%',
            '%svh%',
            '%tah%',
            '%tah%',
            '%tah%',
            '%tah%'
        ]);
    });
});
