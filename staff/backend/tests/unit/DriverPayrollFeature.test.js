const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function read(...parts) {
    return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

describe('doctor-only private driver payroll feature', () => {
    test('places Gajian under a doctor-only Private sidebar menu', () => {
        const html = read('staff', 'public', 'index-adminlte.html');

        expect(html).toContain('id="nav-private"');
        expect(html).toMatch(/id="nav-private"[^>]*doctor-role-only/);
        expect(html).toMatch(/<p>Private\s*<i class="right fas fa-angle-left"><\/i><\/p>/);
        expect(html).toMatch(/id="nav-private"[\s\S]*nav-treeview[\s\S]*id="nav-staff-payroll"/);
    });

    test('exposes driver name, month, and absence-day inputs for driver payroll', () => {
        const fragment = read('staff', 'public', 'fragments', 'pages', 'content-staff-payroll.html');

        expect(fragment).toContain('id="driver-payroll-name"');
        expect(fragment).toContain('id="driver-payroll-month"');
        expect(fragment).toContain('id="driver-payroll-absence-days"');
        expect(fragment).toContain('id="driver-payroll-working-days"');
        expect(fragment).toContain('id="driver-payroll-daily-deduction"');
        expect(fragment).toContain('id="driver-payroll-total"');
    });

    test('protects driver payroll APIs with literal doctor role and persists monthly records', () => {
        const route = read('staff', 'backend', 'routes', 'staff-payroll.js');
        const migration = read('staff', 'backend', 'migrations', '20260812_create_staff_driver_payrolls.sql');
        const nameMigration = read('staff', 'backend', 'migrations', '20260813_add_driver_name_to_payroll.sql');

        expect(route).toContain("requireDoctorRole");
        expect(route).not.toContain('requireSuperadmin');
        expect(route).toMatch(/router\.get\('\/driver-payrolls',[\s\S]{0,120}requireDoctorRole/);
        expect(route).toMatch(/router\.put\('\/driver-payrolls\/:month',[\s\S]{0,120}requireDoctorRole/);
        expect(route).toMatch(/router\.post\('\/driver-payrolls\/:month\/finalize',[\s\S]{0,120}requireDoctorRole/);
        expect(migration).toContain('CREATE TABLE IF NOT EXISTS staff_driver_payrolls');
        expect(migration).toContain('driver_name VARCHAR(120)');
        expect(migration).toContain('UNIQUE KEY uniq_staff_driver_payroll_month');
        expect(nameMigration).toContain('ADD COLUMN IF NOT EXISTS driver_name VARCHAR(120)');
        expect(route).toContain("router.patch('/driver-payrolls/:month/name'");
        expect(route).toContain('normalizeDriverName');
    });

    test('includes finalized driver payroll in private-clinic finance analysis', () => {
        const analytics = read('staff', 'backend', 'routes', 'analytics.js');
        const financePage = read('staff', 'public', 'scripts', 'pages', 'finance-analysis-page.js');

        expect(analytics).toContain('FROM staff_driver_payrolls');
        expect(analytics).toContain('totalGajiSupir');
        expect(financePage).toContain('totalGajiSupir');
    });

    test('offers finalized driver and Sunday Clinic payroll slip printing', () => {
        const payrollScript = read('staff', 'public', 'scripts', 'staff-payroll.js');
        const featureLoader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');

        expect(featureLoader).toContain('/staff/public/scripts/staff-payroll-print.js');
        expect(payrollScript).toContain('printDriverSlip');
        expect(payrollScript).toContain('printStaffSlip');
        expect(payrollScript).toContain('printAllStaffSlips');
        expect(payrollScript).toContain('Cetak Semua Slip');
        expect(payrollScript).toContain('Cetak Slip');
    });
});
