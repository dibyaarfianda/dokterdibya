const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('Sunday Clinic additional billing implementation', () => {
    test('creates isolated additional billing, item, and audit tables', () => {
        const migration = readRepoFile(
            'staff',
            'backend',
            'migrations',
            '20260712_create_sunday_clinic_additional_billings.sql'
        );

        expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS sunday_clinic_additional_billings/i);
        expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS sunday_clinic_additional_billing_items/i);
        expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS sunday_clinic_additional_billing_audit_logs/i);
        expect(migration).toMatch(/sequence_number INT UNSIGNED NOT NULL/i);
        expect(migration).toMatch(/reference_number VARCHAR\(80\) NOT NULL/i);
        expect(migration).toMatch(/status ENUM\('draft', 'confirmed', 'paid'\)/i);
        expect(migration).toMatch(/FOREIGN KEY \(parent_billing_id\) REFERENCES sunday_clinic_billings/i);
    });

    test('only permits a separate bill after the main bill is paid and keeps draft-only editing', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'sunday-clinic', 'billing.js');
        const service = readRepoFile('staff', 'backend', 'services', 'sunday-clinic', 'billing.js');

        expect(route).toContain("router.post('/billing/:mrId/additional'");
        expect(route).toContain("router.put('/billing/:mrId/additional/:additionalBillingId'");
        expect(route).toContain("router.post('/billing/:mrId/additional/:additionalBillingId/confirm'");
        expect(service).toContain("parentBilling.status !== 'paid'");
        expect(service).toContain("additionalBilling.parent_billing_status !== 'paid'");
        expect(service).toContain("additionalBilling.status !== 'draft'");
        expect(service).toContain("additionalBilling.status !== 'confirmed'");
        expect(service).toContain("additionalBilling.status === 'paid'");
    });

    test('validates prices from server-side medicine and approved add-on catalogs', () => {
        const route = readRepoFile('staff', 'backend', 'services', 'sunday-clinic', 'billing.js');
        const shared = readRepoFile('staff', 'backend', 'services', 'sunday-clinic', 'shared.js');

        expect(shared).toContain("const ADDITIONAL_BILLING_ADD_ONS = Object.freeze");
        expect(shared).toContain("S02: { code: 'S02', name: 'Surat Keterangan SpOG', price: 20000 }");
        expect(shared).toContain("S03: { code: 'S03', name: 'Buku Ginekologi', price: 25000 }");
        expect(shared).toContain("S04: { code: 'S04', name: 'Buku Obstetri (Kehamilan)', price: 40000 }");
        const implementation = `${shared}\n${route}`;
        expect(implementation).toContain('WHERE id = ? AND is_active = 1');
        expect(implementation).toContain('const price = Number(obat.price || 0);');
        expect(implementation).toContain('const addOn = ADDITIONAL_BILLING_ADD_ONS[code];');
    });

    test('records immutable audit history and deducts additional medicine stock with its own reference', () => {
        const route = readRepoFile('staff', 'backend', 'services', 'sunday-clinic', 'billing.js');
        const auditService = readRepoFile(
            'staff',
            'backend',
            'services',
            'SundayClinicBillingAuditService.js'
        );

        expect(route).toContain('getAdditionalBillingSnapshot');
        expect(route).toContain('writeAdditionalBillingAudit');
        expect(route).toContain("action: 'additional_billing_created'");
        expect(route).toContain("action: 'additional_billing_updated'");
        expect(route).toContain("action: 'additional_billing_confirmed'");
        expect(route).toContain("action: 'additional_billing_marked_paid'");
        expect(route).toContain("'sunday_clinic_additional_billing'");
        expect(route).toContain('InventoryService.deductStockFIFO(');
        expect(auditService).toContain('async function getAdditionalBillingSnapshot');
        expect(auditService).toContain('async function logAdditionalBillingAudit');
    });

    test('normalizes legacy medicine collations before resolving additional billing items', () => {
        const service = readRepoFile('staff', 'backend', 'services', 'sunday-clinic', 'billing.js');

        expect(service).toContain(
            'o.code COLLATE utf8mb4_unicode_ci = abi.item_code COLLATE utf8mb4_unicode_ci'
        );
        expect(service).toContain(
            'LOWER(TRIM(o.name)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(abi.item_name)) COLLATE utf8mb4_unicode_ci'
        );
    });

    test('renders the staff panel, manual payment flow, and unique document references', () => {
        const billingJs = readRepoFile(
            'staff',
            'public',
            'scripts',
            'sunday-clinic',
            'components',
            'shared',
            'billing.js'
        );
        const pdfGenerator = readRepoFile('staff', 'backend', 'utils', 'pdf-generator.js');
        const adminHtml = readRepoFile('staff', 'public', 'index-adminlte.html');

        expect(billingJs).toContain('Buat Tagihan Tambahan');
        expect(billingJs).toContain('/api/obat?active=true');
        expect(billingJs).toContain('additional-billing-payment-method');
        expect(billingJs).toContain("value=\"transfer\"");
        expect(billingJs).toContain('print-etiket');
        expect(billingJs).toContain('renderAdditionalBillingPanel');
        expect(pdfGenerator).toContain('const invoiceReference = recordData.invoiceReference || recordData.mrId;');
        expect(pdfGenerator).toContain("item.item_type === 'tindakan' || item.item_type === 'konsultasi' || item.item_type === 'admin'");
        expect(pdfGenerator).toContain('recordData.invoiceReference || recordData.mrId');
        expect(adminHtml).toMatch(/window\.STAFF_CACHE_VERSION = 'v\d+';/);
    });
});
