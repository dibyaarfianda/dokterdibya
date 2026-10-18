const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scripts = path.resolve(__dirname, '../../../public/scripts');
const read = name => fs.readFileSync(path.join(scripts, name), 'utf8');

function fixture() {
    const fields = new Map();
    const field = (id, value, initial = value) => {
        const input = { id, value: String(value), defaultValue: String(initial), focus: jest.fn() };
        fields.set(id, input);
        return input;
    };
    field('planning-datetime', '2026-10-18T10:00');
    field('planning-tindakan', 'Tindakan manual');
    field('planning-terapi', 'Terapi manual');
    field('planning-rencana', 'Rencana manual');
    const rows = [11, 12].map(id => {
        field(`terapi-quantity-${id}`, id === 11 ? '20' : '30', '10');
        field(`terapi-cara-pakai-${id}`, id === 11 ? '2x1' : '', '1x1');
        return { dataset: { itemId: String(id) } };
    });
    const container = { querySelectorAll: () => rows };
    const tindakanContainer = { innerHTML: 'old' };
    const document = { getElementById: id => id === 'terapi-items-container' ? container :
        id === 'tindakan-items-container' ? tindakanContainer : fields.get(id),
        querySelectorAll: () => [] };
    const billing = { status: 'draft', billing_data: { notes: 'Tetap' }, items: [
        { id: 11, item_type: 'obat', item_code: 'QA1', item_name: 'Fixture A', quantity: 10,
            item_data: { obatId: 1, unit: 'tablet', caraPakai: '1x1', latinSig: 's.d.d. I', note: 'Tetap' } },
        { id: 12, item_type: 'obat', item_code: 'QA2', item_name: 'Fixture B', quantity: 10,
            item_data: { obatId: 2, unit: 'kapsul', caraPakai: '1x1', latinSig: 's.d.d. I' } },
        { id: 13, item_type: 'tindakan', item_code: 'QA3', item_name: 'Fixture tindakan', quantity: 1, item_data: {} }
    ] };
    const writes = [];
    const fetch = jest.fn(async (url, options = {}) => {
        if (options.method === 'POST') {
            const body = JSON.parse(options.body);
            writes.push({ url, body });
            billing.items = body.items.map((item, index) => ({ ...item, id: 21 + index }));
        }
        return { ok: true, json: async () => ({ success: true, data: billing }) };
    });
    const state = { currentMrId: 'TEST001', activeSection: 'plan' };
    const stateManager = { getState: () => state };
    const window = { routeMrSlug: 'TEST001', getToken: () => 'fixture', stateManager,
        showToast: jest.fn() };
    const context = { window, document, fetch, console, setTimeout, clearTimeout, stateManager,
        SECTIONS: { IDENTITY: 'identity' } };
    vm.createContext(context);
    vm.runInContext(read('prescription-sig.js'), context);
    vm.runInContext(read('sunday-clinic/utils/planning-helpers.js'), context);
    // Network and rendering are external boundaries; exercise the real collection/merge/save code.
    context.renderTerapiItemsList = jest.fn(async () => true);
    context.renderTindakanItemsList = jest.fn(async () => true);
    const main = read('sunday-clinic/main.js');
    const classSource = main.slice(main.indexOf('class SundayClinicApp {'), main.indexOf('// Export singleton instance'));
    context.apiClient = { saveSection: jest.fn(async (mrId, section, data) => {
        writes.push({ mrId, section, data });
        return { success: true };
    }) };
    vm.runInContext(`${classSource}\nglobalThis.TestApp = SundayClinicApp;`, context);
    const app = new context.TestApp();
    app.requireAccountPermission = jest.fn(async () => true);
    for (const name of ['showLoading', 'hideLoading', 'showSuccess', 'showError', 'scheduleMetadataRefresh']) app[name] = jest.fn();
    return { app, context, window, fields, rows, billing, writes, fetch, container, tindakanContainer };
}

test('one Planning save persists every edited prescription before the manual Planning text', async () => {
    const f = fixture();
    expect(await f.app.savePlanningObstetri()).toBe(true);
    expect(f.writes).toHaveLength(2);
    expect(f.writes[0]).toMatchObject({ url: '/api/sunday-clinic/billing/TEST001', body: {
        billingData: { notes: 'Tetap' }, items: [
            { item_type: 'obat', quantity: 20, item_data: { obatId: 1, unit: 'tablet', caraPakai: '2x1', note: 'Tetap' } },
            { item_type: 'obat', quantity: 30, item_data: { obatId: 2, unit: 'kapsul', caraPakai: '', latinSig: '' } },
            { item_type: 'tindakan', item_code: 'QA3', quantity: 1, item_data: {} }
        ] } });
    expect(f.writes[0].body.items[0].item_data.latinSig).not.toBe('s.d.d. I');
    expect(f.writes[1]).toMatchObject({ mrId: 'TEST001', section: 'planning', data: {
        tindakan: 'Tindakan manual', terapi: 'Terapi manual', rencana: 'Rencana manual' } });
    expect(f.app.showSuccess).toHaveBeenCalledTimes(1);
});

test.each(['', '0', '1.5', '1001', '12x'])('invalid quantity %j blocks all writes and preserves draft', async value => {
    const f = fixture();
    f.fields.get('terapi-quantity-12').value = value;
    expect(await f.app.savePlanningObstetri()).toBe(false);
    expect(f.writes).toEqual([]);
    expect(f.app.showSuccess).not.toHaveBeenCalled();
    expect(f.fields.get('terapi-quantity-12').value).toBe(value);
});

test('unchanged prescriptions do not rewrite billing', async () => {
    const f = fixture();
    for (const [id, input] of f.fields) if (id.startsWith('terapi-')) input.value = input.defaultValue;
    expect(await f.app.savePlanningObstetri()).toBe(true);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].section).toBe('planning');
});

test('billing failure prevents Planning success and keeps every edit', async () => {
    const f = fixture();
    f.fetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'Fixture unavailable' }) });
    expect(await f.app.savePlanningObstetri()).toBe(false);
    expect(f.writes).toEqual([]);
    expect(f.app.showError).toHaveBeenCalled();
    expect(f.fields.get('terapi-quantity-11').value).toBe('20');
});

test('a removed medication blocks the stale save instead of recreating it', async () => {
    const f = fixture();
    f.billing.items = f.billing.items.filter(item => item.id !== 12);
    expect(await f.app.savePlanningObstetri()).toBe(false);
    expect(f.writes).toEqual([]);
});

test('unchanged fields retain the latest billing values from another editor', async () => {
    const f = fixture();
    f.fields.get('terapi-cara-pakai-11').value = '1x1';
    f.billing.items[0].item_data.caraPakai = '3x1';
    f.billing.items[0].item_data.latinSig = 't.d.d. I';
    expect(await f.app.savePlanningObstetri()).toBe(true);
    expect(f.writes[0].body.items[0]).toMatchObject({ quantity: 20, item_data: { caraPakai: '3x1', latinSig: 't.d.d. I' } });
});

test('visit changes during the billing read cannot send edits to either visit', async () => {
    const f = fixture();
    f.fetch.mockImplementation(async () => {
        f.window.routeMrSlug = 'TEST002';
        return { ok: true, json: async () => ({ success: true, data: f.billing }) };
    });
    expect(await f.app.savePlanningObstetri()).toBe(false);
    expect(f.writes).toEqual([]);
});

test('billing save rejection cannot save Planning or show success', async () => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: f.billing }) })
        .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, message: 'Fixture save rejected' }) });
    expect(await f.app.savePlanningObstetri()).toBe(false);
    expect(f.writes).toEqual([]);
    expect(f.app.showError).toHaveBeenCalledWith('Fixture save rejected');
    expect(f.app.showSuccess).not.toHaveBeenCalled();
});

test('a newly locked billing cannot be rewritten by stale editable rows', async () => {
    const f = fixture();
    f.billing.status = 'paid';
    expect(await f.app.savePlanningObstetri()).toBe(false);
    expect(f.writes).toEqual([]);
});

test('repeated clicks while a billing read is pending submit only one batch', async () => {
    const f = fixture();
    let finishRead;
    f.fetch.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
    const first = f.app.savePlanningObstetri();
    // Permission check and token retrieval each yield once.
    await Promise.resolve();
    await Promise.resolve();
    expect(await f.app.savePlanningObstetri()).toBe(false);
    finishRead({ ok: true, json: async () => ({ success: true, data: f.billing }) });
    expect(await first).toBe(true);
    expect(f.writes).toHaveLength(2);
});

test('batch save refreshes both medicine and procedure controls with the new item IDs', async () => {
    const f = fixture();
    f.context.renderTerapiItemsList = f.window.renderTerapiItemsList;
    f.context.renderTindakanItemsList = f.window.renderTindakanItemsList;
    expect(await f.app.savePlanningObstetri()).toBe(true);
    expect(f.container.innerHTML).toContain('terapi-quantity-21');
    expect(f.tindakanContainer.innerHTML).toContain('deleteIndividualTindakan(23,');
    expect(f.tindakanContainer.innerHTML).not.toContain('deleteIndividualTindakan(13,');
});

test('readback failure after acceptance does not falsely mark Planning saved', async () => {
    const f = fixture();
    const actualFetch = f.fetch.getMockImplementation();
    f.fetch.mockImplementation(async (url, options = {}) => {
        if (f.writes.length && options.method !== 'POST') {
            return { ok: false, json: async () => ({ success: false }) };
        }
        return actualFetch(url, options);
    });
    expect(await f.app.savePlanningObstetri()).toBe(false);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0].url).toBe('/api/sunday-clinic/billing/TEST001');
    expect(f.app.showSuccess).not.toHaveBeenCalled();
});
