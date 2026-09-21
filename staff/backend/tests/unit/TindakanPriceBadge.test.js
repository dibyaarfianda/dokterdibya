const fs = require('fs');
const vm = require('vm');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => next(),
    requireSuperadmin: (req, res, next) => next()
}));
jest.mock('../../utils/pdf-generator', () => ({}));
const db = require('../../db');
const app = express();
app.use(express.json(), require('../../routes/02-tindakan-api'));

describe('tindakan price change API', () => {
    test('returns previous price, direction, expiry and server time', async () => {
        db.query.mockResolvedValue([[{
            id: 6, price: '140000.00', previous_price: '110000.00',
            price_changed_at: new Date('2026-09-22T03:00:00Z')
        }]]);
        const res = await request(app).get('/api/tindakan');
        expect(res.status).toBe(200);
        expect(res.body.server_time).toEqual(expect.any(Number));
        expect(res.body.data[0].price_change).toEqual({
            direction: 'up', previous_price: 110000,
            changed_at: 1790046000000, expires_at: 1790305200000
        });
    });

    test.each([
        [110000, 140000, true], [140000, 110000, true], [140000, 140000, false]
    ])('saving %s to %s only records actual price changes', async (oldPrice, price, changed) => {
        const connection = {
            beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
            query: jest.fn().mockResolvedValueOnce([[{ id: 6, price: String(oldPrice) }]])
                .mockResolvedValue([{ affectedRows: 1 }])
        };
        db.getConnection.mockResolvedValue(connection);
        db.query.mockResolvedValue([[{ id: 6, price: String(oldPrice) }]]);
        const res = await request(app).put('/api/tindakan/6')
            .send({ name: 'USG 2 Dimensi', category: 'LAYANAN', price });
        expect(res.status).toBe(200);
        expect(connection.beginTransaction).toHaveBeenCalled();
        expect(connection.query.mock.calls[0][0]).toMatch(/FOR UPDATE/i);
        const update = connection.query.mock.calls.find(([sql]) => /^UPDATE/i.test(sql));
        expect(update).toBeDefined();
        expect(update[0].includes('previous_price')).toBe(changed);
        expect(update[0].includes('price_changed_at')).toBe(changed);
        if (changed) expect(update[1]).toContain(oldPrice);
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });

    test('failed update rolls back and releases the row lock', async () => {
        const connection = {
            beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
            query: jest.fn().mockResolvedValueOnce([[{ id: 6, price: '110000' }]])
                .mockRejectedValueOnce(new Error('database failure'))
        };
        db.getConnection.mockResolvedValue(connection);
        const res = await request(app).put('/api/tindakan/6')
            .send({ name: 'USG', category: 'LAYANAN', price: 140000 });
        expect(res.status).toBe(500);
        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });
});

describe('staff price badge rendering', () => {
    let context;
    let body;
    beforeEach(() => {
        jest.useFakeTimers();
        body = { innerHTML: '', querySelectorAll: () => [] };
        context = vm.createContext({
            console, Date, performance: { now: () => Date.now() }, setTimeout, clearTimeout,
            window: { location: { hostname: 'example.test', origin: 'https://example.test' } },
            document: { getElementById: id => id === 'tindakan-list-body' ? body : null,
                addEventListener: jest.fn() },
            getIdToken: async () => 'test',
            fetch: async () => ({ ok: true, json: async () => ({ success: true,
                server_time: 1790046000000,
                data: [{ id: 6, name: 'USG', category: 'LAYANAN', price: 140000,
                    price_change: { direction: 'up', previous_price: 110000,
                        changed_at: 1790046000000, expires_at: 1790305200000 } }]
            }) }),
            showError: jest.fn()
        });
        const source = fs.readFileSync(path.join(__dirname, '../../../public/scripts/kelola-tindakan.js'), 'utf8')
            .replace(/^import .*;\r?\n/gm, '').replace(/export function /g, 'function ');
        vm.runInContext(source, context);
    });
    afterEach(() => jest.useRealTimers());

    test('load uses server time even when device time is wrong, and preserves metadata', async () => {
        jest.setSystemTime(new Date('2030-01-01'));
        await vm.runInContext('loadServices()', context);
        expect(body.innerHTML).toContain('↑ Naik');
        expect(body.innerHTML).toContain('110.000');
        expect(body.innerHTML).toContain('140.000');
    });

    test('badge disappears at exactly 72 hours without a reload', async () => {
        await vm.runInContext('loadServices()', context);
        const remove = jest.fn();
        body.querySelectorAll = () => [{ dataset: { priceExpiresAt: '1790305200000' }, remove }];
        jest.advanceTimersByTime(259199999);
        expect(remove).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(remove).toHaveBeenCalledTimes(1);
    });

    test('decreases render down, unchanged and expired prices have no badge', async () => {
        await vm.runInContext('loadServices()', context);
        vm.runInContext(`renderServiceTable([{id: 6, price: 100000, price_change: {
            direction: 'down', previous_price: 140000, expires_at: 1790305200000}}])`, context);
        expect(body.innerHTML).toContain('↓ Turun');
        vm.runInContext('renderServiceTable([{id: 6, price: 100000}])', context);
        expect(body.innerHTML).not.toContain('price-badge');
        jest.advanceTimersByTime(259200000);
        vm.runInContext('renderServiceTable(allServices)', context);
        expect(body.innerHTML).not.toContain('↑ Naik');
    });
});
