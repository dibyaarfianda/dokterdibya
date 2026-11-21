'use strict';

const { run, parseArguments } = require('../../scripts/backfill-pregnancies');

const TODAY = new Date(2026, 10, 21);

function makeDb() {
    const state = { pregnancies: [], writes: [], nextId: 1, commits: 0, rollbacks: 0 };
    const rows = {
        visits: [{ mr_id: 'DRD1', patient_id: 'P1', mr_category: 'obstetri', created_at: '2025-05-01 09:00:00', import_source: null }],
        anamnesa: [{ mr_id: 'DRD1', record_data: JSON.stringify({ hpht: '2025-01-01', riwayat_persalinan: [{ type: 'ABORTUS', tahun: '2019' }] }) }],
        births: [{ id: 7, patient_id: 'P1', birth_date: '2025-10-08', created_at: '2025-10-08 10:00:00', child_number: 1, birth_weight: '3200 gram', gender: 'male' }],
        outcomes: []
    };
    async function query(sql, params) {
        const text = sql.replace(/\s+/g, ' ');
        if (text.startsWith('SELECT patient_id FROM (')) return [[{ patient_id: 'P1' }]];
        if (text.includes('FROM sunday_clinic_records WHERE mr_category')) return [rows.visits];
        if (text.includes('FROM medical_records')) return [rows.anamnesa];
        if (text.includes('FROM birth_congratulations')) return [rows.births];
        if (text.includes('FROM pregnancy_outcomes')) return [rows.outcomes];
        if (text.startsWith('SELECT id, fingerprint FROM pregnancies')) {
            return [state.pregnancies.map(p => ({ id: p.id, fingerprint: p.fingerprint }))];
        }
        if (text.startsWith('INSERT INTO pregnancies')) {
            const id = state.nextId++;
            state.pregnancies.push({ id, fingerprint: params[params.length - 1] });
            state.writes.push(text);
            return [{ insertId: id }];
        }
        if (text.startsWith('UPDATE')) {
            state.writes.push(text);
            return [{ affectedRows: 1 }];
        }
        throw new Error(`unexpected sql: ${text}`);
    }
    const conn = {
        query,
        beginTransaction: async () => {},
        commit: async () => { state.commits += 1; },
        rollback: async () => { state.rollbacks += 1; },
        release: () => {}
    };
    return { db: { query, getConnection: async () => conn }, state };
}

const silent = { error: () => {}, warn: () => {} };

describe('backfill-pregnancies script', () => {
    test('rejects unknown arguments', () => {
        expect(() => parseArguments(['--force'])).toThrow();
        expect(parseArguments(['--apply'])).toEqual({ apply: true });
        expect(parseArguments([])).toEqual({ apply: false });
    });

    test('dry run reports counts and writes nothing', async () => {
        const { db, state } = makeDb();
        const summary = await run({ db, apply: false, today: TODAY, logger: silent });
        expect(summary).toMatchObject({ mode: 'dry-run', patients: 1, pregnancies: 2, clinic: 1, external: 1, ongoing: 0, failed: 0 });
        expect(state.writes).toEqual([]);
        expect(state.commits).toBe(0);
    });

    test('apply writes once and a re-run creates no duplicate pregnancies', async () => {
        const { db, state } = makeDb();
        const first = await run({ db, apply: true, today: TODAY, logger: silent });
        expect(first).toMatchObject({ mode: 'apply', pregnancies: 2, failed: 0 });
        expect(state.pregnancies.map(p => p.fingerprint).sort()).toEqual(['c:DRD1', 'e:0:2019:ABORTUS']);
        expect(state.commits).toBe(1);
        const second = await run({ db, apply: true, today: TODAY, logger: silent });
        expect(second).toMatchObject({ pregnancies: 0, skipped_existing: 2, failed: 0 });
        expect(state.pregnancies).toHaveLength(2);
    });

    test('one patient failing is logged by id and code only and counted', async () => {
        const { db } = makeDb();
        const errors = [];
        const failingDb = {
            ...db,
            getConnection: async () => {
                const conn = await db.getConnection();
                return { ...conn, query: async () => { const e = new Error('secret clinical text'); e.code = 'ER_FAKE'; throw e; } };
            }
        };
        const summary = await run({ db: failingDb, apply: true, today: TODAY, logger: { error: m => errors.push(m) } });
        expect(summary.failed).toBe(1);
        expect(errors).toEqual(['[backfill-pregnancies] gagal untuk pasien P1: ER_FAKE']);
    });
});
