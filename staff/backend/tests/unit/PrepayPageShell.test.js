'use strict';

// Tahap 2: staff page "Pembayaran di Muka" — sidebar, lazy fragment, module and permissions.
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
const html = () => read('staff', 'public', 'index-adminlte.html');
const fragment = () => read('staff', 'public', 'fragments', 'pages', 'prepay-page.html');
const moduleSource = () => read('staff', 'public', 'scripts', 'pages', 'prepay-page.js');

describe('Pembayaran di Muka page shell', () => {
    test('the sidebar item sits in Operasional next to Estimasi Biaya', () => {
        const source = html();
        const start = source.indexOf('id="nav-estimasi-biaya"');
        const block = source.slice(start, source.indexOf('id="nav-invoice-history"'));
        expect(block).toMatch(/<li class="nav-item" id="nav-prepay">/);
        expect(block).toContain('data-staff-call="showPrepayPage"');
        expect(block).toContain('<p>Pembayaran di Muka</p>');
    });

    test('container, descriptor, loader, shim, resume entry and compact sidebar are wired', () => {
        expect(html()).toMatch(/<div id="prepay-page" class="d-none" data-page-fragment="\/staff\/public\/fragments\/pages\/prepay-page\.html"><\/div>/);
        expect(read('staff', 'public', 'scripts', 'shell', 'page-descriptors.js'))
            .toContain("['prepay', 'prepay-page', 'nav-prepay', 'Pembayaran di Muka']");
        const loader = read('staff', 'public', 'scripts', 'shell', 'feature-loader.js');
        expect(loader).toMatch(/prepay: async \(\) => \{/);
        expect(loader).toContain('../pages/prepay-page.js?v=');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        expect(bootstrap).toContain("installLazyFeatureShim(globalName, 'prepay', 'prepay')");
        expect(bootstrap).toContain("'showPrepayPage'");
        expect(read('staff', 'public', 'scripts', 'main.js')).toMatch(/'nav-prepay':\s+\(\) => window\.showPrepayPage\?\.\(\)/);
        expect(read('staff', 'public', 'scripts', 'shell', 'compact-sidebar.js')).toMatch(/FINANCE_IDS = new Set\(\[[^\]]*'nav-prepay'/);
    });

    test('every onclick handler is exported to window', () => {
        const mod = moduleSource();
        const exportsBlock = mod.slice(mod.indexOf('Object.assign(window, {'));
        const names = new Set();
        for (const source of [fragment(), mod]) {
            for (const attr of source.match(/onclick="[^"]*"/g) || []) {
                for (const m of attr.matchAll(/window\.([A-Za-z]+)\(/g)) names.add(m[1]);
            }
        }
        expect(names.size).toBeGreaterThan(4);
        for (const name of names) expect(exportsBlock).toMatch(new RegExp(`\\b${name}\\b`));
    });

    test('module follows the token, date, escaping and layout rules', () => {
        const mod = moduleSource();
        expect(mod).toContain("from '../staff-api.js'");
        expect(mod).toContain("from '../safe-render.js'");
        expect(mod).not.toContain('localStorage.getItem(');
        expect(mod).not.toContain('toISOString');
        const styles = (fragment().match(/<style[\s\S]*?<\/style>/g) || []).join('\n');
        expect(styles).not.toMatch(/\d+vh\b/);
    });

    test('actions follow account permissions and the fixed copy', () => {
        const mod = moduleSource();
        expect(mod).toContain("hasAccountPermission?.('billing.reset')");
        expect(mod).toContain("hasAccountPermission?.('checkup_prepay.manage_estimate')");
        expect(mod).toContain("hasAccountPermission?.('billing.view')");
        expect(mod).toContain('Uji (sandbox)');
        expect(mod + fragment()).toContain('Catat setelah uang diserahkan; sistem tidak mengirim uang');
        expect(mod).toContain('Belum siap: kartu tidak tampil di halaman utama');
        expect(mod).toContain('prepay-refund-key:');
        expect(mod).toContain('crypto.randomUUID()');
        expect(mod).toContain('window.showPatientDetail');
    });

    test('the Paket and Pencairan tabs replace Harga Estimasi', () => {
        const frag = fragment();
        const mod = moduleSource();
        expect(frag).toContain('id="prepay-panel-packages"');
        expect(frag).toContain('id="prepay-panel-refund-requests"');
        expect(frag).not.toContain('Harga Estimasi');
        expect(mod).not.toContain('Harga Estimasi');
        expect(mod + frag).not.toContain('/estimate-mapping');
        expect(mod).toContain('/packages');
        expect(mod).toContain('/refund-requests');
        expect(mod).toContain('dihitung dari harga saat ini');
        expect(mod).toContain('Paket lain di minggu yang sama');
        expect(mod).toContain('+ Tambah tindakan');
        expect(mod).toContain('+ Tambah obat');
        const bootstrap = read('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        for (const name of ['prepayLoadPackages', 'prepayEditPackage', 'prepayAddPackageItem', 'prepayRemovePackageItem',
            'prepaySavePackage', 'prepayTogglePackage', 'prepayLoadRefundRequests', 'prepayStartRefundRequest', 'prepayCompleteRefundRequest', 'prepayRejectRefundRequest']) {
            expect(bootstrap).toContain(`'${name}'`);
        }
        expect(bootstrap).not.toContain("'prepayLoadMapping'");
    });

    test('Pencairan rows: nama berbeda badge, transfer and reject behind billing.reset, fixed confirm copy', () => {
        const mod = moduleSource();
        expect(mod).toContain('nama berbeda');
        expect(mod).toContain('Sudah ditransfer');
        expect(mod).toContain('Tolak');
        expect(mod).toContain('sudah ditransfer ke');
        expect(mod).toContain('window.prompt(');
        // each server string in the rows goes through escapeHtml
        expect(mod).toContain('escapeHtml(row.bank_name');
        expect(mod).toContain('escapeHtml(row.account_holder');
        expect(mod).toContain('escapeHtml(row.account_number');
    });

    test('Pencairan rows: "Mulai transfer" before "Sudah ditransfer"; the processing badge names who started', () => {
        const mod = moduleSource();
        expect(mod).toContain('Mulai transfer');
        expect(mod).toContain('/start');
        expect(mod).toContain('pasien tidak dapat membatalkan');
        expect(mod).toContain("processing: '<span class=\"badge badge-info\">Sedang ditransfer</span>'");
        expect(mod).toContain('escapeHtml(row.processing_by');
        expect(mod).toContain('prepayStartRefundRequest');
        // A pending row offers only the start, a processing row only the transfer confirmation.
        expect(mod).toMatch(/status === 'pending'[\s\S]{0,400}prepayStartRefundRequest/);
        expect(mod).toMatch(/status === 'processing'[\s\S]{0,400}prepayCompleteRefundRequest/);
    });

    test('"Tolak" on a request being transferred warns first; action buttons are disabled while a call runs', () => {
        const mod = moduleSource();
        const reject = mod.slice(mod.indexOf('export async function prepayRejectRefundRequest'));
        // The warning comes before the reason prompt and names who is transferring.
        expect(reject).toMatch(/row\.status === 'processing'[\s\S]{0,600}window\.confirm\([\s\S]{0,400}Tolak HANYA bila uang tidak terkirim[\s\S]*window\.prompt\(/);
        expect(reject).toContain('row.processing_by');
        const runner = mod.slice(mod.indexOf('async function runRefundRequestAction'), mod.indexOf('export async function prepayStartRefundRequest'));
        expect(runner).toContain("#prepay-refund-requests-tbody button");
        expect(runner).toContain('.disabled = true');
    });

    test('the paid toast also announces withdrawal requests and refreshes the red dots', () => {
        const toast = read('staff', 'public', 'scripts', 'shell', 'prepay-paid-toast.js');
        expect(toast).toContain('checkup_prepay_refund_requested');
        expect(toast).toContain('Pengajuan pencairan saldo: ');
        expect(read('staff', 'public', 'scripts', 'shell', 'menu-new-badges.js')).toContain("'checkup_prepay_refund_requested'");
    });

    test('the package editor never sends the admin line (tindakan 1) as an item', () => {
        const vm = require('vm');
        const source = moduleSource();
        const start = source.indexOf('// <editor-item-helpers>');
        const end = source.indexOf('// </editor-item-helpers>');
        expect(start).toBeGreaterThan(-1);
        const api = vm.runInNewContext(`${source.slice(start, end).replace(/export /g, '')};({ editorItemsFromPriced, payloadItems })`, {});
        const priced = [
            { item_type: 'tindakan', ref_id: 1, name: 'Admin', quantity: 1 },
            { item_type: 'tindakan', ref_id: 9, quantity: 1 },
            { item_type: 'obat', ref_id: 1, quantity: 2 },
            { item_type: 'obat', ref_id: 77, quantity: 30 }
        ];
        expect(JSON.parse(JSON.stringify(api.editorItemsFromPriced(priced, 1)))).toEqual([
            { item_type: 'tindakan', ref_id: 9, quantity: 1 },
            { item_type: 'obat', ref_id: 1, quantity: 2 },
            { item_type: 'obat', ref_id: 77, quantity: 30 }
        ]);
        expect(api.editorItemsFromPriced(priced, undefined).some(item => item.item_type === 'tindakan' && item.ref_id === 1)).toBe(false);
        // The payload builder is a second guard: even a state holding the admin line does not send it.
        expect(JSON.parse(JSON.stringify(api.payloadItems(priced, 1))).map(item => `${item.item_type}:${item.ref_id}`)).toEqual(['tindakan:9', 'obat:1', 'obat:77']);
    });

    test('editing a package starts from its STORED items so a problem item is not silently dropped', () => {
        const source = moduleSource();
        // call site: the editor rows come from stored_items, never from the priced items
        expect(source).toContain('editorItemsFromPriced(existing.stored_items, packageState.catalog?.admin?.id)');
        expect(source).not.toContain('editorItemsFromPriced(existing.items');
        const vm = require('vm');
        const start = source.indexOf('// <editor-item-helpers>');
        const end = source.indexOf('// </editor-item-helpers>');
        const api = vm.runInNewContext(`${source.slice(start, end).replace(/export /g, '')};({ editorItemsFromPriced, payloadItems })`, {});
        // priced items lack the inactive obat #12; the stored items still carry it
        const existing = {
            items: [{ item_type: 'tindakan', ref_id: 1, quantity: 1 }, { item_type: 'tindakan', ref_id: 9, quantity: 1 }],
            stored_items: [{ item_type: 'tindakan', ref_id: 9, quantity: 1, sort_order: 0 }, { item_type: 'obat', ref_id: 12, quantity: 3, sort_order: 1 }]
        };
        const rows = api.editorItemsFromPriced(existing.stored_items, 1);
        expect(JSON.parse(JSON.stringify(api.payloadItems(rows, 1)))).toEqual([
            { item_type: 'tindakan', ref_id: 9, quantity: 1 },
            { item_type: 'obat', ref_id: 12, quantity: 3 }
        ]);
    });

    test('the orders table shows the order ref (spec §8 columns)', () => {
        expect(fragment()).toMatch(/<th>Order<\/th>/);
        expect(moduleSource()).toContain('escapeHtml(row.order_ref');
        expect(fragment()).toContain('colspan="8"');
    });

    test('a refund retry key is reused only for the identical refund', () => {
        const mod = moduleSource();
        // The key is stored with the request it belongs to; a changed amount, method or reason gets a new key,
        // so an unclear earlier save can never lock the patient's refunds behind a 409.
        expect(mod).toContain('function refundKeyFor(patientId, payload)');
        expect(mod).toMatch(/saved\.payload === fingerprint/);
        expect(mod).toContain('JSON.stringify({ key, payload: fingerprint })');
    });

    test('menu source and navigation permission exist', () => {
        const { MENU_ACTIVITY_SOURCES } = require('../../config/menu-activity-sources');
        const { STAFF_NAVIGATION_MAP } = require('../../config/accessControlRegistry');
        expect(MENU_ACTIVITY_SOURCES['nav-prepay']).toEqual([
            { table: 'payment_orders', where: "order_type = 'checkup_prepay' AND status = 'paid'", columns: ['paid_at'] },
            { table: 'patient_credit_refund_requests', columns: ['created_at'] }
        ]);
        expect(STAFF_NAVIGATION_MAP['nav-prepay']).toBe('billing.view');
    });
});
