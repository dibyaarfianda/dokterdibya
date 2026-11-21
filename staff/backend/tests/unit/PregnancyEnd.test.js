'use strict';

const PE = require('../../services/PregnancyEnd');

describe('PregnancyEnd exports', () => {
    test('exports exactly the kept helpers (the HPHT - 14 days date rule is retired)', () => {
        expect(Object.keys(PE).sort()).toEqual(['END_TOLERANCE_DAYS', 'toDateString']);
        expect(PE.END_TOLERANCE_DAYS).toBe(14);
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
