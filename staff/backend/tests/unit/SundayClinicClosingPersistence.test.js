'use strict';

const {
    buildClosingPreview,
    loadFinancialSources,
    createClosing,
    assertSundayClinicAccountingDateOpen,
    acquireSundayClinicAccountingDateGuard,
    getClosingDetailWithReconciliation,
    resolveServiceDate
} = require('../../services/SundayClinicClosingService');

function compact(sql) {
    return String(sql).replace(/\s+/g, ' ').trim();
}

function closingRow(fingerprint) {
    return {
        id: 7,
        clinic_date: '2026-07-19',
        main_total: '0.00',
        additional_total: '0.00',
        grand_total: '0.00',
        patient_count: 0,
        transaction_count: 0,
        summary_json: JSON.stringify({
            main_total: 0,
            additional_total: 0,
            grand_total: 0,
            patient_count: 0,
            transaction_count: 0
        }),
        breakdown_json: JSON.stringify({ tindakan: 0, obat: 0, administratif: 0 }),
        source_fingerprint: fingerprint,
        closed_by_user_id: 'doctor-1',
        closed_by_name: 'Dokter Test',
        closed_by_role: 'dokter',
        closed_at: '2026-07-19 14:00:00',
        created_at: '2026-07-19 14:00:00'
    };
}

describe('Sunday Clinic closing persistence', () => {
    test('financial source SQL is scoped to Klinik Privat and resolves collation drift explicitly', async () => {
        const calls = [];
        const client = {
            query: jest.fn(async (sql, params) => {
                calls.push({ sql: compact(sql), params });
                return [[], []];
            })
        };

        await loadFinancialSources(client, '2026-07-19');

        const sql = calls.map(call => call.sql).join('\n');
        expect(sql).toContain("scr.visit_location = 'klinik_private'");
        expect(sql).toContain('COALESCE(sa.appointment_date, DATE(scr.created_at)) = ?');
        expect(sql).toContain('b.mr_id COLLATE utf8mb4_unicode_ci = scr.mr_id');
        expect(sql).toContain('ab.mr_id COLLATE utf8mb4_unicode_ci = scr.mr_id');
        expect(sql).toContain('b.pending_changes');
        expect(sql).toContain('FROM sunday_clinic_billing_revisions br');
        expect(sql).toContain("br.status = 'pending'");
        expect(calls.every(call => call.params[0] === '2026-07-19')).toBe(true);
    });

    test('creates one immutable snapshot under a named lock and transaction', async () => {
        const preview = buildClosingPreview({ clinicDate: '2026-07-19' });
        const header = closingRow(preview.fingerprint);
        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            query: jest.fn(async sql => {
                const query = compact(sql);
                if (query.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }], []];
                if (query.includes('FROM sunday_clinic_closings') && query.includes('WHERE clinic_date')) return [[], []];
                if (query.includes('FROM sunday_clinic_records scr')) return [[], []];
                if (query.includes('FROM sunday_clinic_billings b')) return [[], []];
                if (query.includes('FROM sunday_clinic_additional_billings ab')) return [[], []];
                if (query.includes('FROM sunday_clinic_billing_revisions br')) return [[], []];
                if (query.startsWith('INSERT INTO sunday_clinic_closings')) return [{ insertId: 7 }, []];
                if (query.includes('FROM sunday_clinic_closings') && query.includes('WHERE id')) return [[header], []];
                if (query.includes('FROM sunday_clinic_closing_entries')) return [[], []];
                if (query.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }], []];
                throw new Error(`Unexpected SQL: ${query}`);
            })
        };
        const pool = { getConnection: jest.fn().mockResolvedValue(connection) };

        const result = await createClosing(pool, {
            date: '2026-07-19',
            fingerprint: preview.fingerprint,
            actor: { userId: 'doctor-1', name: 'Dokter Test', role: 'dokter' }
        });

        expect(result).toMatchObject({ id: 7, status: 'closed', created: true, idempotent: false });
        expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.query.mock.calls.some(([sql]) => compact(sql).startsWith('SELECT GET_LOCK'))).toBe(true);
        expect(connection.query.mock.calls.some(([sql]) => compact(sql).startsWith('SELECT RELEASE_LOCK'))).toBe(true);
        expect(connection.query.mock.calls.filter(([sql]) => compact(sql).startsWith('INSERT INTO sunday_clinic_closings'))).toHaveLength(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test('same fingerprint is idempotent and never inserts another closing', async () => {
        const preview = buildClosingPreview({ clinicDate: '2026-07-19' });
        const header = closingRow(preview.fingerprint);
        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            query: jest.fn(async sql => {
                const query = compact(sql);
                if (query.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }], []];
                if (query.includes('FROM sunday_clinic_closings') && query.includes('WHERE clinic_date')) return [[header], []];
                if (query.includes('FROM sunday_clinic_closing_entries')) return [[], []];
                if (query.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }], []];
                throw new Error(`Unexpected SQL: ${query}`);
            })
        };

        const result = await createClosing({ getConnection: async () => connection }, {
            date: '2026-07-19',
            fingerprint: preview.fingerprint,
            actor: { userId: 'doctor-1', name: 'Dokter Test', role: 'dokter' }
        });

        expect(result).toMatchObject({ id: 7, created: false, idempotent: true });
        expect(connection.query.mock.calls.some(([sql]) => compact(sql).startsWith('INSERT INTO'))).toBe(false);
        expect(connection.commit).toHaveBeenCalledTimes(1);
    });

    test('financial mutations receive the canonical closed-date conflict', async () => {
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce([[{ clinic_date: '2026-07-19' }], []])
                .mockResolvedValueOnce([[{ id: 7 }], []])
        };

        await expect(assertSundayClinicAccountingDateOpen(client, { billingId: 11 }))
            .rejects.toMatchObject({
                statusCode: 409,
                code: 'SUNDAY_CLINIC_CLOSED',
                clinicDate: '2026-07-19'
            });
    });

    test('financial mutations fail closed when the closing migration is missing', async () => {
        const missingTable = Object.assign(new Error('Table does not exist'), {
            code: 'ER_NO_SUCH_TABLE',
            errno: 1146
        });
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce([[{ clinic_date: '2026-07-19' }], []])
                .mockRejectedValueOnce(missingTable)
        };

        await expect(assertSundayClinicAccountingDateOpen(client, { billingId: 11 }))
            .rejects.toMatchObject({
                statusCode: 503,
                code: 'SUNDAY_CLINIC_CLOSING_SCHEMA_MISSING'
            });
    });

    test('patient billing date resolution is ownership-scoped before acquiring a closing lock', async () => {
        const client = {
            query: jest.fn().mockResolvedValue([[], []])
        };

        await expect(resolveServiceDate(client, {
            billingId: 11,
            patientId: 'P0011'
        })).resolves.toBeNull();

        const [sql, params] = client.query.mock.calls[0];
        expect(compact(sql)).toContain('AND b.patient_id = ?');
        expect(params).toEqual([11, 'P0011']);
    });

    test('mutation guard holds the same named lock until the response lifecycle releases it', async () => {
        const connection = {
            release: jest.fn(),
            query: jest.fn()
                .mockResolvedValueOnce([[{ clinic_date: '2026-07-19' }], []])
                .mockResolvedValueOnce([[{ acquired: 1 }], []])
                .mockResolvedValueOnce([[{ clinic_date: '2026-07-19' }], []])
                .mockResolvedValueOnce([[], []])
                .mockResolvedValueOnce([[{ released: 1 }], []])
        };
        const guard = await acquireSundayClinicAccountingDateGuard(
            { getConnection: async () => connection },
            { billingId: 11 }
        );

        expect(guard.clinicDate).toBe('2026-07-19');
        expect(connection.release).not.toHaveBeenCalled();
        expect(connection.query.mock.calls[1][0]).toContain('GET_LOCK');

        await guard.release();
        await guard.release();

        expect(connection.query.mock.calls.filter(([sql]) => String(sql).includes('RELEASE_LOCK'))).toHaveLength(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test('history detail reconciles live sources while preserving the immutable snapshot', async () => {
        const snapshot = buildClosingPreview({ clinicDate: '2026-07-19' });
        const header = closingRow(snapshot.fingerprint);
        const client = {
            query: jest.fn(async sql => {
                const query = compact(sql);
                if (query.includes('FROM sunday_clinic_closings') && query.includes('WHERE id')) {
                    expect(query).toContain("DATE_FORMAT(clinic_date, '%Y-%m-%d')");
                    return [[header], []];
                }
                if (query.includes('FROM sunday_clinic_closing_entries')) return [[], []];
                if (query.includes('FROM sunday_clinic_records scr')) {
                    return [[{ mr_id: 'DRD0099', patient_id: 'P0099', patient_name: 'Pasien Baru', billing_id: null }], []];
                }
                if (query.includes('FROM sunday_clinic_billings b')) return [[], []];
                if (query.includes('FROM sunday_clinic_additional_billings ab')) return [[], []];
                if (query.includes('FROM sunday_clinic_billing_revisions br')) return [[], []];
                throw new Error(`Unexpected SQL: ${query}`);
            })
        };

        const detail = await getClosingDetailWithReconciliation(client, 7);

        expect(detail.id).toBe(7);
        expect(detail.fingerprint).toBe(snapshot.fingerprint);
        expect(detail.transactions).toEqual([]);
        expect(detail.anomalies).toEqual([
            expect.objectContaining({ code: 'POST_CLOSE_SOURCE_CHANGED' })
        ]);
        expect(detail.post_close_exceptions).toEqual(detail.anomalies);
    });
});
