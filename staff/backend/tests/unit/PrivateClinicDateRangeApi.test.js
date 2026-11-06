jest.mock('../../db', () => ({
    query: jest.fn()
}));

jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => {
        req.user = { id: 'staff-1', role: 'dokter', role_id: 1 };
        next();
    },
    requirePermission: () => (req, res, next) => next()
}));

const express = require('express');
const request = require('supertest');
const db = require('../../db');

function makeApp() {
    const app = express();
    app.use('/api/analytics', require('../../routes/analytics'));
    return app;
}

function mockFinanceQueries() {
    db.query.mockImplementation(async sql => {
        if (sql.includes('COUNT(DISTINCT b.id) as total_kunjungan')) {
            return [[{
                total_kunjungan: 4,
                total_hari_kerja: 2,
                pendapatan_kotor: 2000000,
                pendapatan_tindakan: 1500000,
                pendapatan_obat: 500000
            }]];
        }
        if (sql.includes('as total_hpp')) return [[{ total_hpp: 200000 }]];
        if (sql.includes('FROM staff_payroll_batches') && !sql.includes('staff_payroll_items')) {
            return [[{ batch_count: 1, total_gaji: 300000 }]];
        }
        if (sql.includes('FROM staff_driver_payrolls')) {
            return [[
                { payroll_month: '2026-10', clinic_amount: 620000 },
                { payroll_month: '2026-11', clinic_amount: 600000 }
            ]];
        }
        if (sql.includes('FROM staff_payroll_items')) {
            return [[{ item_count: 3, paid_staff_count: 3, total_kehadiran: 6 }]];
        }
        return [[]];
    });
}

describe('finance analysis page shared date range filter', () => {
    const fs = require('fs');
    const path = require('path');
    const publicDir = path.resolve(__dirname, '..', '..', '..', 'public');
    const read = file => fs.readFileSync(path.join(publicDir, file), 'utf8');

    test('offers Dari tanggal / Sampai tanggal inputs and sends the same range to both profit cards', () => {
        const fragment = read('fragments/pages/finance-analysis-page.html');
        const script = read('scripts/pages/finance-analysis-page.js');

        expect(fragment).toContain('id="finance-start-date"');
        expect(fragment).toContain('id="finance-end-date"');
        expect(fragment).toContain('id="finance-range-month"');
        expect(fragment).toContain('Terapkan');
        expect(fragment).not.toContain('Analisis Profit Obat (Bulan Ini)');
        expect(script).toContain('/api/inventory/profit?${periodQuery}');
        expect(script).toContain('/api/analytics/private-clinic?${financePeriodQuery()}');
        expect(script).not.toContain('private-clinic?month=');
    });
});

describe('GET /api/analytics/private-clinic date range', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFinanceQueries();
    });

    test('filters every query by the inclusive range and prorates driver payroll per day', async () => {
        const res = await request(makeApp())
            .get('/api/analytics/private-clinic')
            .query({ start_date: '2026-10-15', end_date: '2026-11-10' });

        expect(res.status).toBe(200);

        const calls = db.query.mock.calls;
        const billingCalls = calls.filter(([sql]) => sql.includes('sunday_clinic_billings'));
        expect(billingCalls).toHaveLength(5);
        billingCalls.forEach(([, params]) => expect(params).toEqual(['2026-10-15', '2026-11-11']));

        const staffPayroll = calls.find(([sql]) => sql.includes('FROM staff_payroll_batches') && !sql.includes('staff_payroll_items'));
        expect(staffPayroll[1]).toEqual(['2026-10-15', '2026-11-11']);

        const driverPayroll = calls.find(([sql]) => sql.includes('FROM staff_driver_payrolls'));
        expect(driverPayroll[1]).toEqual(['2026-10-01', '2026-11-11']);

        const data = res.body.data;
        // October 15..31 = 17/31 of 620.000; November 1..10 = 10/30 of 600.000.
        const expectedDriver = Math.round(620000 * 17 / 31) + 200000;
        expect(data.period).toEqual({ month: null, startDate: '2026-10-15', endDate: '2026-11-10', totalDays: 27 });
        expect(data.staffCost.totalGajiSupir).toBe(expectedDriver);
        expect(data.staffCost.driverProrated).toBe(true);
        expect(data.staffCost.driverPayrollCount).toBe(2);
        expect(data.staffCost.driverMonths.map(m => [m.month, m.days, m.daysInMonth])).toEqual([
            ['2026-10', 17, 31],
            ['2026-11', 10, 30]
        ]);
        expect(data.summary.labaKotor).toBe(1800000);
        expect(data.netProfit.labaBersih).toBe(1800000 - 300000 - expectedDriver);
    });

    test('keeps the legacy month filter as a full-month range without prorating', async () => {
        db.query.mockImplementation(async sql => {
            if (sql.includes('FROM staff_driver_payrolls')) return [[{ payroll_month: '2026-11', clinic_amount: 600000 }]];
            if (sql.includes('COUNT(DISTINCT b.id)')) return [[{ total_kunjungan: 0, total_hari_kerja: 0, pendapatan_kotor: 0 }]];
            if (sql.includes('as total_hpp')) return [[{ total_hpp: 0 }]];
            return [[]];
        });

        const res = await request(makeApp()).get('/api/analytics/private-clinic').query({ month: '2026-11' });

        expect(res.status).toBe(200);
        expect(res.body.data.period).toEqual({ month: '2026-11', startDate: '2026-11-01', endDate: '2026-11-30', totalDays: 30 });
        expect(res.body.data.staffCost.totalGajiSupir).toBe(600000);
        expect(res.body.data.staffCost.driverProrated).toBe(false);
        const driverPayroll = db.query.mock.calls.find(([sql]) => sql.includes('FROM staff_driver_payrolls'));
        expect(driverPayroll[1]).toEqual(['2026-11-01', '2026-12-01']);
    });

    test.each([
        [{ start_date: '2026-11-20', end_date: '2026-11-10' }],
        [{ start_date: '2026-11-10' }],
        [{ start_date: '2026-02-30', end_date: '2026-03-02' }]
    ])('rejects an invalid range %j without touching the database', async query => {
        const res = await request(makeApp()).get('/api/analytics/private-clinic').query(query);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(db.query).not.toHaveBeenCalled();
    });
});
