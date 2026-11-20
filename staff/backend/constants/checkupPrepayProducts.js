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

// ---- Package codes (editable packages replace the four fixed products) ----

const PACKAGE_CODE_PATTERN = /^[a-z0-9_]{2,40}$/;
const PACKAGE_CATEGORY_CACHE_MS = 60 * 1000;
const packageCategoryCache = new Map(); // code -> { category, expiresAt }; misses are never cached

function isPackageCodeFormat(code) {
    return typeof code === 'string' && PACKAGE_CODE_PATTERN.test(code);
}

function clearPackageCategoryCache() {
    packageCategoryCache.clear();
}

/**
 * Saldo category of a package code: the package row (active or not, cached 60 s), else the
 * legacy product map for the four old codes, else null.
 * The repository is required lazily because it requires this module at load time.
 */
async function productCategoryForCode(executor, code) {
    if (!isPackageCodeFormat(code)) return null;
    const cached = packageCategoryCache.get(code);
    if (cached && cached.expiresAt > Date.now()) return cached.category;

    let pkg = null;
    try {
        pkg = await require('../services/PrepayPackageRepository').getPackageByCode(executor, code);
    } catch (error) {
        // Tables not migrated yet: only the legacy codes can be resolved.
        if (!error || error.code !== 'ER_NO_SUCH_TABLE') throw error;
    }
    if (pkg && pkg.category) {
        packageCategoryCache.set(code, { category: pkg.category, expiresAt: Date.now() + PACKAGE_CATEGORY_CACHE_MS });
        return pkg.category;
    }
    return productCategory(code);
}

/** Parses payment_orders.item_snapshot defensively: anything but a JSON object gives null. */
function parseOrderSnapshot(order) {
    const raw = order && order.item_snapshot;
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string' || !raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_error) {
        return null;
    }
}

/** Label of an order: the package name frozen in its snapshot, else the legacy label, else the code. */
function orderLabel(order) {
    const snapshot = parseOrderSnapshot(order);
    const name = snapshot && typeof snapshot.package_name === 'string' ? snapshot.package_name.trim() : '';
    return name || productLabel(order && order.product_code) || (order && order.product_code) || null;
}

module.exports = {
    CHECKUP_PREPAY_PRODUCTS,
    CHECKUP_PREPAY_PRODUCT_CODES,
    isCheckupPrepayProduct,
    isPackageCodeFormat,
    productCategory,
    productCategoryForCode,
    clearPackageCategoryCache,
    parseOrderSnapshot,
    orderLabel,
    productLabel
};
