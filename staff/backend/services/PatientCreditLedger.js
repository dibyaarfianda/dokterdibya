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

// ---------------------------------------------------------------------------
// Tahap 2. Only gateway_mode 'live' rows are ever read or written below: sandbox credit
// was never real money and never pays, returns to or refunds from a real bill.
// ---------------------------------------------------------------------------

const SOURCE_BILLING = 'sunday_clinic_billing';
const SOURCE_RETURN = 'sunday_clinic_return';
const SOURCE_REFUND = 'credit_refund';
const SALDO_DELETE_BLOCKED = 'Tagihan ini dibayar dengan saldo di muka; tidak dapat dihapus.';

const toInt = value => Math.trunc(Number(value) || 0);

/**
 * Live saldo per category. FOR UPDATE (via lockLiveBalances) serializes every spend of one
 * patient's saldo: mark-paid, returns and refunds all take it before writing.
 * @returns {Promise<Array<{category:string, balance_idr:number, oldest_at:?Date}>>}
 */
async function getLiveBalances(executor, patientId, { forUpdate = false } = {}) {
    const [rows] = await executor.query(
        `SELECT category, amount_idr, created_at
           FROM patient_credit_ledger
          WHERE patient_id = ? AND gateway_mode = 'live'
          ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`,
        [patientId]
    );
    const byCategory = new Map();
    for (const row of rows || []) {
        const entry = byCategory.get(row.category) || { category: row.category, balance_idr: 0, oldest_at: null };
        const amount = toInt(row.amount_idr);
        entry.balance_idr += amount;
        if (amount > 0 && row.created_at) {
            const at = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
            if (!entry.oldest_at || at < entry.oldest_at) entry.oldest_at = at;
        }
        byCategory.set(row.category, entry);
    }
    return [...byCategory.values()].filter(entry => entry.balance_idr !== 0);
}

function lockLiveBalances(connection, patientId) {
    return getLiveBalances(connection, patientId, { forUpdate: true });
}

/**
 * Which saldo pays `amountIdr`: the bill's own category first, then the oldest credit.
 * Pure. Never takes more than the saldo or the amount.
 */
function planUsage(balances, amountIdr, preferredCategory = null) {
    let remaining = Math.max(0, toInt(amountIdr));
    const time = entry => (entry.oldest_at instanceof Date ? entry.oldest_at.getTime() : Number.MAX_SAFE_INTEGER);
    const ordered = (balances || [])
        .filter(entry => toInt(entry.balance_idr) > 0)
        .slice()
        .sort((a, b) => {
            if (preferredCategory) {
                if (a.category === preferredCategory && b.category !== preferredCategory) return -1;
                if (b.category === preferredCategory && a.category !== preferredCategory) return 1;
            }
            return time(a) - time(b) || String(a.category).localeCompare(String(b.category));
        });
    const plan = [];
    for (const entry of ordered) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, toInt(entry.balance_idr));
        plan.push({ category: entry.category, amount_idr: take });
        remaining -= take;
    }
    return plan;
}

const planTotal = plan => (plan || []).reduce((sum, entry) => sum + toInt(entry.amount_idr), 0);

async function insertLiveRows(executor, { patientId, entryType, sign, sourceType, sourceKey, plan, actor, note }) {
    for (const entry of plan || []) {
        const amount = toInt(entry.amount_idr);
        if (amount <= 0) continue;
        await executor.query(
            `INSERT INTO patient_credit_ledger
                (patient_id, category, entry_type, amount_idr, gateway_mode, source_type, source_id, note, created_by)
             VALUES (?, ?, ?, ?, 'live', ?, ?, ?, ?)`,
            [patientId, entry.category, entryType, sign * amount, sourceType, `${sourceKey}:${entry.category}`,
                note ? String(note).substring(0, 255) : null, actor ? String(actor).substring(0, 64) : null]
        );
    }
}

/**
 * Saldo used to pay main bill `billingId`. One negative row per category. A paid bill never
 * returns to confirmed, so a duplicate means it was already recorded: return the saved total.
 */
async function recordUsage(connection, { billingId, patientId, plan, actor }) {
    try {
        await insertLiveRows(connection, {
            patientId, entryType: 'usage', sign: -1, sourceType: SOURCE_BILLING, sourceKey: billingId,
            plan, actor, note: `Dipakai untuk tagihan ${billingId}`
        });
        return planTotal(plan);
    } catch (error) {
        if (!error || error.code !== 'ER_DUP_ENTRY') throw error;
        const saved = await getUsageForBillings(connection, [billingId]);
        return saved.get(String(billingId))?.used_idr || 0;
    }
}

/**
 * Live usage per main bill id.
 * @returns {Promise<Map<string, {used_idr:number, rows:Array<{id:number, category:string, amount_idr:number}>}>>}
 */
// Bill ids are numeric. 'source_id LIKE "<id>:%"' is a constant-prefix match on the unique
// (source_type, source_id, entry_type) key, so a locking read touches only these bills' rows
// (a SUBSTRING_INDEX predicate would range-lock every usage row). '12:%' never matches '123:'.
const numericIds = values => [...new Set((values || []).map(id => String(id)).filter(id => /^\d+$/.test(id)))];
const sourcePrefixClause = ids => `(${ids.map(() => 'source_id LIKE ?').join(' OR ')})`;

async function getUsageForBillings(executor, billingIds, { forUpdate = false } = {}) {
    const ids = numericIds(billingIds);
    const usage = new Map();
    if (!ids.length) return usage;
    const [rows] = await executor.query(
        `SELECT id, source_id, category, amount_idr
           FROM patient_credit_ledger
          WHERE source_type = '${SOURCE_BILLING}' AND entry_type = 'usage' AND gateway_mode = 'live'
            AND ${sourcePrefixClause(ids)}
          ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`,
        ids.map(id => `${id}:%`)
    );
    for (const row of rows || []) {
        const billingId = String(row.source_id).split(':')[0];
        const entry = usage.get(billingId) || { used_idr: 0, rows: [] };
        const amount = Math.abs(toInt(row.amount_idr));
        entry.used_idr += amount;
        entry.rows.push({ id: Number(row.id), category: row.category, amount_idr: amount });
        usage.set(billingId, entry);
    }
    return usage;
}

/**
 * Which categories a retur refills: the bill's usage walked from the last row back, each
 * category capped at what it paid minus what earlier returns already put back. Pure.
 */
function planReturnCredit(usageRows, priorCredits, amountIdr) {
    let remaining = Math.max(0, toInt(amountIdr));
    const credited = new Map();
    for (const credit of priorCredits || []) {
        credited.set(credit.category, (credited.get(credit.category) || 0) + toInt(credit.amount_idr));
    }
    const plan = [];
    const rows = (usageRows || []).slice().sort((a, b) => Number(b.id) - Number(a.id));
    for (const row of rows) {
        if (remaining <= 0) break;
        // A bill has at most one usage row per category (source_id '<billingId>:<category>').
        const room = Math.max(0, toInt(row.amount_idr) - (credited.get(row.category) || 0));
        if (room <= 0) continue;
        const take = Math.min(remaining, room);
        plan.push({ category: row.category, amount_idr: take });
        remaining -= take;
    }
    return plan;
}

/** Saldo already put back by earlier returns, per category. @returns {Promise<Array<{category, amount_idr}>>} */
async function getReturnCredits(executor, returnIds) {
    const ids = numericIds(returnIds);
    if (!ids.length) return [];
    const [rows] = await executor.query(
        `SELECT category, amount_idr
           FROM patient_credit_ledger
          WHERE source_type = '${SOURCE_RETURN}' AND entry_type = 'return_credit' AND gateway_mode = 'live'
            AND ${sourcePrefixClause(ids)}`,
        ids.map(id => `${id}:%`)
    );
    return (rows || []).map(row => ({ category: row.category, amount_idr: toInt(row.amount_idr) }));
}

async function recordReturnCredit(connection, { returnId, patientId, plan, actor }) {
    await insertLiveRows(connection, {
        patientId, entryType: 'return_credit', sign: 1, sourceType: SOURCE_RETURN, sourceKey: returnId,
        plan, actor, note: `Retur R${returnId} kembali ke saldo`
    });
    return planTotal(plan);
}

async function recordRefundRows(connection, { refundId, patientId, plan, actor }) {
    await insertLiveRows(connection, {
        patientId, entryType: 'refund', sign: -1, sourceType: SOURCE_REFUND, sourceKey: refundId,
        plan, actor, note: `Refund saldo #${refundId}`
    });
    return planTotal(plan);
}

/**
 * Deleting a record or a patient must not erase money history. Refuses a record whose
 * main bill was paid with saldo, and a patient with any live saldo row.
 */
async function assertNoPrepaySaldoEvidence(connection, { mrId, patientId } = {}) {
    let rows;
    if (mrId) {
        [rows] = await connection.query(
            `SELECT l.id
               FROM patient_credit_ledger l
               JOIN sunday_clinic_billings b
                 ON CAST(SUBSTRING_INDEX(l.source_id, ':', 1) AS UNSIGNED) = b.id
              WHERE b.mr_id = ? AND l.source_type = '${SOURCE_BILLING}' AND l.entry_type = 'usage'
                AND l.gateway_mode = 'live'
              LIMIT 1`,
            [mrId]
        );
    } else if (patientId) {
        [rows] = await connection.query(
            `SELECT id FROM patient_credit_ledger WHERE patient_id = ? AND gateway_mode = 'live' LIMIT 1`,
            [patientId]
        );
    } else {
        return;
    }
    if (rows && rows.length) {
        const error = new Error(SALDO_DELETE_BLOCKED);
        error.statusCode = 409;
        throw error;
    }
}

module.exports = {
    SOURCE_PAYMENT_ORDER,
    SOURCE_BILLING,
    SOURCE_RETURN,
    SOURCE_REFUND,
    SALDO_DELETE_BLOCKED,
    creditFromPaidOrder,
    getBalances,
    getLiveBalances,
    lockLiveBalances,
    planUsage,
    recordUsage,
    getUsageForBillings,
    planReturnCredit,
    getReturnCredits,
    recordReturnCredit,
    recordRefundRows,
    assertNoPrepaySaldoEvidence
};
