'use strict';

/**
 * Patient credit (saldo) from prepaying the estimated cost of a Klinik Privat visit.
 *
 * Every movement is one row in patient_credit_ledger with a signed amount. Tahap 1 only writes
 * 'prepay' rows (money in, from a paid Duitku order). Tahap 2 adds 'usage' rows when the credit
 * is deducted from a visit bill and 'refund' rows when staff return it.
 *
 * Rule: a row carries the gateway_mode of the order it came from. Credit with gateway_mode
 * 'sandbox' was never real money and must never be spent on a real bill.
 * (source_type, source_id, entry_type) is UNIQUE, so one order can only credit once.
 */

const { productCategory } = require('../constants/checkupPrepayProducts');

const SOURCE_PAYMENT_ORDER = 'payment_order';

/**
 * Fulfiller for paid 'checkup_prepay' orders. Runs on the transaction connection of
 * PremiumPaymentService.applyPaidOrder, so the credit and the paid status commit together.
 * A second call for the same order throws ER_DUP_ENTRY, which applyPaidOrder treats as already paid.
 * The saldo category comes from the product (e.g. 'obstetri_usg4d' credits 'obstetri').
 */
async function creditFromPaidOrder(executor, order) {
    const amount = Number(order && order.amount_idr);
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('Nominal order tidak valid untuk saldo');
    }
    const category = productCategory(order.product_code);
    if (!category) {
        throw new Error('Order bayar di muka tanpa kategori tidak bisa menjadi saldo');
    }
    const gatewayMode = order.gateway_mode || null;
    await executor.query(
        `INSERT INTO patient_credit_ledger
            (patient_id, category, entry_type, amount_idr, gateway_mode, source_type, source_id, note)
         VALUES (?, ?, 'prepay', ?, ?, ?, ?, ?)`,
        [order.patient_id, category, amount, gatewayMode, SOURCE_PAYMENT_ORDER, String(order.id), `Bayar di muka ${order.product_code} ${order.order_ref}`.substring(0, 255)]
    );
    return { category, product: order.product_code, credit_idr: amount, gateway_mode: gatewayMode };
}

/**
 * Current saldo per category and gateway mode. Zero balances are left out.
 * @returns {Promise<Array<{category:string, gateway_mode:?string, balance_idr:number}>>}
 */
async function getBalances(patientId, { db = require('../db') } = {}) {
    try {
        const [rows] = await db.query(
            `SELECT category, gateway_mode, SUM(amount_idr) AS balance_idr
               FROM patient_credit_ledger
              WHERE patient_id = ?
              GROUP BY category, gateway_mode`,
            [patientId]
        );
        return (rows || [])
            .map(row => ({
                category: row.category,
                gateway_mode: row.gateway_mode || null,
                balance_idr: Number(row.balance_idr) || 0
            }))
            .filter(row => row.balance_idr !== 0);
    } catch (error) {
        // The migration may not have run yet on this server: no table means no saldo.
        if (error && error.code === 'ER_NO_SUCH_TABLE') return [];
        throw error;
    }
}

module.exports = {
    SOURCE_PAYMENT_ORDER,
    creditFromPaidOrder,
    getBalances
};
