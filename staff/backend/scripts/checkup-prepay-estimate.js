#!/usr/bin/env node
/**
 * Inspect the editable "bayar di muka" packages. Packages are created and edited on the staff page
 * Pembayaran di Muka, tab Paket (doctor/superadmin only); this script only reads.
 * Prices are read live from the tindakan and obat tables; the admin fee is added automatically.
 *
 * Usage (from staff/backend):
 *   node scripts/checkup-prepay-estimate.js list-tindakan
 *   node scripts/checkup-prepay-estimate.js show
 */
require('dotenv').config({ quiet: true });

const db = require('../db');
const {
    ADMIN_TINDAKAN_ID,
    ALLOWED_SERVICE_CATEGORIES,
    createCheckupEstimateService
} = require('../services/CheckupEstimateService');

const rupiah = value => (value === null || value === undefined ? '-' : `Rp${Math.round(Number(value)).toLocaleString('id-ID')}`);

function printPackages(packages) {
    packages.forEach(pkgRow => {
        console.log(`\n[${pkgRow.code}] ${pkgRow.name}${pkgRow.is_active ? '' : ' (nonaktif)'} -> ${pkgRow.ready ? rupiah(pkgRow.amount_idr) : 'BELUM SIAP'}`);
        pkgRow.items.forEach(item => {
            console.log(`   - ${item.item_type} #${item.ref_id} ${item.name} x${item.quantity} @ ${rupiah(item.unit_price)} = ${rupiah(item.subtotal)}`);
        });
        pkgRow.issues.forEach(issue => console.log(`   ! ${issue}`));
    });
}

async function main() {
    const [command] = process.argv.slice(2);
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
        const result = await estimates.priceAllForStaff();
        printPackages(result.packages);
        return;
    }

    console.log('Perintah: list-tindakan | show');
    process.exitCode = 1;
}

main()
    .catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
