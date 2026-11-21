'use strict';

const { buildPregnancyData } = require('../../services/PatientPregnancyData');

const NOW = new Date(2026, 10, 22, 12, 0, 0); // 22 Nov 2026 local
const deps = {
    getR2ProxyUrl: key => `/proxy/${key}`,
    BABY_SIZES: { 18: { emoji: 'E', size: 'Paprika', length: '14 cm' }, 40: { emoji: 'W', size: 'Semangka', length: '51 cm' } },
    PREGNANCY_TIPS: { 16: 'tip16', 20: 'tip20', 40: 'tip40' }
};
const LOSS_WORDS = /abortus|keguguran|lahir_mati|ektopik|outcome/i;

function fakeDb({ pregnancies = [], linkedCard = null, fallbackCard = null, linkedPregnancyIds = [] } = {}) {
    const calls = [];
    return {
        calls,
        query: jest.fn(async (sql, params) => {
            calls.push({ sql, params });
            if (/UNION/.test(sql)) return [params[0].filter(id => linkedPregnancyIds.includes(id)).map(id => ({ pregnancy_id: id }))];
            if (/FROM pregnancies/.test(sql)) return [pregnancies];
            if (/FROM pregnancy_outcomes/.test(sql)) return [[]];
            if (/FROM birth_congratulations/.test(sql)) {
                if (/pregnancy_id = \?/.test(sql)) return [linkedCard ? [linkedCard] : []];
                return [fallbackCard ? [fallbackCard] : []];
            }
            throw new Error('unexpected sql: ' + sql);
        })
    };
}

const card = { baby_name: 'Bayi A', birth_date: '10 Nov 2026', birth_time: '08:00', birth_weight: 3100, birth_length: 49, photo_url: 'u', photo_r2_key: 'k1', doctor_message: 'Selamat' };

describe('buildPregnancyData', () => {
    test('ongoing pregnancy -> is_pregnant with calendar-day weeks', async () => {
        const db = fakeDb({ pregnancies: [{ id: 5, patient_id: 9, sequence: 2, source: 'clinic', status: 'ongoing', outcome: null, hpht: '2026-07-17', hpl: null }] });
        const out = await buildPregnancyData(db, 9, NOW, deps);
        expect(out).toMatchObject({ is_pregnant: true, has_given_birth: false, weeks: 18, days: 2, trimester: 2, hpht: '2026-07-17', hpl: '2027-04-23' });
        expect(out.progress).toBeCloseTo(128 / 280, 5);
        expect(out.baby_size.size).toBe('Paprika');
        expect(out.tip).toBe('tip16');
    });

    test('hpl-only ongoing derives hpht', async () => {
        const db = fakeDb({ pregnancies: [{ id: 5, patient_id: 9, sequence: 1, source: 'clinic', status: 'ongoing', hpht: null, hpl: '2027-04-23' }] });
        const out = await buildPregnancyData(db, 9, NOW, deps);
        expect(out).toMatchObject({ is_pregnant: true, weeks: 18, days: 2, hpht: '2026-07-17', hpl: '2027-04-23' });
    });

    test('ongoing beyond 42 weeks -> neutral', async () => {
        const db = fakeDb({ pregnancies: [{ id: 5, patient_id: 9, sequence: 1, source: 'clinic', status: 'ongoing', hpht: '2026-01-01', hpl: null }] });
        expect(await buildPregnancyData(db, 9, NOW, deps)).toEqual({ is_pregnant: false, has_given_birth: false });
    });

    test('ended lahir_hidup with linked published card -> birth payload', async () => {
        const db = fakeDb({ pregnancies: [{ id: 5, patient_id: 9, sequence: 1, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', hpht: '2026-02-01', hpl: null }], linkedCard: card });
        const out = await buildPregnancyData(db, 9, NOW, deps);
        expect(out).toEqual({
            is_pregnant: false, has_given_birth: true, birth_date: '10 Nov 2026', birth_time: '08:00', baby_name: 'Bayi A',
            baby_weight: 3100, baby_length: 49, baby_photo_url: '/proxy/k1', doctor_message: 'Selamat'
        });
        const linked = db.calls.find(c => /FROM birth_congratulations/.test(c.sql));
        expect(linked.params).toEqual([9, 5]);
    });

    test('external ended lahir_hidup with a linked published card -> birth payload (R7)', async () => {
        const db = fakeDb({
            pregnancies: [{ id: 6, patient_id: 9, sequence: 1, source: 'external', status: 'ended', outcome: 'lahir_hidup', hpht: null, hpl: null, ended_on: '2026-11-10' }],
            linkedCard: card,
            linkedPregnancyIds: [6]
        });
        const out = await buildPregnancyData(db, 9, NOW, deps);
        expect(out).toMatchObject({ is_pregnant: false, has_given_birth: true, baby_name: 'Bayi A' });
        const linked = db.calls.find(c => /FROM birth_congratulations/.test(c.sql) && !/UNION/.test(c.sql));
        expect(linked.params).toEqual([9, 6]);
    });

    test('external ended lahir_hidup without any link -> neutral', async () => {
        const db = fakeDb({
            pregnancies: [{ id: 6, patient_id: 9, sequence: 1, source: 'external', status: 'ended', outcome: 'lahir_hidup', hpht: null, hpl: null }],
            linkedCard: card
        });
        expect(await buildPregnancyData(db, 9, NOW, deps)).toEqual({ is_pregnant: false, has_given_birth: false });
    });

    test('ended lahir_hidup, no linked card -> falls back to newest card dated on/after hpht', async () => {
        const db = fakeDb({ pregnancies: [{ id: 5, patient_id: 9, sequence: 1, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', hpht: '2026-02-01', hpl: null }], fallbackCard: { ...card, photo_r2_key: null } });
        const out = await buildPregnancyData(db, 9, NOW, deps);
        expect(out.has_given_birth).toBe(true);
        expect(out.baby_photo_url).toBe('u');
        const fb = db.calls.filter(c => /FROM birth_congratulations/.test(c.sql))[1];
        expect(fb.params).toEqual([9, '2026-02-01']);
    });

    test('ended lahir_hidup but no published card -> neutral', async () => {
        const db = fakeDb({ pregnancies: [{ id: 5, patient_id: 9, sequence: 1, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', hpht: '2026-02-01', hpl: null }] });
        expect(await buildPregnancyData(db, 9, NOW, deps)).toEqual({ is_pregnant: false, has_given_birth: false });
    });

    test.each(['abortus', 'lahir_mati', 'ektopik', 'unknown'])('ended %s -> neutral, no loss words, no card lookup', async outcome => {
        const db = fakeDb({ pregnancies: [{ id: 5, patient_id: 9, sequence: 1, source: 'clinic', status: 'ended', outcome, hpht: '2026-02-01', hpl: null }], linkedCard: card, fallbackCard: card });
        const out = await buildPregnancyData(db, 9, NOW, deps);
        expect(out).toEqual({ is_pregnant: false, has_given_birth: false });
        expect(JSON.stringify(out)).not.toMatch(LOSS_WORDS);
        expect(db.calls.some(c => /birth_congratulations/.test(c.sql))).toBe(false);
    });

    test('new ongoing after an old birth -> pregnancy, not birth card', async () => {
        const db = fakeDb({
            pregnancies: [
                { id: 6, patient_id: 9, sequence: 2, source: 'clinic', status: 'ongoing', hpht: '2026-07-17', hpl: null },
                { id: 5, patient_id: 9, sequence: 1, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', hpht: '2025-01-01', hpl: null }
            ],
            linkedCard: card, fallbackCard: card
        });
        const out = await buildPregnancyData(db, 9, NOW, deps);
        expect(out.is_pregnant).toBe(true);
        expect(out.has_given_birth).toBe(false);
        expect(db.calls.some(c => /birth_congratulations/.test(c.sql))).toBe(false);
    });

    test('no rows at all -> neutral', async () => {
        expect(await buildPregnancyData(fakeDb(), 9, NOW, deps)).toEqual({ is_pregnant: false, has_given_birth: false });
    });
});
