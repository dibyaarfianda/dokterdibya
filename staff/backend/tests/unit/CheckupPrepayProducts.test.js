'use strict';

const fs = require('fs');
const path = require('path');
const {
    CHECKUP_PREPAY_PRODUCTS,
    CHECKUP_PREPAY_PRODUCT_CODES,
    isCheckupPrepayProduct,
    productCategory,
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

    test('the browser allow-lists accept exactly the product codes', () => {
        const pattern = `(?:${CHECKUP_PREPAY_PRODUCT_CODES.join('|')})`;
        expect(read('public', 'scripts', 'checkup-prepay.js')).toContain(`/^${pattern}$/`);
        expect(read('public', 'scripts', 'patient-safe-next.js')).toContain(`/^${pattern}$/`);
    });
});
