const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert/strict');
// Explicit opt-in integration check. Copies schemas only, writes synthetic data
// exclusively to a unique codex_returns_qa_* database, then drops that database.
const root = path.resolve(__dirname, '..');
const req = Module.createRequire(root + '/package.json');
const mysql = req('mysql2/promise');
const qaName = 'codex_returns_qa_' + Date.now();
if (!/^codex_returns_qa_\d+$/.test(qaName)) throw new Error('Unsafe QA database name');
const tables = ['sunday_clinic_billings', 'sunday_clinic_records', 'sunday_clinic_billing_items', 'sunday_clinic_additional_billings', 'sunday_clinic_additional_billing_items', 'sunday_clinic_billing_audit_logs', 'sunday_clinic_additional_billing_audit_logs', 'obat', 'obat_batches', 'stock_movements', 'sunday_clinic_closings', 'sunday_clinic_closing_entries', 'sunday_clinic_billing_revisions', 'patients', 'sunday_appointments', 'tagihan_payments'];
(async () => {
    const admin = await mysql.createConnection({ user: 'root', socketPath: '/run/mysqld/mysqld.sock', multipleStatements: true });
    let pool;
    try {
        await admin.query('CREATE DATABASE `' + qaName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        for (const table of tables) await admin.query(`CREATE TABLE \`${qaName}\`.\`${table}\` LIKE dibyaklinik.\`${table}\``);
        pool = mysql.createPool({ user: 'root', socketPath: '/run/mysqld/mysqld.sock', database: qaName, connectionLimit: 6, multipleStatements: true });
        await pool.query(fs.readFileSync(path.join(root, 'migrations/20261025_create_sunday_clinic_returns.sql'), 'utf8'));
        require.cache[req.resolve('./db')] = { exports: pool };
        const service = req('./services/sunday-clinic/billing-returns');
        const closing = req('./services/SundayClinicClosingService');
        const audit = req('./services/SundayClinicBillingAuditService').logBillingAudit;
        const date = req('./utils/date').formatDateLocal();
        async function insert(table, values) {
            const [columns] = await pool.query('SHOW COLUMNS FROM `' + table + '`');
            const row = { ...values };
            for (const c of columns) {
                if (row[c.Field] !== undefined || c.Null === 'YES' || c.Default !== null || c.Extra.includes('auto_increment')) continue;
                if (c.Type.startsWith('enum(')) row[c.Field] = c.Type.match(/'([^']+)'/)[1];
                else if (/int|decimal|float|double/.test(c.Type)) row[c.Field] = 0;
                else if (/date|timestamp/.test(c.Type)) row[c.Field] = '2026-10-24';
                else row[c.Field] = c.Type === 'json' ? '{}' : 'QA';
            }
            await pool.query('INSERT INTO `' + table + '` SET ?', row);
        }
        await insert('patients', { id: 'QA0001', full_name: 'Synthetic QA' });
        await insert('sunday_clinic_records', { id: 1, mr_id: 'QA001', patient_id: 'QA0001', visit_location: 'klinik_private', created_at: '2026-10-24 10:00:00' });
        await insert('sunday_clinic_billings', { id: 1, mr_id: 'QA001', patient_id: 'QA0001', total: 100000, subtotal: 100000, status: 'paid', paid_at: '2026-10-24 10:00:00', paid_by: 'QA', accounting_date: '2026-10-24', pending_changes: 0 });
        await insert('sunday_clinic_billing_items', { id: 7, billing_id: 1, item_type: 'obat', item_code: 'QAOBAT', item_name: 'Obat QA', quantity: 10, price: 10000, total: 100000, item_data: JSON.stringify({ obatId: 2 }) });
        await insert('obat', { id: 2, code: 'QAOBAT', name: 'Obat QA', stock: 12 });
        await insert('obat_batches', { id: 3, obat_id: 2, cost_price: 4000, quantity_purchased: 10, quantity_remaining: 2, purchase_date: '2026-10-01' });
        await insert('stock_movements', { id: 8, obat_id: 2, batch_id: 3, movement_type: 'sale', quantity: -8, cost_price: 4000, reference_type: 'sunday_clinic_billing', reference_id: 1 });
        await insert('stock_movements', { id: 9, obat_id: 2, batch_id: null, movement_type: 'sale', quantity: -2, cost_price: 5000, reference_type: 'sunday_clinic_billing', reference_id: 1 });
        const deps = { db: pool, audit };
        const base = { mrId: 'QA001', actor: { id: 'qa', name: 'QA', role: 'dokter' }, accountingDate: date };
        const input = { kind: 'obat', item_id: 7, quantity: 3, reason: 'Synthetic return', payment_method: 'cash', request_key: 'qa-return-request-0001' };
        const create = (i, d = deps) => service.createReturn(d, { ...base, input: i });
        const concurrent = await Promise.all([create(input), create(input)]);
        assert.equal(concurrent[0].id, concurrent[1].id);
        const scalar = async sql => Number(Object.values((await pool.query(sql))[0][0])[0]);
        assert.equal(await scalar('SELECT stock FROM obat WHERE id=2'), 15);
        assert.equal(await scalar('SELECT quantity_remaining FROM obat_batches WHERE id=3'), 5);
        assert.equal(await scalar('SELECT COUNT(*) FROM sunday_clinic_billing_returns'), 1);
        assert.equal(await scalar('SELECT COUNT(*) FROM sunday_clinic_billing_audit_logs'), 1);
        const [[paidInvoice]] = await pool.query('SELECT * FROM sunday_clinic_billings WHERE id=1');
        const [paidItems] = await pool.query('SELECT * FROM sunday_clinic_billing_items WHERE billing_id=1');
        await audit(pool, { billingId: 1, mrId: 'QA001', action: 'billing_marked_paid', actorName: 'QA', afterSnapshot: { billing: paidInvoice, items: paidItems } });
        await pool.query('UPDATE sunday_clinic_billings SET total=200000 WHERE id=1');
        await assert.rejects(create({ ...input, kind: 'money', amount: 100000, request_key: 'qa-mutable-paid-0008' }), /bukti saat pembayaran/);
        await pool.query('UPDATE sunday_clinic_billings SET total=100000 WHERE id=1');
        await assert.rejects(create({ ...input, reason: 'changed' }), /sudah digunakan/);
        await assert.rejects(create({ ...input, quantity: 8, request_key: 'qa-over-quantity-0002' }), /Jumlah retur/);
        await assert.rejects(create({ ...input, kind: 'money', amount: 80000, request_key: 'qa-over-money-0003' }), /melebihi nilai/);
        await assert.rejects(create({ ...input, quantity: 1, request_key: 'qa-rollback-test-0004' }, { db: pool, audit: async () => { throw new Error('audit failed'); } }), /audit failed/);
        assert.equal(await scalar('SELECT stock FROM obat WHERE id=2'), 15);
        assert.equal(await scalar('SELECT COUNT(*) FROM sunday_clinic_billing_returns'), 1);
        await create({ ...input, quantity: 7, request_key: 'qa-return-rest-0005' });
        assert.equal(await scalar('SELECT stock FROM obat WHERE id=2'), 22);
        assert.equal(await scalar('SELECT quantity_remaining FROM obat_batches WHERE id=3'), 10);
        assert.equal(await scalar("SELECT SUM(quantity) FROM stock_movements WHERE movement_type='return'"), 10);
        await insert('sunday_clinic_additional_billings', { id: 2, parent_billing_id: 1, mr_id: 'QA001', patient_id: 'QA0001', sequence_number: 1, reference_number: 'QA001-T01', total: 50000, subtotal: 50000, status: 'paid', accounting_date: '2026-10-24', paid_at: '2026-10-24 12:00:00', paid_by: 'QA' });
        await insert('sunday_clinic_additional_billing_items', { id: 7, additional_billing_id: 2, item_type: 'tindakan', item_name: 'QA service', quantity: 1, price: 50000, total: 50000 });
        await create({ ...input, additional_billing_id: 2, kind: 'money', amount: 20000, request_key: 'qa-additional-cash-0006' });
        await assert.rejects(create({ ...input, additional_billing_id: 99, request_key: 'qa-foreign-source-0007' }), /tidak ditemukan/);
        const view = await service.listReturns(pool, 'QA001');
        assert.equal(view.return_total, 120000);
        assert.equal(view.net_total, 30000);
        assert.equal(view.invoices[0].items[0].remaining_quantity, 0);
        const preview = await closing.getClosingPreview(pool, date);
        assert.equal(preview.summary.grand_total, -120000);
        assert.equal(preview.can_close, true, JSON.stringify(preview.blockers));
        const closed = await closing.createClosing(pool, { date, fingerprint: preview.fingerprint, actor: { userId: 'qa', name: 'QA', role: 'dokter' } });
        assert.equal(closed.summary.grand_total, -120000);
        assert.equal(closed.transactions.length, 3);
        assert.equal((await service.findSavedReturn(pool, 'QA001', input)).already_saved, true);
        await assert.rejects(closing.acquireSundayClinicAccountingDateGuard(pool, { clinicDate: date }), /sudah di-closing/);
        console.log(JSON.stringify({ passed: true, tests: ['actual migration', 'concurrent idempotency', 'FIFO and legacy restock', 'quantity and refund bounds', 'paid evidence validation', 'audit rollback', 'source identity', 'additional invoice cash', 'net totals', 'closing snapshot', 'closed-day readback'], clinicalWrites: 0 }));
    } finally {
        if (pool) await pool.end();
        await admin.query('DROP DATABASE `' + qaName + '`');
        await admin.end();
        console.log('Isolated QA database removed');
    }
})().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
