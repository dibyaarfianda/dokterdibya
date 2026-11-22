'use strict';

const {
    loadCurrentPregnancies,
    datingOf,
    listFields,
    PREGNANCY_END_TYPES
} = require('../../services/CurrentPregnancy');

function makeDb(pregnancies, outcomes = [], births = []) {
    const calls = [];
    return {
        calls,
        async query(sql, params) {
            calls.push({ sql, params });
            if (/UNION/.test(sql)) {
                const [cardIds, outcomeIds] = params;
                const hits = [
                    ...births.filter(b => cardIds.includes(b.pregnancy_id)),
                    ...outcomes.filter(o => outcomeIds.includes(o.pregnancy_id) && !o.voided_at)
                ].map(x => ({ pregnancy_id: x.pregnancy_id }));
                return [hits];
            }
            if (/FROM pregnancies/.test(sql)) {
                const ids = params[0];
                return [pregnancies.filter(p => ids.includes(p.patient_id))];
            }
            if (/FROM pregnancy_outcomes/.test(sql)) {
                const ids = params[0];
                return [outcomes.filter(o => ids.includes(o.pregnancy_id) && !o.voided_at)];
            }
            throw new Error('unexpected sql ' + sql);
        }
    };
}

const row = (o) => ({ patient_id: 'P1', sequence: 1, source: 'clinic', status: 'ongoing', outcome: null, hpht: null, hpl: null, ended_on: null, ...o });

describe('loadCurrentPregnancies', () => {
    test('empty ids -> empty Map, no query', async () => {
        const db = makeDb([]);
        const map = await loadCurrentPregnancies(db, []);
        expect(map.size).toBe(0);
        expect(db.calls).toHaveLength(0);
    });

    test('two ongoing rows (data error) -> only the newest by sequence, id', async () => {
        const db = makeDb([
            row({ id: 1, sequence: 1, hpht: '2026-01-01' }),
            row({ id: 3, sequence: 2, hpht: '2026-05-01' }),
            row({ id: 2, sequence: 2, hpht: '2026-04-01' })
        ]);
        const cur = (await loadCurrentPregnancies(db, ['P1'])).get('P1');
        expect(cur.ongoing.id).toBe(3);
        expect(cur.lastEnded).toBeNull();
    });

    test('newest external ended row -> no end badge (null lastEnded)', async () => {
        const db = makeDb([row({ id: 5, sequence: 2, source: 'external', status: 'ended', outcome: 'abortus' })]);
        const cur = (await loadCurrentPregnancies(db, ['P1'])).get('P1');
        expect(cur.ongoing).toBeNull();
        expect(cur.lastEnded).toBeNull();
    });

    test('newest external ended over an older clinic ended -> lastEnded is the clinic one', async () => {
        const db = makeDb([
            row({ id: 4, sequence: 1, status: 'ended', outcome: 'lahir_hidup', ended_on: '2025-01-01' }),
            row({ id: 5, sequence: 2, source: 'external', status: 'ended', outcome: 'abortus' })
        ]);
        const cur = (await loadCurrentPregnancies(db, ['P1'])).get('P1');
        expect(cur.lastEnded.id).toBe(4);
    });

    test('newest external ended row with a linked birth card -> it is lastEnded (R7)', async () => {
        const db = makeDb(
            [
                row({ id: 4, sequence: 1, status: 'ended', outcome: 'lahir_hidup', ended_on: '2020-01-01' }),
                row({ id: 5, sequence: 2, source: 'external', status: 'ended', outcome: 'lahir_hidup', ended_on: '2025-06-01' })
            ],
            [],
            [{ id: 70, pregnancy_id: 5 }]
        );
        const cur = (await loadCurrentPregnancies(db, ['P1'])).get('P1');
        expect(cur.lastEnded.id).toBe(5);
        expect(db.calls.filter(c => /UNION/.test(c.sql))).toHaveLength(1);
    });

    test('external ended row with a non-voided outcome counts; a voided one does not', async () => {
        const db = makeDb(
            [row({ id: 5, source: 'external', status: 'ended', outcome: 'abortus', ended_on: '2025-06-01' })],
            [{ id: 9, pregnancy_id: 5, note: null, voided_at: null }]
        );
        expect((await loadCurrentPregnancies(db, ['P1'])).get('P1').lastEnded.id).toBe(5);
        const voided = makeDb(
            [row({ id: 5, source: 'external', status: 'ended', outcome: 'abortus', ended_on: '2025-06-01' })],
            [{ id: 9, pregnancy_id: 5, note: null, voided_at: '2026-01-01' }]
        );
        expect((await loadCurrentPregnancies(voided, ['P1'])).get('P1').lastEnded).toBeNull();
    });

    test('one batched link query for many patients; skipped when no external candidate', async () => {
        const db = makeDb(
            [
                row({ id: 5, patient_id: 'P1', source: 'external', status: 'ended', outcome: 'lahir_hidup' }),
                row({ id: 6, patient_id: 'P2', source: 'external', status: 'ended', outcome: 'lahir_hidup' }),
                row({ id: 7, patient_id: 'P3', status: 'ended', outcome: 'lahir_hidup' })
            ],
            [],
            [{ id: 1, pregnancy_id: 6 }]
        );
        const map = await loadCurrentPregnancies(db, ['P1', 'P2', 'P3']);
        expect(map.get('P1').lastEnded).toBeNull();
        expect(map.get('P2').lastEnded.id).toBe(6);
        expect(map.get('P3').lastEnded.id).toBe(7);
        const union = db.calls.filter(c => /UNION/.test(c.sql));
        expect(union).toHaveLength(1);
        expect(union[0].params).toEqual([[5, 6], [5, 6]]);

        const clinicOnly = makeDb([row({ id: 7, status: 'ended', outcome: 'lahir_hidup' })]);
        await loadCurrentPregnancies(clinicOnly, ['P1']);
        expect(clinicOnly.calls.filter(c => /UNION/.test(c.sql))).toHaveLength(0);
    });

    test('ongoing present -> lastEnded is null', async () => {
        const db = makeDb([
            row({ id: 4, sequence: 1, status: 'ended', outcome: 'lahir_hidup' }),
            row({ id: 5, sequence: 2, hpht: '2026-07-17' })
        ]);
        const cur = (await loadCurrentPregnancies(db, ['P1'])).get('P1');
        expect(cur.ongoing.id).toBe(5);
        expect(cur.lastEnded).toBeNull();
    });

    test('attaches outcome id and note to the ended row; voided outcome ignored', async () => {
        const db = makeDb(
            [row({ id: 4, status: 'ended', outcome: 'abortus', ended_on: '2026-03-03' })],
            [
                { id: 9, pregnancy_id: 4, note: 'catatan', voided_at: null },
                { id: 8, pregnancy_id: 4, note: 'lama', voided_at: '2026-03-04' }
            ]
        );
        const cur = (await loadCurrentPregnancies(db, ['P1'])).get('P1');
        expect(cur.lastEnded.outcome_id).toBe(9);
        expect(cur.lastEnded.outcome_note).toBe('catatan');
        expect(db.calls[1].sql).toMatch(/voided_at IS NULL/);
    });

    test('patients without rows are absent from the Map', async () => {
        const db = makeDb([]);
        const map = await loadCurrentPregnancies(db, ['P9']);
        expect(map.has('P9')).toBe(false);
    });
});

describe('datingOf', () => {
    test('only hpl -> hpht = hpl - 280', () => {
        expect(datingOf({ hpl: '2027-04-23', hpht: null })).toEqual({ hpht: '2026-07-17', hpl: '2027-04-23' });
    });
    test('only hpht -> hpl = hpht + 280', () => {
        expect(datingOf({ hpht: '2026-07-17', hpl: null })).toEqual({ hpht: '2026-07-17', hpl: '2027-04-23' });
    });
    test('both -> as stored, hpl not recomputed', () => {
        expect(datingOf({ hpht: '2026-07-17', hpl: '2027-04-30' })).toEqual({ hpht: '2026-07-17', hpl: '2027-04-30' });
    });
    test('Date values at local midnight are read by local components', () => {
        expect(datingOf({ hpht: new Date(2026, 6, 17), hpl: null }).hpl).toBe('2027-04-23');
    });
    test('neither / no row -> null', () => {
        expect(datingOf({ hpht: null, hpl: null })).toBeNull();
        expect(datingOf(null)).toBeNull();
    });
});

describe('listFields', () => {
    test('ongoing -> hpl and calendar days, same at 02:00 and 23:00 local', () => {
        const cur = { ongoing: row({ id: 1, hpht: '2026-07-17' }), lastEnded: null };
        const a = listFields(cur, true, new Date(2026, 10, 22, 2, 0));
        const b = listFields(cur, true, new Date(2026, 10, 22, 23, 0));
        expect(a.hpl).toBe('2027-04-23');
        expect(a.days_pregnant).toBe(128);
        expect(b.days_pregnant).toBe(128);
        expect(a.is_obstetri).toBe(true);
        expect(a.pregnancy_end).toBeNull();
        expect(a.has_delivered).toBe(false);
    });

    test('ongoing with only hpl still yields days', () => {
        const cur = { ongoing: row({ id: 1, hpl: '2027-04-23' }), lastEnded: null };
        expect(listFields(cur, true, new Date(2026, 10, 22, 12)).days_pregnant).toBe(128);
    });

    test('ongoing dated row without an obstetri anamnesa HPHT still counts as obstetri', () => {
        const cur = { ongoing: row({ id: 1, hpl: '2027-04-23' }), lastEnded: null };
        const f = listFields(cur, false, new Date(2026, 10, 22, 12));
        expect(f.is_obstetri).toBe(true);
        expect(f.hpl).toBe('2027-04-23');
        // an ongoing row with no dating keeps the passed-through flag
        expect(listFields({ ongoing: row({ id: 2 }), lastEnded: null }, false, new Date()).is_obstetri).toBe(false);
    });

    test('outcome -> pregnancy_end type mapping', () => {
        expect(PREGNANCY_END_TYPES).toEqual({
            lahir_hidup: 'birth', lahir_mati: 'lahir_mati', abortus: 'keguguran', ektopik: 'keguguran', unknown: 'selesai'
        });
        for (const [outcome, type] of Object.entries(PREGNANCY_END_TYPES)) {
            const cur = { ongoing: null, lastEnded: row({ id: 2, status: 'ended', outcome, ended_on: '2026-03-03' }) };
            const f = listFields(cur, false, new Date(2026, 10, 22));
            expect(f.pregnancy_end).toEqual({ type, date: '2026-03-03' });
            expect(f.has_delivered).toBe(type === 'birth');
            expect(f.hpl).toBeNull();
        }
    });

    test('linked outcome adds id and note', () => {
        const cur = { ongoing: null, lastEnded: row({ id: 2, status: 'ended', outcome: 'abortus', ended_on: '2026-03-03', outcome_id: 9, outcome_note: 'x' }) };
        expect(listFields(cur, true, new Date(2026, 10, 22)).pregnancy_end).toEqual({ type: 'keguguran', date: '2026-03-03', id: 9, note: 'x' });
    });

    test('no data -> nulls and false, is_obstetri passed through', () => {
        expect(listFields(undefined, true, new Date())).toEqual({ is_obstetri: true, hpl: null, days_pregnant: null, has_delivered: false, pregnancy_end: null });
        expect(listFields({ ongoing: null, lastEnded: null }, false, new Date())).toEqual({ is_obstetri: false, hpl: null, days_pregnant: null, has_delivered: false, pregnancy_end: null });
    });
});
