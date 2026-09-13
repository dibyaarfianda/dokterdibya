'use strict';

const { cancelMainBilling, cancelAdditionalBilling } = require('../../services/sunday-clinic/billing-cancellation');

function fixture({ status = 'confirmed', payments = [], providerStatus = 'expired', additional = false } = {}) {
    const state = {
        billing: { id: 7, mr_id: 'DRD0007', status, total: 50000, paid_at: null },
        additional: { id: 8, parent_billing_id: 7, mr_id: 'DRD0007', status, total: 20000, paid_at: null },
        payments,
        revisions: [{ id: 11, status: 'pending' }],
        audits: [],
        committed: false,
        queries: []
    };
    const connection = {
        beginTransaction: jest.fn(),
        commit: jest.fn(async () => { state.committed = true; }),
        rollback: jest.fn(),
        release: jest.fn(),
        query: jest.fn(async (sql, params) => {
            state.queries.push(sql);
            if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
            if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
            if (sql.includes('FROM sunday_clinic_billings') && sql.includes('FOR UPDATE')) return [[state.billing]];
            if (sql.includes('FROM sunday_clinic_additional_billings') && sql.includes('FOR UPDATE')) return [[additional ? state.additional : undefined]];
            if (sql.includes('FROM tagihan_payments') && sql.includes('FOR UPDATE')) return [state.payments];
            if (sql.includes('FROM sunday_clinic_billing_revisions') && sql.includes('FOR UPDATE')) return [state.revisions.filter(r => r.status === 'pending')];
            if (sql.startsWith('UPDATE sunday_clinic_billings')) { state.billing.status = 'cancelled'; return [{ affectedRows: 1 }]; }
            if (sql.startsWith('UPDATE sunday_clinic_additional_billings')) { state.additional.status = 'cancelled'; return [{ affectedRows: 1 }]; }
            if (sql.startsWith('UPDATE sunday_clinic_billing_revisions')) { state.revisions[0].status = 'cancelled'; return [{ affectedRows: 1 }]; }
            return [[]];
        })
    };
    const deps = {
        db: { getConnection: async () => connection },
        getPaymentStatus: jest.fn(async () => ({ success: true, status: providerStatus, paid_amount: 0 })),
        getBillingSnapshot: jest.fn(async () => ({ billing: { ...state.billing }, items: [{ id: 2, total: 50000 }] })),
        getAdditionalBillingSnapshot: jest.fn(async () => ({ billing: { ...state.additional }, items: [{ id: 3, total: 20000 }] })),
        writeBillingAudit: jest.fn(async (_, __, audit) => { state.audits.push(audit); }),
        writeAdditionalBillingAudit: jest.fn(async (_, __, audit) => { state.audits.push(audit); })
    };
    return { state, connection, deps };
}

const actor = { user: { id: 1, name: 'Dokter', role: 'dokter' } };

test('cancels unpaid main invoice atomically while retaining its items and closing revisions', async () => {
    const { state, deps } = fixture();
    const result = await cancelMainBilling(deps, { mrId: 'DRD0007', reason: 'Tagihan salah', req: actor });
    expect(result.billing.status).toBe('cancelled');
    expect(state.committed).toBe(true);
    expect(state.revisions[0].status).toBe('cancelled');
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0].beforeSnapshot.items[0].total).toBe(50000);
    expect(state.audits[0].afterSnapshot.items[0].total).toBe(50000);
    expect(state.queries.some(sql => sql.includes('DELETE FROM sunday_clinic_billing_items'))).toBe(false);
});

test('repeat cancellation is idempotent and has no second audit', async () => {
    const { state, deps } = fixture({ status: 'cancelled' });
    const result = await cancelMainBilling(deps, { mrId: 'DRD0007', reason: 'Tagihan salah', req: actor });
    expect(result.already_cancelled).toBe(true);
    expect(state.audits).toHaveLength(0);
});

test('locally cancelled payment still needs provider confirmation', async () => {
    const { deps, connection } = fixture({ payments: [{ id: 3, status: 'cancelled', xendit_id: 'pr_3', payment_method: 'qris' }], providerStatus: 'pending' });
    await expect(cancelMainBilling(deps, { mrId: 'DRD0007', reason: 'Tagihan salah', req: actor })).rejects.toMatchObject({ statusCode: 409 });
    expect(deps.getPaymentStatus).toHaveBeenCalledWith('pr_3', 'qris');
    expect(connection.commit).not.toHaveBeenCalled();
});

test('unidentified online attempt blocks cancellation', async () => {
    const { deps, connection } = fixture({ payments: [{ id: 3, status: 'cancelled', xendit_id: null, payment_method: 'qris' }] });
    await expect(cancelMainBilling(deps, { mrId: 'DRD0007', reason: 'Tagihan salah', req: actor })).rejects.toMatchObject({ statusCode: 409 });
    expect(connection.commit).not.toHaveBeenCalled();
});

test('cancelled internal insurance attempt without provider ID does not block cancellation', async () => {
    const { deps } = fixture({ payments: [{ id: 3, status: 'cancelled', xendit_id: null, payment_method: 'asuransi', reconciliation_required: 0 }] });
    await expect(cancelMainBilling(deps, { mrId: 'DRD0007', reason: 'Tagihan salah', req: actor }))
        .resolves.toMatchObject({ billing: { status: 'cancelled' } });
    expect(deps.getPaymentStatus).not.toHaveBeenCalled();
});

test('pending insurance and reconciliation evidence block cancellation', async () => {
    for (const payment of [
        { id: 3, status: 'pending', xendit_id: null, payment_method: 'asuransi' },
        { id: 4, status: 'cancelled', xendit_id: null, payment_method: 'asuransi', reconciliation_required: 1 }
    ]) {
        const { deps } = fixture({ payments: [payment] });
        await expect(cancelMainBilling(deps, { mrId: 'DRD0007', reason: 'Tagihan salah', req: actor }))
            .rejects.toMatchObject({ statusCode: 409 });
    }
});

test('verified terminal provider attempt is closed locally and captured in audit', async () => {
    const { state, deps } = fixture({ payments: [{ id: 3, status: 'pending', xendit_id: 'pr_3', payment_method: 'qris' }] });
    await cancelMainBilling(deps, { mrId: 'DRD0007', reason: 'Tagihan salah', req: actor });
    expect(state.queries.some(sql => sql.includes("UPDATE tagihan_payments SET status = 'cancelled'"))).toBe(true);
    expect(state.queries.some(sql => sql.includes("'billing.cancelled'"))).toBe(true);
    expect(state.audits[0].beforeSnapshot.paymentAttempts[0].status).toBe('pending');
    expect(state.audits[0].afterSnapshot.paymentAttempts[0].status).toBe('cancelled');
});

test('paid local evidence blocks cancellation before provider lookup', async () => {
    const { deps } = fixture({ payments: [{ id: 3, status: 'paid', xendit_id: 'pr_3', payment_method: 'qris' }] });
    await expect(cancelMainBilling(deps, { mrId: 'DRD0007', reason: 'Tagihan salah', req: actor })).rejects.toMatchObject({ statusCode: 409 });
    expect(deps.getPaymentStatus).not.toHaveBeenCalled();
});

test('audit failure rolls back cancellation transaction', async () => {
    const { deps, connection } = fixture();
    deps.writeBillingAudit.mockRejectedValueOnce(new Error('audit insert failed'));
    await expect(cancelMainBilling(deps, { mrId: 'DRD0007', reason: 'Tagihan salah', req: actor }))
        .rejects.toThrow('audit insert failed');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
});

test('cancels unpaid additional invoice without changing paid parent', async () => {
    const { state, deps } = fixture({ additional: true });
    state.billing.status = 'paid';
    const result = await cancelAdditionalBilling(deps, { mrId: 'DRD0007', additionalBillingId: 8, reason: 'Duplikat', req: actor });
    expect(result.billing.status).toBe('cancelled');
    expect(state.billing.status).toBe('paid');
    expect(state.audits).toHaveLength(1);
});
