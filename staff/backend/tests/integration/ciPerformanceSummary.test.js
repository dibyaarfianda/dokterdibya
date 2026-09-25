const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { generateKeyPairSync } = require('crypto');

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'ci-fixture', alg: 'RS256', use: 'sig' };
const { createGithubActionsVerifier } = require('../../services/githubActionsOidc');
const verifier = createGithubActionsVerifier({ loadJwks: async () => ({ keys: [jwk] }) });
const SENTINEL = 'PRIVATE_PATIENT_08123456789_SELECT_secret';

function ciToken() {
    return jwt.sign({
        repository: 'dibyaarfianda/dokterdibya', repository_id: '1092976768',
        repository_owner_id: '233383424', ref: 'refs/heads/main', ref_type: 'branch',
        workflow_ref: 'dibyaarfianda/dokterdibya/.github/workflows/staff-performance-budget.yml@refs/heads/main',
        event_name: 'workflow_dispatch', runner_environment: 'github-hosted'
    }, privateKey, {
        algorithm: 'RS256', keyid: 'ci-fixture', notBefore: -1, expiresIn: '5m',
        issuer: 'https://token.actions.githubusercontent.com', audience: 'dokterdibya-staff-performance',
        subject: 'repo:dibyaarfianda/dokterdibya:ref:refs/heads/main'
    });
}

function appWithFixtureData() {
    const { createCiPerformanceRouter } = require('../../routes/ci-performance');
    const app = express();
    const getMetrics = () => ({
        requests: { total: 200, recent: {
            windowSeconds: 300, windowStartedAtMs: 1700000000000,
            windowEndedAtMs: 1700000001000, total: 100, serverErrors: 1
        }, byStatusCode: { 500: 2 } },
        errors: { byType: { server: 2 }, topErrors: [{ message: SENTINEL }] },
        performance: {
            p95Ms: 57, p99Ms: 84,
            observation: { windowSeconds: 300, sampleCount: 120,
                windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000 },
            endpoints: {
                'GET /api/patients': { count: 27, sampleCount: 12, p95Ms: 30, maxMs: 40, windowSeconds: 300,
                    windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000 },
                'GET /api/dashboard-stats': { count: 21, sampleCount: 11, p95Ms: 18, windowSeconds: 300,
                    windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000 },
                'GET /api/notifications/count': { count: 20, sampleCount: 10, p95Ms: 9, windowSeconds: 300,
                    windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000 },
                [`GET /api/patients/${SENTINEL}`]: { count: 1, p95Ms: 1 }
            }
        },
        socketAuth: {
            windowSeconds: 300, windowStartedAtMs: 1700000000000,
            windowEndedAtMs: 1700000001000, attempts: 50, accepted: 49,
            rejected: 1, anonymousQuarantined: 2, expiredAfterConnect: 2,
            rejectedByCode: { AUTH_MISSING: 1, AUTH_INVALID: 0, AUTH_EXPIRED: 0, FORBIDDEN: 0,
                [SENTINEL]: 999 }, privateIdentity: SENTINEL
        },
        db: { recentSlowQueries: [{ sql: `SELECT '${SENTINEL}'` }] },
        system: { hostname: SENTINEL }
    });
    const getRumSummary = () => ({
        webVitals: {
            cachedActivation: { overall: { count: 12, p75: 340, p95: 510 }, byPage: {
                dashboard: { count: 8, p75: 310, p95: 450 },
                [SENTINEL]: { count: 4, p75: 500, p95: 600 }
            } },
            LCP: { overall: { count: 10, p75: 410, p95: 700 }, byPage: {} }
        },
        apiTimings: { [SENTINEL]: { count: 1, p95: 1 } },
        clientErrors: [{ message: SENTINEL }], cacheStats: { key: SENTINEL }
    });
    app.use('/api/ci', createCiPerformanceRouter({ verifier, getMetrics, getRumSummary }));
    return app;
}

test('CI route returns only allowlisted aggregate numbers and no clinical or infrastructure detail', async () => {
    const response = await request(appWithFixtureData()).get('/api/ci/performance-summary')
        .set('Authorization', `Bearer ${ciToken()}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
        success: true,
        data: {
            requests: { total: 100, serverErrors: 1, windowSeconds: 300,
                windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000 },
            latency: { p95Ms: 57, p99Ms: 84, sampleCount: 120, windowSeconds: 300,
                windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000 },
            api: {
                patients: { count: 12, p95Ms: 30, windowSeconds: 300,
                    windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000 },
                dashboardStats: { count: 11, p95Ms: 18, windowSeconds: 300,
                    windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000 },
                notificationsCount: { count: 10, p95Ms: 9, windowSeconds: 300,
                    windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000 }
            },
            socketAuth: { windowSeconds: 300, windowStartedAtMs: 1700000000000,
                windowEndedAtMs: 1700000001000, attempts: 50, accepted: 49, rejected: 1,
                anonymousQuarantined: 2,
                expiredAfterConnect: 2,
                rejectedByCode: { AUTH_MISSING: 1, AUTH_INVALID: 0, AUTH_EXPIRED: 0, FORBIDDEN: 0 } },
            rum: {
                cachedActivation: { count: 8, p75: 310, p95: 450 },
                LCP: { count: 10, p75: 410, p95: 700 }
            }
        }
    });
    expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
});

test('CI aggregate exposes only numeric five-minute HTTP and Socket auth windows', async () => {
    const response = await request(appWithFixtureData()).get('/api/ci/performance-summary')
        .set('Authorization', `Bearer ${ciToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.data.requests).toEqual({
        total: 100, serverErrors: 1, windowSeconds: 300,
        windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000
    });
    expect(response.body.data.latency).toEqual({
        p95Ms: 57, p99Ms: 84, sampleCount: 120, windowSeconds: 300,
        windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000
    });
    expect(response.body.data.api.notificationsCount).toEqual({
        count: 10, p95Ms: 9, windowSeconds: 300,
        windowStartedAtMs: 1700000000000, windowEndedAtMs: 1700000001000
    });
    expect(response.body.data.socketAuth).toEqual({
        windowSeconds: 300, windowStartedAtMs: 1700000000000,
        windowEndedAtMs: 1700000001000, attempts: 50, accepted: 49,
        rejected: 1, anonymousQuarantined: 2, expiredAfterConnect: 2,
        rejectedByCode: { AUTH_MISSING: 1, AUTH_INVALID: 0, AUTH_EXPIRED: 0, FORBIDDEN: 0 }
    });
    expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
});

test('CI endpoint rejects missing and application tokens; it has no mutation method', async () => {
    const app = appWithFixtureData();
    expect((await request(app).get('/api/ci/performance-summary')).status).toBe(401);
    const appJwt = jwt.sign({ id: 1, role_id: 1 }, process.env.JWT_SECRET || 'test-only-secret');
    expect((await request(app).get('/api/ci/performance-summary').set('Authorization', `Bearer ${appJwt}`)).status).toBe(401);
    expect((await request(app).post('/api/ci/performance-summary').set('Authorization', `Bearer ${ciToken()}`)).status).toBe(404);
});

test('CI OIDC bearer is not an application staff token on clinical GET or mutation routes', async () => {
    process.env.JWT_SECRET ||= 'test-only-secret';
    const { verifyToken } = require('../../middleware/auth');
    const app = express();
    app.get('/api/patients', verifyToken, (_req, res) => res.json({ patient: SENTINEL }));
    app.get('/api/dashboard-stats', verifyToken, (_req, res) => res.json({ patient: SENTINEL }));
    app.post('/api/medical-records/reset', verifyToken, (_req, res) => res.json({ patient: SENTINEL }));
    for (const [method, path] of [
        ['get', '/api/patients'], ['get', '/api/dashboard-stats'],
        ['post', '/api/medical-records/reset']
    ]) {
        const response = await request(app)[method](path).set('Authorization', `Bearer ${ciToken()}`);
        expect(response.status).toBe(401);
        expect(JSON.stringify(response.body)).not.toContain(SENTINEL);
    }
});

test('production-style mounted routes produce the exact aggregate metric keys', async () => {
    const { metricsMiddleware, getMetrics, resetMetrics } = require('../../middleware/metrics');
    resetMetrics();
    const app = express();
    const dashboard = express.Router();
    const notifications = express.Router();
    dashboard.get('/', (_req, res) => res.json({ success: true }));
    notifications.get('/count', (_req, res) => res.json({ count: 0 }));
    app.use(metricsMiddleware);
    app.use('/api/dashboard-stats', dashboard);
    app.use('/api/notifications', notifications);
    await request(app).get('/api/dashboard-stats').expect(200);
    await request(app).get('/api/notifications/count').expect(200);
    const endpoints = getMetrics().performance.endpoints;
    expect(endpoints['GET /api/dashboard-stats']?.count).toBe(1);
    expect(endpoints['GET /api/notifications/count']?.count).toBe(1);
});
