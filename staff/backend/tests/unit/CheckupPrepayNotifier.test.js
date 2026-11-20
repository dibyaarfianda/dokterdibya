'use strict';

// Tahap 2: a paid prepay order shows up in the staff panel (toast + red dot); no WhatsApp.
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

const order = {
    id: 42, order_ref: 'DPK-00000000-0000-4000-8000-000000000042', order_type: 'checkup_prepay',
    product_code: 'obstetri_usg4d', patient_id: 'P0001', amount_idr: 365000, payment_method: 'va_bni', gateway_mode: 'live'
};

describe('notifyPrepayPaid', () => {
    const { notifyPrepayPaid } = require('../../services/CheckupPrepayNotifier');

    test('broadcasts the paid event with the patient name and product', async () => {
        const db = { query: jest.fn(async () => [[{ full_name: 'Bu Pasien' }]]) };
        const realtime = { broadcast: jest.fn() };
        await notifyPrepayPaid(order, { category: 'obstetri' }, { db, realtime });
        expect(db.query.mock.calls[0][1]).toEqual(['P0001']);
        expect(realtime.broadcast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'checkup_prepay_paid',
            patientName: 'Bu Pasien',
            product: 'obstetri_usg4d',
            productLabel: 'Kehamilan + USG 4D',
            amount_idr: 365000,
            payment_method: 'va_bni',
            gateway_mode: 'live',
            order_ref: order.order_ref,
            timestamp: expect.any(String)
        }));
    });

    test('labels an editable package by the name frozen in the order snapshot', async () => {
        const realtime = { broadcast: jest.fn() };
        const packageOrder = { ...order, product_code: 'pkg_7', item_snapshot: JSON.stringify({ package_name: 'Paket Trimester 1' }) };
        await notifyPrepayPaid(packageOrder, null, { db: { query: jest.fn(async () => [[]]) }, realtime });
        expect(realtime.broadcast).toHaveBeenCalledWith(expect.objectContaining({ product: 'pkg_7', productLabel: 'Paket Trimester 1' }));
    });

    test('falls back to the patient id when the name is missing', async () => {
        const realtime = { broadcast: jest.fn() };
        await notifyPrepayPaid(order, null, { db: { query: jest.fn(async () => [[]]) }, realtime });
        expect(realtime.broadcast).toHaveBeenCalledWith(expect.objectContaining({ patientName: 'P0001' }));
    });
});

describe('panel wiring', () => {
    test('only staff who can see bills receive the event', () => {
        const { EVENT_PERMISSIONS } = require('../../security/realtimePermissions');
        expect(EVENT_PERMISSIONS.checkup_prepay_paid).toBe('billing.view');
    });

    test('the default payment service notifies through the notifier', () => {
        const service = read('staff', 'backend', 'services', 'PremiumPaymentService.js');
        expect(service).toContain("require('./CheckupPrepayNotifier').notifyPrepayPaid");
    });

    test('the shell shows a toast and refreshes the red dots', () => {
        const toast = read('staff', 'public', 'scripts', 'shell', 'prepay-paid-toast.js');
        expect(toast).toContain('export function initPrepayPaidToast');
        expect(toast).toContain("'checkup_prepay_paid'");
        expect(toast).toContain('Pembayaran di muka diterima: ');
        expect(toast).toContain(' (uji)');
        expect(read('staff', 'public', 'scripts', 'shell', 'bootstrap.js')).toContain("import('./prepay-paid-toast.js')");
        expect(read('staff', 'public', 'scripts', 'shell', 'menu-new-badges.js')).toContain("'checkup_prepay_paid'");
        expect(read('staff', 'public', 'sw.js')).toContain("'/staff/public/scripts/shell/prepay-paid-toast.js'");
    });
});
