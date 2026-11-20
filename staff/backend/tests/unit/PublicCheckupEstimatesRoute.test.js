'use strict';

const express = require('express');
const request = require('supertest');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { createPublicCheckupEstimatesRouter } = require('../../routes/public-checkup-estimates');

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function buildApp(estimates) {
    const app = express();
    app.use('/api/public/checkup-estimates', createPublicCheckupEstimatesRouter({ estimates, logger }));
    return app;
}

const READY = {
    id: 5, code: 'pkg_5', name: 'Paket Kehamilan', description: null, category: 'obstetri', week_min: 20, week_max: 24, sort_order: 10, is_active: true,
    ready: true, amount_idr: 115000, raw_total: 115000,
    issues: [], items: [{ item_type: 'tindakan', ref_id: 1, name: 'Biaya Admin', unit_price: 15000, quantity: 1, subtotal: 15000 }]
};
const NOT_READY = { id: 6, code: 'pkg_6', name: 'Paket Hamil', category: 'gyn_repro', week_min: null, week_max: null, sort_order: 20, is_active: true, ready: false, amount_idr: null, raw_total: null, issues: ['Tindakan 99: harga belum tersedia'], items: [] };

describe('public checkup estimates', () => {
    test('needs no login, is never cached and lists ready categories only', async () => {
        const estimates = { priceAll: jest.fn().mockResolvedValue({ packages: [READY, NOT_READY], priced_at: new Date('2026-11-18T03:00:00Z') }) };
        const res = await request(buildApp(estimates)).get('/api/public/checkup-estimates');

        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toMatch(/no-store/);
        expect(res.body.categories).toEqual([
            { code: 'pkg_5', name: 'Paket Kehamilan', label: 'Paket Kehamilan', category: 'obstetri', week_min: 20, week_max: 24, sort_order: 10, ready: true, amount_idr: 115000, items: [{ name: 'Biaya Admin', quantity: 1, subtotal_idr: 15000 }] }
        ]);
        expect(estimates.priceAll).toHaveBeenCalledWith();
    });

    test('never exposes tindakan ids, codes or configuration problems', async () => {
        const estimates = { priceAll: jest.fn().mockResolvedValue({ packages: [READY, NOT_READY], priced_at: new Date() }) };
        const res = await request(buildApp(estimates)).get('/api/public/checkup-estimates');
        const body = JSON.stringify(res.body);
        expect(body).not.toMatch(/tindakan_id|ref_id|"id"|harga belum tersedia|issues|raw_total/);
    });

    test('answers 503 with an empty list when pricing fails', async () => {
        const estimates = { priceAll: jest.fn().mockRejectedValue(new Error("Table 'dibyaklinik.tindakan' doesn't exist")) };
        const res = await request(buildApp(estimates)).get('/api/public/checkup-estimates');
        expect(res.status).toBe(503);
        expect(res.body.categories).toEqual([]);
        expect(JSON.stringify(res.body)).not.toMatch(/dibyaklinik|tindakan/);
    });
});
