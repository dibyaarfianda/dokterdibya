'use strict';

const {
    buildClosingPreview,
    classifyRevenueItem,
    parseClinicDate,
    buildSourceFingerprint
} = require('../../services/SundayClinicClosingService');

function paidMain(overrides = {}) {
    return {
        id: 11,
        mr_id: 'DRD0011',
        patient_id: 'P0011',
        patient_name: 'Pasien Utama',
        total: '135000',
        status: 'paid',
        paid_at: '2026-07-19 12:00:00',
        paid_by: 'Dokter Dibya',
        payment_method: null,
        ...overrides
    };
}

function paidAdditional(overrides = {}) {
    return {
        id: 21,
        parent_billing_id: 11,
        mr_id: 'DRD0011',
        patient_id: 'P0011',
        patient_name: 'Pasien Utama',
        reference_number: 'DRD0011-T01',
        total: '25000',
        status: 'paid',
        paid_at: '2026-07-19 12:15:00',
        paid_by: 'Dokter Dibya',
        payment_method: 'cash',
        ...overrides
    };
}

describe('SundayClinicClosingService', () => {
    test('only accepts a non-future Sunday date', () => {
        expect(parseClinicDate('2026-07-19', { today: '2026-07-20' })).toBe('2026-07-19');
        expect(() => parseClinicDate('2026-07-20', { today: '2026-07-20' })).toThrow(/hari Minggu/i);
        expect(() => parseClinicDate('2026-07-26', { today: '2026-07-20' })).toThrow(/masa depan/i);
        expect(() => parseClinicDate('19-07-2026', { today: '2026-07-20' })).toThrow(/YYYY-MM-DD/i);
    });

    test('classifies S01-S04 as administrative even when stored as tindakan', () => {
        expect(classifyRevenueItem({ item_type: 'tindakan', item_code: 'S01' })).toBe('administratif');
        expect(classifyRevenueItem({ item_type: 'tindakan', item_code: 's04' })).toBe('administratif');
        expect(classifyRevenueItem({ item_type: 'admin', item_code: null })).toBe('administratif');
        expect(classifyRevenueItem({ item_type: 'obat', item_code: 'OBT1' })).toBe('obat');
        expect(classifyRevenueItem({ item_type: 'tindakan', item_code: 'T01' })).toBe('tindakan');
    });

    test('totals paid main and additional bills once with detailed category breakdown', () => {
        const main = paidMain();
        const additional = paidAdditional();
        const preview = buildClosingPreview({
            clinicDate: '2026-07-19',
            records: [{ mr_id: 'DRD0011', patient_id: 'P0011', patient_name: 'Pasien Utama', billing_id: 11 }],
            mainBillings: [main],
            mainItems: [
                { id: 1, billing_id: 11, item_type: 'tindakan', item_code: 'T01', item_name: 'USG', quantity: 1, price: 100000, total: 100000 },
                { id: 2, billing_id: 11, item_type: 'tindakan', item_code: 'S01', item_name: 'Biaya Admin', quantity: 1, price: 5000, total: 5000 },
                { id: 3, billing_id: 11, item_type: 'obat', item_code: 'OBT1', item_name: 'Obat', quantity: 2, price: 15000, total: 30000 }
            ],
            additionalBillings: [additional],
            additionalItems: [
                { id: 4, additional_billing_id: 21, item_type: 'admin', item_code: 'S03', item_name: 'Buku Ginekologi', quantity: 1, price: 25000, total: 25000 }
            ],
            pendingPayments: []
        });

        expect(preview.summary).toEqual({
            main_total: 135000,
            additional_total: 25000,
            grand_total: 160000,
            patient_count: 1,
            transaction_count: 2
        });
        expect(preview.breakdown).toEqual({ tindakan: 100000, obat: 30000, administratif: 30000 });
        expect(preview.transactions).toHaveLength(2);
        expect(preview.blockers).toEqual([]);
        expect(preview.anomalies).toEqual([]);
        expect(preview.can_close).toBe(true);
        expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    test('blocks closing for open bills, missing bills, pending payment, and item mismatch', () => {
        const preview = buildClosingPreview({
            clinicDate: '2026-07-19',
            records: [
                { mr_id: 'DRD0011', patient_id: 'P0011', patient_name: 'Pasien A', billing_id: 11 },
                { mr_id: 'DRD0012', patient_id: 'P0012', patient_name: 'Pasien B', billing_id: null }
            ],
            mainBillings: [paidMain({ total: 140000 }), paidMain({ id: 12, mr_id: 'DRD0013', status: 'confirmed', total: 50000, paid_at: null })],
            mainItems: [
                { id: 1, billing_id: 11, item_type: 'tindakan', item_code: 'T01', item_name: 'USG', quantity: 1, price: 135000, total: 135000 }
            ],
            additionalBillings: [],
            additionalItems: [],
            pendingPayments: [{ id: 88, billing_id: 12, mr_id: 'DRD0013', payment_method: 'qris' }]
        });

        expect(preview.blockers.map((item) => item.code)).toEqual(expect.arrayContaining([
            'BILLING_NOT_PAID',
            'MISSING_BILLING',
            'ONLINE_PAYMENT_PENDING',
            'BILLING_TOTAL_MISMATCH'
        ]));
        expect(preview.can_close).toBe(false);
    });

    test('flags inconsistent paid timestamps as payment anomalies', () => {
        const preview = buildClosingPreview({
            clinicDate: '2026-07-19',
            records: [],
            mainBillings: [paidMain({ paid_at: null })],
            mainItems: [{ id: 1, billing_id: 11, item_type: 'tindakan', total: 135000 }],
            additionalBillings: [paidAdditional({ status: 'confirmed', paid_at: '2026-07-19 13:00:00' })],
            additionalItems: [{ id: 2, additional_billing_id: 21, item_type: 'admin', total: 25000 }],
            pendingPayments: []
        });

        expect(preview.anomalies.map((item) => item.code)).toEqual(expect.arrayContaining([
            'PAID_WITHOUT_PAID_AT',
            'NON_PAID_WITH_PAID_AT',
            'NON_PAID_WITH_PAID_BY'
        ]));
        expect(preview.can_close).toBe(false);
    });

    test('requires the payment actor for every paid source', () => {
        const preview = buildClosingPreview({
            clinicDate: '2026-07-19',
            records: [{ mr_id: 'DRD0011', patient_id: 'P0011', patient_name: 'Pasien Utama', billing_id: 11 }],
            mainBillings: [paidMain({ paid_by: '   ' })],
            mainItems: [
                { id: 1, billing_id: 11, item_type: 'tindakan', item_code: 'T01', item_name: 'USG', quantity: 1, price: 135000, total: 135000 }
            ]
        });

        expect(preview.anomalies).toEqual([
            expect.objectContaining({ code: 'PAID_WITHOUT_PAID_BY' })
        ]);
        expect(preview.can_close).toBe(false);
    });

    test('blocks closing while billing changes or revision requests are pending', () => {
        const preview = buildClosingPreview({
            clinicDate: '2026-07-19',
            records: [{ mr_id: 'DRD0011', patient_id: 'P0011', patient_name: 'Pasien Utama', billing_id: 11 }],
            mainBillings: [paidMain({ pending_changes: 1 })],
            mainItems: [
                { id: 1, billing_id: 11, item_type: 'tindakan', item_code: 'T01', item_name: 'USG', quantity: 1, price: 135000, total: 135000 }
            ],
            additionalBillings: [],
            additionalItems: [],
            pendingPayments: [],
            pendingRevisions: [{ id: 91, mr_id: 'DRD0011', status: 'pending', message: 'Periksa ulang obat' }]
        });

        expect(preview.blockers.map(item => item.code)).toEqual(expect.arrayContaining([
            'BILLING_CHANGES_PENDING',
            'BILLING_REVISION_PENDING'
        ]));
        expect(preview.can_close).toBe(false);
    });

    test('fingerprint is stable for equivalent sorted sources and changes with financial state', () => {
        const first = buildSourceFingerprint({ clinicDate: '2026-07-19', sources: [
            { source_type: 'additional', source_id: 2, status: 'paid', total: 2000, updated_at: 'b' },
            { source_type: 'main', source_id: 1, status: 'paid', total: 1000, updated_at: 'a' }
        ] });
        const reordered = buildSourceFingerprint({ clinicDate: '2026-07-19', sources: [
            { source_type: 'main', source_id: 1, status: 'paid', total: 1000, updated_at: 'a' },
            { source_type: 'additional', source_id: 2, status: 'paid', total: 2000, updated_at: 'b' }
        ] });
        const changed = buildSourceFingerprint({ clinicDate: '2026-07-19', sources: [
            { source_type: 'main', source_id: 1, status: 'paid', total: 1001, updated_at: 'a' },
            { source_type: 'additional', source_id: 2, status: 'paid', total: 2000, updated_at: 'b' }
        ] });

        expect(first).toBe(reordered);
        expect(changed).not.toBe(first);
    });

    test('billing updated_at changes do not stale an otherwise identical closing preview', () => {
        const buildPreview = updatedAt => buildClosingPreview({
            clinicDate: '2026-07-19',
            records: [{ mr_id: 'DRD0011', patient_id: 'P0011', patient_name: 'Pasien Utama', billing_id: 11 }],
            mainBillings: [paidMain({ updated_at: updatedAt })],
            mainItems: [
                { id: 1, billing_id: 11, item_type: 'tindakan', item_code: 'T01', item_name: 'USG', quantity: 1, price: 135000, total: 135000 }
            ],
            additionalBillings: [],
            additionalItems: [],
            pendingPayments: []
        });

        const beforePrint = buildPreview('2026-07-19 12:00:00');
        const afterPrint = buildPreview('2026-07-19 12:05:00');

        expect(beforePrint.fingerprint).toBe(afterPrint.fingerprint);
        expect(beforePrint.can_close).toBe(true);
        expect(afterPrint.can_close).toBe(true);
    });

    test('patient display-name edits do not create a false financial reconciliation exception', () => {
        const buildPreview = patientName => buildClosingPreview({
            clinicDate: '2026-07-19',
            records: [{ mr_id: 'DRD0011', patient_id: 'P0011', patient_name: patientName, billing_id: 11 }],
            mainBillings: [paidMain({ patient_name: patientName })],
            mainItems: [
                { id: 1, billing_id: 11, item_type: 'tindakan', item_code: 'T01', item_name: 'USG', quantity: 1, price: 135000, total: 135000 }
            ],
            additionalBillings: [],
            additionalItems: [],
            pendingPayments: []
        });

        expect(buildPreview('Nama Lama').fingerprint).toBe(buildPreview('Nama Baru').fingerprint);
    });
});
