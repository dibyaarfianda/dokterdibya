const mockCache = { key: '2026-10-19', expiresAt: 0, settingsVersion: 1, payload: null };
const mockQuery = jest.fn();
jest.mock('../../services/sunday-clinic/shared', () => ({
    db: { query: mockQuery }, logger: { error: jest.fn() }, queueTodayCache: mockCache,
    getGmt7DayWindow: () => ({ dateStr: '2026-10-19', startDateTime: '2026-10-19 00:00:00', endDateTime: '2026-10-20 00:00:00' }),
    getSessionSettings: async () => [], getSessionLabel: () => 'Pagi', getSlotTime: () => '09:30'
}));
jest.mock('../../services/booking-session-settings', () => ({ getSessionSettingsVersion: () => 1 }));
jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => next(),
    verifyPatientToken: (req, res, next) => { req.user = { id: 'patient-1' }; next(); },
    verifyStaffToken: (req, res, next) => req.headers['x-test-staff'] ? next() : res.sendStatus(401),
    requirePermission: permission => (req, res, next) => req.headers['x-test-permission'] === permission ? next() : res.sendStatus(403)
}));
const express = require('express');
const request = require('supertest');
const app = express();
app.use('/api/sunday-clinic', require('../../routes/sunday-clinic/queue'));
const row = { patient_name: 'Ayu Rahasia', patient_phone: 'SECRET', chief_complaint: 'SECRET', mr_id: 'DRD9999',
    session: 1, session_label: 'Pagi', slot_number: 3, slot_time: '09:30', status: 'confirmed', queue_status: 'anamnesa' };
const preview = () => request(app).get('/api/sunday-clinic/queue/preview').set('x-test-staff', '1').set('x-test-permission', 'online_queue.view');
beforeEach(() => {
    mockCache.expiresAt = 0;
    mockCache.payload = null;
    mockQuery.mockReset().mockImplementation(async sql => sql.includes('WHERE patient_id = ?') ? [[{ id: 42 }]] : [[row]]);
});
test.each([false, true])('staff preview matches patient data on cache hit=%s and never returns clinical fields', async cached => {
    if (cached) { mockCache.expiresAt = Date.now() + 60000; mockCache.payload = { data: [row] }; }
    const staff = await preview().expect(200);
    const patient = await request(app).get('/api/sunday-clinic/queue/public').expect(200);
    expect(staff.body.data).toEqual(patient.body.data);
    expect(staff.body.data[0]).toEqual({ queue_position: 1, session: 1, session_label: 'Pagi', slot_number: 3,
        slot_time: '09:30', masked_name: 'A***', queue_status: 'anamnesa', appointment_date: '2026-10-19' });
    expect(staff.body.my_booking).toBeNull();
    expect(staff.headers['cache-control']).toContain('no-store');
    expect(JSON.stringify(staff.body)).not.toMatch(/Rahasia|SECRET|DRD9999/);
    expect(mockQuery.mock.calls.every(([sql]) => /^\s*SELECT/.test(sql))).toBe(true);
});
test('preview requires staff queue access and public endpoint still requires a same-day patient booking', async () => {
    await request(app).get('/api/sunday-clinic/queue/preview').expect(401);
    await request(app).get('/api/sunday-clinic/queue/preview').set('x-test-staff', '1').expect(403);
    mockQuery.mockResolvedValue([[]]);
    await request(app).get('/api/sunday-clinic/queue/public').expect(403);
    await preview().expect(200);
});
