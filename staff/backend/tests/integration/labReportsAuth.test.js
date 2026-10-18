jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    verifyStaffToken(req, res, next) {
        if (!req.headers['x-test-user']) return res.status(401).json({ success: false });
        if (req.headers['x-test-user'] === 'patient') return res.status(403).json({ success: false });
        req.user = { id: 'STAFFTEST', user_type: 'staff' }; next();
    },
    requirePermission: permission => (req, res, next) => req.headers['x-test-grants']?.split(',').includes(permission) ? next() : res.status(403).json({ success: false })
}));
const express = require('express'); const request = require('supertest');
const { createLabRouter } = require('../../routes/lab-reports');
describe('staff laboratory API authorization and private file boundaries', () => {
    const service = { list: jest.fn(async () => []), save: jest.fn(async value => ({ id: 1, ...value, files: undefined })), publish: jest.fn(async () => ({ id: 1 })), pdf: jest.fn(async () => ({ buffer: Buffer.from('%PDF-test'), filename: 'Lab.pdf' })) };
    const app = express(); app.use(express.json()); app.use('/api/lab-reports', createLabRouter({ service }));
    beforeEach(() => jest.clearAllMocks());
    test('create-only grants cannot update by injecting an existing ID into POST', async () => {
        const response = await request(app).post('/api/lab-reports').set('x-test-user', 'staff').set('x-test-grants', 'lab_exam.create').send({ id: 99, version: 1, data: {} });
        expect(response.status).toBe(400); expect(service.save).not.toHaveBeenCalled();
    });
    test('rejects unauthenticated and patient calls', async () => {
        expect((await request(app).get('/api/lab-reports')).status).toBe(401);
        expect((await request(app).get('/api/lab-reports').set('x-test-user', 'patient').set('x-test-grants', 'lab_exam.view')).status).toBe(403);
    });
    test('grants listing separately from publishing and PDF export', async () => {
        expect((await request(app).get('/api/lab-reports').set('x-test-user', 'staff').set('x-test-grants', 'lab_exam.view')).status).toBe(200);
        expect((await request(app).post('/api/lab-reports/1/publish').set('x-test-user', 'staff').set('x-test-grants', 'lab_exam.view')).status).toBe(403);
        expect((await request(app).get('/api/lab-reports/1/pdf').set('x-test-user', 'staff').set('x-test-grants', 'lab_exam.view')).status).toBe(403);
        const response = await request(app).get('/api/lab-reports/1/pdf').set('x-test-user', 'staff').set('x-test-grants', 'medical_records.export');
        expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
    });
    test('rejects forged image MIME before reaching storage', async () => {
        const response = await request(app).post('/api/lab-reports').set('x-test-user', 'staff').set('x-test-grants', 'lab_exam.create')
            .field('payload', JSON.stringify({ patient_id: 'P001', mr_id: 'DRD001', data: {} })).attach('files', Buffer.from('not image'), { filename: 'result.png', contentType: 'image/png' });
        expect(response.status).toBe(400); expect(response.body.code).toBe('INVALID_FILE'); expect(service.save).not.toHaveBeenCalled();
    });
});
