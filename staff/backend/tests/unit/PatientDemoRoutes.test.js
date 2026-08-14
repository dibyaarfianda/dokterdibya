process.env.JWT_SECRET = process.env.JWT_SECRET || 'patient-demo-test-secret';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../middleware/auth', () => ({
    JWT_SECRET: process.env.JWT_SECRET,
    verifyStaffToken: (req, res, next) => {
        const role = req.headers['x-test-role'];
        if (!role) return res.status(401).json({ success: false });
        if (role === 'patient') return res.status(403).json({ success: false });
        req.user = { id: 'staff-1', role_id: Number(role) };
        return next();
    },
    requireDoctorRole: (req, res, next) => req.user.role_id === 1
        ? next()
        : res.status(403).json({ success: false })
}));

jest.mock('../../services/PatientDemoService', () => ({
    createAccessCode: jest.fn(),
    exchangeCode: jest.fn(),
    getState: jest.fn(),
    getStatus: jest.fn(),
    resetState: jest.fn()
}));

const service = require('../../services/PatientDemoService');
const routes = require('../../routes/patient-demo');

function app() {
    const instance = express();
    instance.use(express.json());
    instance.use('/api/patient-demo', routes);
    instance.use((error, _req, res, _next) => res.status(500).json({ success: false, message: error.message }));
    return instance;
}

describe('patient demo routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        service.createAccessCode.mockResolvedValue({ id: 'session-1', code: 'abcdefghijklmnopqrstuvwxyz123456', expiresInSeconds: 120 });
        service.getState.mockResolvedValue({ profile: { id: 'DEMO-PATIENT', email: 'demo@example.invalid' } });
        service.getStatus.mockResolvedValue({ activeSessions: 0, schemaVersion: 'test' });
        service.resetState.mockResolvedValue({ schemaVersion: 'test' });
    });

    test.each([
        ['without token', undefined, 401],
        ['patient token', 'patient', 403],
        ['non-doctor staff', '24', 403]
    ])('session creation rejects %s', async (_label, role, expected) => {
        const call = request(app()).post('/api/patient-demo/sessions').send({});
        if (role) call.set('x-test-role', role);
        const response = await call;
        expect(response.status).toBe(expected);
        expect(service.createAccessCode).not.toHaveBeenCalled();
    });

    test('doctor receives a short-lived code URL without JWT', async () => {
        const response = await request(app())
            .post('/api/patient-demo/sessions')
            .set('x-test-role', '1')
            .send({});
        expect(response.status).toBe(201);
        const url = new URL(response.body.launchUrl);
        expect(url.origin).toBe('https://sisiwanita.id');
        expect(url.searchParams.get('code')).toBe('abcdefghijklmnopqrstuvwxyz123456');
        expect(url.searchParams.has('token')).toBe(false);
        expect(url.searchParams.has('jwt')).toBe(false);
        expect(response.body.expiresInSeconds).toBe(120);
    });

    test('expired or reused code is rejected', async () => {
        service.exchangeCode.mockResolvedValue(null);
        const response = await request(app())
            .post('/api/patient-demo/exchange')
            .send({ code: 'abcdefghijklmnopqrstuvwxyz123456' });
        expect(response.status).toBe(410);
        expect(response.body.code).toBe('DEMO_CODE_EXPIRED_OR_USED');
    });

    test('successful exchange returns a 60 minute demo JWT', async () => {
        service.exchangeCode.mockResolvedValue({ id: 'session-1', expiresInSeconds: 3600 });
        const response = await request(app())
            .post('/api/patient-demo/exchange')
            .send({ code: 'abcdefghijklmnopqrstuvwxyz123456' });
        expect(response.status).toBe(200);
        expect(response.body.expiresInSeconds).toBe(3600);
        const payload = jwt.verify(response.body.token, process.env.JWT_SECRET);
        expect(payload.demo_mode).toBe(true);
        expect(payload.demo_session_id).toBe('session-1');
        expect(payload.exp - payload.iat).toBe(3600);
    });
});
