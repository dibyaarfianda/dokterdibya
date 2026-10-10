jest.mock('../../services/sundayClinicMedifySyncQueue', () => ({}));
jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    verifyPatientToken: (req, res, next) => {
        if (req.headers.authorization !== 'patient') return res.sendStatus(403);
        req.user = { id: 'PATIENT-1', user_type: 'patient' };
        return next();
    },
    verifyStaffToken: (req, res, next) => next()
}));
jest.mock('../../routes/patient-notifications', () => ({ createPatientNotification: jest.fn() }));
jest.mock('../../realtime-sync', () => ({
    broadcastNewBooking: jest.fn(),
    broadcastCancellation: jest.fn(),
    broadcastBookingUpdate: jest.fn(),
    broadcast: jest.fn()
}));
jest.mock('../../services/patientActivityLogger', () => ({
    EVENTS: { BOOKING: 'booking' },
    logActivity: jest.fn()
}));

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const settings = require('../../services/booking-session-settings');

const app = express();
app.use(express.json());
app.use('/api/sunday-appointments', require('../../routes/sunday-appointments'));

const SESSION_ROWS = [
    { session_number: 1, session_name: 'Sunday Clinic', day_of_week: 0, start_time: '09:00', end_time: '17:15', slot_duration: 15, max_slots: 25, is_active: 1 },
    { session_number: 2, session_name: 'Weekend Clinic', day_of_week: 6, start_time: '13:00', end_time: '18:00', slot_duration: 15, max_slots: 20, is_active: 1 },
    { session_number: 3, session_name: 'Klinik Rabu', day_of_week: 3, start_time: '16:00', end_time: '18:00', slot_duration: 15, max_slots: 8, is_active: 1 }
];

function installBookingDatabaseFixture() {
    let insertedStatus = null;

    db.query.mockImplementation(async (sql, params = []) => {
        if (sql.includes('FROM booking_settings')) return [SESSION_ROWS];
        if (sql.includes('FROM disabled_practice_dates')) return [[]];
        if (sql.includes('FROM patients WHERE id = ?')) {
            return [[{ id: 'PATIENT-1', full_name: 'Pasien Simulasi', phone: '0800000000' }]];
        }
        if (sql.includes('SELECT id FROM sunday_appointments')) return [[]];
        if (sql.includes('SELECT id, appointment_date, session, slot_number FROM sunday_appointments')) return [[]];
        if (sql.includes('DELETE FROM sunday_appointments')) return [{ affectedRows: 0 }];
        if (sql.includes('INSERT INTO sunday_appointments')) {
            insertedStatus = params[8];
            return [{ insertId: 901 }];
        }
        throw new Error(`Unexpected SQL in booking fixture: ${sql}`);
    });

    return { getInsertedStatus: () => insertedStatus };
}

describe('private clinic booking confirmation policy', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        settings.invalidateSessionSettingsCache();
    });

    test.each([
        ['Sunday Clinic', '2026-10-11', 1, 'pending_confirmation', true],
        ['Weekend Clinic', '2026-10-10', 2, 'confirmed', false],
        ['clinic on another weekday', '2026-10-14', 3, 'pending_confirmation', true]
    ])('%s creates the expected confirmation state', async (_label, appointmentDate, session, expectedStatus, requiresConfirmation) => {
        const fixture = installBookingDatabaseFixture();

        const response = await request(app)
            .post('/api/sunday-appointments/book')
            .set('Authorization', 'patient')
            .send({
                appointment_date: appointmentDate,
                session,
                slot_number: 1,
                chief_complaint: 'Keluhan simulasi',
                consultation_category: 'obstetri'
            })
            .expect(201);

        expect(response.body).toMatchObject({ status: expectedStatus, requiresConfirmation });
        expect(fixture.getInsertedStatus()).toBe(expectedStatus);
    });
});
