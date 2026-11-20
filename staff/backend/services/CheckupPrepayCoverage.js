'use strict';

/**
 * How much of a Klinik Privat main bill is (or will be) paid from the patient's live prepay
 * saldo. The ONLY place that computes "amount still due": the cashier panel, the invoice PDF
 * and the billing GET all read it from here (closing reads the usage rows directly).
 *
 * - confirmed bill: 'preview' from the current live balance (not locked; mark-paid re-checks
 *   under a lock and refuses with 409 when the number changed);
 * - paid bill with usage rows: 'used';
 * - anything else: 'none'.
 */

const { getLiveBalances, getPendingRefundHold, getUsageForBillings } = require('./PatientCreditLedger');

const round2 = value => Math.round(Number(value) * 100) / 100;

function coverage(mode, total, { live = 0, deduct = 0, used = [] } = {}) {
    return {
        mode,
        live_balance_idr: live,
        deduct_idr: deduct,
        remaining_due_idr: round2((Number(total) || 0) - deduct),
        used
    };
}

async function forBilling(executor, billing) {
    if (!billing) return coverage('none', 0);
    const total = Number(billing.total) || 0;

    if (billing.status === 'paid') {
        const usage = (await getUsageForBillings(executor, [billing.id])).get(String(billing.id));
        if (!usage || usage.used_idr <= 0) return coverage('none', total);
        return coverage('used', total, {
            deduct: usage.used_idr,
            used: usage.rows.map(row => ({ category: row.category, amount_idr: row.amount_idr }))
        });
    }

    if (billing.status === 'confirmed' && billing.patient_id) {
        const balances = await getLiveBalances(executor, billing.patient_id);
        const live = balances.reduce((sum, entry) => sum + Math.max(0, Number(entry.balance_idr) || 0), 0);
        // Tahap 3: saldo under a pending withdrawal request is held (plain read: preview only).
        const hold = live > 0 ? await getPendingRefundHold(executor, billing.patient_id) : 0;
        const deduct = Math.min(Math.max(0, live - hold), Math.max(0, Math.floor(total)));
        if (deduct <= 0) return coverage('none', total);
        return coverage('preview', total, { live, deduct });
    }

    return coverage('none', total);
}

async function withPrepay(executor, billing) {
    if (!billing) return billing;
    return { ...billing, prepay: await forBilling(executor, billing) };
}

module.exports = { forBilling, withPrepay };
