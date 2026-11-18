'use strict';

/**
 * Estimated cost of one Klinik Privat visit per booking category, used for the optional
 * "bayar di muka" (prepay) product.
 *
 * The mapping (which tindakan, how many) is stored in settings under SETTINGS_KEY and set with
 * scripts/checkup-prepay-estimate.js. Prices always come live from the tindakan master table, so
 * a price change there changes the estimate. The admin fee (MANDATORY_SERVICE_IDS.admin, as in
 * Estimasi Biaya) is added once per visit automatically and must not be listed in the mapping.
 * Medication and control books are not part of the estimate.
 */

const { MANDATORY_SERVICE_IDS } = require('./EstimasiBiayaDraft');
const { CONSULTATION_CATEGORIES, CONSULTATION_CATEGORY_CODES, isConsultationCategory } = require('../constants/consultationCategories');
const { MIN_AMOUNT_IDR } = require('../utils/duitku-payment');

const SETTINGS_KEY = 'checkup_prepay_estimate_v1';
const SETTINGS_DESCRIPTION = 'Tindakan per kategori untuk estimasi biaya kunjungan (bayar di muka)';
const ALLOWED_SERVICE_CATEGORIES = Object.freeze(['LAYANAN', 'TINDAKAN MEDIS']);
const MAX_ITEMS_PER_CATEGORY = 20;
const MAX_QUANTITY = 10;
const PUBLIC_CACHE_MS = 60 * 1000;

const ADMIN_TINDAKAN_ID = MANDATORY_SERVICE_IDS.admin;

function hasUsablePrice(row) {
    return !!row && row.price !== null && row.price !== undefined && row.price !== ''
        && Number.isFinite(Number(row.price)) && Number(row.price) >= 0;
}

/**
 * Validate a mapping. Returns the valid part plus a list of problems; callers that write the
 * mapping (the CLI) must refuse when errors is not empty.
 * @returns {{mapping: {version:number, updated_at:?string, categories:Object}, errors: string[]}}
 */
function normalizeMapping(input) {
    const errors = [];
    const source = input && typeof input === 'object' ? input : {};
    const categoriesIn = source.categories && typeof source.categories === 'object' ? source.categories : {};
    const categories = {};

    for (const [code, config] of Object.entries(categoriesIn)) {
        if (!isConsultationCategory(code)) {
            errors.push(`Kategori tidak dikenal: ${code}`);
            continue;
        }
        const rawItems = config && Array.isArray(config.items) ? config.items : [];
        if (rawItems.length > MAX_ITEMS_PER_CATEGORY) {
            errors.push(`${code}: maksimal ${MAX_ITEMS_PER_CATEGORY} tindakan`);
            continue;
        }
        const seen = new Set();
        const items = [];
        let valid = true;
        rawItems.forEach((item, index) => {
            const id = Number(item && item.tindakan_id);
            const quantity = Number(item && item.quantity);
            const prefix = `${code} item ${index + 1}`;
            if (!Number.isSafeInteger(id) || id <= 0) {
                errors.push(`${prefix}: tindakan_id tidak valid`);
                valid = false;
                return;
            }
            if (id === ADMIN_TINDAKAN_ID) {
                errors.push(`${prefix}: biaya admin (tindakan ${ADMIN_TINDAKAN_ID}) ditambahkan otomatis, jangan dimasukkan`);
                valid = false;
                return;
            }
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
                errors.push(`${prefix}: jumlah harus 1-${MAX_QUANTITY}`);
                valid = false;
                return;
            }
            if (seen.has(id)) {
                errors.push(`${prefix}: tindakan ${id} tercantum dua kali`);
                valid = false;
                return;
            }
            seen.add(id);
            items.push({ tindakan_id: id, quantity });
        });
        if (valid && items.length) categories[code] = { items };
    }

    return {
        mapping: { version: 1, updated_at: typeof source.updated_at === 'string' ? source.updated_at : null, categories },
        errors
    };
}

/** Every tindakan id the mapping needs priced, including the admin fee. */
function tindakanIdsFor(mapping) {
    const ids = new Set([ADMIN_TINDAKAN_ID]);
    Object.values(mapping.categories || {}).forEach(config => {
        (config.items || []).forEach(item => ids.add(item.tindakan_id));
    });
    return [...ids];
}

/**
 * Price every category from tindakan rows. Pure: no database access.
 * A category is ready only when every line has an active master row with a usable price and the
 * rounded-up total reaches the Duitku minimum.
 */
function priceMapping(mapping, tindakanRows, { minAmount = MIN_AMOUNT_IDR } = {}) {
    const rows = new Map((tindakanRows || []).map(row => [Number(row.id), row]));
    const admin = rows.get(ADMIN_TINDAKAN_ID);
    const adminReady = !!admin && Number(admin.is_active) === 1 && hasUsablePrice(admin);

    return CONSULTATION_CATEGORY_CODES.map(code => {
        const label = CONSULTATION_CATEGORIES[code];
        const config = mapping.categories && mapping.categories[code];
        if (!config || !config.items || !config.items.length) {
            return { code, label, ready: false, amount_idr: null, raw_total: null, issues: ['Belum diatur'], items: [] };
        }

        const issues = [];
        const items = [];
        if (adminReady) {
            const price = Number(admin.price);
            items.push({ tindakan_id: ADMIN_TINDAKAN_ID, code: admin.code || null, name: admin.name, unit_price: price, quantity: 1, subtotal: price });
        } else {
            issues.push(`Biaya admin (tindakan ${ADMIN_TINDAKAN_ID}) belum tersedia atau nonaktif`);
        }

        config.items.forEach(item => {
            const master = rows.get(item.tindakan_id);
            const problems = [];
            if (!master || Number(master.is_active) !== 1) problems.push('tidak ada atau nonaktif');
            if (master && !ALLOWED_SERVICE_CATEGORIES.includes(master.category)) problems.push(`kategori ${master.category || '-'} tidak diizinkan`);
            if (!hasUsablePrice(master)) problems.push('harga belum tersedia');
            if (problems.length) {
                issues.push(`Tindakan ${item.tindakan_id}: ${problems.join('; ')}`);
                return;
            }
            const price = Number(master.price);
            items.push({
                tindakan_id: item.tindakan_id,
                code: master.code || null,
                name: master.name,
                unit_price: price,
                quantity: item.quantity,
                subtotal: price * item.quantity
            });
        });

        const rawTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const amount = Math.ceil(rawTotal);
        if (!issues.length && amount < minAmount) {
            issues.push(`Total Rp${amount.toLocaleString('id-ID')} di bawah minimum pembayaran Rp${minAmount.toLocaleString('id-ID')}`);
        }
        const ready = issues.length === 0;
        return { code, label, ready, amount_idr: ready ? amount : null, raw_total: rawTotal, issues, items };
    });
}

/** What patients and the public page may see of a priced category: no ids, no internal issues. */
function toPublicEstimate(category) {
    return {
        code: category.code,
        label: category.label,
        ready: !!category.ready,
        amount_idr: category.ready ? category.amount_idr : null,
        items: category.ready
            ? category.items.map(item => ({ name: item.name, quantity: item.quantity, subtotal_idr: Math.ceil(item.subtotal) }))
            : []
    };
}

function createCheckupEstimateService({ db, clock = () => new Date(), cacheMs = PUBLIC_CACHE_MS } = {}) {
    let cache = null;

    async function loadMapping() {
        const [rows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1', [SETTINGS_KEY]);
        if (!rows.length || !rows[0].setting_value) return normalizeMapping({});
        let parsed;
        try {
            parsed = JSON.parse(rows[0].setting_value);
        } catch (_error) {
            return { mapping: normalizeMapping({}).mapping, errors: ['Pengaturan estimasi rusak (bukan JSON)'] };
        }
        return normalizeMapping(parsed);
    }

    async function loadTindakan(ids) {
        const unique = [...new Set(ids)].filter(id => Number.isSafeInteger(id) && id > 0);
        if (!unique.length) return [];
        const [rows] = await db.query(
            `SELECT id, code, name, category, price, is_active FROM tindakan WHERE id IN (${unique.map(() => '?').join(',')})`,
            unique
        );
        return rows;
    }

    /** Price every category. fresh=false allows a short in-process cache (public endpoint only). */
    async function priceAll({ fresh = false } = {}) {
        const now = clock();
        if (!fresh && cache && now.getTime() - cache.at < cacheMs) return cache.value;
        const { mapping, errors } = await loadMapping();
        const tindakan = await loadTindakan(tindakanIdsFor(mapping));
        const value = {
            mapping,
            mapping_errors: errors,
            priced_at: now,
            categories: priceMapping(mapping, tindakan)
        };
        cache = { at: now.getTime(), value };
        return value;
    }

    /** Always fresh: used when an order is created, so the amount reflects current prices. */
    async function priceCategory(code) {
        const result = await priceAll({ fresh: true });
        const category = result.categories.find(entry => entry.code === code) || null;
        return { category, mapping: result.mapping, priced_at: result.priced_at };
    }

    async function saveMapping(mapping) {
        const { mapping: normalized, errors } = normalizeMapping(mapping);
        if (errors.length) throw new Error(errors.join('\n'));
        const stored = { ...normalized, updated_at: clock().toISOString() };
        await db.query(
            `INSERT INTO settings (setting_key, setting_value, description) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
            [SETTINGS_KEY, JSON.stringify(stored), SETTINGS_DESCRIPTION]
        );
        cache = null;
        return stored;
    }

    return { loadMapping, loadTindakan, priceAll, priceCategory, saveMapping };
}

let defaultService = null;
function getCheckupEstimateService() {
    if (!defaultService) defaultService = createCheckupEstimateService({ db: require('../db') });
    return defaultService;
}

module.exports = {
    SETTINGS_KEY,
    ADMIN_TINDAKAN_ID,
    ALLOWED_SERVICE_CATEGORIES,
    MAX_ITEMS_PER_CATEGORY,
    MAX_QUANTITY,
    normalizeMapping,
    tindakanIdsFor,
    priceMapping,
    toPublicEstimate,
    createCheckupEstimateService,
    getCheckupEstimateService
};
