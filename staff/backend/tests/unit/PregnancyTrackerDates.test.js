'use strict';

// Portal pregnancy tracker counts calendar days in local time (GMT+7), not from UTC midnight.

const fs = require('fs');
const path = require('path');
const { trackerDates, eddFromPregnancy, findOngoingPregnancy } = require('../../services/PregnancyTrackerDates');

describe('trackerDates', () => {
    test('counts whole calendar days at any hour of the local day', () => {
        for (const hour of [0, 2, 6, 7, 12, 23]) {
            const now = new Date(2026, 10, 22, hour, 34);
            expect(trackerDates('2027-04-23', now)).toEqual({
                hpht: '2026-07-17',
                daysPregnant: 128,
                weeksPregnant: 18,
                daysExtra: 2,
                daysUntilEdd: 152
            });
        }
    });

    test('HPL day itself is 40+0 with 0 days left, the day after is -1', () => {
        expect(trackerDates('2027-04-23', new Date(2027, 3, 23, 1, 0))).toMatchObject({ weeksPregnant: 40, daysExtra: 0, daysUntilEdd: 0 });
        expect(trackerDates('2027-04-23', new Date(2027, 3, 24, 1, 0)).daysUntilEdd).toBe(-1);
    });

    test('accepts a datetime string or Date and refuses an unreadable value', () => {
        expect(trackerDates('2027-04-23T00:00:00.000Z', new Date(2026, 10, 22, 2)).daysExtra).toBe(2);
        expect(trackerDates(new Date(2027, 3, 23), new Date(2026, 10, 22, 2)).daysExtra).toBe(2);
        expect(trackerDates('bukan tanggal', new Date())).toBeNull();
        expect(trackerDates('', new Date())).toBeNull();
    });

    test('the tracker route uses trackerDates', () => {
        const source = fs.readFileSync(path.join(__dirname, '../../routes/patients-auth.js'), 'utf8');
        const start = source.indexOf("router.get('/pregnancy-tracker'");
        const handler = source.slice(start, source.indexOf('\n});', start));
        expect(handler).toContain('trackerDates(edd');
        expect(handler).not.toMatch(/new Date\(edd\)\s*;/);
    });

    test('eddFromPregnancy: hpl, else hpht + 280 days, else nothing', () => {
        expect(eddFromPregnancy({ hpht: '2026-07-17', hpl: '2027-04-20' })).toBe('2027-04-20');
        expect(eddFromPregnancy({ hpht: new Date(2026, 6, 17), hpl: null })).toBe('2027-04-23');
        expect(eddFromPregnancy({ hpht: '2024-02-29', hpl: '' })).toBe('2024-12-05');
        expect(eddFromPregnancy({ hpht: null, hpl: null })).toBeNull();
        expect(eddFromPregnancy(null)).toBeNull();
    });

    test('findOngoingPregnancy asks only for the ongoing row of that patient', async () => {
        const calls = [];
        const db = { query: async (sql, params) => { calls.push({ sql, params }); return [[{ id: 7, hpht: '2026-07-17', hpl: null }]]; } };
        expect(await findOngoingPregnancy(db, 'P1')).toEqual({ id: 7, hpht: '2026-07-17', hpl: null });
        expect(calls[0].params).toEqual(['P1']);
        expect(calls[0].sql).toMatch(/FROM pregnancies/);
        expect(calls[0].sql).toMatch(/status = 'ongoing'/);
        const empty = { query: async () => [[]] };
        expect(await findOngoingPregnancy(empty, 'P1')).toBeNull();
    });

    test('the tracker route dates the pregnancy from the pregnancies table, not the newest USG', () => {
        const source = fs.readFileSync(path.join(__dirname, '../../routes/patients-auth.js'), 'utf8');
        const start = source.indexOf("router.get('/pregnancy-tracker'");
        const handler = source.slice(start, source.indexOf('\n});', start));
        expect(handler).toContain('findOngoingPregnancy(db, patientId)');
        expect(handler).toContain('eddFromPregnancy(pregnancy)');
        expect(handler).not.toMatch(/record_type = 'usg'/);
        expect(handler).not.toContain('findPregnancyReference');
    });
});
