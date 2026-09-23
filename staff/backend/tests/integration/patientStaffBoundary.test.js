const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../../db', () => ({
    query: jest.fn(async () => [[]]),
    getConnection: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));
jest.mock('../../services/OperationalSchemaValidator', () => ({
    validateOperationalSchemaScope: jest.fn(async () => true)
}));
jest.mock('../../services/r2Storage', () => ({
    isR2Configured: jest.fn(() => true),
    getSignedDownloadUrl: jest.fn(async key => `https://signed.invalid/${encodeURIComponent(key)}`),
    getFileBuffer: jest.fn(async () => Buffer.from('file')),
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
    R2_PUBLIC_URL: ''
}));
jest.mock('../../services/whatsappService', () => ({
    sendDocumentNotification: jest.fn(),
    sendMessage: jest.fn()
}));
jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn()
}));
jest.mock('../../realtime-sync', () => ({
    broadcast: jest.fn(),
    broadcastNewBooking: jest.fn(),
    broadcastBookingCancel: jest.fn(),
    broadcastBookingUpdate: jest.fn(),
    broadcastCancellation: jest.fn()
}));
jest.mock('../../services/patientActivityLogger', () => ({
    logAppointmentBooking: jest.fn()
}));
jest.mock('../../services/sundayClinicService', () => ({
    createSundayClinicRecord: jest.fn()
}));
jest.mock('../../services/SundayClinicClosingService', () => ({
    acquireSundayClinicAccountingDateGuard: jest.fn()
}));
jest.mock('../../services/booking-session-settings', () => ({
    getSessionBreak: jest.fn(),
    getDayName: jest.fn(),
    getSessionSettings: jest.fn(async () => []),
    getCachedSessionSettings: jest.fn(() => []),
    invalidateSessionSettingsCache: jest.fn(),
    getSessionLabelFromSettings: jest.fn(() => 'Sesi'),
    getSlotTimeFromSettings: jest.fn(() => '09:00'),
    getSlotTimeFromBookingRow: jest.fn(() => '09:00')
}));

const db = require('../../db');

function patientHeader() {
    return `Bearer ${jwt.sign({ id: 'patient-red-team', role: 'patient' }, process.env.JWT_SECRET)}`;
}

function staffHeader() {
    return `Bearer ${jwt.sign({ id: 'staff-1', role: 'admin', role_id: 2 }, process.env.JWT_SECRET)}`;
}

function makeApp(basePath, router) {
    const app = express();
    app.use(express.json());
    app.use(basePath, router);
    return app;
}

describe('patient JWT cannot cross staff route boundaries', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockResolvedValue([[]]);
    });

    test.each([
        ['patient directory', '/api/patients', require('../../routes/patients-auth'), 'get', '/all'],
        ['patient record by id', '/', require('../../routes/patients'), 'get', '/api/patients/other-patient'],
        ['intake queue', '/', require('../../routes/patient-intake'), 'get', '/api/patient-intake'],
        ['document list by patient', '/api/patient-documents', require('../../routes/patient-documents'), 'get', '/by-patient/other-patient'],
        ['appointment list', '/api/sunday-appointments', require('../../routes/sunday-appointments'), 'get', '/list'],
        ['doctor question queue', '/api/patient-questions', require('../../routes/patient-questions'), 'get', '/staff/all'],
        ['support queue', '/api/support-chat', require('../../routes/support-chat'), 'get', '/staff/pending'],
        ['poll administration', '/api/polls', require('../../routes/polls'), 'post', '/staff/create'],
        ['USG storage deletion', '/api/usg-photos', require('../../routes/usg-photos'), 'delete', '/private-key.png'],
        ['community patient directory', '/api/community-chat', require('../../routes/community-chat'), 'get', '/admin/patient-users'],
        ['community moderator directory', '/api/community-chat', require('../../routes/community-chat'), 'get', '/rooms/general/moderators'],
        ['greeting card administration', '/api/greeting-cards', require('../../routes/greeting-cards'), 'get', '/'],
        ['application version mutation', '/api/app', require('../../routes/app'), 'post', '/version'],
        ['application download logs', '/api/app-version', require('../../routes/app-version'), 'get', '/logs']
    ])('returns 403 before protected work for %s', async (_label, basePath, router, method, routePath) => {
        const app = makeApp(basePath, router);
        const requestPath = basePath === '/' ? routePath : `${basePath}${routePath}`;
        const response = await request(app)[method](requestPath)
            .set('Authorization', patientHeader())
            .send(method === 'post' ? { question: 'blocked' } : undefined);

        expect(response.status).toBe(403);
    });

    test('patient appointment status mutation returns 403', async () => {
        const app = makeApp('/api/sunday-appointments', require('../../routes/sunday-appointments'));
        const response = await request(app)
            .put('/api/sunday-appointments/42/status')
            .set('Authorization', patientHeader())
            .send({ status: 'completed' });

        expect(response.status).toBe(403);
    });

    test('staff token cannot use a patient-only hospital booking route', async () => {
        const app = makeApp('/api/hospital-appointments', require('../../routes/hospital-appointments'));
        const response = await request(app)
            .get('/api/hospital-appointments/schedules')
            .set('Authorization', staffHeader());

        expect(response.status).toBe(403);
    });

    test('anonymous caller cannot mutate application version settings', async () => {
        const app = makeApp('/api/app', require('../../routes/app'));
        const response = await request(app)
            .post('/api/app/version')
            .send({ versionCode: 99, versionName: '99.0.0' });

        expect(response.status).toBe(401);
    });

    test('patient self-service profile remains routed past authorization', async () => {
        const app = makeApp('/api/patients', require('../../routes/patients-auth'));
        const response = await request(app)
            .get('/api/patients/profile')
            .set('Authorization', patientHeader());

        expect(response.status).not.toBe(403);
    });
});
