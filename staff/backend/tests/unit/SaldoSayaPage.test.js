'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

describe('portal Saldo Saya page', () => {
    const page = read('public', 'saldo-saya.html');
    const script = read('public', 'scripts', 'saldo-saya.js');

    test('the page locks the viewport and loads the script', () => {
        expect(page).toMatch(/<meta name="viewport" content="[^"]*maximum-scale=1\.0, user-scalable=no/);
        expect(page).toContain('/scripts/saldo-saya.js');
        expect(page).toContain('Saldo Saya');
    });

    test('the script calls the saldo, refund-request and cancel endpoints with no-cache', () => {
        expect(script).toContain('/api/patient/checkup-prepay');
        expect(script).toContain('/saldo');
        expect(script).toContain('/refund-requests');
        expect(script).toMatch(/\/cancel/);
        expect(script).toContain("'Cache-Control': 'no-cache'");
        expect(script).toContain('_t=');
    });

    test('the copy fixed by the spec is present', () => {
        expect(script).toContain('Cairkan ke rekening');
        expect(script).toContain('Ajukan pencairan');
        expect(script).toContain('diproses 1–2 hari kerja');
        expect(script).toContain('Saldo uji tidak dapat dicairkan');
        expect(script).toContain('Belum ada saldo deposit.');
        expect(script).toContain('Pengajuan sebelumnya masih diproses.');
        ['Diproses', 'Selesai', 'Ditolak', 'Dibatalkan'].forEach(label => expect(script).toContain(`'${label}'`));
        ['BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'CIMB Niaga', 'Permata', 'Lainnya'].forEach(bank => expect(script).toContain(`'${bank}'`));
    });

    test('server strings never reach innerHTML or insertAdjacentHTML', () => {
        expect(script).not.toMatch(/innerHTML\s*=\s*[^'";]*[a-zA-Z_]/);
        expect(script).not.toContain('insertAdjacentHTML');
        expect(script).not.toContain('document.write');
        expect(script).toContain('textContent');
    });

    test('the withdrawal key is random, kept with its payload in sessionStorage and cleared after success', () => {
        expect(script).toContain('crypto.getRandomValues');
        expect(script).toContain('sessionStorage');
        expect(script).toContain('request_key');
        expect(script).toMatch(/removeItem/);
    });

    test('there is no vh unit and no toISOString', () => {
        expect(page).not.toMatch(/\d\s*vh\b/);
        expect(script).not.toContain('toISOString');
    });

    test('an unauthenticated visitor is sent to login with a safe next', () => {
        expect(script).toContain('/patient-login.html?next=');
    });
});

describe('Saldo Saya wiring', () => {
    test('the safe-next allow-list includes the page', () => {
        expect(read('public', 'scripts', 'patient-safe-next.js')).toContain("'/saldo-saya.html'");
    });

    test('the patient menu has the hidden Saldo Deposit entry unhidden by the status flag', () => {
        const menu = read('public', 'patient-menu.html');
        expect(menu).toMatch(/<a\b[^>]*id="menu-saldo-deposit"[^>]*href="\/saldo-saya\.html"[^>]*\bhidden\b/);
        expect(menu).toContain('Saldo Deposit');
        expect(menu).toContain('saldo_menu_visible');
        expect(menu).toContain('/api/patient/checkup-prepay/status');
    });

    test('the bottom nav maps the page to Aplikasi without a static list entry', () => {
        const nav = read('public', 'scripts', 'portal-bottom-nav.js');
        expect(nav).toContain("'/saldo-saya.html': 'aplikasi'");
        expect(nav).not.toMatch(/\[\s*'[^']*',\s*'Saldo[^']*',\s*'\/saldo-saya\.html'/);
    });

    test('the service worker precaches the page script', () => {
        expect(read('public', 'sw.js')).toContain("'/scripts/saldo-saya.js'");
    });
});
