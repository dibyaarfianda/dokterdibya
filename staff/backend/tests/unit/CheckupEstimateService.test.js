'use strict';

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const fs = require('fs');
const path = require('path');
const {
    ADMIN_TINDAKAN_ID,
    normalizeMapping,
    toPublicEstimate,
    createCheckupEstimateService,
    CONSULTATION_PATTERN,
    isConsultationTindakan,
    normalizePackageInput,
    pricePackage
} = require('../../services/CheckupEstimateService');
const { CONSULTATION_CATEGORIES } = require('../../constants/consultationCategories');

const ADMIN = { id: ADMIN_TINDAKAN_ID, code: 'ADM', name: 'Biaya Admin', category: 'ADMINISTRATIF', price: '15000.00', is_active: 1 };

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
        ['an unknown product', { lainnya: { items: [{ tindakan_id: 20, quantity: 1 }] } }, /Produk tidak dikenal/],
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
});

const KALSIUM = { id: 7, code: 'OBT7', name: 'Kalsium', unit: 'tablet', price: '1500.00', is_active: 1 };
const USG4D = { id: 9, code: 'U4D', name: 'USG 4 Dimensi', category: 'LAYANAN', price: '250000.00', is_active: 1 };
const KONSUL_SINGKAT = { id: 56, code: 'K56', name: 'Konsul Singkat', category: 'LAYANAN', price: '50000', is_active: 1 };
const KONSELING = { id: 58, code: 'K58', name: 'Konseling Prapersalinan', category: 'LAYANAN', price: '60000', is_active: 1 };

function pkg(items, overrides = {}) {
    return {
        id: 1, code: 'pkg_1', name: 'Paket 20-24', description: null, category: 'obstetri',
        week_min: 20, week_max: 24, is_active: true, sort_order: 10,
        items: items.map((item, index) => ({ sort_order: index, ...item })),
        ...overrides
    };
}
const T = (id, quantity = 1) => ({ item_type: 'tindakan', ref_id: id, quantity });
const O = (id, quantity = 1) => ({ item_type: 'obat', ref_id: id, quantity });
const maps = ({ tindakan = [ADMIN, USG4D], obat = [KALSIUM] } = {}) => ({
    tindakan: new Map(tindakan.map(row => [row.id, row])),
    obat: new Map(obat.map(row => [row.id, row]))
});

describe('consultation pattern', () => {
    test('matches konsul and konseling names only', () => {
        expect(CONSULTATION_PATTERN.test('Konsul Singkat')).toBe(true);
        expect(isConsultationTindakan(KONSELING)).toBe(true);
        expect(isConsultationTindakan(USG4D)).toBe(false);
        expect(isConsultationTindakan(null)).toBe(false);
    });
});

describe('pricePackage', () => {
    test('prices tindakan and obat with the admin fee first', () => {
        const priced = pricePackage(pkg([T(9), O(7, 30)]), maps());
        expect(priced).toMatchObject({ id: 1, code: 'pkg_1', ready: true, amount_idr: 310000, raw_total: 310000, issues: [] });
        expect(priced.items.map(item => [item.item_type, item.ref_id])).toEqual([['tindakan', ADMIN_TINDAKAN_ID], ['tindakan', 9], ['obat', 7]]);
        expect(priced.items[2]).toMatchObject({ name: 'Kalsium', unit_price: 1500, quantity: 30, subtotal: 45000 });
    });

    test.each([
        ['Konsul Singkat', KONSUL_SINGKAT],
        ['Konseling Prapersalinan', KONSELING]
    ])('a consultation tindakan (%s) makes the package not ready', (_name, row) => {
        const priced = pricePackage(pkg([T(row.id)]), maps({ tindakan: [ADMIN, row] }));
        expect(priced.ready).toBe(false);
        expect(priced.amount_idr).toBeNull();
        expect(priced.issues.join('\n')).toMatch(/konsultasi tidak boleh di paket/);
    });

    test.each([
        ['an inactive obat', { ...KALSIUM, is_active: 0 }, /Obat 7: tidak ada atau nonaktif/],
        ['an obat without a price', { ...KALSIUM, price: null }, /Obat 7: harga belum tersedia/]
    ])('%s is not ready and says why', (_name, row, pattern) => {
        const priced = pricePackage(pkg([T(9), O(7, 2)]), maps({ obat: [row] }));
        expect(priced.ready).toBe(false);
        expect(priced.issues.join('\n')).toMatch(pattern);
    });

    test.each([
        ['a missing tindakan', { tindakan: [ADMIN] }, /Tindakan 9: tidak ada atau nonaktif/],
        ['a tindakan of the wrong category', { tindakan: [ADMIN, { ...USG4D, category: 'LABORATORIUM' }] }, /kategori LABORATORIUM tidak diizinkan/],
        ['a missing admin fee', { tindakan: [USG4D] }, /Biaya admin \(tindakan 1\) belum tersedia atau nonaktif/]
    ])('%s', (_name, rows, pattern) => {
        const priced = pricePackage(pkg([T(9)]), maps(rows));
        expect(priced.ready).toBe(false);
        expect(priced.issues.join('\n')).toMatch(pattern);
    });

    test('rounds up and refuses a total below the minimum', () => {
        const rounded = pricePackage(pkg([T(9)]), maps({ tindakan: [ADMIN, { ...USG4D, price: '75000.50' }] }));
        expect(rounded.raw_total).toBe(90000.5);
        expect(rounded.amount_idr).toBe(90001);
        const cheap = pricePackage(pkg([T(9)]), maps({ tindakan: [{ ...ADMIN, price: '1000' }, { ...USG4D, price: '1000' }] }));
        expect(cheap.ready).toBe(false);
        expect(cheap.issues.join('\n')).toMatch(/Total Rp2\.000 di bawah minimum pembayaran Rp/);
    });
});

describe('normalizePackageInput', () => {
    const base = (overrides = {}) => ({ name: ' Paket A ', description: '', category: 'obstetri', week_min: null, week_max: null, is_active: '1', items: [{ item_type: 'tindakan', ref_id: '9', quantity: '1' }], ...overrides });

    test('accepts a valid package, coercing and trimming', () => {
        const { value, errors } = normalizePackageInput(base({ week_min: '20', week_max: '24', is_active: '0', items: [{ item_type: 'tindakan', ref_id: '9', quantity: '1' }, { item_type: 'obat', ref_id: 7, quantity: 200 }] }));
        expect(errors).toEqual([]);
        expect(value).toMatchObject({ name: 'Paket A', description: null, category: 'obstetri', week_min: 20, week_max: 24, is_active: false });
        expect(value.items).toEqual([
            { item_type: 'tindakan', ref_id: 9, quantity: 1, sort_order: 0 },
            { item_type: 'obat', ref_id: 7, quantity: 200, sort_order: 1 }
        ]);
    });

    test('both week bounds null on obstetri is ok', () => {
        expect(normalizePackageInput(base()).errors).toEqual([]);
    });

    test.each([
        ['a week range on gyn_repro', { category: 'gyn_repro', week_min: 1, week_max: 2 }],
        ['min above max', { week_min: 30, week_max: 20 }],
        ['max 46', { week_min: 1, week_max: 46 }],
        ['only one week bound', { week_min: 5, week_max: null }],
        ['an unknown category', { category: 'umum' }],
        ['an empty name', { name: '   ' }],
        ['a name over 120 characters', { name: 'a'.repeat(121) }],
        ['a description over 255 characters', { description: 'a'.repeat(256) }],
        ['no items', { items: [] }],
        ['21 items', { items: Array.from({ length: 21 }, (_, i) => ({ item_type: 'obat', ref_id: 100 + i, quantity: 1 })) }],
        ['obat quantity 201', { items: [{ item_type: 'obat', ref_id: 7, quantity: 201 }] }],
        ['tindakan quantity 11', { items: [{ item_type: 'tindakan', ref_id: 9, quantity: 11 }] }],
        ['an unknown item type', { items: [{ item_type: 'paket', ref_id: 9, quantity: 1 }] }],
        ['a duplicate item', { items: [{ item_type: 'obat', ref_id: 7, quantity: 1 }, { item_type: 'obat', ref_id: 7, quantity: 2 }] }],
        ['the admin tindakan', { items: [{ item_type: 'tindakan', ref_id: ADMIN_TINDAKAN_ID, quantity: 1 }] }]
    ])('refuses %s', (_name, overrides) => {
        expect(normalizePackageInput(base(overrides)).errors.length).toBeGreaterThan(0);
    });

    test('the same id as tindakan and as obat is not a duplicate', () => {
        expect(normalizePackageInput(base({ items: [{ item_type: 'tindakan', ref_id: 7, quantity: 1 }, { item_type: 'obat', ref_id: 7, quantity: 1 }] })).errors).toEqual([]);
    });

    test.each([['Konsul Singkat', KONSUL_SINGKAT], ['Konseling Prapersalinan', KONSELING]])('refuses %s when the row is known', (_name, row) => {
        const input = base({ items: [{ item_type: 'tindakan', ref_id: row.id, quantity: 1 }] });
        expect(normalizePackageInput(input, { tindakan: new Map([[row.id, row]]) }).errors.join('\n')).toMatch(/konsultasi/);
        expect(normalizePackageInput(input).errors).toEqual([]);
    });
});

describe('toPublicEstimate', () => {
    test('exposes no ids and no issues', () => {
        const priced = pricePackage(pkg([T(9), O(7, 30)]), maps());
        const view = toPublicEstimate(priced);
        expect(view).toEqual({
            code: 'pkg_1', name: 'Paket 20-24', label: 'Paket 20-24', category: 'obstetri', week_min: 20, week_max: 24, sort_order: 10,
            ready: true, amount_idr: 310000,
            items: [
                { name: 'Biaya Admin', quantity: 1, subtotal_idr: 15000 },
                { name: 'USG 4 Dimensi', quantity: 1, subtotal_idr: 250000 },
                { name: 'Kalsium', quantity: 30, subtotal_idr: 45000 }
            ]
        });
        expect(JSON.stringify(view)).not.toMatch(/ref_id|issues|"id"/);
    });
});

describe('createCheckupEstimateService', () => {
    const PKG_OK = pkg([T(9), O(7, 30)]);
    const PKG_OFF = pkg([T(9)], { id: 2, code: 'pkg_2', name: 'Nonaktif', is_active: false });

    function setup({ packages = [PKG_OK, PKG_OFF], settingValue } = {}) {
        const db = {
            query: jest.fn(async (sql, params) => {
                if (/FROM settings WHERE setting_key = \?/.test(sql)) return [settingValue === undefined ? [] : [{ setting_value: settingValue }]];
                if (/FROM tindakan WHERE id IN/.test(sql)) return [[ADMIN, USG4D].filter(row => params[0].includes(row.id))];
                if (/FROM obat WHERE id IN/.test(sql)) return [[KALSIUM].filter(row => params[0].includes(row.id))];
                if (/^INSERT INTO settings/.test(sql.trim())) return [{}];
                throw new Error(`unexpected SQL ${sql}`);
            })
        };
        const repository = {
            listPackages: jest.fn(async (_db, { activeOnly = false } = {}) => packages.filter(p => !activeOnly || p.is_active)),
            getPackageByCode: jest.fn(async (_db, code) => packages.find(p => p.code === code) || null)
        };
        return { db, repository };
    }

    test('priceAll lists active packages only; priceAllForStaff keeps inactive ones', async () => {
        const { db, repository } = setup();
        const service = createCheckupEstimateService({ db, repository });
        const result = await service.priceAll({ fresh: true });
        expect(result.packages.map(p => p.code)).toEqual(['pkg_1']);
        expect(result.packages[0]).toMatchObject({ ready: true, amount_idr: 310000 });
        const staff = await service.priceAllForStaff();
        expect(staff.packages.map(p => p.code)).toEqual(['pkg_1', 'pkg_2']);
    });

    test('pricePackageByCode is null for a missing or inactive package', async () => {
        const { db, repository } = setup();
        const service = createCheckupEstimateService({ db, repository });
        expect(await service.pricePackageByCode('pkg_1')).toMatchObject({ code: 'pkg_1', ready: true });
        expect(await service.pricePackageByCode('pkg_2')).toBeNull();
        expect(await service.pricePackageByCode('nope')).toBeNull();
    });

    test('the obat query is skipped when no package uses obat', async () => {
        const { db, repository } = setup({ packages: [pkg([T(9)])] });
        await createCheckupEstimateService({ db, repository }).priceAll({ fresh: true });
        expect(db.query.mock.calls.some(([sql]) => /FROM obat/.test(sql))).toBe(false);
    });

    test('the public list is cached briefly; by-code pricing is always fresh; invalidate clears', async () => {
        const { db, repository } = setup();
        let now = new Date('2026-11-18T10:00:00+07:00');
        const service = createCheckupEstimateService({ db, repository, clock: () => now });
        await service.priceAll();
        await service.priceAll();
        expect(db.query).toHaveBeenCalledTimes(2);
        await service.pricePackageByCode('pkg_1');
        expect(db.query).toHaveBeenCalledTimes(4);
        service.invalidate();
        await service.priceAll();
        expect(db.query).toHaveBeenCalledTimes(6);
        now = new Date(now.getTime() + 61 * 1000);
        await service.priceAll();
        expect(db.query).toHaveBeenCalledTimes(8);
    });

    test('loadCatalog returns bookable tindakan and priced obat', async () => {
        const db = {
            query: jest.fn(async sql => {
                if (/FROM tindakan/.test(sql)) return [[USG4D, KONSUL_SINGKAT, { ...USG4D, id: 11, name: 'Konseling X' }]];
                if (/FROM obat/.test(sql)) return [[KALSIUM]];
                throw new Error('unexpected');
            })
        };
        const catalog = await createCheckupEstimateService({ db, repository: {} }).loadCatalog();
        expect(catalog.tindakan).toEqual([{ id: 9, code: 'U4D', name: 'USG 4 Dimensi', category: 'LAYANAN', price: 250000 }]);
        expect(catalog.obat).toEqual([{ id: 7, code: 'OBT7', name: 'Kalsium', unit: 'tablet', price: 1500 }]);
    });
});
