const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert/strict');
// Explicit opt-in integration check. Copies table structures only, writes synthetic data
// exclusively to a unique stock_ledger_qa_* database, then drops that database.
const root = path.resolve(__dirname, '..');
const req = Module.createRequire(root + '/package.json');
const mysql = req('mysql2/promise');
const qaName = 'stock_ledger_qa_' + Date.now();
if (!/^stock_ledger_qa_\d+$/.test(qaName)) throw new Error('Unsafe QA database name');
const tables = ['obat', 'obat_batches', 'stock_movements'];
const socket = '/run/mysqld/mysqld.sock';

async function main() {
    const admin = await mysql.createConnection({ user: 'root', socketPath: socket, multipleStatements: true });
    let pool;
    try {
        await admin.query('CREATE DATABASE `' + qaName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        for (const table of tables) await admin.query(`CREATE TABLE \`${qaName}\`.\`${table}\` LIKE dibyaklinik.\`${table}\``);
        pool = mysql.createPool({ user: 'root', socketPath: socket, database: qaName, connectionLimit: 8, multipleStatements: true });
        await pool.query(fs.readFileSync(path.join(root, 'migrations/20261106_stock_adjustment_requests.sql'), 'utf8'));
        require.cache[req.resolve('./db')] = { exports: pool };
        const ledger = req('./services/StockLedgerService');
        const requests = req('./services/StockAdjustmentRequestService');
        const reconciliation = req('./services/DrugAuditReconciliationService');

        async function insert(table, values) {
            const [columns] = await pool.query('SHOW COLUMNS FROM `' + table + '`');
            const row = { ...values };
            for (const c of columns) {
                if (row[c.Field] !== undefined || c.Null === 'YES' || c.Default !== null || c.Extra.includes('auto_increment')) continue;
                if (c.Type.startsWith('enum(')) row[c.Field] = c.Type.match(/'([^']+)'/)[1];
                else if (/int|decimal|float|double/.test(c.Type)) row[c.Field] = 0;
                else if (/date|timestamp/.test(c.Type)) row[c.Field] = '2026-01-01';
                else row[c.Field] = c.Type === 'json' ? '{}' : 'QA';
            }
            await pool.query('INSERT INTO `' + table + '` SET ?', row);
        }
        const scalar = async (sql) => Number(Object.values((await pool.query(sql))[0][0])[0]);
        const actor = { id: 'QA', name: 'QA Script' };

        // 1. Column types (input for stage 2 planning)
        for (const col of ['movement_type', 'reference_type']) {
            const [[c]] = await pool.query('SHOW COLUMNS FROM stock_movements LIKE ?', [col]);
            console.log(`stock_movements.${col} Type: ${c.Type}`);
        }

        // 2. Seed: stock 10, batches 2 + 5 => 3 legacy units without batch
        await insert('obat', { id: 1, code: 'QA1', name: 'QA Obat', price: 5000, stock: 10, default_cost_price: 1000, is_active: 1 });
        await insert('obat_batches', { obat_id: 1, batch_number: 'QA-B1', purchase_date: '2026-01-01', cost_price: 1000, quantity_purchased: 2, quantity_remaining: 2 });
        await insert('obat_batches', { obat_id: 1, batch_number: 'QA-B2', purchase_date: '2026-02-01', cost_price: 1100, quantity_purchased: 5, quantity_remaining: 5 });
        console.log('seed OK: stock 10, batches 2+5 (3 legacy)');

        // 3. Concurrent double approval of -6 rusak
        const created = await requests.createAdjustmentRequest({ obat_id: 1, quantity_delta: -6, reason_category: 'rusak', reason_note: 'QA rusak' }, actor);
        const id1 = created.id ?? created.request?.id;
        assert.ok(id1, 'request id missing: ' + JSON.stringify(created));
        const settled = await Promise.allSettled([
            requests.approveAdjustmentRequest(id1, actor, 'QA a'),
            requests.approveAdjustmentRequest(id1, actor, 'QA b')
        ]);
        assert.equal(settled.filter(s => s.status === 'fulfilled').length, 1);
        const rejected = settled.filter(s => s.status === 'rejected');
        assert.equal(rejected.length, 1);
        assert.equal(rejected[0].reason.statusCode, 409);
        console.log('scenario 3 OK: concurrent double approval -> 1 fulfilled, 1 rejected (409)');

        // 4. Stock and batches
        assert.equal(await scalar('SELECT stock FROM obat WHERE id=1'), 4);
        const [batchRows] = await pool.query('SELECT quantity_remaining FROM obat_batches WHERE obat_id=1 ORDER BY purchase_date, id');
        assert.deepEqual(batchRows.map(b => Number(b.quantity_remaining)), [0, 1]);
        console.log('scenario 4 OK: stock 4, batch remaining [0, 1]');

        // 5. Concurrent sale (FIFO) and +2 approval
        const created2 = await requests.createAdjustmentRequest({ obat_id: 1, quantity_delta: 2, reason_category: 'salah_hitung', reason_note: 'QA tambah' }, actor);
        const id2 = created2.id ?? created2.request?.id;
        assert.ok(id2, 'request id missing: ' + JSON.stringify(created2));
        await Promise.all([
            ledger.deductStockFIFO(1, 1, 'qa', 1, 'QA'),
            requests.approveAdjustmentRequest(id2, actor, 'QA ok')
        ]);
        const finalStock = await scalar('SELECT stock FROM obat WHERE id=1');
        assert.equal(finalStock, 5);
        assert.equal(10 + await scalar('SELECT SUM(quantity) FROM stock_movements WHERE obat_id=1'), finalStock);
        console.log('scenario 5 OK: concurrent sale + adjustment -> stock 5, ledger consistent');

        // 6. Reconciliation
        const rec = await reconciliation.getReconciliation();
        const row = rec.rows.find(r => r.obat_id === 1);
        assert.ok(row, 'obat 1 missing from reconciliation');
        assert.equal(row.status, 'batch_mismatch');
        console.log(`scenario 6 OK: reconciliation obat 1 = ${row.status} (stock ${row.stock}, batch_total ${row.batch_total})`);
        console.log('stock ledger isolated verification OK');
    } finally {
        try {
            if (pool) await pool.end();
        } catch (error) {
            console.error('pool.end failed (continuing to drop QA database):', error && error.message || error);
        }
        await admin.query('DROP DATABASE IF EXISTS `' + qaName + '`');
        try {
            await admin.end();
        } catch (error) {
            console.error('admin.end failed:', error && error.message || error);
        }
        console.log('Isolated QA database removed');
    }
}
main().then(() => process.exit(0)).catch(error => { console.error(error && error.stack || error); process.exit(1); });
