'use strict';

const crypto = require('crypto');
const db = require('../db');
const { ROLE_NAMES } = require('../constants/roles');
const { AppError } = require('../middleware/errorHandler');
const { formatDateLocal } = require('../utils/date');

const PRIVATE_CLINIC_LOCATION = 'klinik_private';
const ADMIN_ITEM_CODES = new Set(['S01', 'S02', 'S03', 'S04']);
const MONEY_EPSILON = 0.005;

function normalizeMoney(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function normalizeDateOnly(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
        if (match) return match[1];
    }
    return formatDateLocal(value) || null;
}

function latestSunday(dateValue) {
    const [year, month, day] = dateValue.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
}

function parseClinicDate(value, options = {}) {
    const today = options.today || formatDateLocal();
    const candidate = value || latestSunday(today);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(candidate))) {
        throw new AppError('Tanggal closing harus menggunakan format YYYY-MM-DD.', 400, true, 'INVALID_CLOSING_DATE');
    }

    const [year, month, day] = String(candidate).split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    const isValid = parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;

    if (!isValid) {
        throw new AppError('Tanggal closing tidak valid.', 400, true, 'INVALID_CLOSING_DATE');
    }
    if (candidate > today) {
        throw new AppError('Tanggal closing tidak boleh berada di masa depan.', 400, true, 'FUTURE_CLOSING_DATE');
    }
    if (parsed.getUTCDay() !== 0) {
        throw new AppError('Closing Sunday Clinic hanya dapat dibuat untuk hari Minggu.', 400, true, 'CLOSING_DATE_NOT_SUNDAY');
    }

    return String(candidate);
}

function parseJson(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_error) {
        return fallback;
    }
}

function classifyRevenueItem(item = {}) {
    const itemCode = String(item.item_code || item.code || '').trim().toUpperCase();
    const itemType = String(item.item_type || item.type || '').trim().toLowerCase();
    if (ADMIN_ITEM_CODES.has(itemCode) || itemType === 'admin' || itemType === 'administratif') {
        return 'administratif';
    }
    if (itemType === 'obat') return 'obat';
    return 'tindakan';
}

function canonicalize(value) {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        return value
            .map(canonicalize)
            .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    }
    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce((result, key) => {
                result[key] = canonicalize(value[key]);
                return result;
            }, {});
    }
    return value;
}

function buildSourceFingerprint(payload = {}) {
    const canonical = canonicalize({
        clinic_date: payload.clinicDate || payload.clinic_date || null,
        records: payload.records || [],
        sources: payload.sources || [],
        pending_payments: payload.pendingPayments || payload.pending_payments || [],
        pending_revisions: payload.pendingRevisions || payload.pending_revisions || []
    });
    return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function normalizeItem(item) {
    const quantity = Number(item.quantity ?? item.qty ?? 1);
    const price = normalizeMoney(item.price);
    const explicitTotal = item.total === null || item.total === undefined || item.total === ''
        ? quantity * price
        : item.total;
    return {
        id: item.id ?? null,
        item_type: item.item_type || item.type || null,
        item_code: item.item_code || item.code || null,
        item_name: item.item_name || item.name || '-',
        quantity: Number.isFinite(quantity) ? quantity : 1,
        price,
        total: normalizeMoney(explicitTotal),
        category: classifyRevenueItem(item)
    };
}

function createIssue(code, message, details = {}) {
    return { code, message, ...details };
}

const INACTIVE_APPOINTMENT_STATUSES = new Set(['cancelled', 'canceled', 'no_show']);

function hasLinkedBilling(record = {}) {
    return record.billing_id !== null && record.billing_id !== undefined && record.billing_id !== '';
}

function isInactiveUnbilledClosingRecord(record = {}) {
    if (hasLinkedBilling(record)) return false;
    const appointmentStatus = String(record.appointment_status || '').trim().toLowerCase();
    return INACTIVE_APPOINTMENT_STATUSES.has(appointmentStatus);
}

function recordsRequiredForClosing(records = []) {
    return records.filter(record => !isInactiveUnbilledClosingRecord(record));
}

function inactiveUnbilledRecordSql(appointmentAlias = 'sa', billingAlias = 'b') {
    return `(
        ${billingAlias}.id IS NOT NULL
        OR ${appointmentAlias}.id IS NULL
        OR ${appointmentAlias}.status NOT IN ('cancelled', 'no_show')
    )`;
}

function buildClosingPreview({
    clinicDate,
    records = [],
    mainBillings = [],
    mainItems = [],
    additionalBillings = [],
    additionalItems = [],
    pendingPayments = [],
    pendingRevisions = []
} = {}) {
    const closingRecords = recordsRequiredForClosing(records);
    const recordByMrId = new Map(closingRecords.map(record => [String(record.mr_id), record]));
    const mainByMrId = new Map(mainBillings.map(billing => [String(billing.mr_id), billing]));
    const mainItemsByBilling = new Map();
    const additionalItemsByBilling = new Map();
    const blockers = [];
    const anomalies = [];

    for (const item of mainItems) {
        const key = String(item.billing_id);
        if (!mainItemsByBilling.has(key)) mainItemsByBilling.set(key, []);
        mainItemsByBilling.get(key).push(normalizeItem(item));
    }
    for (const item of additionalItems) {
        const key = String(item.additional_billing_id);
        if (!additionalItemsByBilling.has(key)) additionalItemsByBilling.set(key, []);
        additionalItemsByBilling.get(key).push(normalizeItem(item));
    }

    for (const record of closingRecords) {
        const billing = record.billing_id
            ? mainBillings.find(item => String(item.id) === String(record.billing_id))
            : mainByMrId.get(String(record.mr_id));
        if (!billing) {
            blockers.push(createIssue(
                'MISSING_BILLING',
                `Belum ada tagihan utama untuk ${record.patient_name || record.mr_id}.`,
                { mr_id: record.mr_id, patient_id: record.patient_id }
            ));
        }
    }

    const transactions = [];
    const sources = [];
    const breakdown = { tindakan: 0, obat: 0, administratif: 0 };

    function processBilling(billing, sourceType, itemsForBilling) {
        const status = String(billing.status || '').toLowerCase();
        const amount = normalizeMoney(billing.total);
        const normalizedItems = itemsForBilling || [];
        const itemTotal = normalizeMoney(normalizedItems.reduce((sum, item) => sum + item.total, 0));
        const sourceId = billing.id;
        const record = recordByMrId.get(String(billing.mr_id)) || {};
        const label = sourceType === 'additional' ? 'tagihan tambahan' : 'tagihan utama';

        if (status !== 'paid') {
            blockers.push(createIssue(
                'BILLING_NOT_PAID',
                `${label} ${billing.reference_number || billing.mr_id || sourceId} belum lunas.`,
                { source_type: sourceType, source_id: sourceId, status, total: amount }
            ));
        }

        const hasPendingChanges = billing.pending_changes === true
            || Number(billing.pending_changes) === 1;
        if (hasPendingChanges) {
            blockers.push(createIssue(
                'BILLING_CHANGES_PENDING',
                `${label} ${billing.reference_number || billing.mr_id || sourceId} masih memiliki perubahan yang menunggu konfirmasi dokter.`,
                { source_type: sourceType, source_id: sourceId }
            ));
        }

        if (Math.abs(itemTotal - amount) > MONEY_EPSILON) {
            blockers.push(createIssue(
                'BILLING_TOTAL_MISMATCH',
                `Total ${label} ${billing.reference_number || billing.mr_id || sourceId} tidak sama dengan rincian item.`,
                { source_type: sourceType, source_id: sourceId, billing_total: amount, item_total: itemTotal }
            ));
        }

        if (status === 'paid' && !billing.paid_at) {
            anomalies.push(createIssue(
                'PAID_WITHOUT_PAID_AT',
                `${label} ${billing.reference_number || billing.mr_id || sourceId} berstatus lunas tanpa waktu pembayaran.`,
                { source_type: sourceType, source_id: sourceId }
            ));
        }
        if (status === 'paid' && !String(billing.paid_by || '').trim()) {
            anomalies.push(createIssue(
                'PAID_WITHOUT_PAID_BY',
                `${label} ${billing.reference_number || billing.mr_id || sourceId} berstatus lunas tanpa petugas pembayaran.`,
                { source_type: sourceType, source_id: sourceId }
            ));
        }
        if (status !== 'paid' && billing.paid_at) {
            anomalies.push(createIssue(
                'NON_PAID_WITH_PAID_AT',
                `${label} ${billing.reference_number || billing.mr_id || sourceId} memiliki waktu pembayaran tetapi belum berstatus lunas.`,
                { source_type: sourceType, source_id: sourceId, status }
            ));
        }
        if (status !== 'paid' && String(billing.paid_by || '').trim()) {
            anomalies.push(createIssue(
                'NON_PAID_WITH_PAID_BY',
                `${label} ${billing.reference_number || billing.mr_id || sourceId} memiliki petugas pembayaran tetapi belum berstatus lunas.`,
                { source_type: sourceType, source_id: sourceId, status }
            ));
        }

        const source = {
            source_type: sourceType,
            source_id: sourceId,
            parent_billing_id: billing.parent_billing_id || null,
            mr_id: billing.mr_id,
            patient_id: billing.patient_id || record.patient_id || null,
            patient_name: billing.patient_name || record.patient_name || '-',
            reference_number: billing.reference_number || billing.mr_id || String(sourceId),
            status,
            pending_changes: hasPendingChanges,
            total: amount,
            payment_method: billing.payment_method || null,
            paid_at: billing.paid_at || null,
            paid_by: billing.paid_by || null,
            items: normalizedItems
        };
        sources.push(source);

        if (status !== 'paid') return;
        transactions.push({ ...source, amount });
        for (const item of normalizedItems) {
            breakdown[item.category] = normalizeMoney(breakdown[item.category] + item.total);
        }
    }

    for (const billing of mainBillings) {
        processBilling(billing, 'main', mainItemsByBilling.get(String(billing.id)) || []);
    }
    for (const billing of additionalBillings) {
        processBilling(billing, 'additional', additionalItemsByBilling.get(String(billing.id)) || []);
    }

    for (const payment of pendingPayments) {
        blockers.push(createIssue(
            'ONLINE_PAYMENT_PENDING',
            `Pembayaran online ${payment.payment_method || ''} untuk ${payment.mr_id || payment.billing_id} masih diproses.`.replace(/\s+/g, ' ').trim(),
            { payment_id: payment.id, billing_id: payment.billing_id, mr_id: payment.mr_id }
        ));
    }

    for (const revision of pendingRevisions) {
        blockers.push(createIssue(
            'BILLING_REVISION_PENDING',
            `Usulan revisi tagihan ${revision.mr_id || revision.id} masih menunggu keputusan dokter.`,
            { revision_id: revision.id, mr_id: revision.mr_id, status: revision.status }
        ));
    }

    const mainTotal = normalizeMoney(transactions
        .filter(transaction => transaction.source_type === 'main')
        .reduce((sum, transaction) => sum + transaction.total, 0));
    const additionalTotal = normalizeMoney(transactions
        .filter(transaction => transaction.source_type === 'additional')
        .reduce((sum, transaction) => sum + transaction.total, 0));
    const patientIds = new Set(transactions.map(transaction => transaction.patient_id).filter(Boolean));
    const summary = {
        main_total: mainTotal,
        additional_total: additionalTotal,
        grand_total: normalizeMoney(mainTotal + additionalTotal),
        patient_count: patientIds.size,
        transaction_count: transactions.length
    };

    const fingerprint = buildSourceFingerprint({
        clinicDate,
        records: closingRecords.map(record => ({
            mr_id: record.mr_id,
            patient_id: record.patient_id,
            billing_id: record.billing_id || null
        })),
        sources: sources.map(({ patient_name: _patientName, ...source }) => source),
        pendingPayments: pendingPayments.map(payment => ({
            id: payment.id,
            billing_id: payment.billing_id,
            status: payment.status,
            amount: normalizeMoney(payment.amount)
        })),
        pendingRevisions: pendingRevisions.map(revision => ({
            id: revision.id,
            mr_id: revision.mr_id,
            status: revision.status
        }))
    });

    return {
        clinic_date: clinicDate,
        status: 'open',
        summary,
        breakdown,
        transactions,
        blockers,
        anomalies,
        can_close: blockers.length === 0 && anomalies.length === 0,
        fingerprint
    };
}

function privateClinicFilter(alias = 'scr') {
    return `${alias}.visit_location = '${PRIVATE_CLINIC_LOCATION}'`;
}

function serviceDateSql(recordAlias = 'scr', appointmentAlias = 'sa') {
    return `COALESCE(${appointmentAlias}.appointment_date, DATE(${recordAlias}.created_at))`;
}

async function queryRows(client, sql, params = []) {
    const [rows] = await client.query(sql, params);
    return Array.isArray(rows) ? rows : [];
}

async function loadFinancialSources(client, clinicDate, options = {}) {
    const lockClause = options.forUpdate ? ' FOR UPDATE' : '';
    const records = await queryRows(client, `
        SELECT scr.mr_id, scr.patient_id,
               COALESCE(NULLIF(p.full_name, ''), NULLIF(sa.patient_name, ''), scr.patient_id) AS patient_name,
               b.id AS billing_id,
               sa.status AS appointment_status
        FROM sunday_clinic_records scr
        LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
        LEFT JOIN patients p ON p.id = scr.patient_id
        LEFT JOIN sunday_clinic_billings b
               ON b.mr_id COLLATE utf8mb4_unicode_ci = scr.mr_id
        WHERE ${privateClinicFilter('scr')}
          AND ${serviceDateSql('scr', 'sa')} = ?
          AND ${inactiveUnbilledRecordSql('sa', 'b')}
        ORDER BY scr.mr_id${lockClause}
    `, [clinicDate]);

    const mainBillings = await queryRows(client, `
        SELECT b.id, b.mr_id, b.patient_id, b.subtotal, b.total, b.status,
               b.pending_changes,
               b.confirmed_at, b.confirmed_by, b.paid_at, b.paid_by,
               b.last_modified_at, b.updated_at,
               COALESCE(NULLIF(p.full_name, ''), NULLIF(sa.patient_name, ''), b.patient_id) AS patient_name,
               (
                   SELECT tp.payment_method
                   FROM tagihan_payments tp
                   WHERE tp.billing_id = b.id AND tp.status = 'paid'
                   ORDER BY COALESCE(tp.paid_at, tp.updated_at) DESC, tp.id DESC
                   LIMIT 1
               ) AS payment_method
        FROM sunday_clinic_billings b
        JOIN sunday_clinic_records scr
          ON b.mr_id COLLATE utf8mb4_unicode_ci = scr.mr_id
        LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
        LEFT JOIN patients p ON p.id = scr.patient_id
        WHERE ${privateClinicFilter('scr')}
          AND ${serviceDateSql('scr', 'sa')} = ?
        ORDER BY b.id${lockClause}
    `, [clinicDate]);

    const additionalBillings = await queryRows(client, `
        SELECT ab.id, ab.parent_billing_id, ab.mr_id, ab.patient_id,
               ab.reference_number, ab.subtotal, ab.total, ab.status,
               ab.payment_method, ab.confirmed_at, ab.confirmed_by,
               ab.paid_at, ab.paid_by, ab.last_modified_at, ab.updated_at,
               COALESCE(NULLIF(p.full_name, ''), NULLIF(sa.patient_name, ''), ab.patient_id) AS patient_name
        FROM sunday_clinic_additional_billings ab
        JOIN sunday_clinic_records scr
          ON ab.mr_id COLLATE utf8mb4_unicode_ci = scr.mr_id
        LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
        LEFT JOIN patients p ON p.id = scr.patient_id
        WHERE ${privateClinicFilter('scr')}
          AND ${serviceDateSql('scr', 'sa')} = ?
        ORDER BY ab.id${lockClause}
    `, [clinicDate]);

    const mainIds = mainBillings.map(row => row.id);
    const additionalIds = additionalBillings.map(row => row.id);
    const mainItems = mainIds.length
        ? await queryRows(client, `
            SELECT id, billing_id, item_type, item_code, item_name, quantity, price, total
            FROM sunday_clinic_billing_items
            WHERE billing_id IN (?)
            ORDER BY billing_id, id${lockClause}
        `, [mainIds])
        : [];
    const additionalItems = additionalIds.length
        ? await queryRows(client, `
            SELECT id, additional_billing_id, item_type, item_code, item_name, quantity, price, total
            FROM sunday_clinic_additional_billing_items
            WHERE additional_billing_id IN (?)
            ORDER BY additional_billing_id, id${lockClause}
        `, [additionalIds])
        : [];
    const pendingPayments = mainIds.length
        ? await queryRows(client, `
            SELECT id, billing_id, mr_id, payment_method, amount, status, expires_at, updated_at
            FROM tagihan_payments
            WHERE billing_id IN (?) AND status = 'pending'
            ORDER BY billing_id, id${lockClause}
        `, [mainIds])
        : [];

    const pendingRevisions = await queryRows(client, `
        SELECT br.id, br.mr_id, br.status, br.message, br.requested_by, br.created_at
        FROM sunday_clinic_billing_revisions br
        JOIN sunday_clinic_records scr
          ON br.mr_id COLLATE utf8mb4_unicode_ci = scr.mr_id
        LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
        WHERE ${privateClinicFilter('scr')}
          AND ${serviceDateSql('scr', 'sa')} = ?
          AND br.status = 'pending'
        ORDER BY br.id${lockClause}
    `, [clinicDate]);

    return {
        records,
        mainBillings,
        mainItems,
        additionalBillings,
        additionalItems,
        pendingPayments,
        pendingRevisions
    };
}

function normalizeClosingHeader(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        clinic_date: normalizeDateOnly(row.clinic_date),
        main_total: normalizeMoney(row.main_total),
        additional_total: normalizeMoney(row.additional_total),
        grand_total: normalizeMoney(row.grand_total),
        patient_count: Number(row.patient_count || 0),
        transaction_count: Number(row.transaction_count || 0),
        summary: parseJson(row.summary_json, {}),
        breakdown: parseJson(row.breakdown_json, {}),
        source_fingerprint: row.source_fingerprint,
        closed_by_user_id: row.closed_by_user_id,
        closed_by_name: row.closed_by_name,
        closed_by_role: row.closed_by_role,
        closed_at: row.closed_at,
        created_at: row.created_at
    };
}

async function findClosingHeader(client, { id = null, clinicDate = null, forUpdate = false } = {}) {
    const field = id !== null ? 'id' : 'clinic_date';
    const value = id !== null ? id : clinicDate;
    const rows = await queryRows(client, `
        SELECT id, DATE_FORMAT(clinic_date, '%Y-%m-%d') AS clinic_date,
               main_total, additional_total, grand_total,
               patient_count, transaction_count, summary_json, breakdown_json,
               source_fingerprint, closed_by_user_id, closed_by_name,
               closed_by_role, closed_at, created_at
        FROM sunday_clinic_closings
        WHERE ${field} = ?
        LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}
    `, [value]);
    return normalizeClosingHeader(rows[0]);
}

async function getClosingDetail(client, idOrHeader) {
    const header = typeof idOrHeader === 'object' && idOrHeader
        ? idOrHeader
        : await findClosingHeader(client, { id: idOrHeader });
    if (!header) {
        throw new AppError('Riwayat closing tidak ditemukan.', 404, true, 'CLOSING_NOT_FOUND');
    }

    const entryRows = await queryRows(client, `
        SELECT id, closing_id, source_type, source_id, parent_billing_id,
               mr_id, patient_id, patient_name, reference_number,
               payment_method, paid_at, paid_by, total,
               item_snapshot, source_snapshot, created_at
        FROM sunday_clinic_closing_entries
        WHERE closing_id = ?
        ORDER BY source_type, source_id
    `, [header.id]);
    const transactions = entryRows.map(row => ({
        id: Number(row.id),
        closing_id: Number(row.closing_id),
        source_type: row.source_type,
        source_id: Number(row.source_id),
        parent_billing_id: row.parent_billing_id ? Number(row.parent_billing_id) : null,
        mr_id: row.mr_id,
        patient_id: row.patient_id,
        patient_name: row.patient_name,
        reference_number: row.reference_number,
        payment_method: row.payment_method,
        paid_at: row.paid_at,
        paid_by: row.paid_by,
        total: normalizeMoney(row.total),
        amount: normalizeMoney(row.total),
        items: parseJson(row.item_snapshot, []),
        source_snapshot: parseJson(row.source_snapshot, {})
    }));

    const closedRecord = {
        id: header.id,
        clinic_date: header.clinic_date,
        source_fingerprint: header.source_fingerprint,
        closed_by_user_id: header.closed_by_user_id,
        closed_by_name: header.closed_by_name,
        closed_by_role: header.closed_by_role,
        closed_at: header.closed_at
    };
    return {
        id: header.id,
        clinic_date: header.clinic_date,
        status: 'closed',
        summary: header.summary,
        breakdown: header.breakdown,
        transactions,
        entries: transactions,
        blockers: [],
        anomalies: [],
        can_close: false,
        fingerprint: header.source_fingerprint,
        closed_record: closedRecord
    };
}

async function getClosingPreview(client = db, dateValue = null) {
    const clinicDate = parseClinicDate(dateValue);
    const existing = await findClosingHeader(client, { clinicDate });
    if (existing) {
        const detail = await getClosingDetail(client, existing);
        return reconcileClosingDetail(client, detail);
    }

    const sources = await loadFinancialSources(client, clinicDate);
    return buildClosingPreview({ clinicDate, ...sources });
}

async function resolveServiceDate(client = db, identifiers = {}) {
    let rows = [];
    const patientId = identifiers.patientId || null;
    if (identifiers.clinicDate) {
        return normalizeDateOnly(identifiers.clinicDate);
    }
    if (identifiers.appointmentId) {
        rows = await queryRows(client, `
            SELECT DATE_FORMAT(appointment_date, '%Y-%m-%d') AS clinic_date
            FROM sunday_appointments
            WHERE id = ?
            LIMIT 1
        `, [identifiers.appointmentId]);
    } else if (identifiers.additionalBillingId) {
        rows = await queryRows(client, `
            SELECT DATE_FORMAT(${serviceDateSql('scr', 'sa')}, '%Y-%m-%d') AS clinic_date
            FROM sunday_clinic_additional_billings ab
            JOIN sunday_clinic_records scr
              ON ab.mr_id COLLATE utf8mb4_unicode_ci = scr.mr_id
            LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
            WHERE ab.id = ? AND ${privateClinicFilter('scr')}
              ${patientId ? 'AND ab.patient_id = ?' : ''}
            LIMIT 1
        `, patientId
            ? [identifiers.additionalBillingId, patientId]
            : [identifiers.additionalBillingId]);
    } else if (identifiers.billingId) {
        rows = await queryRows(client, `
            SELECT DATE_FORMAT(${serviceDateSql('scr', 'sa')}, '%Y-%m-%d') AS clinic_date
            FROM sunday_clinic_billings b
            JOIN sunday_clinic_records scr
              ON b.mr_id COLLATE utf8mb4_unicode_ci = scr.mr_id
            LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
            WHERE b.id = ? AND ${privateClinicFilter('scr')}
              ${patientId ? 'AND b.patient_id = ?' : ''}
            LIMIT 1
        `, patientId
            ? [identifiers.billingId, patientId]
            : [identifiers.billingId]);
    } else if (identifiers.mrId) {
        rows = await queryRows(client, `
            SELECT DATE_FORMAT(${serviceDateSql('scr', 'sa')}, '%Y-%m-%d') AS clinic_date
            FROM sunday_clinic_records scr
            LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
            WHERE scr.mr_id = ? AND ${privateClinicFilter('scr')}
              ${patientId ? 'AND scr.patient_id = ?' : ''}
            ORDER BY scr.id DESC
            LIMIT 1
        `, patientId
            ? [identifiers.mrId, patientId]
            : [identifiers.mrId]);
    }
    return normalizeDateOnly(rows[0]?.clinic_date);
}

async function assertSundayClinicAccountingDateOpen(client = db, identifiers = {}) {
    const clinicDate = await resolveServiceDate(client, identifiers);
    if (!clinicDate) return null;

    try {
        const rows = await queryRows(
            client,
            'SELECT id FROM sunday_clinic_closings WHERE clinic_date = ? LIMIT 1',
            [clinicDate]
        );
        if (rows.length > 0) {
            const error = new AppError(
                `Transaksi Sunday Clinic tanggal ${clinicDate} sudah di-closing dan tidak dapat diubah.`,
                409,
                true,
                'SUNDAY_CLINIC_CLOSED'
            );
            error.clinicDate = clinicDate;
            throw error;
        }
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146) {
            throw new AppError(
                'Schema closing Sunday Clinic belum tersedia. Jalankan migration 20260720_create_sunday_clinic_closings.sql.',
                503,
                true,
                'SUNDAY_CLINIC_CLOSING_SCHEMA_MISSING'
            );
        }
        throw error;
    }
    return clinicDate;
}

async function acquireSundayClinicAccountingDateGuard(client = db, identifiers = {}, options = {}) {
    if (typeof client.getConnection !== 'function') {
        const clinicDate = await assertSundayClinicAccountingDateOpen(client, identifiers);
        return { clinicDate, release: async () => {} };
    }

    const connection = await client.getConnection();
    let lockName = null;
    let released = false;
    try {
        const clinicDate = await resolveServiceDate(connection, identifiers);
        if (!clinicDate) {
            connection.release();
            released = true;
            return { clinicDate: null, release: async () => {} };
        }

        lockName = `sc-close:${clinicDate}`;
        const timeoutSeconds = Number.isFinite(Number(options.timeoutSeconds))
            ? Math.max(1, Math.min(Number(options.timeoutSeconds), 30))
            : 10;
        const lockRows = await queryRows(
            connection,
            'SELECT GET_LOCK(?, ?) AS acquired',
            [lockName, timeoutSeconds]
        );
        if (Number(lockRows[0]?.acquired) !== 1) {
            throw new AppError(
                'Transaksi sedang menunggu proses closing. Coba lagi.',
                409,
                true,
                'CLOSING_BUSY'
            );
        }

        await assertSundayClinicAccountingDateOpen(connection, identifiers);
        const release = async () => {
            if (released) return;
            released = true;
            try {
                await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
            } finally {
                connection.release();
            }
        };
        return { clinicDate, release };
    } catch (error) {
        if (lockName) {
            try {
                await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
            } catch (_releaseError) {
                // Releasing the connection below also drops named locks.
            }
        }
        if (!released) connection.release();
        throw error;
    }
}

function getClosingActor(actor = {}) {
    return {
        userId: String(actor.userId || actor.id || actor.new_id || ''),
        name: String(actor.name || actor.display_name || actor.email || actor.userId || actor.id || 'Dokter'),
        role: actor.role || ROLE_NAMES.DOKTER
    };
}

async function insertClosingEntries(connection, closingId, transactions) {
    for (const transaction of transactions) {
        const sourceSnapshot = {
            source_type: transaction.source_type,
            source_id: transaction.source_id,
            status: transaction.status,
            pending_changes: transaction.pending_changes,
            total: transaction.total,
            payment_method: transaction.payment_method,
            paid_at: transaction.paid_at,
            paid_by: transaction.paid_by
        };
        await connection.query(`
            INSERT INTO sunday_clinic_closing_entries
            (closing_id, source_type, source_id, parent_billing_id,
             mr_id, patient_id, patient_name, reference_number,
             payment_method, paid_at, paid_by, total,
             item_snapshot, source_snapshot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            closingId,
            transaction.source_type,
            transaction.source_id,
            transaction.parent_billing_id || null,
            transaction.mr_id,
            transaction.patient_id,
            transaction.patient_name,
            transaction.reference_number,
            transaction.payment_method || null,
            transaction.paid_at || null,
            transaction.paid_by || null,
            transaction.total,
            JSON.stringify(transaction.items || []),
            JSON.stringify(sourceSnapshot)
        ]);
    }
}

async function createClosing(client = db, { clinicDate: rawClinicDate, date, fingerprint, actor } = {}) {
    const clinicDate = parseClinicDate(rawClinicDate || date);
    if (!/^[a-f0-9]{64}$/.test(String(fingerprint || ''))) {
        throw new AppError('Fingerprint preview closing tidak valid.', 400, true, 'INVALID_CLOSING_FINGERPRINT');
    }

    const ownsConnection = typeof client.getConnection === 'function';
    const connection = ownsConnection ? await client.getConnection() : client;
    const lockName = `sc-close:${clinicDate}`;
    let namedLockAcquired = false;
    let transactionStarted = false;

    try {
        const lockRows = await queryRows(connection, 'SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
        namedLockAcquired = Number(lockRows[0]?.acquired) === 1;
        if (!namedLockAcquired) {
            throw new AppError('Closing sedang diproses oleh dokter lain. Coba lagi.', 409, true, 'CLOSING_BUSY');
        }

        await connection.beginTransaction();
        transactionStarted = true;

        const existing = await findClosingHeader(connection, { clinicDate, forUpdate: true });
        if (existing) {
            if (existing.source_fingerprint !== fingerprint) {
                throw new AppError('Tanggal praktik ini sudah memiliki closing final.', 409, true, 'CLOSING_ALREADY_EXISTS');
            }
            const detail = await getClosingDetail(connection, existing);
            await connection.commit();
            transactionStarted = false;
            return { ...detail, created: false, idempotent: true };
        }

        const sources = await loadFinancialSources(connection, clinicDate, { forUpdate: true });
        const preview = buildClosingPreview({ clinicDate, ...sources });
        if (!preview.can_close) {
            const error = new AppError(
                'Closing belum dapat dilakukan karena masih ada blocker atau anomali finansial.',
                409,
                true,
                'CLOSING_BLOCKED'
            );
            error.preview = preview;
            throw error;
        }
        if (preview.fingerprint !== fingerprint) {
            const error = new AppError(
                'Data transaksi berubah sejak preview dimuat. Muat ulang sebelum closing.',
                409,
                true,
                'CLOSING_PREVIEW_STALE'
            );
            error.preview = preview;
            throw error;
        }

        const closingActor = getClosingActor(actor);
        const [insertResult] = await connection.query(`
            INSERT INTO sunday_clinic_closings
            (clinic_date, main_total, additional_total, grand_total,
             patient_count, transaction_count, summary_json, breakdown_json,
             source_fingerprint, closed_by_user_id, closed_by_name, closed_by_role)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            clinicDate,
            preview.summary.main_total,
            preview.summary.additional_total,
            preview.summary.grand_total,
            preview.summary.patient_count,
            preview.summary.transaction_count,
            JSON.stringify(preview.summary),
            JSON.stringify(preview.breakdown),
            preview.fingerprint,
            closingActor.userId,
            closingActor.name,
            closingActor.role
        ]);
        const closingId = insertResult.insertId;
        await insertClosingEntries(connection, closingId, preview.transactions);
        const header = await findClosingHeader(connection, { id: closingId });
        const detail = await getClosingDetail(connection, header);

        await connection.commit();
        transactionStarted = false;
        return { ...detail, created: true, idempotent: false };
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (_rollbackError) {
                // Preserve the original failure.
            }
        }
        throw error;
    } finally {
        if (namedLockAcquired) {
            try {
                await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
            } catch (_releaseError) {
                // The connection close also releases a named lock.
            }
        }
        if (ownsConnection && typeof connection.release === 'function') connection.release();
    }
}

async function listClosings(client = db, options = {}) {
    const parsedLimit = Number.parseInt(options.limit, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20;
    const rows = await queryRows(client, `
        SELECT id, DATE_FORMAT(clinic_date, '%Y-%m-%d') AS clinic_date,
               main_total, additional_total, grand_total,
               patient_count, transaction_count, source_fingerprint,
               closed_by_user_id, closed_by_name, closed_by_role, closed_at
        FROM sunday_clinic_closings
        ORDER BY clinic_date DESC, id DESC
        LIMIT ?
    `, [limit]);
    return {
        items: rows.map(row => ({
            id: Number(row.id),
            clinic_date: normalizeDateOnly(row.clinic_date),
            main_total: normalizeMoney(row.main_total),
            additional_total: normalizeMoney(row.additional_total),
            grand_total: normalizeMoney(row.grand_total),
            patient_count: Number(row.patient_count || 0),
            transaction_count: Number(row.transaction_count || 0),
            fingerprint: row.source_fingerprint,
            closed_by_user_id: row.closed_by_user_id,
            closed_by_name: row.closed_by_name,
            closed_by_role: row.closed_by_role,
            closed_at: row.closed_at
        })),
        limit
    };
}

async function reconcileClosingDetail(client, detail) {
    const liveSources = await loadFinancialSources(client, detail.clinic_date);
    const livePreview = buildClosingPreview({ clinicDate: detail.clinic_date, ...liveSources });
    if (livePreview.fingerprint === detail.fingerprint) return detail;

    const exception = createIssue(
        'POST_CLOSE_SOURCE_CHANGED',
        'Sumber transaksi berubah setelah closing. Snapshot final tidak diubah dan perbedaan ini perlu direkonsiliasi.',
        { live_fingerprint: livePreview.fingerprint }
    );
    return {
        ...detail,
        anomalies: [exception],
        post_close_exceptions: [exception]
    };
}

async function getClosingDetailWithReconciliation(client = db, id) {
    const detail = await getClosingDetail(client, id);
    return reconcileClosingDetail(client, detail);
}

module.exports = {
    ADMIN_ITEM_CODES,
    parseClinicDate,
    classifyRevenueItem,
    buildSourceFingerprint,
    buildClosingPreview,
    loadFinancialSources,
    getClosingPreview,
    getClosingDetail,
    getClosingDetailWithReconciliation,
    createClosing,
    listClosings,
    resolveServiceDate,
    assertSundayClinicAccountingDateOpen,
    acquireSundayClinicAccountingDateGuard
};
