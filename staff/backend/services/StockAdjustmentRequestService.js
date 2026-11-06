const db = require('../db');
const cache = require('../utils/cache');
const StockLedgerService = require('./StockLedgerService');

const { ADJUSTMENT_REASON_CATEGORIES, stockLedgerError, effectiveUnitCost } = StockLedgerService;

const STALE_REQUEST_DAYS = 7;
const MAX_ABS_DELTA = 100000;
const LIST_STATUSES = ['pending', 'approved', 'rejected', 'all'];

function actorFromRequest(req) {
    return { id: String(req.user.id), name: req.user.name || String(req.user.id) };
}

function parseDelta(raw) {
    if (typeof raw === 'number') {
        return Number.isInteger(raw) && raw !== 0 ? raw : null;
    }
    if (typeof raw === 'string' && /^-?[1-9]\d*$/.test(raw)) {
        const n = Number(raw);
        return Number.isSafeInteger(n) ? n : null;
    }
    return null;
}

function parsePositiveInt(raw) {
    if (typeof raw === 'number') {
        return Number.isInteger(raw) && raw > 0 ? raw : null;
    }
    if (typeof raw === 'string' && /^[1-9]\d*$/.test(raw)) {
        const n = Number(raw);
        return Number.isSafeInteger(n) ? n : null;
    }
    return null;
}

function normalizeAdjustmentInput(body) {
    const input = body || {};

    const obatId = parsePositiveInt(input.obat_id);
    if (!obatId) throw stockLedgerError('Obat harus dipilih', 400);

    const quantityDelta = parseDelta(input.quantity_delta);
    if (quantityDelta === null) {
        throw stockLedgerError('Jumlah penyesuaian harus bilangan bulat selain 0', 400);
    }
    if (Math.abs(quantityDelta) > MAX_ABS_DELTA) {
        throw stockLedgerError('Jumlah penyesuaian terlalu besar', 400);
    }

    const reasonCategory = input.reason_category;
    if (!ADJUSTMENT_REASON_CATEGORIES.includes(reasonCategory) || reasonCategory === 'opname') {
        throw stockLedgerError('Kategori alasan tidak valid', 400);
    }

    const reasonNote = typeof input.reason_note === 'string' ? input.reason_note.trim() : '';
    if (!reasonNote || reasonNote.length > 1000) {
        throw stockLedgerError('Catatan alasan wajib diisi (maksimal 1000 karakter)', 400);
    }

    const hasBatch = input.batch_id !== undefined && input.batch_id !== null && input.batch_id !== '';
    let batchId = null;
    if (hasBatch) {
        if (quantityDelta > 0) {
            throw stockLedgerError('Batch hanya bisa dipilih untuk pengurangan stok', 400);
        }
        batchId = parsePositiveInt(input.batch_id);
        if (!batchId) throw stockLedgerError('Batch tidak ditemukan untuk obat ini', 400);
    }
    if (reasonCategory === 'kedaluwarsa' && !batchId) {
        throw stockLedgerError('Pilih batch untuk obat kedaluwarsa', 400);
    }

    return { obatId, batchId, quantityDelta, reasonCategory, reasonNote };
}

function toRequestView(row) {
    const unitCost = effectiveUnitCost({
        defaultCostPrice: row.default_cost_price,
        latestBatchCost: row.latest_batch_cost
    });
    return {
        ...row,
        value: Number(row.quantity_delta) * unitCost,
        is_stale: row.status === 'pending' && Number(row.age_days) > STALE_REQUEST_DAYS
    };
}

async function createAdjustmentRequest(body, actor) {
    const input = normalizeAdjustmentInput(body);

    const [obatRows] = await db.query('SELECT id, stock FROM obat WHERE id = ?', [input.obatId]);
    if (!obatRows || !obatRows[0]) {
        throw stockLedgerError('Obat tidak ditemukan', 404, 'OBAT_NOT_FOUND');
    }

    if (input.batchId) {
        const [batchRows] = await db.query(
            'SELECT id FROM obat_batches WHERE id = ? AND obat_id = ?',
            [input.batchId, input.obatId]
        );
        if (!batchRows || !batchRows[0]) {
            throw stockLedgerError('Batch tidak ditemukan untuk obat ini', 400);
        }
    }

    const [result] = await db.query(
        `INSERT INTO stock_adjustment_requests
         (obat_id, batch_id, quantity_delta, reason_category, reason_note, source,
          status, stock_at_request, requested_by_id, requested_by_name)
         VALUES (?, ?, ?, ?, ?, 'manual', 'pending', ?, ?, ?)`,
        [input.obatId, input.batchId, input.quantityDelta, input.reasonCategory,
            input.reasonNote, Number(obatRows[0].stock), actor.id, actor.name]
    );

    return { id: result.insertId, status: 'pending' };
}

async function listAdjustmentRequests({ status = 'pending', limit = 50, offset = 0 } = {}) {
    if (!LIST_STATUSES.includes(status)) {
        throw stockLedgerError('Status tidak valid', 400);
    }
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const where = status === 'all' ? '' : 'WHERE sar.status = ?';
    const filterParams = status === 'all' ? [] : [status];

    const [rows] = await db.query(
        `SELECT sar.*,
                o.code, o.name, o.unit, o.stock AS current_stock, o.default_cost_price,
                b.batch_number,
                (SELECT ob.cost_price FROM obat_batches ob
                  WHERE ob.obat_id = sar.obat_id AND ob.cost_price > 0
                  ORDER BY ob.purchase_date DESC, ob.id DESC LIMIT 1) AS latest_batch_cost,
                DATEDIFF(NOW(), sar.requested_at) AS age_days
         FROM stock_adjustment_requests sar
         LEFT JOIN obat o ON o.id = sar.obat_id
         LEFT JOIN obat_batches b ON b.id = sar.batch_id
         ${where}
         ORDER BY sar.requested_at DESC, sar.id DESC
         LIMIT ? OFFSET ?`,
        [...filterParams, safeLimit, safeOffset]
    );

    const [countRows] = await db.query(
        `SELECT COUNT(*) AS total
         FROM stock_adjustment_requests sar
         LEFT JOIN obat o ON o.id = sar.obat_id
         ${where}`,
        filterParams
    );

    return {
        rows: (rows || []).map(toRequestView),
        total: Number(countRows && countRows[0] ? countRows[0].total : 0)
    };
}

async function lockRequest(connection, id) {
    const [rows] = await connection.query(
        'SELECT * FROM stock_adjustment_requests WHERE id = ? FOR UPDATE',
        [id]
    );
    if (!rows || !rows[0]) {
        throw stockLedgerError('Pengajuan tidak ditemukan', 404, 'REQUEST_NOT_FOUND');
    }
    if (rows[0].status !== 'pending') {
        throw stockLedgerError('Pengajuan sudah diputuskan', 409, 'REQUEST_DECIDED');
    }
    return rows[0];
}

function cleanNote(note) {
    const trimmed = typeof note === 'string' ? note.trim() : '';
    return trimmed || null;
}

async function approveAdjustmentRequest(id, actor, decisionNote) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const request = await lockRequest(connection, id);

        const applied = await StockLedgerService.applyAdjustmentInTransaction(connection, {
            requestId: request.id,
            obatId: request.obat_id,
            batchId: request.batch_id,
            quantityDelta: request.quantity_delta,
            reasonCategory: request.reason_category,
            actorName: actor.name
        });

        await connection.query(
            `UPDATE stock_adjustment_requests
             SET status = 'approved', stock_at_decision = ?, decided_by_id = ?, decided_by_name = ?,
                 decided_at = NOW(), decision_note = ?, movement_ids = ?
             WHERE id = ?`,
            [applied.stockBefore, actor.id, actor.name, cleanNote(decisionNote),
                JSON.stringify(applied.movementIds), request.id]
        );

        await connection.commit();
        cache.delPattern('obat:');

        return {
            id: request.id,
            status: 'approved',
            stockAfter: applied.stockAfter,
            movementIds: applied.movementIds
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function rejectAdjustmentRequest(id, actor, decisionNote) {
    const note = cleanNote(decisionNote);
    if (!note) {
        throw stockLedgerError('Catatan penolakan wajib diisi', 400);
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const request = await lockRequest(connection, id);

        const [obatRows] = await connection.query('SELECT stock FROM obat WHERE id = ?', [request.obat_id]);
        const stockNow = obatRows && obatRows[0] ? Number(obatRows[0].stock) : null;

        await connection.query(
            `UPDATE stock_adjustment_requests
             SET status = 'rejected', stock_at_decision = ?, decided_by_id = ?, decided_by_name = ?,
                 decided_at = NOW(), decision_note = ?
             WHERE id = ?`,
            [stockNow, actor.id, actor.name, note, request.id]
        );

        await connection.commit();
        return { id: request.id, status: 'rejected' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    STALE_REQUEST_DAYS,
    actorFromRequest,
    normalizeAdjustmentInput,
    toRequestView,
    createAdjustmentRequest,
    listAdjustmentRequests,
    approveAdjustmentRequest,
    rejectAdjustmentRequest
};
