// Approved tariff rollout. Defaults to read-only; run from staff/backend.
// node scripts/apply-tindakan-tariffs-20260922.js --apply /absolute/private/backup-directory
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const tariffs = [
    [6, 'S06', 'USG 2 Dimensi', 'LAYANAN', 'USG 2D', 110000, 140000],
    [9, 'S09', 'USG 4 Dimensi', 'LAYANAN', 'USG 4D', 200000, 250000],
    [8, 'S08', 'USG Transvaginal', 'LAYANAN', 'USG transvaginal', 170000, 225000],
    [7, 'S07', 'USG Kelainan Janin (18-23 minggu)', 'LAYANAN', 'USG kelainan janin', 300000, 375000],
    [10, 'S10', 'USG 2 Dimensi Janin Kembar', 'LAYANAN', 'USG 2D kembar', 200000, 280000],
    [11, 'S11', 'USG 4 Dimensi Janin Kembar', 'LAYANAN', 'USG 4D kembar', 400000, 500000],
    [46, 'S46', 'USG post tindakan', 'LAYANAN', 'USG setelah tindakan', 80000, 110000],
    [5, 'S05', 'Rekam Jantung Janin (NST/CTG)', 'LAYANAN', 'NST/CTG', 50000, 100000],
    [40, 'S40', 'Konsultasi', 'LAYANAN', 'Konsultasi mandiri', 70000, 100000],
    [56, 'S56', 'Konsul Singkat', 'LAYANAN', 'Konsul singkat', 30000, 70000],
    [42, 'S42', 'Konseling Fertilitas/Keguguran berulang', 'LAYANAN', 'Konseling fertilitas/keguguran berulang', 100000, 150000],
    [58, 'S58', 'Konseling Prapersalinan', 'LAYANAN', 'Konseling prapersalinan', 150000, 200000],
    [13, 'S14', 'Stripping of Membrane', 'TINDAKAN MEDIS', 'Stripping of membrane', 70000, 100000],
    [16, 'S17', 'Inspeksi Mulut Rahim Dengan Alat (Inspekulo)', 'TINDAKAN MEDIS', 'Inspekulo', 50000, 70000],
    [18, 'S19', 'Perawatan Luka', 'TINDAKAN MEDIS', 'Perawatan luka', 50000, 100000],
    [50, 'S50', 'Perawatan Luka Dokter Spesialis', 'TINDAKAN MEDIS', 'Perawatan luka dokter spesialis', 100000, 150000],
    [1, 'S01', 'Biaya Admin', 'ADMINISTRATIF', 'Admin', 10000, 15000],
    [2, 'S02', 'Surat Keterangan SpOG', 'ADMINISTRATIF', 'Surat keterangan SpOG', 20000, 25000]
].map(([id, code, name, category, label, oldPrice, newPrice]) => ({ id, code, name, category, label, oldPrice, newPrice }));

function validateRows(rows) {
    if (rows.length !== tariffs.length) throw new Error('Expected exactly 18 matched tindakan');
    return tariffs.filter(t => {
        const row = rows.find(r => r.id === t.id);
        if (!row || row.code !== t.code || row.name !== t.name || row.category !== t.category || Number(row.is_active) !== 1) {
            throw new Error(`Identity mismatch for tindakan ${t.id}`);
        }
        if (![t.oldPrice, t.newPrice].includes(Number(row.price))) throw new Error(`Unexpected price for tindakan ${t.id}`);
        return Number(row.price) !== t.newPrice;
    });
}

async function billingFingerprint(connection) {
    const result = {};
    for (const table of ['billings', 'billing_items', 'sunday_clinic_billings', 'sunday_clinic_billing_items',
        'sunday_clinic_additional_billings', 'sunday_clinic_additional_billing_items']) {
        const [rows] = await connection.query(`SELECT * FROM ${table} ORDER BY id`);
        result[table] = { count: rows.length, sha256: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    }
    return result;
}

async function main() {
    const apply = process.argv[2] === '--apply';
    const backupDir = process.argv[3];
    if (apply && (!backupDir || !path.isAbsolute(backupDir))) throw new Error('Absolute backup directory required');
    const db = require('../db');
    let connection;
    try {
        connection = await db.getConnection();
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT * FROM tindakan WHERE id IN (?) ORDER BY id' + (apply ? ' FOR UPDATE' : ''),
            [tariffs.map(t => t.id)]);
        const changes = validateRows(rows);
        if (!apply) {
            await connection.rollback();
            console.log(JSON.stringify({ mode: 'dry-run', matched: rows.length, pending: changes.length, tariffs }));
            return;
        }
        const before = await billingFingerprint(connection);
        fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
        const backupFile = path.join(backupDir, `tindakan-before-${Date.now()}.json`);
        fs.writeFileSync(backupFile, JSON.stringify({ recordedAt: new Date().toISOString(), rows, billing: before }, null, 2),
            { flag: 'wx', mode: 0o600 });
        for (const t of changes) {
            const [result] = await connection.query(`UPDATE tindakan
                SET previous_price = price, price_changed_at = NOW(3), price = ?, updated_by = ?
                WHERE id = ? AND price = ?`, [t.newPrice, 'approved-tariff-rollout-20260922', t.id, t.oldPrice]);
            if (result.affectedRows !== 1) throw new Error(`Update failed for tindakan ${t.id}`);
        }
        const [after] = await connection.query('SELECT * FROM tindakan WHERE id IN (?) ORDER BY id', [tariffs.map(t => t.id)]);
        if (validateRows(after).length) throw new Error('Tariff verification failed');
        const billingAfter = await billingFingerprint(connection);
        if (JSON.stringify(before) !== JSON.stringify(billingAfter)) throw new Error('Existing billing data changed; rolling back');
        await connection.commit();
        console.log(JSON.stringify({ applied: changes.length, verified: after.length, backupFile, billingUnchanged: billingAfter,
            badges: after.map(r => ({ id: r.id, price: r.price, previous_price: r.previous_price, changed_at: r.price_changed_at })) }));
    } catch (error) {
        if (connection) await connection.rollback();
        throw error;
    } finally {
        if (connection) connection.release();
        await db.end();
    }
}

module.exports = { tariffs, validateRows };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
