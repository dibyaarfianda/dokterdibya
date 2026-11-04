const fs = require('fs');
const path = require('path');

const connection = {
    beginTransaction: jest.fn(),
    query: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
};

jest.mock('../../db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));
jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => { req.user = { id: 'staff-1', name: 'Staff Satu' }; next(); },
    requirePermission: () => (req, res, next) => next(),
    requireSuperadminOrAccountPermission: () => (req, res, next) => next()
}));
jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn()
}));
jest.mock('../../routes/sunday-appointments', () => ({}));
jest.mock('../../services/booking-session-settings', () => ({
    invalidateSessionSettingsCache: jest.fn(),
    getSlotTimeFromBookingRow: jest.fn(() => '09:15')
}));
jest.mock('../../utils/cache', () => ({ delPattern: jest.fn(), del: jest.fn() }));

const express = require('express');
const request = require('supertest');
const db = require('../../db');
const { createPatientNotification } = require('../../routes/patient-notifications');

const app = express();
app.use(express.json());
app.use('/api/booking-settings', require('../../routes/booking-settings'));

beforeEach(() => {
    jest.clearAllMocks();
    db.getConnection.mockResolvedValue(connection);
});

test('cancel-date blocks the date, cancels active bookings and notifies each booked patient with a popup', async () => {
    connection.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[
            { id: 11, patient_id: 'p-1', session: 1, slot_number: 2 },
            { id: 12, patient_id: 'p-2', session: 1, slot_number: 3 }
        ]])
        .mockResolvedValueOnce([{ affectedRows: 2 }]);
    createPatientNotification.mockResolvedValue({ success: true, id: 1 });

    const response = await request(app)
        .post('/api/booking-settings/cancel-date')
        .send({ date: '2026-11-07', reason: 'Dokter ada keperluan mendadak' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, cancelled: 2, notified: 2, failed: 0 });

    const [insertSql, insertParams] = connection.query.mock.calls[0];
    expect(insertSql).toContain('INSERT IGNORE INTO disabled_practice_dates');
    expect(insertSql).toContain("'klinik_privat'");
    expect(insertParams).toEqual(['2026-11-07', 'Dokter ada keperluan mendadak', 'Staff Satu']);

    const [selectSql, selectParams] = connection.query.mock.calls[1];
    expect(selectSql).toContain("status NOT IN ('cancelled', 'no_show', 'completed')");
    expect(selectParams).toEqual(['2026-11-07']);

    const [updateSql, updateParams] = connection.query.mock.calls[2];
    expect(updateSql).toContain("status = 'cancelled'");
    expect(updateParams).toEqual(['Dokter ada keperluan mendadak', [11, 12]]);
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();

    expect(createPatientNotification).toHaveBeenCalledTimes(2);
    expect(createPatientNotification.mock.calls.map(c => c[0].patient_id)).toEqual(['p-1', 'p-2']);
    expect(createPatientNotification.mock.calls[0][0]).toMatchObject({
        popup_on_open: true,
        send_push: true,
        link: '/booking-klinik.html'
    });
});

test('cancel-date with no bookings still closes the date and notifies nobody', async () => {
    connection.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[]]);

    const response = await request(app)
        .post('/api/booking-settings/cancel-date')
        .send({ date: '2026-11-07', reason: 'Dokter ada keperluan mendadak' });

    expect(response.body).toMatchObject({ success: true, cancelled: 0, notified: 0 });
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(createPatientNotification).not.toHaveBeenCalled();
});

test('cancel-date rolls back and notifies nobody when the update fails', async () => {
    connection.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: 11, patient_id: 'p-1' }]])
        .mockRejectedValueOnce(new Error('db down'));

    const response = await request(app)
        .post('/api/booking-settings/cancel-date')
        .send({ date: '2026-11-07', reason: 'Dokter ada keperluan mendadak' });

    expect(response.status).toBe(500);
    expect(connection.rollback).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
    expect(createPatientNotification).not.toHaveBeenCalled();
});

test('cancel-date rejects a bad date or a short reason', async () => {
    const badDate = await request(app).post('/api/booking-settings/cancel-date').send({ date: '7/11/2026', reason: 'Dokter ada keperluan mendadak' });
    const shortReason = await request(app).post('/api/booking-settings/cancel-date').send({ date: '2026-11-07', reason: 'libur' });

    expect(badDate.status).toBe(400);
    expect(shortReason.status).toBe(400);
    expect(db.getConnection).not.toHaveBeenCalled();
});

test('confirmation popup, expiry and H-1 reminder skip closed klinik privat dates', () => {
    const scheduler = fs.readFileSync(path.join(__dirname, '../../services/appointmentScheduler.js'), 'utf8');
    const reminder = fs.readFileSync(path.join(__dirname, '../../services/appointmentReminder.js'), 'utf8');

    expect(scheduler).toContain('FROM disabled_practice_dates dpd');
    // popup sender + expiry job
    expect(scheduler.match(/AND \$\{NOT_DISABLED_PRACTICE_DATE_SQL\}/g)).toHaveLength(2);
    expect(reminder).toContain('FROM disabled_practice_dates dpd');
});
