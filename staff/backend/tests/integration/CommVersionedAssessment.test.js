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
jest.mock('../../services/CommAssessmentResolver', () => ({
    resolve: jest.fn(), ResolutionError: class ResolutionError extends Error { constructor(statusCode, code) { super(code); this.statusCode = statusCode; this.code = code; } }
}));
const medicalRecordService = require('../../services/MedicalRecordService');
const resolver = require('../../services/CommAssessmentResolver');
const logger = require('../../utils/logger');
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

test('resolver is API-key protected, no-store and returns only canonical scope', async () => {
    resolver.resolve.mockResolvedValue({ patientId: 'P1', mrId: 'DRD123', anamnesa: null });
    const body = { facility: 'melinda', no_rm: 'HOSP-1', nik: '1234567890123456' };
    expect((await request(app).post('/assessments/resolve').send(body)).status).toBe(401);
    const response = await request(app).post('/assessments/resolve').set('X-API-Key', 'fixture-key').send(body);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toEqual({ patientId: 'P1', mrId: 'DRD123', anamnesa: null });
    expect(JSON.stringify(response.body)).not.toContain('HOSP-1');
});

test('resolver ambiguity returns identifier-free status and logs', async () => {
    resolver.resolve.mockRejectedValue(new resolver.ResolutionError(409, 'VISIT_AMBIGUOUS'));
    const response = await request(app).post('/assessments/resolve').set('X-API-Key', 'fixture-key')
        .send({ facility: 'melinda', no_rm: 'HOSP-1', nik: '1234567890123456' });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ success: false, code: 'VISIT_AMBIGUOUS' });
    expect(logger.error).not.toHaveBeenCalled();
});
