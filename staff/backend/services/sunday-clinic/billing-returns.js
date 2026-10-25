'use strict';

const crypto = require('crypto');
const { AppError } = require('../../middleware/errorHandler');

function fail(message, statusCode = 400) {
    throw new AppError(message, statusCode, true, 'INVALID_BILLING_RETURN');
}
const cents = value => Math.round(Number(value) * 100);
const parse = value => typeof value === 'string' ? JSON.parse(value) : (value || []);

function buildReturnPlan(input, invoice, items, previous) {
    if (invoice.status !== 'paid') fail('Retur hanya untuk tagihan yang sudah lunas.', 409);
    if (invoice.pending_changes) fail('Tagihan memiliki perubahan yang belum diselesaikan. Periksa pembayaran asal sebelum retur.', 409);
    if (!['obat', 'money'].includes(input.kind)) fail('Jenis retur tidak valid.');
    if (!['cash', 'transfer'].includes(input.payment_method)) fail('Pilih tunai atau transfer untuk pengembalian.');
    if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 2000) fail('Alasan retur wajib diisi (maksimal 2000 karakter).');
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(input.request_key || '')) fail('Kunci transaksi retur tidak valid.');
    let amount = Number(input.amount);
    let quantity = 0;
    let item = null;
    if (input.kind === 'obat') {
        item = items.find(row => Number(row.id) === Number(input.item_id) && row.item_type === 'obat');
        if (!item) fail('Obat tidak ditemukan pada invoice asal.');
        quantity = Number(input.quantity);
        const returned = previous.filter(row => Number(row.source_item_id) === Number(item.id))
            .reduce((sum, row) => sum + Number(row.quantity), 0);
        if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity + returned > Number(item.quantity)) fail('Jumlah retur melebihi sisa obat yang dibeli atau tidak valid.');
        // Difference of cumulative rounded values avoids drift on fractional unit prices.
        amount = (Math.round(cents(item.total) * (returned + quantity) / Number(item.quantity))
            - Math.round(cents(item.total) * returned / Number(item.quantity))) / 100;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99
        || Math.abs(amount * 100 - cents(amount)) > 0.0001) fail('Nominal pengembalian harus positif dan maksimal dua desimal.');
    const alreadyReturned = previous.reduce((sum, row) => sum + cents(row.amount), 0);
    if (alreadyReturned + cents(amount) > cents(invoice.total)) fail('Total pengembalian melebihi nilai invoice yang telah dibayar.', 409);
    return { amount, quantity, item, reason: input.reason.trim() };
}

function allocateReturnedStock(sales, previous, quantity) {
    if (new Set(sales.map(sale => Number(sale.obat_id))).size !== 1) fail('Riwayat stok obat tidak ditemukan atau ambigu. Periksa transaksi asal.', 409);
    const used = new Map();
    for (const row of previous) {
        for (const allocation of parse(row.stock_allocations)) {
            used.set(Number(allocation.sale_id), (used.get(Number(allocation.sale_id)) || 0) + Number(allocation.quantity));
        }
    }
    let remaining = quantity;
    const allocations = [];
    for (const sale of sales) {
        const available = -Number(sale.quantity) - (used.get(Number(sale.id)) || 0);
        const take = Math.min(remaining, Math.max(0, available));
        if (take > 0) allocations.push({ sale_id: Number(sale.id), obat_id: Number(sale.obat_id), batch_id: sale.batch_id || null, quantity: take, cost_price: Number(sale.cost_price) });
        remaining -= take;
        if (!remaining) break;
    }
    if (remaining > 0) fail('Jumlah retur melebihi stok yang pernah dikeluarkan untuk invoice ini.', 409);
    return allocations;
}

async function loadInvoices(client, mrId, forUpdate = false) {
    const lock = forUpdate ? ' FOR UPDATE' : '';
    const [[main]] = await client.query(`SELECT * FROM sunday_clinic_billings WHERE mr_id = ?${lock}`, [mrId]);
    if (!main) fail('Tagihan tidak ditemukan.', 404);
    const [[record]] = await client.query('SELECT visit_location FROM sunday_clinic_records WHERE mr_id = ? LIMIT 1', [mrId]);
    if (record?.visit_location !== 'klinik_private') fail('Retur hanya tersedia untuk Klinik Privat.', 403);
    const [additional] = await client.query(`SELECT * FROM sunday_clinic_additional_billings WHERE parent_billing_id = ? AND mr_id = ? ORDER BY id${lock}`, [main.id, mrId]);
    return { main, additional };
}

async function listReturns(client, mrId) {
    const { main, additional } = await loadInvoices(client, mrId);
    const [returns] = await client.query('SELECT * FROM sunday_clinic_billing_returns WHERE billing_id = ? ORDER BY id', [main.id]);
    const invoices = [];
    for (const invoice of [main, ...additional]) {
        if (invoice.status !== 'paid') continue;
        const isAdditional = invoice !== main;
        const [items] = await client.query(`SELECT id, item_type, item_name, quantity, price, total FROM ${isAdditional ? 'sunday_clinic_additional_billing_items' : 'sunday_clinic_billing_items'} WHERE ${isAdditional ? 'additional_billing_id' : 'billing_id'} = ? ORDER BY id`, [invoice.id]);
        const history = returns.filter(row => Number(row.additional_billing_id || 0) === (isAdditional ? Number(invoice.id) : 0));
        invoices.push({ additional_billing_id: isAdditional ? invoice.id : null, reference_number: invoice.reference_number || mrId,
            total: Number(invoice.total), returned_total: history.reduce((sum, row) => sum + Number(row.amount), 0),
            items: items.filter(item => item.item_type === 'obat').map(item => ({ ...item,
                remaining_quantity: Number(item.quantity) - history.filter(row => Number(row.source_item_id) === Number(item.id)).reduce((sum, row) => sum + Number(row.quantity), 0)
            })) });
    }
    const paidTotal = invoices.reduce((sum, invoice) => sum + cents(invoice.total), 0) / 100;
    const returnTotal = returns.reduce((sum, row) => sum + cents(row.amount), 0) / 100;
    return { invoices, returns, paid_total: paidTotal, return_total: returnTotal, net_total: (cents(paidTotal) - cents(returnTotal)) / 100 };
}

function returnRequestHash(input) {
    const additionalId = input.additional_billing_id == null ? null : Number(input.additional_billing_id);
    if (additionalId !== null && (!Number.isSafeInteger(additionalId) || additionalId <= 0)) fail('Invoice asal tidak valid.');
    return crypto.createHash('sha256').update(JSON.stringify({
        additionalId, kind: input.kind, item_id: input.kind === 'obat' ? Number(input.item_id) : null,
        quantity: input.kind === 'obat' ? Number(input.quantity) : 0,
        amount: input.kind === 'money' ? Number(input.amount) : null,
        reason: String(input.reason || '').trim(), payment_method: input.payment_method
    })).digest('hex');
}

async function findSavedReturn(client, mrId, input) {
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(input.request_key || '')) return null;
    const [[saved]] = await client.query('SELECT id, amount, request_hash FROM sunday_clinic_billing_returns WHERE mr_id = ? AND request_key = ?', [mrId, input.request_key]);
    if (!saved) return null;
    if (saved.request_hash !== returnRequestHash(input)) fail('Kunci transaksi sudah digunakan untuk retur berbeda.', 409);
    return { id: saved.id, amount: Number(saved.amount), already_saved: true };
}

async function createReturn(deps, { mrId, input, actor, accountingDate }) {
    const hash = returnRequestHash(input);
    const additionalId = input.additional_billing_id == null ? null : Number(input.additional_billing_id);
    const connection = await deps.db.getConnection();
    try {
        await connection.beginTransaction();
        const { main, additional } = await loadInvoices(connection, mrId, true);
        const [allReturns] = await connection.query('SELECT * FROM sunday_clinic_billing_returns WHERE billing_id = ? ORDER BY id FOR UPDATE', [main.id]);
        const duplicate = allReturns.find(row => row.request_key === input.request_key);
        if (duplicate) {
            if (duplicate.request_hash !== hash) fail('Kunci transaksi sudah digunakan untuk retur berbeda.', 409);
            await connection.commit();
            return { id: duplicate.id, already_saved: true };
        }
        const invoice = additionalId ? additional.find(row => Number(row.id) === additionalId) : main;
        if (!invoice) fail('Invoice asal tidak ditemukan.', 404);
        if (main.status !== 'paid') fail('Tagihan utama belum lunas.', 409);
        const [items] = await connection.query(`SELECT * FROM ${additionalId ? 'sunday_clinic_additional_billing_items' : 'sunday_clinic_billing_items'} WHERE ${additionalId ? 'additional_billing_id' : 'billing_id'} = ? ORDER BY id FOR UPDATE`, [invoice.id]);
        const previous = allReturns.filter(row => Number(row.additional_billing_id || 0) === Number(additionalId || 0));
        const plan = buildReturnPlan(input, invoice, items, previous);
        const [[paidAudit]] = await connection.query(`SELECT after_snapshot FROM ${additionalId ? 'sunday_clinic_additional_billing_audit_logs' : 'sunday_clinic_billing_audit_logs'}
            WHERE ${additionalId ? 'additional_billing_id' : 'billing_id'} = ? AND action = ? ORDER BY id DESC LIMIT 1`,
        [invoice.id, additionalId ? 'additional_billing_marked_paid' : 'billing_marked_paid']);
        if (paidAudit) {
            const snapshot = parse(paidAudit.after_snapshot);
            const originalItem = plan.item && snapshot.items?.find(row => Number(row.id) === Number(plan.item.id));
            if (!snapshot.billing || cents(snapshot.billing.total) !== cents(invoice.total)
                || (plan.item && (!originalItem || Number(originalItem.quantity) !== Number(plan.item.quantity) || cents(originalItem.total) !== cents(plan.item.total)))) {
                fail('Invoice berbeda dari bukti saat pembayaran. Rekonsiliasi invoice asal sebelum retur.', 409);
            }
        }
        let allocations = [];
        if (plan.item) {
            const itemData = typeof plan.item.item_data === 'string' ? JSON.parse(plan.item.item_data || '{}') : (plan.item.item_data || {});
            const [sales] = await connection.query(`SELECT sm.id, sm.obat_id, sm.batch_id, sm.quantity, sm.cost_price
                FROM stock_movements sm JOIN obat o ON o.id = sm.obat_id
                WHERE sm.reference_type = ? AND sm.reference_id = ? AND sm.movement_type = 'sale'
                AND (o.id = ? OR (? IS NULL AND (o.code = ? OR CAST(o.id AS CHAR) = ? OR LOWER(TRIM(o.name)) = LOWER(TRIM(?)))))
                ORDER BY sm.id FOR UPDATE`, [additionalId ? 'sunday_clinic_additional_billing' : 'sunday_clinic_billing', invoice.id,
                itemData.obatId || null, itemData.obatId || null, plan.item.item_code, plan.item.item_code, plan.item.item_name]);
            allocations = allocateReturnedStock(sales, previous, plan.quantity);
        }
        const [saved] = await connection.query(`INSERT INTO sunday_clinic_billing_returns
            (billing_id, additional_billing_id, mr_id, patient_id, kind, source_item_id, item_name, quantity, amount,
             reason, payment_method, accounting_date, actor_id, actor_name, request_key, request_hash, stock_allocations)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [main.id, additionalId, mrId, main.patient_id, input.kind, plan.item?.id || null, plan.item?.item_name || null,
            plan.quantity, plan.amount, plan.reason, input.payment_method, accountingDate, actor.id, actor.name,
            input.request_key, hash, JSON.stringify(allocations)]);
        for (const allocation of allocations) {
            if (allocation.batch_id) {
                const [update] = await connection.query(`UPDATE obat_batches SET quantity_remaining = quantity_remaining + ?
                    WHERE id = ? AND obat_id = ? AND quantity_remaining + ? <= quantity_purchased`,
                [allocation.quantity, allocation.batch_id, allocation.obat_id, allocation.quantity]);
                if (!update.affectedRows) fail('Batch stok asal tidak dapat dipulihkan. Periksa persediaan.', 409);
            }
            const [update] = await connection.query('UPDATE obat SET stock = stock + ? WHERE id = ?', [allocation.quantity, allocation.obat_id]);
            if (!update.affectedRows) fail('Obat asal tidak ditemukan.', 409);
            await connection.query(`INSERT INTO stock_movements
                (obat_id, batch_id, movement_type, quantity, cost_price, reference_type, reference_id, notes, created_by)
                VALUES (?, ?, 'return', ?, ?, 'sunday_clinic_return', ?, ?, ?)`,
            [allocation.obat_id, allocation.batch_id, allocation.quantity, allocation.cost_price, saved.insertId, plan.reason, actor.id]);
        }
        await deps.audit(connection, { billingId: main.id, mrId, action: 'billing_return',
            actorUserId: actor.id, actorName: actor.name, actorRole: actor.role,
            summary: `Retur R${saved.insertId}: ${plan.reason}`,
            beforeSnapshot: { invoice_id: invoice.id, additional_billing_id: additionalId, invoice_total: invoice.total },
            afterSnapshot: { return_id: saved.insertId, kind: input.kind, amount: plan.amount, quantity: plan.quantity, accounting_date: accountingDate, stock_allocations: allocations }
        });
        await connection.commit();
        return { id: saved.insertId, amount: plan.amount, already_saved: false };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { buildReturnPlan, allocateReturnedStock, listReturns, createReturn, findSavedReturn };
