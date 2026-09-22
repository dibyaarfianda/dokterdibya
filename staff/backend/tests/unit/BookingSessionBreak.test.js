jest.mock('../../db', () => ({ query: jest.fn() }));
const { getSlotTimeFromSettings } = require('../../services/booking-session-settings');

describe('session break slot times', () => {
    const base = { session: 1, startTime: '09:00', endTime: '10:00', slotDuration: 15, maxSlots: 4 };
    test('legacy sessions keep their times', () => {
        expect(getSlotTimeFromSettings([base], 1, 3)).toBe('09:30');
    });
    test.each([
        ['09:30', 30, ['09:00', '09:15', '10:00', '10:15']],
        ['09:20', 30, ['09:00', '09:50', '10:05', '10:20']],
        ['09:00', 20, ['09:20', '09:35', '09:50', '10:05']]
    ])('moves complete slots around break at %s', (breakStartTime, breakDurationMinutes, times) => {
        const settings = [{ ...base, breakStartTime, breakDurationMinutes }];
        expect(times.map((_, index) => getSlotTimeFromSettings(settings, 1, index + 1))).toEqual(times);
    });
    test('removing a break restores original times', () => {
        expect(getSlotTimeFromSettings([{ ...base, breakStartTime: null, breakDurationMinutes: null }], 1, 2)).toBe('09:15');
    });
});


describe('shared browser and backend schedule calculator', () => {
    const fs = require('fs');
    const vm = require('vm');
    const path = require('path');
    const calculator = require('../../../public/scripts/booking-slot-utils');
    const setting = { start_time: '09:00', end_time: '10:00', slot_duration: 15, max_slots: 4, break_start_time: '09:20', break_duration_minutes: 30 };
    test('browser global produces identical slots and extended session end', () => {
        const context = vm.createContext({});
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../../../public/scripts/booking-slot-utils.js'), 'utf8'), context);
        const actual = JSON.parse(JSON.stringify(context.BookingSlotUtils.schedule(setting)));
        expect(actual).toEqual(calculator.schedule(setting));
        expect(actual).toMatchObject({ end_time: '10:35', break_end_time: '09:50' });
    });
    test('changing or removing a break recalculates the preview', () => {
        expect(calculator.schedule({ ...setting, break_duration_minutes: 10 }).slots[1].time).toBe('09:30');
        expect(calculator.schedule({ ...setting, break_start_time: null, break_duration_minutes: null }).end_time).toBe('10:00');
    });
    test('final slot must finish before midnight even without a break', () => {
        expect(() => calculator.schedule({ ...setting, start_time: '23:00', end_time: '23:59', break_start_time: null, break_duration_minutes: null })).toThrow(/tengah malam/);
    });
});
