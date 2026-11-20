'use strict';

/**
 * Tells staff in the panel that a prepay ("bayar di muka") order was paid. Called by
 * PremiumPaymentService after the credit is committed (never inside the transaction).
 * Panel only: the clinic does not use WhatsApp for this. Receivers need billing.view
 * (security/realtimePermissions.js); the staff shell shows a toast and refreshes red dots.
 */

const { orderLabel } = require('../constants/checkupPrepayProducts');

async function notifyPrepayPaid(order, _grant, { db = require('../db'), realtime = require('../realtime-sync') } = {}) {
    if (!order) return false;
    let patientName = null;
    try {
        const [rows] = await db.query('SELECT full_name FROM patients WHERE id = ? LIMIT 1', [order.patient_id]);
        patientName = rows && rows[0] && String(rows[0].full_name || '').trim() ? rows[0].full_name : null;
    } catch (_error) {
        patientName = null;
    }
    return realtime.broadcast({
        type: 'checkup_prepay_paid',
        patientName: patientName || String(order.patient_id || 'Pasien'),
        product: order.product_code || null,
        productLabel: orderLabel(order) || order.product_code || null,
        amount_idr: Number(order.amount_idr) || 0,
        payment_method: order.payment_method || null,
        gateway_mode: order.gateway_mode || null,
        order_ref: order.order_ref,
        timestamp: new Date().toISOString()
    });
}

module.exports = { notifyPrepayPaid };
