jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../db', () => ({ query: jest.fn().mockResolvedValue([[]]) }));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));
jest.mock('../../services/SundayClinicSchemaValidator', () => ({
    validateSundayClinicSchema: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn()
}));
jest.mock('../../realtime-sync', () => ({
    broadcastToStaff: jest.fn()
}));

const cron = require('node-cron');
const db = require('../../db');
const { createPatientNotification } = require('../../routes/patient-notifications');
const realtimeSync = require('../../realtime-sync');
const { initSchedulers } = require('../../services/appointmentScheduler');

beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue([[]]);
});

test('attendance confirmation jobs run every practice day in Asia/Jakarta', () => {
    initSchedulers();

    const registeredSchedules = cron.schedule.mock.calls.map(([expression, _callback, options]) => ({
        expression,
        timezone: options?.timezone
    }));

    expect(registeredSchedules).toEqual(expect.arrayContaining([
        { expression: '0 18 * * *', timezone: 'Asia/Jakarta' },
        { expression: '0 7 * * *', timezone: 'Asia/Jakarta' },
        { expression: '0 9 * * *', timezone: 'Asia/Jakarta' }
    ]));
});

test('expiry only cancels and notifies appointments that are still pending at update time', async () => {
    initSchedulers();
    await new Promise(setImmediate);
    const expiryCallback = cron.schedule.mock.calls.find(([expression]) => expression === '0 9 * * *')[1];
    const expiring = [
        { id: 101, patient_id: 'P-101', patient_name: 'Pasien Pending', session: 1, slot_number: 1 },
        { id: 102, patient_id: 'P-102', patient_name: 'Pasien Race', session: 1, slot_number: 2 }
    ];

    db.query.mockReset();
    db.query.mockImplementation(async (sql, params = []) => {
        if (sql.includes('SELECT id, patient_id')) return [expiring];
        if (sql.includes('UPDATE sunday_appointments') && params[0] === 101) return [{ affectedRows: 1 }];
        if (sql.includes('UPDATE sunday_appointments') && params[0] === 102) return [{ affectedRows: 0 }];
        throw new Error(`Unexpected SQL in expiry fixture: ${sql}`);
    });

    await expiryCallback();

    const updates = db.query.mock.calls.filter(([sql]) => sql.includes('UPDATE sunday_appointments'));
    expect(updates).toHaveLength(2);
    expect(updates.every(([sql]) => sql.includes("status = 'pending_confirmation'"))).toBe(true);
    expect(createPatientNotification).toHaveBeenCalledTimes(1);
    expect(createPatientNotification).toHaveBeenCalledWith(expect.objectContaining({ patient_id: 'P-101' }));
    expect(realtimeSync.broadcastToStaff).toHaveBeenCalledWith('booking:slots_released', expect.objectContaining({ count: 1 }));
});
