const {
    canonicalSourceKey,
    ensureCanonicalUniqueIndex,
    validateDuplicateGroup
} = require('../../scripts/migrate-operation-doctor-journeys');

describe('operation doctor journey canonical migration', () => {
    test('keeps the exact registration source and archives every extra row', () => {
        const rows = [
            {
                id: 10,
                facility: 'gambiran',
                simrs_operasi_id: '11002',
                source_key: 'gambiran:med0000709328:11002',
                mr_id: '512995',
                patient_name: 'Pasien Audit',
                operation_date: '2025-04-21',
                case_id: 'med0000709328'
            },
            {
                id: 11,
                facility: 'gambiran',
                simrs_operasi_id: '11002',
                source_key: 'gambiran:pendaftaran:11002',
                mr_id: '512995',
                patient_name: 'Pasien Audit',
                operation_date: '2025-04-21',
                case_id: 'med0000426904'
            }
        ];

        const result = validateDuplicateGroup(rows);
        expect(canonicalSourceKey('gambiran', '11002')).toBe('gambiran:pendaftaran:11002');
        expect(result.canonical.id).toBe(11);
        expect(result.duplicates.map(row => row.id)).toEqual([10]);
    });

    test('allows stale display-name differences when MR and operation date agree', () => {
        const result = validateDuplicateGroup([
            { id: 1, facility: 'gambiran', simrs_operasi_id: '1', source_key: 'gambiran:pendaftaran:1', mr_id: '100', patient_name: 'Nama Kanonis', operation_date: '2026-01-01' },
            { id: 2, facility: 'gambiran', simrs_operasi_id: '1', source_key: 'gambiran:case:1', mr_id: '100', patient_name: 'Ny. Nama Cache', operation_date: '2026-01-01' }
        ]);
        expect(result.canonical.id).toBe(1);
        expect(result.duplicates).toHaveLength(1);
    });

    test('aborts an ambiguous or patient-mismatched duplicate group', () => {
        expect(() => validateDuplicateGroup([
            { id: 1, facility: 'gambiran', simrs_operasi_id: '1', source_key: 'gambiran:case:1' },
            { id: 2, facility: 'gambiran', simrs_operasi_id: '1', source_key: 'gambiran:case:2' }
        ])).toThrow(/Ambiguous canonical/);

        expect(() => validateDuplicateGroup([
            { id: 1, facility: 'gambiran', simrs_operasi_id: '1', source_key: 'gambiran:pendaftaran:1', mr_id: '100', patient_name: 'A', operation_date: '2026-01-01' },
            { id: 2, facility: 'gambiran', simrs_operasi_id: '1', source_key: 'gambiran:case:1', mr_id: '200', patient_name: 'B', operation_date: '2026-01-01' }
        ])).toThrow(/Integrity mismatch/);

        expect(() => validateDuplicateGroup([
            { id: 1, facility: 'gambiran', simrs_operasi_id: '1', source_key: 'gambiran:pendaftaran:1', mr_id: '100', patient_name: 'A', operation_date: '2026-01-01' },
            { id: 2, facility: 'gambiran', simrs_operasi_id: '1', source_key: 'gambiran:case:1', mr_id: '', patient_name: 'B', operation_date: '2026-01-01' }
        ])).toThrow(/Integrity mismatch/);
    });

    test('creates a Gambiran-only generated identity and unique index', async () => {
        const queries = [];
        const pool = {
            query: jest.fn(async (sql) => {
                queries.push(sql);
                if (sql.includes('duplicate_groups')) return [[{ duplicate_groups: 0 }]];
                if (sql.includes('information_schema.COLUMNS')) return [[]];
                if (sql.includes('information_schema.STATISTICS')) return [[]];
                return [[], []];
            })
        };

        await ensureCanonicalUniqueIndex(pool);

        const generatedColumnSql = queries.find(sql => sql.includes('ADD COLUMN gambiran_canonical_identity'));
        expect(generatedColumnSql).toContain("WHEN facility = 'gambiran'");
        expect(generatedColumnSql).toContain('ELSE NULL');
        expect(queries.some(sql => sql.includes('ADD UNIQUE KEY uq_operation_data_gambiran_operasi'))).toBe(true);
    });
});
