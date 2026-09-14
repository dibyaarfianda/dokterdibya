'use strict';

// One-off, explicitly approved correction. Default mode validates then rolls back.
// Run from staff/backend: node scripts/correct-drd1274-clinic-split.js [--apply]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../db');
const audit = require('../services/SundayClinicBillingAuditService');
const closing = require('../services/SundayClinicClosingService');
const r2 = require('../services/r2Storage');
const pdf = require('../utils/pdf-generator');

const APPLY = process.argv.includes('--apply');
const KEY = 'DRD1274-clinic-split-20260914';
const actor = { actorName: 'Codex (koreksi atas persetujuan pengguna)', actorRole: null };
const reason = 'Koreksi disetujui pengguna: IUD 1 Rp250.000 telah dibayar ke klinik; Ondavell 10 Rp160.000 belum dibayar dan ditagihkan terpisah. Tindakan Rp1.005.000 dibayar ke rumah sakit, bukan penerimaan klinik. Tidak ada refund atau perubahan jumlah stok.';

async function main() {
    let guard, c, committed = false;
    try {
        guard = await closing.acquireSundayClinicAccountingDateGuard(db, { mrId: 'DRD1274' });
        assert.equal(guard.clinicDate, '2026-09-13');
        c = await db.getConnection();
        await c.beginTransaction();
        const [[bill]] = await c.query('SELECT * FROM sunday_clinic_billings WHERE id=1026 AND mr_id=? FOR UPDATE', ['DRD1274']);
        assert.ok(bill);
        const [oldAudit] = await c.query('SELECT id FROM sunday_clinic_billing_audit_logs WHERE billing_id=1026 AND action=?', ['clinic_split_correction']);
        if (oldAudit.length) {
            assert.equal(Number(bill.total), 250000);
            await c.rollback();
            console.log(JSON.stringify({ already_applied: true, audit_id: oldAudit[0].id }));
            return;
        }
        assert.equal(bill.status, 'paid');
        assert.equal(Number(bill.total), 1415000);
        assert.equal(Number(bill.pending_changes), 0);
        const [additional] = await c.query('SELECT * FROM sunday_clinic_additional_billings WHERE parent_billing_id=1026 FOR UPDATE');
        assert.equal(additional.length, 0);
        const [payments] = await c.query('SELECT * FROM tagihan_payments WHERE billing_id=1026 FOR UPDATE');
        const [paymentLogs] = await c.query('SELECT * FROM tagihan_payment_logs WHERE billing_id=1026');
        assert.equal(payments.length, 0);
        assert.equal(paymentLogs.length, 0);
        const [revisions] = await c.query("SELECT * FROM sunday_clinic_billing_revisions WHERE mr_id='DRD1274' AND status='pending' FOR UPDATE");
        assert.equal(revisions.length, 0);
        const [items] = await c.query('SELECT * FROM sunday_clinic_billing_items WHERE billing_id=1026 ORDER BY id FOR UPDATE');
        assert.deepEqual(items.map(i => i.id), [6760,6761,6764,6765,6766,6767,6768,6800]);
        const iud = items.find(i => i.id === 6765), onda = items.find(i => i.id === 6800);
        assert.equal(Number(iud.total), 250000); assert.equal(iud.quantity, 1);
        assert.equal(Number(onda.total), 160000); assert.equal(onda.quantity, 10);
        assert.equal(items.filter(i => i.item_type === 'tindakan').reduce((s,i) => s + Number(i.total),0), 1005000);
        const [movements] = await c.query("SELECT * FROM stock_movements WHERE reference_type='sunday_clinic_billing' AND reference_id=1026 ORDER BY id FOR UPDATE");
        assert.deepEqual(movements.map(m => [m.id,m.obat_id,m.quantity,m.movement_type]), [[2886,50,-1,'sale'],[2887,72,-10,'sale']]);
        const [stocks] = await c.query('SELECT id,stock FROM obat WHERE id IN (50,72) ORDER BY id FOR UPDATE');
        const [records] = await c.query("SELECT * FROM sunday_clinic_records WHERE mr_id='DRD1274' FOR UPDATE");
        const before = await audit.getBillingSnapshot(c,1026);
        const previewBefore = await closing.getClosingPreview(c,guard.clinicDate);
        const backupDir = path.join('/root/codex-backups', KEY + '-' + Date.now());
        fs.mkdirSync(backupDir, { recursive:true, mode:0o700 });
        const [audits] = await c.query('SELECT * FROM sunday_clinic_billing_audit_logs WHERE billing_id=1026 ORDER BY id');
        fs.writeFileSync(path.join(backupDir,'before.json'), JSON.stringify({bill,items,movements,stocks,records,audits,payments,paymentLogs,additional},null,2), {mode:0o600});
        const originalDocs = [];
        for (const field of ['invoice_url','etiket_url']) {
            if (!bill[field]) continue;
            const buffer = await r2.getFileBuffer(bill[field]);
            fs.writeFileSync(path.join(backupDir,field+'.pdf'),buffer,{mode:0o600});
            originalDocs.push({key:bill[field],sha256:crypto.createHash('sha256').update(buffer).digest('hex')});
        }
        const correction = {key:KEY,reason,original_total:1415000,clinic_total:410000,clinic_received:250000,clinic_receivable:160000,hospital_excluded:1005000,original_invoice_url:bill.invoice_url,original_etiket_url:bill.etiket_url,backup:backupDir};
        const [insert] = await c.query(`INSERT INTO sunday_clinic_additional_billings
            (parent_billing_id,mr_id,patient_id,sequence_number,reference_number,subtotal,total,status,confirmed_at,confirmed_by,created_by,last_modified_by,last_modified_at,metadata)
            VALUES (1026,'DRD1274',?,1,'DRD1274-T01',160000,160000,'confirmed',NOW(),?,?,?,NOW(),?)`,
            [bill.patient_id,actor.actorName,actor.actorName,actor.actorName,JSON.stringify(correction)]);
        const additionalId = insert.insertId;
        await c.query(`INSERT INTO sunday_clinic_additional_billing_items
            (additional_billing_id,item_type,item_code,item_name,quantity,price,total,item_data)
            VALUES (?,?,?,?,?,?,?,?)`,[additionalId,onda.item_type,onda.item_code,onda.item_name,onda.quantity,onda.price,onda.total,onda.item_data]);
        // Reattribute the existing dispensing record, never deduct or restore stock.
        await c.query("UPDATE stock_movements SET reference_type='sunday_clinic_additional_billing',reference_id=? WHERE id=2887 AND reference_type='sunday_clinic_billing' AND reference_id=1026",[additionalId]);
        await c.query('DELETE FROM sunday_clinic_billing_items WHERE billing_id=1026 AND id<>6765');
        const billingData = typeof bill.billing_data === 'string' ? JSON.parse(bill.billing_data || '{}') : (bill.billing_data || {});
        await c.query(`UPDATE sunday_clinic_billings SET subtotal=250000,total=250000,billing_data=?,
            last_modified_by=?,last_modified_at=NOW(),updated_at=NOW() WHERE id=1026`,
            [JSON.stringify({...billingData,clinic_split_correction:correction}),actor.actorName]);
        let after = await audit.getBillingSnapshot(c,1026);
        let extra = await audit.getAdditionalBillingSnapshot(c,additionalId);
        if (APPLY) {
            const [[patient]] = await c.query('SELECT full_name,birth_date,phone FROM patients WHERE id=?',[bill.patient_id]);
            const patientData = {fullName:patient.full_name,birthDate:patient.birth_date,phone:patient.phone};
            const mainPdf = await pdf.generateInvoice({...after.billing,items:after.items},patientData,{mrId:'DRD1274',status:'paid'});
            const extraPdf = await pdf.generateInvoice({...extra.billing,items:extra.items},patientData,{mrId:'DRD1274',invoiceReference:'DRD1274-T01',status:'confirmed'});
            assert.notEqual(mainPdf.r2Key,bill.invoice_url);
            await c.query('UPDATE sunday_clinic_billings SET invoice_url=?,printed_at=NOW(),printed_by=? WHERE id=1026',[mainPdf.r2Key,actor.actorName]);
            await c.query('UPDATE sunday_clinic_additional_billings SET invoice_url=?,invoice_printed_at=NOW(),invoice_printed_by=? WHERE id=?',[extraPdf.r2Key,actor.actorName,additionalId]);
            fs.writeFileSync(path.join(backupDir,'corrected-invoice.pdf'),await r2.getFileBuffer(mainPdf.r2Key),{mode:0o600});
            fs.writeFileSync(path.join(backupDir,'additional-invoice.pdf'),await r2.getFileBuffer(extraPdf.r2Key),{mode:0o600});
        }
        after = await audit.getBillingSnapshot(c,1026);
        extra = await audit.getAdditionalBillingSnapshot(c,additionalId);
        const [afterMovements] = await c.query('SELECT * FROM stock_movements WHERE id IN (2886,2887) ORDER BY id');
        const mainAuditId = await audit.logBillingAudit(c,{...actor,billingId:1026,mrId:'DRD1274',action:'clinic_split_correction',summary:reason,beforeSnapshot:{...before,stock_movements:movements},afterSnapshot:{...after,stock_movements:afterMovements,additional_invoice:extra.billing.reference_number}});
        await audit.logAdditionalBillingAudit(c,{...actor,additionalBillingId:additionalId,mrId:'DRD1274',action:'additional_billing_created',summary:reason,beforeSnapshot:null,afterSnapshot:{...extra,stock_movement_reassigned_from:movements[1]}});
        const [afterStocks] = await c.query('SELECT id,stock FROM obat WHERE id IN (50,72) ORDER BY id');
        const [afterRecords] = await c.query("SELECT * FROM sunday_clinic_records WHERE mr_id='DRD1274'");
        assert.deepEqual(afterStocks,stocks); assert.deepEqual(afterRecords,records);
        assert.equal(after.items.length,1); assert.equal(after.billing.total,250000); assert.equal(after.billing.status,'paid');
        assert.equal(extra.items.length,1); assert.equal(extra.billing.total,160000); assert.equal(extra.billing.status,'confirmed');
        assert.equal(afterMovements[1].reference_id,additionalId); assert.equal(afterMovements[1].quantity,-10);
        const previewAfter = await closing.getClosingPreview(c,guard.clinicDate);
        assert.equal(previewBefore.summary.grand_total-previewAfter.summary.grand_total,1165000);
        for (const doc of originalDocs) assert.equal(crypto.createHash('sha256').update(await r2.getFileBuffer(doc.key)).digest('hex'),doc.sha256);
        const result = {mode:APPLY?'applied':'dry-run-rolled-back',main:250000,received:250000,receivable:160000,additional_reference:'DRD1274-T01',additional_id:additionalId,audit_id:mainAuditId,stock_unchanged:true,medical_record_unchanged:true,original_documents_unchanged:true,backup:backupDir};
        fs.writeFileSync(path.join(backupDir,'result.json'),JSON.stringify(result,null,2),{mode:0o600});
        if (APPLY) { await c.commit(); committed=true; } else await c.rollback();
        console.log(JSON.stringify(result));
    } catch (error) {
        if(c && !committed) await c.rollback();
        throw error;
    } finally {
        if(c) c.release();
        if(guard) await guard.release();
        await db.end();
    }
}
main().then(()=>process.exit(0)).catch(error=>{ console.error(error.message); process.exit(1); });
