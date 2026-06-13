process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../db', () => ({
    query: jest.fn()
}));

jest.mock('../../utils/cache', () => ({
    get: jest.fn(),
    set: jest.fn(),
    delPattern: jest.fn()
}));

const db = require('../../db');
const BookingSessionService = require('../../services/BookingSessionService');
const bookingSettingsRouter = require('../../routes/booking-settings');

const app = express();
app.use(express.json());
app.use('/api/booking-settings', bookingSettingsRouter);

function superadminToken() {
    return jwt.sign({
        id: 1,
        email: 'dokter@example.com',
        role_id: 1,
        is_superadmin: true
    }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('booking settings v2 admin routes', () => {
    const originalFlag = process.env.BOOKING_SESSION_V2_ENABLED;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.BOOKING_SESSION_V2_ENABLED = 'true';
        BookingSessionService.clearCache();
    });

    afterAll(() => {
        process.env.BOOKING_SESSION_V2_ENABLED = originalFlag;
        BookingSessionService.clearCache();
    });

    it('allows the same session number on different practice days', async () => {
        db.query
            .mockResolvedValueOnce([[{ exists: 1 }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 22 }]);

        await request(app)
            .post('/api/booking-settings')
            .set('Authorization', `Bearer ${superadminToken()}`)
            .send({
                session_number: 1,
                session_name: 'Sabtu Pagi',
                day_of_week: 6,
                start_time: '09:00',
                end_time: '11:00',
                slot_duration: 15,
                max_slots: 6,
                is_active: true
            })
            .expect(201);

        const duplicateCheck = db.query.mock.calls.find(([sql]) =>
            String(sql).includes('WHERE session_number = ? AND day_of_week = ?')
        );
        expect(duplicateCheck[1]).toEqual([1, 6]);

        const insertCall = db.query.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO booking_session_templates')
        );
        expect(insertCall[1]).toEqual([1, 'Sabtu Pagi', 6, '09:00:00', '11:00:00', 15, 6, 1]);
    });

    it('rejects a duplicate session number on the same practice day', async () => {
        db.query
            .mockResolvedValueOnce([[{ exists: 1 }]])
            .mockResolvedValueOnce([[{ id: 10 }]]);

        const response = await request(app)
            .post('/api/booking-settings')
            .set('Authorization', `Bearer ${superadminToken()}`)
            .send({
                session_number: 1,
                session_name: 'Minggu Pagi Duplicate',
                day_of_week: 0,
                start_time: '09:00',
                end_time: '11:00',
                slot_duration: 15,
                max_slots: 6,
                is_active: true
            })
            .expect(400);

        expect(response.body.message).toBe('Nomor sesi sudah ada untuk hari praktik ini');
        expect(db.query.mock.calls.some(([sql]) =>
            String(sql).includes('INSERT INTO booking_session_templates')
        )).toBe(false);
    });
});
