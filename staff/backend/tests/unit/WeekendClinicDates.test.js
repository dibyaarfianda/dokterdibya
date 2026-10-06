jest.mock('../../services/sundayClinicMedifySyncQueue', () => ({}));
jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    verifyPatientToken: (req, res, next) => req.headers.authorization === 'patient' ? next() : res.sendStatus(403),
    verifyStaffToken: (req, res, next) => req.headers.authorization === 'staff' ? next() : res.sendStatus(403)
}));
jest.mock('../../routes/patient-notifications', () => ({ createPatientNotification: jest.fn() }));
jest.mock('../../realtime-sync', () => ({}));
jest.mock('../../services/patientActivityLogger', () => ({}));
const request = require('supertest');
const express = require('express');
const db = require('../../db');
const settings = require('../../services/booking-session-settings');
const app = express();
app.use('/api/sunday-appointments', require('../../routes/sunday-appointments'));

describe('staff Weekend Clinic practice dates', () => {
    let disabled;
    let rows;
    beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date('2026-10-06T13:00:00Z'));
        settings.invalidateSessionSettingsCache();
        disabled = [];
        rows = [
            { session_number: 1, session_name: 'Sunday Clinic', day_of_week: 0, start_time: '09:00', end_time: '17:15', slot_duration: 15, max_slots: 25, is_active: 1 },
            { session_number: 2, session_name: 'Weekend Clinic', day_of_week: 6, start_time: '13:00', end_time: '18:00', slot_duration: 15, max_slots: 20, is_active: 1 }
        ];
        db.query.mockImplementation(async sql => [sql.includes('FROM booking_settings') ? rows : disabled]);
    });
    afterEach(() => jest.useRealTimers());
    const dates = () => request(app).get('/api/sunday-appointments/practice-dates').set('Authorization', 'staff');
    test('returns next date for each active session and rejects patient access', async () => {
        const result = await dates().expect(200);
        expect(result.body.practices).toEqual(expect.arrayContaining([
            expect.objectContaining({ session: 2, dayOfWeek: 6, date: '2026-10-10', name: 'Weekend Clinic' }),
            expect.objectContaining({ session: 1, dayOfWeek: 0, date: '2026-10-11' })
        ]));
        await request(app).get('/api/sunday-appointments/practice-dates').set('Authorization', 'patient').expect(403);
        await request(app).get('/api/sunday-appointments/practice-dates').expect(403);
        expect(result.headers['cache-control']).toContain('no-store');
    });
    test.each([
        ['2026-10-10T13:59:59Z', '2026-10-10'],
        ['2026-10-10T14:00:00Z', '2026-10-17'],
        ['2026-10-09T17:01:00Z', '2026-10-10']
    ])('uses Jakarta cutoff for %s', async (now, expected) => {
        jest.setSystemTime(new Date(now));
        const result = await dates().expect(200);
        expect(result.body.practices.find(p => p.session === 2).date).toBe(expected);
    });
    test('skips holidays and excludes inactive sessions', async () => {
        disabled = [{ disabled_date: '2026-10-10' }, { disabled_date: '2026-10-17' }];
        const result = await dates().expect(200);
        expect(result.body.practices.find(p => p.session === 2).date).toBe('2026-10-24');
        rows[1].is_active = 0;
        settings.invalidateSessionSettingsCache();
        expect((await dates().expect(200)).body.practices.map(p => p.session)).toEqual([1]);
    });
    test('patient dates remain available with both compatible response keys', async () => {
        const result = await request(app).get('/api/sunday-appointments/sundays').set('Authorization', 'patient').expect(200);
        expect(result.body.dates).toEqual(result.body.sundays);
        expect(result.body.dates.map(d => d.date).slice(0, 2)).toEqual(['2026-10-10', '2026-10-11']);
    });
    test('settings read failure is an error instead of invented Sunday dates', async () => {
        db.query.mockImplementation(async sql => {
            if (sql.includes('FROM booking_settings')) throw new Error('Simulated settings failure');
            return [[]];
        });
        await dates().expect(500);
    });
    test('no active sessions returns an empty schedule', async () => {
        rows.forEach(row => { row.is_active = 0; });
        expect((await dates().expect(200)).body.practices).toEqual([]);
    });
});
