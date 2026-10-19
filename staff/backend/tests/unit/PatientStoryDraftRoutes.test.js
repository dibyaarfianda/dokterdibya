const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { ROLE_NAMES } = require('../../constants/roles');
const mockStorage = { read: jest.fn(), save: jest.fn(), remove: jest.fn(), submit: jest.fn() };
jest.mock('../../services/PatientStoryDraftService', () => ({ createService: () => mockStorage }));
jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../services/PatientDemoService', () => ({ assertActiveSession: jest.fn().mockResolvedValue(true), getState: jest.fn(), audit: jest.fn() }));
const demo = require('../../services/PatientDemoService');
const routes = require('../../routes/patient-stories');
function app() { const a = express(); a.use(express.json()); a.use(require('../../middleware/patientDemoGuard')); a.use('/api/patient-stories', routes); return a; }
const token = claims => jwt.sign(claims, process.env.JWT_SECRET);
const patient = token({ id: 'A', user_type: 'patient', role: 'patient' });
beforeEach(() => { jest.clearAllMocks(); mockStorage.read.mockResolvedValue({ version: 0, state: 'empty', content: null }); mockStorage.save.mockResolvedValue({ version: 1, state: 'active' }); demo.assertActiveSession.mockResolvedValue(true); });
test.each(['get', 'put', 'delete'])('anonymous %s is rejected before draft storage', async method => {
    const r = await request(app())[method]('/api/patient-stories/draft').send({}); expect(r.status).toBe(401); expect(mockStorage.read).not.toHaveBeenCalled(); expect(mockStorage.save).not.toHaveBeenCalled();
});
test('staff tokens cannot read private patient drafts', async () => {
    const r = await request(app()).get('/api/patient-stories/draft').auth(token({ id: 'staff', user_type: 'staff', role: ROLE_NAMES.ADMIN }), { type: 'bearer' });
    expect(r.status).toBe(403); expect(mockStorage.read).not.toHaveBeenCalled();
});
test('owner always comes from the authenticated patient, ignoring query/body owner claims', async () => {
    const r = await request(app()).put('/api/patient-stories/draft?patient_id=B').auth(patient, { type: 'bearer' }).send({ owner_key: 'patient:B' });
    expect(r.status).toBe(200); expect(r.headers['cache-control']).toContain('no-store'); expect(mockStorage.save).toHaveBeenCalledWith('patient:A', expect.anything());
});
test('dummy storage uses only the active demo session owner', async () => {
    const r = await request(app()).put('/api/patient-stories/draft').auth(token({ id: 'DEMO-PATIENT', demo_mode: true, demo_session_id: 'session-A', user_type: 'patient' }), { type: 'bearer' }).send({ owner_key: 'patient:B' });
    expect(r.status).toBe(200); expect(mockStorage.save).toHaveBeenCalledWith('demo:session-A', expect.anything()); expect(demo.getState).not.toHaveBeenCalled();
});
test('revoked dummy sessions cannot read or write draft storage', async () => {
    demo.assertActiveSession.mockResolvedValue(false);
    const r = await request(app()).get('/api/patient-stories/draft').auth(token({ id: 'DEMO-PATIENT', demo_mode: true, demo_session_id: 'expired', user_type: 'patient' }), { type: 'bearer' });
    expect(r.status).toBe(401); expect(mockStorage.read).not.toHaveBeenCalled();
});
