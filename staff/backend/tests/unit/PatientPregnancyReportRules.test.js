'use strict';

const {
    REPORT_ANSWERS,
    PatientReportError,
    isPastHpl,
    shouldAsk,
    snoozeUntil,
    normalizePatientReport
} = require('../../services/PatientPregnancyReportRules');

const TODAY = '2026-11-22';
const HPHT = '2026-01-01';
const ctx = { hpht: HPHT, today: TODAY, patientId: 'P1' };
const birth = (over = {}) => ({
    answer: 'lahir_sehat',
    ended_on: '2026-10-05',
    place: 'RSIA Melinda',
    delivery: 'normal',
    babies: [{ weight_g: 3100 }],
    ...over
});

function expect400(body, c = ctx) {
    let err;
    try { normalizePatientReport(body, c); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(PatientReportError);
    expect(err.status).toBe(400);
    expect(err.message.length).toBeGreaterThan(0);
}

describe('PatientPregnancyReportRules', () => {
    test('REPORT_ANSWERS', () => {
        expect(REPORT_ANSWERS).toEqual(['lahir_sehat', 'keguguran', 'ektopik', 'masih_hamil']);
    });

    describe('shouldAsk / isPastHpl', () => {
        test('hpl yesterday asks', () => {
            expect(shouldAsk({ hpl: '2026-11-21', report_snoozed_until: null }, TODAY)).toBe(true);
        });
        test('hpl today does not ask', () => {
            expect(shouldAsk({ hpl: '2026-11-22' }, TODAY)).toBe(false);
            expect(isPastHpl({ hpl: '2026-11-22' }, TODAY)).toBe(false);
        });
        test('only hpht, past hpht+280 asks', () => {
            expect(shouldAsk({ hpht: '2026-01-01' }, TODAY)).toBe(true);
        });
        test('only hpht, not yet past', () => {
            expect(shouldAsk({ hpht: '2026-06-01' }, TODAY)).toBe(false);
        });
        test('snoozed until today hides, until yesterday asks', () => {
            expect(shouldAsk({ hpl: '2026-11-01', report_snoozed_until: '2026-11-22' }, TODAY)).toBe(false);
            expect(shouldAsk({ hpl: '2026-11-01', report_snoozed_until: '2026-11-21' }, TODAY)).toBe(true);
        });
        test('snooze as Date object (mysql DATE) works', () => {
            expect(shouldAsk({ hpl: '2026-11-01', report_snoozed_until: new Date(2026, 10, 25) }, TODAY)).toBe(false);
        });
        test('snoozed row is still past HPL', () => {
            expect(isPastHpl({ hpl: '2026-11-01', report_snoozed_until: '2026-12-01' }, TODAY)).toBe(true);
        });
        test('null row and no dating', () => {
            expect(shouldAsk(null, TODAY)).toBe(false);
            expect(isPastHpl(null, TODAY)).toBe(false);
            expect(shouldAsk({}, TODAY)).toBe(false);
        });
    });

    describe('snoozeUntil', () => {
        test('adds 7 days', () => {
            expect(snoozeUntil('2026-11-22')).toBe('2026-11-29');
            expect(snoozeUntil('2026-12-28')).toBe('2027-01-04');
        });
    });

    describe('normalizePatientReport', () => {
        test('lahir sehat normal one baby', () => {
            const { cols } = normalizePatientReport(birth(), ctx);
            expect(cols).toMatchObject({
                status: 'ended',
                outcome: 'lahir_hidup',
                ended_on: '2026-10-05',
                delivery_method: 'Spt B (Spontan)',
                delivery_place: 'RSIA Melinda',
                babies: '[{"weight_g":3100,"alive":true}]',
                needs_review: 1,
                review_reason: 'Dilaporkan pasien',
                ended_by_patient: 1,
                updated_by: 'patient:P1'
            });
            expect(cols.ga_weeks_at_end).toBe(39);
            expect(cols.term).toBe('aterm');
        });

        test('ga_weeks_at_end is capped at 127 (signed TINYINT)', () => {
            const { cols } = normalizePatientReport(birth(), { ...ctx, hpht: '2023-10-01' });
            expect(cols.ga_weeks_at_end).toBe(127);
        });

        test('sc twins', () => {
            const { cols } = normalizePatientReport(birth({ delivery: 'sc', babies: [{ weight_g: 2500 }, { weight_g: 2600 }] }), ctx);
            expect(cols.delivery_method).toBe('SC (Caesar)');
            expect(JSON.parse(cols.babies)).toHaveLength(2);
        });

        test('keguguran at GA 10 is abortus, no babies', () => {
            const { cols } = normalizePatientReport({ answer: 'keguguran', ended_on: '2026-03-12' }, ctx);
            expect(cols.ga_weeks_at_end).toBe(10);
            expect(cols.outcome).toBe('abortus');
            expect(cols.babies).toBeNull();
            expect(cols.delivery_method).toBeNull();
            expect(cols.term).toBeNull();
            expect(cols.delivery_place).toBeNull();
        });

        test('keguguran at GA 41 is lahir_mati', () => {
            const { cols } = normalizePatientReport({ answer: 'keguguran', ended_on: '2026-10-15', place: 'RS X' }, ctx);
            expect(cols.ga_weeks_at_end).toBe(41);
            expect(cols.outcome).toBe('lahir_mati');
            expect(cols.delivery_place).toBe('RS X');
        });

        test('ektopik', () => {
            const { cols } = normalizePatientReport({ answer: 'ektopik', ended_on: '2026-03-01' }, ctx);
            expect(cols.outcome).toBe('ektopik');
        });

        test('rejections', () => {
            expect400(birth({ place: '' }));
            expect400(birth({ place: undefined }));
            expect400(birth({ place: 'x'.repeat(121) }));
            expect400(birth({ babies: [] }));
            expect400(birth({ babies: [{ weight_g: 3000 }, { weight_g: 3000 }, { weight_g: 3000 }, { weight_g: 3000 }] }));
            expect400(birth({ babies: [{ weight_g: 499 }] }));
            expect400(birth({ babies: [{ weight_g: 6001 }] }));
            expect400(birth({ babies: [{ weight_g: 3100.5 }] }));
            expect400(birth({ delivery: 'vakum' }));
            for (const d of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty', 5, null, {}]) {
                expect400(birth({ delivery: d }));
            }
            expect400(birth({ ended_on: '2025-12-31' }));
            expect400(birth({ ended_on: '2026-11-23' }));
            expect400(birth({ ended_on: undefined }));
            expect400(birth({ answer: 'foo' }));
            expect400({ answer: 'masih_hamil' });
            expect400(null);
            expect400({ answer: 'keguguran', ended_on: '2026-03-01', place: 'x'.repeat(121) });
        });

        test('ended_on equal to hpht and to today is accepted', () => {
            expect(() => normalizePatientReport({ answer: 'ektopik', ended_on: HPHT }, ctx)).not.toThrow();
            expect(() => normalizePatientReport({ answer: 'ektopik', ended_on: TODAY }, ctx)).not.toThrow();
        });
    });
});
