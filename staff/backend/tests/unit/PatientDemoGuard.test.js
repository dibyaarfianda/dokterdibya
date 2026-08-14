process.env.JWT_SECRET = process.env.JWT_SECRET || 'patient-demo-test-secret';

const jwt = require('jsonwebtoken');

jest.mock('../../services/PatientDemoService', () => ({
    assertActiveSession: jest.fn(),
    getState: jest.fn(),
    updateState: jest.fn(),
    audit: jest.fn()
}));

const service = require('../../services/PatientDemoService');
const guard = require('../../middleware/patientDemoGuard');

function response() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        set: jest.fn(function set(name, value) { this.headers[name] = value; return this; }),
        status: jest.fn(function status(code) { this.statusCode = code; return this; }),
        json: jest.fn(function json(body) { this.body = body; return this; })
    };
}

function demoToken(overrides = {}) {
    return jwt.sign({
        id: 'DEMO-PATIENT', role: 'patient', user_type: 'patient',
        demo_mode: true, demo_session_id: 'demo-session', ...overrides
    }, process.env.JWT_SECRET, { expiresIn: '60m' });
}

function request(path, method = 'GET', token = demoToken(), body = {}) {
    return {
        method,
        originalUrl: path,
        url: path,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        query: {},
        body
    };
}

describe('patientDemoGuard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        service.assertActiveSession.mockResolvedValue(true);
        service.getState.mockResolvedValue({
            profile: { id: 'DEMO-PATIENT', full_name: 'Ayu Contoh' },
            settings: {}, pregnancy: {}, documents: [], notifications: [], bookings: [],
            visits: [], billings: [], workdesk: {}, feedback: [], stories: [],
            trackers: { kick_counter: {}, contraction_timer: {}, fertility_calendar: {}, vitamins: [] },
            queue: { settings: {}, items: [] }
        });
    });

    test.each([
        ['without token', null],
        ['ordinary patient token', jwt.sign({ id: 'patient-1', role: 'patient', user_type: 'patient' }, process.env.JWT_SECRET)]
    ])('%s falls through without touching demo state', async (_label, token) => {
        const next = jest.fn();
        await guard(request('/api/patients/profile', 'GET', token), response(), next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(service.getState).not.toHaveBeenCalled();
    });

    test('revoked or expired demo session is rejected', async () => {
        service.assertActiveSession.mockResolvedValue(false);
        const res = response();
        const next = jest.fn();
        await guard(request('/api/patients/profile'), res, next);
        expect(res.statusCode).toBe(401);
        expect(res.body.code).toBe('DEMO_SESSION_REVOKED');
        expect(next).not.toHaveBeenCalled();
    });

    test('serves the synthetic profile without falling through', async () => {
        const res = response();
        const next = jest.fn();
        await guard(request('/api/patients/profile'), res, next);
        expect(res.body.user.id).toBe('DEMO-PATIENT');
        expect(next).not.toHaveBeenCalled();
    });

    test.each([
        '/api/patient-billing/payment',
        '/api/usg-photos/upload',
        '/api/community-chat/messages',
        '/api/support-chat/sessions',
        '/api/patients/push-token'
    ])('blocks external effect %s before production handlers', async (path) => {
        const res = response();
        const next = jest.fn();
        await guard(request(path, 'POST'), res, next);
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe('DEMO_ACTION_BLOCKED');
        expect(next).not.toHaveBeenCalled();
        expect(service.updateState).not.toHaveBeenCalled();
    });

    test('fails closed for an unregistered mutation', async () => {
        const res = response();
        const next = jest.fn();
        await guard(request('/api/new-production-write', 'POST'), res, next);
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe('UNKNOWN_DEMO_MUTATION');
        expect(next).not.toHaveBeenCalled();
        expect(service.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'unknown_mutation_blocked' }));
    });
});
