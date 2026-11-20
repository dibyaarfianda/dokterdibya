'use strict';

/**
 * Products sold as "bayar di muka" (prepaid estimate of one Klinik Privat visit).
 *
 * The product code is the key of the estimate mapping (settings checkup_prepay_estimate_v1)
 * and is stored as payment_orders.product_code. Each product credits the saldo of exactly one
 * booking category (constants/consultationCategories.js); saldo is kept per category so the
 * visit bill of that category can use it (Tahap 2).
 */

const { CONSULTATION_CATEGORIES, isConsultationCategory } = require('./consultationCategories');

const CHECKUP_PREPAY_PRODUCTS = Object.freeze({
    obstetri: Object.freeze({ label: CONSULTATION_CATEGORIES.obstetri, category: 'obstetri' }),
    obstetri_usg4d: Object.freeze({ label: 'Kehamilan + USG 4D', category: 'obstetri' }),
    gyn_repro: Object.freeze({ label: CONSULTATION_CATEGORIES.gyn_repro, category: 'gyn_repro' }),
    gyn_special: Object.freeze({ label: CONSULTATION_CATEGORIES.gyn_special, category: 'gyn_special' })
});

const CHECKUP_PREPAY_PRODUCT_CODES = Object.freeze(Object.keys(CHECKUP_PREPAY_PRODUCTS));

function isCheckupPrepayProduct(code) {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CHECKUP_PREPAY_PRODUCTS, code);
}

/** Saldo category for a product code. Old orders stored the category itself, which maps to itself. */
function productCategory(code) {
    if (isCheckupPrepayProduct(code)) return CHECKUP_PREPAY_PRODUCTS[code].category;
    return isConsultationCategory(code) ? code : null;
}

function productLabel(code) {
    return isCheckupPrepayProduct(code) ? CHECKUP_PREPAY_PRODUCTS[code].label : (CONSULTATION_CATEGORIES[code] || code);
}

module.exports = {
    CHECKUP_PREPAY_PRODUCTS,
    CHECKUP_PREPAY_PRODUCT_CODES,
    isCheckupPrepayProduct,
    productCategory,
    productLabel
};
