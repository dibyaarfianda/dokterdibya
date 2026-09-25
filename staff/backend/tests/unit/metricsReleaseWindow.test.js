const express = require('express');
const request = require('supertest');

const previous = Object.fromEntries([
    'METRICS_SAMPLE_RATE', 'METRICS_MAX_ENDPOINTS', 'METRICS_ENDPOINT_SAMPLES',
    'METRICS_GLOBAL_SAMPLES', 'ENABLE_METRICS_SUMMARY_LOG'
].map(key => [key, process.env[key]]));
Object.assign(process.env, {
    METRICS_SAMPLE_RATE: '0', METRICS_MAX_ENDPOINTS: '0',
    METRICS_ENDPOINT_SAMPLES: '1', METRICS_GLOBAL_SAMPLES: '200',
    ENABLE_METRICS_SUMMARY_LOG: 'false'
});
const { metricsMiddleware, getMetrics, resetMetrics } = require('../../middleware/metrics');
for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
}

let clock = 1700000000000;
let nowSpy;
beforeEach(() => {
    clock = 1700000000000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    resetMetrics();
});
afterEach(() => nowSpy.mockRestore());

test('three fixed release-budget endpoints keep 5-minute samples despite general sampling and endpoint cap', async () => {
    const app = express();
    app.use(metricsMiddleware);
    for (const path of ['/api/patients', '/api/dashboard-stats', '/api/notifications/count', '/api/other']) {
        app.get(path, (_req, res) => res.json({ ok: true }));
    }
    for (let index = 0; index < 6; index++) {
        for (const path of ['/api/patients', '/api/dashboard-stats', '/api/notifications/count']) {
            await request(app).get(`${path}?_t=${index}`).expect(200);
        }
    }
    await request(app).get('/api/other').expect(200);
    const snapshot = getMetrics();
    expect(snapshot.performance.observation).toMatchObject({
        windowSeconds: 300, sampleCount: 0,
        windowStartedAtMs: null, windowEndedAtMs: null
    });
    for (const path of ['/api/patients', '/api/dashboard-stats', '/api/notifications/count']) {
        expect(snapshot.performance.endpoints[`GET ${path}`]).toMatchObject({
            count: 6, sampleCount: 6, windowStartedAtMs: clock, windowEndedAtMs: clock
        });
    }
    expect(snapshot.performance.endpoints['GET /api/other']).toBeUndefined();
    expect(snapshot.requests.recent).toMatchObject({
        windowSeconds: 300, total: 19, serverErrors: 0,
        windowStartedAtMs: clock, windowEndedAtMs: clock
    });

    clock += 301000;
    const stale = getMetrics();
    expect(stale.performance.observation.sampleCount).toBe(0);
    expect(stale.performance.observation.windowEndedAtMs).toBeNull();
    expect(stale.performance.endpoints['GET /api/patients'].sampleCount).toBe(0);
    expect(stale.requests.recent.total).toBe(0);
});

test('rolling HTTP error rate records 5xx rather than retaining old successes', async () => {
    const app = express();
    app.use(metricsMiddleware);
    app.get('/ok', (_req, res) => res.sendStatus(200));
    app.get('/failed', (_req, res) => res.sendStatus(503));
    await request(app).get('/ok').expect(200);
    clock += 301000;
    await request(app).get('/failed').expect(503);
    expect(getMetrics().requests.recent).toMatchObject({ total: 1, serverErrors: 1 });
});
