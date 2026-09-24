const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => {
        if (req.get('Authorization') !== 'Bearer valid-staff-token') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        req.user = { id: 'staff-1' };
        return next();
    },
    requireSuperadmin: (req, res, next) => {
        if (req.get('X-Test-Role') !== 'dokter') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        return next();
    }
}));

const rumRoutes = require('../../routes/rum');

describe('observability authorization integration', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/rum', rumRoutes);

    test('RUM ingestion remains available without staff authentication', async () => {
        const response = await request(app)
            .post('/api/rum')
            .send({
                page: 'dashboard',
                metrics: { LCP: 120 },
                errors: [{
                    type: 'window_error',
                    fingerprint: 'test-fingerprint',
                    message: 'Gagal untuk patient@example.com DRD1048 di https://example.com/private?id=123456'
                }]
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.accepted).toBe(2);
    });

    test('RUM ingestion rejects unknown metric keys', async () => {
        const response = await request(app)
            .post('/api/rum')
            .send({ page: 'dashboard', metrics: { attackerControlledMetric: 1 } });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            success: false,
            code: 'RUM_UNKNOWN_METRIC'
        });
    });

    test('live lowercase vitals and cached activation are accepted and summarized canonically', async () => {
        const sentinel = 'PRIVATE_PATIENT_SENTINEL';
        const ingested = await request(app).post('/api/rum').send({
            page: 'dashboard',
            metrics: { lcp: 123, inp: 44, cls: 0.02, cachedActivation: 850 },
            apiCalls: [{ endpoint: `/api/patients?search=${sentinel}`, duration: 12, status: 200 }]
        });
        expect(ingested.status).toBe(200);
        expect(ingested.body.accepted).toBe(5);
        const summary = await request(app).get('/api/rum/summary')
            .set('Authorization', 'Bearer valid-staff-token').set('X-Test-Role', 'dokter');
        expect(summary.body.data.webVitals).toMatchObject({
            LCP: { overall: { p95: 123 } },
            INP: { overall: { p95: 44 } },
            CLS: { overall: { p95: 0.02 } },
            cachedActivation: { overall: { p95: 850 } }
        });
        expect(JSON.stringify(summary.body)).not.toContain(sentinel);
    });

    test('RUM endpoint path buckets cannot retain patient identifiers in path segments', async () => {
        const sentinel = 'PRIVATE_PATIENT_SENTINEL';
        const ingested = await request(app).post('/api/rum').send({
            page: 'dashboard',
            apiCalls: [{ endpoint: `/api/patients/${sentinel}/documents`, duration: 10, status: 200 }]
        });
        expect(ingested.status).toBe(200);
        const summary = await request(app).get('/api/rum/summary')
            .set('Authorization', 'Bearer valid-staff-token').set('X-Test-Role', 'dokter');
        expect(JSON.stringify(summary.body)).not.toContain(sentinel);
    });

    test('RUM unknown first API segment is redacted while known route families remain distinct', async () => {
        const sentinel = 'privatepatient123';
        const response = await request(app).post('/api/rum').send({
            page: 'dashboard', apiCalls: [
                { endpoint: `/api/${sentinel}/detail`, duration: 11, status: 200 },
                { endpoint: '/api/patients', duration: 12, status: 200 },
                { endpoint: '/api/notifications', duration: 13, status: 200 }
            ]
        });
        expect(response.status).toBe(200);
        const summary = await request(app).get('/api/rum/summary')
            .set('Authorization', 'Bearer valid-staff-token').set('X-Test-Role', 'dokter');
        const api = summary.body.data.apiTimings;
        expect(JSON.stringify(api)).not.toContain(sentinel);
        expect(Object.keys(api)).toEqual(expect.arrayContaining(['/other', '/api/patients', '/api/notifications']));
    });

    test('RUM stores only allowlisted page keys and coarse errors, never free clinical text', async () => {
        const sentinel = 'Synthetic Patient Name';
        const ingested = await request(app).post('/api/rum').send({
            page: sentinel,
            metrics: { LCP: 456 },
            errors: [{ type: 'window_error', fingerprint: 'SyntheticPatientName',
                message: `Unable to save ${sentinel} DRD778899 with email synthetic@example.test and clinical prose` }]
        });
        expect(ingested.status).toBe(200);
        expect(ingested.body.accepted).toBe(2);
        await request(app).post('/api/rum').send({ page: 'dashboard', metrics: { LCP: 123 } });
        const summary = await request(app).get('/api/rum/summary')
            .set('Authorization', 'Bearer valid-staff-token').set('X-Test-Role', 'dokter');
        const serialized = JSON.stringify(summary.body);
        for (const privateText of [sentinel, 'SyntheticPatientName', 'DRD778899', 'synthetic@example.test', 'clinical prose']) {
            expect(serialized).not.toContain(privateText);
        }
        expect(summary.body.data.webVitals.LCP.byPage.other).toMatchObject({ p95: 456 });
        expect(summary.body.data.webVitals.LCP.byPage.dashboard).toBeTruthy();
        expect(summary.body.data.clientErrors.find(item => item.type === 'window_error')).toMatchObject({
            fingerprint: 'window_error', message: 'Client error'
        });
    });

    test('RUM summary rejects anonymous and non-superadmin requests', async () => {
        const anonymous = await request(app).get('/api/rum/summary');
        const staff = await request(app)
            .get('/api/rum/summary')
            .set('Authorization', 'Bearer valid-staff-token');

        expect(anonymous.status).toBe(401);
        expect(staff.status).toBe(403);
    });

    test('RUM summary is available to an authenticated dokter', async () => {
        const response = await request(app)
            .get('/api/rum/summary')
            .set('Authorization', 'Bearer valid-staff-token')
            .set('X-Test-Role', 'dokter');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ success: true });
        const recorded = response.body.data.clientErrors.find(item => item.fingerprint === 'window_error');
        expect(recorded).toMatchObject({ type: 'window_error', message: 'Client error' });
        expect(recorded.count).toBeGreaterThanOrEqual(1);
        expect(JSON.stringify(response.body)).not.toContain('patient@example.com');
    });
});
