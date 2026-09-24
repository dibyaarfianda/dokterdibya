'use strict';

const express = require('express');
const request = require('supertest');
const mockDb = { query: jest.fn(async () => [[]]) };
const mockRecords = {
    saveInternalSections: jest.fn(), patch: jest.fn(),
    MedicalRecordError: class MedicalRecordError extends Error {}
};
jest.mock('../../db', () => mockDb);
jest.mock('../../middleware/auth', () => ({ verifyToken: (req, _res, next) => {
    req.user = { id: 4, name: 'Synthetic Staff' }; next();
} }));
jest.mock('../../services/MedicalRecordService', () => mockRecords);
jest.mock('../../services/SundayClinicClosingService', () => ({ acquireSundayClinicAccountingDateGuard: jest.fn() }));
jest.mock('../../services/openaiService', () => ({ OPENAI_API_KEY: '', OPENAI_API_URL: '' }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const app = express();
app.use(express.json());
app.use(require('../../routes/medical-import'));

beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockResolvedValue([[]]);
    mockRecords.patch.mockResolvedValue({ version: 4, data: { id: 17, mr_id: 'TEST001', patient_id: 'fixture-a' } });
});

test('existing imported section uses exact scoped RFC6901 PATCH with If-Match', async () => {
    const changes = [{ path: '/notes', before: 'old', after: '' }];
    const response = await request(app).post('/api/medical-import/save').set('If-Match', '"3"').send({
        patient_id: 'fixture-a', mr_id: 'TEST001', record_id: 17,
        category: 'obstetri', visit_location: 'rsia_melinda', changes
    });
    expect(response.status).toBe(200);
    expect(response.headers.etag).toBe('"4"');
    expect(mockRecords.patch).toHaveBeenCalledWith(expect.objectContaining({
        id: 17, mrId: 'TEST001', patientId: 'fixture-a', recordType: 'pemeriksaan_obstetri',
        ifMatch: '"3"', changes, actor: { id: 4, name: 'Synthetic Staff' }
    }));
    expect(mockRecords.saveInternalSections).not.toHaveBeenCalled();
});

test('invalid import category cannot enter create or update transaction', async () => {
    const response = await request(app).post('/api/medical-import/save').set('If-Match', '"3"').send({
        patient_id: 'fixture-a', mr_id: 'TEST001', record_id: 17,
        category: 'complete', visit_location: 'rsia_melinda', changes: []
    });
    expect(response.status).toBe(400);
    expect(mockRecords.patch).not.toHaveBeenCalled();
    expect(mockRecords.saveInternalSections).not.toHaveBeenCalled();
});
