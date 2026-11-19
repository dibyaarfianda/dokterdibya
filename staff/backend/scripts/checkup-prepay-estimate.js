#!/usr/bin/env node
/**
 * Set which tindakan make up the estimated cost of one Klinik Privat visit per booking category
 * (the "bayar di muka" product). Prices are read live from the tindakan table; the admin fee is
 * added automatically.
 *
 * Usage (from staff/backend):
 *   node scripts/checkup-prepay-estimate.js list-tindakan
 *   node scripts/checkup-prepay-estimate.js show
 *   node scripts/checkup-prepay-estimate.js set obstetri 12:1,34:1          (dry run)
 *   node scripts/checkup-prepay-estimate.js set obstetri 12:1,34:1 --apply
 *   node scripts/checkup-prepay-estimate.js clear gyn_special --apply
 */
require('dotenv').config({ quiet: true });

const db = require('../db');
const {
    ADMIN_TINDAKAN_ID,
    ALLOWED_SERVICE_CATEGORIES,
    normalizeMapping,
    tindakanIdsFor,
    priceMapping,
    createCheckupEstimateService
} = require('../services/CheckupEstimateService');
const { CONSULTATION_CATEGORY_CODES, isConsultationCategory } = require('../constants/consultationCategories');

const rupiah = value => (value === null || value === undefined ? '-' : `Rp${Math.round(Number(value)).toLocaleString('id-ID')}`);

function printPriced(categories) {
    categories.forEach(category => {
        console.log(`\n[${category.code}] ${category.label} -> ${category.ready ? rupiah(category.amount_idr) : 'BELUM SIAP'}`);
        category.items.forEach(item => {
            console.log(`   - #${item.tindakan_id} ${item.name} x${item.quantity} @ ${rupiah(item.unit_price)} = ${rupiah(item.subtotal)}`);
        });
        category.issues.forEach(issue => console.log(`   ! ${issue}`));
    });
}

function parseItems(spec) {
    return String(spec || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const [id, quantity = '1'] = part.split(':');
            return { tindakan_id: Number(id), quantity: Number(quantity) };
        });
}

async function main() {
    const [command, category, itemSpec] = process.argv.slice(2).filter(arg => arg !== '--apply');
    const apply = process.argv.includes('--apply');
    const estimates = createCheckupEstimateService({ db });

    if (command === 'list-tindakan') {
        const [rows] = await db.query(
            `SELECT id, code, name, category, price FROM tindakan
              WHERE is_active = 1 AND (category IN (?, ?) OR id = ?)
              ORDER BY category, name`,
            [...ALLOWED_SERVICE_CATEGORIES, ADMIN_TINDAKAN_ID]
        );
        rows.forEach(row => {
            const note = Number(row.id) === ADMIN_TINDAKAN_ID ? '  (admin, otomatis)' : '';
            console.log(`#${row.id}\t${row.category}\t${rupiah(row.price)}\t${row.name}${note}`);
        });
        return;
    }

    if (command === 'show') {
        const result = await estimates.priceAll({ fresh: true });
        if (result.mapping_errors.length) console.log('Masalah pengaturan tersimpan:\n - ' + result.mapping_errors.join('\n - '));
        printPriced(result.categories);
        return;
    }

    if (command === 'set' || command === 'clear') {
        if (!isConsultationCategory(category)) {
            throw new Error(`Kategori harus salah satu dari: ${CONSULTATION_CATEGORY_CODES.join(', ')}`);
        }
        const { mapping } = await estimates.loadMapping();
        const next = { ...mapping, categories: { ...mapping.categories } };
        if (command === 'clear') {
            delete next.categories[category];
        } else {
            const items = parseItems(itemSpec);
            if (!items.length) throw new Error('Isi tindakan, misalnya: 12:1,34:1 (id:jumlah)');
            next.categories[category] = { items };
        }

        const { mapping: normalized, errors } = normalizeMapping(next);
        if (errors.length) throw new Error('Pengaturan ditolak:\n - ' + errors.join('\n - '));

        const tindakan = await estimates.loadTindakan(tindakanIdsFor(normalized));
        printPriced(priceMapping(normalized, tindakan));

        if (!apply) {
            console.log('\nDry run. Tambahkan --apply untuk menyimpan.');
            return;
        }
        await estimates.saveMapping(normalized);
        console.log('\nTersimpan.');
        return;
    }

    console.log('Perintah: list-tindakan | show | set <kategori> <id:jumlah,...> [--apply] | clear <kategori> [--apply]');
    process.exitCode = 1;
}

main()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
