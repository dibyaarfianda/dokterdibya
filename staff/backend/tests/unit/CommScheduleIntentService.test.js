jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const CommScheduleIntentService = require('../../services/CommScheduleIntentService');

function createDbMock(rowsBySql = []) {
    const calls = [];
    const db = {
        query: jest.fn(async (sql, params = []) => {
            calls.push({ sql, params });
            const next = rowsBySql.shift();
            if (typeof next === 'function') return next(sql, params, calls);
            return next || [[]];
        })
    };
    db.calls = calls;
    return db;
}

function createSurgeryServiceMock() {
    return {
        createSurgery: jest.fn(async (payload) => ({
            id: 77,
            ...payload,
            surgery_date: payload.surgery_date,
            surgery_time: payload.surgery_time || null
        })),
        getSurgeryById: jest.fn(async (id) => ({ id, patient_name: 'Existing Surgery' }))
    };
}

function basePayload(overrides = {}) {
    return {
        facility: 'gambiran',
        case_id: 'CASE123',
        patient_name: 'Siti Aminah',
        hospital_mr_id: 'GMB-001',
        patient_birth_date: '1990-01-10',
        schedule_date: '2026-06-10',
        schedule_time: '08:30',
        operation_name: 'SC',
        diagnosis: 'G2P1 aterm',
        simrs_operasi_id: 'OP789',
        notes: 'Dari COMM',
        ...overrides
    };
}

describe('CommScheduleIntentService', () => {
    test('creates an active surgery from a valid COMM schedule intent', async () => {
        const db = createDbMock([
            [[]],
            [[]],
            [[]],
            [[{ id: 1, code: 'SC' }]],
            [{ insertId: 1 }]
        ]);
        const surgeryService = createSurgeryServiceMock();
        const pushService = { sendNewBookingNotification: jest.fn(async () => {}) };
        const service = new CommScheduleIntentService({ db, surgeryService, pushService });

        const result = await service.createFromIntent(basePayload(), 'COMM manual');

        expect(result.action).toBe('created');
        expect(result.surgery.id).toBe(77);
        expect(surgeryService.createSurgery).toHaveBeenCalledWith(expect.objectContaining({
            patient_name: 'Siti Aminah',
            patient_id: null,
            mr_id: null,
            location: 'rsud_gambiran',
            surgery_date: '2026-06-10',
            surgery_time: '08:30:00',
            operation_type_id: 1,
            operation_type_other: null,
            diagnosis: 'G2P1 aterm',
            special_notes: 'Dari COMM',
            idempotency_key: expect.stringMatching(/^COMM_MANUAL:[a-f0-9]+$/)
        }), 'COMM manual');
        expect(pushService.sendNewBookingNotification).toHaveBeenCalledWith(result.surgery);
    });

    test('deduplicates repeated intents by external source key', async () => {
        const db = createDbMock([
            [[{ surgery_id: 42 }]]
        ]);
        const surgeryService = createSurgeryServiceMock();
        const service = new CommScheduleIntentService({
            db,
            surgeryService,
            pushService: { sendNewBookingNotification: jest.fn() }
        });

        const result = await service.createFromIntent(basePayload(), 'COMM manual');

        expect(result.action).toBe('existing');
        expect(result.surgery.id).toBe(42);
        expect(surgeryService.createSurgery).not.toHaveBeenCalled();
    });

    test('uses existing patient external mapping for patient_id enrichment', async () => {
        const db = createDbMock([
            [[]],
            [[{ patient_id: 'P001' }]],
            [[]],
            [[{ id: 1, code: 'SC' }]],
            [{ insertId: 1 }]
        ]);
        const surgeryService = createSurgeryServiceMock();
        const service = new CommScheduleIntentService({
            db,
            surgeryService,
            pushService: { sendNewBookingNotification: jest.fn(async () => {}) }
        });

        await service.createFromIntent(basePayload(), 'COMM manual');

        expect(surgeryService.createSurgery).toHaveBeenCalledWith(expect.objectContaining({
            patient_id: 'P001',
            mr_id: null
        }), 'COMM manual');
    });

    test('auto-links and stores mapping when name and birth date match exactly one patient', async () => {
        const db = createDbMock([
            [[]],
            [[]],
            [[{ id: 'P002', full_name: 'Siti Aminah', birth_date: '1990-01-10' }]],
            [{ insertId: 3 }],
            [[{ id: 1, code: 'SC' }]],
            [{ insertId: 1 }]
        ]);
        const surgeryService = createSurgeryServiceMock();
        const service = new CommScheduleIntentService({
            db,
            surgeryService,
            pushService: { sendNewBookingNotification: jest.fn(async () => {}) }
        });

        await service.createFromIntent(basePayload(), 'COMM manual');

        expect(surgeryService.createSurgery).toHaveBeenCalledWith(expect.objectContaining({
            patient_id: 'P002',
            mr_id: null
        }), 'COMM manual');
        expect(db.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO patient_external_ids'),
            expect.arrayContaining(['P002', 'rsud_gambiran', 'GMB-001'])
        );
    });

    test('does not auto-link ambiguous name and birth date matches', async () => {
        const db = createDbMock([
            [[]],
            [[]],
            [
                [
                    { id: 'P002', full_name: 'Siti Aminah', birth_date: '1990-01-10' },
                    { id: 'P003', full_name: 'Siti Aminah', birth_date: '1990-01-10' }
                ]
            ],
            [[{ id: 1, code: 'SC' }]],
            [{ insertId: 1 }]
        ]);
        const surgeryService = createSurgeryServiceMock();
        const service = new CommScheduleIntentService({
            db,
            surgeryService,
            pushService: { sendNewBookingNotification: jest.fn(async () => {}) }
        });

        await service.createFromIntent(basePayload(), 'COMM manual');

        expect(surgeryService.createSurgery).toHaveBeenCalledWith(expect.objectContaining({
            patient_id: null,
            mr_id: null
        }), 'COMM manual');
        expect(db.query).not.toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO patient_external_ids'),
            expect.anything()
        );
    });

    test('rejects missing required fields', async () => {
        const service = new CommScheduleIntentService({
            db: createDbMock(),
            surgeryService: createSurgeryServiceMock(),
            pushService: { sendNewBookingNotification: jest.fn() }
        });

        await expect(service.createFromIntent(basePayload({ operation_name: '' }), 'COMM manual'))
            .rejects
            .toThrow('Missing required fields: operation_name');
    });

    test('keeps surgery idempotency key within schema length for long operation names', async () => {
        const db = createDbMock([
            [[]],
            [[]],
            [[]],
            [[]],
            [[{ id: 99 }]],
            [{ insertId: 1 }]
        ]);
        const surgeryService = createSurgeryServiceMock();
        const service = new CommScheduleIntentService({
            db,
            surgeryService,
            pushService: { sendNewBookingNotification: jest.fn(async () => {}) }
        });

        await service.createFromIntent(basePayload({
            operation_name: 'SC dengan tindakan tambahan yang sangat panjang dan perlu tetap aman untuk idempotency key database'
        }), 'COMM manual');

        const payload = surgeryService.createSurgery.mock.calls[0][0];
        expect(payload.idempotency_key.length).toBeLessThanOrEqual(64);
        expect(payload.idempotency_key).toMatch(/^COMM_MANUAL:/);
    });
});
