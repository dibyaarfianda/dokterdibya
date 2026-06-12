const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('patient portal date-only parsing', () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
        process.env.TZ = originalTz;
    });

    test('parseDateOnlyLocal keeps Sunday appointment dates on Sunday across client timezones', () => {
        process.env.TZ = 'America/Los_Angeles';
        const source = fs.readFileSync(path.join(__dirname, '../../../..', 'public/scripts/patient-utils.js'), 'utf8');
        const match = source.match(/function parseDateOnlyLocal\(dateStr\) \{[\s\S]*?\n\}/);

        expect(match).not.toBeNull();

        const context = {};
        vm.createContext(context);
        vm.runInContext(`${match[0]}; result = parseDateOnlyLocal('2026-06-14');`, context);

        expect(context.result.getFullYear()).toBe(2026);
        expect(context.result.getMonth()).toBe(5);
        expect(context.result.getDate()).toBe(14);
        expect(context.result.toLocaleDateString('id-ID', { weekday: 'long' })).toBe('Minggu');
    });
});
