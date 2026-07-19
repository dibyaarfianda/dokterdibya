const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('Sunday Clinic billing audit implementation', () => {
    test('creates an immutable billing audit migration', () => {
        const migration = readRepoFile(
            'staff',
            'backend',
            'migrations',
            '20260613_create_sunday_clinic_billing_audit_logs.sql'
        );

        expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS sunday_clinic_billing_audit_logs/i);
        expect(migration).toMatch(/action\s+VARCHAR\(50\)\s+NOT NULL/i);
        expect(migration).toMatch(/before_snapshot\s+JSON\s+NULL/i);
        expect(migration).toMatch(/after_snapshot\s+JSON\s+NULL/i);
        expect(migration).toMatch(/created_at\s+TIMESTAMP\s+DEFAULT CURRENT_TIMESTAMP/i);
    });

    test('billing UI removes revision request and allows staff edits on confirmed bills', () => {
        const billingJs = readRepoFile(
            'staff',
            'public',
            'scripts',
            'sunday-clinic',
            'components',
            'shared',
            'billing.js'
        );

        expect(billingJs).not.toContain('btn-request-revision');
        expect(billingJs).not.toContain('/request-revision');
        expect(billingJs).not.toContain('Tagihan sudah dikonfirmasi, tidak dapat diubah.');
        expect(billingJs).toContain('Tagihan sudah dikonfirmasi. Perubahan akan dicatat di riwayat.');
        expect(billingJs).toContain('btn-billing-audit-history');
    });

    test('billing UI uses current Sunday Clinic book item labels and prices', () => {
        const billingJs = readRepoFile(
            'staff',
            'public',
            'scripts',
            'sunday-clinic',
            'components',
            'shared',
            'billing.js'
        );
        const sundayClinicMain = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic', 'main.js');

        expect(billingJs).toContain("{ code: 'S03', name: 'Buku Ginekologi', price: 25000 }");
        expect(billingJs).toContain("{ code: 'S04', name: 'Buku Obstetri (Kehamilan)', price: 40000 }");
        expect(billingJs).not.toContain('Buku Kontrol');
        expect(billingJs).not.toContain('Buku Panduan Lengkap & ANC');
        expect(sundayClinicMain).toContain("const COMPONENT_VERSION = '3.0.15';");
    });

    test('desktop billing layout uses scoped semantic cards, metadata, and actions', () => {
        const billingJs = readRepoFile(
            'staff',
            'public',
            'scripts',
            'sunday-clinic',
            'components',
            'shared',
            'billing.js'
        );
        const billingCss = readRepoFile('staff', 'public', 'styles', 'sunday-clinic.css');

        expect(billingJs).toContain('sc-billing-admin-grid');
        expect(billingJs).toContain('sc-billing-admin-option');
        expect(billingJs).toContain('sc-billing-table-wrap');
        expect(billingJs).toContain('sc-billing-meta sc-billing-meta-confirmed');
        expect(billingJs).toContain('sc-billing-actions');
        expect(billingJs).toContain('sc-billing-printed-state');
        expect(billingCss).toContain('@media (min-width: 992px)');
        expect(billingCss).toContain('body.sunday-clinic-embedded-active .sc-billing-actions');
        expect(billingCss).toContain('body.sunday-clinic-embedded-active .sc-billing-admin-option');
    });

    test('Sunday Clinic route writes billing audit logs on key mutations', () => {
        const route = readRepoFile('staff', 'backend', 'services', 'sunday-clinic', 'billing.js');
        const router = readRepoFile('staff', 'backend', 'routes', 'sunday-clinic', 'billing.js');
        const shared = readRepoFile('staff', 'backend', 'services', 'sunday-clinic', 'shared.js');

        expect(shared).toContain("require('../SundayClinicBillingAuditService')");
        expect(route).toContain("action: 'billing_confirmed'");
        expect(route).toContain("action: 'billing_marked_paid'");
        expect(router).toContain("router.get('/billing/:mrId/audit'");
    });

    test('billing save preserves confirmed status when the UI omits status', () => {
        const route = readRepoFile('staff', 'backend', 'services', 'sunday-clinic', 'billing.js');

        expect(route).toContain('const hasRequestedStatus = Object.prototype.hasOwnProperty.call(req.body,');
        expect(route).toContain('statusToPersist = hasRequestedStatus ? requestedStatus : existingBilling.status;');
        expect(route).toContain('[normalizedMrId, recordRow.patient_id, statusToPersist, JSON.stringify(billingData)]');
        expect(route).toContain('[subtotal, total, statusToPersist, JSON.stringify(billingData), actorName, billingId]');
    });
});
