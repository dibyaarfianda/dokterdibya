/**
 * Integration tests for Patient API endpoints
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const patientsRouter = require('../../routes/v1/patients');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/v1', patientsRouter);

// Mock database and cache
jest.mock('../../utils/database');
jest.mock('../../utils/cache');
jest.mock('../../utils/logger');

const db = require('../../utils/database');
const cache = require('../../utils/cache');

describe('Patient API Integration Tests', () => {
    let authToken;

    beforeAll(() => {
        // Generate valid JWT token
        authToken = jwt.sign(
            { id: 1, username: 'testuser', role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
    });

    beforeEach(() => {
        jest.clearAllMocks();
        cache.get.mockReturnValue(null);
        cache.set.mockReturnValue(true);
        cache.delPattern.mockReturnValue(0);
    });

    describe('GET /api/v1/patients', () => {
        it('should return all patients', async () => {
            const mockPatients = [
                { id: 'P001', full_name: 'John Doe', age: 30 },
                { id: 'P002', full_name: 'Jane Smith', age: 25 }
            ];

            cache.getOrSet.mockResolvedValue(mockPatients);

            const response = await request(app)
                .get('/api/v1/patients')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should filter patients by search query', async () => {
            const mockPatients = [{ id: 'P001', full_name: 'John Doe' }];
            cache.getOrSet.mockResolvedValue(mockPatients);

            const response = await request(app)
                .get('/api/v1/patients?search=John')
                .expect(200);

            expect(response.body.success).toBe(true);
        });

        it('should limit number of results', async () => {
            const mockPatients = [{ id: 'P001', full_name: 'John Doe' }];
            cache.getOrSet.mockResolvedValue(mockPatients);

            const response = await request(app)
                .get('/api/v1/patients?limit=10')
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('GET /api/v1/patients/:id', () => {
        it('should return patient by ID', async () => {
            const mockPatient = { id: 'P001', full_name: 'John Doe', age: 30 };
            cache.getOrSet.mockResolvedValue(mockPatient);

            const response = await request(app)
                .get('/api/v1/patients/P001')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('id', 'P001');
        });

        it('should return 404 when patient not found', async () => {
            cache.getOrSet.mockImplementation(async (key, fn) => fn());
            db.findById.mockResolvedValue(null);

            const response = await request(app)
                .get('/api/v1/patients/INVALID')
                .expect(404);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/v1/patients', () => {
        it('should create new patient with valid token', async () => {
            const newPatient = {
                id: 'P003',
                full_name: 'New Patient',
                birth_date: '1990-01-01'
            };

            db.exists.mockResolvedValue(false);
            db.insert.mockResolvedValue({ insertId: 3 });

            const response = await request(app)
                .post('/api/v1/patients')
                .set('Authorization', `Bearer ${authToken}`)
                .send(newPatient)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('successfully');
        });

        it('should reject request without auth token', async () => {
            const newPatient = {
                id: 'P003',
                full_name: 'New Patient'
            };

            const response = await request(app)
                .post('/api/v1/patients')
                .send(newPatient)
                .expect(401);

            expect(response.body.success).toBe(false);
        });

        it('should reject invalid patient data', async () => {
            const invalidPatient = {
                id: 'P003'
                // Missing full_name
            };

            const response = await request(app)
                .post('/api/v1/patients')
                .set('Authorization', `Bearer ${authToken}`)
                .send(invalidPatient)
                .expect(400);

            expect(response.body.success).toBe(false);
        });

        it('should reject duplicate patient ID', async () => {
            const duplicatePatient = {
                id: 'P001',
                full_name: 'Duplicate'
            };

            db.exists.mockResolvedValue(true);

            const response = await request(app)
                .post('/api/v1/patients')
                .set('Authorization', `Bearer ${authToken}`)
                .send(duplicatePatient)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('already exists');
        });
    });

    describe('PUT /api/v1/patients/:id', () => {
        it('should update existing patient', async () => {
            const updateData = {
                full_name: 'Updated Name',
                birth_date: '1990-01-01'
            };

            db.updateById.mockResolvedValue(1);

            const response = await request(app)
                .put('/api/v1/patients/P001')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('updated');
        });

        it('should return 404 when updating non-existent patient', async () => {
            db.updateById.mockResolvedValue(0);

            const response = await request(app)
                .put('/api/v1/patients/INVALID')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ full_name: 'Test' })
                .expect(404);

            expect(response.body.success).toBe(false);
        });
    });

    describe('DELETE /api/v1/patients/:id', () => {
        it('should delete existing patient', async () => {
            db.deleteById.mockResolvedValue(1);

            const response = await request(app)
                .delete('/api/v1/patients/P001')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toContain('deleted');
        });

        it('should return 404 when deleting non-existent patient', async () => {
            db.deleteById.mockResolvedValue(0);

            const response = await request(app)
                .delete('/api/v1/patients/INVALID')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
        });

        it('should reject delete without auth token', async () => {
            const response = await request(app)
                .delete('/api/v1/patients/P001')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });
});
