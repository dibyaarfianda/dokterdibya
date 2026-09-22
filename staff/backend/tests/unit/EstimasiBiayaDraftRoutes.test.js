const express = require('express');
const request = require('supertest');
jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    verifyStaffToken: (req, res, next) => {
        const token = req.headers.authorization;
        if (!token) return res.status(401).end();
        if (token === 'patient') return res.status(403).end();
        req.testRole = token; next();
    },
    requirePermission: permission => (req, res, next) => {
        if (permission.endsWith('.edit') && req.testRole === 'viewer') return res.status(403).end();
        next();
    }
}));
const db = require('../../db');
const { DRAFT_KEY } = require('../../services/EstimasiBiayaDraft');
const app = express();
app.use(express.json());
app.use('/api/estimasi-biaya', require('../../routes/estimasi-biaya-draft'));
app.get('/api/estimasi-biaya/public', (req, res) => res.json({ legacy: true }));
describe('staff estimate draft routes', () => {
    beforeEach(() => db.query.mockReset());
    test('staff authentication and edit permission required', async () => {
        expect((await request(app).get('/api/estimasi-biaya/draft')).status).toBe(401);
        expect((await request(app).post('/api/estimasi-biaya/preview').set('Authorization', 'patient').send({})).status).toBe(403);
        expect((await request(app).put('/api/estimasi-biaya/draft').set('Authorization', 'viewer').send({})).status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });
    test('legacy public route remains unaffected', async () => {
        expect((await request(app).get('/api/estimasi-biaya/public')).body).toEqual({ legacy: true });
    });
    test('draft save/load uses separate settings key and no patient mutations', async () => {
        db.query.mockResolvedValueOnce([{}]);
        const saved = await request(app).put('/api/estimasi-biaya/draft').set('Authorization', 'editor').send({ aliases: { 7: 'Paket A' } });
        expect(saved.status).toBe(200);
        expect(db.query.mock.calls[0][1][0]).toBe(DRAFT_KEY);
        db.query.mockResolvedValueOnce([[{ setting_value: JSON.stringify(saved.body.draft) }]]);
        const loaded = await request(app).get('/api/estimasi-biaya/draft').set('Authorization', 'viewer');
        expect(loaded.body.draft.aliases).toEqual({ 7: 'Paket A' });
        expect(loaded.headers['cache-control']).toContain('no-store');
        expect(db.query.mock.calls.every(([sql]) => !/billing|patients|stock/i.test(sql))).toBe(true);
    });
    test('database failure is generic and does not expose internal drug names', async () => {
        db.query.mockRejectedValueOnce(new Error('SECRET DRUG'));
        const result = await request(app).get('/api/estimasi-biaya/draft').set('Authorization', 'viewer');
        expect(result.status).toBe(500); expect(JSON.stringify(result.body)).not.toContain('SECRET');
    });
    test('empty preview makes no writes and reports incomplete totals', async () => {
        const result = await request(app).post('/api/estimasi-biaya/preview').set('Authorization', 'viewer').send({});
        expect(result.status).toBe(200); expect(result.body.preview.total).toBeNull();
        expect(db.query).not.toHaveBeenCalled();
    });
});
