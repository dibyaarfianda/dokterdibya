const db = require('../db');

function classifyReconciliationRow({ stock, batchTotal, expectedStock }) {
    if (expectedStock != null && stock !== expectedStock) return 'movement_mismatch';
    if (stock !== batchTotal) return 'batch_mismatch';
    return 'match';
}

async function getReconciliation({ onlyMismatch = false } = {}) {
    const connection = await db.getConnection();
    try {
        // Satu snapshot konsisten, read-only, agar stok dan batch dibaca pada titik waktu yang sama.
        await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
        const [dbRows] = await connection.query(
            `SELECT o.id, o.code, o.name, o.unit, o.is_active, o.stock,
                    COALESCE(SUM(ob.quantity_remaining), 0) AS batch_total
             FROM obat o
             LEFT JOIN obat_batches ob ON ob.obat_id = o.id
             GROUP BY o.id
             ORDER BY o.name`
        );
        await connection.commit();

        const summary = { total: 0, match: 0, batch_mismatch: 0, movement_mismatch: 0 };
        const rows = dbRows.map((r) => {
            const stock = Number(r.stock);
            const batchTotal = Number(r.batch_total || 0);
            const status = classifyReconciliationRow({ stock, batchTotal, expectedStock: null });
            summary.total += 1;
            summary[status] += 1;
            return {
                obat_id: Number(r.id),
                code: r.code,
                name: r.name,
                unit: r.unit,
                is_active: Number(r.is_active),
                stock,
                batch_total: batchTotal,
                expected_stock: null,
                status
            };
        });

        return {
            baseline: null,
            summary,
            rows: onlyMismatch ? rows.filter((r) => r.status !== 'match') : rows
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { classifyReconciliationRow, getReconciliation };
