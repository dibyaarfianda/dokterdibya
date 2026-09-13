const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../../../..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function staffBillingContext({ status, role = 'dokter', additional = [], hasPendingPayment = false, id = 77 }) {
    const source = read('staff', 'public', 'scripts', 'sunday-clinic', 'components', 'shared', 'billing.js')
        .replace(/^import .*;\r?\n/gm, '')
        .replace('export default {', 'globalThis.billingComponent = {');
    const roleSource = read('staff', 'public', 'scripts', 'role-constants.js')
        .replace(/export /g, '');
    const context = vm.createContext({
        window: { getToken: () => 'staff-token', currentStaffIdentity: { role }, routeMrSlug: 'DRD123' },
        document: { getElementById: () => null },
        fetch: jest.fn(async url => ({ ok: true, json: async () => ({
            success: true,
            data: String(url).endsWith('/additional') ? additional : {
                id, status, has_pending_payment: hasPendingPayment, total: 180000,
                items: [{ id: 1, item_name: 'USG', item_type: 'tindakan', quantity: 1, price: 180000 }],
                cancellation_reason: 'Input ganda', cancelled_by_name: 'dr. Dibya', cancelled_at: '2026-09-13T10:00:00+07:00'
            }
        }) })),
        console, setTimeout,
    });
    vm.runInContext(`${roleSource}\nglobalThis.isSuperadminUser = isSuperadminUser;`, context);
    vm.runInContext(source, context);
    return context;
}

describe('whole unpaid invoice cancellation UI', () => {
    test('doctor sees cancel on unpaid invoice and cancelled invoice stays readable without payment or edit actions', async () => {
        const state = { recordData: { mrId: 'DRD123' }, patientData: { full_name: 'Pasien Uji' } };
        const draft = await staffBillingContext({ status: 'draft' }).billingComponent.renderObstetriFormat(state);
        expect(draft).toContain('btn-cancel-billing');
        const confirmed = await staffBillingContext({ status: 'confirmed' }).billingComponent.renderObstetriFormat(state);
        expect(confirmed).toContain('btn-cancel-billing');
        const pending = await staffBillingContext({ status: 'confirmed', hasPendingPayment: true }).billingComponent.renderObstetriFormat(state);
        expect(pending).not.toContain('btn-cancel-billing');
        const unsaved = await staffBillingContext({ status: 'draft', id: null }).billingComponent.renderObstetriFormat(state);
        expect(unsaved).not.toContain('btn-cancel-billing');

        const staff = await staffBillingContext({ status: 'cancelled' }).billingComponent.renderObstetriFormat(state);
        expect(staff).toContain('Dibatalkan');
        expect(staff).toContain('Input ganda');
        expect(staff).toContain('dr. Dibya');
        expect(staff).toContain('Rp 180.000');
        expect(staff).toContain('USG');
        expect(staff).toContain('btn-print-invoice');
        expect(staff).not.toContain('btn-mark-paid');
        expect(staff).not.toContain('btn-pay-online');
        expect(staff).not.toContain('btn-confirm-billing');
        expect(staff).not.toContain('delete-obat-btn');
        expect(staff).not.toContain('btn-cancel-billing');
    });

    test('non-doctor cannot see cancel and cancelled additional invoice retains original details without revision actions', async () => {
        const state = { recordData: { mrId: 'DRD123' }, patientData: { full_name: 'Pasien Uji' } };
        const nonDoctor = await staffBillingContext({ status: 'confirmed', role: 'admin' }).billingComponent.renderObstetriFormat(state);
        expect(nonDoctor).not.toContain('btn-cancel-billing');

        const additional = [{ id: 5, status: 'cancelled', reference_number: 'DRD123-T1', total: 25000,
            cancellation_reason: 'Tagihan ganda', cancelled_by_name: 'dr. Dibya', cancelled_at: '2026-09-13T10:00:00+07:00',
            items: [{ item_name: 'Buku', item_type: 'admin', quantity: 1 }] }];
        const paidMain = await staffBillingContext({ status: 'paid', additional }).billingComponent.renderObstetriFormat(state);
        expect(paidMain).toContain('DRD123-T1');
        expect(paidMain).toContain('Rp 25.000');
        expect(paidMain).toContain('Tagihan ganda');
        expect(paidMain).toContain('data-additional-billing-action="print-invoice"');
        expect(paidMain).not.toContain('data-additional-billing-action="edit"');
        expect(paidMain).not.toContain('data-additional-billing-action="mark-paid"');
        expect(paidMain).not.toContain('data-additional-billing-action="cancel"');

        const unpaidAdditional = [{ ...additional[0], status: 'confirmed' }];
        const doctorPaidMain = await staffBillingContext({ status: 'paid', additional: unpaidAdditional }).billingComponent.renderObstetriFormat(state);
        expect(doctorPaidMain).toContain('data-additional-billing-action="cancel"');
    });

    test('patient list and detail show cancelled invoice without payment controls', async () => {
        const html = read('public', 'patient-billing.html');
        const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
        const source = scripts.find(match => match[1].includes("const API_BASE = '/api/patient-billing'"))[1];
        const elements = new Map();
        const element = id => {
            if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', classList: { add() {}, remove() {} } });
            return elements.get(id);
        };
        const context = vm.createContext({
            window: { PatientSession: { getToken: () => 'patient-token' }, location: {} },
            document: { getElementById: element, querySelectorAll: () => [] },
            fetch: jest.fn(async url => ({ json: async () => ({ success: true, data: String(url).includes('my-bills')
                ? [{ id: 77, mr_id: 'DRD123', total: 180000, status: 'cancelled', created_at: '2026-09-13' }]
                : { billing: { id: 77, mr_id: 'DRD123', patient_name: 'Pasien Uji', total: 180000, status: 'cancelled', created_at: '2026-09-13', cancellation_reason: 'Input ganda' }, items: [{ item_name: 'USG', item_type: 'tindakan', quantity: 1, price: 180000, total: 180000 }] } }) })),
            console, Date, setInterval, clearInterval, setTimeout, clearTimeout,
        });
        vm.runInContext(source, context);
        await vm.runInContext('loadBillings()', context);
        await vm.runInContext('openBilling(77)', context);
        expect(element('billing-list').innerHTML).toContain('DIBATALKAN');
        expect(element('billing-list').innerHTML).not.toContain('btn-pay-small');
        expect(element('detail-content').innerHTML).toContain('Input ganda');
        expect(element('detail-content').innerHTML).toContain('USG');
        expect(element('detail-content').innerHTML).toContain('Rp 180.000');
        expect(element('detail-content').innerHTML).not.toContain('Bayar Sekarang');
        expect(context.fetch).not.toHaveBeenCalledWith(expect.stringContaining('payment-details'), expect.anything());
    });

    test('invoice history retains cancelled invoice details and prints a newly marked PDF', async () => {
        const source = read('staff', 'public', 'scripts', 'pages', 'invoice-history-page.js')
            .replace(/^import .*;\r?\n/gm, '')
            .replace(/^export /gm, '');
        const tbody = { innerHTML: '' };
        const printRequest = jest.fn(async () => ({ success: true, downloadUrl: 'https://example.com/stamped.pdf' }));
        const context = vm.createContext({
            document: { getElementById: id => id === 'invoice-history-tbody' ? tbody : null, addEventListener() {} },
            window: { buildSundayClinicAppUrl: () => '/sunday-clinic.html?mr=DRD123', open: jest.fn() },
            createPageRequestScope: () => ({}),
            staffApiRequest: printRequest,
            escapeHtml: value => String(value || '').replace(/</g, '&lt;'),
            escapeAttribute: value => String(value || '').replace(/</g, '&lt;'),
            sanitizeUrl: value => value,
            URLSearchParams, console,
        });
        vm.runInContext(source, context);
        vm.runInContext(`renderInvoiceRows([{mr_id:'DRD123', patient_name:'Pasien Uji', total:180000,
            status:'cancelled', cancellation_reason:'Input ganda', cancelled_by_name:'dr. Dibya',
            cancelled_at:'2026-09-13T10:00:00+07:00', invoice_signed_url:'https://example.com/invoice.pdf'}])`, context);
        expect(tbody.innerHTML).toContain('badge badge-danger">Batal');
        expect(tbody.innerHTML).toContain('Rp');
        expect(tbody.innerHTML).toContain('180.000');
        expect(tbody.innerHTML).toContain('Input ganda');
        expect(tbody.innerHTML).toContain('dr. Dibya');
        expect(tbody.innerHTML).toContain('Cetak Invoice Batal');
        expect(tbody.innerHTML).not.toContain('href="https://example.com/invoice.pdf"');
        const button = { disabled: false };
        context.printButton = button;
        await vm.runInContext("printCancelledInvoice('DRD123', printButton)", context);
        expect(printRequest).toHaveBeenCalledWith('/api/sunday-clinic/billing/DRD123/print-invoice', { method: 'POST' });
        expect(context.window.open).toHaveBeenCalledWith('https://example.com/stamped.pdf', '_blank', 'noopener');
        expect(button.disabled).toBe(false);
    });

    test('cancellation requires a reason and final confirmation before sending the correct invoice request', async () => {
        const context = staffBillingContext({ status: 'confirmed' });
        const nodes = new Map();
        const node = id => {
            if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', style: {}, disabled: false,
                classList: { add() {}, remove() {} } });
            return nodes.get(id);
        };
        context.document.getElementById = node;
        context.window.confirm = jest.fn(() => true);
        context.window.handleSectionChange = jest.fn();
        context.window.showSuccess = jest.fn();
        vm.runInContext("billingCancellationState = {mrId:'DRD123', additionalBillingId:null, reference:'DRD123', patientName:'Pasien Uji', total:180000}", context);
        await vm.runInContext('submitBillingCancellation()', context);
        expect(context.fetch).not.toHaveBeenCalled();
        expect(node('billing-cancellation-error').textContent).toContain('wajib');

        node('billing-cancellation-reason').value = 'Input ganda';
        context.window.confirm.mockReturnValueOnce(false);
        await vm.runInContext('submitBillingCancellation()', context);
        expect(context.fetch).not.toHaveBeenCalled();

        await vm.runInContext('submitBillingCancellation()', context);
        expect(context.fetch).toHaveBeenCalledWith('/api/sunday-clinic/billing/DRD123/cancel', expect.objectContaining({
            method: 'POST', body: JSON.stringify({ reason: 'Input ganda' })
        }));
        expect(context.window.handleSectionChange).toHaveBeenCalledWith('billing', { pushHistory: false });

        context.fetch.mockClear();
        vm.runInContext("billingCancellationState = {mrId:'DRD123', additionalBillingId:5, reference:'DRD123-T1', patientName:'Pasien Uji', total:25000}", context);
        await vm.runInContext('submitBillingCancellation()', context);
        expect(context.fetch).toHaveBeenCalledWith('/api/sunday-clinic/billing/DRD123/additional/5/cancel', expect.objectContaining({
            method: 'POST', body: JSON.stringify({ reason: 'Input ganda' })
        }));
    });
});
