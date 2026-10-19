const fs = require('fs');
const path = require('path');
const vm = require('vm');

const publicRoot = path.resolve(__dirname, '../../../public');
const html = fs.readFileSync(path.join(publicRoot, 'index-adminlte.html'), 'utf8');
const script = fs.readFileSync(path.join(publicRoot, 'scripts/legacy/patient-tools.js'), 'utf8');
const searchSource = script.slice(script.indexOf('    // Advanced Search Functions'), script.indexOf('    window.deletePatient ='));

function fixture(values = {}) {
    const fields = {};
    const listeners = {};
    for (const [, id] of html.matchAll(/<input\b[^>]*\bid="(adv-search-[^"]+)"/g)) {
        fields[id] = { value: values[id] || '', validationMessage: '',
            addEventListener(type, handler) { listeners[`${id}:${type}`] = handler; },
            setCustomValidity(message) { this.validationMessage = message; }
        };
    }
    const form = { addEventListener(type, handler) { listeners[`form:${type}`] = handler; },
        checkValidity: () => !Object.values(fields).some(field => field.validationMessage), reportValidity: jest.fn() };
    const tbody = { innerHTML: 'existing results' };
    const dateError = { textContent: '', hidden: true };
    const fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, data: [], total: 0 }) }));
    const loadWebPatients = jest.fn();
    const $ = () => ({ DataTable: jest.fn() });
    $.fn = { DataTable: { isDataTable: () => false } };
    const context = {
        window: { getAuthToken: () => 'fixture-token' }, URLSearchParams, setTimeout, clearTimeout, console, fetch, $,
        onPatientToolsReady: handler => handler(), loadWebPatients,
        clearBulkDeletePatientSelection: jest.fn(),
        document: { getElementById: id => id === 'advanced-search-form' ? form : id === 'manage-patients-tbody' ? tbody : id === 'adv-search-date-error' ? dateError : fields[id] || null }
    };
    vm.runInNewContext(searchSource, context);
    return { ...context, fields, form, tbody, dateError, listeners, fire: (id, type) => listeners[`${id}:${type}`]?.call(fields[id]) };
}

afterEach(() => { jest.useRealTimers(); });

test('the search form exposes the five requested filters with two date bounds', () => {
    const f = fixture();
    expect(Object.keys(f.fields)).toEqual(['adv-search-name', 'adv-search-drd', 'adv-search-email', 'adv-search-phone', 'adv-search-visit-date-from', 'adv-search-visit-date-to']);
});

test('DRD and examination dates are sent with the four text filters, without patient ID', async () => {
    const f = fixture({ 'adv-search-name': ' Ani ', 'adv-search-drd': ' DRD001 ', 'adv-search-email': 'ani@', 'adv-search-phone': '0812',
        'adv-search-visit-date-from': '2026-10-02', 'adv-search-visit-date-to': '2026-10-19' });
    await f.window.performAdvancedSearch();
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const params = new URL(f.fetch.mock.calls[0][0], 'https://example.test').searchParams;
    expect(Object.fromEntries(params)).toEqual({ name: 'Ani', mr_id: 'DRD001', email: 'ani@', phone: '0812', visit_date_from: '2026-10-02', visit_date_to: '2026-10-19', limit: '100' });
});

test('reversed dates preserve the current results and report validation without a request', async () => {
    const f = fixture({ 'adv-search-visit-date-from': '2026-10-20', 'adv-search-visit-date-to': '2026-10-19' });
    await f.window.performAdvancedSearch();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.dateError.hidden).toBe(false);
    expect(f.dateError.textContent).toContain('Tanggal');
    expect(f.tbody.innerHTML).toBe('existing results');
});

test('date changes search automatically and reset cancels pending work and clears all fields', async () => {
    jest.useFakeTimers();
    const f = fixture({ 'adv-search-visit-date-from': '2026-10-02', 'adv-search-visit-date-to': '2026-10-19' });
    f.fire('adv-search-visit-date-to', 'change');
    await jest.advanceTimersByTimeAsync(500);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    f.fields['adv-search-name'].value = 'Ani';
    f.fire('adv-search-name', 'input');
    f.window.resetAdvancedSearch();
    await jest.advanceTimersByTimeAsync(500);
    expect(Object.values(f.fields).every(field => field.value === '')).toBe(true);
    expect(f.loadWebPatients).toHaveBeenCalledTimes(1);
    expect(f.fetch).toHaveBeenCalledTimes(1);
});

test('a search response finishing after Reset cannot overwrite the restored list', async () => {
    const f = fixture({ 'adv-search-name': 'Ani' });
    let finish;
    f.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.window.performAdvancedSearch();
    f.window.resetAdvancedSearch();
    f.tbody.innerHTML = 'restored list';
    finish({ ok: true, json: async () => ({ data: [], total: 0 }) });
    await pending;
    expect(f.tbody.innerHTML).toBe('restored list');
});

test('correcting a reversed date clears the range error without leaving native or display validity stuck', async () => {
    jest.useFakeTimers();
    const f = fixture({ 'adv-search-visit-date-from': '2026-10-20', 'adv-search-visit-date-to': '2026-10-19' });
    await f.window.performAdvancedSearch();
    expect(f.dateError.hidden).toBe(false);
    expect(f.form.checkValidity()).toBe(true);
    f.fields['adv-search-visit-date-from'].value = '2026-10-02';
    f.fire('adv-search-visit-date-from', 'input');
    expect(f.dateError.hidden).toBe(true);
    expect(f.form.checkValidity()).toBe(true);
});

test('malformed visible date input remains invalid without replacing the current list', async () => {
    const f = fixture({ 'adv-search-visit-date-from': '2026-10-02' });
    f.form.checkValidity = () => false;
    await f.window.performAdvancedSearch();
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.form.reportValidity).toHaveBeenCalled();
    expect(f.tbody.innerHTML).toBe('existing results');
});
