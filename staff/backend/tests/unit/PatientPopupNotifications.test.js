jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    verifyPatientToken: (req, res, next) => { req.patient = { patientId: 'owner-1' }; next(); }
}));
jest.mock('../../realtime-sync', () => ({ broadcastPatientNotification: jest.fn() }));
jest.mock('../../services/pushNotificationService', () => ({
    sendToPatient: jest.fn().mockResolvedValue({ success: true, sent: 1, failed: 0 })
}));

const express = require('express');
const request = require('supertest');
const db = require('../../db');
const notifications = require('../../routes/patient-notifications');

const app = express();
app.use(express.json());
app.use('/api/patient-notifications', notifications);

beforeEach(() => db.query.mockReset());

test('pending popup is selected only for the authenticated patient', async () => {
    db.query.mockResolvedValueOnce([[{ id: 42, title: 'Jadwal Berubah', message: 'Booking ulang', link: '/booking-klinik.html' }]]);
    const response = await request(app).get('/api/patient-notifications/popup-pending');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.notification.id).toBe(42);
    expect(db.query.mock.calls[0][0]).toContain('popup_dismissed_at IS NULL');
    expect(db.query.mock.calls[0][1]).toEqual(['owner-1']);
});

test('popup acknowledgement is scoped to the authenticated patient', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const response = await request(app).post('/api/patient-notifications/42/dismiss-popup');
    expect(response.body).toEqual({ success: true, dismissed: true });
    expect(db.query.mock.calls[0][1]).toEqual(['42', 'owner-1']);
});

test('special notification is stored with popup flag and patient push', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 43 }]);
    const result = await notifications.createPatientNotification({
        patient_id: 'owner-1', type: 'appointment', title: 'Jadwal Berubah',
        message: 'Silakan booking ulang', link: '/booking-klinik.html', popup_on_open: true
    });
    expect(result).toEqual({ success: true, id: 43 });
    expect(db.query.mock.calls[0][0]).toContain('popup_on_open');
    expect(db.query.mock.calls[0][1][0]).toBe('owner-1');
    expect(require('../../realtime-sync').broadcastPatientNotification).toHaveBeenCalledWith(
        expect.objectContaining({ id: 43, patient_id: 'owner-1' })
    );
    expect(require('../../services/pushNotificationService').sendToPatient).toHaveBeenCalledWith(
        'owner-1', 'Jadwal Berubah', 'Silakan booking ulang', expect.any(Object)
    );
});
