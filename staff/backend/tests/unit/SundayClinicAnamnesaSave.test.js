'use strict';

jest.mock('../../services/sunday-clinic/shared', () => ({
    db: {
        query: jest.fn(),
        getConnection: jest.fn()
    },
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    },
    findRecordByMrId: jest.fn(),
    normalizeMrId: jest.fn((value) => String(value || '').toUpperCase()),
    sundayClinicMedifySyncQueue: { enqueueDiagnosis: jest.fn() },
    MEDIFY_SOAP_SYNC_SECTIONS: new Set()
}));

jest.mock('../../services/sunday-clinic/queue', () => ({
    updateQueueStatus: jest.fn()
}));

const shared = require('../../services/sunday-clinic/shared');
const { updateQueueStatus } = require('../../services/sunday-clinic/queue');
const { postRecordsByMrIdBySection } = require('../../services/sunday-clinic/records');

describe('Sunday Clinic anamnesa save', () => {
    let connection;

    beforeEach(() => {
        jest.clearAllMocks();
        connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            query: jest.fn(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn()
        };
        shared.db.getConnection.mockResolvedValue(connection);
    });

    test('persists anamnesa and advances the private-clinic queue', async () => {
        shared.findRecordByMrId.mockResolvedValue({
            patient_id: 'P0001',
            visit_location: 'klinik_private'
        });
        connection.query
            .mockResolvedValueOnce([[{ id: 91 }]])
            .mockResolvedValueOnce([[{
                id: 17,
                record_data: JSON.stringify({
                    keluhan_utama: 'Kontrol lama',
                    alergi_obat: 'Penisilin'
                })
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const req = {
            params: { mrId: 'drd0988', section: 'anamnesa' },
            body: {
                __concurrent_merge_v1: true,
                base_data: {
                    keluhan_utama: 'Kontrol lama',
                    alergi_obat: '-'
                },
                data: {
                    keluhan_utama: 'Kontrol kehamilan',
                    alergi_obat: '-'
                }
            },
            user: { id: 'USR0001', name: 'Dokter' },
            get: jest.fn(() => null)
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const next = jest.fn();

        await postRecordsByMrIdBySection(req, res, next);

        expect(connection.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE medical_records'),
            expect.arrayContaining([
                JSON.stringify({
                    keluhan_utama: 'Kontrol kehamilan',
                    alergi_obat: 'Penisilin'
                }),
                17
            ])
        );
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
        expect(updateQueueStatus).toHaveBeenCalledWith('DRD0988', 'anamnesa');
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: 'Data anamnesa berhasil disimpan',
            data: {
                section: 'anamnesa',
                record_data: {
                    keluhan_utama: 'Kontrol kehamilan',
                    alergi_obat: 'Penisilin'
                }
            }
        });
        expect(next).not.toHaveBeenCalled();
    });
});
