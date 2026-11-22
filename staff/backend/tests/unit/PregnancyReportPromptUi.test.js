const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '../../../..');
const scriptPath = path.join(repoRoot, 'public/scripts/pregnancy-report-prompt.js');

// Minimal DOM: enough for the prompt (createElement, appendChild, textContent, attributes, events).
// `children` is array-like WITHOUT forEach/map, like a real HTMLCollection.
class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this._kids = [];
        this.parentNode = null;
        this.style = {};
        this.attributes = {};
        this.listeners = {};
        this.className = '';
        this.value = '';
        this.type = '';
        this.disabled = false;
        this.id = '';
        this._text = '';
    }
    appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = this;
        this._kids.push(child);
        return child;
    }
    removeChild(child) {
        this._kids = this._kids.filter(c => c !== child);
        child.parentNode = null;
        return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    get firstChild() { return this._kids[0] || null; }
    get children() {
        const collection = { length: this._kids.length, item: i => this._kids[i] || null };
        this._kids.forEach((c, i) => { collection[i] = c; });
        return Object.freeze(collection);
    }
    set textContent(value) {
        this._kids.forEach(c => { c.parentNode = null; });
        this._kids = [];
        this._text = String(value);
    }
    get textContent() { return this._text + this._kids.map(c => c.textContent).join(''); }
    set innerHTML(value) { throw new Error('innerHTML must not be used: ' + value); }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); }
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    dispatch(type) { (this.listeners[type] || []).forEach(fn => fn({ type, target: this, preventDefault() {} })); }
    click() { if (!this.disabled) this.dispatch('click'); }
}

function walk(node, out = []) {
    out.push(node);
    node._kids.forEach(c => walk(c, out));
    return out;
}

function setup({ status = { success: true, ask: true, hpht: '2026-01-10' }, today = new Date(2026, 10, 22, 10, 0, 0) } = {}) {
    const body = new FakeElement('body');
    body.style.overflow = 'auto';
    const failTags = [];
    const head = new FakeElement('head');
    const fetch = jest.fn(async url => {
        if (String(url).startsWith('/api/patient/pregnancy-report/status')) {
            return { ok: true, status: 200, json: async () => status };
        }
        throw new Error('unexpected fetch ' + url);
    });
    const RealDate = Date;
    class FixedDate extends RealDate {
        constructor(...args) { if (args.length) super(...args); else super(today.getTime()); }
        static now() { return today.getTime(); }
    }
    const ctx = vm.createContext({
        document: {
            body,
            head,
            createElement: tag => {
                if (failTags.includes(String(tag).toLowerCase())) throw new Error('render failed');
                return new FakeElement(tag);
            },
            getElementById: id => walk(body).concat(walk(head)).find(n => n.id === id) || null
        },
        location: { reload: jest.fn() },
        PatientSession: { getToken: () => 'patient-token', isDemoMode: () => false },
        fetch,
        console,
        Date: FixedDate,
        Promise,
        setTimeout
    });
    ctx.window = ctx;
    vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), ctx);
    const all = () => walk(body);
    const q = name => all().find(n => n.getAttribute('data-ppr') === name) || null;
    const text = () => body.textContent;
    const flush = () => new Promise(r => setImmediate(r));
    const respondPost = (statusCode, payload) => {
        fetch.mockImplementationOnce(async () => ({ ok: statusCode >= 200 && statusCode < 300, status: statusCode, json: async () => payload }));
    };
    return { ctx, body, fetch, q, all, text, flush, respondPost, failTags };
}

async function openPrompt(env) {
    const shown = await env.ctx.PregnancyReportPrompt.check();
    expect(shown).toBe(true);
    return env;
}

function fillBirth(env, { place = 'RSIA Melinda', date = '2026-11-01', method = 'sc', count = 2, weights = ['3100', '2900'] } = {}) {
    env.q('answer-lahir_sehat').click();
    env.q('place').value = place;
    env.q('ended_on').value = date;
    if (method) env.q('delivery-' + method).click();
    if (count) env.q('count-' + count).click();
    weights.forEach((w, i) => { env.q('weight-' + i).value = w; });
}

test('status is fetched with the session token, cache-buster and no-cache; ask:false shows nothing', async () => {
    const env = setup({ status: { success: true, ask: false, hpht: null } });
    const shown = await env.ctx.PregnancyReportPrompt.check();
    expect(shown).toBe(false);
    const [url, options] = env.fetch.mock.calls[0];
    expect(url).toMatch(/^\/api\/patient\/pregnancy-report\/status\?_t=\d+$/);
    expect(options.headers.Authorization).toBe('Bearer patient-token');
    expect(options.headers['Cache-Control']).toBe('no-cache');
    expect(env.body.children).toHaveLength(0);
});

test('no token or demo mode skips the status call', async () => {
    const env = setup();
    env.ctx.PatientSession.getToken = () => null;
    expect(await env.ctx.PregnancyReportPrompt.check()).toBe(false);
    env.ctx.PatientSession.getToken = () => 'patient-token';
    env.ctx.PatientSession.isDemoMode = () => true;
    expect(await env.ctx.PregnancyReportPrompt.check()).toBe(false);
    expect(env.fetch).not.toHaveBeenCalled();
});

test('first step shows the neutral title, three answers and a quieter "Masih hamil"; opens only once', async () => {
    const env = await openPrompt(setup());
    expect(env.text()).toContain('Bagaimana kabar kehamilan Ibu?');
    expect(env.q('answer-lahir_sehat').textContent).toBe('Lahir sehat');
    expect(env.q('answer-keguguran').textContent).toBe('Keguguran');
    expect(env.q('answer-ektopik').textContent).toBe('Hamil di luar kandungan');
    expect(env.q('answer-masih_hamil').textContent).toBe('Masih hamil');
    expect(env.q('answer-masih_hamil').className).toContain('ppr-quiet');
    expect(await env.ctx.PregnancyReportPrompt.check()).toBe(false);
    expect(env.all().filter(n => n.getAttribute('data-ppr') === 'card')).toHaveLength(1);
});

test('birth form: date limits come from hpht and today; place, method and weights are required', async () => {
    const env = await openPrompt(setup());
    env.q('answer-lahir_sehat').click();
    expect(env.q('ended_on').type).toBe('date');
    expect(env.q('ended_on').getAttribute('min')).toBe('2026-01-10');
    expect(env.q('ended_on').getAttribute('max')).toBe('2026-11-22');
    expect(env.q('place').getAttribute('maxlength')).toBe('120');

    env.q('next').click();
    expect(env.q('error').textContent).toBe('Tempat lahir wajib diisi.');
    env.q('place').value = 'RSIA Melinda';
    env.q('next').click();
    expect(env.q('error').textContent).toBe('Tanggal lahir wajib diisi.');
    env.q('ended_on').value = '2026-11-23';
    env.q('next').click();
    expect(env.q('error').textContent).toBe('Tanggal tidak boleh setelah hari ini.');
    env.q('ended_on').value = '2026-01-01';
    env.q('next').click();
    expect(env.q('error').textContent).toBe('Tanggal tidak boleh sebelum HPHT.');
    env.q('ended_on').value = '2026-11-01';
    env.q('next').click();
    expect(env.q('error').textContent).toBe('Pilih cara lahir.');
    env.q('delivery-normal').click();
    expect(env.q('delivery-normal').getAttribute('aria-pressed')).toBe('true');
    // one baby by default
    expect(env.q('weight-0')).not.toBeNull();
    expect(env.q('weight-1')).toBeNull();
    env.q('next').click();
    expect(env.q('error').textContent).toBe('Berat bayi 1 harus 500–6000 gram.');
    env.q('weight-0').value = '3100.5';
    env.q('next').click();
    expect(env.q('error').textContent).toBe('Berat bayi 1 harus 500–6000 gram.');
    env.q('count-3').click();
    expect(env.q('weight-0').value).toBe('3100.5');
    expect(env.q('weight-2')).not.toBeNull();
    env.q('count-1').click();
    expect(env.q('weight-1')).toBeNull();
    env.q('weight-0').value = '3100';
    env.q('next').click();
    expect(env.q('summary')).not.toBeNull();
    expect(env.fetch).toHaveBeenCalledTimes(1); // only the status call so far
});

test('birth summary is read-only, "Ubah" keeps values, only "Ya, benar" posts the exact body', async () => {
    const env = await openPrompt(setup());
    fillBirth(env, { place: '<b>RS</b>' });
    env.q('next').click();
    const summary = env.q('summary').textContent;
    expect(summary).toContain('Lahir sehat');
    expect(summary).toContain('<b>RS</b>');
    expect(summary).toContain('1 November 2026');
    expect(summary).toContain('SC');
    expect(summary).toContain('3100 gram');
    expect(summary).toContain('2900 gram');
    expect(env.all().some(n => n.tagName === 'INPUT')).toBe(false);

    env.q('edit').click();
    expect(env.q('place').value).toBe('<b>RS</b>');
    expect(env.q('weight-1').value).toBe('2900');
    env.q('next').click();

    env.respondPost(200, { success: true, message: 'Terima kasih, data sudah tersimpan.' });
    env.q('confirm').click();
    await env.flush();
    const [url, options] = env.fetch.mock.calls[1];
    expect(url).toMatch(/^\/api\/patient\/pregnancy-report\?_t=\d+$/);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer patient-token');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['Cache-Control']).toBe('no-cache');
    expect(JSON.parse(options.body)).toEqual({
        answer: 'lahir_sehat', ended_on: '2026-11-01', place: '<b>RS</b>', delivery: 'sc',
        babies: [{ weight_g: 3100 }, { weight_g: 2900 }]
    });
    expect(env.q('done').textContent).toContain('Terima kasih');
    env.q('close').click();
    expect(env.body.children).toHaveLength(0);
    expect(env.ctx.location.reload).toHaveBeenCalledTimes(1);
});

test.each([
    ['keguguran', 'Keguguran'],
    ['ektopik', 'Hamil di luar kandungan']
])('loss %s: date required, place optional, gentle close that never names the loss', async (answer, label) => {
    const env = await openPrompt(setup());
    env.q('answer-' + answer).click();
    expect(env.q('weight-0')).toBeNull();
    expect(env.q('delivery-normal')).toBeNull();
    env.q('next').click();
    expect(env.q('error').textContent).toBe('Tanggal wajib diisi.');
    env.q('ended_on').value = '2026-03-05';
    env.q('next').click();
    expect(env.q('summary').textContent).toContain(label);

    env.respondPost(200, { success: true, message: 'Terima kasih, data sudah tersimpan.' });
    env.q('confirm').click();
    await env.flush();
    expect(JSON.parse(env.fetch.mock.calls[1][1].body)).toEqual({ answer, ended_on: '2026-03-05', place: null });
    const after = env.text();
    expect(after).toContain('Terima kasih sudah memberi tahu kami. Semoga Ibu diberi kekuatan.');
    for (const word of [/keguguran/i, /luar kandungan/i, /ektopik/i, /abortus/i, /lahir mati/i, /selamat/i]) {
        expect(after).not.toMatch(word);
    }
    env.q('close').click();
    expect(env.ctx.location.reload).toHaveBeenCalledTimes(1);
});

test('"Masih hamil" posts immediately, thanks briefly and closes without reload', async () => {
    const env = await openPrompt(setup());
    env.respondPost(200, { success: true, message: 'Terima kasih, data sudah tersimpan.' });
    env.q('answer-masih_hamil').click();
    await env.flush();
    expect(JSON.parse(env.fetch.mock.calls[1][1].body)).toEqual({ answer: 'masih_hamil' });
    expect(env.q('done').textContent).toContain('Terima kasih');
    env.q('close').click();
    expect(env.body.children).toHaveLength(0);
    expect(env.ctx.location.reload).not.toHaveBeenCalled();
});

test('400 shows the server message in the form step; 409 closes and reloads', async () => {
    const env = await openPrompt(setup());
    env.q('answer-keguguran').click();
    env.q('ended_on').value = '2026-03-05';
    env.q('next').click();
    env.respondPost(400, { success: false, message: 'Tanggal tidak valid.' });
    env.q('confirm').click();
    await env.flush();
    expect(env.q('error').textContent).toBe('Tanggal tidak valid.');
    expect(env.q('ended_on').value).toBe('2026-03-05');

    env.q('next').click();
    env.respondPost(409, { success: false, message: 'Data kehamilan sudah berubah. Muat ulang halaman.' });
    env.q('confirm').click();
    await env.flush();
    expect(env.body.children).toHaveLength(0);
    expect(env.ctx.location.reload).toHaveBeenCalledTimes(1);
});

test('children is not an array in the fake DOM (HTMLCollection has no forEach)', () => {
    const parent = new FakeElement('div');
    parent.appendChild(new FakeElement('span'));
    expect(parent.children.length).toBe(1);
    expect(parent.children.forEach).toBeUndefined();
    expect(parent.children.map).toBeUndefined();
});

test('open locks scrolling; a throw during render removes the overlay and restores overflow', async () => {
    const env = await openPrompt(setup());
    expect(env.body.style.overflow).toBe('hidden');
    env.respondPost(200, { success: true });
    env.q('answer-masih_hamil').click();
    await env.flush();
    env.q('close').click();
    expect(env.body.style.overflow).toBe('auto');

    const broken = setup();
    broken.failTags.push('h2');
    expect(await broken.ctx.PregnancyReportPrompt.check()).toBe(false);
    expect(broken.body.children).toHaveLength(0);
    expect(broken.body.style.overflow).toBe('auto');
    broken.failTags.length = 0;
    expect(await broken.ctx.PregnancyReportPrompt.check()).toBe(true);
});

test('script has no vh units and no innerHTML; both pages include it and call check()', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    expect(source).not.toMatch(/\d\s*vh\b/);
    expect(source).not.toMatch(/innerHTML|insertAdjacentHTML/);
    const menu = fs.readFileSync(path.join(repoRoot, 'public/patient-menu.html'), 'utf8');
    const album = fs.readFileSync(path.join(repoRoot, 'public/album-usg.html'), 'utf8');
    const shell = fs.readFileSync(path.join(repoRoot, 'public/scripts/patient-menu-shell.js'), 'utf8');
    expect(menu).toMatch(/<script src="\/scripts\/pregnancy-report-prompt\.js\?v=[^"]+"><\/script>/);
    expect(album).toMatch(/<script src="\/scripts\/pregnancy-report-prompt\.js\?v=[^"]+"><\/script>/);
    expect(album).toContain('window.PregnancyReportPrompt?.check()');
    expect(shell).toMatch(/if \(!pendingBirth\) window\.PregnancyReportPrompt\?\.check\(\);/);
    for (const page of [menu, album]) {
        expect(page).toMatch(/maximum-scale=1\.0, user-scalable=no/);
    }
});
