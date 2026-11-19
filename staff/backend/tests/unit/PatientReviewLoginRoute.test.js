'use strict';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { createPatientReviewLoginRouter } = require('../../routes/patient-review-login');

const SECRET = 'synthetic-test-secret';
const PATIENT = {
    id: 'P2026001', full_name: 'AKUN UJI DUITKU', email: 'uji@example.com', phone: '081234567890',
    birth_date: new Date(1995, 4, 10), photo_url: null, home_photo_url: null, google_id: null,
    status: 'active', profile_completed: 1, intake_completed: 1
};

function buildApp(service, { limiter } = {}) {
    const app = express();
    app.use(express.json());
    const activityLogger = { EVENTS: { LOGIN: 'login' }, logActivity: jest.fn() };
    const options = { service, jwtSecret: SECRET, expiresIn: '24h', activityLogger, logger: { warn: jest.fn(), error: jest.fn() } };
    if (limiter) options.limiter = limiter;
    app.use('/api/patients/review-login', createPatientReviewLoginRouter(options));
    return { app, activityLogger };
}

function serviceReturning(result) {
    return { authenticate: jest.fn().mockResolvedValue(result), recordLogin: jest.fn().mockResolvedValue() };
}

describe('review account login', () => {
    test('issues the same token and response shape as the Google login', async () => {
        const service = serviceReturning({ status: 'ok', patient: PATIENT });
        const { app, activityLogger } = buildApp(service);
        const res = await request(app).post('/api/patients/review-login').send({ email: 'uji@example.com', password: 'secret' });

        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        const payload = jwt.verify(res.body.token, SECRET);
        expect(Object.keys(payload).sort()).toEqual(['email', 'exp', 'fullname', 'full_name', 'iat', 'id', 'medicalRecordId', 'role'].sort());
        expect(payload).toMatchObject({ id: PATIENT.id, medicalRecordId: PATIENT.id, role: 'patient', full_name: PATIENT.full_name, fullname: PATIENT.full_name });
        expect(payload.exp - payload.iat).toBe(86400);

        expect(Object.keys(res.body).sort()).toEqual(['intake_completed', 'message', 'needs_profile_completion', 'success', 'token', 'user'].sort());
        expect(Object.keys(res.body.user).sort()).toEqual([
            'birth_date', 'email', 'email_verified', 'full_name', 'fullname', 'google_id', 'home_photo_url', 'id',
            'intake_completed', 'medicalRecordId', 'phone', 'photo_url', 'profile_completed', 'role'
        ].sort());
        expect(res.body.user.birth_date).toBe('1995-05-10');
        expect(res.body).toMatchObject({ intake_completed: true, needs_profile_completion: false });
        expect(service.recordLogin).toHaveBeenCalledWith(PATIENT.id);
        expect(activityLogger.logActivity).toHaveBeenCalledWith(PATIENT.id, 'login', null, expect.anything());
    });

    test.each([
        ['missing body', undefined],
        ['missing password', { email: 'uji@example.com' }],
        ['non string password', { email: 'uji@example.com', password: ['x'] }],
        ['an overlong email', { email: `${'a'.repeat(250)}@x.id`, password: 'x' }]
    ])('rejects %s with 400 before checking anything', async (_name, body) => {
        const service = serviceReturning({ status: 'ok', patient: PATIENT });
        const res = await request(buildApp(service).app).post('/api/patients/review-login').send(body);
        expect(res.status).toBe(400);
        expect(service.authenticate).not.toHaveBeenCalled();
    });

    test('a wrong password or unknown email gets one generic 401', async () => {
        const res = await request(buildApp(serviceReturning({ status: 'invalid' })).app)
            .post('/api/patients/review-login').send({ email: 'x@example.com', password: 'nope' });
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ success: false, code: 'INVALID_CREDENTIALS' });
        expect(res.body).not.toHaveProperty('token');
    });

    test.each([
        ['expired', 'REVIEW_ACCOUNT_EXPIRED'],
        ['revoked', 'REVIEW_ACCOUNT_DISABLED'],
        ['inactive', 'REVIEW_ACCOUNT_DISABLED']
    ])('a %s account gets 403 %s and no token', async (status, code) => {
        const res = await request(buildApp(serviceReturning({ status })).app)
            .post('/api/patients/review-login').send({ email: 'uji@example.com', password: 'secret' });
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ success: false, code });
        expect(res.body).not.toHaveProperty('token');
    });

    test('the default limiter stops repeated failed attempts', async () => {
        const service = serviceReturning({ status: 'invalid' });
        const { app } = buildApp(service);
        let last;
        for (let i = 0; i < 11; i += 1) {
            last = await request(app).post('/api/patients/review-login').send({ email: 'x@example.com', password: `try-${i}` });
        }
        expect(last.status).toBe(429);
        expect(last.body).toMatchObject({ code: 'REVIEW_LOGIN_RATE_LIMITED' });
        expect(service.authenticate).toHaveBeenCalledTimes(10);
    });

    test('hides unexpected errors', async () => {
        const service = { authenticate: jest.fn().mockRejectedValue(new Error("Unknown column 'x'")), recordLogin: jest.fn() };
        const res = await request(buildApp(service).app).post('/api/patients/review-login').send({ email: 'uji@example.com', password: 'secret' });
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/column/);
    });
});
