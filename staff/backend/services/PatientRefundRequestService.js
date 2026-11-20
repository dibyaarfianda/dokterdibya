'use strict';

/**
 * Bayar di muka, Tahap 3: a patient asks to withdraw live prepay saldo to a bank account
 * (portal "Saldo Saya"); staff transfer it by hand and close the request ("Sudah ditransfer"),
 * which records the refund (StaffPrepayService.createRefundWithin) in the same transaction.
 *
 * - Only live saldo can be withdrawn; sandbox saldo ("Saldo uji") never.
 * - A pending request HOLDS its amount: every spend uses live - hold (PatientCreditLedger).
 * - One pending request per patient. The client's request_key makes a retry safe.
 * - Lock order everywhere: lockLiveBalances(patient), then the request rows FOR UPDATE,
 *   then ledger/refund writes.
 * - The full account number is returned only to its owner and to staff holding billing.reset
 *   (canSeeAccount). It never goes to a log line, the activity log or a broadcast: those use
 *   maskAccount.
 *
 * Patient-facing functions throw PremiumError (the patient routes map it); staff-facing
 * functions throw errors carrying statusCode (the staff route maps it).
 */

const { PremiumError } = require('./PremiumPaymentService');
const {
    getBalances,
    lockLiveBalances,
    getPendingRefundRequests,
    getPendingRefundHold,
    SOURCE_BILLING
} = require('./PatientCreditLedger');
const { CONSULTATION_CATEGORIES } = require('../constants/consultationCategories');

const MIN_AMOUNT_IDR = 10000;
const PATIENT_LIST_LIMIT = 100;
const STAFF_CLOSED_LIMIT = 100;
const HISTORY_LIMIT = 100;
const EVENT_REQUESTED = 'checkup_prepay_refund_requested';
const ACTIVITY_ACTION = 'Pencairan Saldo';

const PATIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const ACCOUNT_PATTERN = /^\d{6,20}$/;
const REQUEST_KEY_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;
const REQUEST_ID_PATTERN = /^[1-9]\d{0,15}$/;
const TITLE_PATTERN = /\b(?:ny|nn|tn|ibu|bapak|bpk|sdr|dr)\b\.?/gi;

const REQUEST_COLUMNS = `id, patient_id, amount_idr, bank_name, account_number, account_holder, status,
       request_key, refund_id, decision_note, decided_by, decided_at, created_at`;

const MESSAGES = Object.freeze({
    invalidPatient: 'Pasien tidak valid.',
    amount: 'Nominal pencairan minimal Rp 10.000 dan harus bilangan bulat rupiah.',
    bank: 'Nama bank wajib diisi (2–60 karakter).',
    account: 'Nomor rekening harus 6–20 digit angka.',
    holder: 'Nama pemilik rekening wajib diisi (3–120 karakter).',
    requestKey: 'Kunci pengajuan tidak valid. Muat ulang halaman lalu coba lagi.',
    sandbox: 'Saldo uji tidak dapat dicairkan',
    pending: 'Masih ada pengajuan pencairan yang sedang diproses.',
    keyUsed: 'Kunci pengajuan sudah dipakai. Muat ulang halaman lalu coba lagi.',
    keyReused: 'Kunci pengajuan sudah dipakai untuk data berbeda. Muat ulang halaman lalu ajukan lagi.',
    notFound: 'Pengajuan pencairan tidak ditemukan.',
    notCancellable: 'Pengajuan ini sudah diproses dan tidak dapat dibatalkan.',
    closed: 'Pengajuan ini sudah ditutup.',
    cancelledByPatient: 'Pasien sudah membatalkan pengajuan ini. Bila uang sudah ditransfer, catat sebagai refund langsung di tab Saldo.',
    note: 'Alasan penolakan wajib diisi (3–500 karakter).'
});

const toInt = value => Math.trunc(Number(value) || 0);
const rupiah = value => Number(value).toLocaleString('id-ID');
const positiveSum = rows => (rows || []).reduce((sum, row) => sum + Math.max(0, toInt(row.balance_idr)), 0);
const cleanText = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const toId = value => (value === null || value === undefined ? null : Number(value));

function serviceError(message, statusCode = 400) {
    return Object.assign(new Error(message), { statusCode });
}

function maskAccount(number) {
    const value = number === null || number === undefined ? '' : String(number);
    return `•••• ${value.slice(-4)}`;
}

function normalizeName(value) {
    return String(value || '')
        .replace(TITLE_PATTERN, ' ')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/** "nama berbeda": the holder is not the patient, ignoring titles, dots, spacing and case. */
function holderNameDiffers(holder, patientName) {
    return normalizeName(holder) !== normalizeName(patientName);
}

function parseRequestId(id) {
    const text = String(id === null || id === undefined ? '' : id);
    return REQUEST_ID_PATTERN.test(text) ? Number(text) : null;
}

function createPatientRefundRequestService({
    db,
    staffPrepay,
    realtime = null,
    logger = null,
    activityLogger = null
} = {}) {
    // Resolved on use so a test (or a caller) never loads Socket.IO, winston or the pool it did not ask for.
    const rt = () => realtime || require('../realtime-sync');
    const log = () => logger || require('../utils/logger');
    const activity = () => activityLogger || require('./activityLogger');

    async function inTransaction(work) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const result = await work(connection);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async function findRequest(executor, id, { patientId = null, forUpdate = false } = {}) {
        const [rows] = await executor.query(
            `SELECT ${REQUEST_COLUMNS}
               FROM patient_credit_refund_requests
              WHERE id = ?${patientId ? ' AND patient_id = ?' : ''}${forUpdate ? ' FOR UPDATE' : ''}`,
            patientId ? [id, patientId] : [id]
        );
        return (rows && rows[0]) || null;
    }

    async function findByKey(executor, requestKey) {
        const [rows] = await executor.query(
            `SELECT id, patient_id, status, amount_idr, bank_name, account_number, account_holder
               FROM patient_credit_refund_requests WHERE request_key = ? LIMIT 1`,
            [requestKey]
        );
        return (rows && rows[0]) || null;
    }

    /**
     * A retry key hit answers with the saved request only when it is the same patient and the
     * same payload (normalised as on insert). A key reused for different data is refused, like
     * a refund key with a different request_hash: a corrected account number must never be
     * answered with the old request.
     */
    function savedRequestFor(saved, { patientId, amount, bank, account, holder }) {
        if (!saved || String(saved.patient_id) !== patientId) throw new PremiumError('REQUEST_KEY_USED', MESSAGES.keyUsed, 409);
        const samePayload = toInt(saved.amount_idr) === amount
            && String(saved.bank_name) === bank
            && String(saved.account_number) === account
            && String(saved.account_holder) === holder;
        if (!samePayload) throw new PremiumError('REQUEST_KEY_REUSED', MESSAGES.keyReused, 409);
        return { id: Number(saved.id), status: saved.status };
    }

    async function closeRequest(connection, id, { status, refundId = null, note = null, decidedBy = null }) {
        const [result] = await connection.query(
            `UPDATE patient_credit_refund_requests
                SET status = ?, refund_id = ?, decision_note = ?, decided_by = ?, decided_at = NOW()
              WHERE id = ? AND status = 'pending'`,
            [status, refundId, note, decidedBy, id]
        );
        return Boolean(result && result.affectedRows === 1);
    }

    const decidedBy = actor => {
        const value = actor && (actor.name || actor.id);
        return value ? String(value).substring(0, 64) : null;
    };

    function safeLog(level, message, detail) {
        try {
            log()[level](message, detail);
        } catch (_error) {
            // Logging must never break a money operation.
        }
    }

    async function safeActivity(actor, details) {
        try {
            await activity().log(actor && actor.id ? actor.id : null, actor && actor.name ? actor.name : null, ACTIVITY_ACTION, details);
        } catch (_error) {
            // The activity log is best effort, like everywhere else in the panel.
        }
    }

    function validateRequest({ patient, amountIdr, bankName, accountNumber, accountHolder, requestKey }) {
        const patientId = patient && typeof patient.id === 'string' ? patient.id : '';
        if (!PATIENT_ID_PATTERN.test(patientId)) throw new PremiumError('INVALID_PATIENT', MESSAGES.invalidPatient, 400);
        if (!Number.isSafeInteger(amountIdr) || amountIdr < MIN_AMOUNT_IDR) throw new PremiumError('INVALID_AMOUNT', MESSAGES.amount, 400);
        const bank = cleanText(bankName);
        if (bank.length < 2 || bank.length > 60) throw new PremiumError('INVALID_BANK', MESSAGES.bank, 400);
        const account = typeof accountNumber === 'string' ? accountNumber.trim() : '';
        if (!ACCOUNT_PATTERN.test(account)) throw new PremiumError('INVALID_ACCOUNT', MESSAGES.account, 400);
        const holder = cleanText(accountHolder);
        if (holder.length < 3 || holder.length > 120) throw new PremiumError('INVALID_HOLDER', MESSAGES.holder, 400);
        if (typeof requestKey !== 'string' || !REQUEST_KEY_PATTERN.test(requestKey)) {
            throw new PremiumError('INVALID_REQUEST_KEY', MESSAGES.requestKey, 400);
        }
        return { patientId, amount: amountIdr, bank, account, holder, key: requestKey };
    }

    /**
     * Patient asks to withdraw `amountIdr` of live saldo. Returns { id, status }; the same
     * request_key with the same payload returns the saved request, with different data 409.
     */
    async function createRequest(input = {}) {
        const payload = validateRequest(input);
        const { patientId, amount, bank, account, holder, key } = payload;
        let outcome;
        try {
            outcome = await inTransaction(async connection => {
                const balances = await lockLiveBalances(connection, patientId);
                const pending = await getPendingRefundRequests(connection, patientId, { forUpdate: true });
                // Plain read: the first consistent read of this transaction, taken after the saldo
                // lock, so it also sees the patient's own pending request. Checked before the
                // one-pending rule so a safe retry is answered, never refused.
                const saved = await findByKey(connection, key);
                if (saved) return { ...savedRequestFor(saved, payload), created: false };

                const live = positiveSum(balances);
                if (live <= 0) {
                    const sandbox = positiveSum((await getBalances(patientId, { db: connection })).filter(row => row.gateway_mode === 'sandbox'));
                    if (sandbox > 0) throw new PremiumError('SANDBOX_SALDO', MESSAGES.sandbox, 400);
                }
                const hold = pending.reduce((sum, row) => sum + Math.max(0, row.amount_idr), 0);
                const available = Math.max(0, live - hold);
                if (amount > available) {
                    throw new PremiumError('AMOUNT_ABOVE_AVAILABLE', `Nominal melebihi saldo yang dapat dicairkan (Rp ${rupiah(available)}).`, 400);
                }
                if (pending.length) throw new PremiumError('REQUEST_PENDING', MESSAGES.pending, 409);

                const [inserted] = await connection.query(
                    `INSERT INTO patient_credit_refund_requests
                        (patient_id, amount_idr, bank_name, account_number, account_holder, request_key)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [patientId, amount, bank, account, holder, key]
                );
                return { id: Number(inserted.insertId), status: 'pending', created: true };
            });
        } catch (error) {
            if (!error || error.code !== 'ER_DUP_ENTRY') throw error;
            // Same key inserted concurrently (rolled back already): the same rule as above.
            return savedRequestFor(await findByKey(db, key), payload);
        }

        if (outcome.created) {
            const patientName = input.patient && String(input.patient.name || '').trim() ? String(input.patient.name).trim() : patientId;
            safeLog('info', '[PatientRefundRequest] Withdrawal requested', {
                id: outcome.id, patient_id: patientId, amount_idr: amount, bank, account: maskAccount(account)
            });
            try {
                rt().broadcast({
                    type: EVENT_REQUESTED,
                    id: outcome.id,
                    patientName,
                    amount_idr: amount,
                    timestamp: new Date().toISOString()
                });
            } catch (_error) {
                // A missed toast is fine; the red dot still lights up from the table.
            }
        }
        return { id: outcome.id, status: outcome.status };
    }

    /** The patient cancels their own pending request; the hold is released. */
    async function cancelRequest({ patientId, id } = {}) {
        const requestId = parseRequestId(id);
        const owner = typeof patientId === 'string' && PATIENT_ID_PATTERN.test(patientId) ? patientId : null;
        if (!requestId || !owner) throw new PremiumError('REQUEST_NOT_FOUND', MESSAGES.notFound, 404);
        const first = await findRequest(db, requestId, { patientId: owner });
        if (!first) throw new PremiumError('REQUEST_NOT_FOUND', MESSAGES.notFound, 404);

        const result = await inTransaction(async connection => {
            await lockLiveBalances(connection, owner);
            const request = await findRequest(connection, requestId, { patientId: owner, forUpdate: true });
            if (!request) throw new PremiumError('REQUEST_NOT_FOUND', MESSAGES.notFound, 404);
            if (request.status === 'cancelled') return { id: requestId, status: 'cancelled', changed: false };
            if (request.status !== 'pending') throw new PremiumError('REQUEST_CLOSED', MESSAGES.notCancellable, 409);
            if (!await closeRequest(connection, requestId, { status: 'cancelled' })) {
                throw new PremiumError('REQUEST_CLOSED', MESSAGES.notCancellable, 409);
            }
            return { id: requestId, status: 'cancelled', changed: true, request };
        });
        if (result.changed) {
            safeLog('info', '[PatientRefundRequest] Withdrawal cancelled by patient', {
                id: requestId, patient_id: owner, amount_idr: toInt(result.request.amount_idr), account: maskAccount(result.request.account_number)
            });
        }
        return { id: requestId, status: 'cancelled' };
    }

    /**
     * Staff transferred the money ("Sudah ditransfer"): one transaction locks the saldo and the
     * request, records the refund (method transfer, the full amount) and closes the request.
     * A second call returns the saved result.
     */
    async function completeRequest({ id, actor = {} } = {}) {
        const requestId = parseRequestId(id);
        if (!requestId) throw serviceError(MESSAGES.notFound, 404);
        const first = await findRequest(db, requestId);
        if (!first) throw serviceError(MESSAGES.notFound, 404);

        const result = await inTransaction(async connection => {
            await lockLiveBalances(connection, first.patient_id);
            const request = await findRequest(connection, requestId, { forUpdate: true });
            if (!request || String(request.patient_id) !== String(first.patient_id)) throw serviceError(MESSAGES.notFound, 404);
            if (request.status === 'done') return { refundId: toId(request.refund_id), changed: false };
            // Staff may already have transferred by hand: point them to a direct refund instead of
            // a bare "closed", or the payout is never recorded against the saldo.
            if (request.status === 'cancelled') throw serviceError(MESSAGES.cancelledByPatient, 409);
            if (request.status !== 'pending') throw serviceError(MESSAGES.closed, 409);

            const refund = await staffPrepay.createRefundWithin(connection, {
                patientId: String(request.patient_id),
                amountIdr: toInt(request.amount_idr),
                method: 'transfer',
                reason: `Pencairan atas permintaan pasien #${requestId}`,
                requestKey: `refund-request-${requestId}`,
                actor,
                forRequestId: requestId
            });
            if (!await closeRequest(connection, requestId, { status: 'done', refundId: refund.id, decidedBy: decidedBy(actor) })) {
                throw serviceError(MESSAGES.closed, 409);
            }
            return { refundId: refund.id, changed: true, request };
        });

        if (result.changed) {
            const { request } = result;
            const amount = toInt(request.amount_idr);
            safeLog('info', '[PatientRefundRequest] Withdrawal transferred', {
                id: requestId, patient_id: request.patient_id, amount_idr: amount, refund_id: result.refundId, account: maskAccount(request.account_number)
            });
            await safeActivity(actor, `Pengajuan pencairan #${requestId} sudah ditransfer: Rp ${rupiah(amount)} ke ${request.bank_name} ${maskAccount(request.account_number)} (pasien ${request.patient_id}, refund #${result.refundId})`);
        }
        return { id: requestId, status: 'done', refund_id: result.refundId };
    }

    /** Staff refuse a pending request with a note ("Tolak"); the hold is released. */
    async function rejectRequest({ id, note, actor = {} } = {}) {
        const requestId = parseRequestId(id);
        const cleanNote = typeof note === 'string' ? note.trim() : '';
        if (cleanNote.length < 3 || cleanNote.length > 500) throw serviceError(MESSAGES.note);
        if (!requestId) throw serviceError(MESSAGES.notFound, 404);
        const first = await findRequest(db, requestId);
        if (!first) throw serviceError(MESSAGES.notFound, 404);

        const result = await inTransaction(async connection => {
            await lockLiveBalances(connection, first.patient_id);
            const request = await findRequest(connection, requestId, { forUpdate: true });
            if (!request || String(request.patient_id) !== String(first.patient_id)) throw serviceError(MESSAGES.notFound, 404);
            if (request.status === 'rejected') return { changed: false };
            if (request.status !== 'pending') throw serviceError(MESSAGES.closed, 409);
            if (!await closeRequest(connection, requestId, { status: 'rejected', note: cleanNote, decidedBy: decidedBy(actor) })) {
                throw serviceError(MESSAGES.closed, 409);
            }
            return { changed: true, request };
        });

        if (result.changed) {
            const { request } = result;
            const amount = toInt(request.amount_idr);
            safeLog('info', '[PatientRefundRequest] Withdrawal rejected', {
                id: requestId, patient_id: request.patient_id, amount_idr: amount, account: maskAccount(request.account_number)
            });
            // The free-text note stays out of the log (it is saved on the request for the patient and staff).
            await safeActivity(actor, `Pengajuan pencairan #${requestId} ditolak: Rp ${rupiah(amount)} ke ${request.bank_name} ${maskAccount(request.account_number)} (pasien ${request.patient_id})`);
        }
        return { id: requestId, status: 'rejected' };
    }

    const toPatientRow = row => ({
        id: Number(row.id),
        amount_idr: toInt(row.amount_idr),
        bank_name: row.bank_name,
        account_number: row.account_number,
        account_holder: row.account_holder,
        status: row.status,
        decision_note: row.decision_note || null,
        created_at: row.created_at,
        decided_at: row.decided_at || null
    });

    /** The patient's own requests, newest first, with the full account number. */
    async function listForPatient(patientId) {
        const [rows] = await db.query(
            `SELECT ${REQUEST_COLUMNS}
               FROM patient_credit_refund_requests
              WHERE patient_id = ? ORDER BY id DESC
              LIMIT ${PATIENT_LIST_LIMIT}`,
            [patientId]
        );
        return (rows || []).map(toPatientRow);
    }

    async function patientNames(patientIds) {
        const ids = [...new Set((patientIds || []).filter(Boolean).map(String))];
        if (!ids.length) return new Map();
        const [rows] = await db.query('SELECT id, full_name FROM patients WHERE id IN (?)', [ids]);
        return new Map((rows || []).map(row => [String(row.id), row.full_name]));
    }

    /**
     * Staff tab "Pencairan": pending first (oldest first), then the last 100 closed (newest
     * first). account_number is full only when the caller holds billing.reset (canSeeAccount).
     */
    async function listForStaff({ canSeeAccount = false } = {}) {
        const [pending] = await db.query(
            `SELECT ${REQUEST_COLUMNS}
               FROM patient_credit_refund_requests
              WHERE status = 'pending'
              ORDER BY created_at, id`
        );
        const [closed] = await db.query(
            `SELECT ${REQUEST_COLUMNS}
               FROM patient_credit_refund_requests
              WHERE status <> 'pending'
              ORDER BY COALESCE(decided_at, created_at) DESC, id DESC
              LIMIT ${STAFF_CLOSED_LIMIT}`
        );
        const rows = [...(pending || []), ...(closed || [])];
        const names = await patientNames(rows.map(row => row.patient_id));
        return rows.map(row => {
            const fullName = names.get(String(row.patient_id));
            const hasName = Boolean(fullName && String(fullName).trim());
            return {
                id: Number(row.id),
                patient_id: row.patient_id,
                patient_name: hasName ? fullName : String(row.patient_id || '-'),
                amount_idr: toInt(row.amount_idr),
                bank_name: row.bank_name,
                account_number: canSeeAccount ? row.account_number : maskAccount(row.account_number),
                account_holder: row.account_holder,
                name_differs: holderNameDiffers(row.account_holder, hasName ? fullName : ''),
                status: row.status,
                decision_note: row.decision_note || null,
                refund_id: toId(row.refund_id),
                decided_by: row.decided_by || null,
                decided_at: row.decided_at || null,
                created_at: row.created_at
            };
        });
    }

    /** Portal "Saldo Saya": totals per mode, what can be withdrawn now, history and requests. */
    async function getSaldo(patientId) {
        const balances = await getBalances(patientId, { db });
        const live = positiveSum(balances.filter(row => row.gateway_mode === 'live'));
        const sandbox = positiveSum(balances.filter(row => row.gateway_mode === 'sandbox'));
        const hold = live > 0 ? await getPendingRefundHold(db, patientId) : 0;
        const [rows] = await db.query(
            `SELECT id, entry_type, category, amount_idr, gateway_mode, source_type, source_id, created_at
               FROM patient_credit_ledger
              WHERE patient_id = ?
              ORDER BY id DESC
              LIMIT ${HISTORY_LIMIT}`,
            [patientId]
        );
        const billingIdOf = row => Number(String(row.source_id).split(':')[0]);
        const billingIds = [...new Set((rows || [])
            .filter(row => row.source_type === SOURCE_BILLING)
            .map(billingIdOf)
            .filter(billingId => Number.isSafeInteger(billingId) && billingId > 0))];
        let mrByBilling = new Map();
        if (billingIds.length) {
            const [bills] = await db.query('SELECT id, mr_id FROM sunday_clinic_billings WHERE id IN (?)', [billingIds]);
            mrByBilling = new Map((bills || []).map(bill => [String(bill.id), bill.mr_id]));
        }
        return {
            balances: { live, sandbox },
            available_idr: Math.max(0, live - hold),
            history: (rows || []).map(row => ({
                entry_type: row.entry_type,
                category_label: CONSULTATION_CATEGORIES[row.category] || row.category,
                amount_idr: toInt(row.amount_idr),
                gateway_mode: row.gateway_mode,
                created_at: row.created_at,
                mr_id: row.source_type === SOURCE_BILLING ? (mrByBilling.get(String(billingIdOf(row))) || null) : null
            })),
            requests: await listForPatient(patientId)
        };
    }

    return {
        createRequest,
        cancelRequest,
        completeRequest,
        rejectRequest,
        listForPatient,
        listForStaff,
        getSaldo
    };
}

let defaultService = null;
function getPatientRefundRequestService() {
    if (!defaultService) {
        defaultService = createPatientRefundRequestService({
            db: require('../db'),
            staffPrepay: require('./StaffPrepayService')
        });
    }
    return defaultService;
}

module.exports = {
    EVENT_REQUESTED,
    MIN_AMOUNT_IDR,
    createPatientRefundRequestService,
    getPatientRefundRequestService,
    holderNameDiffers,
    maskAccount
};
