'use strict';

/**
 * Estimated cost of one Klinik Privat visit per prepay package (tables checkup_prepay_packages and
 * checkup_prepay_package_items, read through PrepayPackageRepository). A package lists tindakan and
 * obat with quantities; prices always come live from the tindakan/obat master tables, so a price
 * change there changes the estimate. The admin fee (MANDATORY_SERVICE_IDS.admin) is added once per
 * package automatically and is never an item. Consultation tindakan can never be in a package.
 *
 * The settings-mapping helpers at the bottom are the legacy model, kept only for the deploy-time migration script.
 */

const { MANDATORY_SERVICE_IDS } = require('./EstimasiBiayaDraft');
const { isCheckupPrepayProduct } = require('../constants/checkupPrepayProducts');
const { MIN_AMOUNT_IDR } = require('../utils/duitku-payment');
const { CONSULTATION_CATEGORY_CODES } = require('../constants/consultationCategories');

const SETTINGS_KEY = 'checkup_prepay_estimate_v1';
const ALLOWED_SERVICE_CATEGORIES = Object.freeze(['LAYANAN', 'TINDAKAN MEDIS']);
const MAX_ITEMS_PER_CATEGORY = 20;
const MAX_QUANTITY = 10;
const PUBLIC_CACHE_MS = 60 * 1000;

const CONSULTATION_PATTERN = /\bkonsul|konseling/i;
const NAME_MAX = 120;
const DESCRIPTION_MAX = 255;
const WEEK_MAX = 45;
const PACKAGE_MAX_ITEMS = 20;
const PACKAGE_TINDAKAN_MAX_QUANTITY = 10;
const PACKAGE_OBAT_MAX_QUANTITY = 200;
const PACKAGE_ITEM_TYPES = Object.freeze(['tindakan', 'obat']);

const ADMIN_TINDAKAN_ID = MANDATORY_SERVICE_IDS.admin;

function hasUsablePrice(row) {
    return !!row && row.price !== null && row.price !== undefined && row.price !== ''
        && Number.isFinite(Number(row.price)) && Number(row.price) >= 0;
}

function isConsultationTindakan(row) {
    return !!row && CONSULTATION_PATTERN.test(String(row.name || ''));
}

const isBlank = value => value === null || value === undefined || value === '';

function toInt(value) {
    if (typeof value === 'string' && !/^-?\d+$/.test(value.trim())) return NaN;
    const number = Number(value);
    return Number.isInteger(number) ? number : NaN;
}

function toActiveFlag(value) {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value === 'string') return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
    return Boolean(value);
}

/**
 * Validate a package form. `tindakan` (optional Map<id,row>) lets the consultation rule see names.
 * @returns {{value: Object, errors: string[]}}
 */
function normalizePackageInput(input, { tindakan } = {}) {
    const errors = [];
    const source = input && typeof input === 'object' ? input : {};

    const name = typeof source.name === 'string' ? source.name.trim() : '';
    if (!name || name.length > NAME_MAX) errors.push(`Nama paket harus 1-${NAME_MAX} karakter`);

    const descriptionRaw = typeof source.description === 'string' ? source.description.trim() : '';
    if (descriptionRaw.length > DESCRIPTION_MAX) errors.push(`Deskripsi maksimal ${DESCRIPTION_MAX} karakter`);
    const description = descriptionRaw || null;

    const category = typeof source.category === 'string' ? source.category : '';
    if (!CONSULTATION_CATEGORY_CODES.includes(category)) errors.push('Kategori tidak valid');

    let weekMin = null;
    let weekMax = null;
    const hasMin = !isBlank(source.week_min);
    const hasMax = !isBlank(source.week_max);
    if (hasMin || hasMax) {
        weekMin = hasMin ? toInt(source.week_min) : NaN;
        weekMax = hasMax ? toInt(source.week_max) : NaN;
        if (!Number.isInteger(weekMin) || !Number.isInteger(weekMax) || weekMin < 0 || weekMax > WEEK_MAX || weekMin > weekMax) {
            errors.push(`Rentang minggu harus bilangan bulat 0 sampai ${WEEK_MAX} dan minimum tidak melebihi maksimum`);
            weekMin = null;
            weekMax = null;
        } else if (category !== 'obstetri') {
            errors.push('Rentang minggu hanya untuk kategori Kehamilan (obstetri)');
        }
    }

    const rawItems = Array.isArray(source.items) ? source.items : [];
    if (rawItems.length < 1 || rawItems.length > PACKAGE_MAX_ITEMS) errors.push(`Paket harus berisi 1-${PACKAGE_MAX_ITEMS} item`);
    const seen = new Set();
    const items = [];
    rawItems.slice(0, PACKAGE_MAX_ITEMS).forEach((item, index) => {
        const prefix = `Item ${index + 1}`;
        const type = item && item.item_type;
        const refId = toInt(item && item.ref_id);
        const quantity = toInt(item && item.quantity);
        if (!PACKAGE_ITEM_TYPES.includes(type)) {
            errors.push(`${prefix}: jenis item harus tindakan atau obat`);
            return;
        }
        if (!Number.isSafeInteger(refId) || refId <= 0) {
            errors.push(`${prefix}: id tidak valid`);
            return;
        }
        const maxQuantity = type === 'tindakan' ? PACKAGE_TINDAKAN_MAX_QUANTITY : PACKAGE_OBAT_MAX_QUANTITY;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
            errors.push(`${prefix}: jumlah harus 1-${maxQuantity}`);
            return;
        }
        if (type === 'tindakan' && refId === ADMIN_TINDAKAN_ID) {
            errors.push(`${prefix}: biaya admin (tindakan ${ADMIN_TINDAKAN_ID}) ditambahkan otomatis, jangan dimasukkan`);
            return;
        }
        const key = `${type}:${refId}`;
        if (seen.has(key)) {
            errors.push(`${prefix}: ${type} ${refId} tercantum dua kali`);
            return;
        }
        seen.add(key);
        if (type === 'tindakan' && tindakan && isConsultationTindakan(tindakan.get(refId))) {
            errors.push(`${prefix}: konsultasi tidak boleh di paket`);
            return;
        }
        items.push({ item_type: type, ref_id: refId, quantity, sort_order: items.length });
    });

    return {
        value: {
            name,
            description,
            category,
            week_min: weekMin,
            week_max: weekMax,
            is_active: toActiveFlag(source.is_active),
            sort_order: Number.isInteger(toInt(source.sort_order)) ? toInt(source.sort_order) : 0,
            items
        },
        errors
    };
}

const isActiveRow = row => !!row && Number(row.is_active) === 1;

/**
 * Price one package. Pure: rows come in as Maps. Ready only with no issues and a rounded-up total
 * that reaches the Duitku minimum. The admin fee (tindakan 1) is added once, first.
 */
function pricePackage(pkgInput, { tindakan = new Map(), obat = new Map() } = {}, { minAmount = MIN_AMOUNT_IDR } = {}) {
    const issues = [];
    const items = [];

    const admin = tindakan.get(ADMIN_TINDAKAN_ID);
    if (isActiveRow(admin) && hasUsablePrice(admin)) {
        const price = Number(admin.price);
        items.push({ item_type: 'tindakan', ref_id: ADMIN_TINDAKAN_ID, name: admin.name, unit_price: price, quantity: 1, subtotal: price });
    } else {
        issues.push(`Biaya admin (tindakan ${ADMIN_TINDAKAN_ID}) belum tersedia atau nonaktif`);
    }

    (pkgInput.items || []).forEach(item => {
        const isObat = item.item_type === 'obat';
        const master = (isObat ? obat : tindakan).get(Number(item.ref_id));
        const problems = [];
        if (!isActiveRow(master)) problems.push('tidak ada atau nonaktif');
        if (master && !isObat && !ALLOWED_SERVICE_CATEGORIES.includes(master.category)) problems.push(`kategori ${master.category || '-'} tidak diizinkan`);
        if (master && !isObat && isConsultationTindakan(master)) problems.push('konsultasi tidak boleh di paket');
        if (master && !hasUsablePrice(master)) problems.push('harga belum tersedia');
        if (problems.length) {
            issues.push(`${isObat ? 'Obat' : 'Tindakan'} ${item.ref_id}: ${problems.join('; ')}`);
            return;
        }
        const price = Number(master.price);
        items.push({ item_type: item.item_type, ref_id: Number(item.ref_id), name: master.name, unit_price: price, quantity: item.quantity, subtotal: price * item.quantity });
    });

    const rawTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const amount = Math.ceil(rawTotal);
    if (!issues.length && amount < minAmount) {
        issues.push(`Total Rp${amount.toLocaleString('id-ID')} di bawah minimum pembayaran Rp${minAmount.toLocaleString('id-ID')}`);
    }
    const ready = issues.length === 0;
    return {
        id: pkgInput.id,
        code: pkgInput.code,
        name: pkgInput.name,
        description: pkgInput.description === undefined ? null : pkgInput.description,
        category: pkgInput.category,
        week_min: pkgInput.week_min === undefined ? null : pkgInput.week_min,
        week_max: pkgInput.week_max === undefined ? null : pkgInput.week_max,
        sort_order: pkgInput.sort_order,
        is_active: pkgInput.is_active,
        ready,
        amount_idr: ready ? amount : null,
        raw_total: rawTotal,
        issues,
        items
    };
}

/** What patients and the public page may see of a priced package: no ids, no internal issues. */
function toPublicEstimate(priced) {
    return {
        code: priced.code,
        name: priced.name,
        label: priced.name,
        category: priced.category,
        week_min: priced.week_min,
        week_max: priced.week_max,
        sort_order: priced.sort_order,
        ready: !!priced.ready,
        amount_idr: priced.ready ? priced.amount_idr : null,
        items: priced.ready
            ? priced.items.map(item => ({ name: item.name, quantity: item.quantity, subtotal_idr: Math.ceil(item.subtotal) }))
            : []
    };
}

function createCheckupEstimateService({ db, repository = require('./PrepayPackageRepository'), clock = () => new Date(), cacheMs = PUBLIC_CACHE_MS } = {}) {
    let cache = null;

    async function loadRows(packages) {
        const tindakanIds = new Set([ADMIN_TINDAKAN_ID]);
        const obatIds = new Set();
        packages.forEach(pkgRow => (pkgRow.items || []).forEach(item => {
            (item.item_type === 'obat' ? obatIds : tindakanIds).add(Number(item.ref_id));
        }));
        const [tindakanRows] = await db.query(
            'SELECT id, code, name, category, price, is_active FROM tindakan WHERE id IN (?)',
            [[...tindakanIds]]
        );
        let obatRows = [];
        if (obatIds.size) {
            [obatRows] = await db.query(
                'SELECT id, code, name, category, price, unit, is_active FROM obat WHERE id IN (?)',
                [[...obatIds]]
            );
        }
        return {
            tindakan: new Map(tindakanRows.map(row => [Number(row.id), row])),
            obat: new Map(obatRows.map(row => [Number(row.id), row]))
        };
    }

    async function priceList(packages) {
        const rows = await loadRows(packages);
        return packages.map(pkgRow => pricePackage(pkgRow, rows));
    }

    /** Active packages, ready or not. fresh=false allows a short in-process cache (public endpoint only). */
    async function priceAll({ fresh = false } = {}) {
        const now = clock();
        if (!fresh && cache && now.getTime() - cache.at < cacheMs) return cache.value;
        const packages = await repository.listPackages(db, { activeOnly: true });
        const value = { priced_at: now, packages: await priceList(packages) };
        cache = { at: now.getTime(), value };
        return value;
    }

    /** Always fresh: used when an order is created, so the amount reflects current prices. */
    async function pricePackageByCode(code) {
        const pkgRow = await repository.getPackageByCode(db, code);
        if (!pkgRow || !pkgRow.is_active) return null;
        const [priced] = await priceList([pkgRow]);
        return priced;
    }

    /** Staff view: active and inactive, always fresh. */
    async function priceAllForStaff() {
        const packages = await repository.listPackages(db);
        return { priced_at: clock(), packages: await priceList(packages) };
    }

    /** What the package editor may pick from. */
    async function loadCatalog() {
        const [tindakanRows] = await db.query(
            `SELECT id, code, name, category, price FROM tindakan
              WHERE is_active = 1 AND category IN (?, ?) AND id <> ?
              ORDER BY category, name`,
            [...ALLOWED_SERVICE_CATEGORIES, ADMIN_TINDAKAN_ID]
        );
        const [obatRows] = await db.query(
            'SELECT id, code, name, unit, price FROM obat WHERE is_active = 1 AND price IS NOT NULL ORDER BY name'
        );
        return {
            tindakan: tindakanRows
                .filter(row => !isConsultationTindakan(row))
                .map(row => ({ id: Number(row.id), code: row.code || null, name: row.name, category: row.category, price: row.price === null ? null : Number(row.price) })),
            obat: obatRows.map(row => ({ id: Number(row.id), code: row.code || null, name: row.name, unit: row.unit || null, price: Number(row.price) }))
        };
    }

    function invalidate() {
        cache = null;
    }

    return { priceAll, pricePackageByCode, priceAllForStaff, loadCatalog, invalidate };
}

// ---- Legacy settings mapping, kept ONLY for scripts/migrate-prepay-packages.js, which reads the old
// checkup_prepay_estimate_v1 setting with SETTINGS_KEY and normalizeMapping at deploy time. Nothing else uses it. ----

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
        if (!isCheckupPrepayProduct(code)) {
            errors.push(`Produk tidak dikenal: ${code}`);
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

let defaultService = null;
function getCheckupEstimateService() {
    if (!defaultService) defaultService = createCheckupEstimateService({ db: require('../db') });
    return defaultService;
}

module.exports = {
    CONSULTATION_PATTERN,
    isConsultationTindakan,
    normalizePackageInput,
    pricePackage,
    SETTINGS_KEY,
    ADMIN_TINDAKAN_ID,
    ALLOWED_SERVICE_CATEGORIES,
    MAX_ITEMS_PER_CATEGORY,
    MAX_QUANTITY,
    normalizeMapping,
    toPublicEstimate,
    createCheckupEstimateService,
    getCheckupEstimateService
};
