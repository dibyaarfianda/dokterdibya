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
});
