'use strict';

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../services/PatientAccountSuspensionService', () => ({
    SUSPENDED_PATIENT_MESSAGE: 'Akun Anda ditangguhkan.',
    getActiveSuspension: jest.fn()
}));

const db = require('../../db');
const PatientAccountSuspensionService = require('../../services/PatientAccountSuspensionService');
const { enforcePatientAccountSuspension, matchSuspendedRoute } = require('../../security/patientAccountSuspension');
const { validatePatientName } = require('../../../../public/scripts/patient-name-rules.js');

function mockRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
}

describe('patient account suspension boundary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('active patients pass through untouched', async () => {
        PatientAccountSuspensionService.getActiveSuspension.mockResolvedValue(null);
        const res = mockRes();
        const blocked = await enforcePatientAccountSuspension({ method: 'GET', originalUrl: '/api/kick-counter/today' }, res, 'P2026001');
        expect(blocked).toBe(false);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('suspended patient is blocked from portal features with the reason', async () => {
        PatientAccountSuspensionService.getActiveSuspension.mockResolvedValue({ reason: 'Tidak memakai nama asli', suspended_at: '2026-10-31' });
        const res = mockRes();
        const blocked = await enforcePatientAccountSuspension({ method: 'POST', originalUrl: '/api/sunday-appointments/book' }, res, 'P2026001');
        expect(blocked).toBe(true);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'ACCOUNT_SUSPENDED',
            reason: 'Tidak memakai nama asli',
            inbox_url: '/pesan.html'
        }));
    });

    test('suspended patient keeps status check and inbox list', () => {
        expect(matchSuspendedRoute('GET', '/api/patients/account-status?_t=1').allowed).toBe(true);
        expect(matchSuspendedRoute('GET', '/api/community-chat/inbox').allowed).toBe(true);
        expect(matchSuspendedRoute('GET', '/api/community-chat/inbox/count').allowed).toBe(true);
        expect(matchSuspendedRoute('POST', '/api/patient-stories').allowed).toBe(false);
        expect(matchSuspendedRoute('GET', '/api/community-chat/rooms').allowed).toBe(false);
    });

    test('suspended patient may message only their own direct room', async () => {
        PatientAccountSuspensionService.getActiveSuspension.mockResolvedValue({ reason: 'x' });

        db.query.mockResolvedValueOnce([[{ is_direct: 1, direct_patient_id: 'P2026001' }]]);
        const ownRes = mockRes();
        expect(await enforcePatientAccountSuspension({ method: 'POST', originalUrl: '/api/community-chat/rooms/dm-abc/messages' }, ownRes, 'P2026001')).toBe(false);

        db.query.mockResolvedValueOnce([[{ is_direct: 0, direct_patient_id: null }]]);
        const publicRes = mockRes();
        expect(await enforcePatientAccountSuspension({ method: 'POST', originalUrl: '/api/community-chat/rooms/umum/messages' }, publicRes, 'P2026001')).toBe(true);

        db.query.mockResolvedValueOnce([[{ is_direct: 1, direct_patient_id: 'P2026999' }]]);
        const otherRes = mockRes();
        expect(await enforcePatientAccountSuspension({ method: 'GET', originalUrl: '/api/community-chat/rooms/dm-xyz/messages' }, otherRes, 'P2026001')).toBe(true);
    });
});

describe('patient real-name rules', () => {
    test.each(['Siti Nurhaliza', 'Sri', 'Ny. Sutini', 'Hj. Dewi Kartika', 'Ni Luh Putu Ayu', "O'Neil", 'Siti-Aminah', 'Ibu Sri'])(
        'accepts real name %s', (name) => {
            expect(validatePatientName(name).valid).toBe(true);
        }
    );

    test.each(['', 'A', 'test', 'Bunda Cantik', 'Mama Muda', 'asdfgh', 'Aaaaa', 'Dewi123', 'Dewi 😊', 'Ayu_K', 'Brnrd'])(
        'rejects fake name %s', (name) => {
            expect(validatePatientName(name).valid).toBe(false);
        }
    );
});
