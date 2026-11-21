const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert/strict');
// Bayar di muka, Tahap 2 + 3 — explicit opt-in integration check. Copies schemas only, writes
// synthetic data exclusively to a unique codex_prepay_qa_* database, then drops that database.
// Proves on real MySQL: mark-paid takes live saldo (never sandbox) in its own transaction,
// a changed saldo is refused before any stock movement, closing shows the saldo split,
// a retur goes back to saldo, and a saldo refund is recorded once.
// Tahap 3: the legacy mapping is copied into packages, a package with tindakan + obat is priced and
// can be re-saved, a paid order credits the category frozen in its snapshot, a pending withdrawal
// request holds its amount (mark-paid takes only live - hold) and staff completion refunds it once.
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
    'patients', 'sunday_appointments', 'tagihan_payments', 'sunday_clinic_billing_returns', 'patient_credit_ledger', 'permissions',
    'tindakan', 'settings', 'payment_orders'];

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
        await pool.query(fs.readFileSync(path.join(root, 'migrations/20261122_checkup_prepay_packages.sql'), 'utf8'));
        // Twice: the processing-status migration must be safe to run again.
        await pool.query(fs.readFileSync(path.join(root, 'migrations/20261122_refund_request_processing.sql'), 'utf8'));
        await pool.query(fs.readFileSync(path.join(root, 'migrations/20261122_refund_request_processing.sql'), 'utf8'));
        require.cache[req.resolve('./db')] = { exports: pool };
        const billing = req('./services/sunday-clinic/billing');
        const returns = req('./services/sunday-clinic/billing-returns');
        const closing = req('./services/SundayClinicClosingService');
        const ledger = req('./services/PatientCreditLedger');
        const staffPrepay = req('./services/StaffPrepayService');
        const packageRepository = req('./services/PrepayPackageRepository');
        const { createCheckupEstimateService, SETTINGS_KEY } = req('./services/CheckupEstimateService');
        const { createPatientRefundRequestService } = req('./services/PatientRefundRequestService');
        const { migrate: migratePackages } = req('./scripts/migrate-prepay-packages');
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

        // ---- Tahap 3 ----
        const quiet = () => {};
        const estimates = createCheckupEstimateService({ db: pool });

        // 8. The live-like legacy mapping becomes four packages with the same codes and prices.
        const priceOf = { 1: 25000, 6: 130000, 8: 215000, 9: 240000, 10: 100000 };
        for (const [id, price] of Object.entries(priceOf)) {
            await insert('tindakan', { id: Number(id), code: `QAT${id}`, name: id === '1' ? 'Biaya Admin' : `Layanan QA ${id}`, category: 'LAYANAN', price, is_active: 1 });
        }
        await insert('obat', { id: 5, code: 'QAOBAT5', name: 'Obat Paket QA', price: 15000, unit: 'tablet', stock: 50, is_active: 1 });
        const legacy = {
            version: 1,
            updated_at: null,
            categories: {
                obstetri: { items: [{ tindakan_id: 6, quantity: 1 }] },
                obstetri_usg4d: { items: [{ tindakan_id: 9, quantity: 1 }] },
                gyn_repro: { items: [{ tindakan_id: 8, quantity: 1 }] },
                gyn_special: { items: [{ tindakan_id: 8, quantity: 1 }] }
            }
        };
        await insert('settings', { setting_key: SETTINGS_KEY, setting_value: JSON.stringify(legacy) });
        const copied = await migratePackages(pool, { apply: true, log: quiet });
        assert.deepEqual(copied.created, ['obstetri', 'obstetri_usg4d', 'gyn_repro', 'gyn_special']);
        assert.deepEqual((await migratePackages(pool, { apply: true, log: quiet })).created, []);
        const expectedAmount = { obstetri: 25000 + 130000, obstetri_usg4d: 25000 + 240000, gyn_repro: 25000 + 215000, gyn_special: 25000 + 215000 };
        const staffView = await estimates.priceAllForStaff();
        assert.equal(staffView.packages.length, 4);
        for (const priced of staffView.packages) {
            assert.equal(priced.ready, true, JSON.stringify(priced.issues));
            assert.equal(priced.amount_idr, expectedAmount[priced.code], priced.code);
        }

        // 9. A new package with one tindakan and one obat prices as admin + tindakan + obat x qty.
        const saveInTransaction = async input => {
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();
                const saved = await packageRepository.savePackage(connection, input, { id: 'qa', name: 'QA Dokter' });
                await connection.commit();
                return saved;
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        };
        const created = await saveInTransaction({
            name: 'Paket QA Baru', description: null, category: 'gyn_repro', week_min: null, week_max: null, is_active: true, sort_order: 50,
            items: [{ item_type: 'tindakan', ref_id: 10, quantity: 1, sort_order: 0 }, { item_type: 'obat', ref_id: 5, quantity: 2, sort_order: 1 }]
        });
        assert.equal(created.code, `pkg_${created.id}`);
        const pricedNew = await estimates.pricePackageByCode(created.code);
        assert.equal(pricedNew.ready, true, JSON.stringify(pricedNew.issues));
        const newPackageAmount = 25000 + 100000 + 2 * 15000;
        assert.equal(pricedNew.amount_idr, newPackageAmount);

        // 10. Saving it again with nothing changed succeeds (no "Paket tidak ditemukan") and keeps the items.
        const loaded = await packageRepository.getPackageByCode(pool, created.code);
        const resaved = await saveInTransaction({ ...loaded });
        assert.equal(resaved.id, created.id);
        assert.equal(resaved.code, created.code);
        assert.equal((await estimates.pricePackageByCode(created.code)).amount_idr, newPackageAmount);
        assert.equal(await scalar('SELECT COUNT(*) FROM checkup_prepay_package_items WHERE package_id = ?', [created.id]), 2);

        // 11. A paid order credits the category frozen in its snapshot, even after the package is deactivated.
        await insert('patients', { id: 'QA0005', full_name: 'Synthetic QA 5' });
        const snapshot = { package_code: created.code, package_name: 'Paket QA Baru', category: 'gyn_repro', items: pricedNew.items, amount_idr: newPackageAmount, priced_at: new Date().toISOString() };
        await insert('payment_orders', { id: 950, order_ref: 'QA-ORDER-950', patient_id: 'QA0005', product_code: created.code, amount_idr: newPackageAmount, gateway_mode: 'live', item_snapshot: JSON.stringify(snapshot) });
        assert.equal(await packageRepository.setPackageActive(pool, created.id, false, { id: 'qa' }), true);
        const [[order]] = await pool.query('SELECT * FROM payment_orders WHERE id = 950');
        const orderConnection = await pool.getConnection();
        try {
            await orderConnection.beginTransaction();
            const credited = await ledger.creditFromPaidOrder(orderConnection, order);
            await orderConnection.commit();
            assert.equal(credited.category, 'gyn_repro');
            assert.equal(credited.credit_idr, newPackageAmount);
        } finally {
            orderConnection.release();
        }
        assert.equal(await scalar("SELECT SUM(amount_idr) FROM patient_credit_ledger WHERE patient_id = 'QA0005' AND category = 'gyn_repro' AND entry_type = 'prepay' AND source_id = '950'"), newPackageAmount);

        // 12. A pending withdrawal holds its amount: mark-paid of a 365000 bill takes only live - hold.
        await insert('patients', { id: 'QA0004', full_name: 'Synthetic QA 4' });
        await insert('sunday_clinic_records', { id: 4, mr_id: 'QA004', patient_id: 'QA0004', visit_location: 'klinik_private', mr_category: 'obstetri', status: 'draft', created_at: `${date} 09:30:00` });
        await insert('sunday_clinic_billings', { id: 4, mr_id: 'QA004', patient_id: 'QA0004', subtotal: 365000, total: 365000, status: 'confirmed', accounting_date: date, pending_changes: 0 });
        await insert('sunday_clinic_billing_items', { id: 41, billing_id: 4, item_type: 'tindakan', item_code: 'T40', item_name: 'Layanan QA', quantity: 1, price: 365000, total: 365000 });
        await insert('patient_credit_ledger', { patient_id: 'QA0004', category: 'obstetri', entry_type: 'prepay', amount_idr: 255000, gateway_mode: 'live', source_type: 'payment_order', source_id: '904' });
        const refundRequests = createPatientRefundRequestService({
            db: pool,
            staffPrepay,
            realtime: { broadcast: quiet },
            logger: { info: quiet, warn: quiet, error: quiet },
            activityLogger: { log: async () => {} }
        });
        const requested = await refundRequests.createRequest({
            patient: { id: 'QA0004', name: 'Synthetic QA 4' }, amountIdr: 200000, bankName: 'BCA',
            accountNumber: '1234567890', accountHolder: 'Synthetic QA 4', requestKey: 'qa-refund-request-0001'
        });
        assert.equal(requested.status, 'pending');
        assert.equal(await ledger.getPendingRefundHold(pool, 'QA0004'), 200000);
        const paid4 = await markPaid('QA004', { expected_prepay_idr: 55000 });
        assert.equal(paid4.statusCode, 200, JSON.stringify(paid4.body));
        assert.deepEqual(paid4.body.prepay, { deduct_idr: 55000, remaining_due_idr: 310000 });
        assert.equal(await liveBalance('QA0004'), 200000);
        assert.equal(await ledger.getPendingRefundHold(pool, 'QA0004'), 200000);

        // 13. Staff "Sudah ditransfer" records exactly one refund and releases the hold; a repeat changes nothing.
        const actor = { id: 'qa', name: 'QA Dokter' };
        const done = await refundRequests.completeRequest({ id: requested.id, actor });
        assert.equal(done.status, 'done');
        assert.equal(await scalar("SELECT COUNT(*) FROM patient_credit_refunds WHERE patient_id = 'QA0004'"), 1);
        assert.equal(await scalar("SELECT amount_idr FROM patient_credit_refunds WHERE patient_id = 'QA0004'"), 200000);
        assert.equal(await ledger.getPendingRefundHold(pool, 'QA0004'), 0);
        assert.equal(await liveBalance('QA0004'), 0);
        const repeat = await refundRequests.completeRequest({ id: requested.id, actor });
        assert.equal(repeat.refund_id, done.refund_id);
        assert.equal(await scalar("SELECT COUNT(*) FROM patient_credit_refunds WHERE patient_id = 'QA0004'"), 1);
        assert.equal(await scalar("SELECT COUNT(*) FROM patient_credit_ledger WHERE patient_id = 'QA0004' AND entry_type = 'refund'"), 1);

        // 14. "Mulai transfer": the patient can no longer cancel, the hold stays (mark-paid still
        // takes only live - hold), a second start is refused, then "Sudah ditransfer" refunds once.
        await insert('patient_credit_ledger', { patient_id: 'QA0004', category: 'obstetri', entry_type: 'prepay', amount_idr: 150000, gateway_mode: 'live', source_type: 'payment_order', source_id: '905' });
        const second = await refundRequests.createRequest({
            patient: { id: 'QA0004', name: 'Synthetic QA 4' }, amountIdr: 100000, bankName: 'BNI',
            accountNumber: '9876543210', accountHolder: 'Synthetic QA 4', requestKey: 'qa-refund-request-0002'
        });
        const started = await refundRequests.startRequest({ id: second.id, actor });
        assert.equal(started.status, 'processing');
        assert.equal(started.processing_by, 'QA Dokter');
        assert.ok(started.processing_at, 'processing_at is set');
        const [[startedRow]] = await pool.query('SELECT status, processing_by FROM patient_credit_refund_requests WHERE id = ?', [second.id]);
        assert.deepEqual({ ...startedRow }, { status: 'processing', processing_by: 'QA Dokter' });
        await assert.rejects(refundRequests.cancelRequest({ patientId: 'QA0004', id: second.id }), error => error.status === 409 && error.code === 'REQUEST_PROCESSING');
        await assert.rejects(refundRequests.startRequest({ id: second.id, actor: { id: 'qa2', name: 'QA Kasir' } }), error => error.statusCode === 409 && /oleh QA Dokter\.$/.test(error.message));
        assert.equal(await ledger.getPendingRefundHold(pool, 'QA0004'), 100000);
        await insert('sunday_clinic_records', { id: 5, mr_id: 'QA005', patient_id: 'QA0004', visit_location: 'klinik_private', mr_category: 'obstetri', status: 'draft', created_at: `${date} 10:30:00` });
        await insert('sunday_clinic_billings', { id: 5, mr_id: 'QA005', patient_id: 'QA0004', subtotal: 120000, total: 120000, status: 'confirmed', accounting_date: date, pending_changes: 0 });
        await insert('sunday_clinic_billing_items', { id: 51, billing_id: 5, item_type: 'tindakan', item_code: 'T40', item_name: 'Layanan QA', quantity: 1, price: 120000, total: 120000 });
        const paid5 = await markPaid('QA005', { expected_prepay_idr: 50000 });
        assert.equal(paid5.statusCode, 200, JSON.stringify(paid5.body));
        assert.deepEqual(paid5.body.prepay, { deduct_idr: 50000, remaining_due_idr: 70000 });
        assert.equal(await liveBalance('QA0004'), 100000);
        const transferred = await refundRequests.completeRequest({ id: second.id, actor });
        assert.equal(transferred.status, 'done');
        assert.equal(await scalar("SELECT COUNT(*) FROM patient_credit_refunds WHERE patient_id = 'QA0004'"), 2);
        assert.equal(await ledger.getPendingRefundHold(pool, 'QA0004'), 0);
        assert.equal(await liveBalance('QA0004'), 0);

        console.log(JSON.stringify({
            passed: true,
            tests: ['live saldo on mark-paid', 'sandbox never pays', '409 before stock', 'closing saldo split', 'retur back to saldo', 'refund once', 'deletion guard',
                'legacy mapping to packages', 'new package pricing', 'unchanged re-save', 'order credits snapshot category', 'withdrawal hold caps mark-paid', 'complete request refunds once',
                'processing blocks cancel and keeps the hold'],
            clinicalWrites: 0
        }));
    } finally {
        if (pool) await pool.end();
        await admin.query('DROP DATABASE IF EXISTS `' + qaName + '`');
        await admin.end();
        console.log('Isolated QA database removed: ' + qaName);
    }
})().then(() => process.exit(0)).catch(error => { console.error(error.stack || error.message); process.exit(1); });
