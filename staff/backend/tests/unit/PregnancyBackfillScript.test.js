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
            state.pregnancies.push({ id, fingerprint: params[params.length - 1], review_reason: params[params.length - 2], needs_review: params[params.length - 3] });
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
        const writesBefore = state.writes.length;
        const second = await run({ db, apply: true, today: TODAY, logger: silent });
        expect(second).toMatchObject({ pregnancies: 0, skipped_existing: 2, failed: 0 });
        expect(state.pregnancies).toHaveLength(2);
        // #7: no links are written for pregnancies that already existed.
        expect(state.writes.slice(writesBefore)).toEqual([]);
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
    test('a patient with a live-written pregnancy (NULL fingerprint) is skipped with no inserts', async () => {
        const { db, state } = makeDb();
        state.pregnancies.push({ id: 99, fingerprint: null });
        state.nextId = 100;
        const summary = await run({ db, apply: true, today: TODAY, logger: silent });
        expect(summary).toMatchObject({ patients: 1, pregnancies: 0, skipped_live: 1, failed: 0 });
        expect(summary.samples).toEqual([{ patient_id: 'P1', reason: 'Sudah ada data kehamilan dari aplikasi' }]);
        expect(state.writes).toEqual([]);
        expect(state.pregnancies).toHaveLength(1);
        expect(state.rollbacks).toBe(1);
    });

    test('#7 a partial re-run links only the pregnancies inserted in this run', async () => {
        const { db, state } = makeDb();
        state.pregnancies.push({ id: 50, fingerprint: 'c:DRD1' });
        state.nextId = 51;
        const summary = await run({ db, apply: true, today: TODAY, logger: silent });
        expect(summary).toMatchObject({ pregnancies: 1, skipped_existing: 1, failed: 0 });
        expect(state.writes.filter(w => w.startsWith('UPDATE'))).toEqual([]);
        expect(state.writes.filter(w => w.startsWith('INSERT'))).toHaveLength(1);
    });

    test('#3 review reasons are stored on the inserted pregnancy', async () => {
        const { db, state } = makeDb();
        await run({ db, apply: true, today: TODAY, logger: silent });
        // The visit history (2019 abortus) has no conflicts: nothing flagged, no reason stored.
        expect(state.pregnancies.every(p => p.review_reason === null)).toBe(true);
        const { db: db2, state: state2 } = makeDb();
        const origQuery = db2.query;
        db2.query = async (sql, params) => {
            const text = sql.replace(/\s+/g, ' ');
            if (text.startsWith('SELECT id, patient_id, birth_date')) return [[]];
            return origQuery(sql, params);
        };
        const conn = await db2.getConnection();
        db2.getConnection = async () => conn;
        const summary = await run({ db: db2, apply: true, today: TODAY, logger: silent });
        expect(summary.failed).toBe(0);
        // Without the birth the clinic pregnancy (HPHT 2025-01-01) ends unknown and is reviewed.
        expect(state2.pregnancies.find(p => p.fingerprint === 'c:DRD1')).toMatchObject({ needs_review: 1, review_reason: 'Akhir kehamilan tidak diketahui' });
    });
});
