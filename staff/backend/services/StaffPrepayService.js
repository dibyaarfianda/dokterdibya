'use strict';

/**
 * Staff page "Pembayaran di Muka" (bayar di muka, Tahap 2): prepay orders, patient saldo and
 * its history, saldo refunds, and the package editor (tab Paket).
 *
 * Patient names are read with a separate query (no JOIN on VARCHAR ids across tables with
 * different collations). Refunds lock the patient's live saldo like mark-paid and returns do.
 */

const crypto = require('crypto');
const {
    getBalances,
    lockLiveBalances,
    getPendingRefundHold,
    planUsage,
    recordRefundRows,
    SOURCE_BILLING
} = require('./PatientCreditLedger');
const { orderLabel } = require('../constants/checkupPrepayProducts');
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
                status, gateway_mode, created_at, paid_at, expires_at, item_snapshot
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
        product_label: orderLabel(row),
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

const rupiah = value => Number(value).toLocaleString('id-ID');

/**
 * The refund itself, on a transaction the caller owns (no begin/commit/release here).
 * Live saldo only; never more than live - hold, where hold is the saldo under pending
 * withdrawal requests. `forRequestId` = this refund completes that request, so its own
 * amount is not held against it. The same request_key returns the saved refund (safe retry).
 * Lock order (Tahap 3, same everywhere): live saldo rows, then the pending request rows,
 * then the refund key.
 */
async function createRefundWithin(connection, { patientId, amountIdr, method, reason, requestKey, actor = {}, forRequestId = null }) {
    const cleanReason = validateRefund({ patientId, amountIdr, method, reason, requestKey });
    const hash = refundRequestHash({ patient_id: patientId, amount_idr: amountIdr, method, reason: cleanReason });
    const safeActor = actor || {};
    const balances = await lockLiveBalances(connection, patientId);
    const hold = await getPendingRefundHold(connection, patientId, { forUpdate: true, excludeRequestId: forRequestId });
    const [savedRows] = await connection.query(
        'SELECT id, amount_idr, request_hash FROM patient_credit_refunds WHERE request_key = ? FOR UPDATE',
        [requestKey]
    );
    const saved = savedRows && savedRows[0];
    if (saved) {
        if (saved.request_hash !== hash) throw serviceError('Kunci transaksi sudah digunakan untuk refund berbeda.', 409);
        return { id: Number(saved.id), amount_idr: Number(saved.amount_idr), already_saved: true };
    }
    const live = balances.reduce((sum, entry) => sum + Math.max(0, entry.balance_idr), 0);
    const available = Math.max(0, live - hold);
    if (amountIdr > available) {
        throw serviceError(hold > 0
            ? `Nominal refund melebihi saldo live yang bisa dipakai (Rp ${rupiah(available)}; Rp ${rupiah(hold)} sedang diajukan pencairan).`
            : `Nominal refund melebihi saldo live pasien (Rp ${rupiah(live)}).`);
    }
    const [inserted] = await connection.query(
        `INSERT INTO patient_credit_refunds
            (patient_id, amount_idr, method, reason, request_key, request_hash, created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [patientId, amountIdr, method, cleanReason, requestKey, hash,
            safeActor.id ? String(safeActor.id).substring(0, 64) : null, safeActor.name ? String(safeActor.name).substring(0, 120) : null]
    );
    await recordRefundRows(connection, {
        refundId: inserted.insertId,
        patientId,
        plan: planUsage(balances, amountIdr, null),
        actor: safeActor.name || safeActor.id || null
    });
    return { id: Number(inserted.insertId), amount_idr: amountIdr, already_saved: false };
}

/**
 * Record a saldo refund staff already handed over: createRefundWithin on its own connection
 * and transaction. Invalid input is refused before a connection is taken.
 */
async function createRefund({ patientId, amountIdr, method, reason, requestKey, actor = {} }, { db = require('../db') } = {}) {
    validateRefund({ patientId, amountIdr, method, reason, requestKey });
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await createRefundWithin(connection, { patientId, amountIdr, method, reason, requestKey, actor });
        await connection.commit();
        return result;
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

const PACKAGE_AUDIT_ACTION = 'Paket Bayar di Muka';
const defaultRepository = () => require('./PrepayPackageRepository');
const defaultActivityLogger = () => require('./activityLogger');

const describeWeeks = pkg => (pkg.week_min === null || pkg.week_min === undefined ? 'semua minggu' : `minggu ${pkg.week_min}-${pkg.week_max}`);
const describeItems = items => (items || []).map(item => `${item.item_type}:${item.ref_id}x${item.quantity}`).join(', ') || '-';
const describeActive = pkg => (pkg.is_active ? 'aktif' : 'nonaktif');

/** One line for the activity log: the code, then before -> after of every editable field. */
function packageAuditSummary(code, before, after) {
    if (!before) {
        return `${code} dibuat: "${after.name}", kategori ${after.category}, ${describeWeeks(after)}, ${describeActive(after)}, item ${describeItems(after.items)}`;
    }
    return `${code}: nama "${before.name}" -> "${after.name}"; kategori ${before.category} -> ${after.category}; `
        + `${describeWeeks(before)} -> ${describeWeeks(after)}; ${describeActive(before)} -> ${describeActive(after)}; `
        + `item ${describeItems(before.items)} -> ${describeItems(after.items)}`;
}

async function writePackageAudit(activityLogger, actor, summary) {
    const safeActor = actor || {};
    try {
        await activityLogger.log(safeActor.id || null, safeActor.name || null, PACKAGE_AUDIT_ACTION, summary);
    } catch (_error) {
        // The package is already saved; a failed audit line must not turn that into an error.
    }
}

async function pricedPackage(estimates, id) {
    const priced = await estimates.priceAllForStaff();
    return (priced.packages || []).find(entry => Number(entry.id) === Number(id)) || null;
}

/** All packages (active and inactive) with their live price, ready flag and issues. */
async function listPackagesForStaff({ estimates = defaultEstimates() } = {}) {
    return estimates.priceAllForStaff();
}

/** What the package editor may pick from, plus the admin fee line (tindakan #1, shown not editable). */
async function getCatalog({ db = require('../db'), estimates = defaultEstimates() } = {}) {
    const { ADMIN_TINDAKAN_ID } = require('./CheckupEstimateService');
    const catalog = await estimates.loadCatalog();
    const [adminRows] = await db.query('SELECT id, name, price FROM tindakan WHERE id = ?', [ADMIN_TINDAKAN_ID]);
    const admin = adminRows && adminRows[0];
    return {
        ...catalog,
        admin: admin
            ? { id: Number(admin.id), name: admin.name, price: admin.price === null || admin.price === undefined ? null : Number(admin.price) }
            : { id: ADMIN_TINDAKAN_ID, name: 'Biaya admin', price: null }
    };
}

/**
 * Create (no input.id) or update a package. Input is validated (consultation tindakan refused),
 * then saved with its items in one transaction; the public estimate cache is dropped and the
 * change is written to the activity log. Returns the freshly priced package.
 */
async function savePackage(input, actor, {
    db = require('../db'),
    estimates = defaultEstimates(),
    repository = defaultRepository(),
    activityLogger = defaultActivityLogger()
} = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const isUpdate = source.id !== undefined && source.id !== null;
    const id = isUpdate ? Number(source.id) : null;
    if (isUpdate && (!Number.isSafeInteger(id) || id < 1)) throw serviceError('Paket tidak ditemukan.', 404);

    const tindakanIds = [...new Set((Array.isArray(source.items) ? source.items : [])
        .filter(item => item && item.item_type === 'tindakan')
        .map(item => Number(item.ref_id))
        .filter(ref => Number.isSafeInteger(ref) && ref > 0))];
    const tindakan = new Map();
    if (tindakanIds.length) {
        const [rows] = await db.query('SELECT id, name, category FROM tindakan WHERE id IN (?)', [tindakanIds]);
        (rows || []).forEach(row => tindakan.set(Number(row.id), row));
    }
    const { normalizePackageInput } = require('./CheckupEstimateService');
    const { value, errors } = normalizePackageInput(source, { tindakan });
    if (errors.length) throw serviceError(errors.join('; '));

    const connection = await db.getConnection();
    let before = null;
    let saved;
    try {
        await connection.beginTransaction();
        if (isUpdate) {
            before = (await repository.listPackages(connection)).find(entry => Number(entry.id) === id) || null;
            if (!before) throw serviceError('Paket tidak ditemukan.', 404);
            // An edit that does not mention is_active keeps the package as it is.
            if (source.is_active === undefined || source.is_active === null) value.is_active = before.is_active;
        }
        saved = await repository.savePackage(connection, isUpdate ? { ...value, id } : value, actor);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    estimates.invalidate();
    await writePackageAudit(activityLogger, actor, packageAuditSummary(saved.code, before, value));
    return pricedPackage(estimates, saved.id);
}

/** Switch a package on or off (off = hidden from patients, kept for history). Audited like a save. */
async function setPackageActive(id, active, actor, {
    db = require('../db'),
    estimates = defaultEstimates(),
    repository = defaultRepository(),
    activityLogger = defaultActivityLogger()
} = {}) {
    const packageId = Number(id);
    if (typeof active !== 'boolean') throw serviceError('Status aktif harus true atau false.');
    if (!Number.isSafeInteger(packageId) || packageId < 1) throw serviceError('Paket tidak ditemukan.', 404);
    const before = (await repository.listPackages(db)).find(entry => Number(entry.id) === packageId) || null;
    if (!before) throw serviceError('Paket tidak ditemukan.', 404);
    if (!await repository.setPackageActive(db, packageId, active, actor)) throw serviceError('Paket tidak ditemukan.', 404);
    estimates.invalidate();
    await writePackageAudit(activityLogger, actor, packageAuditSummary(before.code, before, { ...before, is_active: active }));
    return pricedPackage(estimates, packageId);
}

module.exports = {
    listOrders,
    listBalances,
    getPatientLedger,
    createRefund,
    createRefundWithin,
    refundRequestHash,
    listPackagesForStaff,
    getCatalog,
    savePackage,
    setPackageActive
};
