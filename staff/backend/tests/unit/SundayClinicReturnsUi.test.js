const fs = require('fs');
const path = require('path');
const vm = require('vm');

function context() {
    const elements = new Map();
    const node = id => {
        if (!elements.has(id)) elements.set(id, { value: '', hidden: false, disabled: false, listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; } });
        return elements.get(id);
    };
    const store = new Map();
    const ctx = vm.createContext({
        window: { hasAccountPermission: () => true, getToken: () => 'fake', showSuccess: jest.fn(), handleSectionChange: jest.fn() },
        document: { getElementById: node }, sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
        crypto: { randomUUID: () => 'return-request-fixed-key' },
        fetch: jest.fn(), DibyaDateTime: { dateTime: () => '25/10/2026' }, console, setTimeout,
        isSuperadminUser: () => true
    });
    const source = fs.readFileSync(path.join(__dirname, '../../../public/scripts/sunday-clinic/components/shared/billing.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export default {', 'globalThis.billingComponent = {');
    vm.runInContext(source, ctx);
    return { ctx, node, store };
}
const data = { invoices: [{ additional_billing_id: null, reference_number: 'QA001', total: 100000, returned_total: 30000,
    items: [{ id: 7, item_name: '<Obat>', quantity: 10, remaining_quantity: 7, total: 100000 }] }],
returns: [{ id: 1, mr_id: 'QA001', kind: 'obat', item_name: '<Obat>', quantity: 3, amount: 30000, reason: '<script>x</script>', actor_name: 'Petugas', created_at: '2026-10-25', accounting_date: '2026-10-25', payment_method: 'cash' }],
paid_total: 100000, return_total: 30000, net_total: 70000, today: '2026-10-28' };

test('renders separate negative returns and net received, escapes names and reasons', () => {
    const { ctx } = context();
    const html = ctx.renderBillingReturns(data);
    expect(html).toContain('−Rp 30.000');
    expect(html).toContain('Rp 70.000');
    expect(html).toContain('&lt;Obat&gt;');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('btn-create-billing-return');
    ctx.window.hasAccountPermission = () => false;
    expect(ctx.renderBillingReturns(data)).not.toContain('btn-create-billing-return');
});

test('uncertain save retains the same request across network errors and expired authentication', async () => {
    const { ctx, node, store } = context();
    node('billing-return-invoice').value = '0';
    node('billing-return-kind').value = 'money';
    ctx.bindBillingReturns(data, 'QA001');
    node('billing-return-amount').value = '10000';
    node('billing-return-reason').value = 'Dikembalikan';
    node('billing-return-method').value = 'cash';
    node('billing-return-date').value = '2026-10-25';
    const submit = node('billing-return-form').listeners.submit;
    ctx.fetch.mockRejectedValueOnce(new Error('Connection lost'));
    ctx.fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ success: false, message: 'Login ulang' }) });
    ctx.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { already_saved: true } }) });
    await submit({ preventDefault() {} });
    expect(store.size).toBe(1);
    await submit({ preventDefault() {} });
    expect(store.size).toBe(1);
    expect(node('billing-return-fields').disabled).toBe(true);
    await submit({ preventDefault() {} });
    expect(store.size).toBe(0);
    const bodies = ctx.fetch.mock.calls.map(([, options]) => options.body);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]).accounting_date).toBe('2026-10-25');
    expect(ctx.window.handleSectionChange).toHaveBeenCalled();
});

test('authoritative validation rejection permits correction without recording a return', async () => {
    const { ctx, node, store } = context();
    node('billing-return-invoice').value = '0';
    node('billing-return-kind').value = 'money';
    ctx.bindBillingReturns(data, 'QA001');
    ctx.fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ success: false, code: 'INVALID_BILLING_RETURN', message: 'Melebihi nilai dibayar' }) });
    await node('billing-return-form').listeners.submit({ preventDefault() {} });
    expect(store.size).toBe(0);
    expect(node('billing-return-fields').disabled).toBe(false);
    expect(node('billing-return-error').textContent).toContain('Melebihi');
});

test('return form offers a date defaulting to today, capped at today, and shows the booked date', () => {
    const { ctx } = context();
    const html = ctx.renderBillingReturns(data);
    expect(html).toMatch(/id="billing-return-date" type="date"[^>]*value="2026-10-28" max="2026-10-28"/);
    expect(html).toContain('Dibukukan 25-10-2026');
});

test('a closed return date can be corrected instead of locking the form', async () => {
    const { ctx, node, store } = context();
    node('billing-return-invoice').value = '0';
    node('billing-return-kind').value = 'money';
    ctx.bindBillingReturns(data, 'QA001');
    ctx.fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ success: false, code: 'SUNDAY_CLINIC_CLOSED', message: 'Sudah di-closing' }) });
    await node('billing-return-form').listeners.submit({ preventDefault() {} });
    expect(store.size).toBe(0);
    expect(node('billing-return-fields').disabled).toBe(false);
});
