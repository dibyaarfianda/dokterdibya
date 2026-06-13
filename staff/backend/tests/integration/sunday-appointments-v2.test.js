const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../db', () => ({
    query: jest.fn()
}));

jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn()
}));

jest.mock('../../realtime-sync', () => ({
    broadcastNewBooking: jest.fn(),
    broadcastCancellation: jest.fn(),
    broadcastBookingCancel: jest.fn(),
    broadcast: jest.fn()
}));

jest.mock('../../services/patientActivityLogger', () => ({
    EVENTS: { BOOKING: 'booking' },
    logActivity: jest.fn()
}));

const db = require('../../db');
const BookingSessionService = require('../../services/BookingSessionService');
const sundayAppointmentsRouter = require('../../routes/sunday-appointments');

const app = express();
app.use(express.json());
app.use('/api/sunday-appointments', sundayAppointmentsRouter);

function tokenFor(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('sunday appointments v2 compatibility', () => {
    const originalFlag = process.env.BOOKING_SESSION_V2_ENABLED;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
        process.env.BOOKING_SESSION_V2_ENABLED = 'true';
        BookingSessionService.clearCache();
    });

    afterAll(() => {
        process.env.BOOKING_SESSION_V2_ENABLED = originalFlag;
        BookingSessionService.clearCache();
    });

    it('stores booking_session_template_id for new v2 bookings while preserving legacy session', async () => {
        const patientToken = tokenFor({
            id: 'P001',
            email: 'patient@example.com',
            user_type: 'patient',
            role: 'patient'
        });

        db.query
            .mockResolvedValueOnce([[{ exists: 1 }]])
            .mockResolvedValueOnce([[
                {
                    id: 21,
                    session_number: 1,
                    session_name: 'Minggu Pagi',
                    day_of_week: 0,
                    start_time: '08:00:00',
                    end_time: '10:00:00',
                    slot_duration: 10,
                    max_slots: 8,
                    is_active: 1
                }
            ]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ id: 'P001', full_name: 'Patient One', phone: '08123' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ affectedRows: 0 }])
            .mockResolvedValueOnce([{ insertId: 99 }]);

        const response = await request(app)
            .post('/api/sunday-appointments/book')
            .set('Authorization', `Bearer ${patientToken}`)
            .send({
                appointment_date: '2026-06-14',
                session: 1,
                booking_session_template_id: 21,
                slot_number: 3,
                chief_complaint: 'Kontrol kehamilan rutin',
                consultation_category: 'obstetri'
            })
            .expect(201);

        expect(response.body).toMatchObject({
            appointmentId: 99,
            details: {
                booking_session_template_id: 21,
                time: '08:20'
            }
        });

        const insertCall = db.query.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO sunday_appointments')
        );
        expect(insertCall[0]).toContain('booking_session_template_id');
        expect(insertCall[1]).toEqual(expect.arrayContaining(['P001', '2026-06-14', 1, 21, 3]));
    });
});
