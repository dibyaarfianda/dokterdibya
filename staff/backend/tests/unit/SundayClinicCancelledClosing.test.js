'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
    buildClosingPreview,
    createClosing,
    getClosingDetail,
    loadFinancialSources,
    listClosings
} = require('../../services/SundayClinicClosingService');
const { CLOSING_REQUIRED_SCHEMA } = require('../../services/SundayClinicClosingSchemaValidator');

const cancelledMain = {
    id: 11,
    mr_id: 'DRD0011',
    patient_id: 'P0011',
    patient_name: 'Pasien Utama',
    total: 135000,
    status: 'cancelled',
    cancellation_reason: 'Tindakan tidak jadi',
    cancelled_at: '2026-07-19 11:00:00',
    cancelled_by: 'doctor-1',
    cancelled_by_name: 'Dokter Dibya'
};

const cancelledAdditional = {
    id: 21,
    parent_billing_id: 11,
    mr_id: 'DRD0011',
    patient_id: 'P0011',
    patient_name: 'Pasien Utama',
    reference_number: 'DRD0011-T01',
    total: 25000,
    status: 'cancelled',
    cancellation_reason: 'Obat dikembalikan',
    cancelled_at: '2026-07-19 11:05:00',
    cancelled_by: 'doctor-1',
    cancelled_by_name: 'Dokter Dibya'
};

function preview(overrides = {}) {
    return buildClosingPreview({
        clinicDate: '2026-07-19',
        records: [{ mr_id: 'DRD0011', patient_id: 'P0011', billing_id: 11 }],
        mainBillings: [cancelledMain],
        mainItems: [{ id: 1, billing_id: 11, item_type: 'tindakan', item_name: 'USG', quantity: 1, price: 135000, total: 135000 }],
        additionalBillings: [cancelledAdditional],
        additionalItems: [{ id: 2, additional_billing_id: 21, item_type: 'obat', item_name: 'Obat', quantity: 1, price: 25000, total: 25000 }],
        ...overrides
    });
}

describe('cancelled invoice accounting', () => {
    test('closing screen displays cancellation separately from revenue with reason and actor', () => {
        const file = path.resolve(__dirname, '../../../public/scripts/sunday-clinic/components/shared/closing.js');
        const source = fs.readFileSync(file, 'utf8')
            .replace(/^import .*;\r?\n/gm, '')
            .replace(/^export default \{/m, 'const closingDefault = {')
            .replace(/^export /gm, '');
        const content = { innerHTML: '' };
        const submit = { disabled: false, innerHTML: '', classList: { add() {}, remove() {} } };
        const document = { getElementById(id) { return id === 'sunday-clinic-closing-content' ? content : id === 'btn-submit-sunday-clinic-closing' ? submit : null; } };
        const context = vm.createContext({ document, window: {}, ROLE_IDS: { DOKTER: 1 }, getIdToken() {}, Intl, Date, Number, String });
        vm.runInContext(`${source}\nglobalThis.renderPreviewForTest = renderPreview;`, context);
        context.renderPreviewForTest(preview());
        expect(content.innerHTML).toContain('Tagihan Dibatalkan');
        expect(content.innerHTML).toContain('Rp 160.000');
        expect(content.innerHTML).toContain('Tindakan tidak jadi');
        expect(content.innerHTML).toContain('Obat dikembalikan');
        expect(content.innerHTML).toContain('Dokter Dibya');
        expect(content.innerHTML).toContain('Total Pendapatan');
        expect(content.innerHTML).toContain('Rp 0');
    });

    test('closing schema checks cancellation metadata and payment reconciliation columns', () => {
        expect(CLOSING_REQUIRED_SCHEMA.sunday_clinic_billings).toEqual(expect.arrayContaining(['cancellation_reason', 'cancelled_at', 'cancelled_by', 'cancelled_by_name']));
        expect(CLOSING_REQUIRED_SCHEMA.sunday_clinic_additional_billings).toEqual(expect.arrayContaining(['cancellation_reason', 'cancelled_at', 'cancelled_by', 'cancelled_by_name']));
        expect(CLOSING_REQUIRED_SCHEMA.tagihan_payments).toEqual(expect.arrayContaining(['reconciliation_required', 'reconciliation_reason']));
    });
    test('retains independent main and additional cancellations outside income', () => {
        const result = preview();
        expect(result.can_close).toBe(true);
        expect(result.blockers).toEqual([]);
        expect(result.transactions).toEqual([]);
        expect(result.summary).toMatchObject({ grand_total: 0, transaction_count: 0, cancelled_count: 2, cancelled_total: 160000 });
        expect(result.breakdown).toEqual({ tindakan: 0, obat: 0, administratif: 0 });
        expect(result.cancelled_billings).toEqual([
            expect.objectContaining({ source_type: 'main', total: 135000, patient_name: 'Pasien Utama', cancellation_reason: 'Tindakan tidak jadi', cancelled_by_name: 'Dokter Dibya', items: [expect.objectContaining({ item_name: 'USG' })] }),
            expect.objectContaining({ source_type: 'additional', total: 25000, cancellation_reason: 'Obat dikembalikan', items: [expect.objectContaining({ item_name: 'Obat' })] })
        ]);
    });

    test('fingerprint includes cancelled amount, identity, reason, and canceller', () => {
        const original = preview().fingerprint;
        expect(preview({ mainBillings: [{ ...cancelledMain, total: 135001 }] }).fingerprint).not.toBe(original);
        expect(preview({ mainBillings: [{ ...cancelledMain, patient_name: 'Nama Lain' }] }).fingerprint).not.toBe(original);
        expect(preview({ mainBillings: [{ ...cancelledMain, cancellation_reason: 'Alasan berubah' }] }).fingerprint).not.toBe(original);
        expect(preview({ mainBillings: [{ ...cancelledMain, cancelled_by_name: 'Dokter Lain' }] }).fingerprint).not.toBe(original);
    });

    test('blocks a cancelled invoice with retained payment evidence', () => {
        const withPaidMetadata = preview({ mainBillings: [{ ...cancelledMain, paid_at: '2026-07-19 12:00:00', paid_by: 'Xendit' }] });
        expect(withPaidMetadata.can_close).toBe(false);
        expect(withPaidMetadata.anomalies.map(issue => issue.code)).toContain('NON_PAID_WITH_PAID_AT');

        const withReconciliation = preview({ pendingPayments: [{ id: 99, billing_id: 11, mr_id: 'DRD0011', status: 'paid', reconciliation_required: 1, reconciliation_reason: 'late_provider_payment_after_cancellation' }] });
        expect(withReconciliation.can_close).toBe(false);
        expect(withReconciliation.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PAYMENT_RECONCILIATION_REQUIRED', payment_id: 99 })]));
    });

    test('loads cancellation metadata and reconciled paid payments from SQL', async () => {
        const calls = [];
        const client = { query: jest.fn(async (sql, params) => { calls.push({ sql: String(sql).replace(/\s+/g, ' '), params }); return [[], []]; }) };
        await loadFinancialSources(client, '2026-07-19');
        const mainQuery = calls.find(call => call.sql.includes('FROM sunday_clinic_billings b'))?.sql;
        const additionalQuery = calls.find(call => call.sql.includes('FROM sunday_clinic_additional_billings ab'))?.sql;
        for (const [query, alias] of [[mainQuery, 'b'], [additionalQuery, 'ab']]) {
            expect(query).toContain(`${alias}.cancellation_reason`);
            expect(query).toContain(`${alias}.cancelled_at`);
            expect(query).toContain(`${alias}.cancelled_by`);
            expect(query).toContain(`${alias}.cancelled_by_name`);
        }
    });

    test('reads cancelled snapshots separately while keeping older paid snapshots compatible', async () => {
        const client = { query: jest.fn(async sql => {
            if (String(sql).includes('FROM sunday_clinic_closing_entries')) return [[
                { id: 1, closing_id: 7, source_type: 'main', source_id: 11, mr_id: 'DRD0011', patient_id: 'P0011', patient_name: 'Pasien Utama', reference_number: 'DRD0011', total: 135000, item_snapshot: JSON.stringify([{ item_name: 'USG', total: 135000 }]), source_snapshot: JSON.stringify({ status: 'cancelled', cancellation_reason: 'Tindakan tidak jadi', cancelled_by_name: 'Dokter Dibya' }) },
                { id: 2, closing_id: 7, source_type: 'additional', source_id: 21, mr_id: 'DRD0011', patient_id: 'P0011', patient_name: 'Pasien Utama', reference_number: 'DRD0011-T01', total: 25000, item_snapshot: '[]', source_snapshot: JSON.stringify({ status: 'paid' }) }
            ], []];
            throw new Error('Unexpected query');
        }) };
        const detail = await getClosingDetail(client, { id: 7, clinic_date: '2026-07-19', summary: { cancelled_count: 1, cancelled_total: 135000 }, breakdown: {}, source_fingerprint: 'test' });
        expect(detail.transactions).toEqual([expect.objectContaining({ source_id: 21, total: 25000 })]);
        expect(detail.cancelled_billings).toEqual([expect.objectContaining({ source_id: 11, cancellation_reason: 'Tindakan tidak jadi', cancelled_by_name: 'Dokter Dibya', total: 135000 })]);
    });

    test('persists a cancelled invoice with original amount and reason in the immutable close', async () => {
        const expected = preview({ additionalBillings: [], additionalItems: [] });
        let insertedEntry = null;
        const client = {
            beginTransaction: jest.fn(async () => {}),
            commit: jest.fn(async () => {}),
            rollback: jest.fn(async () => {}),
            query: jest.fn(async (sql, params) => {
                const compact = String(sql).replace(/\s+/g, ' ');
                if (compact.includes('SELECT GET_LOCK')) return [[{ acquired: 1 }], []];
                if (compact.includes('FROM sunday_clinic_closings') && compact.includes('WHERE clinic_date')) return [[], []];
                if (compact.includes('FROM sunday_clinic_records scr')) return [[{ mr_id: 'DRD0011', patient_id: 'P0011', patient_name: 'Pasien Utama', billing_id: 11 }], []];
                if (compact.includes('FROM sunday_clinic_billings b')) return [[cancelledMain], []];
                if (compact.includes('FROM sunday_clinic_additional_billings ab')) return [[], []];
                if (compact.includes('FROM sunday_clinic_billing_items')) return [[{ id: 1, billing_id: 11, item_type: 'tindakan', item_name: 'USG', quantity: 1, price: 135000, total: 135000 }], []];
                if (compact.includes('FROM tagihan_payments tp')) return [[], []];
                if (compact.includes('FROM sunday_clinic_billing_revisions br')) return [[], []];
                if (compact.includes('INSERT INTO sunday_clinic_closings')) return [{ insertId: 7 }, []];
                if (compact.includes('INSERT INTO sunday_clinic_closing_entries')) { insertedEntry = params; return [{ affectedRows: 1 }, []]; }
                if (compact.includes('FROM sunday_clinic_closings') && compact.includes('WHERE id')) return [[{
                    id: 7, clinic_date: '2026-07-19', main_total: 0, additional_total: 0,
                    grand_total: 0, patient_count: 0, transaction_count: 0,
                    summary_json: JSON.stringify(expected.summary), breakdown_json: JSON.stringify(expected.breakdown),
                    source_fingerprint: expected.fingerprint
                }], []];
                if (compact.includes('FROM sunday_clinic_closing_entries')) return [[{
                    id: 1, closing_id: 7, source_type: insertedEntry[1], source_id: insertedEntry[2],
                    parent_billing_id: insertedEntry[3], mr_id: insertedEntry[4], patient_id: insertedEntry[5],
                    patient_name: insertedEntry[6], reference_number: insertedEntry[7], payment_method: insertedEntry[8],
                    paid_at: insertedEntry[9], paid_by: insertedEntry[10], total: insertedEntry[11],
                    item_snapshot: insertedEntry[12], source_snapshot: insertedEntry[13]
                }], []];
                if (compact.includes('SELECT RELEASE_LOCK')) return [[{ released: 1 }], []];
                throw new Error(`Unexpected SQL: ${compact}`);
            })
        };
        const result = await createClosing(client, { date: '2026-07-19', fingerprint: expected.fingerprint, actor: { userId: 'doctor-1', name: 'Dokter Test' } });
        expect(client.commit).toHaveBeenCalledTimes(1);
        expect(result.transactions).toEqual([]);
        expect(result.cancelled_billings).toEqual([expect.objectContaining({ total: 135000, cancellation_reason: 'Tindakan tidak jadi', cancelled_by_name: 'Dokter Dibya' })]);
        expect(JSON.parse(insertedEntry[13])).toMatchObject({ status: 'cancelled', cancellation_reason: 'Tindakan tidak jadi', cancelled_by: 'doctor-1' });
    });

    test('history list exposes cancellation totals and defaults old snapshots to zero', async () => {
        const client = { query: jest.fn(async () => [[
            { id: 7, clinic_date: '2026-07-19', summary_json: JSON.stringify({ cancelled_count: 2, cancelled_total: 160000 }) },
            { id: 6, clinic_date: '2026-07-12', summary_json: JSON.stringify({ grand_total: 25000 }) }
        ], []]) };
        const history = await listClosings(client);
        expect(history.items[0]).toMatchObject({ cancelled_count: 2, cancelled_total: 160000 });
        expect(history.items[1]).toMatchObject({ cancelled_count: 0, cancelled_total: 0 });
    });
});
