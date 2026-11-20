#!/usr/bin/env node
/**
 * Copy the four legacy prepay products (settings checkup_prepay_estimate_v1) into
 * checkup_prepay_packages / checkup_prepay_package_items.
 * Run migrations/20261122_checkup_prepay_packages.sql first.
 *
 * Idempotent: only codes that do not exist yet are inserted. The settings row is only read,
 * never changed (it stays as a backup).
 *
 * Usage (from staff/backend):
 *   node scripts/migrate-prepay-packages.js            (dry run)
 *   node scripts/migrate-prepay-packages.js --apply
 */
require('dotenv').config({ quiet: true });

const db = require('../db');
const { SETTINGS_KEY, normalizeMapping } = require('../services/CheckupEstimateService');
const { buildPackagesFromMapping, getPackageByCode, savePackage } = require('../services/PrepayPackageRepository');

const SCRIPT_ACTOR = Object.freeze({ id: 'script:migrate-prepay-packages', name: 'migrate-prepay-packages' });

async function readMapping() {
    const [rows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1', [SETTINGS_KEY]);
    if (!rows.length || !rows[0].setting_value) throw new Error(`Pengaturan ${SETTINGS_KEY} tidak ditemukan atau kosong`);
    let parsed;
    try {
        parsed = JSON.parse(rows[0].setting_value);
    } catch (_error) {
        throw new Error(`Pengaturan ${SETTINGS_KEY} rusak (bukan JSON)`);
    }
    const { mapping, errors } = normalizeMapping(parsed);
    if (errors.length) throw new Error('Pengaturan lama bermasalah:\n - ' + errors.join('\n - '));
    return mapping;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const packages = buildPackagesFromMapping(await readMapping());
    if (!packages.length) {
        console.log('Tidak ada produk lama untuk disalin.');
        return;
    }

    const toCreate = [];
    for (const pkg of packages) {
        const existing = await getPackageByCode(db, pkg.code);
        const items = pkg.items.map(item => `${item.item_type}#${item.ref_id} x${item.quantity}`).join(', ');
        console.log(`[${pkg.code}] ${pkg.name} (${pkg.category}) urutan ${pkg.sort_order}: ${items}${existing ? '  -> sudah ada, dilewati' : ''}`);
        if (!existing) toCreate.push(pkg);
    }

    if (!apply) {
        console.log(`\nDry run: ${toCreate.length} paket akan dibuat. Tambahkan --apply untuk menyimpan.`);
        return;
    }
    if (!toCreate.length) {
        console.log('\nSemua paket sudah ada. Tidak ada yang diubah.');
        return;
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        for (const pkg of toCreate) {
            await savePackage(connection, { ...pkg, is_active: true }, SCRIPT_ACTOR);
        }
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
    console.log(`\nTersimpan: ${toCreate.length} paket dibuat.`);
}

main()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
