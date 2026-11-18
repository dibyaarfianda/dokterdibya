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

    test('shows the three visit estimates with a payable product link, placed outside the sticky features section', () => {
        const section = landing.indexOf('id="checkup-estimates"');
        expect(section).toBeGreaterThan(landing.indexOf('<div class="cta-card">'));
        expect(section).toBeLessThan(landing.indexOf('<section class="journey-showcase"'));
        const features = landing.indexOf('patient-features-section');
        expect(features).toBeLessThan(landing.indexOf('<div class="cta-card">'));
        for (const code of ['obstetri', 'gyn_repro', 'gyn_special']) {
            expect(landing).toContain(`data-estimate-card="${code}"`);
            expect(landing).toContain(`href="/bayar-estimasi.html?kategori=${code}"`);
        }
        expect(landing).toContain('QRIS atau Virtual Account');
        expect(landing).toContain('tagihan akhir mengikuti tindakan');
        expect(landing).toContain('dikembalikan atas permintaan');
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

    test('the estimates stylesheet has no transitions (reduced-motion kill-switch stays untouched)', () => {
        const css = read('public', 'styles', 'landing-checkup-estimates.css');
        expect(css).not.toMatch(/transition|animation/);
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
        ['/bayar-estimasi.html?order=DPK-11111111-2222-3333-4444-555555555555&x=1', '/bayar-estimasi.html?order=DPK-11111111-2222-3333-4444-555555555555'],
        ['/bayar-estimasi.html?kategori=<script>', '/bayar-estimasi.html'],
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

    test('the booking success screen offers prepay only when the server says the patient can pay', () => {
        const booking = read('public', 'booking-klinik.html');
        expect(booking).toContain('async function findPrepayOption(category)');
        expect(booking).toContain('/api/patient/checkup-prepay/status');
        expect(booking).toContain('if (!status.availability?.available || !estimate) return null;');
        expect(booking).toContain('Bayar estimasi di muka (opsional)');
        expect(booking).toContain("window.location.href = '/patient-menu.html';");
    });
});
