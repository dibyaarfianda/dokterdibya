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
const ACKNOWLEDGEMENT = { booking_policy_acknowledged: true, booking_policy_version: '20261017-confirmation-v1' };

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
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date('2026-10-08T00:00:00Z'));
        jest.clearAllMocks();
        settings.invalidateSessionSettingsCache();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test.each([
        ['Sunday Clinic', '2026-10-11', 1, 'pending_confirmation', true],
        ['Weekend Clinic', '2026-10-17', 2, 'pending_confirmation', true],
        ['clinic on another weekday', '2026-10-14', 3, 'pending_confirmation', true]
    ])('%s creates the expected confirmation state', async (_label, appointmentDate, session, expectedStatus, requiresConfirmation) => {
        const fixture = installBookingDatabaseFixture();

        const response = await request(app)
            .post('/api/sunday-appointments/book')
            .set('Authorization', 'patient')
            .send({
                ...ACKNOWLEDGEMENT,
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
                ...ACKNOWLEDGEMENT,
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

    test.each([
        ['09:00', '2026-10-17T02:00:00Z'],
        ['13:59:59', '2026-10-17T06:59:59Z']
    ])('same-day Weekend Clinic booking at %s WIB still requires confirmation and enables its popup', async (_time, now) => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date(now));
        const fixture = installBookingDatabaseFixture();
        const response = await request(app)
            .post('/api/sunday-appointments/book')
            .set('Authorization', 'patient')
            .send({ ...ACKNOWLEDGEMENT, appointment_date: '2026-10-17', session: 2, slot_number: 1, chief_complaint: 'Keluhan simulasi' })
            .expect(201);
        expect(response.body).toMatchObject({ status: 'pending_confirmation', requiresConfirmation: true });
        expect(response.body.message).toContain('14:00 WIB');
        expect(fixture.getInsertCall().params[10]).toBe(true);
    });

    test('same-day confirmation booking is rejected at the 14:00 WIB cutoff', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date('2026-10-11T07:00:00Z')); // 14:00 WIB
        const fixture = installBookingDatabaseFixture();

        const response = await request(app)
            .post('/api/sunday-appointments/book')
            .set('Authorization', 'patient')
            .send({
                ...ACKNOWLEDGEMENT,
                appointment_date: '2026-10-11',
                session: 1,
                slot_number: 1,
                chief_complaint: 'Keluhan simulasi',
                consultation_category: 'obstetri'
            })
            .expect(400);

        expect(response.body.message).toContain('14:00 WIB');
        expect(fixture.getInsertedStatus()).toBeNull();
    });

    test('the daily cutoff does not block booking a future clinic date', async () => {
        jest.setSystemTime(new Date('2026-10-17T07:30:00Z')); // 14:30 WIB
        const fixture = installBookingDatabaseFixture();
        await request(app).post('/api/sunday-appointments/book').set('Authorization', 'patient')
            .send({ ...ACKNOWLEDGEMENT, appointment_date: '2026-10-18', session: 1, slot_number: 1, chief_complaint: 'Keluhan simulasi' })
            .expect(201);
        expect(fixture.getInsertedStatus()).toBe('pending_confirmation');
        expect(fixture.getInsertCall().params.slice(-2)).toEqual([true, false]);
    });

    test('database cutoff rejects a same-day booking that crosses 14:00 during processing', async () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date('2026-10-11T06:59:00Z')); // 13:59 WIB at request validation
        const fixture = installBookingDatabaseFixture({ insertAffectedRows: 0 });

        const response = await request(app)
            .post('/api/sunday-appointments/book')
            .set('Authorization', 'patient')
            .send({
                ...ACKNOWLEDGEMENT,
                appointment_date: '2026-10-11',
                session: 1,
                slot_number: 1,
                chief_complaint: 'Keluhan simulasi',
                consultation_category: 'obstetri'
            })
            .expect(400);

        expect(fixture.getInsertCall().sql).toContain("CURTIME() < '14:00:00'");
        expect(response.body.message).toContain('14:00 WIB');
    });

    test.each([undefined, false, 'true', 1])('booking rejects missing or non-boolean acknowledgement %s before accessing the database', async (acknowledged) => {
        installBookingDatabaseFixture();
        const response = await request(app).post('/api/sunday-appointments/book').set('Authorization', 'patient')
            .send({ ...ACKNOWLEDGEMENT, booking_policy_acknowledged: acknowledged, appointment_date: '2026-10-17', session: 2, slot_number: 1, chief_complaint: 'Keluhan simulasi' })
            .expect(400);
        expect(response.body.code).toBe('BOOKING_POLICY_ACK_REQUIRED');
        expect(db.query).not.toHaveBeenCalled();
    });

    test('a stale notice version must be re-read instead of silently accepted', async () => {
        const response = await request(app).post('/api/sunday-appointments/book').set('Authorization', 'patient')
            .send({ ...ACKNOWLEDGEMENT, booking_policy_version: 'old-version', appointment_date: '2026-10-17', session: 2, slot_number: 1, chief_complaint: 'Keluhan simulasi' })
            .expect(400);
        expect(response.body.code).toBe('BOOKING_POLICY_UPDATED');
        expect(db.query).not.toHaveBeenCalled();
    });

    test('a booking stores the accepted policy version and a server timestamp in the same insert', async () => {
        const fixture = installBookingDatabaseFixture();
        await request(app).post('/api/sunday-appointments/book').set('Authorization', 'patient')
            .send({ ...ACKNOWLEDGEMENT, booking_policy_acknowledged_at: '1900-01-01', appointment_date: '2026-10-17', session: 2, slot_number: 1, chief_complaint: 'Keluhan simulasi' })
            .expect(201);
        const inserted = fixture.getInsertCall();
        expect(inserted.sql).toContain('booking_policy_acknowledged_at');
        expect(inserted.sql).toContain('booking_policy_version');
        expect(inserted.sql).toMatch(/IF\(\?, NOW\(\), NULL\), IF\(\?, NOW\(\), NULL\), \?/);
        expect(inserted.params[11]).toBe(true);
        expect(inserted.params[12]).toBe('20261017-confirmation-v1');
        expect(inserted.params).not.toContain('1900-01-01');
    });

    test('legacy native bookings remain compatible without inventing acknowledgement evidence', async () => {
        const fixture = installBookingDatabaseFixture();
        await request(app).post('/api/sunday-appointments/book').set('Authorization', 'patient')
            .send({ appointment_date: '2026-10-17', session: 2, slot_number: 1, chief_complaint: 'Keluhan simulasi' })
            .expect(201);
        expect(fixture.getInsertCall().params[11]).toBe(false);
        expect(fixture.getInsertCall().params[12]).toBeNull();
    });

    test('a browser cannot omit both acknowledgement fields to skip the checkbox', async () => {
        installBookingDatabaseFixture();
        const response = await request(app).post('/api/sunday-appointments/book').set('Authorization', 'patient')
            .set('Origin', 'https://sisiwanita.id')
            .send({ appointment_date: '2026-10-17', session: 2, slot_number: 1, chief_complaint: 'Keluhan simulasi' })
            .expect(400);
        expect(response.body.code).toBe('BOOKING_POLICY_ACK_REQUIRED');
        expect(db.query).not.toHaveBeenCalled();
    });

    test.each([
        ['2026-10-17T10:59:00Z', false],
        ['2026-10-17T11:00:00Z', true],
        ['2026-10-17T13:00:00Z', true],
        ['2026-10-17T17:30:00Z', true]
    ])('new bookings do not miss an already-open confirmation popup window at %s', async (now, expectedPopup) => {
        jest.setSystemTime(new Date(now));
        const fixture = installBookingDatabaseFixture();
        await request(app).post('/api/sunday-appointments/book').set('Authorization', 'patient')
            .send({ ...ACKNOWLEDGEMENT, appointment_date: '2026-10-18', session: 1, slot_number: 1, chief_complaint: 'Keluhan simulasi' })
            .expect(201);
        expect(fixture.getInsertCall().params[10]).toBe(expectedPopup);
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
        expect(confirmationUpdate[0]).toContain("CURTIME() < '14:00:00'");
    });

    test.each([
        ['patient portal', '/api/sunday-appointments/501/confirm-attendance', 'patient'],
        ['confirmation token', `/api/sunday-appointments/by-token/${'a'.repeat(64)}/confirm`, null]
    ])('%s can confirm at 13:59 WIB and rejects confirmation at 14:00 WIB', async (_label, path, authorization) => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        db.query.mockImplementation(async (sql) => {
            if (sql.includes('FROM booking_settings')) return [SESSION_ROWS];
            if (sql.includes('FROM sunday_appointments')) return [[{ id: 501, patient_id: 'PATIENT-1', session: 2, slot_number: 1, status: 'pending_confirmation' }]];
            if (sql.includes('UPDATE sunday_appointments')) {
                const cutoff = sql.match(/CURTIME\(\) < '(\d\d):00:00'/);
                const wibHour = (new Date().getUTCHours() + 7) % 24;
                return [{ affectedRows: cutoff && wibHour < Number(cutoff[1]) ? 1 : 0 }];
            }
            throw new Error(`Unexpected SQL: ${sql}`);
        });
        for (const [now, status] of [['2026-10-17T06:59:00Z', 200], ['2026-10-17T07:00:00Z', 409]]) {
            jest.setSystemTime(new Date(now));
            const call = request(app).post(path);
            if (authorization) call.set('Authorization', authorization);
            await call.expect(status);
        }
    });

    test.each(['09.00', '14.00'])('staff can manually confirm a system expiry from the %s WIB policy', async (deadline) => {
        db.query.mockImplementation(async (sql) => {
            if (sql.includes('FROM booking_settings')) return [SESSION_ROWS];
            if (sql.includes('FROM sunday_appointments')) return [[{
                id: 501, patient_id: 'PATIENT-1', session: 2, slot_number: 1,
                status: 'cancelled', cancelled_by: 'system',
                cancellation_reason: `Tidak konfirmasi kehadiran sebelum jam ${deadline} WIB`
            }]];
            if (sql.includes('UPDATE sunday_appointments')) return [{ affectedRows: 1 }];
            throw new Error(`Unexpected SQL: ${sql}`);
        });
        await request(app).post('/api/sunday-appointments/501/manual-confirm').expect(200);
    });
});
