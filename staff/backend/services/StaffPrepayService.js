'use strict';

/**
 * Staff page "Pembayaran di Muka" (bayar di muka, Tahap 2): prepay orders, patient saldo and
 * its history, saldo refunds, and the estimate mapping editor.
 *
 * Patient names are read with a separate query (no JOIN on VARCHAR ids across tables with
 * different collations). Refunds lock the patient's live saldo like mark-paid and returns do.
 */

const crypto = require('crypto');
const {
    getBalances,
    lockLiveBalances,
    planUsage,
    recordRefundRows,
    SOURCE_BILLING
} = require('./PatientCreditLedger');
const { productLabel } = require('../constants/checkupPrepayProducts');
const { CONSULTATION_CATEGORIES } = require('../constants/consultationCategories');

const ORDER_LIMIT = 500;
const LEDGER_LIMIT = 500;
const REFUND_METHODS = ['tunai', 'transfer'];

function serviceError(message, statusCode = 400) {
    return Object.assign(new Error(message), { statusCode });
}

const categoryLabel = code => CONSULTATION_CATEGORIES[code] || code;

async function patientNames(db, patientIds) {
    const ids = [...new Set((patientIds || []).filter(Boolean).map(String))];
    if (!ids.length) return new Map();
    const [rows] = await db.query('SELECT id, full_name FROM patients WHERE id IN (?)', [ids]);
    return new Map((rows || []).map(row => [String(row.id), row.full_name]));
}

const nameOr = (names, patientId) => {
    const name = names.get(String(patientId));
    return name && String(name).trim() ? name : String(patientId || '-');
};

/** Prepay orders, newest first. Filters are validated by the route. */
async function listOrders({ status = 'paid', mode = 'live', from = null, to = null } = {}, { db = require('../db') } = {}) {
    const where = ["order_type = 'checkup_prepay'"];
    const params = [];
    if (status && status !== 'all') { where.push('status = ?'); params.push(status); }
    if (mode && mode !== 'all') { where.push('gateway_mode = ?'); params.push(mode); }
    if (from) { where.push('DATE(COALESCE(paid_at, created_at)) >= ?'); params.push(from); }
    if (to) { where.push('DATE(COALESCE(paid_at, created_at)) <= ?'); params.push(to); }
    const [rows] = await db.query(
        `SELECT order_ref, patient_id, product_code, amount_idr, fee_idr, payment_method, va_number,
                status, gateway_mode, created_at, paid_at, expires_at
           FROM payment_orders
          WHERE ${where.join(' AND ')}
          ORDER BY COALESCE(paid_at, created_at) DESC, id DESC
          LIMIT ${ORDER_LIMIT}`,
        params
    );
    const names = await patientNames(db, (rows || []).map(row => row.patient_id));
    return (rows || []).map(row => ({
        order_ref: row.order_ref,
        patient_id: row.patient_id,
        patient_name: nameOr(names, row.patient_id),
        product_code: row.product_code,
        product_label: productLabel(row.product_code),
        amount_idr: Number(row.amount_idr) || 0,
        fee_idr: row.fee_idr === null || row.fee_idr === undefined ? null : Number(row.fee_idr),
        payment_method: row.payment_method,
        va_number: row.va_number || null,
        status: row.status,
        gateway_mode: row.gateway_mode,
        created_at: row.created_at,
        paid_at: row.paid_at || null,
        expires_at: row.expires_at || null
    }));
}

/** Patients with a non-zero saldo in one gateway mode, split per category. */
async function listBalances({ mode = 'live' } = {}, { db = require('../db') } = {}) {
    const [rows] = await db.query(
        `SELECT patient_id, category, SUM(amount_idr) AS balance_idr
           FROM patient_credit_ledger
          WHERE gateway_mode = ?
          GROUP BY patient_id, category
         HAVING SUM(amount_idr) <> 0
          ORDER BY patient_id, category`,
        [mode]
    );
    const byPatient = new Map();
    for (const row of rows || []) {
        const entry = byPatient.get(row.patient_id) || { patient_id: row.patient_id, gateway_mode: mode, total_idr: 0, categories: [] };
        const balance = Number(row.balance_idr) || 0;
        entry.total_idr += balance;
        entry.categories.push({ category: row.category, label: categoryLabel(row.category), balance_idr: balance });
        byPatient.set(row.patient_id, entry);
    }
    const names = await patientNames(db, [...byPatient.keys()]);
    return [...byPatient.values()]
        .map(entry => ({ ...entry, patient_name: nameOr(names, entry.patient_id) }))
        .sort((a, b) => b.total_idr - a.total_idr);
}

/** One patient's saldo per mode and the newest ledger rows (usage rows carry their DRD). */
async function getPatientLedger(patientId, { db = require('../db') } = {}) {
    const names = await patientNames(db, [patientId]);
    const balances = await getBalances(patientId, { db });
    const [rows] = await db.query(
        `SELECT id, entry_type, category, amount_idr, gateway_mode, source_type, source_id, note, created_by, created_at
           FROM patient_credit_ledger
          WHERE patient_id = ?
          ORDER BY id DESC
          LIMIT ${LEDGER_LIMIT}`,
        [patientId]
    );
    const billingIds = (rows || [])
        .filter(row => row.source_type === SOURCE_BILLING)
        .map(row => Number(String(row.source_id).split(':')[0]))
        .filter(id => Number.isSafeInteger(id) && id > 0);
    let mrByBilling = new Map();
    if (billingIds.length) {
        const [bills] = await db.query('SELECT id, mr_id FROM sunday_clinic_billings WHERE id IN (?)', [[...new Set(billingIds)]]);
        mrByBilling = new Map((bills || []).map(bill => [String(bill.id), bill.mr_id]));
    }
    const split = mode => balances
        .filter(entry => entry.gateway_mode === mode)
        .map(entry => ({ category: entry.category, label: categoryLabel(entry.category), balance_idr: entry.balance_idr }));
    return {
        patient: { id: patientId, name: nameOr(names, patientId) },
        balances: { live: split('live'), sandbox: split('sandbox') },
        entries: (rows || []).map(row => ({
            id: Number(row.id),
            entry_type: row.entry_type,
            category: row.category,
            category_label: categoryLabel(row.category),
            amount_idr: Number(row.amount_idr) || 0,
            gateway_mode: row.gateway_mode,
            source_type: row.source_type,
            source_id: row.source_id,
            mr_id: row.source_type === SOURCE_BILLING ? (mrByBilling.get(String(row.source_id).split(':')[0]) || null) : null,
            note: row.note,
            created_by: row.created_by,
            created_at: row.created_at
        }))
    };
}

function refundRequestHash({ patient_id, amount_idr, method, reason }) {
    return crypto.createHash('sha256')
        .update(JSON.stringify({ patient_id: String(patient_id), amount_idr: Number(amount_idr), method, reason: String(reason || '').trim() }))
        .digest('hex');
}

function validateRefund({ patientId, amountIdr, method, reason, requestKey }) {
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(String(patientId || ''))) throw serviceError('Pasien tidak valid.');
    if (!Number.isSafeInteger(amountIdr) || amountIdr < 1) throw serviceError('Nominal refund harus bilangan bulat rupiah.');
    if (!REFUND_METHODS.includes(method)) throw serviceError('Pilih tunai atau transfer untuk refund.');
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed || trimmed.length > 2000) throw serviceError('Alasan refund wajib diisi (maksimal 2000 karakter).');
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(String(requestKey || ''))) throw serviceError('Kunci transaksi refund tidak valid.');
    return trimmed;
}

/**
 * Record a saldo refund staff already handed over. Live saldo only; never more than the
 * live balance. The same request_key returns the saved refund (safe retry).
 */
async function createRefund({ patientId, amountIdr, method, reason, requestKey, actor = {} }, { db = require('../db') } = {}) {
    const cleanReason = validateRefund({ patientId, amountIdr, method, reason, requestKey });
    const hash = refundRequestHash({ patient_id: patientId, amount_idr: amountIdr, method, reason: cleanReason });
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [savedRows] = await connection.query(
            'SELECT id, amount_idr, request_hash FROM patient_credit_refunds WHERE request_key = ? FOR UPDATE',
            [requestKey]
        );
        const saved = savedRows && savedRows[0];
        if (saved) {
            if (saved.request_hash !== hash) throw serviceError('Kunci transaksi sudah digunakan untuk refund berbeda.', 409);
            await connection.commit();
            return { id: Number(saved.id), amount_idr: Number(saved.amount_idr), already_saved: true };
        }
        const balances = await lockLiveBalances(connection, patientId);
        const live = balances.reduce((sum, entry) => sum + Math.max(0, entry.balance_idr), 0);
        if (amountIdr > live) {
            throw serviceError(`Nominal refund melebihi saldo live pasien (Rp ${live.toLocaleString('id-ID')}).`);
        }
        const [inserted] = await connection.query(
            `INSERT INTO patient_credit_refunds
                (patient_id, amount_idr, method, reason, request_key, request_hash, created_by, created_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [patientId, amountIdr, method, cleanReason, requestKey, hash,
                actor.id ? String(actor.id).substring(0, 64) : null, actor.name ? String(actor.name).substring(0, 120) : null]
        );
        await recordRefundRows(connection, {
            refundId: inserted.insertId,
            patientId,
            plan: planUsage(balances, amountIdr, null),
            actor: actor.name || actor.id || null
        });
        await connection.commit();
        return { id: Number(inserted.insertId), amount_idr: amountIdr, already_saved: false };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

function defaultEstimates() {
    return require('./CheckupEstimateService').getCheckupEstimateService();
}

/** Mapping, priced products, and the tindakan staff may pick (same list as the CLI). */
async function getEstimateMapping({ db = require('../db'), estimates = defaultEstimates() } = {}) {
    const { ALLOWED_SERVICE_CATEGORIES, ADMIN_TINDAKAN_ID } = require('./CheckupEstimateService');
    const { mapping, errors } = await estimates.loadMapping();
    const priced = await estimates.priceAll({ fresh: true });
    const [tindakan] = await db.query(
        `SELECT id, code, name, category, price FROM tindakan
          WHERE is_active = 1 AND (category IN (?, ?) OR id = ?)
          ORDER BY category, name`,
        [...ALLOWED_SERVICE_CATEGORIES, ADMIN_TINDAKAN_ID]
    );
    return { mapping, mapping_errors: errors, categories: priced.categories, tindakan: tindakan || [], admin_tindakan_id: ADMIN_TINDAKAN_ID };
}

/** Save like the CLI: invalid input is refused (400); an under-minimum product is saved but not ready. */
async function saveEstimateMapping(mapping, { estimates = defaultEstimates() } = {}) {
    let stored;
    try {
        stored = await estimates.saveMapping(mapping);
    } catch (error) {
        throw serviceError(error.message || 'Pemetaan estimasi tidak valid.');
    }
    const priced = await estimates.priceAll({ fresh: true });
    return { mapping: stored, categories: priced.categories };
}

module.exports = {
    listOrders,
    listBalances,
    getPatientLedger,
    createRefund,
    refundRequestHash,
    getEstimateMapping,
    saveEstimateMapping
};
