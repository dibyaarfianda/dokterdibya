# Audit Obat Khusus Dokter — Fase 1: Anti-Kebocoran

Tanggal: 2026-11-06
Status: desain disetujui per bagian dalam percakapan; menunggu review spec tertulis.

## 1. Tujuan

Halaman audit obat yang hanya bisa dibuka oleh dokter, dengan tujuan utama **mendeteksi kebocoran obat**. Fase 1 menangkap tiga jenis kebocoran:

1. **Angka stok diedit** — stok berubah tanpa catatan mutasi.
2. **Obat fisik hilang** — stok sistem tidak sama dengan stok fisik.
3. **Keluar tapi tak ditagih** — obat keluar dari klinik tanpa pembayaran/tagihan yang sah.

Kriteria berhasil:
- Setelah tahap 1 live, tidak ada jalur di aplikasi yang bisa mengubah `obat.stock` tanpa baris `stock_movements`.
- Setelah baseline ditetapkan, setiap perubahan stok di luar aplikasi terlihat sebagai "selisih mutasi" di halaman audit.
- Selisih fisik vs sistem terlihat dari opname mingguan (acak), bulanan (penuh), dan cek dokter.
- Pola "obat keluar tanpa ditagih" dari 8 aturan (bagian 6) tampil dan bisa ditandai sudah diperiksa.
- Akun selain role dokter (termasuk superadmin non-dokter dan akun yang diberi delegasi izin) mendapat 403 di semua rute audit.

## 2. Keputusan yang sudah disetujui

| Topik | Keputusan |
|---|---|
| Prioritas | Anti-kebocoran lebih dulu; faktur/keuangan menyusul di fase berikutnya |
| Jenis kebocoran fase 1 | Stok diedit, fisik hilang, keluar tanpa ditagih. Manipulasi harga ditunda |
| Lokasi stok | Satu lokasi (klinik). Tetap satu angka stok per obat, tanpa stok per lokasi |
| Opname | Cek acak mingguan + hitung penuh bulanan, hitung buta |
| Kelemahan hitung buta | Staf tetap bisa melihat angka stok di halaman lain; dikompensasi dengan **cek dokter** rahasia |
| Penyesuaian stok | Staf mengajukan, stok berubah setelah dokter menyetujui |
| Pendekatan | Pendekatan 1: satu jalur stok + persetujuan dokter + halaman audit. Tanpa trigger database |

## 3. Kondisi kode saat ini (dasar desain)

Diverifikasi dengan membaca kode pada 2026-11-06:

- Stok dipotong FIFO lewat `InventoryService.deductStockFIFO` di tiga titik: tagihan Klinik Privat saat lunas (`services/sunday-clinic/billing.js` `postBillingByMrIdMarkPaid`, tagihan tambahan `postBillingByMrIdAdditionalByAdditionalBillingIdMarkPaid`, pembayaran online `routes/billing-payment.js`), dan penjualan RS saat dikonfirmasi (`routes/obat-sales.js` `/:id/confirm`). Sistem tagihan lama (`routes/billings.js`, `reference_type = 'billing'`) tidak ditemukan pemanggilnya di frontend.
- Retur klinik menambah stok dan menulis mutasi `return` (`services/sunday-clinic/billing-returns.js`).
- Jalur yang mengubah stok **tanpa** mutasi: `PUT /api/obat/:id`, `POST /api/obat`, `PATCH /api/obat/:id/stock`, `PUT /api/v1/obat/:id`, `POST /api/v1/obat`, `PATCH /api/v1/obat/:id/stock` (lewat `ObatService.updateStock`). Form Kelola Obat (`staff/public/scripts/kelola-obat.js`) mengirim `stock` saat buat dan edit.
- `POST /api/inventory/adjust` mengubah stok langsung; penyesuaian minus tidak mengurangi `obat_batches.quantity_remaining`. `POST /api/inventory/deduct` membuat mutasi `sale` dengan referensi bebas. Keduanya tidak punya pemanggil di `staff/public`, `android-pharm`, atau `staff-mobile-app`.
- `android-pharm` hanya memakai `/api/obat-sales/*`.
- Kolom `stock_movements` yang dipakai kode: `id, obat_id, batch_id, movement_type, quantity, cost_price, reference_type, reference_id, notes, created_by, created_at`. `created_by` berisi nama, bukan ID. Nilai `movement_type` yang dipakai: `purchase, sale, adjustment, return`. Tipe kolomnya (ENUM/VARCHAR) belum diverifikasi; tabel ini tidak punya DDL di repo.
- Log audit tagihan klinik (`sunday_clinic_billing_audit_logs`) sudah mencatat `item_removed`, `billing_cancelled`, `additional_billing_updated` dengan snapshot sebelum/sesudah dan pelaku.
- `requireDoctorRole` (`middleware/auth.js`) memeriksa `role_id === ROLE_IDS.DOKTER`, tetapi tetap meloloskan izin akun yang didelegasikan kecuali izin itu ada di `NON_DELEGABLE_ACCOUNT_PERMISSIONS`.
- `node-cron` sudah menjadi dependensi backend.

## 4. Arsitektur

### 4.1 Satu jalur stok

`obat.stock` hanya boleh ditulis oleh `StockLedgerService` (layanan baru yang membungkus dan menggantikan penulisan stok di `InventoryService`). Setiap penulisan stok dan baris `stock_movements` terjadi dalam satu transaksi.

Operasi yang disediakan:
- `recordPurchase` — pembelian (perilaku sama dengan sekarang).
- `deductFIFO` — pemotongan saat penjualan (perilaku sama dengan sekarang).
- `applyApprovedAdjustment(requestId, actor)` — penyesuaian yang sudah disetujui dokter (baru).
- Retur klinik tetap di `billing-returns.js`, tetapi wajib mengikuti aturan kunci di 4.3.

### 4.2 Jalur yang ditutup

| Jalur | Perilaku baru |
|---|---|
| `PUT /api/obat/:id`, `PUT /api/v1/obat/:id` | Jika body berisi `stock` yang **berbeda** dari stok saat ini → 409 `STOCK_EDIT_NOT_ALLOWED` dengan pesan "Stok tidak bisa diubah di sini. Gunakan Ajukan Penyesuaian." Jika sama atau tidak dikirim → field lain disimpan, stok tidak ditulis |
| `POST /api/obat`, `POST /api/v1/obat` | Stok awal selalu 0, nilai `stock` di body diabaikan. Stok diisi lewat Tambah Stok (pembelian, wajib batch dan harga beli) |
| `PATCH /api/obat/:id/stock`, `PATCH /api/v1/obat/:id/stock` | 410 Gone |
| `POST /api/inventory/adjust` | Membuat `stock_adjustment_requests` berstatus `pending`; stok tidak berubah |
| `POST /api/inventory/deduct` | 410 Gone |
| `ObatService.updateStock/addStock/deductStock` | Dihapus jika tidak ada pemanggil lain setelah v1 PATCH ditutup; jika masih ada pemanggil, dialihkan ke `StockLedgerService` |

Frontend Kelola Obat: input stok dihapus dari form buat, menjadi baca-saja di form edit, dan ada tombol **Ajukan Penyesuaian** per obat.

### 4.3 Aturan konsistensi dan kunci

- Semua penulis stok mengunci baris `obat` lebih dulu (`SELECT ... FROM obat WHERE id = ? FOR UPDATE`), baru kemudian batch. Urutan kunci tetap: `obat` → `obat_batches`. Ini berlaku untuk `deductFIFO`, `recordPurchase`, `applyApprovedAdjustment`, retur, dan penyimpanan hasil hitung opname.
- Penyimpanan hasil hitung opname membaca `obat.stock` dan `MAX(stock_movements.id)` untuk obat itu di dalam transaksi yang sama, sambil memegang kunci baris `obat`, sehingga pasangan "stok sistem + ID mutasi terakhir" konsisten.
- Rekonsiliasi di halaman audit membaca `obat`, `obat_batches`, dan `stock_movements` dalam satu transaksi snapshot (REPEATABLE READ), sehingga transaksi yang sedang berjalan tidak menghasilkan selisih palsu.

### 4.4 Penerapan penyesuaian yang disetujui

Dalam satu transaksi, setelah mengunci baris pengajuan (`FOR UPDATE`) dan memastikan statusnya masih `pending`:
1. Kunci baris `obat`.
2. Terapkan **selisih** (`quantity_delta`), bukan angka hitungan absolut.
3. Selisih minus: kurangi `obat_batches.quantity_remaining` dari `batch_id` yang dipilih, atau FIFO jika tidak dipilih. Jika total batch kurang dari selisih, sisa dicatat sebagai mutasi tanpa batch (sama dengan pola legacy saat ini).
4. Selisih plus: buat batch baru bercatatan "Penyesuaian #id" dengan harga modal default obat.
5. Tulis `stock_movements` dengan `movement_type = 'adjustment'`, `reference_type = 'stock_adjustment_request'`, `reference_id = id pengajuan`.
6. Tolak (422) jika hasil stok di bawah 0.
7. Simpan `stock_at_decision`, `decided_by_*`, `decided_at`, dan daftar ID mutasi ke pengajuan.

Tidak ada nilai `movement_type` baru dan tidak ada ALTER pada tabel lama.

## 5. Model data (tabel baru, hanya lewat file migrasi)

Tidak ada `CREATE TABLE` saat runtime (sesuai tes `StaffPanelWave6StartupSchema`). Struktur tabel lama tidak diubah.

### 5.1 `stock_adjustment_requests` (tahap 1)

| Kolom | Keterangan |
|---|---|
| `id` | PK auto increment |
| `obat_id` | obat yang disesuaikan |
| `batch_id` | NULL atau batch yang dipilih (wajib untuk kategori `kedaluwarsa`) |
| `quantity_delta` | INT, tidak boleh 0 |
| `reason_category` | ENUM `rusak, pecah, kedaluwarsa, hilang, salah_hitung, opname, lainnya` |
| `reason_note` | wajib, maksimal 1000 karakter |
| `source` | ENUM `manual, opname` |
| `opname_item_id` | NULL atau item opname asal |
| `status` | ENUM `pending, approved, rejected` |
| `stock_at_request` | stok sistem saat diajukan |
| `stock_at_decision` | stok sistem saat diputuskan |
| `requested_by_id`, `requested_by_name`, `requested_at` | pengaju |
| `decided_by_id`, `decided_by_name`, `decided_at`, `decision_note` | pemutus |
| `movement_ids` | JSON, ID mutasi hasil penerapan |

Indeks: `(status, requested_at)`, `(obat_id, requested_at)`.

### 5.2 `stock_opname_sessions` (tahap 2)

| Kolom | Keterangan |
|---|---|
| `id` | PK |
| `kind` | ENUM `spot, full, doctor` |
| `status` | ENUM `scheduled, open, submitted, closed, missed, cancelled` |
| `doctor_only` | TINYINT; 1 untuk `doctor` (tidak tampil ke staf) |
| `week_key` | VARCHAR, contoh `2026-W45`; **UNIQUE**. Hanya diisi untuk cek acak mingguan; NULL untuk `full`, `doctor`, dan sesi hitung ulang (UNIQUE MySQL membolehkan banyak NULL) |
| `opens_at`, `deadline_at` | waktu buka dan batas pengerjaan (WIB). Hanya sesi `spot` yang berubah menjadi `missed` saat lewat `deadline_at`; untuk `full` dan `doctor`, batas waktu bersifat informasi dan sesi tetap bisa dikerjakan |
| `counted_by_id`, `counted_by_name` | penghitung |
| `created_by_id`, `created_by_name`, `created_at`, `submitted_at`, `closed_at` | jejak |
| `is_baseline` | TINYINT; hanya satu sesi aktif sebagai baseline |
| `baseline_diff_value` | DECIMAL; "temuan awal" — total nilai Rupiah selisih saat sesi dijadikan baseline |

### 5.3 `stock_opname_items` (tahap 2)

| Kolom | Keterangan |
|---|---|
| `id` | PK |
| `session_id`, `obat_id` | UNIQUE bersama |
| `selection_reason` | ENUM `random, risk, full, doctor_pick, recount` |
| `counted_qty` | NULL sampai diisi |
| `not_found` | TINYINT; 1 berarti dihitung 0 |
| `system_qty_at_count` | stok sistem saat item disimpan; **tidak pernah dikirim ke penghitung** |
| `anchor_movement_id` | `MAX(stock_movements.id)` obat itu saat item disimpan |
| `counted_at`, `note` | waktu dan catatan |

### 5.4 `audit_finding_reviews` (tahap 3)

| Kolom | Keterangan |
|---|---|
| `id` | PK |
| `finding_type` | kode aturan, contoh `R1_UNPAID_CLINIC_OBAT` |
| `finding_key` | kunci transaksi, contoh `sunday_clinic_billing:123` |
| `status` | ENUM `checked, normal, suspicious` |
| `note` | catatan |
| `reviewed_by_id`, `reviewed_by_name`, `reviewed_at` | pemeriksa |

UNIQUE `(finding_type, finding_key)`. Penandaan ulang memperbarui baris yang sama.

## 6. Deteksi

### 6.1 Rekonsiliasi per obat

Tiga angka per obat:
1. `obat.stock`
2. `SUM(obat_batches.quantity_remaining)`
3. **Stok seharusnya** = `system_qty_at_count` item baseline + `SUM(stock_movements.quantity)` dengan `id > anchor_movement_id` item baseline.

Obat yang dibuat setelah baseline (stok awal dipaksa 0) memakai jangkar 0 dan `anchor_movement_id = 0`.

Status:
- **Cocok** — ketiga angka sama.
- **Selisih batch** — (1) ≠ (2).
- **Selisih mutasi** (merah) — (1) ≠ (3), hanya dihitung jika baseline sudah ada.
- **Belum ada baseline** — hanya (1) vs (2) yang dibandingkan.

Baseline **tetap**; tidak bergeser mengikuti opname terbaru. Baseline baru hanya dibuat oleh dokter lewat tombol "Jadikan baseline".

### 6.2 Aturan "keluar tanpa ditagih"

Rentang default 30 hari terakhir, bisa diubah. Dihitung saat halaman/tab dibuka. Temuan yang sudah ditandai di `audit_finding_reviews` disembunyikan, bisa ditampilkan dengan filter.

| Kode | Aturan | Sumber | Batas default |
|---|---|---|---|
| R1 | Tagihan Klinik Privat (utama/tambahan) berisi item obat, belum lunas, tidak dibatalkan | `sunday_clinic_billings`, `sunday_clinic_billing_items`, `sunday_clinic_additional_billings`, `sunday_clinic_additional_billing_items` | lebih dari H+1 dari tanggal tagihan dibuat |
| R2 | Penjualan RS berstatus `confirmed` atau `payment_pending` | `obat_sales` | lebih dari 7 hari dari `confirmed_at` |
| R3 | Penjualan RS berstatus `draft` | `obat_sales` | lebih dari 2 hari dari `created_at` |
| R4 | Item obat dihapus atau jumlahnya berkurang dari tagihan | log audit tagihan (`item_removed`, `additional_billing_updated`), selisih snapshot sebelum vs sesudah untuk item `obat` | tanpa batas |
| R5 | Tagihan dibatalkan yang berisi item obat | log audit `billing_cancelled`, `additional_billing_cancelled` | tanpa batas |
| R6 | Transaksi lunas/terkonfirmasi tetapi total mutasi `sale` < jumlah item obat | item tagihan/penjualan vs `stock_movements` per `reference_type`/`reference_id` (termasuk `billing` lama jika ada datanya) | tanpa batas |
| R7 | Mutasi `sale` dengan `reference_type` `manual` atau NULL | `stock_movements` | tanpa batas |
| R8 | Retur obat (informasi) | `stock_movements` `reference_type = 'sunday_clinic_return'` | tanpa batas |

Batas R1–R3 adalah asumsi dan disimpan sebagai konstanta di satu tempat di service aturan.

Setiap aturan dijalankan terpisah. Jika satu aturan gagal atau timeout, aturan lain tetap tampil dan aturan yang gagal menampilkan pesan error-nya sendiri.

Batasan yang diterima: obat yang diserahkan tanpa pernah dibuat tagihannya tidak terdeteksi oleh aturan ini; hanya terlihat sebagai selisih opname.

### 6.3 Tanda dari opname

- **Selisih opname** — `counted_qty − system_qty_at_count ≠ 0`.
- **Hasil staf tidak sesuai** — untuk obat yang dihitung dokter (sesi `doctor`), jika ada hitungan staf dalam 14 hari sebelumnya dengan selisih 0, hitung "seharusnya" = hitungan staf + `SUM(mutasi)` dengan `anchor staf < id ≤ anchor dokter`. Jika hitungan dokter < nilai itu → tanda merah.
- **Cek acak tidak dikerjakan** — sesi `spot` melewati `deadline_at` tanpa dikirim → status `missed`.

## 7. Alur opname

### 7.1 Cek acak mingguan (`spot`)

- Job `node-cron` dengan zona waktu `Asia/Jakarta`:
  - Senin 00:05 — membuat sesi `scheduled` untuk minggu itu dengan `opens_at` = hari acak Senin–Sabtu pukul 06:00 dan `deadline_at` = akhir hari berikutnya (23:59:59). Jika `week_key` sudah ada, tidak membuat lagi (aman untuk beberapa proses PM2).
  - Setiap 15 menit — sesi `scheduled` yang `opens_at`-nya sudah lewat diubah menjadi `open` dan item dipilih saat itu; sesi `open` yang lewat `deadline_at` diubah menjadi `missed`.
- Sesi `scheduled` tidak pernah dikembalikan ke endpoint staf, sehingga hari acak tidak bisa diketahui sebelumnya.
- Pemilihan 12 obat dengan `crypto.randomInt`:
  - 4 dari kumpulan **berisiko**: obat yang selisih di opname 90 hari terakhir, 10 obat dengan jumlah keluar terbanyak 30 hari terakhir, dan obat yang muncul di temuan aturan yang belum diperiksa. Jika kurang dari 4, sisanya diisi acak.
  - 8 acak dari semua obat aktif (`is_active = 1`), termasuk stok 0, tidak duplikat dengan pilihan berisiko.
- Dokter punya tombol **Buat cek acak sekarang** di halaman audit untuk kasus job gagal. Ringkasan menampilkan "cek acak minggu ini belum dibuat" bila tidak ada sesi untuk `week_key` saat ini.

### 7.2 Hitung penuh bulanan (`full`)

- Dibuka dokter dari halaman audit dengan batas waktu yang dipilih dokter.
- Item = semua obat aktif saat sesi dibuka.
- Progres tersimpan per item; boleh dikerjakan bertahap sampai batas waktu.

### 7.3 Cek dokter (`doctor`)

- Dibuka dokter dari halaman audit: 5 obat acak (default, bisa diubah) atau obat yang dipilih.
- `doctor_only = 1`: tidak tampil di menu staf dan tidak memicu titik merah staf.

### 7.4 Layar hitung

- Menampilkan nama, kode, dan satuan obat; **tanpa** angka stok sistem.
- Isian: angka hitungan, tombol "tidak ditemukan" (0), catatan.
- Setiap item tersimpan saat diisi (PUT per item). Server mencatat `counted_qty`, `system_qty_at_count`, `anchor_movement_id`, `counted_at` sesuai 4.3.
- Item bisa dikoreksi sampai sesi dikirim; nilai terakhir yang disimpan.
- Kirim hanya bisa jika semua item terisi. Setelah dikirim, sesi terkunci.
- Petunjuk di layar: isi langsung per obat setelah dihitung, untuk menghindari selisih palsu akibat penjualan di antara hitung dan input.
- Respons endpoint penghitung tidak pernah berisi `system_qty_at_count`, `obat.stock`, atau selisih.

### 7.5 Dari opname ke persetujuan

- Saat sesi dikirim: setiap item dengan selisih ≠ 0 otomatis menjadi `stock_adjustment_requests` (`source = opname`, `reason_category = opname`, `quantity_delta = counted_qty − system_qty_at_count`).
- Sesi menjadi `closed` setelah semua pengajuan dari sesi itu diputuskan, atau langsung saat dikirim jika tidak ada selisih.
- **Jadikan baseline** (hanya sesi `full` yang sudah `closed`): menandai `is_baseline = 1`, menghapus tanda baseline dari sesi lain, dan menyimpan `baseline_diff_value`. Sebelum dokter menyetujui selisih sesi pertama, total nilai selisihnya tampil sebagai "temuan awal".
- **Hitung ulang** pada pengajuan yang ditolak: membuat sesi kecil (`kind = doctor` jika diminta dokter untuk dihitung sendiri, atau `spot` tanpa `week_key` untuk staf) berisi obat itu dengan `selection_reason = recount`.

## 8. Persetujuan

- Antrean menampilkan: obat, selisih, **nilai Rupiah** (selisih × harga modal efektif: `default_cost_price`, atau harga batch terakhir jika 0), kategori, catatan, pengaju, umur pengajuan.
- Aksi: **Setuju**, **Tolak** (catatan wajib), **Hitung ulang**.
- Pilih beberapa sekaligus diperbolehkan dengan nilai Rupiah tetap terlihat; tidak ada tombol "setujui semua" tanpa melihat isinya.
- Pengajuan `pending` lebih dari 7 hari ditandai.
- Dua klik Setuju bersamaan hanya diterapkan sekali (kunci baris + cek status).

## 9. Akses dan menu

### 9.1 Izin

| Izin | Untuk | Delegasi |
|---|---|---|
| `stock_opname.count` | staf penghitung opname | bisa diberikan lewat Kelola Akses |
| `inventory.adjust` (sudah ada) | staf yang boleh mengajukan penyesuaian | tetap seperti sekarang |
| `drug_audit.view` | membuka halaman audit | `protected: true`, masuk `NON_DELEGABLE_ACCOUNT_PERMISSIONS` |
| `drug_audit.approve` | memutuskan pengajuan, membuka sesi penuh/dokter, menetapkan baseline, menandai temuan | `protected: true`, masuk `NON_DELEGABLE_ACCOUNT_PERMISSIONS` |

Semua rute `/api/drug-audit/*` memakai `verifyToken` + `requireDoctorRole` dan terdaftar di `config/accessControlRegistry.js` (serta deklarasi di `security/accessRouteInventory.js`) dengan izin `drug_audit.*`.

Pembagian endpoint opname:
- Di bawah `/api/drug-audit/*` (dokter): membuka sesi `full`/`doctor`, membuat cek acak manual, membaca hasil dan selisih, menetapkan baseline, serta **menghitung sesi `doctor_only`** (daftar item, simpan item, kirim).
- Di bawah `/api/stock-opname/*` (staf, izin `stock_opname.count`): daftar sesi terbuka yang `doctor_only = 0` dan bukan `scheduled`, simpan item, kirim. Sesi `doctor_only` atau `scheduled` dijawab 404 di endpoint ini.

### 9.2 Menu

- **Audit Obat** (`nav-drug-audit`) di grup sidebar **Private**, di bawah Gajian. Sumber titik merah: `stock_adjustment_requests` (mulai tahap 1) dan `stock_opname_sessions` (ditambahkan di tahap 2, saat tabelnya sudah ada).
- **Stock Opname** (`nav-stock-opname`) di dekat Kelola Obat untuk staf. Sumber titik merah: `stock_opname_sessions` dengan kondisi statis `doctor_only = 0 AND status <> 'scheduled'`.
- Kedua menu didaftarkan di `config/menu-activity-sources.js` dan pemetaan navigasi di `config/accessControlRegistry.js`.

## 10. Halaman audit (frontend)

Pola sama dengan halaman lain: container `content-drug-audit` dengan fragment `fragments/pages/content-drug-audit.html`, modul `scripts/pages/drug-audit-page.js`, dimuat lewat `staffPageRegistry.ensureLoaded`, fungsi `window.showDrugAuditPage` diekspor. Token memakai `getAuthToken()`.

| Tab | Isi |
|---|---|
| Ringkasan | Kartu: selisih mutasi, pengajuan menunggu, temuan belum diperiksa, cek acak terlewat/belum dibuat, status baseline, nilai selisih opname bulan berjalan. Kartu bisa diklik ke tab terkait |
| Rekonsiliasi | Tabel per obat: stok sistem, total batch, stok seharusnya, status; filter "hanya selisih" |
| Kartu Stok | Pilih obat → urutan mutasi (tanggal, jenis, jumlah, saldo berjalan, sumber yang bisa diklik, pelaku, batch) dan titik opname; paginasi |
| Keluar Tanpa Ditagih | R1–R8, filter per aturan dan tanggal, tombol Sudah diperiksa / Wajar / Mencurigakan + catatan |
| Persetujuan | Antrean sesuai bagian 8 |
| Opname | Daftar sesi (acak/penuh/dokter) dan hasilnya; tombol Mulai hitung penuh, Mulai cek dokter, Buat cek acak sekarang, Jadikan baseline |

Saldo berjalan di Kartu Stok:
- Setelah baseline: dihitung maju dari jangkar baseline; ditampilkan sebagai terverifikasi.
- Sebelum baseline: dihitung mundur dari `obat.stock` saat ini, dengan label "tidak terverifikasi".

Tampilan HP: tabel menjadi daftar kartu pada lebar sempit; layar hitung cek dokter memakai komponen yang sama dengan layar hitung staf. Tidak memakai unit `vh` (aturan 25 CLAUDE.md). Tanggal memakai komponen lokal, bukan `toISOString()` (aturan 14).

## 11. Rollout

Tiga tahap, masing-masing commit dan deploy terpisah:

| Tahap | Isi |
|---|---|
| 1. Tutup jalur | Migrasi `stock_adjustment_requests`; `StockLedgerService` dan aturan kunci; jalur di 4.2 ditutup; Kelola Obat (stok baca-saja, Ajukan Penyesuaian); izin `drug_audit.*`; menu Audit Obat dengan tab Persetujuan dan Rekonsiliasi (mode belum ada baseline) |
| 2. Opname | Migrasi `stock_opname_sessions` dan `stock_opname_items`; job cron; endpoint penghitung; menu Stock Opname; tab Opname dan Kartu Stok; baseline |
| 3. Deteksi | Migrasi `audit_finding_reviews`; aturan R1–R8; tab Keluar Tanpa Ditagih dan Ringkasan |

Setiap tahap:
- Backup `mysqldump` tabel `obat`, `obat_batches`, `stock_movements` sebelum migrasi.
- Naikkan `window.STAFF_CACHE_VERSION` (`staff/public/index-adminlte.html`, sumber `window.__assetVersion`) dan `STAFF_PWA_VERSION` (`staff/public/sw.js`), saat ini `v493`, ke vNNN berikutnya yang belum terpakai (cek `/var/www/dokterdibya-staff-releases` dan `origin/main` tepat sebelum deploy), stage snapshot rilis **sebelum** pull, sesuai `deployment/STAFF_ASSET_RELEASES.md`.
- Tahap 1: staf diberi tahu sebelumnya bahwa stok tidak bisa lagi diedit langsung.

Hari baseline (setelah tahap 2): dokter menjadwalkan hitung penuh pertama, sebaiknya saat klinik tutup; meninjau "temuan awal"; memutuskan pengajuan; lalu menekan Jadikan baseline.

Rollback: revert commit tahap terkait. Tabel baru boleh tetap ada. Penyesuaian yang sudah disetujui tidak dibatalkan.

## 12. Pengujian

Tidak ada Node di mesin pengembangan; jest dijalankan di VPS dari salinan `git archive`.

Unit (jest, `staff/backend/tests/unit`):
- Jalur ditutup: PUT dengan stok berbeda → 409, stok sama → 200 tanpa menulis stok; POST → stok 0; PATCH (lama dan v1) dan `/deduct` → 410; `/adjust` → membuat pengajuan, stok tidak berubah.
- `applyApprovedAdjustment`: minus FIFO, minus batch terpilih, sisa tanpa batch, plus membuat batch, tolak jika < 0, selisih tetap benar bila ada penjualan antara hitung dan persetujuan, idempoten untuk dua persetujuan bersamaan.
- Rekonsiliasi: cocok, selisih batch, selisih mutasi (simulasi `UPDATE obat` langsung), obat baru setelah baseline, belum ada baseline.
- R1–R8 masing-masing dengan fixture positif dan negatif.
- Pemilihan cek acak: 12 item, 4 berisiko + 8 acak tanpa duplikat, fallback bila kumpulan berisiko < 4; pembuatan sesi idempoten per `week_key`; transisi `scheduled → open → missed`.
- Endpoint penghitung tidak pernah mengembalikan stok sistem atau selisih; endpoint staf tidak mengembalikan sesi `scheduled` atau `doctor_only`.
- Akses: staf non-dokter → 403; akun dengan `drug_audit.*` hasil delegasi → 403; superadmin non-dokter → 403; dokter → 200.
- Tes registri yang sudah ada tetap lulus: `AccessControlCatalogRegistry.test.js` (inventaris rute), `StaffMenuBadges.test.js` (menu baru punya sumber), `StaffPanelWave6StartupSchema.test.js` (tabel hanya lewat migrasi).
- Endpoint penghitung staf menjawab 404 untuk sesi `doctor_only` dan `scheduled`.

Integrasi di DB terisolasi (pola `scripts/verify-clinic-returns-isolated.js`: `CREATE TABLE ... LIKE dibyaklinik.*` ke database `*_qa_<timestamp>`, data sintetis, lalu DROP). Ini juga memverifikasi tipe kolom `movement_type` produksi.

Browser (Puppeteer di VPS): halaman audit dan layar hitung pada lebar 375px.

Verifikasi produksi setelah deploy: `/api/health` 200; halaman audit terbuka sebagai dokter dan 403 sebagai staf; ubah stok di Kelola Obat menampilkan pesan 409; satu pengajuan uji lalu **ditolak** (tidak mengubah stok). Jalur Setuju hanya diuji di DB terisolasi.

## 13. Di luar cakupan fase 1

- Import faktur PBF, header faktur, dan hutang supplier (fase berikutnya; juga diperlukan untuk menangkap pencurian saat penerimaan barang).
- Laporan penjualan dan laba dengan harga transaksi aktual; perbaikan `InventoryService.calculateProfit/getSummary` yang memakai `obat.price` saat ini.
- Riwayat dan deteksi manipulasi harga.
- Ekspor Excel/PDF.
- Stok per lokasi.
- Menyembunyikan angka stok dari staf.
- Trigger database.

## 14. Asumsi terbuka

Perlu dikonfirmasi atau diverifikasi saat implementasi; tidak memblokir penulisan rencana:
- Batas R1 (H+1), R2 (7 hari), R3 (2 hari), pengingat pengajuan (7 hari), jendela "hasil staf tidak sesuai" (14 hari), jumlah cek acak (12) dan cek dokter (5) — asumsi, belum dikonfirmasi praktik klinik.
- Hari acak Senin–Sabtu — bisa jatuh di hari klinik tidak ada staf.
- Tipe kolom `stock_movements.movement_type` — diverifikasi di DB terisolasi.
- Volume data cukup kecil untuk aturan yang dihitung saat halaman dibuka — belum diukur.
- Perilaku form Kelola Obat versi lama yang masih ter-cache — ditangani dengan 409 dan kenaikan versi aset.

## 15. Tambahan saat penulisan spec

Hal berikut tidak dibahas eksplisit per bagian di percakapan; muncul saat merinci desain yang sudah disetujui dan perlu disetujui bersama spec ini:

1. **Urutan kunci `obat` → `obat_batches` untuk semua penulis stok** (4.3). Diperlukan agar pasangan "stok sistem + ID mutasi terakhir" saat hitung opname konsisten. Konsekuensi: `deductFIFO` (jalur pembayaran tagihan) dan retur klinik ikut diubah urutan kuncinya. Ini menyentuh jalur pembayaran, sehingga wajib diuji di DB terisolasi sebelum deploy.
2. **Status `scheduled`** pada sesi cek acak dan job cron tiap 15 menit, sebagai cara menyembunyikan hari acak dari staf (7.1).
3. **Penyesuaian minus yang melebihi total batch** dicatat sebagai sisa tanpa batch, mengikuti pola legacy yang sudah ada (4.4 langkah 3).
4. **Pemisahan endpoint** `/api/drug-audit/*` (dokter) dan `/api/stock-opname/*` (staf), agar sesi cek dokter tidak pernah terlihat lewat endpoint staf (9.1).
5. **Rincian kumpulan berisiko**: selisih opname 90 hari, 10 obat dengan jumlah keluar terbanyak 30 hari, dan temuan aturan yang belum diperiksa (7.1).
6. **Batas waktu sesi `full` dan `doctor` hanya informasi**; hanya `spot` yang bisa berstatus `missed` (5.2).
