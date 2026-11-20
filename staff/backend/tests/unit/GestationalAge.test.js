'use strict';

const { gestationalWeeksOn, findPregnancyReference, choosePackage } = require('../../services/GestationalAge');

describe('gestationalWeeksOn', () => {
    test('from HPHT: 24 weeks exactly', () => {
        expect(gestationalWeeksOn({ kind: 'hpht', date: '2026-06-14' }, '2026-11-29')).toEqual({ weeks: 24, days: 0 });
    });

    test('from HPHT: leftover days are reported', () => {
        expect(gestationalWeeksOn({ kind: 'hpht', date: '2026-06-14' }, '2026-12-02')).toEqual({ weeks: 24, days: 3 });
    });

    test('an on-date before the HPHT is unknown', () => {
        expect(gestationalWeeksOn({ kind: 'hpht', date: '2026-06-14' }, '2026-06-13')).toBeNull();
    });

    test('from HPL: 112 days to term is 24 weeks (the HPHT 2026-06-14 case, 280 days earlier)', () => {
        expect(gestationalWeeksOn({ kind: 'hpl', date: '2027-03-21' }, '2026-11-29')).toEqual({ weeks: 24, days: 0 });
    });

    test('an HPL more than 14 days before the appointment is unknown', () => {
        expect(gestationalWeeksOn({ kind: 'hpl', date: '2026-11-14' }, '2026-11-29')).toBeNull();
    });

    test('an HPL exactly 14 days before the appointment still counts (42 weeks)', () => {
        expect(gestationalWeeksOn({ kind: 'hpl', date: '2026-11-15' }, '2026-11-29')).toEqual({ weeks: 42, days: 0 });
    });

    test('an HPHT 300 days before is beyond 42 weeks and unknown', () => {
        expect(gestationalWeeksOn({ kind: 'hpht', date: '2026-02-02' }, '2026-11-29')).toBeNull();
    });

    test('is not shifted by the server timezone', () => {
        // 2026-03-29 is a DST change day in many zones; day arithmetic must stay whole.
        expect(gestationalWeeksOn({ kind: 'hpht', date: '2026-03-22' }, '2026-03-29')).toEqual({ weeks: 1, days: 0 });
    });
});

describe('choosePackage', () => {
    const pkg = (over) => ({ id: 1, code: 'a', category: 'obstetri', ready: true, week_min: 0, week_max: 45, sort_order: 10, ...over });

    test('two packages covering week 22: the lower sort_order wins', () => {
        const list = [pkg({ id: 1, code: 'late', sort_order: 20, week_min: 20, week_max: 30 }), pkg({ id: 2, code: 'early', sort_order: 10, week_min: 15, week_max: 25 })];
        expect(choosePackage(list, 22)).toBe('early');
    });

    test('a sort tie goes to the lower id', () => {
        const list = [pkg({ id: 9, code: 'nine', sort_order: 10 }), pkg({ id: 3, code: 'three', sort_order: 10 })];
        expect(choosePackage(list, 22)).toBe('three');
    });

    test('the range is inclusive on both ends', () => {
        const list = [pkg({ code: 'r', week_min: 20, week_max: 24 })];
        expect(choosePackage(list, 20)).toBe('r');
        expect(choosePackage(list, 24)).toBe('r');
        expect(choosePackage(list, 25)).toBeNull();
    });

    test('week 30 with only a null-range package picks that one', () => {
        expect(choosePackage([pkg({ code: 'open', week_min: null, week_max: null })], 30)).toBe('open');
    });

    test('a ranged match beats a null-range package', () => {
        const list = [pkg({ id: 1, code: 'open', week_min: null, week_max: null, sort_order: 1 }), pkg({ id: 2, code: 'ranged', week_min: 28, week_max: 32, sort_order: 50 })];
        expect(choosePackage(list, 30)).toBe('ranged');
    });

    test('no match and no null-range package gives null', () => {
        expect(choosePackage([pkg({ week_min: 1, week_max: 5 })], 30)).toBeNull();
    });

    test('unknown weeks gives null', () => {
        expect(choosePackage([pkg({ code: 'open', week_min: null, week_max: null })], null)).toBeNull();
    });

    test('ignores other categories and packages that are not ready', () => {
        const list = [pkg({ code: 'gyn', category: 'gyn_repro' }), pkg({ code: 'nr', ready: false })];
        expect(choosePackage(list, 22)).toBeNull();
    });
});

describe('findPregnancyReference', () => {
    // First db.query is the anamnesa query, the second is the USG query.
    function dbWith(anamnesa, usg) {
        const query = jest.fn()
            .mockResolvedValueOnce([anamnesa])
            .mockResolvedValueOnce([usg]);
        return { query };
    }
    const at = (s) => new Date(s);

    test('a newer USG trimester_2 edd beats an older anamnesa hpht', async () => {
        const db = dbWith(
            [{ hpht: '2026-06-14', hpl: null, recorded_at: at('2026-08-01T10:00:00Z') }],
            [{ edd: null, current_trimester: 'second', t1_edd: null, t2_edd: '2027-03-21', t3_edd: null, recorded_at: at('2026-09-01T10:00:00Z') }]
        );
        expect(await findPregnancyReference(db, 'P1')).toMatchObject({ kind: 'hpl', date: '2027-03-21', source: 'usg' });
    });

    test('a newer anamnesa hpht beats an older USG edd', async () => {
        const db = dbWith(
            [{ hpht: '2026-06-14', hpl: null, recorded_at: at('2026-10-01T10:00:00Z') }],
            [{ edd: '2027-03-21', current_trimester: 'first', t1_edd: null, t2_edd: null, t3_edd: null, recorded_at: at('2026-09-01T10:00:00Z') }]
        );
        expect(await findPregnancyReference(db, 'P1')).toMatchObject({ kind: 'hpht', date: '2026-06-14', source: 'anamnesa' });
    });

    test('one anamnesa carrying both hpl and hpht yields the HPL', async () => {
        const db = dbWith(
            [{ hpht: '2026-06-14', hpl: '2027-03-21', recorded_at: at('2026-10-01T10:00:00Z') }],
            []
        );
        expect(await findPregnancyReference(db, 'P1')).toMatchObject({ kind: 'hpl', date: '2027-03-21', source: 'anamnesa' });
    });

    test('a USG updated after an anamnesa beats it even when its created_at is older', async () => {
        // The query already collapses COALESCE(updated_at, created_at) into recorded_at.
        const db = dbWith(
            [{ hpht: '2026-06-14', hpl: null, recorded_at: at('2026-09-01T10:00:00Z') }],
            [{ edd: '2027-03-28', current_trimester: 'first', t1_edd: null, t2_edd: null, t3_edd: null, recorded_at: at('2026-10-15T10:00:00Z') }]
        );
        expect(await findPregnancyReference(db, 'P1')).toMatchObject({ kind: 'hpl', date: '2027-03-28', source: 'usg' });
    });

    test('the top-level edd shape is read', async () => {
        const db = dbWith([], [{ edd: '2027-04-04', current_trimester: null, t1_edd: null, t2_edd: null, t3_edd: null, recorded_at: at('2026-09-01T10:00:00Z') }]);
        expect(await findPregnancyReference(db, 'P1')).toMatchObject({ kind: 'hpl', date: '2027-04-04' });
    });

    test('with no top-level or current-trimester edd, the highest trimester holding one is used', async () => {
        const db = dbWith([], [{ edd: '', current_trimester: 'third', t1_edd: '2027-03-01', t2_edd: '2027-03-10', t3_edd: '', recorded_at: at('2026-09-01T10:00:00Z') }]);
        expect(await findPregnancyReference(db, 'P1')).toMatchObject({ date: '2027-03-10' });
    });

    test('the current trimester edd is preferred over a higher one', async () => {
        const db = dbWith([], [{ edd: null, current_trimester: 'first', t1_edd: '2027-03-01', t2_edd: '2027-03-10', t3_edd: null, recorded_at: at('2026-09-01T10:00:00Z') }]);
        expect(await findPregnancyReference(db, 'P1')).toMatchObject({ date: '2027-03-01' });
    });

    test('an invalid date string is ignored', async () => {
        const db = dbWith(
            [{ hpht: '14/06/2026', hpl: '2027-02-30', recorded_at: at('2026-10-01T10:00:00Z') }],
            [{ edd: 'null', current_trimester: 'first', t1_edd: null, t2_edd: null, t3_edd: null, recorded_at: at('2026-09-01T10:00:00Z') }]
        );
        expect(await findPregnancyReference(db, 'P1')).toBeNull();
    });

    test('returns null when the patient has no records', async () => {
        expect(await findPregnancyReference(dbWith([], []), 'P1')).toBeNull();
    });

    test('queries only the patient own rows', async () => {
        const db = dbWith([], []);
        await findPregnancyReference(db, 'P0042');
        for (const call of db.query.mock.calls) {
            expect(call[1]).toContain('P0042');
            expect(call[0]).toMatch(/patient_id = \?/);
        }
    });
});
