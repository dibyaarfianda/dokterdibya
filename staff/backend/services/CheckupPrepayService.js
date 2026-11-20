'use strict';

/**
 * Optional prepayment ("bayar di muka") of the estimated cost of one Klinik Privat visit,
 * through Duitku QRIS or virtual account. A paid order becomes patient credit (saldo) for its
 * category through PatientCreditLedger; Tahap 2 deducts that credit from the visit bill.
 *
 * Who may pay (read on every request):
 *  - gateway not configured          -> nobody
 *  - sandbox (DUITKU_PRODUCTION != true) -> only active review accounts (payment-gateway reviewers)
 *  - production                      -> everybody, but only once CHECKUP_PREPAY_LIVE=true, which is
 *                                       switched on after Tahap 2 (automatic deduction) ships
 *
 * The amount always comes from CheckupEstimateService (live tindakan prices), never from the
 * request. Orders live in payment_orders with order_type 'checkup_prepay'; callbacks and
 * reconciliation are handled by PremiumPaymentService, which calls the ledger when one is paid.
 */

const crypto = require('crypto');
const {
    PremiumError,
    QRIS_EXPIRY_MINUTES,
    VA_EXPIRY_MINUTES,
    MAX_PENDING_ORDERS_PER_PATIENT,
    FALLBACK_EMAIL
} = require('./PremiumPaymentService');
const { CONSULTATION_CATEGORIES } = require('../constants/consultationCategories');
const { isCheckupPrepayProduct, productCategory, productLabel } = require('../constants/checkupPrepayProducts');
const { toPublicEstimate } = require('./CheckupEstimateService');

const ORDER_TYPE = 'checkup_prepay';
const ORDER_PREFIX = 'DPK-';
const DEFAULT_PORTAL_ORIGIN = 'https://sisiwanita.id';
const MS_PER_MINUTE = 60 * 1000;

function toPublicOrder(order, methods) {
    if (!order) return null;
    const method = methods[order.payment_method] || {};
    return {
        order_ref: order.order_ref,
        product: order.product_code,
        category: productCategory(order.product_code) || order.product_code,
        category_label: productLabel(order.product_code),
        saldo_label: CONSULTATION_CATEGORIES[productCategory(order.product_code)] || productLabel(order.product_code),
        amount_idr: Number(order.amount_idr),
        payment_method: order.payment_method,
        method_label: method.label || order.payment_method,
        method_type: method.type || null,
        gateway_mode: order.gateway_mode || null,
        status: order.status,
        va_number: order.va_number || null,
        qr_string: order.qr_string || null,
        expires_at: order.expires_at,
        paid_at: order.paid_at || null
    };
}

function createCheckupPrepayService({
    db,
    duitku,
    estimates,
    reviewAccounts,
    ledger,
    logger,
    env = null,
    clock = () => new Date(),
    uuid = () => crypto.randomUUID()
}) {
    const methods = duitku.PAYMENT_METHODS;
    const environment = () => env || process.env;

    async function recordEvent(orderRef, patientId, eventType, detail) {
        try {
            await db.query(
                'INSERT INTO premium_payment_events (order_ref, patient_id, event_type, detail) VALUES (?, ?, ?, ?)',
                [orderRef || null, patientId || null, eventType, detail ? JSON.stringify(detail).substring(0, 4000) : null]
            );
        } catch (error) {
            logger.error('[CheckupPrepay] Failed to write payment event', { eventType, orderRef, message: error.message });
        }
    }

    /** @returns {Promise<{available:boolean, mode:?('sandbox'|'live'), reason:?string}>} */
    async function getAvailability(patientId) {
        if (!duitku.isConfigured()) return { available: false, mode: null, reason: 'gateway_not_configured' };
        if (duitku.isProduction()) {
            return environment().CHECKUP_PREPAY_LIVE === 'true'
                ? { available: true, mode: 'live', reason: null }
                : { available: false, mode: 'live', reason: 'not_open_yet' };
        }
        // Sandbox: no real money, so only reviewers may go through checkout. Missing dependency = closed.
        const reviewer = reviewAccounts ? await reviewAccounts.isActiveReviewPatient(patientId) : false;
        return reviewer
            ? { available: true, mode: 'sandbox', reason: null }
            : { available: false, mode: 'sandbox', reason: 'review_only' };
    }

    function paymentMethodList() {
        return Object.entries(methods).map(([key, method]) => ({ key, label: method.label, type: method.type }));
    }

    // `category` is the prepay product code (constants/checkupPrepayProducts.js), e.g. 'obstetri' or
    // 'obstetri_usg4d'; the field keeps its old name so existing clients and links stay valid.
    async function createOrder({ patient, category, paymentMethod }) {
        const method = methods[paymentMethod];
        if (!method) throw new PremiumError('INVALID_METHOD', 'Metode pembayaran tidak valid', 400);
        if (!isCheckupPrepayProduct(category)) throw new PremiumError('INVALID_CATEGORY', 'Kategori kunjungan tidak valid', 400);

        const availability = await getAvailability(patient.id);
        if (!availability.available) {
            if (availability.reason === 'gateway_not_configured') {
                throw new PremiumError('GATEWAY_NOT_CONFIGURED', 'Pembayaran belum tersedia. Silakan coba lagi nanti.', 503);
            }
            throw new PremiumError('PREPAY_NOT_AVAILABLE', 'Pembayaran di muka segera tersedia.', 403);
        }

        const priced = await estimates.priceCategory(category);
        const estimate = priced.category;
        if (!estimate || !estimate.ready) {
            throw new PremiumError('ESTIMATE_NOT_READY', 'Estimasi untuk kategori ini belum tersedia.', 409);
        }
        const amount = estimate.amount_idr;
        const now = clock();

        // Tapping "bayar" twice must not create two invoices; a price change does need a new one.
        const [openOrders] = await db.query(
            `SELECT * FROM payment_orders
              WHERE patient_id = ? AND status = 'pending' AND expires_at > ?
              ORDER BY created_at DESC`,
            [patient.id, now]
        );
        const reusable = openOrders.find(order => order.order_type === ORDER_TYPE
            && order.product_code === category
            && order.payment_method === paymentMethod
            && Number(order.amount_idr) === amount
            && order.gateway_mode === availability.mode);
        if (reusable) return toPublicOrder(reusable, methods);
        if (openOrders.length >= MAX_PENDING_ORDERS_PER_PATIENT) {
            throw new PremiumError('TOO_MANY_PENDING', 'Masih ada beberapa pembayaran yang belum selesai. Selesaikan atau tunggu sampai kedaluwarsa.', 429);
        }

        const orderRef = `${ORDER_PREFIX}${uuid()}`;
        const expiryMinutes = method.type === 'qris' ? QRIS_EXPIRY_MINUTES : VA_EXPIRY_MINUTES;
        const expiresAt = new Date(now.getTime() + expiryMinutes * MS_PER_MINUTE);
        const snapshot = {
            mapping_version: priced.mapping && priced.mapping.version,
            mapping_updated_at: priced.mapping && priced.mapping.updated_at,
            priced_at: priced.priced_at,
            raw_total: estimate.raw_total,
            items: estimate.items
        };

        // Insert before calling Duitku so a callback can always find the order.
        await db.query(
            `INSERT INTO payment_orders
                (order_ref, order_type, product_code, patient_id, amount_idr, payment_method, gateway_mode, status, expires_at, item_snapshot)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
            [orderRef, ORDER_TYPE, category, patient.id, amount, paymentMethod, availability.mode, expiresAt, JSON.stringify(snapshot).substring(0, 60000)]
        );

        const portalOrigin = String(environment().PATIENT_PORTAL_ORIGIN || DEFAULT_PORTAL_ORIGIN).replace(/\/+$/, '');
        let transaction;
        try {
            transaction = await duitku.createTransaction({
                orderRef,
                amount,
                methodCode: method.code,
                productDetails: `Estimasi kunjungan Klinik Privat - ${estimate.label}`,
                email: patient.email || environment().DUITKU_FALLBACK_EMAIL || FALLBACK_EMAIL,
                customerName: patient.name,
                phone: patient.phone,
                expiryMinutes,
                returnUrl: `${portalOrigin}/bayar-estimasi.html?order=${encodeURIComponent(orderRef)}`
            });
        } catch (error) {
            await db.query("UPDATE payment_orders SET status = 'failed' WHERE order_ref = ? AND status = 'pending'", [orderRef]);
            await recordEvent(orderRef, patient.id, 'order_failed', { message: error.message });
            logger.error('[CheckupPrepay] Gateway refused order', { orderRef, message: error.message });
            throw new PremiumError('GATEWAY_ERROR', 'Gagal membuat pembayaran. Silakan coba lagi.', 502);
        }

        await db.query(
            `UPDATE payment_orders
                SET gateway_reference = ?, va_number = ?, qr_string = ?, payment_url = ?
              WHERE order_ref = ?`,
            [transaction.reference, transaction.vaNumber, transaction.qrString, transaction.paymentUrl, orderRef]
        );
        await recordEvent(orderRef, patient.id, 'order_created', {
            order_type: ORDER_TYPE, category: productCategory(category), product: category, method: paymentMethod, amount, gateway_mode: availability.mode
        });

        const [created] = await db.query('SELECT * FROM payment_orders WHERE order_ref = ? LIMIT 1', [orderRef]);
        return toPublicOrder(created[0], methods);
    }

    async function getOrderForPatient(patientId, orderRef) {
        const [rows] = await db.query(
            'SELECT * FROM payment_orders WHERE order_ref = ? AND patient_id = ? AND order_type = ? LIMIT 1',
            [orderRef, patientId, ORDER_TYPE]
        );
        return toPublicOrder(rows[0], methods);
    }

    async function getStatus(patientId) {
        const availability = await getAvailability(patientId);
        const priced = await estimates.priceAll();
        const balances = await ledger.getBalances(patientId, { db });
        const [orders] = await db.query(
            'SELECT * FROM payment_orders WHERE patient_id = ? AND order_type = ? ORDER BY created_at DESC LIMIT 5',
            [patientId, ORDER_TYPE]
        );
        return {
            availability,
            estimates: priced.categories.map(toPublicEstimate),
            balances: balances.map(row => ({
                ...row,
                category_label: CONSULTATION_CATEGORIES[row.category] || row.category
            })),
            orders: orders.map(order => toPublicOrder(order, methods)),
            payment_methods: paymentMethodList()
        };
    }

    return { getAvailability, createOrder, getOrderForPatient, getStatus, paymentMethodList };
}

let defaultService = null;
function getCheckupPrepayService() {
    if (!defaultService) {
        defaultService = createCheckupPrepayService({
            db: require('../db'),
            duitku: require('../utils/duitku-payment'),
            estimates: require('./CheckupEstimateService').getCheckupEstimateService(),
            reviewAccounts: require('./PatientReviewAccountService').getPatientReviewAccountService(),
            ledger: require('./PatientCreditLedger'),
            logger: require('../utils/logger')
        });
    }
    return defaultService;
}

module.exports = {
    ORDER_TYPE,
    ORDER_PREFIX,
    toPublicOrder,
    createCheckupPrepayService,
    getCheckupPrepayService
};
