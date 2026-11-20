'use strict';

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { createCheckupPrepayService, ORDER_TYPE } = require('../../services/CheckupPrepayService');

const T0 = new Date('2026-11-18T10:00:00+07:00');
const PATIENT = { id: 'P2026001', email: 'uji@example.com', name: 'AKUN UJI DUITKU', phone: '081234567890' };

const PAYMENT_METHODS = {
    qris: { code: 'NQ', type: 'qris', label: 'QRIS' },
    va_bni: { code: 'I1', type: 'va', label: 'VA BNI' }
};

function estimate(overrides = {}) {
    return {
        code: 'obstetri',
        name: 'Kehamilan (Obstetri)',
        label: 'Kehamilan (Obstetri)',
        category: 'obstetri',
        is_active: true,
        ready: true,
        amount_idr: 115000,
        raw_total: 115000,
        issues: [],
        items: [{ tindakan_id: 1, code: 'ADM', name: 'Biaya Admin', unit_price: 15000, quantity: 1, subtotal: 15000 }],
        ...overrides
    };
}

function fakeDb() {
    const state = { orders: [], events: [] };
    let nextId = 1;
    const db = {
        query: jest.fn(async (sqlText, params = []) => {
            const sql = sqlText.replace(/\s+/g, ' ').trim();
            if (/^SELECT \* FROM payment_orders WHERE patient_id = \? AND status = 'pending' AND expires_at > \?/.test(sql)) {
                return [state.orders.filter(o => o.patient_id === params[0] && o.status === 'pending' && o.expires_at > params[1])];
            }
            if (/^INSERT INTO payment_orders \(order_ref, order_type, product_code, patient_id, amount_idr, payment_method, gateway_mode, status, expires_at, item_snapshot\)/.test(sql)) {
                const [orderRef, orderType, productCode, patientId, amount, method, mode, expiresAt, snapshot] = params;
                state.orders.push({ id: nextId++, order_ref: orderRef, order_type: orderType, product_code: productCode, patient_id: patientId, amount_idr: amount, payment_method: method, gateway_mode: mode, status: 'pending', expires_at: expiresAt, item_snapshot: snapshot, created_at: new Date(T0.getTime() + nextId) });
                return [{}];
            }
            if (/^UPDATE payment_orders SET status = 'failed' WHERE order_ref = \?/.test(sql)) {
                state.orders.filter(o => o.order_ref === params[0]).forEach(o => { o.status = 'failed'; });
                return [{}];
            }
            if (/^UPDATE payment_orders SET gateway_reference = \?/.test(sql)) {
                Object.assign(state.orders.find(o => o.order_ref === params[4]), { gateway_reference: params[0], va_number: params[1], qr_string: params[2], payment_url: params[3] });
                return [{}];
            }
            if (/^SELECT \* FROM payment_orders WHERE order_ref = \? LIMIT 1/.test(sql)) {
                return [state.orders.filter(o => o.order_ref === params[0])];
            }
            if (/^SELECT \* FROM payment_orders WHERE order_ref = \? AND patient_id = \? AND order_type = \? LIMIT 1/.test(sql)) {
                return [state.orders.filter(o => o.order_ref === params[0] && o.patient_id === params[1] && o.order_type === params[2])];
            }
            if (/^SELECT \* FROM payment_orders WHERE patient_id = \? AND order_type = \? ORDER BY created_at DESC LIMIT 5/.test(sql)) {
                return [state.orders.filter(o => o.patient_id === params[0] && o.order_type === params[1])];
            }
            if (/^INSERT INTO premium_payment_events/.test(sql)) {
                state.events.push({ order_ref: params[0], event_type: params[2], detail: params[3] ? JSON.parse(params[3]) : null });
                return [{}];
            }
            throw new Error(`unexpected SQL: ${sql}`);
        })
    };
    return { db, state };
}

function setup({ configured = true, production = false, live = false, reviewer = true, category = estimate(), ledger: ledgerOverrides = {} } = {}) {
    const fake = fakeDb();
    const duitku = {
        PAYMENT_METHODS,
        isConfigured: jest.fn(() => configured),
        isProduction: jest.fn(() => production),
        createTransaction: jest.fn(async ({ methodCode }) => ({
            reference: 'DS-PRE-1',
            vaNumber: methodCode === 'NQ' ? null : '8888000011112222',
            qrString: methodCode === 'NQ' ? '000201...' : null,
            paymentUrl: 'https://pay.example/x'
        }))
    };
    const estimates = {
        pricePackageByCode: jest.fn(async code => (category && category.code === code ? category : null)),
        priceAll: jest.fn(async () => ({ packages: [category, estimate({ code: 'gyn_repro', name: 'Program Hamil (Reproduksi)', label: 'Program Hamil (Reproduksi)', ready: false, amount_idr: null, items: [] })] }))
    };
    const reviewAccounts = { isActiveReviewPatient: jest.fn(async () => reviewer) };
    const ledger = {
        getBalances: jest.fn(async () => [{ category: 'obstetri', gateway_mode: 'sandbox', balance_idr: 115000 }]),
        getPendingRefundHold: jest.fn(async () => 0),
        hasSaldoHistory: jest.fn(async () => false),
        ...ledgerOverrides
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    let counter = 0;
    const service = createCheckupPrepayService({
        db: fake.db,
        duitku,
        estimates,
        reviewAccounts,
        ledger,
        logger,
        env: { CHECKUP_PREPAY_LIVE: live ? 'true' : 'false', PATIENT_PORTAL_ORIGIN: 'https://sisiwanita.id/' },
        clock: () => T0,
        uuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
    });
    return { service, fake, duitku, estimates, reviewAccounts, ledger };
}

describe('getAvailability', () => {
    test.each([
        ['gateway not configured', { configured: false }, { available: false, mode: null, reason: 'gateway_not_configured' }],
        ['sandbox, active review account', { reviewer: true }, { available: true, mode: 'sandbox', reason: null }],
        ['sandbox, any other patient', { reviewer: false }, { available: false, mode: 'sandbox', reason: 'review_only' }],
        ['production before CHECKUP_PREPAY_LIVE', { production: true, live: false }, { available: false, mode: 'live', reason: 'not_open_yet' }],
        ['production with CHECKUP_PREPAY_LIVE', { production: true, live: true }, { available: true, mode: 'live', reason: null }]
    ])('%s', async (_name, options, expected) => {
        const { service } = setup(options);
        await expect(service.getAvailability('P2026001')).resolves.toEqual(expected);
    });

    test('production never asks the review-account table', async () => {
        const { service, reviewAccounts } = setup({ production: true, live: true });
        await service.getAvailability('P2026001');
        expect(reviewAccounts.isActiveReviewPatient).not.toHaveBeenCalled();
    });

    test('a missing review-account dependency keeps sandbox checkout closed', async () => {
        const fake = fakeDb();
        const service = createCheckupPrepayService({
            db: fake.db,
            duitku: { PAYMENT_METHODS, isConfigured: () => true, isProduction: () => false },
            estimates: {},
            ledger: {},
            logger: { error: jest.fn() }
        });
        await expect(service.getAvailability('P1')).resolves.toMatchObject({ available: false, reason: 'review_only' });
    });
});

describe('createOrder', () => {
    test('prices the order on the server and stores a sandbox checkup_prepay order', async () => {
        const { service, fake, duitku } = setup();
        const order = await service.createOrder({ patient: PATIENT, category: 'obstetri', paymentMethod: 'qris' });

        const ref = 'DPK-00000000-0000-4000-8000-000000000001';
        expect(ref.length).toBeLessThanOrEqual(50);
        expect(duitku.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
            orderRef: ref,
            amount: 115000,
            methodCode: 'NQ',
            expiryMinutes: 60,
            productDetails: 'Estimasi kunjungan Klinik Privat - Kehamilan (Obstetri)',
            returnUrl: `https://sisiwanita.id/bayar-estimasi.html?order=${encodeURIComponent(ref)}`
        }));
        expect(fake.state.orders[0]).toMatchObject({ order_type: ORDER_TYPE, product_code: 'obstetri', amount_idr: 115000, gateway_mode: 'sandbox', status: 'pending' });
        expect(JSON.parse(fake.state.orders[0].item_snapshot)).toEqual({
            package_code: 'obstetri',
            package_name: 'Kehamilan (Obstetri)',
            category: 'obstetri',
            items: [expect.objectContaining({ name: 'Biaya Admin' })],
            amount_idr: 115000,
            priced_at: T0.toISOString()
        });
        expect(order).toMatchObject({ order_ref: ref, category: 'obstetri', category_label: 'Kehamilan (Obstetri)', amount_idr: 115000, method_type: 'qris', gateway_mode: 'sandbox', qr_string: '000201...' });
        expect(order).not.toHaveProperty('patient_id');
        expect(order).not.toHaveProperty('item_snapshot');
        expect(fake.state.events.map(e => e.event_type)).toEqual(['order_created']);
    });

    test.each([
        ['a patient who is not a review account in sandbox', { reviewer: false }, 'PREPAY_NOT_AVAILABLE', 403],
        ['production before the live flag', { production: true, live: false }, 'PREPAY_NOT_AVAILABLE', 403],
        ['an unconfigured gateway', { configured: false }, 'GATEWAY_NOT_CONFIGURED', 503],
        ['a package that turned not ready', { category: estimate({ ready: false, amount_idr: null }) }, 'PACKAGE_UNAVAILABLE', 404],
        ['a package that is inactive', { category: estimate({ is_active: false }) }, 'PACKAGE_UNAVAILABLE', 404]
    ])('refuses %s without writing an order or calling Duitku', async (_name, options, code, status) => {
        const { service, fake, duitku } = setup(options);
        await expect(service.createOrder({ patient: PATIENT, category: 'obstetri', paymentMethod: 'qris' })).rejects.toMatchObject({ code, status });
        expect(fake.state.orders).toHaveLength(0);
        expect(duitku.createTransaction).not.toHaveBeenCalled();
    });

    test('a missing package is unavailable (404), not an invalid category', async () => {
        const { service, fake, duitku } = setup();
        await expect(service.createOrder({ patient: PATIENT, category: 'pkg_99', paymentMethod: 'qris' }))
            .rejects.toMatchObject({ code: 'PACKAGE_UNAVAILABLE', status: 404, message: 'Paket tidak tersedia' });
        expect(fake.state.orders).toHaveLength(0);
        expect(duitku.createTransaction).not.toHaveBeenCalled();
    });

    test('an editable package orders at the fresh server price, labelled by its own name and category', async () => {
        const { service, fake, duitku, estimates } = setup({
            category: estimate({ code: 'pkg_7', name: 'Paket Trimester 1', label: 'Paket Trimester 1', category: 'gyn_repro', amount_idr: 410000, raw_total: 408500 })
        });
        const order = await service.createOrder({ patient: PATIENT, category: 'pkg_7', paymentMethod: 'qris', amount_idr: 1 });

        expect(estimates.pricePackageByCode).toHaveBeenCalledWith('pkg_7');
        expect(duitku.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
            amount: 410000,
            productDetails: 'Estimasi kunjungan Klinik Privat - Paket Trimester 1'
        }));
        expect(fake.state.orders[0]).toMatchObject({ product_code: 'pkg_7', amount_idr: 410000 });
        expect(JSON.parse(fake.state.orders[0].item_snapshot)).toMatchObject({ package_code: 'pkg_7', package_name: 'Paket Trimester 1', category: 'gyn_repro', amount_idr: 410000 });
        expect(fake.state.events[0].detail).toMatchObject({ category: 'gyn_repro', product: 'pkg_7', amount: 410000 });
        expect(order).toMatchObject({ product: 'pkg_7', category: 'gyn_repro', category_label: 'Paket Trimester 1', saldo_label: 'Program Hamil (Reproduksi)', amount_idr: 410000 });
    });

    test('an old order without a package name keeps its legacy label; bad snapshot JSON does not break it', () => {
        const { toPublicOrder } = require('../../services/CheckupPrepayService');
        const base = { order_ref: 'DPK-1', product_code: 'obstetri_usg4d', amount_idr: 365000, payment_method: 'qris', status: 'paid' };
        expect(toPublicOrder({ ...base, item_snapshot: '{"raw_total":1}' }, PAYMENT_METHODS))
            .toMatchObject({ category: 'obstetri', category_label: 'Kehamilan + USG 4D', saldo_label: 'Kehamilan (Obstetri)' });
        expect(toPublicOrder({ ...base, item_snapshot: '{not json' }, PAYMENT_METHODS))
            .toMatchObject({ category: 'obstetri', category_label: 'Kehamilan + USG 4D' });
    });

    test.each([
        ['a malformed code', { category: '../x', paymentMethod: 'qris' }, 'INVALID_CATEGORY'],
        ['an uppercase code', { category: 'A', paymentMethod: 'qris' }, 'INVALID_CATEGORY'],
        ['an unknown method', { category: 'obstetri', paymentMethod: 'gopay' }, 'INVALID_METHOD']
    ])('rejects %s', async (_name, input, code) => {
        const { service } = setup();
        await expect(service.createOrder({ patient: PATIENT, ...input })).rejects.toMatchObject({ code, status: 400 });
    });

    test('the USG 4D product is its own order but is labelled as Kehamilan saldo', async () => {
        const { service, fake, duitku } = setup({ category: estimate({ code: 'obstetri_usg4d', name: 'Kehamilan + USG 4D', label: 'Kehamilan + USG 4D', amount_idr: 365000, raw_total: 365000 }) });
        const order = await service.createOrder({ patient: PATIENT, category: 'obstetri_usg4d', paymentMethod: 'va_bni' });

        expect(fake.state.orders[0]).toMatchObject({ product_code: 'obstetri_usg4d', amount_idr: 365000 });
        expect(duitku.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ amount: 365000, productDetails: 'Estimasi kunjungan Klinik Privat - Kehamilan + USG 4D' }));
        expect(order).toMatchObject({ product: 'obstetri_usg4d', category: 'obstetri', category_label: 'Kehamilan + USG 4D', saldo_label: 'Kehamilan (Obstetri)' });
    });

    test('a second tap returns the open order; a changed price creates a new one', async () => {
        const ctx = setup();
        const first = await ctx.service.createOrder({ patient: PATIENT, category: 'obstetri', paymentMethod: 'qris' });
        const second = await ctx.service.createOrder({ patient: PATIENT, category: 'obstetri', paymentMethod: 'qris' });
        expect(second.order_ref).toBe(first.order_ref);
        expect(ctx.duitku.createTransaction).toHaveBeenCalledTimes(1);

        ctx.estimates.pricePackageByCode.mockResolvedValueOnce(estimate({ amount_idr: 125000 }));
        const third = await ctx.service.createOrder({ patient: PATIENT, category: 'obstetri', paymentMethod: 'qris' });
        expect(third.order_ref).not.toBe(first.order_ref);
        expect(third.amount_idr).toBe(125000);
    });

    test('shares the five-unpaid-invoices cap with every Duitku order', async () => {
        const ctx = setup();
        for (let i = 0; i < 5; i += 1) {
            ctx.fake.state.orders.push({ id: 100 + i, order_ref: `PRM-${i}`, order_type: 'premium', patient_id: PATIENT.id, status: 'pending', expires_at: new Date(T0.getTime() + 3600000) });
        }
        await expect(ctx.service.createOrder({ patient: PATIENT, category: 'obstetri', paymentMethod: 'qris' }))
            .rejects.toMatchObject({ code: 'TOO_MANY_PENDING', status: 429 });
    });

    test('marks the order failed and hides gateway details when Duitku refuses', async () => {
        const ctx = setup();
        ctx.duitku.createTransaction.mockRejectedValue(new Error('Wrong signature from upstream'));
        const attempt = ctx.service.createOrder({ patient: PATIENT, category: 'obstetri', paymentMethod: 'va_bni' });
        await expect(attempt).rejects.toMatchObject({ code: 'GATEWAY_ERROR', status: 502 });
        await expect(attempt).rejects.not.toThrow(/signature/i);
        expect(ctx.fake.state.orders[0].status).toBe('failed');
    });
});

describe('reading orders and status', () => {
    test('a patient reads only their own prepay orders', async () => {
        const ctx = setup();
        const order = await ctx.service.createOrder({ patient: PATIENT, category: 'obstetri', paymentMethod: 'qris' });
        await expect(ctx.service.getOrderForPatient(PATIENT.id, order.order_ref)).resolves.toMatchObject({ order_ref: order.order_ref });
        await expect(ctx.service.getOrderForPatient('P9999', order.order_ref)).resolves.toBeNull();
    });

    test('status hides packages that are not ready (spec section 2)', async () => {
        const ctx = setup();
        const status = await ctx.service.getStatus(PATIENT.id);
        expect(status.estimates.map(item => item.code)).toEqual(['obstetri']);
        expect(status.estimates.every(item => item.ready)).toBe(true);
    });

    test('status combines availability, public estimates, saldo and recent orders', async () => {
        const ctx = setup();
        await ctx.service.createOrder({ patient: PATIENT, category: 'obstetri', paymentMethod: 'qris' });
        const status = await ctx.service.getStatus(PATIENT.id);
        expect(status.availability).toEqual({ available: true, mode: 'sandbox', reason: null });
        expect(status.estimates[0]).toMatchObject({ code: 'obstetri', name: 'Kehamilan (Obstetri)', label: 'Kehamilan (Obstetri)', ready: true, amount_idr: 115000, items: [{ name: 'Biaya Admin', quantity: 1, subtotal_idr: 15000 }] });
        expect(status.balances).toEqual([{ category: 'obstetri', gateway_mode: 'sandbox', balance_idr: 115000, category_label: 'Kehamilan (Obstetri)' }]);
        expect(status.orders).toHaveLength(1);
        expect(status.payment_methods).toEqual([{ key: 'qris', label: 'QRIS', type: 'qris' }, { key: 'va_bni', label: 'VA BNI', type: 'va' }]);
        expect(JSON.stringify(status)).not.toMatch(/tindakan_id|NQ"|I1"/);
    });
});

describe('getStatus: available saldo and the Saldo Deposit menu (Tahap 3)', () => {
    test('a pending withdrawal request is not available: live 255000 - hold 200000', async () => {
        const ctx = setup({
            production: true,
            live: true,
            ledger: {
                getBalances: jest.fn(async () => [
                    { category: 'obstetri', gateway_mode: 'live', balance_idr: 255000 },
                    { category: 'obstetri', gateway_mode: 'sandbox', balance_idr: 115000 }
                ]),
                getPendingRefundHold: jest.fn(async () => 200000)
            }
        });
        const status = await ctx.service.getStatus(PATIENT.id);
        expect(status.available_idr).toBe(55000);
        expect(ctx.ledger.getPendingRefundHold).toHaveBeenCalledWith(ctx.fake.db, PATIENT.id);
        expect(status.saldo_menu_visible).toBe(true);
    });

    test('a hold larger than the live saldo never goes below zero; sandbox saldo is never available', async () => {
        const ctx = setup({
            ledger: {
                getBalances: jest.fn(async () => [{ category: 'obstetri', gateway_mode: 'live', balance_idr: 10000 }]),
                getPendingRefundHold: jest.fn(async () => 20000)
            }
        });
        expect((await ctx.service.getStatus(PATIENT.id)).available_idr).toBe(0);
        const sandboxOnly = setup();
        expect((await sandboxOnly.service.getStatus(PATIENT.id)).available_idr).toBe(0);
    });

    test('a Google patient with no history in production mode does not see the menu', async () => {
        const ctx = setup({ production: true, live: false, reviewer: false, ledger: { getBalances: jest.fn(async () => []) } });
        const status = await ctx.service.getStatus('P0000777');
        expect(status.availability.available).toBe(false);
        expect(status.saldo_menu_visible).toBe(false);
        expect(ctx.ledger.hasSaldoHistory).toHaveBeenCalledWith(ctx.fake.db, 'P0000777');
    });

    test('a review account in sandbox sees the menu', async () => {
        const ctx = setup({ reviewer: true, ledger: { getBalances: jest.fn(async () => []) } });
        const status = await ctx.service.getStatus(PATIENT.id);
        expect(status.availability).toMatchObject({ available: true, mode: 'sandbox' });
        expect(status.saldo_menu_visible).toBe(true);
    });

    test('a patient whose only history is an old refund request sees the menu', async () => {
        const ctx = setup({
            production: true,
            live: false,
            ledger: { getBalances: jest.fn(async () => []), hasSaldoHistory: jest.fn(async () => true) }
        });
        const status = await ctx.service.getStatus('P0000778');
        expect(status.availability.available).toBe(false);
        expect(status.saldo_menu_visible).toBe(true);
    });
});
