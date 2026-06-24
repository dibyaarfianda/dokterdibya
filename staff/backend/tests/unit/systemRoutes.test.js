const express = require('express');
const request = require('supertest');

const createSystemRoutes = require('../../routes/system');

function createApp(overrides = {}) {
    const app = express();
    app.use(express.json());

    const dependencies = {
        pool: {
            query: jest.fn().mockResolvedValue([[{ ok: 1 }]])
        },
        getMetrics: jest.fn(() => ({ system: { memoryUsage: 42 } })),
        resetMetrics: jest.fn(),
        getRumSummary: jest.fn(() => ({ pageViews: 3 })),
        getCacheStats: jest.fn(() => ({ hits: 2 })),
        getCostSummary: jest.fn(() => ({ requests: 1 })),
        getDbStats: jest.fn(() => ({ activeConnections: 1 })),
        getCoalesceStats: jest.fn(() => ({ saved: 4 })),
        getPdfQueueStats: jest.fn(() => ({ pending: 0 })),
        getEnrichmentStats: jest.fn(() => ({ enriched: 5 })),
        getSocketStats: jest.fn(() => ({
            socketEventsEmitted: 6,
            activeSocketConnections: 7
        })),
        verifyToken: (req, res, next) => {
            req.user = { id: 1, role_id: 1 };
            next();
        },
        requireSuperadmin: (req, res, next) => next(),
        ...overrides
    };

    app.use(createSystemRoutes(dependencies));
    return { app, dependencies };
}

describe('system routes', () => {
    test('GET /api/metrics combines metrics from injected providers', async () => {
        const { app } = createApp();

        const response = await request(app).get('/api/metrics');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            system: { memoryUsage: 42 },
            rum: { pageViews: 3 },
            cache: { hits: 2 },
            db: { activeConnections: 1 },
            coalescing: { saved: 4 },
            pdfQueue: { pending: 0 },
            enrichment: { enriched: 5 },
            cost: {
                requests: 1,
                socketEventsEmitted: 6,
                activeSocketConnections: 7
            }
        });
    });

    test('POST /api/metrics/reset uses auth middleware and resets metrics', async () => {
        const callOrder = [];
        const { app, dependencies } = createApp({
            verifyToken: (req, res, next) => {
                callOrder.push('verifyToken');
                next();
            },
            requireSuperadmin: (req, res, next) => {
                callOrder.push('requireSuperadmin');
                next();
            }
        });

        const response = await request(app).post('/api/metrics/reset');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            success: true,
            message: 'Metrics reset successfully'
        });
        expect(callOrder).toEqual(['verifyToken', 'requireSuperadmin']);
        expect(dependencies.resetMetrics).toHaveBeenCalledTimes(1);
    });

    test('GET /api/health reports healthy database latency', async () => {
        const { app, dependencies } = createApp();

        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            status: 'healthy',
            database: { status: 'connected' },
            system: { memoryUsage: 42 }
        });
        expect(response.body.database.latencyMs).toEqual(expect.any(Number));
        expect(dependencies.pool.query).toHaveBeenCalledWith('SELECT 1');
    });
});
