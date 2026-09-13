'use strict';

function cancellationError(message, statusCode = 409) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function validateReason(reason) {
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) {
        throw cancellationError('Alasan pembatalan wajib diisi (maksimal 2000 karakter).', 400);
    }
    return reason.trim();
}

function hasPaidWebhookEvidence(rawWebhook) {
    if (!rawWebhook) return false;
    let webhook = rawWebhook;
    if (typeof webhook === 'string') {
        try { webhook = JSON.parse(webhook); } catch (_) { return true; }
    }
    if (!webhook || typeof webhook !== 'object') return true;
    const candidates = [webhook, webhook.data, webhook.payload].filter(Boolean);
    return candidates.some(value =>
        ['PAID', 'SUCCEEDED', 'COMPLETED', 'CAPTURED'].includes(String(value.status || value.payment_status || '').toUpperCase())
        || Number(value.paid_amount || 0) > 0
    );
}

async function assertNoCancelledBillingEvidence(connection, { mrId, patientId }) {
    const field = mrId ? 'mr_id' : 'patient_id';
    const value = mrId || patientId;
    if (!value) throw cancellationError('Identitas tagihan untuk penghapusan tidak valid.', 400);
    // Lock parent invoices first; cancellation takes the same lock before an additional invoice.
    const [mainBillings] = await connection.query(
        `SELECT id, status FROM sunday_clinic_billings WHERE ${field} = ? ORDER BY id FOR UPDATE`,
        [value]
    );
    const [additionalBillings] = await connection.query(
        `SELECT id, status FROM sunday_clinic_additional_billings WHERE ${field} = ? ORDER BY id FOR UPDATE`,
        [value]
    );
    if ([...mainBillings, ...additionalBillings].some(billing => billing.status === 'cancelled')) {
        throw cancellationError('Penghapusan ditolak: terdapat tagihan batal yang harus disimpan sebagai bukti keuangan.');
    }
}

async function runTransaction(db, work) {
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

async function assertNoPaymentEvidence(connection, billingId, getPaymentStatus, getCreditCardChargeStatus) {
    const [payments] = await connection.query(
        `SELECT id, status, xendit_id, payment_method, paid_at, webhook_data, reconciliation_required
         FROM tagihan_payments WHERE billing_id = ? ORDER BY id FOR UPDATE`,
        [billingId]
    );
    for (const payment of payments) {
        if (payment.status === 'paid' || payment.paid_at || payment.reconciliation_required
            || hasPaidWebhookEvidence(payment.webhook_data)) {
            throw cancellationError('Pembayaran sudah tercatat; tagihan tidak dapat dibatalkan.');
        }
        if (payment.payment_method === 'asuransi') {
            if (!['cancelled', 'failed'].includes(payment.status)) {
                throw cancellationError('Klaim asuransi masih aktif atau statusnya belum pasti.');
            }
            payment.provider_status = 'internal';
            continue;
        }
        // A locally cancelled or expired row does not establish what happened at Xendit.
        if (!payment.xendit_id) {
            throw cancellationError('Status permintaan pembayaran belum dapat diverifikasi ke penyedia.');
        }
        let provider;
        try {
            if (payment.payment_method === 'credit_card' && !/^pr[_-]/.test(payment.xendit_id)) {
                if (!getCreditCardChargeStatus) throw new Error('Pemeriksaan kartu tidak tersedia');
                provider = await getCreditCardChargeStatus(payment.xendit_id);
            } else {
                provider = await getPaymentStatus(
                    payment.xendit_id,
                    payment.payment_method === 'qris' ? 'qris' : 'va'
                );
            }
        } catch (error) {
            throw cancellationError('Status pembayaran penyedia belum dapat dipastikan. Coba lagi setelah pemeriksaan berhasil.');
        }
        if (!provider?.success || !['expired', 'failed', 'cancelled', 'voided'].includes(provider.status)
            || Number(provider.paid_amount || 0) > 0 || provider.paid_at) {
            throw cancellationError('Permintaan pembayaran masih aktif, sudah dibayar, atau statusnya belum pasti.');
        }
        payment.provider_status = provider.status;
    }
    const [[paidLog]] = await connection.query(
        `SELECT id FROM tagihan_payment_logs
         WHERE billing_id = ? AND (status_after = 'paid' OR event_type IN ('payment.paid', 'payment.succeeded'))
         LIMIT 1`,
        [billingId]
    );
    if (paidLog) throw cancellationError('Riwayat pembayaran menunjukkan tagihan sudah dibayar.');
    return payments;
}

async function cancelMainBilling(deps, { mrId, reason, req }) {
    const normalizedReason = validateReason(reason);
    return runTransaction(deps.db, async connection => {
        // This is the lock order shared with online-payment reservation and callbacks.
        const [[billing]] = await connection.query(
            'SELECT * FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE', [mrId]
        );
        if (!billing) throw cancellationError('Tagihan tidak ditemukan.', 404);
        if (billing.status === 'cancelled') {
            return { billing, already_cancelled: true };
        }
        if (!['draft', 'confirmed'].includes(billing.status) || billing.paid_at) {
            throw cancellationError('Hanya tagihan yang belum dibayar dapat dibatalkan.');
        }
        const paymentAttempts = await assertNoPaymentEvidence(
            connection, billing.id, deps.getPaymentStatus, deps.getCreditCardChargeStatus
        );
        const [[stockMovement]] = await connection.query(
            `SELECT id FROM stock_movements
             WHERE reference_type = 'sunday_clinic_billing' AND reference_id = ? AND movement_type = 'sale'
             LIMIT 1`, [billing.id]
        );
        if (stockMovement) throw cancellationError('Ada pengurangan stok yang sudah dicatat untuk tagihan ini. Perlu rekonsiliasi sebelum dibatalkan.');
        const beforeSnapshot = await deps.getBillingSnapshot(connection, billing.id);
        const [pendingRevisions] = await connection.query(
            `SELECT id, message, requested_by, status FROM sunday_clinic_billing_revisions
             WHERE mr_id = ? AND status = 'pending' ORDER BY id FOR UPDATE`, [mrId]
        );
        const actorName = req.user?.name || req.user?.display_name || req.user?.id || 'Dokter';
        const actorId = req.user?.new_id || req.user?.id || null;
        await connection.query(
            `UPDATE sunday_clinic_billings
             SET status = 'cancelled', cancellation_reason = ?, cancelled_at = NOW(),
                 cancelled_by = ?, cancelled_by_name = ?, pending_changes = FALSE, updated_at = NOW()
             WHERE id = ? AND status IN ('draft', 'confirmed')`,
            [normalizedReason, actorId, actorName, billing.id]
        );
        for (const payment of paymentAttempts) {
            if (payment.status !== 'pending') continue;
            await connection.query(
                `UPDATE tagihan_payments SET status = 'cancelled', updated_at = NOW()
                 WHERE id = ? AND status = 'pending'`,
                [payment.id]
            );
            await connection.query(
                `INSERT INTO tagihan_payment_logs
                 (payment_id, billing_id, mr_id, event_type, event_source,
                  status_before, status_after, request_data, response_data)
                 VALUES (?, ?, ?, 'billing.cancelled', 'system', 'pending', 'cancelled', ?, ?)`,
                [payment.id, billing.id, mrId,
                    JSON.stringify({ reason: normalizedReason, cancelled_by: actorId }),
                    JSON.stringify({ provider_status: payment.provider_status })]
            );
        }
        if (pendingRevisions.length) {
            await connection.query(
                `UPDATE sunday_clinic_billing_revisions
                 SET status = 'cancelled', cancellation_reason = ?, cancelled_at = NOW(),
                     cancelled_by = ?, cancelled_by_name = ?, updated_at = NOW()
                 WHERE mr_id = ? AND status = 'pending'`,
                [normalizedReason, actorId, actorName, mrId]
            );
        }
        const afterSnapshot = await deps.getBillingSnapshot(connection, billing.id);
        await deps.writeBillingAudit(connection, req, {
            billingId: billing.id, mrId, action: 'billing_cancelled',
            summary: `Tagihan dibatalkan: ${normalizedReason}`,
            beforeSnapshot: { ...beforeSnapshot, pendingRevisions, paymentAttempts },
            afterSnapshot: { ...afterSnapshot, pendingRevisions: pendingRevisions.map(revision => ({
                ...revision, status: 'cancelled', cancellation_reason: normalizedReason,
                cancelled_at: afterSnapshot.billing.cancelled_at,
                cancelled_by: actorId, cancelled_by_name: actorName
            })), paymentAttempts: paymentAttempts.map(payment => ({
                ...payment, status: payment.status === 'pending' ? 'cancelled' : payment.status
            })) }
        });
        return { billing: afterSnapshot.billing, already_cancelled: false };
    });
}

async function cancelAdditionalBilling(deps, { mrId, additionalBillingId, reason, req }) {
    const normalizedReason = validateReason(reason);
    return runTransaction(deps.db, async connection => {
        const [[parent]] = await connection.query(
            'SELECT * FROM sunday_clinic_billings WHERE mr_id = ? FOR UPDATE', [mrId]
        );
        if (!parent) throw cancellationError('Tagihan utama tidak ditemukan.', 404);
        const [[billing]] = await connection.query(
            `SELECT * FROM sunday_clinic_additional_billings
             WHERE id = ? AND mr_id = ? AND parent_billing_id = ? FOR UPDATE`,
            [additionalBillingId, mrId, parent.id]
        );
        if (!billing) throw cancellationError('Tagihan tambahan tidak ditemukan.', 404);
        if (billing.status === 'cancelled') return { billing, already_cancelled: true };
        if (parent.status !== 'paid' || !['draft', 'confirmed'].includes(billing.status) || billing.paid_at) {
            throw cancellationError('Hanya tagihan tambahan yang belum dibayar dapat dibatalkan.');
        }
        const [[stockMovement]] = await connection.query(
            `SELECT id FROM stock_movements
             WHERE reference_type = 'sunday_clinic_additional_billing' AND reference_id = ? AND movement_type = 'sale'
             LIMIT 1`, [billing.id]
        );
        if (stockMovement) throw cancellationError('Ada pengurangan stok yang sudah dicatat untuk tagihan tambahan ini. Perlu rekonsiliasi sebelum dibatalkan.');
        const beforeSnapshot = await deps.getAdditionalBillingSnapshot(connection, billing.id);
        const actorName = req.user?.name || req.user?.display_name || req.user?.id || 'Dokter';
        const actorId = req.user?.new_id || req.user?.id || null;
        await connection.query(
            `UPDATE sunday_clinic_additional_billings
             SET status = 'cancelled', cancellation_reason = ?, cancelled_at = NOW(),
                 cancelled_by = ?, cancelled_by_name = ?, updated_at = NOW()
             WHERE id = ? AND status IN ('draft', 'confirmed')`,
            [normalizedReason, actorId, actorName, billing.id]
        );
        const afterSnapshot = await deps.getAdditionalBillingSnapshot(connection, billing.id);
        await deps.writeAdditionalBillingAudit(connection, req, {
            additionalBillingId: billing.id, mrId, action: 'additional_billing_cancelled',
            summary: `Tagihan tambahan ${billing.reference_number || billing.id} dibatalkan: ${normalizedReason}`,
            beforeSnapshot, afterSnapshot
        });
        return { billing: afterSnapshot.billing, already_cancelled: false };
    });
}

module.exports = { cancelMainBilling, cancelAdditionalBilling, validateReason, assertNoCancelledBillingEvidence };
