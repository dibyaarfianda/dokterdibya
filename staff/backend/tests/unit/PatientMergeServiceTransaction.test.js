const { PatientMergeService, PatientMergeError } = require('../../services/PatientMergeService');

function makeConnection() {
    return {
        beginTransaction: jest.fn(async () => {}),
        commit: jest.fn(async () => {}),
        rollback: jest.fn(async () => {}),
        release: jest.fn(),
        query: jest.fn(async sql => {
            if (sql.includes('SELECT * FROM users')) return [[]];
            if (sql.includes('DELETE FROM users')) return [{ affectedRows: 2 }];
            if (sql.includes('DELETE FROM patients')) return [{ affectedRows: 2 }];
            return [{ affectedRows: 0 }];
        })
    };
}

function makePreview() {
    return {
        target: { id: 'P100', full_name: 'Pasien Utama' },
        sources: [
            { id: 'P200', full_name: 'Duplikat Dua' },
            { id: 'P300', full_name: 'Duplikat Tiga' }
        ],
        source_drds: [
            { patient_id: 'P300', mr_id: 'DRD20' },
            { patient_id: 'P200', mr_id: 'DRD3' }
        ],
        resulting_drds: [
            { patient_id: 'P200', mr_id: 'DRD3' },
            { patient_id: 'P300', mr_id: 'DRD20' }
        ]
    };
}

describe('PatientMergeService transaction', () => {
    test('commits one atomic merge and permanently deletes every source account', async () => {
        const connection = makeConnection();
        const db = { query: jest.fn(), getConnection: jest.fn(async () => connection) };
        const service = new PatientMergeService(db);

        jest.spyOn(service, 'preview').mockResolvedValue(makePreview());
        jest.spyOn(service, 'transferDirectPatientTables').mockResolvedValue({ summary: {}, tableMetadata: [] });
        jest.spyOn(service, 'transferSecondaryPatientReferences').mockResolvedValue({});
        jest.spyOn(service, 'rebuildPatientMrHistory').mockResolvedValue(2);
        jest.spyOn(service, 'refreshPatientAggregates').mockResolvedValue();
        jest.spyOn(service, 'verifyNoRemainingReferences').mockResolvedValue();

        const result = await service.mergePatients({
            targetPatientId: 'P100',
            sourcePatientIds: ['P300', 'P200'],
            actor: { id: 'DR1', name: 'Dokter' }
        });

        expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
        expect(result.deleted_sources.map(item => item.id)).toEqual(['P200', 'P300']);
        expect(connection.query).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM patients'),
            ['P200', 'P300']
        );
        expect(connection.query).toHaveBeenCalledWith(
            expect.stringContaining("SET status = 'deleted'"),
            expect.arrayContaining([expect.any(String), expect.any(String)])
        );
    });

    test('rolls back without deleting sources when an unclassified reference blocks transfer', async () => {
        const connection = makeConnection();
        const db = { query: jest.fn(), getConnection: jest.fn(async () => connection) };
        const service = new PatientMergeService(db);

        jest.spyOn(service, 'preview').mockResolvedValue(makePreview());
        jest.spyOn(service, 'transferDirectPatientTables').mockResolvedValue({ summary: {}, tableMetadata: [] });
        jest.spyOn(service, 'transferSecondaryPatientReferences').mockResolvedValue({});
        jest.spyOn(service, 'rebuildPatientMrHistory').mockResolvedValue(2);
        jest.spyOn(service, 'refreshPatientAggregates').mockResolvedValue();
        jest.spyOn(service, 'verifyNoRemainingReferences').mockRejectedValue(
            new PatientMergeError('Relasi belum aman', 409, 'UNMOVED_PATIENT_REFERENCES')
        );

        await expect(service.mergePatients({
            targetPatientId: 'P100',
            sourcePatientIds: ['P200', 'P300']
        })).rejects.toMatchObject({ code: 'UNMOVED_PATIENT_REFERENCES' });

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM patients'))).toBe(false);
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test('moves non-conflicting rows and discards only target-key duplicates', async () => {
        const db = { query: jest.fn() };
        const service = new PatientMergeService(db);
        const connection = {
            query: jest.fn()
                .mockResolvedValueOnce([[{
                    table_name: 'medical_records',
                    patient_id_is_unique: 0,
                    has_patient_name: 0
                }, {
                    table_name: 'patient_portal_settings',
                    patient_id_is_unique: 1,
                    has_patient_name: 0
                }]])
                .mockResolvedValueOnce([{ affectedRows: 4 }])
                .mockResolvedValueOnce([{ affectedRows: 0 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([{ affectedRows: 0 }])
        };

        const result = await service.transferDirectPatientTables(
            connection,
            'P100',
            ['P200', 'P300'],
            'Pasien Utama'
        );

        expect(result.summary.medical_records).toEqual({ moved: 4, conflicts_discarded: 0 });
        expect(result.summary.patient_portal_settings).toEqual({ moved: 1, conflicts_discarded: 1 });
        expect(connection.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE IGNORE `patient_portal_settings`'),
            ['P100', 'P200']
        );
    });
});
