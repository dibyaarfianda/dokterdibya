jest.mock('../../services/r2Storage', () => ({
    R2_BUCKET_NAME: 'test-bucket',
    getJson: jest.fn()
}));

jest.mock('../../db', () => ({
    query: jest.fn()
}));

const r2Storage = require('../../services/r2Storage');
const db = require('../../db');
const { DocBoardGambiranMonitorService } = require('../../services/DocBoardGambiranMonitorService');

describe('DocBoardGambiranMonitorService', () => {
    beforeEach(() => {
        r2Storage.getJson.mockReset();
        db.query.mockReset();
    });

    function buildService() {
        return new DocBoardGambiranMonitorService({
            r2: r2Storage,
            db,
            now: () => new Date('2026-07-03T10:00:00.000Z')
        });
    }

    test('returns recent target-room admissions with latest target-doctor CPPT and operation data', async () => {
        r2Storage.getJson.mockImplementation(async (key) => {
            const payloads = {
                'active-patients/gambiran.json': {
                    cachedAt: '2026-07-03T09:55:00.000Z',
                    results: [
                        {
                            patientName: 'Pasien Kirana',
                            medicalRecordNo: '123456',
                            caseId: 'med0000000001',
                            ward: 'Kirana',
                            bed: 'Bed 1',
                            admission_at: '2026-07-03T08:15:00.000+07:00'
                        },
                        {
                            patientName: 'Pasien Lama',
                            medicalRecordNo: '654321',
                            caseId: 'med0000000002',
                            ward: 'Kirana',
                            admission_at: '2026-07-02T07:00:00.000+07:00'
                        },
                        {
                            patientName: 'Pasien Ruang Lain',
                            medicalRecordNo: '777777',
                            caseId: 'med0000000003',
                            ward: 'Mawar',
                            admission_at: '2026-07-03T09:00:00.000+07:00'
                        }
                    ]
                },
                'cppt/gambiran/med0000000001.json': {
                    entries: [
                        {
                            id: 'nurse-1',
                            author: 'Bidan Jaga',
                            date: '2026-07-03',
                            time: '09:30',
                            assessment: 'Assessment bidan',
                            plan: 'Plan bidan'
                        },
                        {
                            id: 'dibya-old',
                            author: 'dr. Dibya Arfianda, SpOG',
                            date: '2026-07-03',
                            time: '08:45',
                            assessment: 'G2P1 inpartu',
                            plan: 'Observasi his'
                        },
                        {
                            id: 'latifa-new',
                            author: 'dr. Latifa Maharani, SpOG',
                            created_at: '2026-07-03T09:45:00.000+07:00',
                            cpptAssessment: 'G2P1 kala I',
                            planning: 'Pro evaluasi persalinan'
                        }
                    ]
                },
                'operasi/gambiran/med0000000001.json': {
                    report: {
                        tindakanOperasi: 'SC emergency',
                        tanggalOperasi: '03/07/2026',
                        waktuMulai: '10:30'
                    }
                }
            };
            if (!(key in payloads)) {
                const error = new Error(`missing ${key}`);
                error.name = 'NoSuchKey';
                throw error;
            }
            return payloads[key];
        });
        db.query.mockResolvedValueOnce([[
            {
                case_id: 'med0000000001',
                operation_name: 'SC dari index',
                operation_date: '2026-07-03',
                operation_time: '10:00:00',
                status: 'planned'
            }
        ]]);

        const result = await buildService().getGambiranMonitor({ windowHours: 24 });

        expect(result.patients).toHaveLength(1);
        expect(result.patients[0]).toEqual(expect.objectContaining({
            case_id: 'med0000000001',
            mr_id: '123456',
            patient_name: 'Pasien Kirana',
            room: 'Kirana',
            bed: 'Bed 1',
            admission_at: '2026-07-03T08:15:00.000+07:00'
        }));
        expect(result.patients[0].cppt).toEqual(expect.objectContaining({
            doctor_key: 'latifa',
            doctor_name: 'dr. Latifa Maharani, SpOG',
            diagnosis: 'G2P1 kala I',
            planning: 'Pro evaluasi persalinan'
        }));
        expect(result.patients[0].operation).toEqual(expect.objectContaining({
            operation_name: 'SC dari index',
            operation_date: '2026-07-03',
            operation_time: '10:00:00',
            status: 'planned'
        }));
        expect(result.warnings).toEqual([]);
        expect(r2Storage.getJson).toHaveBeenCalledWith('active-patients/gambiran.json', 'medscomm-medis');
        expect(r2Storage.getJson).toHaveBeenCalledWith('cppt/gambiran/med0000000001.json', 'medscomm-medis');
    });

    test('falls back to COMM cache endpoints when COMM R2 bucket is not accessible', async () => {
        const accessDenied = new Error('Access Denied');
        accessDenied.name = 'AccessDenied';
        r2Storage.getJson.mockRejectedValue(accessDenied);
        db.query.mockResolvedValueOnce([[]]);
        const fetch = jest.fn(async (url) => {
            if (url.includes('/patients/active-cached')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        cachedAt: '2026-07-03T09:55:00.000Z',
                        results: [
                            {
                                patientName: 'Pasien Fallback',
                                medicalRecordNo: '998877',
                                caseId: 'med0000000099',
                                ward: 'Kirana',
                                admission_at: '2026-07-03T08:00:00.000+07:00',
                                facility: 'gambiran'
                            }
                        ]
                    })
                };
            }
            if (url.includes('/cppt-cache/med0000000099')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        entries: [
                            {
                                author: 'dr. Dibya Arfianda, SpOG',
                                created_at: '2026-07-03T09:00:00.000+07:00',
                                assessment: 'Diagnosis fallback',
                                plan: 'Planning fallback'
                            }
                        ]
                    })
                };
            }
            return { ok: false, status: 404, json: async () => ({}) };
        });
        const service = new DocBoardGambiranMonitorService({
            r2: r2Storage,
            db,
            fetch,
            commBaseUrl: 'http://comm.test',
            now: () => new Date('2026-07-03T10:00:00.000Z')
        });

        const result = await service.getGambiranMonitor({ date: '2026-07-03' });

        expect(fetch).toHaveBeenCalledWith('http://comm.test/api/simrs/patients/active-cached?facility=gambiran');
        expect(fetch).toHaveBeenCalledWith('http://comm.test/api/simrs/cppt-cache/med0000000099?facility=gambiran');
        expect(result.patients).toHaveLength(1);
        expect(result.patients[0]).toEqual(expect.objectContaining({
            case_id: 'med0000000099',
            patient_name: 'Pasien Fallback'
        }));
        expect(result.patients[0].cppt).toEqual(expect.objectContaining({
            diagnosis: 'Diagnosis fallback',
            planning: 'Planning fallback'
        }));
    });

    test('skips patients without admission_at and reports stale-cache warning', async () => {
        r2Storage.getJson.mockResolvedValueOnce({
            cachedAt: '2026-07-03T09:55:00.000Z',
            results: [
                {
                    patientName: 'Pasien Cache Lama',
                    medicalRecordNo: '123456',
                    caseId: 'med0000000001',
                    ward: 'Joyoboyo'
                }
            ]
        });
        db.query.mockResolvedValueOnce([[]]);

        const result = await buildService().getGambiranMonitor({ windowHours: 24 });

        expect(result.patients).toEqual([]);
        expect(result.warnings).toContain('Cache pasien aktif belum memuat admission_at untuk sebagian pasien; refresh cache COMM diperlukan.');
    });

    test('keeps recent admission but hides non-target CPPT entries', async () => {
        r2Storage.getJson.mockImplementation(async (key) => {
            const payloads = {
                'active-patients/gambiran.json': {
                    cachedAt: '2026-07-03T09:55:00.000Z',
                    results: [
                        {
                            patientName: 'Pasien Joyoboyo',
                            medicalRecordNo: '321321',
                            caseId: 'med0000000004',
                            ward: 'Joyoboyo',
                            admission_at: '2026-07-03T07:00:00.000+07:00'
                        }
                    ]
                },
                'cppt/gambiran/med0000000004.json': {
                    entries: [
                        {
                            author: 'dr. Dokter Lain',
                            created_at: '2026-07-03T08:00:00.000+07:00',
                            assessment: 'Assessment dokter lain',
                            plan: 'Plan dokter lain'
                        },
                        {
                            author: 'Perawat Jaga',
                            created_at: '2026-07-03T09:00:00.000+07:00',
                            assessment: 'Assessment perawat',
                            plan: 'Plan perawat'
                        }
                    ]
                }
            };
            if (!(key in payloads)) {
                const error = new Error(`missing ${key}`);
                error.name = 'NoSuchKey';
                throw error;
            }
            return payloads[key];
        });
        db.query.mockResolvedValueOnce([[]]);

        const result = await buildService().getGambiranMonitor({ windowHours: 24 });

        expect(result.patients).toHaveLength(1);
        expect(result.patients[0]).toEqual(expect.objectContaining({
            case_id: 'med0000000004',
            patient_name: 'Pasien Joyoboyo',
            cppt: null
        }));
    });

    test('filters admissions by explicit Jakarta calendar date', async () => {
        r2Storage.getJson.mockImplementation(async (key) => {
            const payloads = {
                'active-patients/gambiran.json': {
                    cachedAt: '2026-07-03T09:55:00.000Z',
                    results: [
                        {
                            patientName: 'Pasien Kemarin',
                            medicalRecordNo: '555111',
                            caseId: 'med0000000005',
                            ward: 'Tegowangi',
                            admission_at: '2026-07-02T18:30:00.000+07:00'
                        },
                        {
                            patientName: 'Pasien Hari Ini',
                            medicalRecordNo: '555222',
                            caseId: 'med0000000006',
                            ward: 'Tegowangi',
                            admission_at: '2026-07-03T08:00:00.000+07:00'
                        }
                    ]
                }
            };
            if (!(key in payloads)) {
                const error = new Error(`missing ${key}`);
                error.name = 'NoSuchKey';
                throw error;
            }
            return payloads[key];
        });
        db.query.mockResolvedValueOnce([[]]);

        const result = await buildService().getGambiranMonitor({ date: '2026-07-02', windowHours: 24 });

        expect(result.date).toBe('2026-07-02');
        expect(result.window_start).toBe('2026-07-02T00:00:00.000+07:00');
        expect(result.window_end).toBe('2026-07-03T00:00:00.000+07:00');
        expect(result.patients).toHaveLength(1);
        expect(result.patients[0]).toEqual(expect.objectContaining({
            case_id: 'med0000000005',
            patient_name: 'Pasien Kemarin'
        }));
    });
});
