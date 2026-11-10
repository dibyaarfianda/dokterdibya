'use strict';

const { createPremiumPaymentService, PremiumError } = require('../../services/PremiumPaymentService');
const entitlements = require('../../services/PremiumEntitlements');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-11-10T10:00:00+07:00');

const PAYMENT_METHODS = {
    qris: { code: 'NQ', type: 'qris', label: 'QRIS' },
    va_bni: { code: 'I1', type: 'va', label: 'VA BNI' }
};

/**
 * In-memory stand-in for the four premium tables. It recognises only the statements the service
 * issues, so an unexpected query fails the test loudly.
 */
function createFakeDb(initial = {}) {
    let state = {
        plans: initial.plans || [],
        orders: initial.orders || [],
        entitlements: initial.entitlements || [],
        events: []
    };
    let nextOrderId = 1;
    let nextEntitlementId = 1;

    function clone() {
        return structuredClone(state);
    }

    function exec(sqlText, params = []) {
        const sql = sqlText.replace(/\s+/g, ' ').trim();

        if (/^SELECT code, name, description, price_idr, duration_days, features FROM premium_plans WHERE is_active = 1/.test(sql)) {
            return [state.plans.filter(plan => plan.is_active === 1)];
        }
        if (/^SELECT \* FROM premium_plans WHERE code = \? AND is_active = 1/.test(sql)) {
            return [state.plans.filter(plan => plan.code === params[0] && plan.is_active === 1)];
        }
        if (/^SELECT \* FROM payment_orders WHERE patient_id = \? AND status = 'pending' AND expires_at > \?/.test(sql)) {
            return [state.orders
                .filter(order => order.patient_id === params[0] && order.status === 'pending' && order.expires_at > params[1])
                .sort((a, b) => b.created_at - a.created_at)];
        }
        if (/^INSERT INTO payment_orders/.test(sql)) {
            const [orderRef, patientId, planId, planCode, amount, durationDays, method, expiresAt] = params;
            state.orders.push({
                id: nextOrderId++, order_ref: orderRef, patient_id: patientId, plan_id: planId, plan_code: planCode,
                amount_idr: amount, duration_days: durationDays, payment_method: method, status: 'pending',
                gateway_reference: null, va_number: null, qr_string: null, payment_url: null, fee_idr: null,
                expires_at: expiresAt, paid_at: null, last_status_check_at: null, gateway_payload: null,
                created_at: new Date(T0.getTime() + state.orders.length)
            });
            return [{ insertId: nextOrderId - 1 }];
        }
        if (/^UPDATE payment_orders SET status = 'failed' WHERE order_ref = \? AND status = 'pending'/.test(sql)) {
            state.orders.filter(o => o.order_ref === params[0] && o.status === 'pending').forEach(o => { o.status = 'failed'; });
            return [{}];
        }
        if (/^UPDATE payment_orders SET gateway_reference = \?, va_number = \?, qr_string = \?, payment_url = \? WHERE order_ref = \?/.test(sql)) {
            const order = state.orders.find(o => o.order_ref === params[4]);
            Object.assign(order, { gateway_reference: params[0], va_number: params[1], qr_string: params[2], payment_url: params[3] });
            return [{}];
        }
        if (/^SELECT \* FROM payment_orders WHERE order_ref = \? AND patient_id = \? LIMIT 1/.test(sql)) {
            return [state.orders.filter(o => o.order_ref === params[0] && o.patient_id === params[1])];
        }
        if (/^SELECT \* FROM payment_orders WHERE order_ref = \? (LIMIT 1|FOR UPDATE)/.test(sql)) {
            return [state.orders.filter(o => o.order_ref === params[0])];
        }
        if (/^SELECT \* FROM payment_orders WHERE patient_id = \? ORDER BY created_at DESC LIMIT 5/.test(sql)) {
            return [state.orders.filter(o => o.patient_id === params[0]).sort((a, b) => b.created_at - a.created_at).slice(0, 5)];
        }
        if (/^UPDATE payment_orders SET paid_at = COALESCE\(paid_at, \?\), status = 'paid' WHERE id = \? AND status <> 'paid'/.test(sql)) {
            state.orders.filter(o => o.id === params[1] && o.status !== 'paid').forEach(o => { o.status = 'paid'; o.paid_at = o.paid_at || params[0]; });
            return [{}];
        }
        if (/^UPDATE payment_orders SET status = 'paid'/.test(sql)) {
            const [paidAt, reference, fee, payload, id] = params;
            const order = state.orders.find(o => o.id === id);
            Object.assign(order, { status: 'paid', paid_at: paidAt, gateway_reference: reference || order.gateway_reference, fee_idr: fee, gateway_payload: payload });
            return [{}];
        }
        if (/^SELECT MAX\(ends_at\) AS ends_at FROM patient_entitlements WHERE patient_id = \? AND plan_code = \? AND ends_at > \?/.test(sql)) {
            const matching = state.entitlements.filter(e => e.patient_id === params[0] && e.plan_code === params[1] && e.ends_at > params[2]);
            return [[{ ends_at: matching.length ? new Date(Math.max(...matching.map(e => e.ends_at.getTime()))) : null }]];
        }
        if (/^INSERT INTO patient_entitlements/.test(sql)) {
            const [patientId, planId, planCode, startsAt, endsAt, sourceOrderId] = params;
            if (state.entitlements.some(e => e.source_order_id === sourceOrderId)) {
                throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
            }
            state.entitlements.push({ id: nextEntitlementId++, patient_id: patientId, plan_id: planId, plan_code: planCode, starts_at: startsAt, ends_at: endsAt, source: 'payment', source_order_id: sourceOrderId });
            return [{}];
        }
        if (/^SELECT plan_code, starts_at, ends_at FROM patient_entitlements WHERE patient_id = \? AND ends_at > \?/.test(sql)) {
            return [state.entitlements.filter(e => e.patient_id === params[0] && e.ends_at > params[1]).sort((a, b) => a.starts_at - b.starts_at)];
        }
        if (/^INSERT INTO premium_payment_events/.test(sql)) {
            state.events.push({ order_ref: params[0], patient_id: params[1], event_type: params[2], detail: params[3] ? JSON.parse(params[3]) : null });
            return [{}];
        }
        if (/^UPDATE payment_orders SET status = 'failed', gateway_payload = \? WHERE id = \? AND status = 'pending'/.test(sql)) {
            state.orders.filter(o => o.id === params[1] && o.status === 'pending').forEach(o => { o.status = 'failed'; o.gateway_payload = params[0]; });
            return [{}];
        }
        if (/^UPDATE payment_orders SET last_status_check_at = \? WHERE id = \?/.test(sql)) {
            state.orders.find(o => o.id === params[1]).last_status_check_at = params[0];
            return [{}];
        }
        if (/^UPDATE payment_orders SET status = 'expired' WHERE id = \? AND status = 'pending'/.test(sql)) {
            state.orders.filter(o => o.id === params[0] && o.status === 'pending').forEach(o => { o.status = 'expired'; });
            return [{}];
        }
        if (/^SELECT \* FROM payment_orders WHERE status = 'pending' AND created_at <= \? AND created_at >= \?/.test(sql)) {
            const [youngestAllowed, oldestAllowed, recheckBefore, limit] = params;
            return [state.orders
                .filter(o => o.status === 'pending'
                    && o.created_at <= youngestAllowed
                    && o.created_at >= oldestAllowed
                    && (o.last_status_check_at === null || o.last_status_check_at <= recheckBefore))
                .sort((a, b) => a.created_at - b.created_at)
                .slice(0, limit)];
        }
        throw new Error(`FakeDb: unexpected SQL: ${sql}`);
    }

    // SELECT results are copies, like rows coming back from MySQL, so a reader never sees later writes.
    function read(sql, params) {
        return structuredClone(exec(sql, params));
    }

    // FOR UPDATE: a second transaction waits until the first one releases its connection.
    let lockTail = Promise.resolve();
    function acquireLock() {
        let unlock;
        const previous = lockTail;
        lockTail = new Promise(resolve => { unlock = resolve; });
        return previous.then(() => unlock);
    }

    const db = {
        query: jest.fn(async (sql, params) => read(sql, params)),
        getConnection: jest.fn(async () => {
            let snapshot = null;
            let unlock = null;
            return {
                beginTransaction: jest.fn(async () => { unlock = await acquireLock(); snapshot = clone(); }),
                query: jest.fn(async (sql, params) => read(sql, params)),
                commit: jest.fn(async () => { snapshot = null; }),
                rollback: jest.fn(async () => { if (snapshot) state = snapshot; snapshot = null; }),
                release: jest.fn(() => { if (unlock) { unlock(); unlock = null; } })
            };
        })
    };
    return { db, get state() { return state; } };
}

function plan(overrides = {}) {
    return { id: 1, code: 'kehamilan', name: 'Paket Kehamilan', description: 'x', price_idr: 99000, duration_days: 365, features: '[]', is_active: 1, sort_order: 10, ...overrides };
}

function setup({ plans = [plan()], orders, entitlementRows, configured = true, startAt = T0 } = {}) {
    const fake = createFakeDb({ plans, orders, entitlements: entitlementRows });
    const clockState = { now: startAt };
    const duitku = {
        PAYMENT_METHODS,
        isConfigured: jest.fn(() => configured),
        createTransaction: jest.fn(async ({ methodCode }) => ({
            reference: 'DS-REF-1',
            vaNumber: methodCode === 'NQ' ? null : '8888000011112222',
            qrString: methodCode === 'NQ' ? '000201010212...' : null,
            paymentUrl: 'https://pay.example/x',
            amount: 99000
        })),
        checkTransaction: jest.fn(async () => ({ paid: true, pending: false, statusCode: '00', amount: 99000, fee: 700, reference: 'DS-REF-1' }))
    };
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    let counter = 0;
    const service = createPremiumPaymentService({
        db: fake.db,
        duitku,
        entitlements,
        logger,
        clock: () => clockState.now,
        uuid: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
    });
    return { service, fake, duitku, clockState, logger };
}

const PATIENT = { id: 'P0001', email: 'pasien@example.com', name: 'Bu Pasien', phone: '6281234567890' };

describe('createOrder', () => {
    test('takes amount, period and expiry from the plan and returns only what the app needs', async () => {
        const { service, fake, duitku } = setup();
        const order = await service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' });

        expect(duitku.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
            amount: 99000,
            methodCode: 'NQ',
            expiryMinutes: 60,
            email: 'pasien@example.com',
            orderRef: 'PRM-00000000-0000-4000-8000-000000000001'
        }));
        expect(order).toMatchObject({
            order_ref: 'PRM-00000000-0000-4000-8000-000000000001',
            plan_code: 'kehamilan',
            amount_idr: 99000,
            payment_method: 'qris',
            method_label: 'QRIS',
            status: 'pending'
        });
        expect(order.qr_string).toBe('000201010212...');
        expect(order).not.toHaveProperty('patient_id');
        expect(order).not.toHaveProperty('gateway_payload');
        expect(fake.state.orders[0]).toMatchObject({ amount_idr: 99000, duration_days: 365 });
        expect(fake.state.events.map(e => e.event_type)).toContain('order_created');
        expect(order.order_ref.length).toBeLessThanOrEqual(50);
    });

    test('virtual account orders get a 24 hour expiry and a VA number', async () => {
        const { service, duitku } = setup();
        const order = await service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'va_bni' });
        expect(duitku.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ methodCode: 'I1', expiryMinutes: 1440 }));
        expect(order.va_number).toBe('8888000011112222');
        expect(new Date(order.expires_at).getTime()).toBe(T0.getTime() + MS_PER_DAY);
    });

    test('uses a fallback email when the patient has none', async () => {
        const { service, duitku } = setup();
        await service.createOrder({ patient: { ...PATIENT, email: '' }, planCode: 'kehamilan', paymentMethod: 'qris' });
        expect(duitku.createTransaction.mock.calls[0][0].email).toMatch(/@dokterdibya\.com$/);
    });

    test('refuses an inactive plan without calling Duitku', async () => {
        const { service, duitku } = setup({ plans: [plan({ is_active: 0 })] });
        await expect(service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' }))
            .rejects.toMatchObject({ code: 'PLAN_NOT_AVAILABLE', status: 404 });
        expect(duitku.createTransaction).not.toHaveBeenCalled();
    });

    test('refuses an unknown payment method', async () => {
        const { service } = setup();
        await expect(service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'gopay' }))
            .rejects.toMatchObject({ code: 'INVALID_METHOD', status: 400 });
    });

    test('answers 503 when Duitku credentials are not configured', async () => {
        const { service, fake } = setup({ configured: false });
        await expect(service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' }))
            .rejects.toMatchObject({ code: 'GATEWAY_NOT_CONFIGURED', status: 503 });
        expect(fake.state.orders).toHaveLength(0);
    });

    test('a second tap on the same plan and method returns the open order instead of a new invoice', async () => {
        const { service, duitku, fake } = setup();
        const first = await service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' });
        const second = await service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' });
        expect(second.order_ref).toBe(first.order_ref);
        expect(duitku.createTransaction).toHaveBeenCalledTimes(1);
        expect(fake.state.orders).toHaveLength(1);
    });

    test('limits how many unpaid invoices one patient can hold', async () => {
        const { service, fake } = setup();
        const methods = ['qris', 'va_bni'];
        const extraPlans = ['p1', 'p2', 'p3', 'p4', 'p5'];
        fake.state.plans.push(...extraPlans.map((code, i) => plan({ id: 10 + i, code })));
        for (let i = 0; i < 5; i += 1) {
            await service.createOrder({ patient: PATIENT, planCode: extraPlans[i], paymentMethod: methods[i % 2] });
        }
        await expect(service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' }))
            .rejects.toMatchObject({ code: 'TOO_MANY_PENDING', status: 429 });
    });

    test('marks the order failed and hides gateway details when Duitku refuses', async () => {
        const { service, duitku, fake } = setup();
        duitku.createTransaction.mockRejectedValue(new Error('Wrong signature from upstream'));
        const attempt = service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' });
        await expect(attempt).rejects.toBeInstanceOf(PremiumError);
        await expect(attempt).rejects.toMatchObject({ code: 'GATEWAY_ERROR', status: 502 });
        await expect(attempt).rejects.not.toThrow(/signature/i);
        expect(fake.state.orders[0].status).toBe('failed');
        expect(fake.state.events.map(e => e.event_type)).toContain('order_failed');
    });
});

describe('applyPaidOrder', () => {
    async function pendingOrder(ctx, overrides = {}) {
        const order = await ctx.service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' });
        Object.assign(ctx.fake.state.orders[0], overrides);
        return order.order_ref;
    }

    test('activates the package for the purchased period', async () => {
        const ctx = setup();
        const ref = await pendingOrder(ctx);
        const result = await ctx.service.applyPaidOrder(ref, { source: 'callback', amount: 99000, reference: 'DS1', fee: 700 });

        expect(result.status).toBe('activated');
        expect(ctx.fake.state.orders[0]).toMatchObject({ status: 'paid', gateway_reference: 'DS1', fee_idr: 700 });
        expect(ctx.fake.state.entitlements).toHaveLength(1);
        const [grant] = ctx.fake.state.entitlements;
        expect(grant.starts_at.getTime()).toBe(T0.getTime());
        expect(grant.ends_at.getTime()).toBe(T0.getTime() + 365 * MS_PER_DAY);
        expect(grant.source_order_id).toBe(ctx.fake.state.orders[0].id);
        expect(ctx.fake.state.events.map(e => e.event_type)).toContain('paid');
    });

    test('a repeated callback or reconcile run never grants a second period', async () => {
        const ctx = setup();
        const ref = await pendingOrder(ctx);
        await ctx.service.applyPaidOrder(ref, { source: 'callback', amount: 99000 });
        const again = await ctx.service.applyPaidOrder(ref, { source: 'reconcile', amount: 99000 });

        expect(again.status).toBe('already_paid');
        expect(ctx.fake.state.entitlements).toHaveLength(1);
    });

    test('two simultaneous confirmations still grant only one period', async () => {
        const ctx = setup();
        const ref = await pendingOrder(ctx);
        const results = await Promise.all([
            ctx.service.applyPaidOrder(ref, { source: 'callback', amount: 99000 }),
            ctx.service.applyPaidOrder(ref, { source: 'reconcile', amount: 99000 })
        ]);
        expect(results.map(r => r.status).sort()).toEqual(['activated', 'already_paid']);
        expect(ctx.fake.state.entitlements).toHaveLength(1);
    });

    test('treats a duplicate grant for the same order as already paid instead of failing the callback', async () => {
        const ctx = setup();
        const ref = await pendingOrder(ctx);
        // The unique key on source_order_id is the last line of defence if the row lock is ever bypassed.
        ctx.fake.state.entitlements.push({ id: 77, patient_id: 'P0001', plan_id: 1, plan_code: 'kehamilan', starts_at: T0, ends_at: new Date(T0.getTime() + 365 * MS_PER_DAY), source: 'payment', source_order_id: ctx.fake.state.orders[0].id });
        const result = await ctx.service.applyPaidOrder(ref, { source: 'callback', amount: 99000 });
        expect(result.status).toBe('already_paid');
        expect(ctx.fake.state.entitlements).toHaveLength(1);
        expect(ctx.fake.state.orders[0].status).toBe('paid');
    });

    test('paying again before the package ends adds the new period after the running one', async () => {
        const runningEnd = new Date(T0.getTime() + 30 * MS_PER_DAY);
        const ctx = setup({
            entitlementRows: [{ id: 99, patient_id: 'P0001', plan_id: 1, plan_code: 'kehamilan', starts_at: new Date(T0.getTime() - 335 * MS_PER_DAY), ends_at: runningEnd, source: 'payment', source_order_id: 500 }]
        });
        const ref = await pendingOrder(ctx);
        await ctx.service.applyPaidOrder(ref, { source: 'callback', amount: 99000 });

        const renewal = ctx.fake.state.entitlements.find(e => e.id !== 99);
        expect(renewal.starts_at.getTime()).toBe(runningEnd.getTime());
        expect(renewal.ends_at.getTime()).toBe(runningEnd.getTime() + 365 * MS_PER_DAY);
    });

    test('a lapsed package restarts from the payment time', async () => {
        const ctx = setup({
            entitlementRows: [{ id: 99, patient_id: 'P0001', plan_id: 1, plan_code: 'kehamilan', starts_at: new Date(T0.getTime() - 400 * MS_PER_DAY), ends_at: new Date(T0.getTime() - 35 * MS_PER_DAY), source: 'payment', source_order_id: 500 }]
        });
        const ref = await pendingOrder(ctx);
        await ctx.service.applyPaidOrder(ref, { source: 'callback', amount: 99000 });
        const renewal = ctx.fake.state.entitlements.find(e => e.id !== 99);
        expect(renewal.starts_at.getTime()).toBe(T0.getTime());
    });

    test('another plan does not borrow the period of a different plan', async () => {
        const ctx = setup({
            entitlementRows: [{ id: 99, patient_id: 'P0001', plan_id: 2, plan_code: 'tahunan', starts_at: T0, ends_at: new Date(T0.getTime() + 200 * MS_PER_DAY), source: 'payment', source_order_id: 500 }]
        });
        const ref = await pendingOrder(ctx);
        await ctx.service.applyPaidOrder(ref, { source: 'callback', amount: 99000 });
        const grant = ctx.fake.state.entitlements.find(e => e.id !== 99);
        expect(grant.starts_at.getTime()).toBe(T0.getTime());
    });

    test('grants the period that was promised at checkout, even if the plan changed afterwards', async () => {
        const ctx = setup();
        const ref = await pendingOrder(ctx);
        ctx.fake.state.plans[0].duration_days = 30;
        await ctx.service.applyPaidOrder(ref, { source: 'callback', amount: 99000 });
        expect(ctx.fake.state.entitlements[0].ends_at.getTime()).toBe(T0.getTime() + 365 * MS_PER_DAY);
    });

    test('does not activate when the paid amount differs from the order', async () => {
        const ctx = setup();
        const ref = await pendingOrder(ctx);
        const result = await ctx.service.applyPaidOrder(ref, { source: 'callback', amount: 10000 });
        expect(result.status).toBe('amount_mismatch');
        expect(ctx.fake.state.orders[0].status).toBe('pending');
        expect(ctx.fake.state.entitlements).toHaveLength(0);
        expect(ctx.fake.state.events.map(e => e.event_type)).toContain('callback_rejected');
    });

    test('reports an unknown order without creating anything', async () => {
        const ctx = setup();
        const result = await ctx.service.applyPaidOrder('PRM-does-not-exist', { source: 'callback', amount: 99000 });
        expect(result.status).toBe('unknown_order');
        expect(ctx.fake.state.entitlements).toHaveLength(0);
    });

    test('money that arrives after the invoice expired still activates the package and is logged as late', async () => {
        const ctx = setup();
        const ref = await pendingOrder(ctx, { status: 'expired' });
        const result = await ctx.service.applyPaidOrder(ref, { source: 'reconcile', amount: 99000 });
        expect(result.status).toBe('activated');
        expect(ctx.fake.state.events.map(e => e.event_type)).toContain('paid_after_expiry');
    });

    test('rolls the whole payment back when granting the period fails', async () => {
        const ctx = setup();
        const ref = await pendingOrder(ctx);
        const realQuery = ctx.fake.db.getConnection.getMockImplementation();
        ctx.fake.db.getConnection.mockImplementationOnce(async () => {
            const connection = await realQuery();
            const inner = connection.query.getMockImplementation();
            connection.query.mockImplementation(async (sql, params) => {
                if (/INSERT INTO patient_entitlements/.test(sql)) throw new Error('disk full');
                return inner(sql, params);
            });
            return connection;
        });
        await expect(ctx.service.applyPaidOrder(ref, { source: 'callback', amount: 99000 })).rejects.toThrow('disk full');
        expect(ctx.fake.state.orders[0].status).toBe('pending');
        expect(ctx.fake.state.entitlements).toHaveLength(0);
    });
});

describe('handleGatewayCallback', () => {
    async function orderWithCallback(ctx, overrides = {}) {
        const order = await ctx.service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' });
        return { merchantCode: 'DTEST1', amount: '99000', merchantOrderId: order.order_ref, resultCode: '00', reference: 'DS-REF-1', ...overrides };
    }

    test('confirms with Check Transaction and then activates', async () => {
        const ctx = setup();
        const body = await orderWithCallback(ctx);
        const result = await ctx.service.handleGatewayCallback(body);

        expect(ctx.duitku.checkTransaction).toHaveBeenCalledWith(body.merchantOrderId);
        expect(result).toMatchObject({ handled: true, action: 'activated' });
        expect(ctx.fake.state.entitlements).toHaveLength(1);
        expect(ctx.fake.state.events.map(e => e.event_type)).toEqual(expect.arrayContaining(['callback_received', 'paid']));
    });

    test('ignores the callback amount when it differs from the order and never asks Duitku', async () => {
        const ctx = setup();
        const body = await orderWithCallback(ctx, { amount: '10000' });
        const result = await ctx.service.handleGatewayCallback(body);
        expect(result).toMatchObject({ handled: false, action: 'amount_mismatch' });
        expect(ctx.duitku.checkTransaction).not.toHaveBeenCalled();
        expect(ctx.fake.state.entitlements).toHaveLength(0);
    });

    test('does not trust a "paid" callback that Check Transaction does not confirm', async () => {
        const ctx = setup();
        ctx.duitku.checkTransaction.mockResolvedValue({ paid: false, pending: false, statusCode: '02', amount: null, fee: null, reference: null });
        const body = await orderWithCallback(ctx);
        const result = await ctx.service.handleGatewayCallback(body);
        expect(result).toMatchObject({ handled: false, action: 'not_paid' });
        expect(ctx.fake.state.entitlements).toHaveLength(0);
    });

    test('throws so Duitku retries when the status is still processing', async () => {
        const ctx = setup();
        ctx.duitku.checkTransaction.mockResolvedValue({ paid: false, pending: true, statusCode: '01', amount: null, fee: null, reference: null });
        const body = await orderWithCallback(ctx);
        await expect(ctx.service.handleGatewayCallback(body)).rejects.toMatchObject({ code: 'NOT_CONFIRMED_YET' });
        expect(ctx.fake.state.entitlements).toHaveLength(0);
    });

    test('throws so Duitku retries when Check Transaction itself fails', async () => {
        const ctx = setup();
        ctx.duitku.checkTransaction.mockRejectedValue(new Error('timeout'));
        const body = await orderWithCallback(ctx);
        await expect(ctx.service.handleGatewayCallback(body)).rejects.toThrow('timeout');
        expect(ctx.fake.state.entitlements).toHaveLength(0);
    });

    test('rejects a confirmation whose confirmed amount differs from the order', async () => {
        const ctx = setup();
        ctx.duitku.checkTransaction.mockResolvedValue({ paid: true, pending: false, statusCode: '00', amount: 10000, fee: 0, reference: 'x' });
        const body = await orderWithCallback(ctx);
        const result = await ctx.service.handleGatewayCallback(body);
        expect(result).toMatchObject({ handled: false, action: 'amount_mismatch' });
        expect(ctx.fake.state.entitlements).toHaveLength(0);
    });

    test('a failed payment result marks a pending order failed', async () => {
        const ctx = setup();
        const body = await orderWithCallback(ctx, { resultCode: '01' });
        const result = await ctx.service.handleGatewayCallback(body);
        expect(result).toMatchObject({ handled: true, action: 'marked_failed' });
        expect(ctx.fake.state.orders[0].status).toBe('failed');
        expect(ctx.duitku.checkTransaction).not.toHaveBeenCalled();
    });

    test('an unknown order reference is acknowledged but changes nothing', async () => {
        const ctx = setup();
        const result = await ctx.service.handleGatewayCallback({ merchantOrderId: 'PRM-unknown', amount: '99000', resultCode: '00' });
        expect(result).toMatchObject({ handled: false, action: 'unknown_order' });
    });

    test('a callback for an order that is already paid does not call Duitku again', async () => {
        const ctx = setup();
        const body = await orderWithCallback(ctx);
        await ctx.service.handleGatewayCallback(body);
        ctx.duitku.checkTransaction.mockClear();
        const again = await ctx.service.handleGatewayCallback(body);
        expect(again).toMatchObject({ handled: true, action: 'already_paid' });
        expect(ctx.duitku.checkTransaction).not.toHaveBeenCalled();
        expect(ctx.fake.state.entitlements).toHaveLength(1);
    });
});

describe('reconcilePendingOrders', () => {
    async function createAt(ctx, minutesAgo, method = 'qris', planCode = 'kehamilan') {
        const order = await ctx.service.createOrder({ patient: { ...PATIENT, id: `P${ctx.fake.state.orders.length + 1}` }, planCode, paymentMethod: method });
        const row = ctx.fake.state.orders.find(o => o.order_ref === order.order_ref);
        row.created_at = new Date(ctx.clockState.now.getTime() - minutesAgo * 60 * 1000);
        return row;
    }

    test('does nothing when Duitku is not configured', async () => {
        const ctx = setup({ configured: false });
        await expect(ctx.service.reconcilePendingOrders()).resolves.toEqual({ checked: 0, activated: 0, expired: 0, errors: 0 });
    });

    test('leaves fresh orders alone because the callback normally arrives within minutes', async () => {
        const ctx = setup();
        await createAt(ctx, 3);
        ctx.duitku.checkTransaction.mockClear();
        const summary = await ctx.service.reconcilePendingOrders();
        expect(summary.checked).toBe(0);
        expect(ctx.duitku.checkTransaction).not.toHaveBeenCalled();
    });

    test('activates a payment whose callback never arrived, once', async () => {
        const ctx = setup();
        const row = await createAt(ctx, 20);
        const first = await ctx.service.reconcilePendingOrders();
        expect(first).toMatchObject({ checked: 1, activated: 1 });
        expect(row.status).toBe('paid');

        const second = await ctx.service.reconcilePendingOrders();
        expect(second.checked).toBe(0);
        expect(ctx.fake.state.entitlements).toHaveLength(1);
    });

    test('does not ask Duitku about the same order again inside the recheck window', async () => {
        const ctx = setup();
        await createAt(ctx, 20);
        ctx.duitku.checkTransaction.mockResolvedValue({ paid: false, pending: true, statusCode: '01', amount: null, fee: null, reference: null });
        await ctx.service.reconcilePendingOrders();
        ctx.duitku.checkTransaction.mockClear();

        ctx.clockState.now = new Date(ctx.clockState.now.getTime() + 10 * 60 * 1000);
        await ctx.service.reconcilePendingOrders();
        expect(ctx.duitku.checkTransaction).not.toHaveBeenCalled();

        ctx.clockState.now = new Date(ctx.clockState.now.getTime() + 25 * 60 * 1000);
        await ctx.service.reconcilePendingOrders();
        expect(ctx.duitku.checkTransaction).toHaveBeenCalledTimes(1);
    });

    test('keeps a still-processing order pending before its expiry', async () => {
        const ctx = setup();
        const row = await createAt(ctx, 20);
        ctx.duitku.checkTransaction.mockResolvedValue({ paid: false, pending: true, statusCode: '01', amount: null, fee: null, reference: null });
        const summary = await ctx.service.reconcilePendingOrders();
        expect(summary).toMatchObject({ checked: 1, activated: 0, expired: 0 });
        expect(row.status).toBe('pending');
    });

    test('expires an unpaid order after its invoice window plus grace', async () => {
        const ctx = setup();
        const row = await createAt(ctx, 20);
        ctx.clockState.now = new Date(row.expires_at.getTime() + 3 * 60 * 60 * 1000);
        ctx.duitku.checkTransaction.mockResolvedValue({ paid: false, pending: false, statusCode: '02', amount: null, fee: null, reference: null });
        const summary = await ctx.service.reconcilePendingOrders();
        expect(summary.expired).toBe(1);
        expect(row.status).toBe('expired');
    });

    test('stops at the first gateway error so a blocked caller is not hammered', async () => {
        const ctx = setup();
        await createAt(ctx, 40);
        await createAt(ctx, 30);
        await createAt(ctx, 20);
        ctx.duitku.checkTransaction.mockRejectedValue(new Error('429 too many requests'));
        const summary = await ctx.service.reconcilePendingOrders();
        expect(ctx.duitku.checkTransaction).toHaveBeenCalledTimes(1);
        expect(summary.errors).toBe(1);
    });

    test('honours the batch limit', async () => {
        const ctx = setup();
        for (let i = 0; i < 4; i += 1) await createAt(ctx, 30 + i, i % 2 ? 'va_bni' : 'qris');
        ctx.duitku.checkTransaction.mockResolvedValue({ paid: false, pending: true, statusCode: '01', amount: null, fee: null, reference: null });
        const summary = await ctx.service.reconcilePendingOrders({ limit: 2 });
        expect(summary.checked).toBe(2);
    });
});

describe('status for the patient app', () => {
    test('lists the active plans and the patient package with recent orders', async () => {
        const ctx = setup({ plans: [plan(), plan({ id: 2, code: 'hidden', is_active: 0 })] });
        const plans = await ctx.service.listActivePlans();
        expect(plans.map(p => p.code)).toEqual(['kehamilan']);
        expect(plans[0]).toMatchObject({ price_idr: 99000, duration_days: 365, features: [] });

        const order = await ctx.service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' });
        await ctx.service.applyPaidOrder(order.order_ref, { source: 'callback', amount: 99000 });
        const status = await ctx.service.getPatientStatus('P0001');
        expect(status.package.active).toBe(true);
        expect(status.orders[0].order_ref).toBe(order.order_ref);
    });

    test('a patient can read only their own order', async () => {
        const ctx = setup();
        const order = await ctx.service.createOrder({ patient: PATIENT, planCode: 'kehamilan', paymentMethod: 'qris' });
        await expect(ctx.service.getOrderForPatient('P0001', order.order_ref)).resolves.toMatchObject({ order_ref: order.order_ref });
        await expect(ctx.service.getOrderForPatient('P9999', order.order_ref)).resolves.toBeNull();
    });
});
