'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

describe('checkup prepay migrations', () => {
    const prepay = read('staff', 'backend', 'migrations', '20261118_checkup_prepay.sql');
    const review = read('staff', 'backend', 'migrations', '20261118_patient_review_accounts.sql');

    test('extend payment_orders idempotently and keep premium orders the default type', () => {
        expect(prepay).toContain('ALTER TABLE payment_orders');
        expect(prepay).toMatch(/ADD COLUMN IF NOT EXISTS order_type VARCHAR\(20\) NOT NULL DEFAULT 'premium'/);
        expect(prepay).toMatch(/ADD COLUMN IF NOT EXISTS gateway_mode ENUM\('sandbox','live'\)/);
        expect(prepay).toMatch(/MODIFY COLUMN plan_id INT UNSIGNED NULL/);
        expect(prepay).toMatch(/ADD INDEX IF NOT EXISTS idx_payment_orders_type/);
    });

    test('the credit ledger credits each order only once and records the gateway mode', () => {
        expect(prepay).toContain('CREATE TABLE IF NOT EXISTS patient_credit_ledger');
        expect(prepay).toMatch(/UNIQUE KEY uq_credit_ledger_source \(source_type, source_id, entry_type\)/);
        expect(prepay).toMatch(/gateway_mode ENUM\('sandbox','live'\)/);
        expect(prepay).toContain('utf8mb4_unicode_ci');
    });

    test('review accounts keep their own hash and never touch patient or user passwords', () => {
        expect(review).toContain('CREATE TABLE IF NOT EXISTS patient_review_accounts');
        expect(review).toMatch(/UNIQUE KEY uq_review_accounts_patient \(patient_id\)/);
        expect(review).toMatch(/expires_at DATETIME NOT NULL/);
        expect(review).not.toMatch(/INSERT INTO (patients|users)|UPDATE (patients|users)/);
        expect(prepay + review).not.toMatch(/premium_plans SET is_active/);
    });
});

describe('tahap 2 migration', () => {
    const migrationPath = path.join(repoRoot, 'staff', 'backend', 'migrations', '20261121_checkup_prepay_tahap2.sql');
    const tahap2 = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n') : '';

    test('adds the refund table, the saldo part of returns and the estimate permission idempotently', () => {
        expect(tahap2).toContain('CREATE TABLE IF NOT EXISTS patient_credit_refunds');
        expect(tahap2).toContain('request_key VARCHAR(80) NOT NULL UNIQUE');
        expect(tahap2).toContain("ENUM('cash','transfer','saldo')");
        expect(tahap2).toMatch(/ADD COLUMN IF NOT EXISTS saldo_amount DECIMAL\(12,2\) NULL/);
        expect(tahap2).toMatch(/ADD INDEX IF NOT EXISTS idx_credit_ledger_live \(patient_id, gateway_mode\)/);
        expect(tahap2).toContain('INSERT IGNORE INTO permissions');
        expect(tahap2).toContain('checkup_prepay.manage_estimate');
        expect(tahap2).toContain('utf8mb4_unicode_ci');
        expect(tahap2).not.toMatch(/INSERT INTO patient_credit_ledger/);
        expect(tahap2).not.toMatch(/sunday_clinic_closing_entries/);
    });
});

describe('tahap 3 package migration', () => {
    const migrationPath = path.join(repoRoot, 'staff', 'backend', 'migrations', '20261122_checkup_prepay_packages.sql');
    const tahap3 = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n') : '';

    test('creates the package, item and refund request tables idempotently without seeding data', () => {
        expect(tahap3).toContain('CREATE TABLE IF NOT EXISTS checkup_prepay_packages');
        expect(tahap3).toContain('CREATE TABLE IF NOT EXISTS checkup_prepay_package_items');
        expect(tahap3).toContain('CREATE TABLE IF NOT EXISTS patient_credit_refund_requests');
        expect(tahap3).toContain('20261121_checkup_prepay_tahap2.sql');
        expect(tahap3).toMatch(/UNIQUE KEY uq_prepay_packages_code \(code\)/);
        expect(tahap3).toMatch(/UNIQUE KEY uq_refund_requests_key \(request_key\)/);
        expect(tahap3).toMatch(/UNIQUE KEY uq_prepay_package_items \(package_id, item_type, ref_id\)/);
        expect(tahap3).toContain('ON DELETE CASCADE');
        expect(tahap3).toContain("ENUM('tindakan','obat')");
        expect(tahap3).toContain("ENUM('pending','done','rejected','cancelled')");
        expect(tahap3).toMatch(/KEY idx_refund_requests_status \(status, created_at\)/);
        expect(tahap3).toMatch(/KEY idx_refund_requests_patient \(patient_id, status\)/);
        expect(tahap3).toContain('utf8mb4_unicode_ci');
        expect(tahap3).not.toMatch(/INSERT/i);
    });
});

describe('server wiring', () => {
    const server = read('staff', 'backend', 'server.js');

    test('the review login is mounted after the demo guard and before the Google auth routes', () => {
        const reviewMount = server.indexOf("app.use('/api/patients/review-login', createPatientReviewLoginRouter())");
        const authMount = server.indexOf("app.use('/api/patients', patientsAuthRoutes)");
        const demoGuard = server.indexOf('patientDemoGuard');
        expect(reviewMount).toBeGreaterThan(-1);
        expect(reviewMount).toBeLessThan(authMount);
        expect(demoGuard).toBeGreaterThan(-1);
        expect(demoGuard).toBeLessThan(reviewMount);
    });

    test('prepay and public estimate routers are mounted', () => {
        expect(server).toContain("app.use('/api/patient/checkup-prepay', createPatientCheckupPrepayRouter())");
        expect(server).toContain("app.use('/api/public/checkup-estimates', createPublicCheckupEstimatesRouter())");
    });

    test('the default premium service hands paid prepay orders to the credit ledger', () => {
        const service = read('staff', 'backend', 'services', 'PremiumPaymentService.js');
        expect(service).toContain("checkup_prepay: require('./PatientCreditLedger').creditFromPaidOrder");
    });
});

describe('sisiwanita.id home page (Duitku review requirements)', () => {
    const landing = read('public', 'sisiwanita', 'index.html');

    test('shows the three visit estimates early on the page, before Dokumen and outside the sticky features section', () => {
        const section = landing.indexOf('id="checkup-estimates"');
        const menu = landing.indexOf('<div class="menu-container">');
        const docs = landing.indexOf('<div class="doc-section">');
        expect(menu).toBeGreaterThan(-1);
        expect(section).toBeGreaterThan(menu);
        expect(section).toBeLessThan(docs);
        // Sits in front of the sticky "Fitur Portal SW" section, never inside it.
        expect(section).toBeLessThan(landing.indexOf('<div class="proces-section patient-features-section">'));
        // Cards are rendered from the active packages, not hard-coded.
        expect(landing).toContain('data-estimate-groups');
        expect(landing).toContain('data-estimate-fallback');
        for (const code of ['obstetri', 'obstetri_usg4d', 'gyn_repro', 'gyn_special']) {
            expect(landing).not.toContain(`data-estimate-card="${code}"`);
        }
        expect(landing).toContain('QRIS atau Virtual Account');
        expect(landing).toContain('tagihan akhir mengikuti tindakan');
        expect(landing).toContain('dapat dicairkan ke rekening Anda lewat portal');
        expect(landing).not.toContain('dikembalikan atas permintaan');
    });

    test('the estimates module renders the groups with DOM APIs from the active packages', () => {
        const moduleSource = read('public', 'scripts', 'landing', 'checkup-estimates.js');
        expect(moduleSource).toContain('renderGroups');
        expect(moduleSource).toContain('createElement');
        expect(moduleSource).toContain("'landing:layout-changed'");
        expect(moduleSource).not.toMatch(/innerHTML/);
        expect(moduleSource).toContain('/bayar-estimasi.html?kategori=');
        expect(moduleSource).toContain('encodeURIComponent');
        for (const heading of ['Kehamilan', 'Program Hamil', 'Ginekologi']) {
            expect(moduleSource).toContain(`'${heading}'`);
        }
        expect(moduleSource).toContain('Estimasi segera tersedia. Hubungi klinik untuk informasi biaya.');
    });

    test('the estimate cards are offered by Sisiwanita, not by the doctor personally', () => {
        const start = landing.indexOf('id="checkup-estimates"');
        const section = landing.slice(start, landing.indexOf('<div class="doc-section">'));
        expect(section).toContain('Layanan Sisiwanita');
        expect(section).not.toContain('dr. Dibya');
        expect(section).toContain('data-estimate-groups');
    });

    test('Fitur Portal SW says the portal keeps medical summaries, USG photos and lab results', () => {
        const start = landing.indexOf('<div class="proces-section patient-features-section">');
        const features = landing.slice(start, landing.indexOf('<div class="proces-spacer"></div>', start));
        expect(features).toContain('resume medis, foto USG, dan hasil lab');
        expect(features).toMatch(/<h3 class="proces-title">RESUME, USG &amp; LAB<\/h3>/);
        expect(features).toContain('Resume medis, foto USG, dan hasil laboratorium Anda tersimpan di portal');
    });

    test('lists support email, phone and business address', () => {
        expect(landing).toContain('href="mailto:admin@dokterdibya.com"');
        expect(landing).toContain('href="https://wa.me/62895320726801"');
        expect(landing).toContain('0895-3207-26801');
        expect(landing).toContain('Jl. Balowerti 2 No. 59, Kediri, Jawa Timur');
    });

    test('the login hijacker lets the prepay page through', () => {
        const start = landing.indexOf('function isStandalonePortalHref(href)');
        const fnSource = landing.slice(start, landing.indexOf('function redirectStandalonePortalLink', start));
        const isStandalonePortalHref = vm.runInNewContext(`(${fnSource.trim()})`, { window: { location: { origin: 'https://sisiwanita.id' } } });
        expect(isStandalonePortalHref('/bayar-estimasi.html?kategori=obstetri')).toBe(false);
        expect(isStandalonePortalHref('/patient-menu.html')).toBe(true);
        expect(isStandalonePortalHref('/bayar-estimasi.html-copy.html')).toBe(true);
    });

    test('the estimates module is registered, loaded and precached', () => {
        const loader = read('public', 'scripts', 'landing', 'feature-loader.js');
        const bootstrap = read('public', 'scripts', 'landing', 'bootstrap.js');
        const worker = read('public', 'sw.js');
        const moduleSource = read('public', 'scripts', 'landing', 'checkup-estimates.js');
        expect(loader).toContain("checkupEstimates: () => import('./checkup-estimates.js')");
        expect(bootstrap).toContain("loadLandingFeature('checkupEstimates')");
        expect(worker).toContain("'/scripts/landing/checkup-estimates.js'");
        expect(moduleSource).toContain("'/api/public/checkup-estimates'");
        expect(moduleSource).toContain("credentials: 'omit'");
        expect(moduleSource).not.toMatch(/innerHTML/);
    });

    test('the sticky "Fitur Portal SW" stack re-measures after the estimates above it finish loading', () => {
        // The estimate cards sit above the stack and grow when prices arrive (often after the
        // stack's last timed re-measure at 1.5s). Stale offsets make rows collapse too early.
        const moduleSource = read('public', 'scripts', 'landing', 'checkup-estimates.js');
        expect(moduleSource).toContain("window.dispatchEvent(new CustomEvent('landing:layout-changed'");
        expect(moduleSource.indexOf("new CustomEvent('landing:layout-changed'"))
            .toBeGreaterThan(moduleSource.indexOf('renderGroups(container'));

        const stackStart = landing.indexOf('function rebuildMetrics()');
        const stackSource = landing.slice(stackStart, landing.indexOf('function applyRowState(', stackStart));
        expect(stackSource).toContain("window.addEventListener('landing:layout-changed', scheduleRebuild);");
    });

    test('the estimates stylesheet has no transitions (reduced-motion kill-switch stays untouched)', () => {
        const css = read('public', 'styles', 'landing-checkup-estimates.css');
        expect(css).not.toMatch(/transition|animation/);
    });
});

describe('unavailable package on the payment page', () => {
    test('checkup-prepay.js shows "Paket tidak tersedia" with a link home and handles PACKAGE_UNAVAILABLE', () => {
        const source = read('public', 'scripts', 'checkup-prepay.js');
        expect(source).toContain('Paket tidak tersedia');
        expect(source).toContain("'PACKAGE_UNAVAILABLE'");
        expect(source).toContain("link.setAttribute('href', '/')");
        expect(source).toContain('heading.textContent = ');
    });
});

describe('login return path and review login page', () => {
    function loadSafeNext(search) {
        const source = read('public', 'scripts', 'patient-safe-next.js');
        const window = { location: { origin: 'https://sisiwanita.id', search } };
        vm.runInNewContext(source, { window, URL, URLSearchParams });
        return window.PatientSafeNext;
    }

    test.each([
        ['/bayar-estimasi.html?kategori=obstetri', '/bayar-estimasi.html?kategori=obstetri'],
        ['/bayar-estimasi.html?kategori=obstetri_usg4d', '/bayar-estimasi.html?kategori=obstetri_usg4d'],
        ['/bayar-estimasi.html?order=DPK-11111111-2222-3333-4444-555555555555&x=1', '/bayar-estimasi.html?order=DPK-11111111-2222-3333-4444-555555555555'],
        ['/bayar-estimasi.html?kategori=pkg_12', '/bayar-estimasi.html?kategori=pkg_12'],
        ['/bayar-estimasi.html?kategori=<script>', '/bayar-estimasi.html'],
        ['/bayar-estimasi.html?kategori=A', '/bayar-estimasi.html'],
        ['/bayar-estimasi.html?kategori=../x', '/bayar-estimasi.html'],
        ['//evil.example/bayar-estimasi.html', null],
        ['https://evil.example/bayar-estimasi.html', null],
        ['/\\evil.example', null],
        ['/patient-billing.html', null],
        ['javascript:alert(1)', null]
    ])('next=%s resolves to %s', (next, expected) => {
        const safeNext = loadSafeNext(`?next=${encodeURIComponent(next)}`);
        expect(safeNext.get()).toBe(expected);
    });

    test('login pages honour the safe return path and link the review login', () => {
        const login = read('public', 'patient-login.html');
        expect(login).toContain('/scripts/patient-safe-next.js?v=');
        expect(login).toContain("return window.PatientSafeNext?.get() || '/patient-menu.html';");
        expect(login).toContain('href="/masuk-akun-uji.html" id="review-account-link"');

        const review = read('public', 'masuk-akun-uji.html');
        expect(review).toContain('<meta name="robots" content="noindex,nofollow">');
        expect(review).toContain("fetch('/api/patients/review-login'");
        expect(review).toContain("localStorage.setItem('auth_provider', 'review')");
    });

    test('the prepay page sends logged-out patients to login with their category kept', () => {
        const page = read('public', 'bayar-estimasi.html');
        const script = read('public', 'scripts', 'checkup-prepay.js');
        expect(page).toContain('id="prepay-app"');
        expect(page).toContain('/scripts/checkup-prepay.js?v=');
        expect(script).toContain("'/patient-login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search)");
        expect(script).toContain("'/api/patient/checkup-prepay'");
        expect(script).not.toMatch(/amount_idr:\s*state/);
    });

    test('the booking page offers the package estimate and the pay-now choice only when the server allows it', () => {
        const booking = read('public', 'booking-klinik.html');
        expect(booking).not.toMatch(/findPrepayOption/);
        expect(booking).toContain('loadPrepayOffer(');
        expect(booking).toContain('/api/patient/checkup-prepay/status');
        expect(booking).toContain('/api/patient/checkup-prepay/suggestion');
        expect(booking).toContain('prepay-package-select');
        expect(booking).toContain('availability?.available');
        expect(booking).toContain('bookingData.prepayPackageCode');
        expect(booking).toContain("'booking-prepay-package'");
        for (const copy of [
            'Perkiraan biaya kunjungan',
            'Pilih paket sesuai usia kehamilan',
            'Mau bayar sekarang?',
            'Bayar sekarang (QRIS / VA)',
            'Bayar saat periksa',
            'sudah menutup estimasi',
            'bayar di muka (deposit)',
            'otomatis dipotong',
            'bisa dicairkan'
        ]) {
            expect(booking).toContain(copy);
        }
        expect(booking).toContain('/bayar-estimasi.html?kategori=');
        expect(booking).toContain("window.location.href = '/patient-menu.html';");
    });

    test('the booking POST body keeps exactly its old keys and carries no package fields', () => {
        const booking = read('public', 'booking-klinik.html');
        const body = booking.match(/body: JSON\.stringify\(\{([\s\S]*?)\}\)\s*\}\);/)[1];
        const keys = [...body.matchAll(/^\s*([a-z_]+):/gm)].map(m => m[1]);
        expect(keys).toEqual([
            'booking_policy_acknowledged',
            'booking_policy_version',
            'appointment_date',
            'session',
            'slot_number',
            'chief_complaint',
            'consultation_category'
        ]);
        expect(body).not.toMatch(/prepay|package/i);
    });
});
