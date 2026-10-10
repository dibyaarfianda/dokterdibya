const fs = require('fs');
const path = require('path');
const vm = require('vm');
function element() {
    const classes = new Set(['d-none']);
    return { id: '', textContent: '', innerHTML: '', children: [], listeners: {}, parentNode: null,
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        appendChild(child) {
            const existingIndex = this.children.indexOf(child);
            if (existingIndex >= 0) this.children.splice(existingIndex, 1);
            this.children.push(child);
            child.parentNode = this;
        }
    };
}
function harness(failedSession, options = {}) {
    const nodes = {};
    for (const prefix of ['klinik-private', 'weekend-clinic']) {
        for (const suffix of ['date-label', 'count', 'refresh-btn', 'loading', 'table-wrapper', 'tbody', 'empty', 'error', 'card-row']) {
            const node = element();
            node.id = `${prefix}-${suffix}`;
            nodes[node.id] = node;
        }
    }
    const cardContainer = element();
    cardContainer.id = 'klinik-private-card-container';
    nodes['weekend-clinic-card-row'].classList.remove('d-none');
    nodes['klinik-private-card-row'].classList.remove('d-none');
    cardContainer.appendChild(nodes['weekend-clinic-card-row']);
    cardContainer.appendChild(nodes['klinik-private-card-row']);
    const events = {};
    const window = { getAuthToken: () => 'staff', location: {}, socket: { on: (name, fn) => { events[name] = fn; } } };
    const document = { getElementById: id => nodes[id] || null, createElement: () => element(), body: { insertAdjacentHTML: jest.fn() } };
    const fetch = jest.fn(async url => {
        if (url.includes('practice-dates')) return { ok: true, json: async () => ({ practices: options.practices || [
            { session: 2, dayOfWeek: 6, date: '2026-10-10', formatted: 'Sabtu, 10 Oktober 2026' },
            { session: 1, dayOfWeek: 0, date: '2026-10-11', formatted: 'Minggu, 11 Oktober 2026' }
        ] }) };
        const session = new URL(url, 'https://example.test').searchParams.get('session');
        if (session === String(failedSession)) throw new Error('Daftar gagal');
        const configuredAppointments = options.appointmentsBySession?.[session];
        return { ok: true, json: async () => ({ appointments: configuredAppointments !== undefined
            ? configuredAppointments
            : [
                { id: Number(session) * 100 + 2, patient_id: 'synthetic', patient_name: `Simulasi ${session}`, session: Number(session), slot_number: 2, status: 'pending_confirmation' },
                { id: Number(session) * 100 + 1, patient_id: 'synthetic', patient_name: `Simulasi ${session}`, session: Number(session), slot_number: 1, status: 'confirmed' }
            ] }) };
    });
    const context = vm.createContext({ window, document, fetch, console: { error: jest.fn(), warn: jest.fn() }, Date, URL, confirm: () => false });
    const code = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/klinik-private.js'), 'utf8').replace('export function initKlinikPrivatePage', 'function initKlinikPrivatePage');
    vm.runInContext(code, context);
    return { nodes, cardContainer, window, events, fetch, context, document };
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
    test('puts the upcoming Sunday first and keeps the later Saturday visible when registered', async () => {
        const h = harness(undefined, { practices: [
            { session: 1, dayOfWeek: 0, date: '2026-10-11', formatted: 'Minggu, 11 Oktober 2026' },
            { session: 2, dayOfWeek: 6, date: '2026-10-17', formatted: 'Sabtu, 17 Oktober 2026' }
        ] });

        await h.window.klinikPrivate.reload();

        expect(h.cardContainer.children.map(node => node.id)).toEqual([
            'klinik-private-card-row',
            'weekend-clinic-card-row'
        ]);
        expect(h.nodes['klinik-private-card-row'].classList.contains('d-none')).toBe(false);
        expect(h.nodes['weekend-clinic-card-row'].classList.contains('d-none')).toBe(false);
    });
    test('hides the later Saturday when it has no registrations', async () => {
        const h = harness(undefined, {
            practices: [
                { session: 1, dayOfWeek: 0, date: '2026-10-11', formatted: 'Minggu, 11 Oktober 2026' },
                { session: 2, dayOfWeek: 6, date: '2026-10-17', formatted: 'Sabtu, 17 Oktober 2026' }
            ],
            appointmentsBySession: { 2: [] }
        });

        await h.window.klinikPrivate.reload();

        expect(h.nodes['weekend-clinic-count'].textContent).toBe('0 Pasien');
        expect(h.nodes['weekend-clinic-card-row'].classList.contains('d-none')).toBe(true);
        expect(h.nodes['klinik-private-count'].textContent).toBe('2 Pasien');
    });
    test('keeps the upcoming clinic visible even when it has no registrations', async () => {
        const h = harness(undefined, { appointmentsBySession: { 2: [], 1: [] } });

        await h.window.klinikPrivate.reload();

        expect(h.cardContainer.children[0].id).toBe('weekend-clinic-card-row');
        expect(h.nodes['weekend-clinic-card-row'].classList.contains('d-none')).toBe(false);
        expect(h.nodes['klinik-private-card-row'].classList.contains('d-none')).toBe(true);
    });
    test('closing realtime advances and refreshes the clinic cards', async () => {
        const h = harness();
        vm.runInContext('setupRealtimeUpdates()', h.context);

        await h.events['sunday_clinic_closing_updated']();

        expect(h.fetch.mock.calls.filter(c => c[0].includes('practice-dates'))).toHaveLength(1);
        expect(h.fetch.mock.calls.filter(c => c[0].includes('/list?'))).toHaveLength(2);
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
