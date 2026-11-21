'use strict';

// Behaviour: the real public/scripts/saldo-saya.js runs in a vm context against a small fake DOM.
// It decides where money is sent (request_key reuse, client validation, form states), so these
// tests drive the actual code instead of checking for strings.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.listeners = {};
        this.attrs = {};
        this.className = '';
        this.value = '';
        this.disabled = false;
        this.hidden = false;
        this._text = '';
        this.classList = {
            add: cls => { if (!this.hasClass(cls)) this.className = `${this.className} ${cls}`.trim(); },
            toggle: (cls, force) => {
                const on = force === undefined ? !this.hasClass(cls) : !!force;
                const rest = this.className.split(/\s+/).filter(c => c && c !== cls);
                this.className = (on ? rest.concat(cls) : rest).join(' ');
            }
        };
    }
    hasClass(cls) { return this.className.split(/\s+/).includes(cls); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set textContent(value) { this.children = []; this._text = value == null ? '' : String(value); }
    appendChild(child) { this.children.push(child); return child; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    remove() {}
    fire(type) { (this.listeners[type] || []).forEach(fn => fn({ preventDefault() {} })); }
}

function findAll(node, predicate, found = []) {
    if (predicate(node)) found.push(node);
    node.children.forEach(child => findAll(child, predicate, found));
    return found;
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const jsonResponse = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function saldoBody(overrides = {}) {
    return {
        success: true,
        balances: { live: 300000, sandbox: 0 },
        available_idr: 300000,
        history: [{ entry_type: 'prepay', category_label: 'Obstetri', amount_idr: 300000, gateway_mode: 'live', created_at: '2026-11-20 10:00:00', mr_id: null }],
        requests: [],
        ...overrides
    };
}

async function loadPage(saldo, postResponses = []) {
    const elements = {
        'prepay-app': new FakeElement('div'),
        'prepay-hero-status': new FakeElement('div'),
        'toast-container': new FakeElement('div')
    };
    const store = new Map();
    const posts = [];
    let saldoLoads = 0;
    const queue = postResponses.slice();
    const sandbox = {
        setTimeout,
        clearTimeout,
        sessionStorage: {
            getItem: key => (store.has(key) ? store.get(key) : null),
            setItem: (key, value) => { store.set(key, String(value)); },
            removeItem: key => { store.delete(key); }
        },
        fetch: async (url, init) => {
            if (init && init.method === 'POST') {
                posts.push({ url, body: JSON.parse(init.body) });
                return queue.length ? queue.shift() : jsonResponse(201, { success: true, data: { id: 1, status: 'pending' } });
            }
            saldoLoads += 1;
            return jsonResponse(200, saldo);
        },
        document: {
            createElement: tag => new FakeElement(tag),
            getElementById: id => elements[id] || null
        },
        crypto: {
            getRandomValues: bytes => { for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256); return bytes; }
        },
        PatientSession: { getToken: () => 'token', isDemoMode: () => false, clearAuth() {} },
        PatientToolShell: { init() {} },
        DibyaDateTime: { date: value => String(value).slice(0, 10) }
    };
    sandbox.window = sandbox;
    sandbox.location = { pathname: '/saldo-saya.html', search: '', replace() {} };
    vm.createContext(sandbox);
    vm.runInContext(read('public', 'scripts', 'saldo-saya.js'), sandbox);
    await flush();

    const root = elements['prepay-app'];
    const byId = id => findAll(root, node => node.id === id)[0];
    return {
        root,
        posts,
        store,
        byId,
        saldoLoads: () => saldoLoads,
        form: () => findAll(root, node => node.tagName === 'FORM')[0] || null,
        error: () => findAll(root, node => node.hasClass('pm-error'))[0],
        fill(values) {
            Object.entries(values).forEach(([id, value]) => { byId(`sd-${id}`).value = value; });
        },
        async submit() {
            this.form().fire('submit');
            await flush();
        }
    };
}

const validValues = { bank: 'BCA', account: '1234567890', holder: 'Ani Wijaya', amount: '100000' };

describe('Saldo Saya withdrawal key (real code)', () => {
    const failure = () => jsonResponse(500, { success: false, message: 'Gagal mengajukan pencairan' });

    test('a retry of the identical payload reuses the same request_key and posts the exact body', async () => {
        const page = await loadPage(saldoBody(), [failure(), failure()]);
        page.fill(validValues);
        await page.submit();
        await page.submit();
        expect(page.posts).toHaveLength(2);
        expect(page.posts[0].body.request_key).toMatch(/^[a-zA-Z0-9_-]{32}$/);
        expect(page.posts[1].body.request_key).toBe(page.posts[0].body.request_key);
        expect(page.posts[0].body).toEqual({
            amount_idr: 100000,
            bank_name: 'BCA',
            account_number: '1234567890',
            account_holder: 'Ani Wijaya',
            request_key: page.posts[0].body.request_key
        });
        expect(page.error().textContent).toBe('Gagal mengajukan pencairan');
    });

    test.each([
        ['amount', '120000'],
        ['bank', 'BRI'],
        ['account', '1234567891'],
        ['holder', 'Budi Santoso']
    ])('changing the %s produces a new request_key', async (field, changed) => {
        const page = await loadPage(saldoBody(), [failure(), failure()]);
        page.fill(validValues);
        await page.submit();
        page.fill({ [field]: changed });
        await page.submit();
        expect(page.posts).toHaveLength(2);
        expect(page.posts[1].body.request_key).not.toBe(page.posts[0].body.request_key);
    });

    test('the stored key is gone after a successful submit', async () => {
        const page = await loadPage(saldoBody());
        page.fill(validValues);
        await page.submit();
        expect(page.posts).toHaveLength(1);
        expect(page.store.size).toBe(0);
    });

    test('the stored key is kept after a failure and cleared after a 409', async () => {
        const conflict = jsonResponse(409, { success: false, message: 'Masih ada pengajuan pencairan yang sedang diproses.' });
        const page = await loadPage(saldoBody(), [failure(), conflict]);
        page.fill(validValues);
        await page.submit();
        expect(page.store.size).toBe(1);
        await page.submit();
        expect(page.store.size).toBe(0);
        expect(page.error().textContent).toBe('Masih ada pengajuan pencairan yang sedang diproses.');
    });
});

describe('Saldo Saya client validation (real code)', () => {
    async function refuses(values, message) {
        const page = await loadPage(saldoBody());
        page.fill({ ...validValues, ...values });
        await page.submit();
        expect(page.posts).toHaveLength(0);
        expect(page.error().hidden).toBe(false);
        expect(page.error().textContent).toContain(message);
    }

    test('refuses an amount below 10.000', () => refuses({ amount: '9999' }, 'minimal'));
    test('refuses an amount above the available saldo', () => refuses({ amount: '300001' }, 'melebihi'));
    test('refuses a non-numeric amount', () => refuses({ amount: '12abc' }, 'minimal'));
    test('refuses an account that is too short', () => refuses({ account: '12345' }, '6–20 digit'));
    test('refuses an account that is too long', () => refuses({ account: '1'.repeat(21) }, '6–20 digit'));
    test('refuses an account with letters', () => refuses({ account: '12345a789' }, '6–20 digit'));
    test('refuses a holder shorter than 3 characters', () => refuses({ holder: 'Al' }, '3–120'));

    test('refuses an empty Lainnya bank name', async () => {
        const page = await loadPage(saldoBody());
        page.fill({ ...validValues, bank: 'Lainnya' });
        page.byId('sd-bank-other').value = '  ';
        await page.submit();
        expect(page.posts).toHaveLength(0);
        expect(page.error().textContent).toContain('Nama bank');
    });

    test('accepts a valid payload and a Lainnya bank with a name', async () => {
        const page = await loadPage(saldoBody());
        page.fill({ ...validValues, bank: 'Lainnya' });
        page.byId('sd-bank-other').value = ' Bank  Jago ';
        await page.submit();
        expect(page.posts).toHaveLength(1);
        expect(page.posts[0].body.bank_name).toBe('Bank Jago');
        expect(page.error().hidden).toBe(true);
    });

    test('the amount defaults to the available saldo', async () => {
        const page = await loadPage(saldoBody({ available_idr: 250000 }));
        expect(page.byId('sd-amount').value).toBe('250000');
    });
});

describe('Saldo Saya form states (real code)', () => {
    const controls = page => ['sd-bank', 'sd-account', 'sd-holder', 'sd-amount'].map(id => page.byId(id));
    const submitButton = page => findAll(page.root, node => node.tagName === 'BUTTON' && node.textContent === 'Ajukan pencairan')[0];

    test('sandbox-only saldo gives a disabled form with the sandbox notice', async () => {
        const page = await loadPage(saldoBody({
            balances: { live: 0, sandbox: 200000 },
            available_idr: 0,
            history: [{ entry_type: 'prepay', category_label: 'Obstetri', amount_idr: 200000, gateway_mode: 'sandbox', created_at: '2026-11-20 10:00:00', mr_id: null }]
        }));
        expect(page.root.textContent).toContain('Saldo uji tidak dapat dicairkan');
        expect(controls(page).every(node => node.disabled)).toBe(true);
        expect(submitButton(page).disabled).toBe(true);
        page.fill(validValues);
        await page.submit();
        expect(page.posts).toHaveLength(0);
    });

    test('a pending request gives a disabled form with the pending notice and a cancel button', async () => {
        const page = await loadPage(saldoBody({
            available_idr: 0,
            requests: [{ id: 7, amount_idr: 100000, bank_name: 'BCA', account_number: '1234567890', account_holder: 'Ani Wijaya', status: 'pending', decision_note: null, created_at: '2026-11-21 08:00:00' }]
        }));
        expect(page.root.textContent).toContain('Pengajuan sebelumnya masih diproses.');
        expect(page.root.textContent).toContain('Rp100.000 · Menunggu');
        expect(controls(page).every(node => node.disabled)).toBe(true);
        expect(submitButton(page).disabled).toBe(true);
        expect(findAll(page.root, node => node.tagName === 'BUTTON' && node.textContent === 'Batalkan')).toHaveLength(1);
        page.fill(validValues);
        await page.submit();
        expect(page.posts).toHaveLength(0);
    });

    test('a request the clinic is transferring keeps the form locked, explains why, and has no cancel button', async () => {
        const page = await loadPage(saldoBody({
            available_idr: 0,
            requests: [{ id: 7, amount_idr: 100000, bank_name: 'BCA', account_number: '1234567890', account_holder: 'Ani Wijaya', status: 'processing', processing_at: '2026-11-21 10:05:00', decision_note: null, created_at: '2026-11-21 08:00:00' }]
        }));
        expect(page.root.textContent).toContain('Rp100.000 · Sedang ditransfer');
        expect(page.root.textContent).toContain('Klinik sedang mentransfer dana ini, jadi pengajuan tidak dapat dibatalkan.');
        expect(page.root.textContent).toContain('Pengajuan sebelumnya masih diproses.');
        expect(controls(page).every(node => node.disabled)).toBe(true);
        expect(submitButton(page).disabled).toBe(true);
        expect(findAll(page.root, node => node.tagName === 'BUTTON' && node.textContent === 'Batalkan')).toHaveLength(0);
    });

    test('a cancel refused with 409 (the clinic started the transfer meanwhile) reloads the saldo to show the current state', async () => {
        const refused = jsonResponse(409, { success: false, message: 'Pengajuan ini sedang ditransfer oleh klinik dan tidak dapat dibatalkan. Hubungi klinik bila ada yang perlu diubah.' });
        const page = await loadPage(saldoBody({
            available_idr: 0,
            requests: [{ id: 7, amount_idr: 100000, bank_name: 'BCA', account_number: '1234567890', account_holder: 'Ani Wijaya', status: 'pending', decision_note: null, created_at: '2026-11-21 08:00:00' }]
        }), [refused]);
        expect(page.saldoLoads()).toBe(1);
        findAll(page.root, node => node.tagName === 'BUTTON' && node.textContent === 'Batalkan')[0].fire('click');
        await flush();
        await flush();
        expect(page.posts).toEqual([{ url: expect.stringContaining('/refund-requests/7/cancel'), body: {} }]);
        expect(page.saldoLoads()).toBe(2);
    });

    test('no history and no requests gives the empty message and no form', async () => {
        const page = await loadPage(saldoBody({ balances: { live: 0, sandbox: 0 }, available_idr: 0, history: [], requests: [] }));
        expect(page.root.textContent).toContain('Belum ada saldo deposit.');
        expect(page.form()).toBeNull();
    });

    test('live saldo with nothing pending gives an enabled form', async () => {
        const page = await loadPage(saldoBody());
        expect(page.form()).not.toBeNull();
        expect(controls(page).some(node => node.disabled)).toBe(false);
        expect(submitButton(page).disabled).toBe(false);
    });
});
