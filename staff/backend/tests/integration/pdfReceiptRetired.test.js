const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => {
        if (req.get('Authorization') !== 'Bearer valid-test-token') {
            return res.status(401).json({ success: false });
        }
        return next();
    }
}));

jest.mock('../../utils/pdf', () => ({}));
jest.mock('../../services/PatientService', () => ({}));
jest.mock('../../services/VisitService', () => ({}));

const pdfRoutes = require('../../routes/pdf');

describe('retired receipt endpoint', () => {
    const app = express();
    app.use('/api/pdf', pdfRoutes);

    test('requires authentication', async () => {
        await request(app)
            .get('/api/pdf/receipt/visit-1')
            .expect(401);
    });

    test('returns an explicit authenticated retirement response', async () => {
        const response = await request(app)
            .get('/api/pdf/receipt/visit-1')
            .set('Authorization', 'Bearer valid-test-token')
            .expect(410);

        expect(response.body).toMatchObject({
            success: false,
            code: 'RECEIPT_ENDPOINT_RETIRED'
        });
    });
});
