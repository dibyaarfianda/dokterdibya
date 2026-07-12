'use strict';

function parseJsonField(value, fallback) {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function normalizeMoney(value) {
    if (value === null || value === undefined || value === '') {
        return 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function getBillingSnapshot(client, billingId) {
    if (!billingId) {
        return null;
    }

    const [[billing]] = await client.query(
        `SELECT id, mr_id, patient_id, subtotal, total, status, billing_data,
                confirmed_at, confirmed_by, paid_at, paid_by, printed_at, printed_by,
                last_modified_by, last_modified_at, created_at, updated_at
         FROM sunday_clinic_billings
         WHERE id = ?`,
        [billingId]
    );

    if (!billing) {
        return null;
    }

    const [items] = await client.query(
        `SELECT id, item_type, item_code, item_name, quantity, price, total, item_data
         FROM sunday_clinic_billing_items
         WHERE billing_id = ?
         ORDER BY id ASC`,
        [billingId]
    );

    return {
        billing: {
            ...billing,
            subtotal: normalizeMoney(billing.subtotal),
            total: normalizeMoney(billing.total),
            billing_data: parseJsonField(billing.billing_data, {})
        },
        items: items.map(item => ({
            ...item,
            quantity: Number(item.quantity || 0),
            price: normalizeMoney(item.price),
            total: normalizeMoney(item.total),
            item_data: parseJsonField(item.item_data, {})
        }))
    };
}

async function getAdditionalBillingSnapshot(client, additionalBillingId) {
    if (!additionalBillingId) {
        return null;
    }

    const [[billing]] = await client.query(
        `SELECT id, parent_billing_id, mr_id, patient_id, sequence_number, reference_number,
                subtotal, total, status, payment_method, payment_notes,
                confirmed_at, confirmed_by, paid_at, paid_by,
                invoice_printed_at, invoice_printed_by, invoice_url,
                etiket_printed_at, etiket_printed_by, etiket_url,
                created_by, last_modified_by, last_modified_at, metadata, created_at, updated_at
         FROM sunday_clinic_additional_billings
         WHERE id = ?`,
        [additionalBillingId]
    );

    if (!billing) {
        return null;
    }

    const [items] = await client.query(
        `SELECT id, item_type, item_code, item_name, quantity, price, total, item_data
         FROM sunday_clinic_additional_billing_items
         WHERE additional_billing_id = ?
         ORDER BY id ASC`,
        [additionalBillingId]
    );

    return {
        billing: {
            ...billing,
            subtotal: normalizeMoney(billing.subtotal),
            total: normalizeMoney(billing.total),
            metadata: parseJsonField(billing.metadata, {})
        },
        items: items.map(item => ({
            ...item,
            quantity: Number(item.quantity || 0),
            price: normalizeMoney(item.price),
            total: normalizeMoney(item.total),
            item_data: parseJsonField(item.item_data, {})
        }))
    };
}

function getActorFromRequest(req) {
    const user = req?.user || {};

    return {
        actorUserId: user.new_id || user.id || null,
        actorName: user.name || user.display_name || user.username || user.email || user.id || 'Staff',
        actorRole: user.role || user.role_name || user.user_type || null
    };
}

async function logBillingAudit(client, payload) {
    if (!payload?.billingId || !payload?.mrId || !payload?.action) {
        throw new Error('billingId, mrId, and action are required for billing audit logs');
    }

    const beforeSnapshot = payload.beforeSnapshot === undefined ? null : payload.beforeSnapshot;
    const afterSnapshot = payload.afterSnapshot === undefined ? null : payload.afterSnapshot;

    const [result] = await client.query(
        `INSERT INTO sunday_clinic_billing_audit_logs
         (billing_id, mr_id, action, actor_user_id, actor_name, actor_role,
          summary, before_snapshot, after_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.billingId,
            payload.mrId,
            payload.action,
            payload.actorUserId || null,
            payload.actorName || 'Staff',
            payload.actorRole || null,
            payload.summary || null,
            beforeSnapshot === null ? null : JSON.stringify(beforeSnapshot),
            afterSnapshot === null ? null : JSON.stringify(afterSnapshot)
        ]
    );

    return result.insertId;
}

async function logAdditionalBillingAudit(client, payload) {
    if (!payload?.additionalBillingId || !payload?.mrId || !payload?.action) {
        throw new Error('additionalBillingId, mrId, and action are required for additional billing audit logs');
    }

    const beforeSnapshot = payload.beforeSnapshot === undefined ? null : payload.beforeSnapshot;
    const afterSnapshot = payload.afterSnapshot === undefined ? null : payload.afterSnapshot;

    const [result] = await client.query(
        `INSERT INTO sunday_clinic_additional_billing_audit_logs
         (additional_billing_id, mr_id, action, actor_user_id, actor_name, actor_role,
          summary, before_snapshot, after_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.additionalBillingId,
            payload.mrId,
            payload.action,
            payload.actorUserId || null,
            payload.actorName || 'Staff',
            payload.actorRole || null,
            payload.summary || null,
            beforeSnapshot === null ? null : JSON.stringify(beforeSnapshot),
            afterSnapshot === null ? null : JSON.stringify(afterSnapshot)
        ]
    );

    return result.insertId;
}

module.exports = {
    getBillingSnapshot,
    getAdditionalBillingSnapshot,
    getActorFromRequest,
    logBillingAudit,
    logAdditionalBillingAudit
};
