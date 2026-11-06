-- =====================================================================
-- AUDIT STOK OBAT: OSSOVIT
-- READ-ONLY: hanya SELECT / SET variabel sesi. Tidak mengubah data.
-- Database : dibyaklinik (MariaDB 10.11)
-- Dibuat   : 2026-11-06
--
-- Cara pakai di VPS:
--   mysql -u root -t --force dibyaklinik < audit_ossovit_20261106.sql > audit_ossovit_hasil.txt
-- --force = lanjut ke bagian berikutnya bila satu bagian error
--           (mis. tabel legacy `billings` tidak ada).
--
-- Logika pencocokan obat_id pada item tagihan meniru persis kode aplikasi:
--   staff/backend/services/sunday-clinic/billing.js (mark-paid & tagihan tambahan)
--   staff/backend/routes/billings.js (billing legacy)
-- =====================================================================


-- 0. IDENTIFIKASI OBAT -------------------------------------------------
SELECT '0. KANDIDAT OBAT (id 29 atau nama mirip Ossovit)' AS bagian;
SELECT id, code, name, category, price, stock, min_stock, is_active, default_cost_price
FROM obat
WHERE id = 29
   OR LOWER(name) LIKE '%ossovit%'
   OR LOWER(name) LIKE '%osovit%'
ORDER BY id;

-- Target: nama mengandung "ossovit"; bila tidak ada, pakai id 29.
-- Bila bagian 0 menunjukkan obat lain, ganti manual: SET @oid := <id yang benar>;
SET @oid := (SELECT id FROM obat WHERE LOWER(name) LIKE '%ossovit%' ORDER BY is_active DESC, id ASC LIMIT 1);
SET @oid := COALESCE(@oid, 29);

SELECT '>> OBAT YANG DIAUDIT' AS bagian, id, code, name, stock, is_active
FROM obat WHERE id = @oid;


-- 1. REKONSILIASI 3 ARAH -----------------------------------------------
-- stok_master  = obat.stock (yang tampil di aplikasi)
-- sisa_batch   = SUM(obat_batches.quantity_remaining) (dasar FIFO & kadaluarsa)
-- saldo_ledger = SUM(stock_movements.quantity) (semua mutasi tercatat)
-- Selisih master vs ledger = perubahan stok yang TIDAK tercatat di ledger:
--   stok awal saat obat dibuat, edit form Kelola Obat (PUT /api/obat/:id
--   menimpa stock), atau PATCH /api/obat/:id/stock.
SELECT '1. REKONSILIASI: obat.stock vs sisa batch vs saldo ledger' AS bagian;
SELECT
    o.stock                          AS stok_master,
    COALESCE(b.sisa, 0)              AS sisa_batch,
    COALESCE(m.saldo, 0)             AS saldo_ledger,
    CAST(o.stock AS SIGNED) - COALESCE(b.sisa, 0)    AS selisih_master_vs_batch,
    CAST(o.stock AS SIGNED) - COALESCE(m.saldo, 0)   AS selisih_master_vs_ledger
FROM obat o
LEFT JOIN (
    SELECT obat_id, SUM(quantity_remaining) AS sisa
    FROM obat_batches WHERE obat_id = @oid GROUP BY obat_id
) b ON b.obat_id = o.id
LEFT JOIN (
    SELECT obat_id, SUM(quantity) AS saldo
    FROM stock_movements WHERE obat_id = @oid GROUP BY obat_id
) m ON m.obat_id = o.id
WHERE o.id = @oid;


-- 2. RINGKASAN MUTASI PER JENIS ----------------------------------------
SELECT '2. RINGKASAN MUTASI PER JENIS & REFERENSI' AS bagian;
SELECT movement_type, reference_type,
       COUNT(*)        AS jumlah_baris,
       SUM(quantity)   AS total_qty,
       MIN(created_at) AS pertama,
       MAX(created_at) AS terakhir
FROM stock_movements
WHERE obat_id = @oid
GROUP BY movement_type, reference_type
ORDER BY pertama;


-- 3. MUTASI PER BULAN --------------------------------------------------
SELECT '3. MUTASI PER BULAN' AS bagian;
SELECT DATE_FORMAT(created_at, '%Y-%m') AS bulan,
       SUM(CASE WHEN movement_type = 'purchase'   THEN quantity ELSE 0 END) AS masuk_beli,
       SUM(CASE WHEN movement_type = 'adjustment' THEN quantity ELSE 0 END) AS adjustment,
      -SUM(CASE WHEN movement_type = 'sale'       THEN quantity ELSE 0 END) AS keluar_jual,
       SUM(CASE WHEN movement_type = 'return'     THEN quantity ELSE 0 END) AS retur_masuk,
       SUM(quantity) AS net
FROM stock_movements
WHERE obat_id = @oid
GROUP BY DATE_FORMAT(created_at, '%Y-%m')
ORDER BY bulan;


-- 4. REKONSILIASI PER BATCH --------------------------------------------
-- sisa_menurut_ledger = qty dibeli + mutasi sale/return yang menunjuk batch ini.
-- Catatan: adjustment negatif TIDAK mengurangi batch (InventoryService.adjustStock),
-- jadi selisih batch vs master bisa berasal dari adjustment minus.
SELECT '4. REKONSILIASI PER BATCH' AS bagian;
SELECT b.id AS batch_id, b.batch_number, b.purchase_date, b.expiry_date,
       b.cost_price, b.quantity_purchased, b.quantity_remaining,
       CAST(b.quantity_purchased AS SIGNED) + COALESCE(m.mutasi, 0)        AS sisa_menurut_ledger,
       CAST(b.quantity_remaining AS SIGNED)
         - (CAST(b.quantity_purchased AS SIGNED) + COALESCE(m.mutasi, 0))  AS selisih,
       CASE WHEN b.expiry_date IS NOT NULL AND b.expiry_date < CURDATE() AND b.quantity_remaining > 0
            THEN 'KADALUARSA_MASIH_ADA_SISA' ELSE '' END                    AS catatan_ed,
       LEFT(b.notes, 50) AS notes
FROM obat_batches b
LEFT JOIN (
    SELECT batch_id, SUM(quantity) AS mutasi
    FROM stock_movements
    WHERE obat_id = @oid AND batch_id IS NOT NULL AND movement_type <> 'purchase'
    GROUP BY batch_id
) m ON m.batch_id = b.id
WHERE b.obat_id = @oid
ORDER BY b.purchase_date, b.id;


-- 5. PENJUALAN OBAT LANGSUNG (obat_sales) ------------------------------
SELECT '5. PENJUALAN OBAT: qty dijual vs qty terpotong' AS bagian;
WITH jual AS (
    SELECT sale_id, COUNT(*) AS n_baris, SUM(quantity) AS qty
    FROM obat_sale_items
    WHERE obat_id = @oid
    GROUP BY sale_id
), potong AS (
    SELECT reference_id AS sale_id, -SUM(quantity) AS qty
    FROM stock_movements
    WHERE obat_id = @oid AND movement_type = 'sale' AND reference_type = 'obat_sale'
    GROUP BY reference_id
), kunci AS (
    SELECT sale_id FROM jual
    UNION
    SELECT sale_id FROM potong
)
SELECT k.sale_id, s.sale_number, s.status, s.is_test, s.patient_name, s.confirmed_at,
       COALESCE(j.n_baris, 0) AS n_baris,
       COALESCE(j.qty, 0)     AS qty_dijual,
       COALESCE(p.qty, 0)     AS qty_terpotong,
       CASE
           WHEN s.id IS NULL                                    THEN 'POTONG_TANPA_PENJUALAN'
           WHEN s.status = 'draft' AND COALESCE(p.qty, 0) > 0  THEN 'TERPOTONG_TAPI_MASIH_DRAFT'
           WHEN s.status = 'draft'                              THEN 'draft (wajar)'
           WHEN COALESCE(s.is_test, 0) = 1 AND COALESCE(p.qty, 0) = 0 THEN 'test (wajar)'
           WHEN COALESCE(p.qty, 0) > COALESCE(j.qty, 0)         THEN 'LEBIH_POTONG'
           WHEN COALESCE(p.qty, 0) < COALESCE(j.qty, 0)         THEN 'KURANG_POTONG'
           ELSE 'OK'
       END AS temuan
FROM kunci k
LEFT JOIN obat_sales s ON s.id = k.sale_id
LEFT JOIN jual j       ON j.sale_id = k.sale_id
LEFT JOIN potong p     ON p.sale_id = k.sale_id
ORDER BY s.created_at, k.sale_id;


-- 6. SUNDAY CLINIC - TAGIHAN UTAMA -------------------------------------
-- Tanda bug "obat sama di >1 baris": n_baris > 1 dan qty_terpotong < qty_ditagih.
SELECT '6. SUNDAY CLINIC TAGIHAN UTAMA: qty ditagih vs qty terpotong' AS bagian;
WITH item AS (
    SELECT x.billing_id, COUNT(*) AS n_baris, SUM(x.quantity) AS qty
    FROM (
        SELECT bi.billing_id, bi.quantity,
               COALESCE(
                   NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(bi.item_data, '$.obatId')) AS UNSIGNED), 0),
                   (SELECT o.id FROM obat o WHERE bi.item_code IS NOT NULL AND o.code = bi.item_code LIMIT 1),
                   (SELECT o.id FROM obat o WHERE bi.item_code REGEXP '^[0-9]+$' AND o.id = CAST(bi.item_code AS UNSIGNED) LIMIT 1),
                   (SELECT o.id FROM obat o WHERE LOWER(TRIM(o.name)) = LOWER(TRIM(bi.item_name)) ORDER BY o.is_active DESC, o.id ASC LIMIT 1)
               ) AS obat_id
        FROM sunday_clinic_billing_items bi
        WHERE bi.item_type = 'obat'
    ) x
    WHERE x.obat_id = @oid
    GROUP BY x.billing_id
), potong AS (
    SELECT reference_id AS billing_id, -SUM(quantity) AS qty
    FROM stock_movements
    WHERE obat_id = @oid AND movement_type = 'sale' AND reference_type = 'sunday_clinic_billing'
    GROUP BY reference_id
), kunci AS (
    SELECT billing_id FROM item
    UNION
    SELECT billing_id FROM potong
)
SELECT k.billing_id, b.mr_id, b.status, b.paid_at,
       COALESCE(i.n_baris, 0) AS n_baris,
       COALESCE(i.qty, 0)     AS qty_ditagih,
       COALESCE(p.qty, 0)     AS qty_terpotong,
       CASE
           WHEN b.id IS NULL                                      THEN 'POTONG_TANPA_TAGIHAN'
           WHEN b.status <> 'paid' AND COALESCE(p.qty, 0) > 0     THEN 'TERPOTONG_TAPI_BELUM_LUNAS'
           WHEN b.status <> 'paid'                                THEN CONCAT(b.status, ' (wajar)')
           WHEN COALESCE(p.qty, 0) > COALESCE(i.qty, 0)           THEN 'LEBIH_POTONG'
           WHEN COALESCE(p.qty, 0) < COALESCE(i.qty, 0) AND COALESCE(i.n_baris, 0) > 1
                                                                  THEN 'KURANG_POTONG (obat sama >1 baris)'
           WHEN COALESCE(p.qty, 0) < COALESCE(i.qty, 0)           THEN 'KURANG_POTONG'
           ELSE 'OK'
       END AS temuan
FROM kunci k
LEFT JOIN sunday_clinic_billings b ON b.id = k.billing_id
LEFT JOIN item i                   ON i.billing_id = k.billing_id
LEFT JOIN potong p                 ON p.billing_id = k.billing_id
ORDER BY COALESCE(b.paid_at, b.created_at), k.billing_id;


-- 7. SUNDAY CLINIC - TAGIHAN TAMBAHAN ----------------------------------
SELECT '7. SUNDAY CLINIC TAGIHAN TAMBAHAN: qty ditagih vs qty terpotong' AS bagian;
WITH item AS (
    SELECT x.additional_billing_id, COUNT(*) AS n_baris, SUM(x.quantity) AS qty
    FROM (
        SELECT abi.additional_billing_id, abi.quantity,
               COALESCE(
                   NULLIF(CAST(JSON_UNQUOTE(JSON_EXTRACT(abi.item_data, '$.obatId')) AS UNSIGNED), 0),
                   (SELECT o.id FROM obat o
                     WHERE abi.item_code IS NOT NULL
                       AND o.code COLLATE utf8mb4_unicode_ci = abi.item_code COLLATE utf8mb4_unicode_ci
                     LIMIT 1),
                   (SELECT o.id FROM obat o
                     WHERE LOWER(TRIM(o.name)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(abi.item_name)) COLLATE utf8mb4_unicode_ci
                     ORDER BY o.is_active DESC, o.id ASC
                     LIMIT 1)
               ) AS obat_id
        FROM sunday_clinic_additional_billing_items abi
        WHERE abi.item_type = 'obat'
    ) x
    WHERE x.obat_id = @oid
    GROUP BY x.additional_billing_id
), potong AS (
    SELECT reference_id AS additional_billing_id, -SUM(quantity) AS qty
    FROM stock_movements
    WHERE obat_id = @oid AND movement_type = 'sale' AND reference_type = 'sunday_clinic_additional_billing'
    GROUP BY reference_id
), kunci AS (
    SELECT additional_billing_id FROM item
    UNION
    SELECT additional_billing_id FROM potong
)
SELECT k.additional_billing_id, a.reference_number, a.mr_id, a.status, a.paid_at,
       COALESCE(i.n_baris, 0) AS n_baris,
       COALESCE(i.qty, 0)     AS qty_ditagih,
       COALESCE(p.qty, 0)     AS qty_terpotong,
       CASE
           WHEN a.id IS NULL                                  THEN 'POTONG_TANPA_TAGIHAN'
           WHEN a.status <> 'paid' AND COALESCE(p.qty, 0) > 0 THEN 'TERPOTONG_TAPI_BELUM_LUNAS'
           WHEN a.status <> 'paid'                            THEN CONCAT(a.status, ' (wajar)')
           WHEN COALESCE(p.qty, 0) > COALESCE(i.qty, 0)       THEN 'LEBIH_POTONG'
           WHEN COALESCE(p.qty, 0) < COALESCE(i.qty, 0)       THEN 'KURANG_POTONG'
           ELSE 'OK'
       END AS temuan
FROM kunci k
LEFT JOIN sunday_clinic_additional_billings a ON a.id = k.additional_billing_id
LEFT JOIN item i   ON i.additional_billing_id = k.additional_billing_id
LEFT JOIN potong p ON p.additional_billing_id = k.additional_billing_id
ORDER BY COALESCE(a.paid_at, a.created_at), k.additional_billing_id;


-- 8. RETUR OBAT (stok kembali) -----------------------------------------
SELECT '8. RETUR OBAT YANG MENGEMBALIKAN STOK' AS bagian;
SELECT rt.id AS return_id, rt.mr_id, rt.billing_id, rt.additional_billing_id,
       rt.item_name, rt.quantity AS qty_retur, r.qty_restock,
       rt.accounting_date, rt.actor_name, LEFT(rt.reason, 60) AS alasan
FROM sunday_clinic_billing_returns rt
JOIN (
    SELECT reference_id, SUM(quantity) AS qty_restock
    FROM stock_movements
    WHERE obat_id = @oid AND reference_type = 'sunday_clinic_return'
    GROUP BY reference_id
) r ON r.reference_id = rt.id
ORDER BY rt.id;


-- 9. BILLING LEGACY (tabel billings / billing_items) -------------------
-- Bila tabel ini tidak ada di produksi, bagian ini error dan dilewati (--force).
SELECT '9. BILLING LEGACY: qty ditagih vs qty terpotong' AS bagian;
WITH item AS (
    SELECT bi.billing_id, COUNT(*) AS n_baris, SUM(bi.quantity) AS qty
    FROM billing_items bi
    -- COLLATE: billing_items dan obat beda collation di produksi (unicode_ci vs general_ci).
    LEFT JOIN obat o_code ON bi.item_code COLLATE utf8mb4_unicode_ci = o_code.code COLLATE utf8mb4_unicode_ci
    LEFT JOIN obat o_id   ON (bi.item_code REGEXP '^[0-9]+$' AND CAST(bi.item_code AS UNSIGNED) = o_id.id)
    WHERE bi.item_type = 'medication' AND COALESCE(o_code.id, o_id.id) = @oid
    GROUP BY bi.billing_id
), potong AS (
    SELECT reference_id AS billing_id, -SUM(quantity) AS qty
    FROM stock_movements
    WHERE obat_id = @oid AND movement_type = 'sale' AND reference_type = 'billing'
    GROUP BY reference_id
), kunci AS (
    SELECT billing_id FROM item
    UNION
    SELECT billing_id FROM potong
)
SELECT k.billing_id, bl.billing_number, bl.payment_status, bl.payment_date,
       COALESCE(i.n_baris, 0) AS n_baris,
       COALESCE(i.qty, 0)     AS qty_ditagih,
       COALESCE(p.qty, 0)     AS qty_terpotong,
       CASE
           WHEN bl.id IS NULL                                        THEN 'POTONG_TANPA_TAGIHAN'
           WHEN bl.payment_status <> 'paid' AND COALESCE(p.qty, 0) > 0 THEN 'TERPOTONG_TAPI_BELUM_LUNAS'
           WHEN bl.payment_status <> 'paid'                          THEN 'belum lunas (wajar)'
           WHEN COALESCE(p.qty, 0) <> COALESCE(i.qty, 0)             THEN 'SELISIH'
           ELSE 'OK'
       END AS temuan
FROM kunci k
LEFT JOIN billings bl ON bl.id = k.billing_id
LEFT JOIN item i      ON i.billing_id = k.billing_id
LEFT JOIN potong p    ON p.billing_id = k.billing_id
ORDER BY bl.payment_date, k.billing_id;


-- 10. MUTASI DI LUAR TRANSAKSI PENJUALAN -------------------------------
-- Adjustment manual, deduct manual (/api/inventory/deduct), atau referensi lain.
SELECT '10. MUTASI MANUAL / ADJUSTMENT / REFERENSI LAIN' AS bagian;
SELECT sm.id, sm.created_at, sm.movement_type, sm.reference_type, sm.reference_id,
       sm.batch_id, sm.quantity, sm.created_by, LEFT(sm.notes, 80) AS notes
FROM stock_movements sm
WHERE sm.obat_id = @oid
  AND (sm.movement_type = 'adjustment'
       OR sm.reference_type IS NULL
       OR sm.reference_type NOT IN ('purchase', 'obat_sale', 'sunday_clinic_billing',
                                    'sunday_clinic_additional_billing', 'billing',
                                    'sunday_clinic_return'))
ORDER BY sm.created_at, sm.id;


-- 11. LEDGER LENGKAP DENGAN SALDO BERJALAN -----------------------------
SELECT '11. LEDGER LENGKAP (saldo berjalan)' AS bagian;
SELECT sm.id, sm.created_at, sm.movement_type, sm.reference_type, sm.reference_id,
       sm.batch_id, sm.quantity,
       SUM(sm.quantity) OVER (ORDER BY sm.created_at, sm.id) AS saldo_berjalan,
       sm.cost_price, sm.created_by, LEFT(sm.notes, 50) AS notes
FROM stock_movements sm
WHERE sm.obat_id = @oid
ORDER BY sm.created_at, sm.id;

SELECT 'SELESAI' AS bagian;
