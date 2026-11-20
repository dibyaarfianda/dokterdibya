const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert/strict');
// Bayar di muka, Tahap 2 — explicit opt-in integration check. Copies schemas only, writes
// synthetic data exclusively to a unique codex_prepay_qa_* database, then drops that database.
// Proves on real MySQL: mark-paid takes live saldo (never sandbox) in its own transaction,
// a changed saldo is refused before any stock movement, closing shows the saldo split,
// a retur goes back to saldo, and a saldo refund is recorded once.
// The billing services load the auth middleware, which exits the process without a JWT secret
// (that would skip the DROP below). This script never signs or checks a token.
process.env.JWT_SECRET ||= 'codex-prepay-qa-only';
const root = path.resolve(__dirname, '..');
const req = Module.createRequire(root + '/package.json');
const mysql = req('mysql2/promise');
const qaName = 'codex_prepay_qa_' + Date.now();
if (!/^codex_prepay_qa_\d+$/.test(qaName)) throw new Error('Unsafe QA database name');
const tables = ['sunday_clinic_billings', 'sunday_clinic_records', 'sunday_clinic_billing_items', 'sunday_clinic_additional_billings',
    'sunday_clinic_additional_billing_items', 'sunday_clinic_billing_audit_logs', 'sunday_clinic_additional_billing_audit_logs', 'obat',
    'obat_batches', 'stock_movements', 'sunday_clinic_closings', 'sunday_clinic_closing_entries', 'sunday_clinic_billing_revisions',
    'patients', 'sunday_appointments', 'tagihan_payments', 'sunday_clinic_billing_returns', 'patient_credit_ledger', 'permissions'];

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

(async () => {
    const admin = await mysql.createConnection({ user: 'root', socketPath: '/run/mysqld/mysqld.sock', multipleStatements: true });
    let pool;
    try {
        await admin.query('CREATE DATABASE `' + qaName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        for (const table of tables) await admin.query(`CREATE TABLE \`${qaName}\`.\`${table}\` LIKE dibyaklinik.\`${table}\``);
        pool = mysql.createPool({ user: 'root', socketPath: '/run/mysqld/mysqld.sock', database: qaName, connectionLimit: 6, multipleStatements: true });
        await pool.query(fs.readFileSync(path.join(root, 'migrations/20261121_checkup_prepay_tahap2.sql'), 'utf8'));
        require.cache[req.resolve('./db')] = { exports: pool };
        const billing = req('./services/sunday-clinic/billing');
        const returns = req('./services/sunday-clinic/billing-returns');
        const closing = req('./services/SundayClinicClosingService');
        const ledger = req('./services/PatientCreditLedger');
        const staffPrepay = req('./services/StaffPrepayService');
        const audit = req('./services/SundayClinicBillingAuditService').logBillingAudit;
        const date = req('./utils/date').formatDateLocal();

        async function insert(table, values) {
            const [columns] = await pool.query('SHOW COLUMNS FROM `' + table + '`');
            const row = { ...values };
            for (const c of columns) {
                if (row[c.Field] !== undefined || c.Null === 'YES' || c.Default !== null || c.Extra.includes('auto_increment')) continue;
                if (c.Type.startsWith('enum(')) row[c.Field] = c.Type.match(/'([^']+)'/)[1];
                else if (/int|decimal|float|double/.test(c.Type)) row[c.Field] = 0;
                else if (/date|timestamp/.test(c.Type)) row[c.Field] = date;
                else row[c.Field] = c.Type === 'json' ? '{}' : 'QA';
            }
            await pool.query('INSERT INTO `' + table + '` SET ?', row);
        }
        const scalar = async (sql, params = []) => Number(Object.values((await pool.query(sql, params))[0][0] || { v: 0 })[0] || 0);
        const liveBalance = async patientId => (await ledger.getLiveBalances(pool, patientId)).reduce((sum, entry) => sum + entry.balance_idr, 0);
        const markPaid = async (mrId, body) => {
            const res = response();
            let failure = null;
            await billing.postBillingByMrIdMarkPaid({ params: { mrId }, body, user: { id: 'qa', new_id: 'qa', name: 'QA Kasir' } }, res, error => { failure = error; });
            if (failure) throw failure;
            return res;
        };

        // Three Klinik Privat visits today, each with a confirmed bill.
        for (const [n, patient, category] of [[1, 'QA0001', 'obstetri'], [2, 'QA0002', 'obstetri'], [3, 'QA0003', 'gyn_repro']]) {
            await insert('patients', { id: patient, full_name: `Synthetic QA ${n}` });
            await insert('sunday_clinic_records', { id: n, mr_id: `QA00${n}`, patient_id: patient, visit_location: 'klinik_private', mr_category: category, status: 'draft', created_at: `${date} 09:00:00` });
        }
        await insert('sunday_clinic_billings', { id: 1, mr_id: 'QA001', patient_id: 'QA0001', subtotal: 365000, total: 365000, status: 'confirmed', accounting_date: date, pending_changes: 0 });
        await insert('sunday_clinic_billing_items', { id: 11, billing_id: 1, item_type: 'tindakan', item_code: 'T40', item_name: 'Konsultasi', quantity: 1, price: 150000, total: 150000 });
        await insert('sunday_clinic_billing_items', { id: 12, billing_id: 1, item_type: 'tindakan', item_code: 'T09', item_name: 'USG 4D', quantity: 1, price: 190000, total: 190000 });
        await insert('sunday_clinic_billing_items', { id: 13, billing_id: 1, item_type: 'admin', item_code: 'S01', item_name: 'Biaya Admin', quantity: 1, price: 25000, total: 25000 });
        await insert('sunday_clinic_billings', { id: 2, mr_id: 'QA002', patient_id: 'QA0002', subtotal: 100000, total: 100000, status: 'confirmed', accounting_date: date, pending_changes: 0 });
        await insert('sunday_clinic_billing_items', { id: 21, billing_id: 2, item_type: 'tindakan', item_code: 'T40', item_name: 'Konsultasi', quantity: 1, price: 100000, total: 100000 });
        await insert('sunday_clinic_billings', { id: 3, mr_id: 'QA003', patient_id: 'QA0003', subtotal: 100000, total: 100000, status: 'confirmed', accounting_date: date, pending_changes: 0 });
        await insert('sunday_clinic_billing_items', { id: 31, billing_id: 3, item_type: 'obat', item_code: 'QAOBAT', item_name: 'Obat QA', quantity: 2, price: 50000, total: 100000, item_data: JSON.stringify({ obatId: 2 }) });
        await insert('obat', { id: 2, code: 'QAOBAT', name: 'Obat QA', stock: 10, is_active: 1 });
        await insert('obat_batches', { id: 3, obat_id: 2, cost_price: 20000, quantity_purchased: 10, quantity_remaining: 10, purchase_date: date });

        // Saldo: QA0001 live, QA0002 sandbox only, QA0003 live.
        await insert('patient_credit_ledger', { patient_id: 'QA0001', category: 'obstetri', entry_type: 'prepay', amount_idr: 255000, gateway_mode: 'live', source_type: 'payment_order', source_id: '901' });
        await insert('patient_credit_ledger', { patient_id: 'QA0002', category: 'obstetri', entry_type: 'prepay', amount_idr: 255000, gateway_mode: 'sandbox', source_type: 'payment_order', source_id: '902' });
        await insert('patient_credit_ledger', { patient_id: 'QA0003', category: 'gyn_repro', entry_type: 'prepay', amount_idr: 100000, gateway_mode: 'live', source_type: 'payment_order', source_id: '903' });

        // 1. Live saldo pays part of bill 1 inside the paid transaction.
        const paid1 = await markPaid('QA001', { expected_prepay_idr: 255000 });
        assert.equal(paid1.statusCode, 200, JSON.stringify(paid1.body));
        assert.deepEqual(paid1.body.prepay, { deduct_idr: 255000, remaining_due_idr: 110000 });
        assert.equal(await scalar("SELECT status = 'paid' FROM sunday_clinic_billings WHERE id = 1"), 1);
        assert.equal(await scalar("SELECT SUM(amount_idr) FROM patient_credit_ledger WHERE entry_type = 'usage' AND source_id = '1:obstetri'"), -255000);
        assert.equal(await liveBalance('QA0001'), 0);

        // 2. Sandbox saldo never pays a real bill.
        const paid2 = await markPaid('QA002', {});
        assert.equal(paid2.statusCode, 200, JSON.stringify(paid2.body));
        assert.equal(paid2.body.prepay.deduct_idr, 0);
        assert.equal(await scalar("SELECT COUNT(*) FROM patient_credit_ledger WHERE source_type = 'sunday_clinic_billing' AND source_id LIKE '2:%'"), 0);

        // 3. A saldo the cashier did not see is refused before any stock leaves.
        const refused = await markPaid('QA003', { expected_prepay_idr: 50000 });
        assert.equal(refused.statusCode, 409);
        assert.equal(refused.body.message, 'Saldo pasien berubah. Muat ulang tagihan.');
        assert.equal(await scalar("SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'sunday_clinic_billing' AND reference_id = 3"), 0);
        assert.equal(await scalar('SELECT stock FROM obat WHERE id = 2'), 10);
        assert.equal(await scalar("SELECT status = 'confirmed' FROM sunday_clinic_billings WHERE id = 3"), 1);
        assert.equal(await liveBalance('QA0003'), 100000);

        // 4. Closing shows the saldo part and the cash that should be in the drawer.
        const preview = await closing.getClosingPreview(pool, date);
        assert.equal(preview.summary.grand_total, 465000);
        assert.equal(preview.summary.saldo_paid_total, 255000);
        assert.equal(preview.summary.cash_expected_total, 210000);

        // 5. A retur on bill 1 goes back to saldo (no method asked).
        const back = await returns.createReturn({ db: pool, audit }, {
            mrId: 'QA001', accountingDate: date, actor: { id: 'qa', name: 'QA Kasir', role: 'dokter' },
            input: { kind: 'money', amount: 20000, reason: 'Synthetic retur ke saldo', request_key: 'qa-prepay-return-0001' }
        });
        assert.equal(back.saldo_amount, 20000);
        assert.equal(back.cash_amount, 0);
        assert.equal(await scalar("SELECT payment_method = 'saldo' FROM sunday_clinic_billing_returns WHERE id = ?", [back.id]), 1);
        assert.equal(await liveBalance('QA0001'), 20000);
        const afterReturn = await closing.getClosingPreview(pool, date);
        assert.equal(afterReturn.summary.saldo_returned_total, 20000);
        assert.equal(afterReturn.summary.cash_expected_total, 210000);

        // 6. A saldo refund is recorded once, even when retried.
        const refund = { patientId: 'QA0001', amountIdr: 20000, method: 'tunai', reason: 'Synthetic refund', requestKey: 'qa-prepay-refund-0001', actor: { id: 'qa', name: 'QA Dokter' } };
        const first = await staffPrepay.createRefund(refund, { db: pool });
        assert.equal(first.already_saved, false);
        const again = await staffPrepay.createRefund(refund, { db: pool });
        assert.equal(again.already_saved, true);
        assert.equal(await liveBalance('QA0001'), 0);
        await assert.rejects(staffPrepay.createRefund({ ...refund, requestKey: 'qa-prepay-refund-0002' }, { db: pool }), /melebihi saldo/);

        // 7. Money history cannot be deleted with the record or the patient.
        await assert.rejects(ledger.assertNoPrepaySaldoEvidence(pool, { mrId: 'QA001' }), /dibayar dengan saldo/);
        await assert.rejects(ledger.assertNoPrepaySaldoEvidence(pool, { patientId: 'QA0001' }), /dibayar dengan saldo/);

        console.log(JSON.stringify({ passed: true, tests: ['live saldo on mark-paid', 'sandbox never pays', '409 before stock', 'closing saldo split', 'retur back to saldo', 'refund once', 'deletion guard'], clinicalWrites: 0 }));
    } finally {
        if (pool) await pool.end();
        await admin.query('DROP DATABASE IF EXISTS `' + qaName + '`');
        await admin.end();
        console.log('Isolated QA database removed: ' + qaName);
    }
})().then(() => process.exit(0)).catch(error => { console.error(error.stack || error.message); process.exit(1); });
