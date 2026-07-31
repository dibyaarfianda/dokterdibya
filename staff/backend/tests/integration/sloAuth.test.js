const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => {
        if (req.get('Authorization') !== 'Bearer valid-staff-token') {
            return res.status(401).json({ success: false });
        }
        req.user = { id: 'staff-1' };
        return next();
    },
    requireSuperadmin: (req, res, next) => {
        if (req.get('X-Test-Role') !== 'dokter') {
            return res.status(403).json({ success: false });
        }
        return next();
    }
}));
jest.mock('../../middleware/metrics', () => ({
    getMetrics: () => ({
        errors: { byType: { server: 0 } },
        requests: { total: 10 },
        performance: { p95Ms: 10, p99Ms: 20 }
    })
}));
jest.mock('../../routes/rum', () => ({
    getRumSummary: () => ({}),
    getCacheStats: () => ({})
}));
jest.mock('../../middleware/dbMonitor', () => ({
    getDbStats: () => ({
        avgQueryMs: 5,
        totalQueries: 10,
        slowQueriesLast15m: 0
    })
}));
jest.mock('../../middleware/rateLimiter', () => ({
    getCoalesceStats: () => ({
        enabled: true,
        mapSize: 0,
        maxInflight: 100,
        failsafe: { tripped: false, triggerCount: 0 }
    })
}));
jest.mock('../../services/pdfQueue', () => ({
    getStats: () => ({ queued: 0, processing: 0, failed: 0 })
}));

const sloRoutes = require('../../routes/slo');

describe('SLO route authorization', () => {
    const app = express();
    app.use('/api/slo', sloRoutes);

    test('requires an authenticated superadmin', async () => {
        const anonymous = await request(app).get('/api/slo');
        const nonSuperadmin = await request(app)
            .get('/api/slo')
            .set('Authorization', 'Bearer valid-staff-token');
        const dokter = await request(app)
            .get('/api/slo')
            .set('Authorization', 'Bearer valid-staff-token')
            .set('X-Test-Role', 'dokter');

        expect(anonymous.status).toBe(401);
        expect(nonSuperadmin.status).toBe(403);
        expect(dokter.status).toBe(200);
        expect(dokter.body).toMatchObject({
            status: 'healthy',
            slos: {
                dbHealth: {
                    pass: true,
                    detail: { slowQueriesLast15m: 0 }
                }
            }
        });
    });
});
