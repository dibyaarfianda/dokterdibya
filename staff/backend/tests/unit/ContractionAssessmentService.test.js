const {
    assessContractionPattern,
    normalizeGestationalAge
} = require('../../services/ContractionAssessmentService');

describe('ContractionAssessmentService', () => {
    const termAge = { weeks: 39, days: 0 };

    function event(durationSeconds, intervalFromPreviousSeconds = null) {
        return {
            duration_seconds: durationSeconds,
            interval_from_previous_seconds: intervalFromPreviousSeconds
        };
    }

    test('allows contraction timing before 28 weeks with conservative warning copy', () => {
        const assessment = assessContractionPattern({
            gestationalAge: { weeks: 27, days: 6 },
            events: [event(70, 240), event(68, 250), event(72, 245)]
        });

        expect(assessment.code).toBe('inconclusive');
        expect(assessment.canUseTimer).toBe(true);
        expect(assessment.next_action).toMatch(/IGD|unit persalinan/i);
    });

    test('allows contraction timing without a gestational age snapshot', () => {
        const assessment = assessContractionPattern({
            events: [event(70, 240), event(68, 250), event(72, 245)]
        });

        expect(assessment.code).toBe('inconclusive');
        expect(assessment.canUseTimer).toBe(true);
        expect(assessment.next_action).toMatch(/Catat|tanda bahaya/i);
    });

    test('uses preterm warning for persistent contractions before 37 weeks', () => {
        const assessment = assessContractionPattern({
            gestationalAge: { weeks: 36, days: 5 },
            events: [event(55, null), event(58, 360), event(61, 350), event(59, 370)],
            restHydrationResult: 'not_improved'
        });

        expect(assessment.code).toBe('preterm_warning');
        expect(assessment.next_action).toMatch(/IGD|unit persalinan/);
    });

    test('flags Braxton Hicks-like contractions when they improve after rest and hydration', () => {
        const assessment = assessContractionPattern({
            gestationalAge: termAge,
            events: [event(32, null), event(38, 820), event(28, 620)],
            restHydrationResult: 'improved'
        });

        expect(assessment.code).toBe('braxton_hicks_like');
        expect(assessment.label).toMatch(/Braxton Hicks/);
    });

    test('returns latent-like when term contractions persist but are not five-one-one regular', () => {
        const assessment = assessContractionPattern({
            gestationalAge: termAge,
            events: [event(48, null), event(52, 430), event(56, 410), event(54, 420)],
            restHydrationResult: 'not_improved'
        });

        expect(assessment.code).toBe('latent_like');
        expect(assessment.copy).toMatch(/fase laten/i);
        expect(assessment.copy).not.toMatch(/fase aktif pasti/i);
    });

    test('returns urgent evaluation when last contractions are regular, one minute long, and five minutes apart', () => {
        const assessment = assessContractionPattern({
            gestationalAge: termAge,
            events: [event(62, null), event(65, 295), event(64, 305), event(63, 300)],
            restHydrationResult: 'not_improved'
        });

        expect(assessment.code).toBe('urgent_evaluation');
        expect(assessment.copy).toContain('pola kontraksi sudah teratur dan perlu evaluasi persalinan');
        expect(assessment.copy).not.toMatch(/fase aktif pasti/i);
    });

    test('red flags override contraction pattern', () => {
        const assessment = assessContractionPattern({
            gestationalAge: termAge,
            events: [event(40, null)],
            redFlags: ['ketuban_pecah']
        });

        expect(assessment.code).toBe('emergency_now');
        expect(assessment.next_action).toMatch(/segera/i);
    });

    test('normalizes gestational age from week and day inputs', () => {
        expect(normalizeGestationalAge({ weeks: '36', days: '5' })).toEqual({
            weeks: 36,
            days: 5,
            totalDays: 257
        });
    });
});
