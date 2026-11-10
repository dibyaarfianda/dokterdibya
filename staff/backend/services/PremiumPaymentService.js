'use strict';

/**
 * Premium package payments (Duitku QRIS + virtual account).
 *
 * Rules this service enforces:
 *  - the amount and the period always come from premium_plans, never from the request;
 *  - an order is activated only after Duitku confirmed it through Check Transaction (callbacks are
 *    signed, but the status is still re-checked) and the amount matches the order;
 *  - one order grants one period (patient_entitlements.source_order_id is UNIQUE), so a repeated
 *    callback or a reconciliation run can never extend a package twice;
 *  - a renewal starts when the running period ends, so paying early never burns remaining days;
 *  - Check Transaction is rate limited by Duitku, so reconciliation touches few orders, each at
 *    most once per recheck window.
 */

const crypto = require('crypto');

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

const QRIS_EXPIRY_MINUTES = 60;
const VA_EXPIRY_MINUTES = 24 * 60;
const MAX_PENDING_ORDERS_PER_PATIENT = 5;
const FALLBACK_EMAIL = 'pembayaran@dokterdibya.com';

const RECONCILE_MIN_AGE_MINUTES = 10;
const RECONCILE_RECHECK_MINUTES = 30;
const RECONCILE_EXPIRY_GRACE_MINUTES = 120;
const RECONCILE_LOOKBACK_DAYS = 3;
const RECONCILE_BATCH = 10;

class PremiumError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'PremiumError';
        this.code = code;
        this.status = status;
    }
}

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * MS_PER_MINUTE);
}

function toDate(value) {
    return value instanceof Date ? value : new Date(value);
}

function toPublicOrder(order, methods) {
    if (!order) return null;
    const method = methods[order.payment_method] || {};
    return {
        order_ref: order.order_ref,
        plan_code: order.plan_code,
        amount_idr: Number(order.amount_idr),
        payment_method: order.payment_method,
        method_label: method.label || order.payment_method,
        method_type: method.type || null,
        status: order.status,
        va_number: order.va_number || null,
        qr_string: order.qr_string || null,
        expires_at: order.expires_at,
        paid_at: order.paid_at || null
    };
}

function createPremiumPaymentService({ db, duitku, entitlements, logger, clock = () => new Date(), uuid = () => crypto.randomUUID() }) {
    const methods = duitku.PAYMENT_METHODS;

    async function recordEvent(orderRef, patientId, eventType, detail, executor = db) {
        try {
            await executor.query(
                'INSERT INTO premium_payment_events (order_ref, patient_id, event_type, detail) VALUES (?, ?, ?, ?)',
                [orderRef || null, patientId || null, eventType, detail ? JSON.stringify(detail).substring(0, 4000) : null]
            );
        } catch (error) {
            // An audit log failure must never break a payment.
            logger.error('[Premium] Failed to write payment event', { eventType, orderRef, message: error.message });
        }
    }

    async function listActivePlans() {
        const [rows] = await db.query(
            'SELECT code, name, description, price_idr, duration_days, features FROM premium_plans WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
        );
        return rows.map(row => ({
            code: row.code,
            name: row.name,
            description: row.description || '',
            price_idr: Number(row.price_idr),
            duration_days: Number(row.duration_days),
            features: parseFeatures(row.features)
        }));
    }

    function parseFeatures(raw) {
        if (Array.isArray(raw)) return raw;
        try {
            const parsed = JSON.parse(raw || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    async function createOrder({ patient, planCode, paymentMethod }) {
        const method = methods[paymentMethod];
        if (!method) throw new PremiumError('INVALID_METHOD', 'Metode pembayaran tidak valid', 400);
        if (!duitku.isConfigured()) {
            throw new PremiumError('GATEWAY_NOT_CONFIGURED', 'Pembayaran belum tersedia. Silakan coba lagi nanti.', 503);
        }

        const [plans] = await db.query('SELECT * FROM premium_plans WHERE code = ? AND is_active = 1 LIMIT 1', [planCode]);
        const plan = plans[0];
        if (!plan) throw new PremiumError('PLAN_NOT_AVAILABLE', 'Paket tidak tersedia', 404);

        const now = clock();

        // Tapping "bayar" twice must not create two invoices.
        const [openOrders] = await db.query(
            `SELECT * FROM payment_orders
              WHERE patient_id = ? AND status = 'pending' AND expires_at > ?
              ORDER BY created_at DESC`,
            [patient.id, now]
        );
        const reusable = openOrders.find(order => order.plan_code === plan.code && order.payment_method === paymentMethod);
        if (reusable) return toPublicOrder(reusable, methods);
        if (openOrders.length >= MAX_PENDING_ORDERS_PER_PATIENT) {
            throw new PremiumError('TOO_MANY_PENDING', 'Masih ada beberapa pembayaran yang belum selesai. Selesaikan atau tunggu sampai kedaluwarsa.', 429);
        }

        const orderRef = `PRM-${uuid()}`;
        const expiryMinutes = method.type === 'qris' ? QRIS_EXPIRY_MINUTES : VA_EXPIRY_MINUTES;
        const expiresAt = addMinutes(now, expiryMinutes);
        const amount = Number(plan.price_idr);

        // Insert before calling Duitku so a callback can always find the order, even if our
        // HTTP request to Duitku times out after Duitku already created the transaction.
        await db.query(
            `INSERT INTO payment_orders
                (order_ref, patient_id, plan_id, plan_code, amount_idr, duration_days, payment_method, status, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [orderRef, patient.id, plan.id, plan.code, amount, Number(plan.duration_days), paymentMethod, expiresAt]
        );

        let transaction;
        try {
            transaction = await duitku.createTransaction({
                orderRef,
                amount,
                methodCode: method.code,
                productDetails: plan.name,
                email: patient.email || process.env.DUITKU_FALLBACK_EMAIL || FALLBACK_EMAIL,
                customerName: patient.name,
                phone: patient.phone,
                expiryMinutes
            });
        } catch (error) {
            await db.query("UPDATE payment_orders SET status = 'failed' WHERE order_ref = ? AND status = 'pending'", [orderRef]);
            await recordEvent(orderRef, patient.id, 'order_failed', { message: error.message });
            logger.error('[Premium] Gateway refused order', { orderRef, message: error.message });
            throw new PremiumError('GATEWAY_ERROR', 'Gagal membuat pembayaran. Silakan coba lagi.', 502);
        }

        await db.query(
            `UPDATE payment_orders
                SET gateway_reference = ?, va_number = ?, qr_string = ?, payment_url = ?
              WHERE order_ref = ?`,
            [transaction.reference, transaction.vaNumber, transaction.qrString, transaction.paymentUrl, orderRef]
        );
        await recordEvent(orderRef, patient.id, 'order_created', { plan: plan.code, method: paymentMethod, amount });

        const [created] = await db.query('SELECT * FROM payment_orders WHERE order_ref = ? LIMIT 1', [orderRef]);
        return toPublicOrder(created[0], methods);
    }

    async function getOrderForPatient(patientId, orderRef) {
        const [rows] = await db.query('SELECT * FROM payment_orders WHERE order_ref = ? AND patient_id = ? LIMIT 1', [orderRef, patientId]);
        return toPublicOrder(rows[0], methods);
    }

    async function getPatientStatus(patientId) {
        const now = clock();
        const summary = await entitlements.getEntitlementSummary(patientId, { db, now });
        const [orders] = await db.query(
            'SELECT * FROM payment_orders WHERE patient_id = ? ORDER BY created_at DESC LIMIT 5',
            [patientId]
        );
        return { package: summary, orders: orders.map(order => toPublicOrder(order, methods)) };
    }

    /**
     * Mark an order paid and grant its period, exactly once.
     * @param {string} orderRef
     * @param {Object} info - { source, amount, reference, fee, payload }
     * @returns {Promise<{status: 'activated'|'already_paid'|'unknown_order'|'amount_mismatch', entitlement?: Object}>}
     */
    async function applyPaidOrder(orderRef, info = {}) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [orders] = await connection.query('SELECT * FROM payment_orders WHERE order_ref = ? FOR UPDATE', [orderRef]);
            const order = orders[0];
            if (!order) {
                await connection.rollback();
                return { status: 'unknown_order' };
            }
            if (order.status === 'paid') {
                await connection.commit();
                return { status: 'already_paid' };
            }
            if (info.amount !== undefined && info.amount !== null && Number(info.amount) !== Number(order.amount_idr)) {
                await connection.rollback();
                await recordEvent(orderRef, order.patient_id, 'callback_rejected', { reason: 'amount_mismatch', expected: Number(order.amount_idr), received: Number(info.amount) });
                return { status: 'amount_mismatch' };
            }

            const now = clock();
            const wasLate = order.status === 'expired' || order.status === 'failed' || toDate(order.expires_at) < now;

            await connection.query(
                `UPDATE payment_orders
                    SET status = 'paid', paid_at = ?, gateway_reference = COALESCE(?, gateway_reference),
                        fee_idr = ?, gateway_payload = ?
                  WHERE id = ?`,
                [now, info.reference || null, info.fee === undefined ? null : info.fee, info.payload ? JSON.stringify(info.payload).substring(0, 4000) : null, order.id]
            );

            const [latest] = await connection.query(
                'SELECT MAX(ends_at) AS ends_at FROM patient_entitlements WHERE patient_id = ? AND plan_code = ? AND ends_at > ?',
                [order.patient_id, order.plan_code, now]
            );
            const queuedEnd = latest[0] && latest[0].ends_at ? toDate(latest[0].ends_at) : null;
            const startsAt = queuedEnd && queuedEnd > now ? queuedEnd : now;
            const endsAt = new Date(startsAt.getTime() + Number(order.duration_days) * MS_PER_DAY);

            await connection.query(
                `INSERT INTO patient_entitlements
                    (patient_id, plan_id, plan_code, starts_at, ends_at, source, source_order_id)
                 VALUES (?, ?, ?, ?, ?, 'payment', ?)`,
                [order.patient_id, order.plan_id, order.plan_code, startsAt, endsAt, order.id]
            );

            await connection.commit();
            await recordEvent(orderRef, order.patient_id, wasLate ? 'paid_after_expiry' : 'paid', {
                source: info.source || 'unknown',
                starts_at: startsAt,
                ends_at: endsAt
            });
            return { status: 'activated', entitlement: { starts_at: startsAt, ends_at: endsAt, plan_code: order.plan_code, patient_id: order.patient_id } };
        } catch (error) {
            try { await connection.rollback(); } catch (_rollbackError) { /* connection already gone */ }
            if (error && error.code === 'ER_DUP_ENTRY') {
                // The period for this order was already granted by another path; only make the order say so.
                const [orders] = await db.query('SELECT * FROM payment_orders WHERE order_ref = ? LIMIT 1', [orderRef]);
                if (orders[0]) {
                    await db.query("UPDATE payment_orders SET paid_at = COALESCE(paid_at, ?), status = 'paid' WHERE id = ? AND status <> 'paid'", [clock(), orders[0].id]);
                }
                return { status: 'already_paid' };
            }
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Handle a callback whose signature was already verified by the route.
     * Throws when Duitku should retry (status not confirmed yet, or a temporary failure).
     * @returns {Promise<{handled: boolean, action: string}>}
     */
    async function handleGatewayCallback(body) {
        const orderRef = String(body.merchantOrderId || '');
        const [orders] = await db.query('SELECT * FROM payment_orders WHERE order_ref = ? LIMIT 1', [orderRef]);
        const order = orders[0];
        await recordEvent(orderRef, order && order.patient_id, 'callback_received', {
            resultCode: body.resultCode,
            amount: body.amount,
            reference: body.reference
        });

        if (!order) return { handled: false, action: 'unknown_order' };

        if (String(body.resultCode) !== '00') {
            if (order.status === 'pending') {
                await db.query("UPDATE payment_orders SET status = 'failed', gateway_payload = ? WHERE id = ? AND status = 'pending'", [JSON.stringify({ resultCode: body.resultCode }), order.id]);
                await recordEvent(orderRef, order.patient_id, 'order_failed', { resultCode: body.resultCode });
            }
            return { handled: true, action: 'marked_failed' };
        }

        if (Number(body.amount) !== Number(order.amount_idr)) {
            await recordEvent(orderRef, order.patient_id, 'callback_rejected', { reason: 'amount_mismatch', expected: Number(order.amount_idr), received: body.amount });
            return { handled: false, action: 'amount_mismatch' };
        }

        if (order.status === 'paid') return { handled: true, action: 'already_paid' };

        // The signature proves the callback came from Duitku; Check Transaction proves the money is there.
        const check = await duitku.checkTransaction(orderRef);
        await db.query('UPDATE payment_orders SET last_status_check_at = ? WHERE id = ?', [clock(), order.id]);

        if (check.pending) {
            throw new PremiumError('NOT_CONFIRMED_YET', 'Duitku belum mengonfirmasi pembayaran, callback diminta diulang', 503);
        }
        if (!check.paid) {
            await recordEvent(orderRef, order.patient_id, 'status_checked', { statusCode: check.statusCode });
            return { handled: false, action: 'not_paid' };
        }
        if (check.amount !== null && check.amount !== Number(order.amount_idr)) {
            await recordEvent(orderRef, order.patient_id, 'callback_rejected', { reason: 'check_amount_mismatch', expected: Number(order.amount_idr), received: check.amount });
            return { handled: false, action: 'amount_mismatch' };
        }

        const result = await applyPaidOrder(orderRef, {
            source: 'callback',
            amount: check.amount === null ? Number(body.amount) : check.amount,
            reference: body.reference || check.reference,
            fee: check.fee,
            payload: { resultCode: body.resultCode, publisherOrderId: body.publisherOrderId, issuerCode: body.issuerCode, settlementDate: body.settlementDate }
        });
        return { handled: result.status === 'activated' || result.status === 'already_paid', action: result.status, entitlement: result.entitlement };
    }

    /**
     * Catch payments whose callback never arrived and close orders that were never paid.
     * Duitku rate-limits Check Transaction, so this touches a few orders per run, each at most
     * once per recheck window, and stops at the first request error.
     */
    async function reconcilePendingOrders({ limit = RECONCILE_BATCH } = {}) {
        const summary = { checked: 0, activated: 0, expired: 0, errors: 0 };
        if (!duitku.isConfigured()) return summary;

        const now = clock();
        const [orders] = await db.query(
            `SELECT * FROM payment_orders
              WHERE status = 'pending'
                AND created_at <= ?
                AND created_at >= ?
                AND (last_status_check_at IS NULL OR last_status_check_at <= ?)
              ORDER BY created_at ASC
              LIMIT ?`,
            [
                addMinutes(now, -RECONCILE_MIN_AGE_MINUTES),
                new Date(now.getTime() - RECONCILE_LOOKBACK_DAYS * MS_PER_DAY),
                addMinutes(now, -RECONCILE_RECHECK_MINUTES),
                limit
            ]
        );

        for (const order of orders) {
            // Stamp first: if the process dies mid-run, this order is not hammered on restart.
            await db.query('UPDATE payment_orders SET last_status_check_at = ? WHERE id = ?', [now, order.id]);
            const pastExpiry = addMinutes(toDate(order.expires_at), RECONCILE_EXPIRY_GRACE_MINUTES) < now;

            let check;
            try {
                check = await duitku.checkTransaction(order.order_ref);
                summary.checked += 1;
            } catch (error) {
                summary.errors += 1;
                logger.warn('[Premium] Reconcile check failed', { orderRef: order.order_ref, message: error.message });
                if (pastExpiry) await markExpired(order);
                if (!pastExpiry) break;
                continue;
            }

            if (check.paid) {
                const result = await applyPaidOrder(order.order_ref, {
                    source: 'reconcile',
                    amount: check.amount,
                    reference: check.reference,
                    fee: check.fee,
                    payload: { statusCode: check.statusCode }
                });
                if (result.status === 'activated') summary.activated += 1;
            } else if (!check.pending || pastExpiry) {
                await markExpired(order);
                summary.expired += 1;
            }
        }
        return summary;
    }

    async function markExpired(order) {
        await db.query("UPDATE payment_orders SET status = 'expired' WHERE id = ? AND status = 'pending'", [order.id]);
        await recordEvent(order.order_ref, order.patient_id, 'expired', null);
    }

    return {
        listActivePlans,
        createOrder,
        getOrderForPatient,
        getPatientStatus,
        applyPaidOrder,
        handleGatewayCallback,
        reconcilePendingOrders
    };
}

let defaultService = null;
function getPremiumPaymentService() {
    if (!defaultService) {
        defaultService = createPremiumPaymentService({
            db: require('../db'),
            duitku: require('../utils/duitku-payment'),
            entitlements: require('./PremiumEntitlements'),
            logger: require('../utils/logger')
        });
    }
    return defaultService;
}

module.exports = {
    PremiumError,
    createPremiumPaymentService,
    getPremiumPaymentService,
    RECONCILE_MIN_AGE_MINUTES,
    RECONCILE_RECHECK_MINUTES
};
