'use strict';

// Tahap 2: the cashier sees the saldo deduction before marking a bill paid, sends the amount
// it saw, reloads when the server says the saldo changed; the invoice prints the split.
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');
const component = read('staff', 'public', 'scripts', 'sunday-clinic', 'components', 'shared', 'billing.js');
const pdf = read('staff', 'backend', 'utils', 'pdf-generator.js');
const service = read('staff', 'backend', 'services', 'sunday-clinic', 'billing.js');

describe('cashier billing panel', () => {
    test('shows the saldo preview on a confirmed bill and the split on a paid bill', () => {
        expect(component).toContain('Saldo di muka ');
        expect(component).toContain('Sisa dibayar ');
        expect(component).toContain('Tandai Lunas (sisa ');
        expect(component).toContain('Dibayar dari saldo ');
        expect(component).toContain('Dibayar tunai/transfer ');
        expect(component).toMatch(/prepay\.mode === 'preview'/);
        expect(component).toMatch(/prepay\.mode === 'used'/);
    });

    test('mark-paid sends the amount the cashier saw and reloads on 409', () => {
        const start = component.indexOf("getElementById('btn-mark-paid')");
        const handler = component.slice(start, component.indexOf('// 6.', start) > -1 ? component.indexOf('// 6.', start) : start + 4000);
        expect(handler).toContain('/mark-paid');
        expect(handler).toMatch(/expected_prepay_idr: /);
        expect(handler).toMatch(/response\.status === 409/);
        expect(handler).toContain("window.handleSectionChange('billing'");
        expect(handler).toContain('dari saldo, sisa ');
    });

    test('prepay amounts are formatted and never injected as raw server text', () => {
        const start = component.indexOf('const prepayInfo');
        expect(start).toBeGreaterThan(-1);
        const block = component.slice(start, component.indexOf(';\n', component.indexOf('prepayHtml', start)) + 2);
        expect(block).toMatch(/formatRupiahLocal\(/);
        expect(block).not.toMatch(/\$\{prepay\.[a-z_]+\}/);
    });
});

describe('invoice PDF', () => {
    test('prints the saldo split for paid bills and the planned deduction for confirmed bills', () => {
        expect(pdf).toContain('Dibayar dari saldo di muka');
        expect(pdf).toContain('Dibayar tunai/transfer');
        expect(pdf).toContain('Perkiraan potongan saldo');
        expect(pdf).toContain('(dipotong saat pelunasan)');
    });

    test('the print route hands the coverage to the PDF', () => {
        const start = service.indexOf('async function postBillingByMrIdPrintInvoice');
        const body = service.slice(start, service.indexOf('async function getBillingByMrIdAdditional', start));
        expect(body).toMatch(/prepay: await forBilling\(connection, billing\)/);
    });
});
