'use strict';

const PE = require('../../services/PregnancyEnd');

describe('PregnancyEnd.resolvePregnancyEnd', () => {
    test('no events -> not ended', () => {
        expect(PE.resolvePregnancyEnd('2026-05-01', [])).toEqual({ ended: false });
    });

    test('tolerance boundary: birth 21 days before not ended; -14 ended; -15 not', () => {
        expect(PE.resolvePregnancyEnd('2026-05-01', [{ type: 'birth', date: '2026-04-10' }])).toEqual({ ended: false });
        expect(PE.resolvePregnancyEnd('2026-05-01', [{ type: 'keguguran', date: '2026-04-17' }]))
            .toMatchObject({ ended: true, type: 'keguguran', date: '2026-04-17' });
        expect(PE.resolvePregnancyEnd('2026-05-01', [{ type: 'keguguran', date: '2026-04-16' }])).toEqual({ ended: false });
        expect(PE.END_TOLERANCE_DAYS).toBe(14);
    });

    test('latest qualifying event is reported', () => {
        const r = PE.resolvePregnancyEnd('2026-05-01', [
            { type: 'birth', date: '2026-06-01' },
            { type: 'keguguran', date: '2026-07-20' }
        ]);
        expect(r).toEqual({ ended: true, type: 'keguguran', date: '2026-07-20' });
    });

    test('outcome events carry id and note', () => {
        const r = PE.resolvePregnancyEnd('2026-05-01', [{ type: 'lahir_mati', date: '2026-08-01', id: 7, note: 'x' }]);
        expect(r).toEqual({ ended: true, type: 'lahir_mati', date: '2026-08-01', id: 7, note: 'x' });
    });

    test('datetime-ish HPHT behaves like plain date', () => {
        const ev = [{ type: 'birth', date: '2026-06-01' }];
        expect(PE.resolvePregnancyEnd('2026-05-01T00:00', ev).ended).toBe(true);
        expect(PE.resolvePregnancyEnd('2026-05-01 00:00:00', ev).ended).toBe(true);
    });

    test('invalid HPHT -> not ended', () => {
        const ev = [{ type: 'birth', date: '2026-06-01' }];
        expect(PE.resolvePregnancyEnd('abc', ev)).toEqual({ ended: false });
        expect(PE.resolvePregnancyEnd('', ev)).toEqual({ ended: false });
        expect(PE.resolvePregnancyEnd(null, ev)).toEqual({ ended: false });
    });
});

describe('PregnancyEnd.toDateString', () => {
    test('handles Date, string, junk', () => {
        expect(PE.toDateString(new Date(2026, 4, 1, 15, 30))).toBe('2026-05-01');
        expect(PE.toDateString('2026-05-01 10:00:00')).toBe('2026-05-01');
        expect(PE.toDateString('2026-02-31')).toBeNull();
        expect(PE.toDateString(null)).toBeNull();
        expect(PE.toDateString(new Date('x'))).toBeNull();
    });
});

describe('PregnancyEnd.hphtFromReference', () => {
    test('hpl minus 280 days, hpht passthrough, null', () => {
        expect(PE.hphtFromReference({ kind: 'hpl', date: '2027-02-05' })).toBe('2026-05-01');
        expect(PE.hphtFromReference({ kind: 'hpht', date: '2026-05-01' })).toBe('2026-05-01');
        expect(PE.hphtFromReference(null)).toBeNull();
    });
});

describe('PregnancyEnd.loadEndEvents', () => {
    test('groups outcome and birth rows by patient', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                if (sql.includes('pregnancy_outcomes')) {
                    return [[{ id: 3, patient_id: 'P1', outcome_type: 'keguguran', event_date: new Date(2026, 6, 20), note: 'n' }]];
                }
                return [[
                    { patient_id: 'P1', birth_date: null, created_at: '2026-06-03 10:00:00' },
                    { patient_id: 'P2', birth_date: '2026-01-02', created_at: '2026-01-05 10:00:00' }
                ]];
            })
        };
        const map = await PE.loadEndEvents(db, ['P1', 'P2']);
        expect(map.get('P1')).toEqual(expect.arrayContaining([
            { type: 'keguguran', date: '2026-07-20', id: 3, note: 'n' },
            { type: 'birth', date: '2026-06-03' }
        ]));
        expect(map.get('P2')).toEqual([{ type: 'birth', date: '2026-01-02' }]);
        const outcomeSql = db.query.mock.calls.map(c => c[0]).find(s => s.includes('pregnancy_outcomes'));
        expect(outcomeSql).toContain('voided_at IS NULL');
    });

    test('missing outcomes table -> births only, one warning', async () => {
        const logger = { warn: jest.fn() };
        const db = {
            query: jest.fn(async (sql) => {
                if (sql.includes('pregnancy_outcomes')) throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
                return [[{ patient_id: 'P1', birth_date: '2026-06-01', created_at: '2026-06-02 00:00:00' }]];
            })
        };
        const map = await PE.loadEndEvents(db, ['P1'], logger);
        expect(map.get('P1')).toEqual([{ type: 'birth', date: '2026-06-01' }]);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    test('other errors rethrow', async () => {
        const db = { query: jest.fn(async () => { throw new Error('boom'); }) };
        await expect(PE.loadEndEvents(db, ['P1'], { warn: jest.fn() })).rejects.toThrow('boom');
    });

    test('empty ids -> empty map, no query', async () => {
        const db = { query: jest.fn() };
        const map = await PE.loadEndEvents(db, []);
        expect(map.size).toBe(0);
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe('PregnancyEnd.trackerEndState', () => {
    const makeDb = (outcomes, births) => ({
        query: jest.fn(async (sql) => (sql.includes('pregnancy_outcomes') ? [outcomes] : [births]))
    });

    test('outcome event -> ended_on', async () => {
        const db = makeDb([{ id: 1, patient_id: 'P1', outcome_type: 'lahir_mati', event_date: '2026-08-01', note: null }], []);
        expect(await PE.trackerEndState(db, 'P1', '2026-05-01')).toEqual({ ended_on: '2026-08-01' });
    });

    test('birth event -> ended_on', async () => {
        const db = makeDb([], [{ patient_id: 'P1', birth_date: '2026-06-01', created_at: '2026-06-02 00:00:00' }]);
        expect(await PE.trackerEndState(db, 'P1', '2026-05-01')).toEqual({ ended_on: '2026-06-01' });
    });

    test('none -> null', async () => {
        expect(await PE.trackerEndState(makeDb([], []), 'P1', '2026-05-01')).toBeNull();
    });
});

describe('PregnancyEnd.endedSqlCondition', () => {
    test('contains both tables, tolerance, no placeholders', () => {
        const sql = PE.endedSqlCondition('p.id', 'latest.hpht');
        expect(sql).toContain('pregnancy_outcomes');
        expect(sql).toContain('voided_at IS NULL');
        expect(sql).toContain('birth_congratulations');
        expect(sql).toContain('INTERVAL 14 DAY');
        expect(sql).not.toContain('?');
        expect(sql.trim().startsWith('(')).toBe(true);
    });
});

describe('PregnancyEnd.pregnancyListFields', () => {
    const today = new Date(2026, 5, 10, 13, 0, 0);

    test('no HPHT', () => {
        expect(PE.pregnancyListFields(null, [], today)).toEqual({
            is_obstetri: false, hpl: null, days_pregnant: null, has_delivered: false, pregnancy_end: null
        });
    });

    test('HPHT with birth', () => {
        const r = PE.pregnancyListFields('2026-05-01', [{ type: 'birth', date: '2026-06-01' }], today);
        expect(r.is_obstetri).toBe(true);
        expect(r.hpl).toBe('2027-02-05');
        expect(r.days_pregnant).toBe(40);
        expect(r.has_delivered).toBe(true);
        expect(r.pregnancy_end).toEqual({ type: 'birth', date: '2026-06-01' });
    });

    test('keguguran is an end but not delivered', () => {
        const r = PE.pregnancyListFields('2026-05-01', [{ type: 'keguguran', date: '2026-06-01', id: 1 }], today);
        expect(r.has_delivered).toBe(false);
        expect(r.pregnancy_end).toEqual({ type: 'keguguran', date: '2026-06-01' });
    });
});
