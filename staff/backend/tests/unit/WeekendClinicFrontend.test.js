const fs = require('fs');
const path = require('path');
const vm = require('vm');
function element() {
    const classes = new Set(['d-none']);
    return { textContent: '', innerHTML: '', children: [], listeners: {},
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        appendChild(child) { this.children.push(child); }
    };
}
function harness(failedSession) {
    const nodes = {};
    for (const prefix of ['klinik-private', 'weekend-clinic']) {
        for (const suffix of ['date-label', 'count', 'refresh-btn', 'loading', 'table-wrapper', 'tbody', 'empty', 'error']) nodes[`${prefix}-${suffix}`] = element();
    }
    const events = {};
    const window = { getAuthToken: () => 'staff', location: {}, socket: { on: (name, fn) => { events[name] = fn; } } };
    const document = { getElementById: id => nodes[id] || null, createElement: () => element(), body: { insertAdjacentHTML: jest.fn() } };
    const fetch = jest.fn(async url => {
        if (url.includes('practice-dates')) return { ok: true, json: async () => ({ practices: [
            { session: 2, dayOfWeek: 6, date: '2026-10-10', formatted: 'Sabtu, 10 Oktober 2026' },
            { session: 1, dayOfWeek: 0, date: '2026-10-11', formatted: 'Minggu, 11 Oktober 2026' }
        ] }) };
        const session = new URL(url, 'https://example.test').searchParams.get('session');
        if (session === String(failedSession)) throw new Error('Daftar gagal');
        return { ok: true, json: async () => ({ appointments: [
            { id: Number(session) * 100 + 2, patient_id: 'synthetic', patient_name: `Simulasi ${session}`, session: Number(session), slot_number: 2, status: 'pending_confirmation' },
            { id: Number(session) * 100 + 1, patient_id: 'synthetic', patient_name: `Simulasi ${session}`, session: Number(session), slot_number: 1, status: 'confirmed' }
        ] }) };
    });
    const context = vm.createContext({ window, document, fetch, console: { error: jest.fn(), warn: jest.fn() }, Date, URL, confirm: () => false });
    const code = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/klinik-private.js'), 'utf8').replace('export function initKlinikPrivatePage', 'function initKlinikPrivatePage');
    vm.runInContext(code, context);
    return { nodes, window, events, fetch, context, document };
}
describe('two private clinic lists', () => {
    test('loads both date/session pairs and maps actions to appointment IDs, not row positions', async () => {
        const h = harness();
        await h.window.klinikPrivate.reload();
        expect(h.fetch.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining([
            expect.stringContaining('date=2026-10-10&session=2'), expect.stringContaining('date=2026-10-11&session=1')
        ]));
        expect(h.nodes['weekend-clinic-count'].textContent).toBe('2 Pasien');
        expect(h.nodes['klinik-private-count'].textContent).toBe('2 Pasien');
        expect(h.nodes['weekend-clinic-tbody'].children[0].innerHTML).toContain('handleKlinikPeriksa(201)');
        expect(h.nodes['klinik-private-tbody'].children[0].innerHTML).toContain('handleKlinikPeriksa(101)');
        h.context.$ = () => ({ modal: jest.fn(), on: jest.fn() });
        h.document.querySelector = () => ({ value: 'obstetri' });
        h.document.getElementById = id => id === 'btn-start-with-category' ? element() : h.nodes[id] || null;
        h.window.handleKlinikPeriksa(201);
        expect(h.document.body.insertAdjacentHTML).toHaveBeenCalledWith('beforeend', expect.stringContaining('Simulasi 2'));
        expect(h.nodes['weekend-clinic-error'].classList.contains('d-none')).toBe(true);
    });
    test('one failed list leaves the other visible', async () => {
        const h = harness(2);
        await h.window.klinikPrivate.reload();
        expect(h.nodes['weekend-clinic-error'].classList.contains('d-none')).toBe(false);
        expect(h.nodes['klinik-private-table-wrapper'].classList.contains('d-none')).toBe(false);
        expect(h.nodes['weekend-clinic-loading'].classList.contains('d-none')).toBe(true);
    });
    test('booking realtime refreshes both lists', async () => {
        const h = harness();
        vm.runInContext('setupRealtimeUpdates()', h.context);
        await h.events['booking:update']();
        expect(h.fetch.mock.calls.filter(c => c[0].includes('/list?'))).toHaveLength(2);
    });
    test('empty Saturday stays visible alongside populated Sunday', async () => {
        const h = harness();
        const original = h.fetch.getMockImplementation();
        h.fetch.mockImplementation(async url => url.includes('session=2')
            ? { ok: true, json: async () => ({ appointments: [] }) } : original(url));
        await h.window.klinikPrivate.reload();
        expect(h.nodes['weekend-clinic-count'].textContent).toBe('0 Pasien');
        expect(h.nodes['weekend-clinic-empty'].classList.contains('d-none')).toBe(false);
        expect(h.nodes['klinik-private-count'].textContent).toBe('2 Pasien');
    });
    test('confirmation uses the Saturday appointment ID even when Sunday finishes loading', async () => {
        const h = harness();
        await h.window.klinikPrivate.reload();
        h.context.confirm = jest.fn(() => true);
        h.window.showToast = jest.fn();
        const original = h.fetch.getMockImplementation();
        h.fetch.mockImplementation(async (url, options) => options?.method === 'POST'
            ? { ok: true, json: async () => ({ success: true }) } : original(url));
        await h.window.handleKlinikConfirmationPopup(202);
        expect(h.context.confirm).toHaveBeenCalledWith(expect.stringContaining('Simulasi 2'));
        expect(h.fetch).toHaveBeenCalledWith('/api/sunday-appointments/202/trigger-confirmation-popup', expect.objectContaining({ method: 'POST' }));
    });
    test('a stale date response cannot overwrite a newer refresh', async () => {
        const h = harness();
        const original = h.fetch.getMockImplementation();
        let release;
        h.fetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        const old = h.window.klinikPrivate.reload();
        await h.window.klinikPrivate.reload();
        release(await original('/practice-dates'));
        await old;
        expect(h.fetch.mock.calls.filter(c => c[0].includes('/list?'))).toHaveLength(2);
        expect(h.nodes['weekend-clinic-count'].textContent).toBe('2 Pasien');
    });
});
