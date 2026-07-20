'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => {
        const role = req.get('X-Test-Role');
        if (!req.get('Authorization')) return res.status(401).json({ success: false });
        req.user = { id: 'staff-1', role };
        return next();
    },
    requireDoctorRole: (req, res, next) => {
        if (req.user?.role !== 'dokter') return res.status(403).json({ success: false });
        return next();
    }
}));

jest.mock('../../services/SundayClinicClosingSchemaValidator', () => ({
    sundayClinicClosingSchemaGuard: (req, res, next) => next()
}));

jest.mock('../../services/sunday-clinic/closing', () => ({
    getClosingPreview: (req, res) => res.json({ success: true, data: { status: 'open' } }),
    postClosing: (req, res) => res.status(201).json({ success: true, data: { status: 'closed' } }),
    getClosings: (req, res) => res.json({ success: true, data: [] }),
    getClosingById: (req, res) => res.json({ success: true, data: { id: req.params.id } })
}));

const closingRoutes = require('../../routes/sunday-clinic/closing');

describe('Sunday Clinic closing route authorization', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/sunday-clinic', closingRoutes);
    app.get('/api/sunday-clinic/sibling-probe', (req, res) => res.json({ success: true }));

    test('rejects anonymous and every non-doctor staff role', async () => {
        expect((await request(app).get('/api/sunday-clinic/closing/preview')).status).toBe(401);

        for (const role of ['managerial', 'admin', 'front_office', 'bidan']) {
            const response = await request(app)
                .get('/api/sunday-clinic/closing/preview')
                .set('Authorization', 'Bearer test')
                .set('X-Test-Role', role);
            expect(response.status).toBe(403);
        }
    });

    test('allows a doctor and disables response caching', async () => {
        const response = await request(app)
            .get('/api/sunday-clinic/closing/preview?date=2026-07-19')
            .set('Authorization', 'Bearer test')
            .set('X-Test-Role', 'dokter');

        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toContain('no-store');
        expect(response.body).toMatchObject({ success: true, data: { status: 'open' } });
    });

    test('exposes close, history, and detail endpoints to a doctor', async () => {
        const headers = { Authorization: 'Bearer test', 'X-Test-Role': 'dokter' };
        expect((await request(app).post('/api/sunday-clinic/closing').set(headers).send({ date: '2026-07-19', fingerprint: 'x' })).status).toBe(201);
        expect((await request(app).get('/api/sunday-clinic/closings').set(headers)).status).toBe(200);
        expect((await request(app).get('/api/sunday-clinic/closings/9').set(headers)).status).toBe(200);
    });

    test('does not apply doctor-only closing middleware to sibling Sunday Clinic routes', async () => {
        const response = await request(app)
            .get('/api/sunday-clinic/sibling-probe')
            .set('Authorization', 'Bearer test')
            .set('X-Test-Role', 'managerial');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
    });
});
