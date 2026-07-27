const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

describe('priority staff query budgets', () => {
    test('obat sales uses explicit response columns and batches item loading', () => {
        const source = read('staff', 'backend', 'routes', 'obat-sales.js');

        expect(source).toContain('const OBAT_SALE_COLUMNS = [');
        expect(source).toContain('const OBAT_SALE_ITEM_COLUMNS = [');
        expect(source).toContain('WHERE sale_id IN (?)');
        expect(source).toContain('const itemsBySaleId = new Map();');
        expect(source).not.toMatch(/SELECT\s+(?:os\.)?\*/i);
        expect(source).not.toMatch(/SELECT\s+\*\s+FROM\s+obat_sale_items/i);
    });

    test('patient authentication does not hydrate full patient records', () => {
        const source = read('staff', 'backend', 'routes', 'patients-auth.js');

        expect(source).toContain('const PATIENT_AUTH_COLUMNS = [');
        expect(source).toContain('`SELECT ${PATIENT_AUTH_COLUMNS} FROM patients WHERE email = ?`');
        expect(source).not.toMatch(/SELECT\s+\*\s+FROM\s+patients/i);
    });

    test('Sunday Clinic core billing reads preserve the full contract through explicit columns', () => {
        const source = read('staff', 'backend', 'services', 'sunday-clinic', 'billing.js');

        expect(source).toContain('const BILLING_COLUMNS = [');
        expect(source).toContain('const BILLING_ITEM_COLUMNS = [');
        expect(source).toContain('const BILLING_REVISION_COLUMNS = [');
        expect(source).not.toMatch(/SELECT\s+\*\s+FROM\s+sunday_clinic_(?:billings|billing_items|billing_revisions)/i);
    });
});
