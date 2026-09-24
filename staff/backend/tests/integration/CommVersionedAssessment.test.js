'use strict';

const express = require('express');
const request = require('supertest');
jest.mock('../../db', () => ({ query: jest.fn().mockResolvedValue([{ insertId: 12 }]) }));
jest.mock('../../services/MedicalRecordService', () => ({
    create: jest.fn(), patch: jest.fn(), MedicalRecordError: class MedicalRecordError extends Error {}
}));
jest.mock('../../services/CommOperationSyncService', () => ({}));
jest.mock('../../services/CommScheduleIntentService', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const medicalRecordService = require('../../services/MedicalRecordService');
const app = express();
app.use(express.json());
app.use(require('../../routes/comm-integration'));

beforeEach(() => { process.env.COMM_API_KEY = 'fixture-key'; jest.clearAllMocks(); });
afterAll(() => { delete process.env.COMM_API_KEY; });

test('COMM sync envelope cannot create an unversioned complete legacy row', async () => {
    const response = await request(app).post('/assessments').set('X-API-Key', 'fixture-key')
        .send({ no_rm: 'external-only', patient_name: 'Synthetic', diagnosis: 'synthetic' });
    expect(response.status).toBe(428);
    expect(medicalRecordService.create).not.toHaveBeenCalled();
    expect(medicalRecordService.patch).not.toHaveBeenCalled();
});

test('COMM canonical create uses server integration actor and returns service version', async () => {
    medicalRecordService.create.mockResolvedValue({ version: 1, data: { id: 12, record_data: { finding: '' } } });
    const response = await request(app).post('/assessments').set('X-API-Key', 'fixture-key')
        .set('If-None-Match', '*').send({ patientId: 'fixture-a', mrId: 'TEST001',
            recordType: 'penunjang', data: { finding: '' }, doctorName: 'forged' });
    expect(response.status).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(medicalRecordService.create).toHaveBeenCalledWith(expect.objectContaining({
        patientId: 'fixture-a', mrId: 'TEST001', recordType: 'penunjang',
        actor: { id: 'comm-integration' }
    }));
});
