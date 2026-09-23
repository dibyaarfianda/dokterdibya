jest.mock('../../services/sundayClinicMedifySyncQueue', () => ({}));
jest.mock('../../db', () => ({
    query: jest.fn()
}));

jest.mock('../../middleware/auth', () => {
    const authenticate = (req, res, next) => {
        req.user = { id: 'staff-1', role: 'dokter', role_id: 1 };
        next();
    };
    return {
        verifyToken: authenticate,
        verifyPatientToken: authenticate,
        verifyStaffToken: authenticate,
        requirePermission: () => (req, res, next) => next(),
        requireSuperadmin: (req, res, next) => next()
    };
});

jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn()
}));

jest.mock('../../realtime-sync', () => ({
    broadcast: jest.fn(),
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


describe('booking break API', () => {
    let setting;
    let app;
    const payload = { session_name: 'Pagi', day_of_week: 0, start_time: '09:00', end_time: '10:00', slot_duration: 15, max_slots: 4, is_active: true, break_start_time: '09:20', break_duration_minutes: 30 };
    beforeEach(() => {
        jest.clearAllMocks();
        require('../../utils/cache').clear();
        require('../../services/booking-session-settings').invalidateSessionSettingsCache();
        setting = { id: 1, session_number: 1, ...payload, break_start_time: null, break_duration_minutes: null };
        app = makeApp();
        db.query.mockImplementation(async (sql, params) => {
            if (sql.includes('information_schema.columns')) return [[{ exists: 1 }]];
            if (sql.includes('UPDATE booking_settings')) {
                const names = [...sql.matchAll(/(\w+)\s*=\s*\?/g)].map(m => m[1]);
                names.forEach((name, i) => { if (name !== 'id') setting[name] = params[i]; });
                return [{ affectedRows: 1 }];
            }
            if (sql.includes('FROM booking_settings')) return [[setting].filter(s => !sql.includes('WHERE is_active = 1') || s.is_active)];
            if (sql.includes('FROM sunday_appointments') && !sql.includes('status NOT IN')) return [[{
                ...setting, session: 1, id: 202, slot_number: 2, status: 'confirmed', appointment_date: '2026-09-27', patient_id: 'patient-1'
            }]];
            return [[]];
        });
    });
    test('save extends end, updates public/available/existing booking time and preserves status and slot', async () => {
        await request(app).get('/api/booking-settings/public').expect(200);
        await request(app).get('/api/sunday-appointments/available?date=2026-09-27').set('Authorization', authHeader()).expect(200);
        await request(app).put('/api/booking-settings/1').send(payload).expect(200);
        expect(setting.end_time.slice(0,5)).toBe('10:35');
        expect(setting.break_start_time.slice(0,5)).toBe('09:20');
        const pub = await request(app).get('/api/booking-settings/public').expect(200);
        expect(pub.body.sessions[0]).toMatchObject({ breakStartTime: '09:20', breakDurationMinutes: 30, endTime: '10:35' });
        const available = await request(app).get('/api/sunday-appointments/available?date=2026-09-27').set('Authorization', authHeader()).expect(200);
        expect(available.body.sessions[0].break).toEqual({ startTime: '09:20', endTime: '09:50', durationMinutes: 30 });
        expect(available.body.sessions[0].slots.map(s => s.time)).toEqual(['09:00','09:50','10:05','10:20']);
        const mine = await request(app).get('/api/sunday-appointments/my-bookings').set('Authorization', authHeader()).expect(200);
        expect(mine.body.bookings[0]).toMatchObject({ id: 202, slot_number: 2, status: 'confirmed', slot_time: '09:50' });
        const staff = await request(app).get('/api/booking-settings/bookings').expect(200);
        expect(staff.body.bookings[0].slot_time).toBe('09:50');
        expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE sunday_appointments'))).toBe(false);
        expect(require('../../routes/patient-notifications').createPatientNotification).not.toHaveBeenCalled();
    });
    test.each([
        { break_duration_minutes: 1.5 }, { break_duration_minutes: 0 }, { break_duration_minutes: -1 },
        { break_duration_minutes: '30abc' }, { break_start_time: '25:00' }, { break_start_time: null },
        { break_start_time: '08:00' }, { break_start_time: '23:30', break_duration_minutes: 40 },
        { start_time: '23:00', end_time: '23:59', break_start_time: '23:15', break_duration_minutes: 20 }
    ])('rejects invalid schedule %j without writing', async changes => {
        await request(app).put('/api/booking-settings/1').send({ ...payload, ...changes }).expect(400);
        expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE booking_settings'))).toBe(false);
    });
    test('status notifications and fresh patient queue use shifted times', async () => {
        await request(app).put('/api/booking-settings/1').send(payload).expect(200);
        await request(app).put('/api/sunday-appointments/202/status').set('Authorization', authHeader()).send({ status: 'confirmed' }).expect(200);
        expect(require('../../routes/patient-notifications').createPatientNotification).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('09:50') }));
        app.get('/test-queue', require('../../services/sunday-clinic/queue').getQueuePublic);
        const queue = await request(app).get('/test-queue').expect(200);
        expect(queue.body.data[0].slot_time).toBe('09:50');
    });
    test('manual break updates independently and is returned after refresh with no cache', async () => {
        const state = { is_queue_visible: 1, doctor_arrived: 1, is_on_break: 0 };
        const original = db.query.getMockImplementation();
        db.query.mockImplementation(async (sql, params) => {
            if (sql.includes('UPDATE clinic_queue_settings')) {
                [...sql.matchAll(/(\w+)\s*=\s*\?/g)].forEach((match, i) => { state[match[1]] = params[i]; });
                return [{affectedRows:1}];
            }
            if (sql.includes('FROM clinic_queue_settings')) return [[{...state}]];
            return original(sql, params);
        });
        const handlers = require('../../services/sunday-clinic/queue');
        app.put('/test-settings', handlers.putQueueSettings);
        app.get('/test-settings', handlers.getQueueSettings);
        const result = await request(app).put('/test-settings').send({is_on_break:true}).expect(200);
        expect(result.body).toMatchObject({is_on_break:true,is_queue_visible:true,doctor_arrived:true});
        const fresh = await request(app).get('/test-settings').expect(200);
        expect(fresh.body.is_on_break).toBe(true);
        expect(fresh.headers['cache-control']).toContain('no-store');
        await request(app).put('/test-settings').send({is_on_break:'yes'}).expect(400);
        await request(app).put('/test-settings').send({is_on_break:false}).expect(200);
        expect(state).toEqual({is_queue_visible:1,doctor_arrived:1,is_on_break:0});
    });
    test('inactive session with existing appointments still exposes its break in queue settings', async () => {
        setting.break_start_time = '09:20'; setting.break_duration_minutes = 30; setting.is_active = false;
        const handlers = require('../../services/sunday-clinic/queue');
        app.get('/test-settings', handlers.getQueueSettings);
        const response = await request(app).get('/test-settings').expect(200);
        expect(response.body.breaks).toContainEqual({session:1,startTime:'09:20',endTime:'09:50',durationMinutes:30});
    });
    test('new sessions persist their break and extended end', async () => {
        db.query.mockImplementationOnce(async () => [[]]);
        await request(app).post('/api/booking-settings').send({ ...payload, session_number: 2 }).expect(201);
        const insert = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO booking_settings'));
        expect(insert[1]).toEqual([2, 'Pagi', 0, '09:00:00', '10:35:00', 15, 4, 1, '09:20', 30]);
    });
    test('disabled sessions keep existing booking times but cannot be booked', async () => {
        await request(app).put('/api/booking-settings/1').send({ ...payload, is_active: false }).expect(200);
        const mine = await request(app).get('/api/sunday-appointments/my-bookings').set('Authorization', authHeader()).expect(200);
        expect(mine.body.bookings[0].slot_time).toBe('09:50');
        await request(app).get('/api/sunday-appointments/available?date=2026-09-27').set('Authorization', authHeader()).expect(400);
    });
    test('omitted break fields preserve it; explicit nulls remove it', async () => {
        await request(app).put('/api/booking-settings/1').send(payload).expect(200);
        const { break_start_time, break_duration_minutes, ...oldClient } = payload;
        await request(app).put('/api/booking-settings/1').send(oldClient).expect(200);
        expect(setting.break_duration_minutes).toBe(30);
        await request(app).put('/api/booking-settings/1').send({ ...payload, break_start_time: null, break_duration_minutes: null }).expect(200);
        expect(setting.break_start_time).toBeNull();
        const mine = await request(app).get('/api/sunday-appointments/my-bookings').set('Authorization', authHeader()).expect(200);
        expect(mine.body.bookings[0].slot_time).toBe('09:15');
    });
});

