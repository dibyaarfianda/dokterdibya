jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const OperationDoctorJourneyService = require('../../services/OperationDoctorJourneyService');

function operation(overrides = {}) {
    return {
        id: 77,
        facility: 'gambiran',
        source_key: 'gambiran:pendaftaran:11002',
        case_id: 'med0000426904',
        simrs_operasi_id: '11002',
        mr_id: '512995',
        patient_name: 'Pasien Audit',
        doctor_key: 'dibya',
        ...overrides
    };
}

function cachedRow(overrides = {}) {
    return {
        id: 5,
        operation_data_id: 77,
        facility: 'gambiran',
        simrs_operasi_id: '11002',
        transfer_status: 'yes',
        confidence: 'verified',
        origin_doctor_name: 'dr. Dokter Awal',
        origin_doctor_key: 'dokter awal',
        origin_doctor_source: 'cppt_author',
        procedure_doctor_name: 'dr. Dibya Arfianda, Sp.OG',
        procedure_doctor_key: 'dibya arfianda',
        procedure_doctor_source: 'operation_registration',
        final_doctor_name: 'dr. Dibya Arfianda, Sp.OG',
        final_doctor_key: 'dibya arfianda',
        final_doctor_source: 'operation_operator',
        transition_count: 1,
        timeline_json: '[]',
        consultants_json: '[]',
        checked_at: '2026-07-16 04:30:00',
        error_message: null,
        ...overrides
    };
}

describe('OperationDoctorJourneyService', () => {
    test('refreshes through the protected COMM endpoint and persists only the validated summary', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                if (sql.includes('FROM operation_data_index')) return [[operation()]];
                if (sql.includes('SELECT * FROM operation_doctor_journeys')) return [[cachedRow()]];
                return [{ affectedRows: 1 }];
            })
        };
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                success: true,
                doctor_journey: {
                    facility: 'gambiran',
                    simrs_operasi_id: '11002',
                    case_id: 'med0000426904',
                    patient: { mr_id: '512995' },
                    transfer_status: 'yes',
                    confidence: 'verified',
                    origin_doctor: { name: 'dr. Dokter Awal', key: 'dokter awal', source: 'cppt_author' },
                    last_cppt_doctor: { name: 'dr. Dibya', key: 'dibya', source: 'cppt_author' },
                    procedure_doctor: { name: 'dr. Dibya', key: 'dibya', source: 'operation_registration' },
                    final_doctor: { name: 'dr. Dibya', key: 'dibya', source: 'operation_operator' },
                    transition_count: 1,
                    timeline: [{ evidence_type: 'cppt_author' }],
                    consultants: [],
                    source_hash: 'a'.repeat(64),
                    checked_at: '2026-07-16T04:30:00.000Z'
                }
            })
        }));
        const service = new OperationDoctorJourneyService({
            db,
            fetchImpl,
            commBaseUrl: 'http://comm.test',
            apiKey: 'shared-test-key'
        });

        const result = await service.refreshForAuditRow(77);

        expect(fetchImpl).toHaveBeenCalledWith(
            'http://comm.test/api/internal/operation-doctor-journey/11002',
            expect.objectContaining({
                headers: expect.objectContaining({ 'X-API-Key': 'shared-test-key' })
            })
        );
        expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO operation_doctor_journeys'))).toBe(true);
        expect(result.doctor_journey).toEqual(expect.objectContaining({ transfer_status: 'yes', transition_count: 1 }));
    });

    test('rejects stale case identity and records the failed attempt', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                if (sql.includes('FROM operation_data_index')) return [[operation()]];
                return [{ affectedRows: 1 }];
            })
        };
        const service = new OperationDoctorJourneyService({
            db,
            apiKey: 'key',
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({
                    success: true,
                    doctor_journey: {
                        facility: 'gambiran',
                        simrs_operasi_id: '11002',
                        case_id: 'med0000709328',
                        patient: { mr_id: '512995' },
                        transfer_status: 'unknown',
                        confidence: 'unknown'
                    }
                })
            })
        });

        await expect(service.refreshForAuditRow(77)).rejects.toThrow(/caseId/);
        expect(db.query.mock.calls.some(([sql]) => sql.includes("VALUES (?, ?, ?, 'unknown'"))).toBe(true);
    });

    test('returns an explicit not-analyzed state when no cache exists', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce([[operation()]])
                .mockResolvedValueOnce([[]])
        };
        const service = new OperationDoctorJourneyService({ db, apiKey: 'key', fetchImpl: jest.fn() });
        const result = await service.getForAuditRow(77);
        expect(result.analysis_status).toBe('not_analyzed');
        expect(result.doctor_journey).toBeNull();
    });
});
