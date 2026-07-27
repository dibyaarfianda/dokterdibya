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
        const recorded = response.body.data.clientErrors.find(item => item.fingerprint === 'test-fingerprint');
        expect(recorded).toMatchObject({ type: 'window_error', count: 1 });
        expect(recorded.message).toContain('[email]');
        expect(recorded.message).toContain('[record]');
        expect(recorded.message).toContain('[url]');
        expect(recorded.message).not.toContain('patient@example.com');
    });
});
