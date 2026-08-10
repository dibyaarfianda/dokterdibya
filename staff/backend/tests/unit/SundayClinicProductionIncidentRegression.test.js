const mockShared = {
    db: {
        query: jest.fn()
    },
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    },
    normalizeMrId: jest.fn((value) => value),
    createPatientNotification: jest.fn(),
    listActiveQueueReminderSettings: jest.fn(),
    markQueueReminderTriggered: jest.fn(),
    realtimeSync: {
        broadcast: jest.fn()
    },
    getSessionLabel: jest.fn(),
    getSlotTime: jest.fn(),
    getGmt7DayWindow: jest.fn(() => ({
        dateStr: '2026-08-09',
        startDateTime: '2026-08-09 00:00:00',
        endDateTime: '2026-08-10 00:00:00'
    })),
    summarizeMedifySyncStatus: jest.fn(),
    QUEUE_CACHE_TTL_MS: 1000,
    queueTodayCache: {}
};

jest.mock('../../services/sunday-clinic/shared', () => mockShared);

const mockDb = {
    getConnection: jest.fn(),
    query: jest.fn()
};

jest.mock('../../db', () => mockDb);
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const queueService = require('../../services/sunday-clinic/queue');
const { createSundayClinicRecord } = require('../../services/sundayClinicService');

async function flushBackgroundWork() {
    for (let index = 0; index < 5; index += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

describe('Sunday Clinic production incident regressions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockShared.queueTodayCache.expiresAt = 1000;
    });

    test('processes queue reminders without an undefined notification dependency', async () => {
        mockShared.db.query
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[
                {
                    patient_id: 'patient-test',
                    appointment_date: '2026-08-09',
                    session: 1,
                    slot_number: 1,
                    queue_status: 'menunggu'
                }
            ]]);
        mockShared.listActiveQueueReminderSettings.mockResolvedValueOnce([
            {
                patient_id: 'patient-test',
                threshold_ahead: 2,
                last_notified_signature: null
            }
        ]);
        mockShared.createPatientNotification.mockResolvedValueOnce({ success: true });
        mockShared.markQueueReminderTriggered.mockResolvedValueOnce();

        await queueService.updateQueueStatus('DRD0001', 'anamnesa');
        await flushBackgroundWork();

        expect(mockShared.listActiveQueueReminderSettings).toHaveBeenCalledWith(['patient-test']);
        expect(mockShared.createPatientNotification).toHaveBeenCalledWith(expect.objectContaining({
            patient_id: 'patient-test',
            type: 'queue_reminder'
        }));
        expect(mockShared.markQueueReminderTriggered).toHaveBeenCalledWith(
            'patient-test',
            '2026-08-09|1|1'
        );
        expect(mockShared.logger.warn).not.toHaveBeenCalledWith(
            'processQueueReminderNotifications failed',
            expect.anything()
        );
    });

    test('releases its own database connection once after a successful record creation', async () => {
        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            query: jest.fn()
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([{}])
                .mockResolvedValueOnce([[{ current_sequence: 1 }]])
                .mockResolvedValueOnce([{ insertId: 9 }])
                .mockResolvedValueOnce([[{ id: 9, mr_id: 'DRD0001' }]])
        };
        mockDb.getConnection.mockResolvedValueOnce(connection);

        const result = await createSundayClinicRecord({
            appointmentId: 101,
            patientId: 'patient-test',
            category: 'obstetri'
        });

        expect(result).toEqual({
            record: { id: 9, mr_id: 'DRD0001' },
            created: true
        });
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test('does not release a caller-owned transaction connection', async () => {
        const connection = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            query: jest.fn()
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([{}])
                .mockResolvedValueOnce([[{ current_sequence: 2 }]])
                .mockResolvedValueOnce([{ insertId: 10 }])
                .mockResolvedValueOnce([[{ id: 10, mr_id: 'DRD0002' }]])
        };

        await createSundayClinicRecord({
            appointmentId: 102,
            patientId: 'patient-test',
            category: 'obstetri'
        }, connection);

        expect(connection.beginTransaction).not.toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).not.toHaveBeenCalled();
    });
});
