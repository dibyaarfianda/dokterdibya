'use strict';

const {
    createMelindaDrugUsageSync,
    periodsForNight,
    periodsBetween,
    monthRange,
    REQUEST_GAP_MS,
    SLOW_RESPONSE_MS
} = require('../../services/MelindaDrugUsageSync');

const REPORT = {
    items: [{
        itemKey: 'infus rl', code: 'B1', name: 'Infus RL', itemType: 'obat', qty: 2, value: 17660,
        inacbgQty: 0, inacbgValue: 0, hari23Qty: 0, hari23Value: 0, dukQty: 0, dukValue: 0
    }],
    totals: { qty: 2, value: 17660 }
};

function harness({ lock = 1, parse = async () => REPORT, responses = () => ({ status: 200, buffer: Buffer.from('PK'), ms: 100 }) } = {}) {
    const log = [];
    const connection = {
        query: jest.fn(async (sql, params) => {
            log.push({ sql, params });
            if (sql.includes('GET_LOCK')) return [[{ got: lock }]];
            if (sql.includes('INSERT INTO melinda_drug_usage_runs')) return [{ insertId: 7 }];
            return [{}];
        }),
        beginTransaction: jest.fn(async () => log.push({ sql: 'BEGIN' })),
        commit: jest.fn(async () => log.push({ sql: 'COMMIT' })),
        rollback: jest.fn(async () => log.push({ sql: 'ROLLBACK' })),
        release: jest.fn()
    };
    const pool = { getConnection: jest.fn(async () => connection) };
    const fetches = [];
    const session = {
        login: jest.fn(async () => true),
        fetchDrugUsageReport: jest.fn(async (depot, from, to) => {
            fetches.push({ depot, from, to });
            return responses(fetches.length);
        })
    };
    const sleep = jest.fn(async () => {});
    const sync = createMelindaDrugUsageSync({
        pool, createSession: () => session, parse, sleep, now: () => new Date(2026, 10, 23, 2, 0, 0)
    });
    const runUpdate = () => log.find(entry => entry.sql.startsWith('UPDATE melinda_drug_usage_runs'));
    return { sync, session, fetches, sleep, log, connection, runUpdate };
}

describe('Melinda drug usage periods', () => {
    test('refreshes the previous month through day 5 only', () => {
        expect(periodsForNight(new Date(2026, 10, 5))).toEqual(['2026-10', '2026-11']);
        expect(periodsForNight(new Date(2026, 10, 6))).toEqual(['2026-11']);
    });

    test('rolls back across January', () => {
        expect(periodsForNight(new Date(2027, 0, 1))).toEqual(['2026-12', '2027-01']);
    });

    test('lists a backfill range across a year', () => {
        expect(periodsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
        expect(() => periodsBetween('2026-12', '2026-11')).toThrow();
    });

    test('caps the current month at today and uses the full past month', () => {
        const today = new Date(2026, 10, 23);
        expect(monthRange('2026-11', today)).toEqual({ from: '01/11/2026', to: '23/11/2026' });
        expect(monthRange('2026-10', today)).toEqual({ from: '01/10/2026', to: '31/10/2026' });
        expect(monthRange('2024-02', today)).toEqual({ from: '01/02/2024', to: '29/02/2024' });
        expect(() => monthRange('2026-12', today)).toThrow();
    });
});

describe('Melinda drug usage sync', () => {
    test('fetches 8 depots one at a time, 4 seconds apart', async () => {
        const h = harness();
        const result = await h.sync.run();
        expect(result).toMatchObject({ status: 'success', reportsSaved: 8 });
        expect(h.session.login).toHaveBeenCalledTimes(1);
        expect(h.fetches).toHaveLength(8);
        expect(h.fetches[0]).toEqual({ depot: 'depo-rawat-jalan', from: '01/11/2026', to: '23/11/2026' });
        expect(h.sleep).toHaveBeenCalledTimes(7);
        expect(h.sleep).toHaveBeenCalledWith(REQUEST_GAP_MS);
        expect(REQUEST_GAP_MS).toBe(4000);
    });

    test('replaces a month and depot inside one transaction', async () => {
        const h = harness();
        await h.sync.run();
        const sql = h.log.map(entry => entry.sql);
        const begin = sql.indexOf('BEGIN');
        const remove = sql.findIndex(text => text.startsWith('DELETE FROM melinda_drug_usage'));
        const insert = sql.findIndex(text => text.includes('INSERT INTO melinda_drug_usage\n'));
        const commit = sql.indexOf('COMMIT');
        expect(begin).toBeLessThan(remove);
        expect(remove).toBeLessThan(insert);
        expect(insert).toBeLessThan(commit);
    });

    test('an invalid report stops the run and leaves that depot untouched', async () => {
        let calls = 0;
        const parse = async () => {
            calls += 1;
            if (calls === 3) throw new Error('Format laporan Medify berubah');
            return REPORT;
        };
        const h = harness({ parse });
        const result = await h.sync.run();
        expect(result).toMatchObject({ status: 'failed', reportsSaved: 2 });
        expect(result.message).toContain('depo-ruang-bayi 2026-11');
        expect(h.fetches).toHaveLength(3);
        expect(h.log.filter(entry => entry.sql.startsWith('DELETE FROM melinda_drug_usage'))).toHaveLength(2);
        expect(h.runUpdate().params.slice(0, 2)).toEqual(['failed', 2]);
    });

    test('an HTTP error stops the run', async () => {
        const h = harness({ responses: () => ({ status: 500, buffer: Buffer.from(''), ms: 100 }) });
        const result = await h.sync.run();
        expect(result).toMatchObject({ status: 'failed', reportsSaved: 0 });
        expect(h.fetches).toHaveLength(1);
    });

    test('a slow response saves that report and stops', async () => {
        const h = harness({ responses: n => ({ status: 200, buffer: Buffer.from('PK'), ms: n === 2 ? SLOW_RESPONSE_MS + 1 : 100 }) });
        const result = await h.sync.run();
        expect(result).toMatchObject({ status: 'stopped', reportsSaved: 2 });
        expect(h.fetches).toHaveLength(2);
    });

    test('a second run exits without contacting Medify', async () => {
        const h = harness({ lock: 0 });
        const result = await h.sync.run();
        expect(result.status).toBe('skipped');
        expect(h.session.login).not.toHaveBeenCalled();
        expect(h.connection.release).toHaveBeenCalled();
    });

    test('a failed login is recorded and releases the lock', async () => {
        const h = harness();
        h.session.login.mockRejectedValue(new Error('Login failed'));
        const result = await h.sync.run();
        expect(result).toMatchObject({ status: 'failed', reportsSaved: 0 });
        expect(h.log.some(entry => entry.sql.includes('RELEASE_LOCK'))).toBe(true);
    });
});
