'use strict';

const { planBackfill, REASONS } = require('../../services/PregnancyBackfill');

const TODAY = new Date(2026, 10, 21); // 2026-11-21 local

function visit(mr_id, created, hpht, extra = {}) {
    return { mr_id, mr_category: 'obstetri', created_at: `${created} 09:00:00`, import_source: null, hpht, hpl: null, riwayat_persalinan: null, ...extra };
}

function plan(data) {
    return planBackfill({ patientId: 'P1', visits: [], births: [], outcomes: [], ...data }, { today: TODAY });
}

function byFp(result, fp) {
    return result.pregnancies.find(p => p.fingerprint === fp);
}

describe('clinic grouping', () => {
    test('visits within 14 days of HPHT form one pregnancy, newest HPHT wins; newest unended recent group is ongoing', () => {
        const r = plan({
            visits: [
                visit('DRD1', '2026-08-01', '2026-03-01'),
                visit('DRD2', '2026-09-01', '2026-03-10')
            ]
        });
        expect(r.pregnancies).toHaveLength(1);
        expect(r.pregnancies[0]).toMatchObject({ fingerprint: 'c:DRD1', source: 'clinic', status: 'ongoing', hpht: '2026-03-10', outcome: null, sequence: 1 });
        expect(r.visitLinks).toEqual([
            { mr_id: 'DRD1', fingerprint: 'c:DRD1' },
            { mr_id: 'DRD2', fingerprint: 'c:DRD1' }
        ]);
    });

    test('visits without HPHT join the nearest earlier group within 294 days, else stay unlinked', () => {
        const r = plan({
            visits: [
                visit('DRD1', '2025-02-01', '2025-01-01'),
                visit('DRD2', '2026-05-01', '2026-02-01'),
                visit('DRD3', '2026-06-01', ''),
                visit('DRD4', '2024-01-01', null),
                visit('DRD5', '2026-11-20', 'junk')
            ]
        });
        const link = id => (r.visitLinks.find(l => l.mr_id === id) || {}).fingerprint;
        expect(link('DRD3')).toBe('c:DRD2');
        expect(link('DRD4')).toBeUndefined();
        expect(link('DRD5')).toBe('c:DRD2'); // 292 days after 2026-02-01
    });

    test('HPHT-less visit beyond 294 days stays unlinked', () => {
        const r = plan({
            visits: [visit('DRD1', '2025-02-01', '2025-01-01'), visit('DRD2', '2026-06-01', '')]
        });
        expect(r.visitLinks.map(l => l.mr_id)).toEqual(['DRD1']);
    });

    test('HPHT derived from HPL (hpl - 280) is accepted for a group', () => {
        const r = plan({ visits: [visit('DRD1', '2026-06-01', '', { hpl: '2026-12-26' })] });
        expect(r.pregnancies[0]).toMatchObject({ hpht: '2026-03-21', hpl: '2026-12-26', status: 'ongoing' });
    });

    test('an old imported visit with a past HPHT and no end becomes ended/unknown with review, never ongoing', () => {
        const r = plan({
            visits: [visit('DRD1', '2024-05-01', '2024-01-10', { import_source: 'simrs_gambiran' }), visit('DRD2', '2026-08-01', '2026-03-01')]
        });
        expect(byFp(r, 'c:DRD1')).toMatchObject({ status: 'ended', outcome: 'unknown', needs_review: true });
        expect(byFp(r, 'c:DRD2').status).toBe('ongoing');
        expect(r.reviews).toEqual([{ fingerprint: 'c:DRD1', reason: REASONS.END_UNKNOWN }]);
    });

    test('newest group older than 294 days without an end is ended/unknown and nothing is ongoing', () => {
        const r = plan({ visits: [visit('DRD1', '2025-06-01', '2025-01-01')] });
        expect(r.pregnancies[0]).toMatchObject({ status: 'ended', outcome: 'unknown', needs_review: true });
    });

    test('never creates an ongoing pregnancy without HPHT: visits with no HPHT/HPL make no pregnancy', () => {
        const r = plan({ visits: [visit('DRD1', '2026-06-01', ''), visit('DRD2', '2026-07-01', 'x')] });
        expect(r.pregnancies).toEqual([]);
        expect(r.visitLinks).toEqual([]);
    });

    test('non-obstetri visits are ignored', () => {
        const r = plan({ visits: [{ ...visit('DRD1', '2026-06-01', '2026-03-01'), mr_category: 'gyn_special' }] });
        expect(r.pregnancies).toEqual([]);
    });
});

describe('ends from births and outcomes', () => {
    test('a birth ends its group: lahir_hidup, ended_on = birth date, GA from HPHT', () => {
        const r = plan({
            visits: [visit('DRD1', '2025-05-01', '2025-01-01')],
            births: [{ id: 7, birth_date: '2025-10-08', created_at: '2025-10-09 10:00:00', child_number: 1, birth_weight: '3200 gram', gender: 'male' }]
        });
        expect(r.pregnancies[0]).toMatchObject({
            status: 'ended', outcome: 'lahir_hidup', ended_on: '2025-10-08', ga_weeks_at_end: 40,
            babies: [{ weight_g: 3200, sex: 'L', alive: true }]
        });
        expect(r.birthLinks).toEqual([{ id: 7, fingerprint: 'c:DRD1' }]);
    });

    test('keguguran outcome maps to abortus, lahir_mati stays, with GA from the date', () => {
        const r = plan({
            visits: [visit('DRD1', '2024-03-01', '2024-01-01'), visit('DRD2', '2025-06-01', '2025-01-01')],
            outcomes: [
                { id: 1, outcome_type: 'keguguran', event_date: '2024-03-20' },
                { id: 2, outcome_type: 'lahir_mati', event_date: '2025-07-01' }
            ]
        });
        expect(byFp(r, 'c:DRD1')).toMatchObject({ outcome: 'abortus', ended_on: '2024-03-20', ga_weeks_at_end: 11 });
        expect(byFp(r, 'c:DRD2')).toMatchObject({ outcome: 'lahir_mati', ended_on: '2025-07-01', ga_weeks_at_end: 25 });
        expect(r.outcomeLinks).toEqual([
            { id: 1, fingerprint: 'c:DRD1' },
            { id: 2, fingerprint: 'c:DRD2' }
        ]);
    });

    test('an event is not taken by an older group when it belongs to the next one', () => {
        const r = plan({
            visits: [visit('DRD1', '2023-03-01', '2023-01-01'), visit('DRD2', '2025-06-01', '2025-01-01')],
            births: [{ id: 5, birth_date: '2025-10-08', created_at: '2025-10-08 10:00:00' }]
        });
        expect(byFp(r, 'c:DRD1')).toMatchObject({ outcome: 'unknown' });
        expect(byFp(r, 'c:DRD2')).toMatchObject({ outcome: 'lahir_hidup' });
    });

    test('twins: births within 3 days are one pregnancy with one baby per row', () => {
        const r = plan({
            visits: [visit('DRD1', '2025-05-01', '2025-01-01')],
            births: [
                { id: 11, birth_date: '2025-10-08', created_at: '2025-10-08 10:00:00', child_number: 2, birth_weight: '2900 gram', gender: 'female' },
                { id: 10, birth_date: '2025-10-08', created_at: '2025-10-08 10:00:00', child_number: 1, birth_weight: '3100 gram', gender: 'male' }
            ]
        });
        expect(r.pregnancies).toHaveLength(1);
        expect(r.pregnancies[0].babies).toEqual([
            { weight_g: 3100, sex: 'L', alive: true },
            { weight_g: 2900, sex: 'P', alive: true }
        ]);
        expect(r.birthLinks.map(l => l.id).sort()).toEqual([10, 11]);
    });

    test('a birth without birth_date falls back to created_at', () => {
        const r = plan({
            visits: [visit('DRD1', '2025-05-01', '2025-01-01')],
            births: [{ id: 3, birth_date: null, created_at: '2025-10-09 23:30:00' }]
        });
        expect(r.pregnancies[0]).toMatchObject({ outcome: 'lahir_hidup', ended_on: '2025-10-09' });
    });

    test('births/outcomes with no group make an ended pregnancy from the row with review', () => {
        const r = plan({
            births: [
                { id: 5, birth_date: '2020-04-01', created_at: '2020-04-01 10:00:00', child_number: 1, birth_weight: '3000 gram', gender: 'female' },
                { id: 6, birth_date: '2020-04-02', created_at: '2020-04-02 10:00:00', child_number: 2, birth_weight: '2800', gender: 'male' }
            ],
            outcomes: [{ id: 9, outcome_type: 'keguguran', event_date: '2018-02-02' }]
        });
        expect(r.pregnancies).toHaveLength(2);
        expect(byFp(r, 'b:5')).toMatchObject({ outcome: 'lahir_hidup', ended_on: '2020-04-01', hpht: null, year: 2020, needs_review: true, status: 'ended' });
        expect(byFp(r, 'b:5').babies).toHaveLength(2);
        expect(byFp(r, 'o:9')).toMatchObject({ outcome: 'abortus', ended_on: '2018-02-02', year: 2018, ga_weeks_at_end: null });
        expect(r.reviews).toEqual(expect.arrayContaining([
            { fingerprint: 'b:5', reason: REASONS.ORPHAN_EVENT },
            { fingerprint: 'o:9', reason: REASONS.ORPHAN_EVENT }
        ]));
        expect(r.birthLinks.map(l => l.id).sort()).toEqual([5, 6]);
        expect(r.outcomeLinks).toEqual([{ id: 9, fingerprint: 'o:9' }]);
    });
});

describe('external history', () => {
    const list = [
        { type: 'DELIVERY', tahun: '2015', bulan: '3', persalinan: 'Aterm', metode_persalinan: 'SC (Caesar)', berat_lahir: '3300', jenis_kelamin: 'Laki-laki' },
        { type: 'ABORTUS', tahun: '2018', kuretase: 'Ya' },
        { type: 'DELIVERY', tahun: '2019', persalinan: 'Preterm' }
    ];

    test('externals become source=external with exact fingerprints; no default method and a review for births without one', () => {
        const r = plan({ visits: [visit('DRD1', '2026-08-01', '2026-03-01', { riwayat_persalinan: list })] });
        expect(r.pregnancies.map(p => p.fingerprint)).toEqual(['e:0:2015:DELIVERY', 'e:1:2018:ABORTUS', 'e:2:2019:DELIVERY', 'c:DRD1']);
        expect(r.pregnancies.map(p => p.sequence)).toEqual([1, 2, 3, 4]);
        expect(byFp(r, 'e:0:2015:DELIVERY')).toMatchObject({
            source: 'external', status: 'ended', outcome: 'lahir_hidup', year: 2015, delivery_method: 'SC (Caesar)', term: 'aterm',
            hpht: null, needs_review: false, babies: [{ weight_g: 3300, sex: 'L', alive: true }]
        });
        expect(byFp(r, 'e:1:2018:ABORTUS')).toMatchObject({ outcome: 'abortus', kuretase: 'Ya', year: 2018 });
        expect(byFp(r, 'e:2:2019:DELIVERY')).toMatchObject({ delivery_method: null, term: 'preterm', needs_review: true });
        expect(r.reviews).toEqual([{ fingerprint: 'e:2:2019:DELIVERY', reason: REASONS.NO_METHOD }]);
    });

    test('riwayat_persalinan may be a JSON string', () => {
        const r = plan({ visits: [visit('DRD1', '2026-08-01', '2026-03-01', { riwayat_persalinan: JSON.stringify(list.slice(0, 1)) })] });
        expect(r.pregnancies.map(p => p.fingerprint)).toEqual(['e:0:2015:DELIVERY', 'c:DRD1']);
    });

    test('an entry with the same year and outcome class as a clinic pregnancy is merged into it', () => {
        const r = plan({
            visits: [
                visit('DRD1', '2024-05-01', '2024-01-01', { riwayat_persalinan: [] }),
                visit('DRD2', '2026-08-01', '2026-03-01', {
                    riwayat_persalinan: [{ type: 'DELIVERY', tahun: '2024', persalinan: 'Aterm', metode_persalinan: 'Vakum' }]
                })
            ],
            births: [{ id: 4, birth_date: '2024-10-07', created_at: '2024-10-07 10:00:00' }]
        });
        expect(r.pregnancies.map(p => p.fingerprint)).toEqual(['c:DRD1', 'c:DRD2']);
        expect(byFp(r, 'c:DRD1')).toMatchObject({ delivery_method: 'Vakum', term: 'aterm', source: 'clinic' });
    });

    test('most complete list wins; conflicting lists review the newest pregnancy', () => {
        const a = [{ type: 'DELIVERY', tahun: '2010', metode_persalinan: 'Spt B (Spontan)' }];
        const b = [
            { type: 'DELIVERY', tahun: '2010', metode_persalinan: 'SC (Caesar)' },
            { type: 'ABORTUS', tahun: '2012', kuretase: 'Tidak' }
        ];
        const r = plan({
            visits: [
                visit('DRD1', '2025-02-01', '2025-01-01', { riwayat_persalinan: a }),
                visit('DRD2', '2026-08-01', '2026-03-01', { riwayat_persalinan: b })
            ]
        });
        expect(byFp(r, 'e:0:2010:DELIVERY').delivery_method).toBe('SC (Caesar)');
        // The review goes to the newest ENDED pregnancy (c:DRD2 is ongoing).
        expect(byFp(r, 'c:DRD2').status).toBe('ongoing');
        expect(byFp(r, 'c:DRD1')).toMatchObject({ status: 'ended', needs_review: true });
        expect(r.reviews).toContainEqual({ fingerprint: 'c:DRD1', reason: REASONS.HISTORY_DIFFERS });
        expect(r.reviews).not.toContainEqual({ fingerprint: 'c:DRD2', reason: REASONS.HISTORY_DIFFERS });
    });

    test('a shorter earlier list that is a subset of the longest is not a conflict', () => {
        const a = [{ type: 'DELIVERY', tahun: '2010', metode_persalinan: 'SC (Caesar)' }];
        const b = [...a, { type: 'DELIVERY', tahun: '2013', metode_persalinan: 'SC (Caesar)' }];
        const r = plan({
            visits: [
                visit('DRD1', '2025-02-01', '2025-01-01', { riwayat_persalinan: a }),
                visit('DRD2', '2026-08-01', '2026-03-01', { riwayat_persalinan: b })
            ]
        });
        expect(r.reviews.filter(x => x.reason === REASONS.HISTORY_DIFFERS)).toEqual([]);
    });

    test('a patient with only external history gets only external pregnancies', () => {
        const r = plan({ visits: [visit('DRD1', '2026-08-01', '', { riwayat_persalinan: list.slice(0, 2) })] });
        expect(r.pregnancies.every(p => p.source === 'external')).toBe(true);
        expect(r.visitLinks).toEqual([]);
    });
});

describe('unknown-end merge and implausible GA', () => {
    test('an unknown-end clinic pregnancy merges with an external entry of the year of HPHT + 280 days', () => {
        const r = plan({
            visits: [
                visit('DRD1', '2023-05-01', '2023-01-10'),
                visit('DRD2', '2026-08-01', '2026-03-01', {
                    riwayat_persalinan: [{ type: 'DELIVERY', tahun: '2023', persalinan: 'Aterm', metode_persalinan: 'SC (Caesar)', berat_lahir: '3100', jenis_kelamin: 'P' }]
                })
            ]
        });
        expect(r.pregnancies.map(p => p.fingerprint)).toEqual(['c:DRD1', 'c:DRD2']);
        expect(byFp(r, 'c:DRD1')).toMatchObject({
            outcome: 'lahir_hidup', delivery_method: 'SC (Caesar)', term: 'aterm', needs_review: true, status: 'ended', source: 'clinic',
            babies: [{ weight_g: 3100, sex: 'P', alive: true }]
        });
        expect(r.reviews).toContainEqual({ fingerprint: 'c:DRD1', reason: REASONS.END_UNKNOWN });
    });

    test('an unknown-end pregnancy is not merged with an entry of another year', () => {
        const r = plan({
            visits: [
                visit('DRD1', '2023-05-01', '2023-01-10'),
                visit('DRD2', '2026-08-01', '2026-03-01', { riwayat_persalinan: [{ type: 'DELIVERY', tahun: '2021', metode_persalinan: 'Vakum' }] })
            ]
        });
        expect(r.pregnancies.map(p => p.fingerprint)).toEqual(['e:0:2021:DELIVERY', 'c:DRD1', 'c:DRD2']);
        expect(byFp(r, 'c:DRD1').outcome).toBe('unknown');
    });

    test('a group does not claim an event more than 315 days after its HPHT', () => {
        const r = plan({
            visits: [visit('DRD1', '2023-05-01', '2023-01-01')],
            births: [{ id: 5, birth_date: '2024-02-10', created_at: '2024-02-10 10:00:00' }] // 405 days
        });
        expect(byFp(r, 'c:DRD1')).toMatchObject({ outcome: 'unknown' });
        expect(byFp(r, 'b:5')).toMatchObject({ outcome: 'lahir_hidup', ga_weeks_at_end: null });
        expect(r.birthLinks).toEqual([{ id: 5, fingerprint: 'b:5' }]);
    });

    test('GA under 4 weeks or over 45 weeks is stored as NULL with a review; no capping', () => {
        const early = plan({
            visits: [visit('DRD1', '2024-02-01', '2024-01-01')],
            outcomes: [{ id: 1, outcome_type: 'keguguran', event_date: '2024-01-10' }]
        });
        expect(byFp(early, 'c:DRD1')).toMatchObject({ outcome: 'abortus', ga_weeks_at_end: null, needs_review: true });
        expect(early.reviews).toContainEqual({ fingerprint: 'c:DRD1', reason: REASONS.GA_IMPLAUSIBLE });

        const late = plan({
            visits: [visit('DRD1', '2024-02-01', '2024-01-01')],
            births: [{ id: 2, birth_date: '2024-11-15', created_at: '2024-11-15 10:00:00' }] // 319 days
        });
        expect(byFp(late, 'c:DRD1').outcome).toBe('unknown');

        const before = plan({
            visits: [visit('DRD1', '2024-02-01', '2024-01-10')],
            births: [{ id: 3, birth_date: '2024-01-05', created_at: '2024-01-05 10:00:00' }] // 5 days before HPHT
        });
        expect(byFp(before, 'c:DRD1')).toMatchObject({ ga_weeks_at_end: null, needs_review: true });
        expect(before.reviews).toContainEqual({ fingerprint: 'c:DRD1', reason: REASONS.GA_IMPLAUSIBLE });
    });

    test('GA of exactly 4 and 45 weeks is kept', () => {
        const a = plan({ visits: [visit('DRD1', '2024-02-01', '2024-01-01')], outcomes: [{ id: 1, outcome_type: 'keguguran', event_date: '2024-01-29' }] });
        expect(byFp(a, 'c:DRD1')).toMatchObject({ ga_weeks_at_end: 4, needs_review: false });
        const b = plan({ visits: [visit('DRD1', '2024-02-01', '2024-01-01')], births: [{ id: 2, birth_date: '2024-11-11', created_at: '2024-11-11 10:00:00' }] });
        expect(byFp(b, 'c:DRD1')).toMatchObject({ outcome: 'lahir_hidup', ga_weeks_at_end: 45, needs_review: false });
    });
});

describe('sequence and idempotent output', () => {
    test('every pregnancy has a non-null unique fingerprint and sequence 1..n', () => {
        const r = plan({
            visits: [visit('DRD1', '2026-08-01', '2026-03-01', { riwayat_persalinan: [{ type: 'ABORTUS', tahun: '2019' }, { type: 'ABORTUS', tahun: '2019' }] })],
            births: [{ id: 2, birth_date: '2021-02-02', created_at: '2021-02-02 10:00:00' }]
        });
        const fps = r.pregnancies.map(p => p.fingerprint);
        expect(fps.every(Boolean)).toBe(true);
        expect(new Set(fps).size).toBe(fps.length);
        expect(r.pregnancies.map(p => p.sequence)).toEqual(fps.map((_, i) => i + 1));
        expect(r.pregnancies.filter(p => p.status === 'ongoing').every(p => p.hpht)).toBe(true);
    });

    test('planning the same data twice gives identical output', () => {
        const data = {
            visits: [visit('DRD1', '2025-05-01', '2025-01-01', { riwayat_persalinan: [{ type: 'ABORTUS', tahun: '2019' }] })],
            births: [{ id: 7, birth_date: '2025-10-08', created_at: '2025-10-08 10:00:00' }]
        };
        expect(plan(data)).toEqual(plan(data));
    });

    test('empty input plans nothing', () => {
        expect(plan({})).toEqual({ pregnancies: [], visitLinks: [], outcomeLinks: [], birthLinks: [], reviews: [] });
    });
});

describe('final review fixes (backfill)', () => {
    test('#3 a history conflict reviews the newest ended pregnancy, never the ongoing one', () => {
        const a = [{ type: 'ABORTUS', tahun: '2010' }];
        const b = [{ type: 'ABORTUS', tahun: '2011' }];
        const r = plan({
            visits: [
                visit('DRD1', '2026-08-01', '2026-03-01', { riwayat_persalinan: a }),
                visit('DRD2', '2026-09-01', '2026-03-05', { riwayat_persalinan: b })
            ]
        });
        const ended = r.pregnancies.filter(p => p.status === 'ended');
        expect(ended.length).toBeGreaterThan(0);
        expect(r.reviews.filter(x => x.reason === REASONS.HISTORY_DIFFERS)).toEqual([{ fingerprint: 'e:0:2011:ABORTUS', reason: REASONS.HISTORY_DIFFERS }]);
        expect(ended[ended.length - 1].fingerprint).toBe('e:0:2011:ABORTUS');
        expect(byFp(r, 'c:DRD1')).toMatchObject({ status: 'ongoing', needs_review: false });
    });

    test('#8 delivery methods are normalised; unknown text becomes null with a review (dry-run visible)', () => {
        const { normalizeMethod } = require('../../services/PregnancyBackfill');
        const cases = [
            ['SC', 'SC (Caesar)'], ['sectio caesarea', 'SC (Caesar)'], ['Sesar', 'SC (Caesar)'], ['SC (Caesar)', 'SC (Caesar)'],
            ['Spt B (Spontan)', 'Spt B (Spontan)'], ['normal', 'Spt B (Spontan)'], ['PERVAGINAM', 'Spt B (Spontan)'], ['spt', 'Spt B (Spontan)'],
            ['Vakum', 'Vakum'], ['vacuum ekstraksi', 'Vakum'], ['VE', 'Vakum'], ['Forceps', 'Forceps'], ['forcep', 'Forceps']
        ];
        for (const [raw, method] of cases) expect(normalizeMethod(raw)).toEqual({ method, unrecognized: false });
        expect(normalizeMethod('induksi')).toEqual({ method: null, unrecognized: true });
        expect(normalizeMethod('  ')).toEqual({ method: null, unrecognized: false });
        expect(normalizeMethod('disc')).toEqual({ method: null, unrecognized: true });

        const r = plan({ visits: [visit('DRD1', '2026-08-01', '2026-03-01', { riwayat_persalinan: [
            { type: 'DELIVERY', tahun: '2015', metode_persalinan: 'sectio' },
            { type: 'DELIVERY', tahun: '2017', metode_persalinan: 'ditolong bidan' }
        ] })] });
        expect(byFp(r, 'e:0:2015:DELIVERY')).toMatchObject({ delivery_method: 'SC (Caesar)', needs_review: false });
        expect(byFp(r, 'e:1:2017:DELIVERY')).toMatchObject({ delivery_method: null, needs_review: true });
        expect(r.reviews).toContainEqual({ fingerprint: 'e:1:2017:DELIVERY', reason: REASONS.UNKNOWN_METHOD });
    });

    test('#8 a merged clinic birth gets the normalised method, or a review when unrecognised', () => {
        const base = metode => plan({
            visits: [
                visit('DRD1', '2024-05-01', '2024-01-01'),
                visit('DRD2', '2026-08-01', '2026-03-01', { riwayat_persalinan: [{ type: 'DELIVERY', tahun: '2024', metode_persalinan: metode }] })
            ],
            births: [{ id: 4, birth_date: '2024-10-07', created_at: '2024-10-07 10:00:00' }]
        });
        expect(byFp(base('caesar'), 'c:DRD1')).toMatchObject({ delivery_method: 'SC (Caesar)', needs_review: false });
        const odd = base('xyz');
        expect(byFp(odd, 'c:DRD1')).toMatchObject({ delivery_method: null, needs_review: true });
        expect(odd.reviews).toContainEqual({ fingerprint: 'c:DRD1', reason: REASONS.UNKNOWN_METHOD });
    });

    test('#9 keguguran >= 20 weeks and lahir mati < 20 weeks keep their type but are reviewed', () => {
        const late = plan({
            visits: [visit('DRD1', '2025-02-01', '2025-01-01')],
            outcomes: [{ id: 9, outcome_type: 'keguguran', event_date: '2025-06-01' }]
        });
        expect(byFp(late, 'c:DRD1')).toMatchObject({ outcome: 'abortus', ga_weeks_at_end: 21, needs_review: true });
        expect(late.reviews).toContainEqual({ fingerprint: 'c:DRD1', reason: REASONS.TYPE_VS_GA });
        const early = plan({
            visits: [visit('DRD1', '2025-02-01', '2025-01-01')],
            outcomes: [{ id: 9, outcome_type: 'lahir_mati', event_date: '2025-03-01' }]
        });
        expect(byFp(early, 'c:DRD1')).toMatchObject({ outcome: 'lahir_mati', ga_weeks_at_end: 8, needs_review: true });
        expect(early.reviews).toContainEqual({ fingerprint: 'c:DRD1', reason: REASONS.TYPE_VS_GA });
        const fine = plan({
            visits: [visit('DRD1', '2025-02-01', '2025-01-01')],
            outcomes: [{ id: 9, outcome_type: 'keguguran', event_date: '2025-03-01' }]
        });
        expect(byFp(fine, 'c:DRD1').needs_review).toBe(false);
    });
});
