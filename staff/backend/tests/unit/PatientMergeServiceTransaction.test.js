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

    describe('pregnancy data (stage 2, task 11)', () => {
        function pregnancyConnection({ fingerprints = [], ordered = [], ongoing = [] } = {}) {
            return {
                query: jest.fn(async sql => {
                    if (sql.includes('FROM information_schema.COLUMNS')) {
                        return [[{ table_name: 'pregnancies', patient_id_is_unique: 1, has_patient_name: 0 }]];
                    }
                    if (sql.includes('SELECT id, patient_id, fingerprint')) return [fingerprints];
                    if (sql.includes('SELECT id, sequence')) return [ordered];
                    if (sql.includes("status = 'ongoing'") && sql.trim().startsWith('SELECT')) return [ongoing];
                    if (sql.includes('UPDATE') && sql.includes('`pregnancies`') && sql.includes('SET patient_id')) {
                        return [{ affectedRows: 2 }];
                    }
                    return [{ affectedRows: 1 }];
                })
            };
        }

        test('a fingerprint collision never loses a pregnancy row: fingerprint is cleared and the row moves', async () => {
            const service = new PatientMergeService({ query: jest.fn() });
            const connection = pregnancyConnection({
                fingerprints: [
                    { id: 10, patient_id: 'P100', fingerprint: 'abc' },
                    { id: 20, patient_id: 'P200', fingerprint: 'ABC' },
                    { id: 21, patient_id: 'P200', fingerprint: 'def' },
                    { id: 30, patient_id: 'P300', fingerprint: 'def' },
                    { id: 31, patient_id: 'P300', fingerprint: 'ghi' }
                ]
            });

            const result = await service.transferDirectPatientTables(connection, 'P100', ['P200', 'P300'], 'Pasien Utama');

            const clearCall = connection.query.mock.calls.find(([sql]) => sql.includes('SET fingerprint = NULL'));
            expect(clearCall[0]).toContain('WHERE id IN (?, ?)');
            expect(clearCall[1]).toEqual(['Kemungkinan duplikat setelah gabung pasien', 20, 30]);
            // Flag the kept duplicate; an already-flagged row keeps its own reason. review_reason is
            // assigned before needs_review (MariaDB SET is evaluated left to right).
            const flat = clearCall[0].replace(/\s+/g, ' ');
            expect(flat).toContain("review_reason = CASE WHEN needs_review = 1 AND COALESCE(review_reason, '') <> '' THEN review_reason ELSE ? END");
            expect(flat.indexOf('review_reason = CASE')).toBeLessThan(flat.indexOf('needs_review = 1 WHERE'));
            expect(flat).toContain('needs_review = 1 WHERE id IN');
            const sqls = connection.query.mock.calls.map(([sql]) => sql);
            expect(sqls.some(sql => sql.includes('UPDATE IGNORE `pregnancies`'))).toBe(false);
            expect(sqls.some(sql => sql.includes('DELETE FROM `pregnancies`'))).toBe(false);
            const clearIndex = sqls.findIndex(sql => sql.includes('SET fingerprint = NULL'));
            const moveIndex = sqls.findIndex(sql => sql.includes('UPDATE `pregnancies`') && sql.includes('SET patient_id'));
            expect(clearIndex).toBeGreaterThan(-1);
            expect(moveIndex).toBeGreaterThan(clearIndex);
            expect(result.summary.pregnancies).toEqual({ moved: 2, conflicts_discarded: 0, fingerprints_cleared: 2 });
        });

        test('fingerprint collision detection ignores case and spaces in patient ids, like SQL does', async () => {
            const service = new PatientMergeService({ query: jest.fn() });
            const connection = pregnancyConnection({
                fingerprints: [
                    { id: 10, patient_id: 'p100 ', fingerprint: 'abc' },
                    { id: 20, patient_id: 'p200', fingerprint: 'abc' },
                    { id: 30, patient_id: 'P300', fingerprint: 'xyz' }
                ]
            });

            const result = await service.transferDirectPatientTables(connection, 'P100', ['P200', 'p300'], 'Pasien Utama');

            const clearCall = connection.query.mock.calls.find(([sql]) => sql.includes('SET fingerprint = NULL'));
            expect(clearCall[1]).toEqual(['Kemungkinan duplikat setelah gabung pasien', 20]);
            expect(result.summary.pregnancies.fingerprints_cleared).toBe(1);
        });

        test('merge normalisation re-numbers sequences 1..n and keeps only the newest-HPHT ongoing pregnancy', async () => {
            const service = new PatientMergeService({ query: jest.fn() });
            const connection = pregnancyConnection({
                ordered: [
                    { id: 5, sequence: 1, status: 'ended' },
                    { id: 20, sequence: 1, status: 'ongoing' },
                    { id: 7, sequence: 2, status: 'ended' },
                    { id: 9, sequence: 3, status: 'ongoing' }
                ],
                ongoing: [{ id: 9 }, { id: 20 }]
            });

            const result = await service.normalizeMergedPregnancies(connection, 'P100', {
                summary: { pregnancies: { moved: 2 } }
            });

            const calls = connection.query.mock.calls;
            const orderSql = calls.find(([sql]) => sql.includes('SELECT id, sequence'))[0];
            // Rows with neither hpht nor year sort LAST.
            expect(orderSql.replace(/\s+/g, ' ')).toContain(
                'ORDER BY (COALESCE(hpht, MAKEDATE(year, 1)) IS NULL) ASC, COALESCE(hpht, MAKEDATE(year, 1)) ASC, id ASC'
            );
            const ongoingSql = calls.find(([sql]) => sql.includes("status = 'ongoing'") && sql.trim().startsWith('SELECT'))[0];
            expect(ongoingSql).toContain('DESC, id DESC');

            const sequenceUpdates = calls
                .filter(([sql]) => sql.includes('SET sequence = ?'))
                .map(([, params]) => params);
            expect(sequenceUpdates).toEqual([[2, 20], [3, 7], [4, 9]]);

            const closeCall = calls.find(([sql]) => sql.includes("SET status = 'ended'"));
            expect(closeCall[0]).toContain("outcome = 'unknown'");
            expect(closeCall[0]).toContain('needs_review = 1');
            expect(closeCall[0]).toContain('review_reason = ?');
            expect(closeCall[0]).toContain('WHERE id IN (?)');
            expect(closeCall[1]).toEqual(['Digabung dari pasien lain', 20]);
            expect(result).toEqual({ renumbered: 3, ongoing_closed: [20] });
        });

        test('merge normalisation does nothing when no pregnancy moved', async () => {
            const service = new PatientMergeService({ query: jest.fn() });
            const connection = pregnancyConnection();
            const result = await service.normalizeMergedPregnancies(connection, 'P100', { summary: {} });
            expect(connection.query).not.toHaveBeenCalled();
            expect(result).toEqual({ renumbered: 0, ongoing_closed: [] });
        });

        test('mergePatients normalises pregnancies inside the transaction before commit', async () => {
            const connection = makeConnection();
            const db = { query: jest.fn(), getConnection: jest.fn(async () => connection) };
            const service = new PatientMergeService(db);
            const order = [];

            jest.spyOn(service, 'preview').mockResolvedValue(makePreview());
            jest.spyOn(service, 'transferDirectPatientTables').mockResolvedValue({
                summary: { pregnancies: { moved: 1, conflicts_discarded: 0 } },
                tableMetadata: []
            });
            jest.spyOn(service, 'transferSecondaryPatientReferences').mockResolvedValue({});
            jest.spyOn(service, 'rebuildPatientMrHistory').mockResolvedValue(0);
            jest.spyOn(service, 'refreshPatientAggregates').mockResolvedValue();
            jest.spyOn(service, 'verifyNoRemainingReferences').mockResolvedValue();
            const normalize = jest.spyOn(service, 'normalizeMergedPregnancies').mockImplementation(async conn => {
                order.push('normalize');
                expect(conn).toBe(connection);
                return { renumbered: 1, ongoing_closed: [] };
            });
            connection.commit.mockImplementation(async () => { order.push('commit'); });

            const result = await service.mergePatients({ targetPatientId: 'P100', sourcePatientIds: ['P200', 'P300'] });

            expect(normalize).toHaveBeenCalledWith(connection, 'P100', expect.objectContaining({ summary: expect.any(Object) }));
            expect(order).toEqual(['normalize', 'commit']);
            expect(result.transfer_summary.pregnancies_normalized).toEqual({ renumbered: 1, ongoing_closed: [] });
        });
    });
});
