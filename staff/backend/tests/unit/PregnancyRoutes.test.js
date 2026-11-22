'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({ verifyStaffToken: (req, res, next) => next() }));

const { createPregnanciesRouter } = require('../../routes/pregnancies');
const { PregnancyEpisodeError } = require('../../services/PregnancyEpisodeService');
const { PatientReportError } = require('../../services/PatientPregnancyReportRules');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
const USER = { id: 'U1', role: 'bidan', role_id: 3, is_superadmin: false };

function staffAuth(req, res, next) {
    if (req.get('x-test-staff')) {
        req.user = USER;
        return next();
    }
    return res.status(401).json({ success: false, message: 'Missing authorization header' });
}

function makeService(overrides = {}) {
    return {
        list: jest.fn().mockResolvedValue([]),
        listNeedsReview: jest.fn().mockResolvedValue([]),
        resolveFromVisit: jest.fn().mockResolvedValue({ action: 'none' }),
        startWithPreviousEnd: jest.fn().mockResolvedValue({ action: 'start' }),
        updateHistory: jest.fn().mockResolvedValue({ pregnancy: { id: 7 } }),
        addExternal: jest.fn().mockResolvedValue({ pregnancy: { id: 8 } }),
        removeExternal: jest.fn().mockResolvedValue({ removed: true }),
        assertCanClose: jest.fn(),
        ...overrides
    };
}

function buildApp(service, reportService) {
    const app = express();
    app.use(express.json());
    app.use('/api/pregnancies', createPregnanciesRouter({ service, reportService, verifyStaffToken: staffAuth, logger }));
    return app;
}

const auth = req => req.set('x-test-staff', '1');
const deny = () => { throw new PregnancyEpisodeError(403, 'Hanya dokter atau bidan yang dapat menutup kehamilan'); };

describe('pregnancy routes', () => {
    beforeEach(() => jest.clearAllMocks());

    test.each([
        ['get', '/api/pregnancies/patient/P0001'],
        ['post', '/api/pregnancies/patient/P0001/resolve'],
        ['post', '/api/pregnancies/patient/P0001/start'],
        ['post', '/api/pregnancies/patient/P0001/external'],
        ['put', '/api/pregnancies/7'],
        ['delete', '/api/pregnancies/7?patient_id=P0001'],
        ['get', '/api/pregnancies/needs-review']
    ])('%s %s requires a staff session', async (method, url) => {
        const res = await request(buildApp(makeService()))[method](url);
        expect(res.status).toBe(401);
    });

    test('GET patient returns pregnancies, totals and riwayat_persalinan, never cached', async () => {
        const pregnancies = [
            { id: 3, status: 'ongoing', outcome: null, latest_mr_id: 'DRD3' },
            { id: 2, status: 'ended', outcome: 'lahir_hidup', ended_on: '2024-03-01', ga_weeks_at_end: 39, delivery_method: 'Spt B (Spontan)', latest_mr_id: 'DRD2' },
            { id: 1, status: 'ended', outcome: 'abortus', ended_on: '2022-01-01', ga_weeks_at_end: 8, latest_mr_id: null }
        ];
        const service = makeService({ list: jest.fn().mockResolvedValue(pregnancies) });
        const res = await auth(request(buildApp(service)).get('/api/pregnancies/patient/P0001'));
        expect(res.status).toBe(200);
        expect(service.list).toHaveBeenCalledWith('P0001');
        expect(res.body.success).toBe(true);
        expect(res.body.data.pregnancies).toHaveLength(3);
        expect(res.body.data.pregnancies[0].latest_mr_id).toBe('DRD3');
        expect(res.body.data.totals).toEqual(expect.objectContaining({ gravida: 3, para: 1, abortus: 1 }));
        expect(Array.isArray(res.body.data.riwayat_persalinan)).toBe(true);
        expect(res.headers['cache-control']).toMatch(/no-store/);
    });

    test('resolve passes patient, mr_id and the actor', async () => {
        const service = makeService({ resolveFromVisit: jest.fn().mockResolvedValue({ action: 'start', pregnancy: { id: 9 } }) });
        const res = await auth(request(buildApp(service)).post('/api/pregnancies/patient/P0001/resolve')).send({ mr_id: 'DRD5' });
        expect(res.status).toBe(200);
        expect(service.resolveFromVisit).toHaveBeenCalledWith('P0001', 'DRD5', USER);
        expect(res.body).toEqual({ success: true, data: { action: 'start', pregnancy: { id: 9 } } });
        expect(service.assertCanClose).not.toHaveBeenCalled();
    });

    test('resolve rejects a missing mr_id', async () => {
        const service = makeService();
        const res = await auth(request(buildApp(service)).post('/api/pregnancies/patient/P0001/resolve')).send({});
        expect(res.status).toBe(400);
        expect(service.resolveFromVisit).not.toHaveBeenCalled();
    });

    test('start checks assertCanClose first, then starts with the previous end', async () => {
        const order = [];
        const service = makeService({
            assertCanClose: jest.fn(() => order.push('assert')),
            startWithPreviousEnd: jest.fn(async () => { order.push('start'); return { action: 'start', pregnancy: { id: 10 }, warning: 'hati-hati' }; })
        });
        const previous_end = { outcome: 'lahir_hidup', ended_on: '2026-01-01' };
        const res = await auth(request(buildApp(service)).post('/api/pregnancies/patient/P0001/start')).send({ mr_id: 'DRD5', previous_end });
        expect(res.status).toBe(200);
        expect(order).toEqual(['assert', 'start']);
        expect(service.assertCanClose).toHaveBeenCalledWith(USER);
        expect(service.startWithPreviousEnd).toHaveBeenCalledWith('P0001', 'DRD5', previous_end, USER);
        expect(res.body.warning).toBe('hati-hati');
        expect(res.body.data.pregnancy.id).toBe(10);
    });

    test('start is refused with 403 when the actor may not close', async () => {
        const service = makeService({ assertCanClose: jest.fn(deny) });
        const res = await auth(request(buildApp(service)).post('/api/pregnancies/patient/P0001/start')).send({ mr_id: 'DRD5', previous_end: {} });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ success: false, message: 'Hanya dokter atau bidan yang dapat menutup kehamilan' });
        expect(service.startWithPreviousEnd).not.toHaveBeenCalled();
    });

    test('PUT with end fields needs assertCanClose; patient_id from the body goes to the service', async () => {
        const service = makeService();
        const res = await auth(request(buildApp(service)).put('/api/pregnancies/7')).send({ patient_id: 'P0001', outcome: 'abortus', ended_on: '2025-01-01' });
        expect(res.status).toBe(200);
        expect(service.assertCanClose).toHaveBeenCalledWith(USER);
        expect(service.updateHistory).toHaveBeenCalledWith('P0001', 7, { outcome: 'abortus', ended_on: '2025-01-01' }, USER);
        expect(res.body).toEqual({ success: true, data: { pregnancy: { id: 7 } } });
    });

    test('PUT with only non-end fields skips assertCanClose', async () => {
        const service = makeService();
        const res = await auth(request(buildApp(service)).put('/api/pregnancies/7')).send({ patient_id: 'P0001', year: 2020 });
        expect(res.status).toBe(200);
        expect(service.assertCanClose).not.toHaveBeenCalled();
        expect(service.updateHistory).toHaveBeenCalledWith('P0001', 7, { year: 2020 }, USER);
    });

    test('PUT end-field change is refused for a non-closer; patient_id and id are required', async () => {
        const denied = makeService({ assertCanClose: jest.fn(deny) });
        let res = await auth(request(buildApp(denied)).put('/api/pregnancies/7')).send({ patient_id: 'P0001', babies: [] });
        expect(res.status).toBe(403);
        expect(denied.updateHistory).not.toHaveBeenCalled();

        const service = makeService();
        res = await auth(request(buildApp(service)).put('/api/pregnancies/7')).send({ year: 2020 });
        expect(res.status).toBe(400);
        res = await auth(request(buildApp(service)).put('/api/pregnancies/abc')).send({ patient_id: 'P0001' });
        expect(res.status).toBe(400);
        expect(service.updateHistory).not.toHaveBeenCalled();
    });

    test('POST external adds history, asserting close rights when end fields are present', async () => {
        const service = makeService();
        const body = { outcome: 'lahir_hidup', year: 2018, delivery_method: 'Spt B (Spontan)' };
        const res = await auth(request(buildApp(service)).post('/api/pregnancies/patient/P0001/external')).send(body);
        expect(res.status).toBe(201);
        expect(service.assertCanClose).toHaveBeenCalledWith(USER);
        expect(service.addExternal).toHaveBeenCalledWith('P0001', body, USER);
        expect(res.body).toEqual({ success: true, data: { pregnancy: { id: 8 } } });
    });

    test('POST external with no end fields skips assertCanClose', async () => {
        const service = makeService();
        const res = await auth(request(buildApp(service)).post('/api/pregnancies/patient/P0001/external')).send({ year: 2018 });
        expect(res.status).toBe(201);
        expect(service.assertCanClose).not.toHaveBeenCalled();
    });

    test('DELETE takes patient_id from the query', async () => {
        const service = makeService();
        const res = await auth(request(buildApp(service)).delete('/api/pregnancies/7?patient_id=P0001'));
        expect(res.status).toBe(200);
        expect(service.removeExternal).toHaveBeenCalledWith('P0001', 7, USER);
        expect(res.body).toEqual({ success: true, data: { removed: true } });

        const bad = await auth(request(buildApp(service)).delete('/api/pregnancies/7'));
        expect(bad.status).toBe(400);
    });

    test('needs-review returns the list and is not shadowed by :patientId routes', async () => {
        const rows = [{ patient_id: 'P0001', full_name: 'Ibu A', pregnancy_id: 5, reason: 'Cara lahir belum diisi' }];
        const service = makeService({ listNeedsReview: jest.fn().mockResolvedValue(rows) });
        const res = await auth(request(buildApp(service)).get('/api/pregnancies/needs-review'));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, data: rows });
        expect(service.list).not.toHaveBeenCalled();
    });

    test('PregnancyEpisodeError status passes through, unknown errors become a generic 500', async () => {
        const known = makeService({ list: jest.fn().mockRejectedValue(new PregnancyEpisodeError(404, 'Kehamilan tidak ditemukan')) });
        let res = await auth(request(buildApp(known)).get('/api/pregnancies/patient/P0001'));
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ success: false, message: 'Kehamilan tidak ditemukan' });

        const unknown = makeService({ list: jest.fn().mockRejectedValue(new Error('ER_SECRET table dump')) });
        res = await auth(request(buildApp(unknown)).get('/api/pregnancies/patient/P0001'));
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ success: false, message: 'Gagal memproses data kehamilan' });
        expect(JSON.stringify(res.body)).not.toMatch(/ER_SECRET/);
        expect(logger.error).toHaveBeenCalled();
    });

    describe('reopen a patient-reported pregnancy', () => {
        const URL = '/api/pregnancies/patient/P0001/7/reopen';

        test('requires a staff session', async () => {
            const res = await request(buildApp(makeService(), { reopen: jest.fn() })).post(URL);
            expect(res.status).toBe(401);
        });

        test('200 passes patient, pregnancy and actor to the service, never cached', async () => {
            const report = { reopen: jest.fn().mockResolvedValue({ pregnancy_id: 7 }) };
            const res = await auth(request(buildApp(makeService(), report)).post(URL));
            expect(res.status).toBe(200);
            expect(report.reopen).toHaveBeenCalledWith('P0001', 7, USER);
            expect(res.body).toEqual({ success: true, data: { pregnancy_id: 7 } });
            expect(res.headers['cache-control']).toMatch(/no-store/);
        });

        test('403 from the role check keeps its message', async () => {
            const report = { reopen: jest.fn().mockRejectedValue(new PregnancyEpisodeError(403, 'Hanya dokter atau bidan yang dapat menutup kehamilan')) };
            const res = await auth(request(buildApp(makeService(), report)).post(URL));
            expect(res.status).toBe(403);
            expect(res.body).toEqual({ success: false, message: 'Hanya dokter atau bidan yang dapat menutup kehamilan' });
        });

        test.each([[404, 'Kehamilan tidak ditemukan'], [409, 'Kehamilan lain sedang berjalan']])('%i from the report service passes through', async (status, message) => {
            const report = { reopen: jest.fn().mockRejectedValue(new PatientReportError(status, message)) };
            const res = await auth(request(buildApp(makeService(), report)).post(URL));
            expect(res.status).toBe(status);
            expect(res.body).toEqual({ success: false, message });
        });

        test('unknown errors become a generic 500 and bad ids a 400', async () => {
            const report = { reopen: jest.fn().mockRejectedValue(new Error('ER_SECRET')) };
            let res = await auth(request(buildApp(makeService(), report)).post(URL));
            expect(res.status).toBe(500);
            expect(JSON.stringify(res.body)).not.toMatch(/ER_SECRET/);
            res = await auth(request(buildApp(makeService(), report)).post('/api/pregnancies/patient/P0001/abc/reopen'));
            expect(res.status).toBe(400);
            expect(report.reopen).toHaveBeenCalledTimes(1);
        });
    });
});
