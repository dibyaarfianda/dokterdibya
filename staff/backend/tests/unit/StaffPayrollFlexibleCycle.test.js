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

// 8 most recent practice dates (4 weeks of Saturday + Sunday), newest first.
const DUTY_DATES = [
    '2026-11-01', '2026-10-31', '2026-10-25', '2026-10-24',
    '2026-10-18', '2026-10-17', '2026-10-11', '2026-10-10',
    '2026-10-04', '2026-10-03'
];

describe('staff payroll cycle follows booking practice days', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getSessionSettings.mockResolvedValue(SUNDAY_AND_SATURDAY);
        db.query.mockImplementation(async (sql, params) => {
            if (sql.includes('FROM staff_duty_logs')) {
                return [DUTY_DATES.slice(0, params[0]).map(d => ({ duty_date: d }))];
            }
            return [[]];
        });
    });

    test('Sunday + Saturday sessions produce an 8-date cycle', async () => {
        const res = await request(app).get('/api/staff-payroll/practice-dates').expect(200);
        expect(res.body.data.cycle_size).toBe(8);
        expect(res.body.data.practice_days).toEqual(['Sabtu', 'Minggu']);
        expect(res.body.data.latest_cycle).toEqual(DUTY_DATES.slice(0, 8).sort());
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

    test('saving a draft recalculates with the batch snapshot rates, not current settings', async () => {
        const dates = ['2026-10-31', '2026-11-01'];
        const updates = [];
        const connection = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            query: jest.fn(async (sql, params) => {
                if (sql.includes('FROM staff_payroll_batches') && sql.includes('WHERE id = ?')) {
                    return [[{ id: 5, practice_dates_json: JSON.stringify(dates), base_rate: 150000, additional_rate: 100000, status: 'draft' }]];
                }
                if (sql.includes('FROM staff_payroll_items')) {
                    return [[{ staff_id: 'S1', staff_name: 'Liza', attendance_dates_json: '[]', attendance_count: 0, allowance_label: 'HR', allowance_amount: 100000, adjustment_amount: 0 }]];
                }
                if (sql.includes('UPDATE staff_payroll_items')) {
                    updates.push(params);
                    return [{}];
                }
                if (sql.includes('SUM(total_amount)')) return [[{ total_amount: 350000 }]];
                if (sql.includes('staff_payroll_settings')) throw new Error('must not read current settings');
                return [{}];
            })
        };
        db.getConnection.mockResolvedValue(connection);

        await request(app)
            .put('/api/staff-payroll/batches/5')
            .send({ items: [{ staff_id: 'S1', attendance_dates: dates, adjustment_amount: 0 }] })
            .expect(200);

        // [dates, count, base, addCount, addAmount, adj, total, notes, batch, staff]
        expect(updates[0].slice(1, 7)).toEqual([2, 150000, 1, 100000, 0, 350000]);
    });

    test('rejects an empty cycle', async () => {
        const res = await request(app)
            .post('/api/staff-payroll/batches')
            .send({ practice_dates: [] })
            .expect(400);
        expect(res.body.message).toMatch(/minimal berisi 1/);
    });
});
