'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({ verifyPatientToken: (req, res, next) => next() }));

const { createPatientPregnancyReportRouter } = require('../../routes/patient-pregnancy-report');
const { PatientReportError } = require('../../services/PatientPregnancyReportRules');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function patientAuth(req, res, next) {
    if (req.get('x-test-patient')) {
        req.patient = { id: req.get('x-test-patient') };
        return next();
    }
    return res.status(401).json({ success: false, message: 'Missing authorization header' });
}

function buildApp(service) {
    const app = express();
    app.use(express.json());
    app.use('/api/patient/pregnancy-report', createPatientPregnancyReportRouter({ service, verifyPatientToken: patientAuth, logger }));
    return app;
}

describe('patient pregnancy report routes', () => {
    beforeEach(() => jest.clearAllMocks());

    test.each([
        ['get', '/api/patient/pregnancy-report/status'],
        ['post', '/api/patient/pregnancy-report']
    ])('%s %s requires a patient session', async (method, url) => {
        const res = await request(buildApp({}))[method](url);
        expect(res.status).toBe(401);
    });

    test('status uses the session patient and is never cached', async () => {
        const service = { status: jest.fn().mockResolvedValue({ ask: true, hpht: '2026-02-01' }) };
        const res = await request(buildApp(service)).get('/api/patient/pregnancy-report/status?patient_id=P9999').set('x-test-patient', 'P0001');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, ask: true, hpht: '2026-02-01' });
        expect(service.status).toHaveBeenCalledWith('P0001');
        expect(res.headers['cache-control']).toMatch(/no-store/);
        expect(res.headers.pragma).toBe('no-cache');
        expect(res.headers.expires).toBe('0');
    });

    test('submit ignores a patient_id in the body, is never cached and answers neutrally', async () => {
        const service = { submit: jest.fn().mockResolvedValue({ closed: true }) };
        const res = await request(buildApp(service))
            .post('/api/patient/pregnancy-report')
            .set('x-test-patient', 'P0001')
            .send({ answer: 'keguguran', ended_on: '2026-10-01', patient_id: 'P9999' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, message: 'Terima kasih, data sudah tersimpan.' });
        expect(service.submit).toHaveBeenCalledWith('P0001', { answer: 'keguguran', ended_on: '2026-10-01' });
        expect(res.headers['cache-control']).toMatch(/no-store/);
        expect(res.headers.pragma).toBe('no-cache');
        expect(JSON.stringify(res.body)).not.toMatch(/abortus|keguguran|lahir_mati|ektopik|outcome/i);
    });

    test('snooze answer is a success too', async () => {
        const service = { submit: jest.fn().mockResolvedValue({ snoozed: true }) };
        const res = await request(buildApp(service)).post('/api/patient/pregnancy-report').set('x-test-patient', 'P0001').send({ answer: 'masih_hamil' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test.each([[400, 'Tanggal tidak valid'], [409, 'Data kehamilan sudah berubah. Muat ulang halaman.'], [404, 'Tidak ditemukan']])(
        'maps a PatientReportError %s to its status and message', async (status, message) => {
            const service = { submit: jest.fn().mockRejectedValue(new PatientReportError(status, message)) };
            const res = await request(buildApp(service)).post('/api/patient/pregnancy-report').set('x-test-patient', 'P0001').send({});
            expect(res.status).toBe(status);
            expect(res.body).toEqual({ success: false, message });
        });

    test('an unexpected error is a logged 500 without details', async () => {
        const service = { status: jest.fn().mockRejectedValue(new Error('secret sql detail')), submit: jest.fn().mockRejectedValue(new Error('boom')) };
        const app = buildApp(service);
        const a = await request(app).get('/api/patient/pregnancy-report/status').set('x-test-patient', 'P0001');
        const b = await request(app).post('/api/patient/pregnancy-report').set('x-test-patient', 'P0001').send({});
        for (const res of [a, b]) {
            expect(res.status).toBe(500);
            expect(res.body).toEqual({ success: false, message: 'Gagal memproses data' });
        }
        expect(logger.error).toHaveBeenCalledTimes(2);
    });
});
