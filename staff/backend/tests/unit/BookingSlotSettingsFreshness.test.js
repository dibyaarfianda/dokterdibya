jest.mock('../../db', () => ({
    query: jest.fn()
}));

jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => {
        req.user = { id: 'staff-1', role: 'dokter', role_id: 1 };
        next();
    },
    requirePermission: () => (req, res, next) => next(),
    requireSuperadmin: (req, res, next) => next()
}));

jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn()
}));

jest.mock('../../realtime-sync', () => ({
    broadcastNewBooking: jest.fn(),
    broadcastBookingCancel: jest.fn(),
    broadcastBookingUpdate: jest.fn(),
    broadcastCancellation: jest.fn()
}));

jest.mock('../../services/patientActivityLogger', () => ({
    logAppointmentBooking: jest.fn()
}));

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = require('../../db');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/sunday-appointments', require('../../routes/sunday-appointments'));
    app.use('/api/booking-settings', require('../../routes/booking-settings'));
    return app;
}

function authHeader(userId = 'patient-1') {
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
    return `Bearer ${token}`;
}

describe('booking slot setting freshness', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        const sundayAppointmentsRoutes = require('../../routes/sunday-appointments');
        sundayAppointmentsRoutes.invalidateSessionSettingsCache();
    });

    test('patient bookings use the latest booking_settings time instead of stale defaults', async () => {
        const app = makeApp();
        let bookingSetting = {
            session_number: 1,
            session_name: 'Pagi',
            day_of_week: 0,
            start_time: '08:30:00',
            end_time: '10:30:00',
            slot_duration: 10,
            max_slots: 12
        };

        db.query.mockImplementation(async (sql) => {
            if (sql.includes('information_schema.columns')) {
                return [[{ exists: 1 }]];
            }

            if (sql.includes('FROM booking_settings WHERE is_active = 1')) {
                return [[[bookingSetting][0]]];
            }

            if (sql.includes('FROM sunday_appointments') && sql.includes('WHERE patient_id = ?')) {
                return [[{
                    id: 101,
                    appointment_date: '2026-06-28',
                    session: 1,
                    slot_number: 3,
                    chief_complaint: 'Kontrol kehamilan',
                    consultation_category: 'obstetri',
                    status: 'confirmed',
                    notes: null,
                    created_at: '2026-06-24 08:00:00'
                }]];
            }

            return [[]];
        });

        const response = await request(app)
            .get('/api/sunday-appointments/my-bookings?status=confirmed')
            .set('Authorization', authHeader('patient-1'))
            .expect(200);

        expect(response.body.bookings[0]).toMatchObject({
            id: 101,
            sessionLabel: '08:30 - 10:30 (Pagi)',
            slot_time: '08:50'
        });
    });

    test('booking setting updates invalidate Sunday appointment slot calculations immediately', async () => {
        const app = makeApp();
        let bookingSetting = {
            id: 1,
            session_number: 1,
            session_name: 'Pagi',
            day_of_week: 0,
            start_time: '09:00:00',
            end_time: '10:00:00',
            slot_duration: 15,
            max_slots: 4
        };

        db.query.mockImplementation(async (sql, params) => {
            if (sql.includes('information_schema.columns')) {
                return [[{ exists: 1 }]];
            }

            if (sql.includes('FROM disabled_practice_dates')) {
                return [[]];
            }

            if (sql.includes('SELECT session_number') && sql.includes('FROM booking_settings WHERE is_active = 1')) {
                return [[bookingSetting]];
            }

            if (sql.includes('SELECT id FROM booking_settings WHERE id = ?')) {
                return [[{ id: 1, session_number: 1 }]];
            }

            if (sql.includes('UPDATE booking_settings')) {
                bookingSetting = {
                    ...bookingSetting,
                    session_name: params[0],
                    day_of_week: params[1],
                    start_time: `${params[2]}:00`,
                    end_time: `${params[3]}:00`,
                    slot_duration: params[4],
                    max_slots: params[5],
                    is_active: params[6]
                };
                return [{ affectedRows: 1 }];
            }

            if (sql.includes('FROM sunday_appointments') && sql.includes('status NOT IN')) {
                return [[]];
            }

            if (sql.includes('FROM sunday_appointments') && sql.includes('WHERE patient_id = ?')) {
                return [[{
                    id: 202,
                    appointment_date: '2026-06-28',
                    session: 1,
                    slot_number: 2,
                    chief_complaint: 'Kontrol ulang',
                    consultation_category: 'obstetri',
                    status: 'confirmed',
                    notes: null,
                    created_at: '2026-06-24 08:00:00'
                }]];
            }

            return [[]];
        });

        const initial = await request(app)
            .get('/api/sunday-appointments/available?date=2026-06-28')
            .set('Authorization', authHeader('patient-1'))
            .expect(200);
        expect(initial.body.sessions[0].slots[1].time).toBe('09:15');

        await request(app)
            .put('/api/booking-settings/1')
            .send({
                session_name: 'Pagi',
                day_of_week: 0,
                start_time: '08:30',
                end_time: '09:30',
                slot_duration: 10,
                max_slots: 4,
                is_active: 1
            })
            .expect(200);

        const bookings = await request(app)
            .get('/api/sunday-appointments/my-bookings?status=confirmed')
            .set('Authorization', authHeader('patient-1'))
            .expect(200);

        expect(bookings.body.bookings[0]).toMatchObject({
            id: 202,
            sessionLabel: '08:30 - 09:30 (Pagi)',
            slot_time: '08:40'
        });
    });
});
