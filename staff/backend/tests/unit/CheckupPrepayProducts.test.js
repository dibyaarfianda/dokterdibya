'use strict';

const fs = require('fs');
const path = require('path');
const {
    CHECKUP_PREPAY_PRODUCTS,
    CHECKUP_PREPAY_PRODUCT_CODES,
    isCheckupPrepayProduct,
    isPackageCodeFormat,
    productCategory,
    productCategoryForCode,
    clearPackageCategoryCache,
    orderLabel,
    productLabel
} = require('../../constants/checkupPrepayProducts');
const { CONSULTATION_CATEGORY_CODES } = require('../../constants/consultationCategories');

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

describe('checkup prepay products', () => {
    test('every product credits one of the booking categories', () => {
        for (const code of CHECKUP_PREPAY_PRODUCT_CODES) {
            expect(CONSULTATION_CATEGORY_CODES).toContain(CHECKUP_PREPAY_PRODUCTS[code].category);
        }
        expect(CHECKUP_PREPAY_PRODUCT_CODES).toEqual(['obstetri', 'obstetri_usg4d', 'gyn_repro', 'gyn_special']);
    });

    test('USG 4D is a Kehamilan product', () => {
        expect(productCategory('obstetri_usg4d')).toBe('obstetri');
        expect(productLabel('obstetri_usg4d')).toBe('Kehamilan + USG 4D');
        expect(isCheckupPrepayProduct('obstetri_usg4d')).toBe(true);
    });

    test('unknown codes have no category', () => {
        expect(productCategory('lainnya')).toBeNull();
        expect(isCheckupPrepayProduct('lainnya')).toBe(false);
        expect(isCheckupPrepayProduct(undefined)).toBe(false);
    });

    test('the browser allow-lists accept any package code format', () => {
        const pattern = '[a-z0-9_]{2,40}';
        expect(read('public', 'scripts', 'checkup-prepay.js')).toContain(`/^${pattern}$/`);
        expect(read('public', 'scripts', 'patient-safe-next.js')).toContain(`/^${pattern}$/`);
    });
});

describe('package codes', () => {
    test.each([
        ['pkg_12', true], ['obstetri', true], ['ab', true], ['a', false], ['A', false],
        ['<script>', false], ['../x', false], ['x'.repeat(41), false], [undefined, false], [12, false]
    ])('isPackageCodeFormat(%p) is %p', (code, expected) => {
        expect(isPackageCodeFormat(code)).toBe(expected);
    });

    describe('productCategoryForCode', () => {
        const rowFor = (code, category) => ({ id: 7, code, name: 'Paket', description: null, category, week_min: null, week_max: null, is_active: 0, sort_order: 10 });
        const executorWith = rows => ({
            query: jest.fn(async sql => (/FROM checkup_prepay_packages/.test(sql) ? [rows] : [[]]))
        });

        beforeEach(() => clearPackageCategoryCache());

        test('reads the package row, active or not', async () => {
            const executor = executorWith([rowFor('pkg_7', 'gyn_repro')]);
            await expect(productCategoryForCode(executor, 'pkg_7')).resolves.toBe('gyn_repro');
        });

        test('caches a found package for 60 seconds', async () => {
            const executor = executorWith([rowFor('pkg_7', 'gyn_repro')]);
            await productCategoryForCode(executor, 'pkg_7');
            const queriesAfterFirst = executor.query.mock.calls.length;
            await productCategoryForCode(executor, 'pkg_7');
            expect(executor.query.mock.calls.length).toBe(queriesAfterFirst);
        });

        test('never caches a miss', async () => {
            const executor = executorWith([]);
            await expect(productCategoryForCode(executor, 'pkg_9')).resolves.toBeNull();
            await expect(productCategoryForCode(executor, 'pkg_9')).resolves.toBeNull();
            expect(executor.query).toHaveBeenCalledTimes(2);
        });

        test('falls back to the legacy map for the four old codes', async () => {
            const executor = executorWith([]);
            await expect(productCategoryForCode(executor, 'obstetri_usg4d')).resolves.toBe('obstetri');
        });

        test('falls back to the legacy map when the package tables do not exist yet', async () => {
            const executor = { query: jest.fn(async () => { throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' }); }) };
            await expect(productCategoryForCode(executor, 'gyn_special')).resolves.toBe('gyn_special');
        });

        test('other database errors are not swallowed', async () => {
            const executor = { query: jest.fn(async () => { throw Object.assign(new Error('lost'), { code: 'ECONNRESET' }); }) };
            await expect(productCategoryForCode(executor, 'pkg_7')).rejects.toThrow('lost');
        });

        test('a bad format never reaches the database', async () => {
            const executor = executorWith([]);
            await expect(productCategoryForCode(executor, '<script>')).resolves.toBeNull();
            expect(executor.query).not.toHaveBeenCalled();
        });
    });

    describe('orderLabel', () => {
        test('prefers the package name frozen in the snapshot', () => {
            expect(orderLabel({ product_code: 'pkg_7', item_snapshot: JSON.stringify({ package_name: 'Paket Trimester 1' }) })).toBe('Paket Trimester 1');
        });

        test.each([
            ['bad JSON', 'not json'],
            ['an empty snapshot', '{}'],
            ['no snapshot', null],
            ['an array', '[1]']
        ])('falls back to the legacy label with %s', (_name, snapshot) => {
            expect(orderLabel({ product_code: 'obstetri_usg4d', item_snapshot: snapshot })).toBe('Kehamilan + USG 4D');
        });

        test('falls back to the code itself for an unknown package', () => {
            expect(orderLabel({ product_code: 'pkg_7', item_snapshot: 'x' })).toBe('pkg_7');
        });
    });
});
