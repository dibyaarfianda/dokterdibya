jest.mock('../../db', () => ({
    query: jest.fn()
}));

const db = require('../../db');
const BookingSessionService = require('../../services/BookingSessionService');

describe('BookingSessionService', () => {
    const originalFlag = process.env.BOOKING_SESSION_V2_ENABLED;

    beforeEach(() => {
        jest.clearAllMocks();
        BookingSessionService.clearCache();
        delete process.env.BOOKING_SESSION_V2_ENABLED;
    });

    afterAll(() => {
        process.env.BOOKING_SESSION_V2_ENABLED = originalFlag;
    });

    it('uses legacy booking_settings when v2 flag is off', async () => {
        db.query.mockResolvedValueOnce([[
            {
                id: 1,
                session_number: 1,
                session_name: 'Pagi',
                day_of_week: 0,
                start_time: '09:00:00',
                end_time: '11:00:00',
                slot_duration: 10,
                max_slots: 6,
                is_active: 1
            }
        ]]);

        const settings = await BookingSessionService.getActiveSessionSettings();

        expect(settings).toEqual([
            expect.objectContaining({
                source: 'legacy',
                templateId: null,
                session: 1,
                dayOfWeek: 0,
                label: '09:00 - 11:00 (Pagi)'
            })
        ]);
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM booking_settings'));
    });

    it('uses v2 templates when the flag is on and permits the same session number on different days', async () => {
        process.env.BOOKING_SESSION_V2_ENABLED = 'true';
        db.query.mockResolvedValueOnce([[
            {
                id: 11,
                session_number: 1,
                session_name: 'Minggu Pagi',
                day_of_week: 0,
                start_time: '08:00:00',
                end_time: '10:00:00',
                slot_duration: 10,
                max_slots: 8,
                is_active: 1
            },
            {
                id: 12,
                session_number: 1,
                session_name: 'Sabtu Pagi',
                day_of_week: 6,
                start_time: '09:00:00',
                end_time: '11:00:00',
                slot_duration: 15,
                max_slots: 6,
                is_active: 1
            }
        ]]);

        const settings = await BookingSessionService.getActiveSessionSettings();

        expect(settings).toHaveLength(2);
        expect(settings.map(s => [s.templateId, s.session, s.dayOfWeek])).toEqual([
            [11, 1, 0],
            [12, 1, 6]
        ]);
        expect(BookingSessionService.getSlotTime(settings[0], 3)).toBe('08:20');
        expect(BookingSessionService.getSlotTime(settings[1], 3)).toBe('09:30');
    });

    it('resolves legacy appointments without booking_session_template_id from the session number', async () => {
        db.query.mockResolvedValueOnce([[
            {
                id: 1,
                session_number: 2,
                session_name: 'Siang',
                day_of_week: 0,
                start_time: '12:00:00',
                end_time: '14:00:00',
                slot_duration: 15,
                max_slots: 10,
                is_active: 1
            }
        ]]);

        const resolved = await BookingSessionService.resolveAppointmentSession({
            appointment: {
                appointment_date: '2026-06-14',
                session: 2,
                slot_number: 4,
                booking_session_template_id: null
            }
        });

        expect(resolved).toMatchObject({
            sessionLabel: '12:00 - 14:00 (Siang)',
            slotTime: '12:45',
            templateId: null
        });
    });
});
