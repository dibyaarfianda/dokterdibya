'use strict';

jest.mock('../../services/sunday-clinic/shared', () => ({
    db: { query: jest.fn() },
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
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('persists anamnesa and advances the private-clinic queue', async () => {
        shared.findRecordByMrId.mockResolvedValue({
            patient_id: 'P0001',
            visit_location: 'klinik_private'
        });
        shared.db.query
            .mockResolvedValueOnce([[{ id: 17 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const req = {
            params: { mrId: 'drd0988', section: 'anamnesa' },
            body: { keluhan_utama: 'Kontrol kehamilan' },
            user: { id: 'USR0001', name: 'Dokter' },
            get: jest.fn(() => null)
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const next = jest.fn();

        await postRecordsByMrIdBySection(req, res, next);

        expect(shared.db.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE medical_records SET record_data'),
            expect.arrayContaining([17])
        );
        expect(updateQueueStatus).toHaveBeenCalledWith('DRD0988', 'anamnesa');
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: 'Data anamnesa berhasil disimpan'
        });
        expect(next).not.toHaveBeenCalled();
    });
});
