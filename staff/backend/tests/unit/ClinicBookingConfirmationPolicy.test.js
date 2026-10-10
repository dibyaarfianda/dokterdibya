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

function installBookingDatabaseFixture({ insertAffectedRows = 1 } = {}) {
    let insertedStatus = null;
    let insertCall = null;

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
            insertCall = { sql, params };
            return [{ insertId: insertAffectedRows ? 901 : 0, affectedRows: insertAffectedRows }];
        }
        throw new Error(`Unexpected SQL in booking fixture: ${sql}`);
    });

    return {
        getInsertedStatus: () => insertedStatus,
        getInsertCall: () => insertCall
    };
}

describe('private clinic booking confirmation policy', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        settings.invalidateSessionSettingsCache();
    });

    afterEach(() => {
        jest.useRealTimers();
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

    test('same-day confirmation booking after 07:00 WIB enables its popup immediately', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date('2026-10-11T00:30:00Z')); // 07:30 WIB
        const fixture = installBookingDatabaseFixture();

        await request(app)
            .post('/api/sunday-appointments/book')
            .set('Authorization', 'patient')
            .send({
                appointment_date: '2026-10-11',
                session: 1,
                slot_number: 1,
                chief_complaint: 'Keluhan simulasi',
                consultation_category: 'obstetri'
            })
            .expect(201);

        expect(fixture.getInsertCall().sql).toContain('confirmation_popup_enabled_at');
        expect(fixture.getInsertCall().params[10]).toBe(true);
        expect(fixture.getInsertCall().params.slice(-2)).toEqual([true, true]);
    });

    test('same-day confirmation booking is rejected at the 09:00 WIB cutoff', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date('2026-10-11T02:00:00Z')); // 09:00 WIB
        const fixture = installBookingDatabaseFixture();

        const response = await request(app)
            .post('/api/sunday-appointments/book')
            .set('Authorization', 'patient')
            .send({
                appointment_date: '2026-10-11',
                session: 1,
                slot_number: 1,
                chief_complaint: 'Keluhan simulasi',
                consultation_category: 'obstetri'
            })
            .expect(400);

        expect(response.body.message).toContain('09.00 WIB');
        expect(fixture.getInsertedStatus()).toBeNull();
    });

    test('database cutoff rejects a same-day booking that crosses 09:00 during processing', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date('2026-10-11T01:59:00Z')); // 08:59 WIB at request validation
        const fixture = installBookingDatabaseFixture({ insertAffectedRows: 0 });

        const response = await request(app)
            .post('/api/sunday-appointments/book')
            .set('Authorization', 'patient')
            .send({
                appointment_date: '2026-10-11',
                session: 1,
                slot_number: 1,
                chief_complaint: 'Keluhan simulasi',
                consultation_category: 'obstetri'
            })
            .expect(400);

        expect(fixture.getInsertCall().sql).toContain("CURTIME() < '09:00:00'");
        expect(response.body.message).toContain('09.00 WIB');
    });

    test.each([
        ['patient portal', '/api/sunday-appointments/501/confirm-attendance', 'patient'],
        ['confirmation token', `/api/sunday-appointments/by-token/${'a'.repeat(64)}/confirm`, null]
    ])('%s confirmation cannot resurrect a booking changed at the cutoff', async (_label, path, authorization) => {
        db.query.mockImplementation(async (sql) => {
            if (sql.includes('FROM sunday_appointments')) {
                return [[{ id: 501, patient_id: 'PATIENT-1', patient_name: 'Pasien Simulasi', session: 1, slot_number: 1, status: 'pending_confirmation' }]];
            }
            if (sql.includes('FROM booking_settings')) return [SESSION_ROWS];
            if (sql.includes('UPDATE sunday_appointments')) return [{ affectedRows: 0 }];
            throw new Error(`Unexpected SQL in confirmation race fixture: ${sql}`);
        });

        const call = request(app).post(path);
        if (authorization) call.set('Authorization', authorization);
        const response = await call.expect(409);

        expect(response.body.message).toContain('tidak dapat dikonfirmasi');
        const confirmationUpdate = db.query.mock.calls.find(([sql]) => sql.includes('UPDATE sunday_appointments'));
        expect(confirmationUpdate[0]).toContain("status = 'pending_confirmation'");
        expect(confirmationUpdate[0]).toContain("CURTIME() < '09:00:00'");
    });
});
