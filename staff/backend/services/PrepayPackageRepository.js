'use strict';

/**
 * Storage for editable "bayar di muka" packages (tables from migrations/20261122_checkup_prepay_packages.sql).
 * Pure data access: input validation is PrepayPackageValidation's job, transactions belong to the caller.
 */

const { CHECKUP_PREPAY_PRODUCTS, CHECKUP_PREPAY_PRODUCT_CODES } = require('../constants/checkupPrepayProducts');

const LEGACY_SORT_STEP = 10;
const ACTOR_MAX_LENGTH = 64;

/** Who made a change: String(actor.id) cut to the column width, NULL when there is no actor. */
function actorId(actor) {
    if (!actor || actor.id === null || actor.id === undefined) return null;
    return String(actor.id).slice(0, ACTOR_MAX_LENGTH);
}

const nullableNumber = value => (value === null || value === undefined ? null : Number(value));

function toItem(row) {
    return {
        item_type: row.item_type,
        ref_id: Number(row.ref_id),
        quantity: Number(row.quantity),
        sort_order: Number(row.sort_order)
    };
}

function toPackage(row, items) {
    return {
        id: Number(row.id),
        code: row.code,
        name: row.name,
        description: row.description === undefined ? null : row.description,
        category: row.category,
        week_min: nullableNumber(row.week_min),
        week_max: nullableNumber(row.week_max),
        is_active: Boolean(Number(row.is_active)),
        sort_order: Number(row.sort_order),
        items: items || []
    };
}

async function attachItems(executor, packageRows) {
    if (!packageRows.length) return [];
    const ids = packageRows.map(row => Number(row.id));
    const [itemRows] = await executor.query(
        `SELECT package_id, item_type, ref_id, quantity, sort_order
           FROM checkup_prepay_package_items
          WHERE package_id IN (?)
          ORDER BY package_id, sort_order, id`,
        [ids]
    );
    const byPackage = new Map();
    for (const row of itemRows) {
        const key = Number(row.package_id);
        if (!byPackage.has(key)) byPackage.set(key, []);
        byPackage.get(key).push(toItem(row));
    }
    return packageRows.map(row => toPackage(row, byPackage.get(Number(row.id))));
}

const PACKAGE_COLUMNS = 'id, code, name, description, category, week_min, week_max, is_active, sort_order';

async function listPackages(executor, { activeOnly = false } = {}) {
    const [rows] = await executor.query(
        `SELECT ${PACKAGE_COLUMNS} FROM checkup_prepay_packages
          ${activeOnly ? 'WHERE is_active = 1' : ''}
          ORDER BY category, sort_order, id`
    );
    return attachItems(executor, rows);
}

async function getPackageByCode(executor, code) {
    const [rows] = await executor.query(
        `SELECT ${PACKAGE_COLUMNS} FROM checkup_prepay_packages WHERE code = ? LIMIT 1`,
        [code]
    );
    if (!rows.length) return null;
    const [pkg] = await attachItems(executor, rows);
    return pkg;
}

async function insertItems(connection, packageId, items) {
    for (const item of items || []) {
        await connection.query(
            `INSERT INTO checkup_prepay_package_items (package_id, item_type, ref_id, quantity, sort_order)
             VALUES (?, ?, ?, ?, ?)`,
            [packageId, item.item_type, item.ref_id, item.quantity, item.sort_order]
        );
    }
}

/**
 * Create (no input.id) or update a package and replace all of its items. The caller owns the
 * transaction. A new package without input.code gets pkg_<id>; a given code (legacy copy) is kept.
 */
async function savePackage(connection, input, actor) {
    const by = actorId(actor);
    const active = input.is_active === false || input.is_active === 0 ? 0 : 1;

    if (input.id === undefined || input.id === null) {
        const [result] = await connection.query(
            `INSERT INTO checkup_prepay_packages
                (code, name, description, category, week_min, week_max, is_active, sort_order, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                input.code || null, input.name, input.description || null, input.category,
                nullableNumber(input.week_min), nullableNumber(input.week_max), active,
                Number(input.sort_order) || 0, by, by
            ]
        );
        const id = Number(result.insertId);
        let code = input.code;
        if (!code) {
            code = `pkg_${id}`;
            await connection.query('UPDATE checkup_prepay_packages SET code = ? WHERE id = ?', [code, id]);
        }
        await insertItems(connection, id, input.items);
        return { id, code };
    }

    const id = Number(input.id);
    const [result] = await connection.query(
        `UPDATE checkup_prepay_packages
            SET name = ?, description = ?, category = ?, week_min = ?, week_max = ?,
                is_active = ?, sort_order = ?, updated_by = ?
          WHERE id = ?`,
        [
            input.name, input.description || null, input.category,
            nullableNumber(input.week_min), nullableNumber(input.week_max), active,
            Number(input.sort_order) || 0, by, id
        ]
    );
    if (!result.affectedRows) throw new Error('Paket tidak ditemukan');
    await connection.query('DELETE FROM checkup_prepay_package_items WHERE package_id = ?', [id]);
    await insertItems(connection, id, input.items);
    return { id, code: input.code };
}

async function setPackageActive(executor, id, active, actor) {
    const [result] = await executor.query(
        'UPDATE checkup_prepay_packages SET is_active = ?, updated_by = ? WHERE id = ?',
        [active ? 1 : 0, actorId(actor), Number(id)]
    );
    return result.affectedRows > 0;
}

/**
 * The four legacy products in checkup_prepay_estimate_v1 as package rows (week range null).
 * Products without items in the mapping are skipped.
 */
function buildPackagesFromMapping(mapping) {
    const categories = mapping && mapping.categories && typeof mapping.categories === 'object' ? mapping.categories : {};
    const rows = [];
    CHECKUP_PREPAY_PRODUCT_CODES.forEach((code, index) => {
        const config = categories[code];
        const rawItems = config && Array.isArray(config.items) ? config.items : [];
        if (!rawItems.length) return;
        const product = CHECKUP_PREPAY_PRODUCTS[code];
        rows.push({
            code,
            name: product.label,
            category: product.category,
            week_min: null,
            week_max: null,
            sort_order: (index + 1) * LEGACY_SORT_STEP,
            items: rawItems.map((item, itemIndex) => ({
                item_type: 'tindakan',
                ref_id: Number(item.tindakan_id),
                quantity: Number(item.quantity),
                sort_order: itemIndex
            }))
        });
    });
    return rows;
}

module.exports = {
    listPackages,
    getPackageByCode,
    savePackage,
    setPackageActive,
    buildPackagesFromMapping
};
