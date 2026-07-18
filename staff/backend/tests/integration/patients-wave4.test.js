const express = require('express');
const request = require('supertest');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/cache', () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delPattern: jest.fn()
}));
jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => { req.user = { id: 1, role_id: 1 }; next(); },
    verifyPatientToken: (req, res, next) => next()
}));
jest.mock('../../services/r2Storage', () => ({}));
jest.mock('../../services/patientDeletion', () => ({ deletePatientWithRelations: jest.fn() }));
jest.mock('../../services/activityLogger', () => ({ log: jest.fn() }));
jest.mock('../../services/pushNotificationService', () => ({ getVapidPublicKey: jest.fn() }));
jest.mock('../../utils/patientAccessBlocklist', () => ({
    normalizePatientName: value => String(value || '').toLowerCase(),
    refreshConfiguredBlocklist: jest.fn(async () => ({ names: new Set() }))
}));

const db = require('../../db');
const cache = require('../../utils/cache');
const patientsRouter = require('../../routes/patients');

const app = express();
app.use(express.json());
app.use(patientsRouter);

describe('GET /api/patients wave 4 additive contract', () => {
    beforeEach(() => jest.clearAllMocks());

    test('legacy request keeps its cached response shape by default', async () => {
        const legacy = {
            success: true,
            data: [{ id: 'P1', full_name: 'Legacy', resume_status: 'sudah_simpan' }],
            count: 1
        };
        cache.get.mockReturnValueOnce(legacy);

        const response = await request(app).get('/api/patients').expect(200);

        expect(response.body).toEqual(legacy);
        expect(cache.get).toHaveBeenCalledWith(expect.stringContaining('patients:list:legacy:'), 'short');
        expect(db.query).not.toHaveBeenCalled();
    });

    test('view=basic returns the paginated minimum list in two queries', async () => {
        cache.get.mockReturnValueOnce(null);
        db.query
            .mockResolvedValueOnce([[{ total: 1 }]])
            .mockResolvedValueOnce([[
                { id: 'P1', full_name: 'Basic', phone: '0812', created_at: '2026-07-19 01:00:00' }
            ]]);

        const response = await request(app)
            .get('/api/patients?view=basic&limit=10&page=1')
            .expect(200);

        expect(response.body).toEqual(expect.objectContaining({
            success: true,
            count: 1,
            data: [expect.objectContaining({ id: 'P1', full_name: 'Basic', whatsapp: '0812' })],
            pagination: expect.objectContaining({ total: 1, limit: 10 })
        }));
        expect(db.query).toHaveBeenCalledTimes(2);
        expect(db.query.mock.calls[1][0]).not.toContain('medical_records');
    });

    test('fresh=1 explicitly bypasses cache', async () => {
        cache.get.mockReturnValueOnce({ success: true, data: [{ id: 'STALE' }], count: 1 });
        db.query
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        const response = await request(app)
            .get('/api/patients?view=basic&limit=10&fresh=1')
            .expect(200);

        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.del).toHaveBeenCalled();
        expect(response.headers['x-cache-status']).toBe('BYPASS');
        expect(response.body.data).toEqual([]);
    });
});
