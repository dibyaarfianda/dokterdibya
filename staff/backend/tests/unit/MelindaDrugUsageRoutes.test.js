'use strict';

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => next(),
    requirePermission: jest.fn(() => (req, res, next) => next())
}));

const express = require('express');
const ExcelJS = require('exceljs');
const request = require('supertest');
const pool = require('../../db');
const { requirePermission } = require('../../middleware/auth');
const router = require('../../routes/melinda-drug-usage');
const { SOURCE_POLICIES, STAFF_NAVIGATION_MAP } = require('../../config/accessControlRegistry');
const { MENU_ACTIVITY_SOURCES } = require('../../config/menu-activity-sources');

const permissionsAtLoad = requirePermission.mock.calls.map(call => call[0]);
const app = express();
app.use('/api/melinda-drug-usage', router);

const ITEM = {
    item_key: 'infus rl', item_code: 'B1', item_name: 'Infus RL', item_type: 'obat',
    qty: '817.00', value_idr: '7214110.00', inacbg_qty: '0.00', inacbg_value_idr: '0.00',
    hari23_qty: '0.00', hari23_value_idr: '0.00', duk_qty: '0.00', duk_value_idr: '0.00'
};

function stubDb({ periods = ['2026-11', '2026-10'], lastRun = { status: 'success' }, success = { last_success: new Date(2026, 10, 23, 2), age_hours: 1 }, items = [ITEM] } = {}) {
    pool.query.mockImplementation(async sql => {
        if (sql.includes('DISTINCT period')) return [periods.map(period => ({ period }))];
        if (sql.includes('ORDER BY id DESC')) return [lastRun ? [lastRun] : []];
        if (sql.includes('MAX(finished_at)')) return [[success]];
        if (sql.includes('FROM melinda_drug_usage')) return [items];
        throw new Error(`Unexpected SQL: ${sql}`);
    });
}

const itemQuery = () => pool.query.mock.calls.find(([sql]) => sql.includes('GROUP BY item_key'));

describe('Pengeluaran Obat RS API', () => {
    beforeEach(() => pool.query.mockReset());

    test('both routes require integrations.view and the page is registered', () => {
        expect(permissionsAtLoad).toEqual(['integrations.view', 'integrations.view']);
        expect(SOURCE_POLICIES['melinda-drug-usage'].view).toBe('integrations.view');
        expect(SOURCE_POLICIES['melinda-drug-usage'].specials.export).toBe('integrations.view');
        expect(STAFF_NAVIGATION_MAP['nav-melinda-drug-usage']).toBe('integrations.view');
        expect(MENU_ACTIVITY_SOURCES['nav-melinda-drug-usage']).toEqual([{ table: 'melinda_drug_usage_reports', columns: ['synced_at'] }]);
    });

    test('defaults to the newest month and aggregates all depots', async () => {
        stubDb();
        const response = await request(app).get('/api/melinda-drug-usage');
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body.data.filters).toEqual({ period: '2026-11', depot: 'all', type: 'all' });
        expect(response.body.data.items[0]).toMatchObject({ item_name: 'Infus RL', qty: 817, value_idr: 7214110 });
        expect(response.body.data.totals).toMatchObject({ item_count: 1, qty: 817, value_idr: 7214110 });
        expect(itemQuery()[1]).toEqual(['2026-11']);
    });

    test('applies depot and item type filters as parameters', async () => {
        stubDb();
        await request(app).get('/api/melinda-drug-usage?period=2026-10&depot=depo-ok&type=alkes');
        expect(itemQuery()[0]).toContain('depot = ?');
        expect(itemQuery()[0]).toContain('item_type = ?');
        expect(itemQuery()[1]).toEqual(['2026-10', 'depo-ok', 'alkes']);
    });

    test.each([
        ['period=2026-13'],
        ['depot=depo-lain'],
        ['type=semua'],
        ['depot=all%27%20OR%201=1']
    ])('rejects the invalid filter %s', async query => {
        const response = await request(app).get(`/api/melinda-drug-usage?${query}`);
        expect(response.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('returns an empty page before the first sync', async () => {
        stubDb({ periods: [], lastRun: null, success: { last_success: null, age_hours: null } });
        const response = await request(app).get('/api/melinda-drug-usage');
        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
        expect(response.body.data.freshness.warning).toContain('belum pernah');
        expect((await request(app).get('/api/melinda-drug-usage/export')).status).toBe(404);
    });

    test('warns after a failed run and after 36 hours', async () => {
        stubDb({ lastRun: { status: 'failed' } });
        expect((await request(app).get('/api/melinda-drug-usage')).body.data.freshness.warning).toContain('tidak selesai');
        stubDb({ success: { last_success: new Date(2026, 10, 21), age_hours: 36 } });
        expect((await request(app).get('/api/melinda-drug-usage')).body.data.freshness.warning).toContain('36 jam');
        stubDb({ success: { last_success: new Date(2026, 10, 22), age_hours: 35 } });
        expect((await request(app).get('/api/melinda-drug-usage')).body.data.freshness.warning).toBeNull();
    });

    test('exports Excel with Nilai Laporan and no patient columns', async () => {
        stubDb();
        const response = await request(app)
            .get('/api/melinda-drug-usage/export?period=2026-11&depot=depo-rawat-inap&type=obat')
            .buffer(true)
            .parse((res, done) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => done(null, Buffer.concat(chunks)));
            });
        expect(response.status).toBe(200);
        expect(response.headers['content-disposition']).toContain('pengeluaran-obat-rs-2026-11-depo-rawat-inap-obat.xlsx');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(response.body);
        const sheet = workbook.worksheets[0];
        expect(sheet.getCell('A2').value).toBe('Periode 2026-11 | Depo Rawat Inap | Obat');
        expect(sheet.getCell('F5').value).toBe('Nilai Laporan (Rp)');
        expect(sheet.getCell('C6').value).toBe('Infus RL');
        expect(sheet.getCell('F6').value).toBe(7214110);
        expect(sheet.getCell('A7').value).toBe('TOTAL');
        expect(JSON.stringify(sheet.getRow(5).values)).not.toMatch(/pasien|rm|nik/i);
    });
});
