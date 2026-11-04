jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => { req.user = { id: 'DOC-1' }; next(); },
    requireDoctorRoleOrAccountPermission: () => (req, res, next) => next()
}));
jest.mock('../../services/booking-session-settings', () => {
    const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return {
        getSessionSettings: jest.fn(),
        getDayName: day => DAY_NAMES[day]
    };
});

const request = require('supertest');
const express = require('express');
const db = require('../../db');
const { getSessionSettings } = require('../../services/booking-session-settings');

const app = express();
app.use(express.json());
app.use('/api/staff-payroll', require('../../routes/staff-payroll'));

const SUNDAY_AND_SATURDAY = [
    { session: 1, name: 'Sunday Clinic', dayOfWeek: 0, isActive: true },
    { session: 2, name: 'Weekend Clinic', dayOfWeek: 6, isActive: true }
];

// Booking practice dates (Saturday + Sunday), newest first.
const DUTY_DATES = [
    '2026-11-01', '2026-10-31', '2026-10-25', '2026-10-24',
    '2026-10-18', '2026-10-17', '2026-10-11', '2026-10-10',
    '2026-10-04', '2026-10-03'
];

describe('staff payroll cycle follows booking practice days', () => {
    let lastEnd;
    let bookingQueries;
    beforeEach(() => {
        jest.clearAllMocks();
        lastEnd = null;
        bookingQueries = [];
        getSessionSettings.mockResolvedValue(SUNDAY_AND_SATURDAY);
        db.query.mockImplementation(async (sql, params) => {
            if (sql.includes('MAX(cycle_end_date)')) return [[{ last_end: lastEnd }]];
            if (sql.includes('FROM sunday_appointments')) {
                bookingQueries.push({ sql, params });
                const limit = params[params.length - 1];
                if (sql.includes('appointment_date > ?')) {
                    const after = params[params.length - 2];
                    return [DUTY_DATES.filter(d => d > after).sort().slice(0, limit).map(d => ({ appointment_date: d }))];
                }
                return [DUTY_DATES.slice(0, limit).map(d => ({ appointment_date: d }))];
            }
            return [[]];
        });
    });

    test('Sunday + Saturday sessions produce an 8-date cycle from booking dates', async () => {
        const res = await request(app).get('/api/staff-payroll/practice-dates').expect(200);
        expect(res.body.data.cycle_size).toBe(8);
        expect(res.body.data.practice_days).toEqual(['Sabtu', 'Minggu']);
        expect(res.body.data.latest_cycle).toEqual(DUTY_DATES.slice(0, 8).sort());
        expect(res.body.data.cycle_complete).toBe(true);
        expect(bookingQueries[0].sql).toContain('DAYOFWEEK(appointment_date) - 1');
        expect(bookingQueries[0].params).toEqual(expect.arrayContaining(['confirmed', 'completed', 6, 0]));
    });

    test('next cycle starts after the last payroll batch and reports when incomplete', async () => {
        lastEnd = '2026-10-18';
        const res = await request(app).get('/api/staff-payroll/practice-dates').expect(200);
        expect(res.body.data.last_cycle_end).toBe('2026-10-18');
        expect(res.body.data.latest_cycle).toEqual(['2026-10-24', '2026-10-25', '2026-10-31', '2026-11-01']);
        expect(res.body.data.cycle_complete).toBe(false);
    });

    test('Sunday-only booking keeps the original 4-date cycle', async () => {
        getSessionSettings.mockResolvedValue([SUNDAY_AND_SATURDAY[0]]);
        const res = await request(app).get('/api/staff-payroll/practice-dates').expect(200);
        expect(res.body.data.cycle_size).toBe(4);
        expect(res.body.data.latest_cycle).toHaveLength(4);
    });

    test('creating a draft accepts 8 dates and snapshots rates + allowance', async () => {
        const practiceDates = DUTY_DATES.slice(0, 8);
        const inserts = [];
        const connection = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            query: jest.fn(async (sql, params) => {
                if (sql.includes('SELECT id FROM staff_payroll_batches')) return [[]];
                if (sql.includes('FROM users u')) {
                    return [[
                        { staff_id: 'S1', name: 'Urfi', role_name: 'bidan', role_display: 'Bidan' },
                        { staff_id: 'S2', name: 'Lain', role_name: 'bidan', role_display: 'Bidan' }
                    ]];
                }
                if (sql.includes('FROM staff_duty_logs')) {
                    expect(params).toHaveLength(8);
                    return [[
                        { staff_id: 'S1', duty_date: '2026-11-01' },
                        { staff_id: 'S1', duty_date: '2026-10-31' },
                        { staff_id: 'S2', duty_date: '2026-11-01' }
                    ]];
                }
                if (sql.includes('FROM staff_payroll_settings')) {
                    return [[{ base_amount: 160000, additional_rate: 110000 }]];
                }
                if (sql.includes('FROM staff_payroll_allowances')) {
                    return [[{ staff_id: 'S1', label: 'Stok Obat', amount: 100000, is_active: 1, staff_name: 'Urfi' }]];
                }
                if (sql.includes('INSERT INTO staff_payroll_batches')) {
                    inserts.push({ type: 'batch', params });
                    return [{ insertId: 77 }];
                }
                if (sql.includes('INSERT INTO staff_payroll_items')) {
                    inserts.push({ type: 'item', params });
                    return [{}];
                }
                if (sql.includes('FROM staff_payroll_batches') && sql.includes('WHERE id = ?')) {
                    return [[{ id: 77, practice_dates_json: JSON.stringify(practiceDates.slice().sort()), base_rate: 160000, additional_rate: 110000, status: 'draft' }]];
                }
                return [[]];
            })
        };
        db.getConnection.mockResolvedValue(connection);

        const res = await request(app)
            .post('/api/staff-payroll/batches')
            .send({ practice_dates: practiceDates, payroll_date: '2026-11-04' })
            .expect(201);

        const batchInsert = inserts.find(i => i.type === 'batch');
        expect(batchInsert.params).toEqual(expect.arrayContaining([160000, 110000]));
        const items = inserts.filter(i => i.type === 'item').map(i => i.params);
        // [batch, staff, name, role, display, dates, count, base, addCount, addAmount, allowLabel, allowAmount, adj, total]
        const urfi = items.find(p => p[1] === 'S1');
        expect(urfi.slice(6)).toEqual([2, 160000, 1, 110000, 'Stok Obat', 100000, 0, 370000]);
        const other = items.find(p => p[1] === 'S2');
        expect(other.slice(6)).toEqual([1, 160000, 0, 0, null, 0, 0, 160000]);
        expect(res.body.data.base_rate).toBe(160000);
    });

    function draftConnection({ allowances, updates }) {
        const dates = ['2026-10-31', '2026-11-01'];
        return {
            dates,
            connection: {
                beginTransaction: jest.fn(),
                commit: jest.fn(),
                rollback: jest.fn(),
                release: jest.fn(),
                query: jest.fn(async (sql, params) => {
                    if (sql.includes('FROM staff_payroll_batches') && sql.includes('WHERE id = ?')) {
                        return [[{ id: 8, practice_dates_json: JSON.stringify(dates), base_rate: 150000, additional_rate: 100000, status: 'draft' }]];
                    }
                    if (sql.includes('FROM staff_payroll_items')) {
                        // Draft dibuat sebelum tunjangan diisi: snapshot item masih 0.
                        return [[{ staff_id: 'S1', staff_name: 'Liza', attendance_dates_json: '[]', attendance_count: 0, allowance_label: null, allowance_amount: 0, adjustment_amount: 0 }]];
                    }
                    if (sql.includes('FROM staff_payroll_allowances')) return [allowances];
                    if (sql.includes('UPDATE staff_payroll_items')) {
                        updates.push(params);
                        return [{}];
                    }
                    if (sql.includes('SUM(total_amount)')) return [[{ total_amount: 0 }]];
                    if (sql.includes('staff_payroll_settings')) throw new Error('must not read current settings');
                    return [{}];
                })
            }
        };
    }

    test('saving a draft applies allowances added after the draft was created, with snapshot rates', async () => {
        const updates = [];
        const { dates, connection } = draftConnection({
            allowances: [{ staff_id: 'S1', label: 'Penjadwalan Pasien', amount: 100000, is_active: 1 }],
            updates
        });
        db.getConnection.mockResolvedValue(connection);

        await request(app)
            .put('/api/staff-payroll/batches/8')
            .send({ items: [{ staff_id: 'S1', attendance_dates: dates, adjustment_amount: 25000 }] })
            .expect(200);

        // [dates, count, base, addCount, addAmount, allowLabel, allowAmount, adj, total, notes, batch, staff]
        expect(updates[0].slice(1, 9)).toEqual([2, 150000, 1, 100000, 'Penjadwalan Pasien', 100000, 25000, 375000]);
    });

    test('removing an allowance clears it from the open draft on save', async () => {
        const updates = [];
        const { dates, connection } = draftConnection({ allowances: [], updates });
        db.getConnection.mockResolvedValue(connection);

        await request(app)
            .put('/api/staff-payroll/batches/8')
            .send({ items: [{ staff_id: 'S1', attendance_dates: dates, adjustment_amount: 0 }] })
            .expect(200);

        expect(updates[0].slice(5, 9)).toEqual([null, 0, 0, 250000]);
    });

    test('loading a draft shows current allowances and flags that it needs saving', async () => {
        db.query.mockImplementation(async sql => {
            if (sql.includes('FROM staff_payroll_batches')) {
                return [[{ id: 8, practice_dates_json: '["2026-11-01"]', base_rate: 150000, additional_rate: 100000, status: 'draft' }]];
            }
            if (sql.includes('FROM staff_payroll_items')) {
                return [[{ staff_id: 'S1', staff_name: 'Liza', attendance_dates_json: '["2026-11-01"]', attendance_count: 1, allowance_label: null, allowance_amount: 0, total_amount: 150000 }]];
            }
            if (sql.includes('FROM staff_payroll_allowances')) {
                return [[{ staff_id: 'S1', label: 'Penjadwalan Pasien', amount: 100000, is_active: 1 }]];
            }
            return [[]];
        });

        const res = await request(app).get('/api/staff-payroll/batches/8').expect(200);
        expect(res.body.data.allowances_changed).toBe(true);
        expect(res.body.data.items[0]).toMatchObject({ allowance_label: 'Penjadwalan Pasien', allowance_amount: 100000, allowance_paid: 100000 });
    });

    test('finalized batches keep their stored allowance snapshot', async () => {
        db.query.mockImplementation(async sql => {
            if (sql.includes('FROM staff_payroll_batches')) {
                return [[{ id: 6, practice_dates_json: '["2026-10-04"]', status: 'finalized' }]];
            }
            if (sql.includes('FROM staff_payroll_items')) {
                return [[{ staff_id: 'S1', attendance_dates_json: '["2026-10-04"]', attendance_count: 1, allowance_label: null, allowance_amount: 0, total_amount: 150000 }]];
            }
            if (sql.includes('FROM staff_payroll_allowances')) throw new Error('finalized batch must not read current allowances');
            return [[]];
        });

        const res = await request(app).get('/api/staff-payroll/batches/6').expect(200);
        expect(res.body.data.allowances_changed).toBe(false);
        expect(res.body.data.items[0].allowance_paid).toBe(0);
    });

    test('rejects an empty cycle', async () => {
        const res = await request(app)
            .post('/api/staff-payroll/batches')
            .send({ practice_dates: [] })
            .expect(400);
        expect(res.body.message).toMatch(/minimal berisi 1/);
    });
});
