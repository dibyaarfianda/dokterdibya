const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));

const db = require('../../db');
const billingsRouter = require('../../routes/billings');

const app = express();
app.use(express.json());
app.use('/api/billings', billingsRouter);

function tokenFor(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('patient billing endpoints', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects staff tokens on patient billing history', async () => {
        const staffToken = tokenFor({
            id: 'P001',
            email: 'staff@example.com',
            user_type: 'staff',
            role: 'admin'
        });

        await request(app)
            .get('/api/billings/my-billings')
            .set('Authorization', `Bearer ${staffToken}`)
            .expect(403);

        expect(db.query).not.toHaveBeenCalled();
    });

    it('returns only billings owned by the authenticated patient', async () => {
        const patientToken = tokenFor({
            id: 'P001',
            email: 'patient@example.com',
            user_type: 'patient',
            role: 'patient'
        });

        db.query.mockResolvedValueOnce([
            [{ id: 10, patient_id: 'P001', billing_number: 'INV-1' }]
        ]);

        const response = await request(app)
            .get('/api/billings/my-billings')
            .set('Authorization', `Bearer ${patientToken}`)
            .expect(200);

        expect(response.body).toMatchObject({
            success: true,
            count: 1
        });
        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('WHERE b.patient_id = ?'),
            ['P001']
        );
    });
});
