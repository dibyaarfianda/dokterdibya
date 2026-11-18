'use strict';

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const fs = require('fs');
const path = require('path');
const {
    SETTINGS_KEY,
    ADMIN_TINDAKAN_ID,
    normalizeMapping,
    tindakanIdsFor,
    priceMapping,
    toPublicEstimate,
    createCheckupEstimateService
} = require('../../services/CheckupEstimateService');
const { CONSULTATION_CATEGORIES } = require('../../constants/consultationCategories');

const ADMIN = { id: ADMIN_TINDAKAN_ID, code: 'ADM', name: 'Biaya Admin', category: 'ADMINISTRATIF', price: '15000.00', is_active: 1 };
const KONSUL = { id: 20, code: 'KNS', name: 'Konsultasi Dokter', category: 'LAYANAN', price: '100000.00', is_active: 1 };
const USG = { id: 30, code: 'USG', name: 'USG Abdomen', category: 'TINDAKAN MEDIS', price: '75000.50', is_active: 1 };

function mapping(categories) {
    return normalizeMapping({ categories }).mapping;
}

describe('consultation categories', () => {
    test('labels match the booking route labels', () => {
        const source = fs.readFileSync(path.join(__dirname, '../../routes/sunday-appointments.js'), 'utf8');
        for (const [code, label] of Object.entries(CONSULTATION_CATEGORIES)) {
            expect(source).toContain(`'${code}': '${label}'`);
        }
    });
});

describe('normalizeMapping', () => {
    test('keeps valid categories and items', () => {
        const { mapping: result, errors } = normalizeMapping({ categories: { obstetri: { items: [{ tindakan_id: 20, quantity: 1 }, { tindakan_id: '30', quantity: '2' }] } } });
        expect(errors).toEqual([]);
        expect(result.categories).toEqual({ obstetri: { items: [{ tindakan_id: 20, quantity: 1 }, { tindakan_id: 30, quantity: 2 }] } });
    });

    test.each([
        ['an unknown category', { lainnya: { items: [{ tindakan_id: 20, quantity: 1 }] } }, /Kategori tidak dikenal/],
        ['the admin fee, which is added automatically', { obstetri: { items: [{ tindakan_id: ADMIN_TINDAKAN_ID, quantity: 1 }] } }, /ditambahkan otomatis/],
        ['a quantity of zero', { obstetri: { items: [{ tindakan_id: 20, quantity: 0 }] } }, /jumlah harus/],
        ['a quantity above the maximum', { obstetri: { items: [{ tindakan_id: 20, quantity: 11 }] } }, /jumlah harus/],
        ['a fractional quantity', { obstetri: { items: [{ tindakan_id: 20, quantity: 1.5 }] } }, /jumlah harus/],
        ['a missing tindakan id', { obstetri: { items: [{ quantity: 1 }] } }, /tindakan_id tidak valid/],
        ['a duplicated tindakan', { obstetri: { items: [{ tindakan_id: 20, quantity: 1 }, { tindakan_id: 20, quantity: 1 }] } }, /dua kali/],
        ['too many items', { obstetri: { items: Array.from({ length: 21 }, (_, i) => ({ tindakan_id: 100 + i, quantity: 1 })) } }, /maksimal 20/]
    ])('rejects %s', (_name, categories, pattern) => {
        const { mapping: result, errors } = normalizeMapping({ categories });
        expect(errors.join('\n')).toMatch(pattern);
        expect(result.categories.obstetri).toBeUndefined();
    });

    test('an empty or broken input is an empty mapping', () => {
        expect(normalizeMapping(null).mapping.categories).toEqual({});
        expect(normalizeMapping({ categories: 'x' }).mapping.categories).toEqual({});
    });

    test('lists every tindakan id to price, including the admin fee once', () => {
        const ids = tindakanIdsFor(mapping({ obstetri: { items: [{ tindakan_id: 20, quantity: 1 }] }, gyn_repro: { items: [{ tindakan_id: 20, quantity: 1 }, { tindakan_id: 30, quantity: 1 }] } }));
        expect(ids.sort((a, b) => a - b)).toEqual([ADMIN_TINDAKAN_ID, 20, 30].sort((a, b) => a - b));
    });
});

describe('priceMapping', () => {
    test('adds the admin fee once, multiplies quantities and rounds the total up to whole rupiah', () => {
        const [obstetri, gynRepro] = priceMapping(mapping({
            obstetri: { items: [{ tindakan_id: 20, quantity: 1 }, { tindakan_id: 30, quantity: 1 }] },
            gyn_repro: { items: [{ tindakan_id: 20, quantity: 2 }] }
        }), [ADMIN, KONSUL, USG]);
        expect(obstetri).toMatchObject({ code: 'obstetri', label: 'Kehamilan (Obstetri)', ready: true, issues: [] });
        expect(obstetri.raw_total).toBe(190000.5);
        expect(obstetri.amount_idr).toBe(190001);
        expect(obstetri.items.map(item => item.tindakan_id)).toEqual([ADMIN_TINDAKAN_ID, 20, 30]);
        expect(gynRepro.amount_idr).toBe(15000 + 2 * 100000);
        expect(gynRepro.items.filter(item => item.tindakan_id === ADMIN_TINDAKAN_ID)).toHaveLength(1);
    });

    test('a category without configuration is not ready', () => {
        const result = priceMapping(mapping({}), [ADMIN]);
        expect(result.map(entry => entry.code)).toEqual(['obstetri', 'gyn_repro', 'gyn_special']);
        expect(result.every(entry => !entry.ready && entry.amount_idr === null)).toBe(true);
        expect(result[0].issues).toEqual(['Belum diatur']);
    });

    test.each([
        ['an inactive tindakan', [ADMIN, { ...KONSUL, is_active: 0 }], /nonaktif/],
        ['a missing tindakan', [ADMIN], /tidak ada atau nonaktif/],
        ['a tindakan from a category that is not a service', [ADMIN, { ...KONSUL, category: 'LABORATORIUM' }], /kategori LABORATORIUM/],
        ['a tindakan without a price', [ADMIN, { ...KONSUL, price: null }], /harga belum tersedia/],
        ['a missing admin fee', [KONSUL], /Biaya admin/]
    ])('is not ready with %s', (_name, rows, pattern) => {
        const [obstetri] = priceMapping(mapping({ obstetri: { items: [{ tindakan_id: 20, quantity: 1 }] } }), rows);
        expect(obstetri.ready).toBe(false);
        expect(obstetri.amount_idr).toBeNull();
        expect(obstetri.issues.join('\n')).toMatch(pattern);
    });

    test('a total below the Duitku minimum is not ready', () => {
        const cheap = { ...KONSUL, price: '1000' };
        const [obstetri] = priceMapping(mapping({ obstetri: { items: [{ tindakan_id: 20, quantity: 1 }] } }), [{ ...ADMIN, price: '1000' }, cheap]);
        expect(obstetri.ready).toBe(false);
        expect(obstetri.issues.join('\n')).toMatch(/minimum/);
    });

    test('the public view hides ids and configuration problems', () => {
        const [ready, notReady] = priceMapping(mapping({ obstetri: { items: [{ tindakan_id: 20, quantity: 1 }] }, gyn_repro: { items: [{ tindakan_id: 99, quantity: 1 }] } }), [ADMIN, KONSUL]);
        expect(toPublicEstimate(ready)).toEqual({
            code: 'obstetri', label: 'Kehamilan (Obstetri)', ready: true, amount_idr: 115000,
            items: [{ name: 'Biaya Admin', quantity: 1, subtotal_idr: 15000 }, { name: 'Konsultasi Dokter', quantity: 1, subtotal_idr: 100000 }]
        });
        expect(toPublicEstimate(notReady)).toEqual({ code: 'gyn_repro', label: 'Program Hamil (Reproduksi)', ready: false, amount_idr: null, items: [] });
    });
});

describe('createCheckupEstimateService', () => {
    function fakeDb(settingValue, tindakan = [ADMIN, KONSUL, USG]) {
        return {
            query: jest.fn(async (sql, params) => {
                if (/FROM settings WHERE setting_key = \?/.test(sql)) {
                    expect(params).toEqual([SETTINGS_KEY]);
                    return [settingValue === undefined ? [] : [{ setting_value: settingValue }]];
                }
                if (/FROM tindakan WHERE id IN/.test(sql)) return [tindakan.filter(row => params.includes(row.id))];
                if (/^INSERT INTO settings/.test(sql.trim())) return [{}];
                throw new Error(`unexpected SQL ${sql}`);
            })
        };
    }

    const stored = JSON.stringify({ version: 1, categories: { obstetri: { items: [{ tindakan_id: 20, quantity: 1 }] } } });

    test('prices from the stored mapping and live tindakan prices', async () => {
        const service = createCheckupEstimateService({ db: fakeDb(stored) });
        const result = await service.priceAll({ fresh: true });
        expect(result.categories.find(c => c.code === 'obstetri')).toMatchObject({ ready: true, amount_idr: 115000 });
    });

    test('the public price list is cached briefly; checkout pricing is always fresh', async () => {
        const db = fakeDb(stored);
        let now = new Date('2026-11-18T10:00:00+07:00');
        const service = createCheckupEstimateService({ db, clock: () => now });
        await service.priceAll();
        await service.priceAll();
        expect(db.query).toHaveBeenCalledTimes(2);
        await service.priceCategory('obstetri');
        expect(db.query).toHaveBeenCalledTimes(4);
        now = new Date(now.getTime() + 61 * 1000);
        await service.priceAll();
        expect(db.query).toHaveBeenCalledTimes(6);
    });

    test('a corrupted setting makes every category not ready instead of failing', async () => {
        const service = createCheckupEstimateService({ db: fakeDb('{not json') });
        const result = await service.priceAll({ fresh: true });
        expect(result.mapping_errors).toEqual([expect.stringMatching(/rusak/)]);
        expect(result.categories.every(c => !c.ready)).toBe(true);
    });

    test('saveMapping stores the normalized mapping and refuses invalid input', async () => {
        const db = fakeDb(undefined);
        const service = createCheckupEstimateService({ db, clock: () => new Date('2026-11-18T10:00:00+07:00') });
        await expect(service.saveMapping({ categories: { obstetri: { items: [{ tindakan_id: ADMIN_TINDAKAN_ID, quantity: 1 }] } } })).rejects.toThrow(/otomatis/);

        await service.saveMapping({ categories: { obstetri: { items: [{ tindakan_id: 20, quantity: 1 }] } } });
        const insert = db.query.mock.calls.find(([sql]) => /INSERT INTO settings/.test(sql));
        expect(insert[1][0]).toBe(SETTINGS_KEY);
        expect(JSON.parse(insert[1][1])).toMatchObject({ version: 1, categories: { obstetri: { items: [{ tindakan_id: 20, quantity: 1 }] } } });
    });
});
