const { buildCalendar } = require('../../services/AssistantDafCalendar');

describe('Asisten DAF private calendar feed', () => {
  test('includes an H-1 alarm without patient name or source message', () => {
    const ics = buildCalendar([{ id: 7, schedule_day: '20261003', start_clock: '073000', location: 'Melinda', patient_name: 'Bu Sri', agenda: 'SC Bu Sri' }], new Date('2026-09-29T00:00:00Z'));
    expect(ics).toContain('DTSTART:20261003T003000Z');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).not.toContain('Sri');
    expect(ics).toContain('SUMMARY:Tindakan terjadwal');
  });
});
