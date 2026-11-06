# Audit Obat — Tahap 1 (Tutup Jalur) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setelah tahap ini live, `obat.stock` hanya bisa berubah lewat jalur yang selalu mencatat `stock_movements`. Penyesuaian manual berubah menjadi pengajuan yang baru berlaku setelah dokter menyetujuinya di halaman Audit Obat (tab Persetujuan dan Rekonsiliasi), dan halaman itu khusus dokter.

**Architecture:** Layanan baru `StockLedgerService` memiliki semua penulisan stok (pembelian, pemotongan FIFO, penerapan penyesuaian), dengan urutan kunci `obat` → `obat_batches`. `InventoryService` mendelegasikan ke layanan itu, sehingga pemanggil lama tidak berubah. Pengajuan disimpan di tabel baru `stock_adjustment_requests` lewat `StockAdjustmentRequestService`. Router baru `/api/drug-audit` memakai `requireDoctorRole` dan dua izin protected yang tidak bisa didelegasikan.

**Tech Stack:** Node.js/Express, mysql2 (MariaDB 10.11), jest + supertest, Puppeteer (smoke di VPS), AdminLTE/Bootstrap 4, ES modules di `staff/public/scripts`.

**Spec:** `docs/superpowers/specs/2026-11-06-audit-obat-anti-kebocoran-design.md` (bagian 11, baris "1. Tutup jalur"). Tahap 2 (opname) dan 3 (deteksi) mendapat rencana sendiri setelah tahap ini terverifikasi di VPS.

**Pemetaan nama ke spec:** operasi `applyApprovedAdjustment(requestId, actor)` di spec 4.1 dipecah menjadi dua: `StockAdjustmentRequestService.approveAdjustmentRequest` (kunci dan status pengajuan) dan `StockLedgerService.applyAdjustmentInTransaction` (penulisan stok, langkah 4.4). Perilakunya tetap sama dengan spec. Rute pengajuan staf tetap di `POST /api/inventory/adjust` (spec 4.2), sedangkan rute dokter ada di `/api/drug-audit/*` (spec 9.1).

**Di luar tahap ini (sengaja):** tombol "Hitung ulang" di Persetujuan (butuh tabel opname, tahap 2), `expected_stock`/baseline di Rekonsiliasi (tahap 2), menu Stock Opname, aturan R1–R8, tab Ringkasan/Kartu Stok/Opname/Keluar Tanpa Ditagih.

## Global Constraints

- Semua teks UI dan pesan error dalam Bahasa Indonesia, persis seperti yang ditulis di task.
- Role: pakai `ROLE_IDS.DOKTER` dari `staff/backend/constants/roles.js`; jangan hardcode `1` atau `'dokter'`.
- Token di modul halaman baru: `getAuthToken()` (global). `kelola-obat.js` dan modul turunannya tetap memakai `getIdToken()` dari `./vps-auth-v2.js`, seperti sekarang.
- Tidak ada `CREATE TABLE`/`ALTER TABLE`/`CREATE INDEX` di JavaScript runtime (`StaffPanelWave6StartupSchema.test.js`). DDL hanya di `staff/backend/migrations/`.
- Tidak menambah nilai `movement_type` baru. Penyesuaian = `movement_type = 'adjustment'`, `reference_type = 'stock_adjustment_request'`, `reference_id = <id pengajuan>`.
- Urutan kunci di setiap transaksi yang menulis stok: baris `obat` (`FOR UPDATE`) lebih dulu, baru `obat_batches`.
- Tanggal di frontend: komponen lokal (`getFullYear/getMonth/getDate`), jangan `toISOString()` untuk tanggal.
- CSS halaman baru di-scope ke `#content-drug-audit`; tanpa unit `vh`.
- Setiap fungsi yang dipakai di `onclick` wajib diekspor ke `window`.
- `window.STAFF_CACHE_VERSION` (`staff/public/index-adminlte.html`) dan `STAFF_PWA_VERSION` (`staff/public/sw.js`) selalu bernilai sama.
- Commit tanpa baris `Co-Authored-By` (CLAUDE.md). Push ke branch `claude/doctor-audit-page-9e1f67` di akhir setiap task.
- Mesin pengembangan tidak punya Node. Semua tes dijalankan di VPS lewat SSH alias `dokterdibya`, dan butuh izin pengguna sekali di awal eksekusi. Perintah standar (sebut `VPS_JEST <pola>`), dijalankan dari root worktree:

```bash
tar -czf - --exclude=node_modules staff | ssh dokterdibya 'set -e; rm -rf /tmp/drug-audit-test; mkdir -p /tmp/drug-audit-test; tar -xzf - -C /tmp/drug-audit-test; ln -s /var/www/dokterdibya/staff/backend/node_modules /tmp/drug-audit-test/staff/backend/node_modules; cd /tmp/drug-audit-test/staff/backend; JWT_SECRET=test npx jest --coverage=false --runInBand '"<pola>"
```

## Review Focus

1. **Form Kelola Obat lama (ter-cache) mengirim `stock` basi** setelah ada penjualan → harus 409 dengan pesan yang menyuruh muat ulang, bukan menimpa stok, dan field lain tidak tersimpan setengah. Tes: Task 4 `stale cached form stock is rejected with a reload hint`.
2. **`quantity_delta` berformat aneh** (`'2.5'`, `'1e2'`, `' 3'`, `'-0'`, `0`, `true`, `''`, `null`, `'abc'`, `100001`) → 400 tanpa INSERT. Tes: Task 3 `rejects malformed quantity_delta`.
3. **Pengurangan melebihi total batch tetapi masih ≤ stok** (stok legacy) → berhasil, sisanya dicatat tanpa batch. Jika melebihi stok → 422 tanpa satu pun UPDATE/INSERT. Tes: Task 3 `approve records the legacy remainder` dan `approve refuses to drive stock below zero`.
4. **Obat dihapus permanen setelah pengajuan dibuat** → Setuju menjawab 404 "Obat tidak ditemukan" dan pengajuan tetap `pending`. Tes: Task 3 `approve on a deleted obat returns 404 and keeps the request pending`.
5. **Obat tanpa satu pun baris batch** → stok 0 = Cocok; stok > 0 = Selisih batch (bukan error atau `NULL`). Tes: Task 5 `obat without batch rows reconcile against zero`.

---

### Task 1: Helper koneksi palsu + fungsi murni ledger

**Files:**
- Create: `staff/backend/tests/helpers/fakeConnection.js`
- Create: `staff/backend/services/StockLedgerService.js`
- Test: `staff/backend/tests/unit/StockLedgerPlanner.test.js`

**Interfaces:**
- Produces (`tests/helpers/fakeConnection.js`):
  - `createFakeConnection(handlers)` → `{ connection, calls }`. `handlers` adalah array `[RegExp, valueOrFn]`. `connection.query(sql, params)` mengembalikan nilai dari handler pertama yang regex-nya cocok dengan `sql` (jika fungsi, dipanggil dengan `(params, sql)`). SQL yang tidak cocok → `throw new Error('Unexpected SQL: ' + sql)`. `beginTransaction`, `commit`, `rollback`, dan `release` berupa `jest.fn()`. `calls` berisi `{ sql, params }` sesuai urutan.
  - `createFakePool(connection)` → `{ getConnection: async () => connection, query: (...a) => connection.query(...a) }`.
- Produces (`services/StockLedgerService.js`, CommonJS):
  - `ADJUSTMENT_REASON_CATEGORIES = ['rusak','pecah','kedaluwarsa','hilang','salah_hitung','opname','lainnya']`
  - `stockLedgerError(message, statusCode, code)` → `Error` dengan properti `statusCode` dan `code`.
  - `assertNoDirectStockEdit(requestedStock, currentStock)` → `void`. Lolos jika `requestedStock` bernilai `undefined`, `null`, atau `''`, atau jika `Number(requestedStock) === Number(currentStock)`. Selain itu melempar 409 `STOCK_EDIT_NOT_ALLOWED` dengan pesan persis: `Stok tidak bisa diubah di sini. Gunakan Ajukan Penyesuaian. Jika Anda tidak mengubah stok, muat ulang halaman.`
  - `effectiveUnitCost({ defaultCostPrice, latestBatchCost })` → `number`: `defaultCostPrice` jika > 0, jika tidak `latestBatchCost` jika > 0, jika tidak `0`. Input string di-parse dengan `parseFloat`.
  - `planAdjustmentAllocation({ quantityDelta, batches, batchId, unitCost })` → `{ deductions: [{ batchId, quantity, costPrice }], legacyQuantity, legacyCostPrice, newBatchQuantity }`. `batches` sudah diurutkan FIFO oleh pemanggil.

- [ ] **Step 1: Tulis tes yang gagal** — `StockLedgerPlanner.test.js`:

```js
const { planAdjustmentAllocation, assertNoDirectStockEdit, effectiveUnitCost } = require('../../services/StockLedgerService');
const batches = [{ id: 1, quantity_remaining: 2, cost_price: 1000 }, { id: 3, quantity_remaining: 0, cost_price: 900 }, { id: 2, quantity_remaining: 5, cost_price: 1100 }];
test('positive delta creates one new batch and touches no existing batch', () => {
  expect(planAdjustmentAllocation({ quantityDelta: 5, batches, batchId: null, unitCost: 1200 }))
    .toEqual({ deductions: [], legacyQuantity: 0, legacyCostPrice: 1200, newBatchQuantity: 5 });
});
test('negative delta deducts FIFO and skips empty batches', () => {
  expect(planAdjustmentAllocation({ quantityDelta: -4, batches, batchId: null, unitCost: 1200 }).deductions)
    .toEqual([{ batchId: 1, quantity: 2, costPrice: 1000 }, { batchId: 2, quantity: 2, costPrice: 1100 }]);
});
test('chosen batch is drained first, then FIFO', () => {
  expect(planAdjustmentAllocation({ quantityDelta: -6, batches, batchId: 2, unitCost: 1200 }).deductions)
    .toEqual([{ batchId: 2, quantity: 5, costPrice: 1100 }, { batchId: 1, quantity: 1, costPrice: 1000 }]);
});
test('shortfall beyond all batches becomes a legacy remainder at unit cost', () => {
  const plan = planAdjustmentAllocation({ quantityDelta: -9, batches, batchId: null, unitCost: 1200 });
  expect(plan.legacyQuantity).toBe(2); expect(plan.legacyCostPrice).toBe(1200); expect(plan.newBatchQuantity).toBe(0);
});
test('unknown chosen batch and zero delta are rejected', () => {
  expect(() => planAdjustmentAllocation({ quantityDelta: -1, batches, batchId: 99, unitCost: 0 })).toThrow(expect.objectContaining({ statusCode: 409, message: 'Batch tidak ditemukan untuk obat ini' }));
  expect(() => planAdjustmentAllocation({ quantityDelta: 0, batches, batchId: null, unitCost: 0 })).toThrow(expect.objectContaining({ statusCode: 400 }));
});
test('direct stock edits are allowed only when the value is absent or unchanged', () => {
  for (const value of [undefined, null, '', '5', 5]) expect(() => assertNoDirectStockEdit(value, 5)).not.toThrow();
  let error; try { assertNoDirectStockEdit(4, 5); } catch (e) { error = e; }
  expect(error).toMatchObject({ statusCode: 409, code: 'STOCK_EDIT_NOT_ALLOWED' });
  expect(error.message).toContain('Ajukan Penyesuaian'); expect(error.message).toContain('muat ulang');
});
test('effective unit cost prefers default cost, then latest batch cost', () => {
  expect(effectiveUnitCost({ defaultCostPrice: 0, latestBatchCost: 900 })).toBe(900);
  expect(effectiveUnitCost({ defaultCostPrice: '1500.50', latestBatchCost: 900 })).toBe(1500.5);
  expect(effectiveUnitCost({ defaultCostPrice: null, latestBatchCost: null })).toBe(0);
});
```

- [ ] **Step 2: Jalankan, pastikan gagal** — `VPS_JEST tests/unit/StockLedgerPlanner.test.js`. Hasil yang diharapkan: FAIL, `Cannot find module '../../services/StockLedgerService'`.
- [ ] **Step 3: Implementasi** `fakeConnection.js` dan kelima ekspor di `StockLedgerService.js` (belum ada `require('../db')` di task ini).
- [ ] **Step 4: Jalankan, pastikan lulus** — `VPS_JEST tests/unit/StockLedgerPlanner.test.js` → PASS (7 tes).
- [ ] **Step 5: Commit + push**

```bash
git add staff/backend/tests/helpers/fakeConnection.js staff/backend/services/StockLedgerService.js staff/backend/tests/unit/StockLedgerPlanner.test.js
git commit -m "Add stock ledger planning helpers and fake DB connection for tests"
git push
```

---

### Task 2: Pindahkan penulis stok ke StockLedgerService dengan urutan kunci obat → batch

**Files:**
- Modify: `staff/backend/services/StockLedgerService.js` (tambah `lockObatRow`, `recordPurchase`, `deductStockFIFO`)
- Modify: `staff/backend/services/InventoryService.js` (`recordPurchase` dan `deductStockFIFO` jadi delegasi; hapus `adjustStock` di Task 4, jangan di sini)
- Modify: `staff/backend/services/sunday-clinic/billing-returns.js` (kunci baris `obat` sebelum loop alokasi)
- Test: `staff/backend/tests/unit/StockLedgerLockOrder.test.js`

**Interfaces:**
- Consumes: `createFakeConnection`, `createFakePool` (Task 1).
- Produces:
  - `lockObatRow(connection, obatId)` → `Promise<{ id, stock, default_cost_price }>`. Menjalankan `SELECT id, stock, default_cost_price FROM obat WHERE id = ? FOR UPDATE`. Jika tidak ada baris → `stockLedgerError('Obat tidak ditemukan', 404, 'OBAT_NOT_FOUND')`.
  - `recordPurchase(input)` dan `deductStockFIFO(obatId, quantity, referenceType, referenceId, createdBy)` dengan signature dan nilai balik yang **sama persis** dengan `InventoryService` sekarang. `InventoryService.recordPurchase/deductStockFIFO` cukup `return StockLedgerService.<fn>(...)`.

- [ ] **Step 1: Tulis tes yang gagal** — `StockLedgerLockOrder.test.js`:
  - `jest.mock('../../db', ...)` memakai `createFakePool`, ditambah mock `../../utils/cache` (`delPattern: jest.fn()`) dan `../../utils/logger`.
  - `deductStockFIFO locks the obat row before any batch row`: handler memakai stok obat 10 dan batch `[{id:1,quantity_remaining:2,cost_price:1000},{id:2,quantity_remaining:5,cost_price:1100}]`. Panggil `deductStockFIFO(7, 4, 'obat_sale', 55, 'Staf')`, lalu assert indeks call pertama yang cocok `/FROM obat WHERE id = \? FOR UPDATE/` lebih kecil dari indeks call pertama yang cocok `/FROM obat_batches[\s\S]*FOR UPDATE/`.
  - `deductStockFIFO keeps FIFO results`: hasil `totalCost === 4200`, `deductions.map(d => d.batchId)` sama dengan `[1, 2]`, dan nilai `quantity` pada INSERT `stock_movements` berurutan `[-2, -2]`.
  - `recordPurchase locks the obat row before inserting the batch`: indeks lock `obat` lebih kecil dari indeks `INSERT INTO obat_batches`.
  - `InventoryService delegates stock writes`: `jest.spyOn(StockLedgerService, 'deductStockFIFO').mockResolvedValue('x')`, lalu `InventoryService.deductStockFIFO(1,1,'t',2,'u')` resolve ke `'x'` dan spy dipanggil dengan argumen yang sama. Hal yang sama untuk `recordPurchase`.
  - `clinic return locks obat rows before restoring batches`: baca `billing-returns.js` sebagai string, lalu assert posisi `/SELECT id FROM obat WHERE id IN \(\?\) ORDER BY id FOR UPDATE/` lebih kecil dari posisi `UPDATE obat_batches SET quantity_remaining = quantity_remaining +`.
- [ ] **Step 2: Jalankan, pastikan gagal** — `VPS_JEST tests/unit/StockLedgerLockOrder.test.js` → FAIL (`lockObatRow`/`deductStockFIFO` belum ada).
- [ ] **Step 3: Implementasi.**
  - Pindahkan isi `recordPurchase` dan `deductStockFIFO` apa adanya ke `StockLedgerService`.
  - Statement pertama setelah `beginTransaction` di kedua fungsi adalah `await lockObatRow(connection, obatId)`.
  - Di `deductStockFIFO`, ganti dua query `SELECT stock, default_cost_price FROM obat WHERE id = ? FOR UPDATE` yang muncul belakangan dengan baris hasil `lockObatRow`.
  - Di `billing-returns.js`, tepat sebelum `for (const allocation of allocations)`: jika `allocations.length`, jalankan query kunci di atas dengan `[...new Set(allocations.map(a => a.obat_id))]`.
- [ ] **Step 4: Jalankan, pastikan lulus** — `VPS_JEST "tests/unit/(StockLedger|SundayClinicReturns|SundayClinicAdditionalBilling|InventoryOrders|OrderRecommendation)"` → semua PASS.
- [ ] **Step 5: Commit + push** — `git commit -m "Route purchase and FIFO stock writes through StockLedgerService with obat-first locking"`.

---

### Task 3: Tabel pengajuan + layanan pengajuan + penerapan penyesuaian

**Files:**
- Create: `staff/backend/migrations/20261106_stock_adjustment_requests.sql`
- Modify: `staff/backend/services/StockLedgerService.js` (tambah `applyAdjustmentInTransaction`)
- Create: `staff/backend/services/StockAdjustmentRequestService.js`
- Test: `staff/backend/tests/unit/StockAdjustmentRequests.test.js`

**Interfaces:**
- Consumes: `lockObatRow`, `planAdjustmentAllocation`, `effectiveUnitCost`, `stockLedgerError`, `ADJUSTMENT_REASON_CATEGORIES` (Task 1–2).
- Produces:
  - `StockLedgerService.applyAdjustmentInTransaction(connection, { requestId, obatId, batchId, quantityDelta, reasonCategory, actorName })` → `{ stockBefore, stockAfter, movementIds }`. **Tidak** commit; pemanggil yang commit.
  - `StockAdjustmentRequestService` (CommonJS), dengan ekspor berikut:
    - `STALE_REQUEST_DAYS = 7`
    - `actorFromRequest(req)` → `{ id: String(req.user.id), name: req.user.name || String(req.user.id) }`
    - `normalizeAdjustmentInput(body)` → `{ obatId, batchId, quantityDelta, reasonCategory, reasonNote }`
    - `toRequestView(row)` → `row` ditambah `{ value, is_stale }`
    - `createAdjustmentRequest(body, actor)` → `{ id, status: 'pending' }`
    - `listAdjustmentRequests({ status, limit, offset })` → `{ rows, total }`
    - `approveAdjustmentRequest(id, actor, decisionNote)` → `{ id, status: 'approved', stockAfter, movementIds }`
    - `rejectAdjustmentRequest(id, actor, decisionNote)` → `{ id, status: 'rejected' }`

Migrasi (persis):

```sql
CREATE TABLE IF NOT EXISTS stock_adjustment_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  obat_id INT NOT NULL,
  batch_id INT NULL,
  quantity_delta INT NOT NULL,
  reason_category ENUM('rusak','pecah','kedaluwarsa','hilang','salah_hitung','opname','lainnya') NOT NULL,
  reason_note VARCHAR(1000) NOT NULL,
  source ENUM('manual','opname') NOT NULL DEFAULT 'manual',
  opname_item_id INT UNSIGNED NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  stock_at_request INT NOT NULL,
  stock_at_decision INT NULL,
  requested_by_id VARCHAR(64) NOT NULL,
  requested_by_name VARCHAR(255) NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_id VARCHAR(64) NULL,
  decided_by_name VARCHAR(255) NULL,
  decided_at DATETIME NULL,
  decision_note VARCHAR(1000) NULL,
  movement_ids JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sar_status (status, requested_at),
  INDEX idx_sar_obat (obat_id, requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Aturan yang harus dipegang implementer:

- **Validasi `normalizeAdjustmentInput`** (semua 400, pesan persis):

| Kondisi | Pesan |
|---|---|
| `obat_id` bukan bilangan bulat positif | `Obat harus dipilih` |
| `quantity_delta` bukan integer number ≠ 0 atau string yang cocok `/^-?[1-9]\d*$/` (boolean ditolak) | `Jumlah penyesuaian harus bilangan bulat selain 0` |
| `|delta| > 100000` | `Jumlah penyesuaian terlalu besar` |
| `reason_category` tidak ada di daftar, atau bernilai `opname` | `Kategori alasan tidak valid` |
| `reason_note` hasil trim kosong atau > 1000 karakter | `Catatan alasan wajib diisi (maksimal 1000 karakter)` |
| `batch_id` diisi untuk delta > 0 | `Batch hanya bisa dipilih untuk pengurangan stok` |
| kategori `kedaluwarsa` tanpa `batch_id` | `Pilih batch untuk obat kedaluwarsa` |

- **`createAdjustmentRequest`**:
  - Jalankan `SELECT id, stock FROM obat WHERE id = ?`. Jika kosong → 404 `Obat tidak ditemukan`.
  - Jika ada `batchId`, jalankan `SELECT id FROM obat_batches WHERE id = ? AND obat_id = ?`. Jika kosong → 400 `Batch tidak ditemukan untuk obat ini`.
  - INSERT dengan `source = 'manual'` dan `stock_at_request = obat.stock`. Tidak ada penulisan stok.
- **`applyAdjustmentInTransaction`**, urutan langkahnya:
  1. `lockObatRow`.
  2. Jika `stock + delta < 0` → 422 `Stok tidak cukup untuk penyesuaian ini`.
  3. `SELECT id, quantity_remaining, cost_price FROM obat_batches WHERE obat_id = ? AND quantity_remaining > 0 ORDER BY purchase_date ASC, id ASC FOR UPDATE`.
  4. Ambil harga batch terakhir (`cost_price > 0`, `ORDER BY purchase_date DESC, id DESC LIMIT 1`), hitung `effectiveUnitCost`, lalu jalankan `planAdjustmentAllocation`.
  5. Untuk setiap deduction: `UPDATE obat_batches SET quantity_remaining = quantity_remaining - ? WHERE id = ? AND quantity_remaining >= ?`. Jika `affectedRows` 0 → 409 `Batch berubah, coba lagi`. Lalu INSERT mutasi `adjustment` dengan quantity negatif dan `cost_price` milik batch itu.
  6. Untuk legacy remainder: INSERT mutasi dengan `batch_id` NULL.
  7. Untuk `newBatchQuantity`: INSERT `obat_batches` (`purchase_date = CURDATE()`, `cost_price = unitCost`, `quantity_purchased = quantity_remaining = n`, `notes = 'Penyesuaian #<requestId>'`), lalu INSERT mutasi positif dengan `batch_id` baru.
  8. `UPDATE obat SET stock = stock + ? WHERE id = ?`.
  9. Semua mutasi memakai `notes = 'Penyesuaian #<requestId> (<reasonCategory>)'` dan `created_by = actorName`.
- **`approveAdjustmentRequest`**:
  - Ambil koneksi, `beginTransaction`, lalu `SELECT * FROM stock_adjustment_requests WHERE id = ? FOR UPDATE`. Kosong → 404 `Pengajuan tidak ditemukan`. Status bukan `pending` → 409 `Pengajuan sudah diputuskan`.
  - Panggil `applyAdjustmentInTransaction`.
  - UPDATE pengajuan: `status='approved'`, `stock_at_decision = stockBefore`, `decided_by_id/name`, `decided_at = NOW()`, `decision_note` (trim, NULL jika kosong), `movement_ids = JSON.stringify(movementIds)`.
  - Commit, lalu `cache.delPattern('obat:')`. Error apa pun → rollback dan lempar ulang. `release` selalu dipanggil.
- **`rejectAdjustmentRequest`**:
  - Catatan hasil trim kosong → 400 `Catatan penolakan wajib diisi`, tanpa query apa pun.
  - Kunci pengajuan seperti di atas, lalu `SELECT stock FROM obat WHERE id = ?`.
  - UPDATE `status='rejected'`, `stock_at_decision = stock` (atau NULL jika obat sudah tidak ada), beserta data pemutus. Tidak ada penulisan stok.
- **`listAdjustmentRequests`**:
  - `status` ∈ `pending|approved|rejected|all`; selain itu → 400 `Status tidak valid`.
  - Query JOIN `obat` (`code`, `name`, `unit`, `stock AS current_stock`, `default_cost_price`), LEFT JOIN `obat_batches` (`batch_number`), dan subquery harga batch terakhir `latest_batch_cost`.
  - `age_days = DATEDIFF(NOW(), sar.requested_at)`. Urutan `requested_at DESC, id DESC`, dengan `LIMIT/OFFSET`.
  - Total dihitung dengan `COUNT(*)` memakai filter yang sama.
- **`toRequestView`**: `value = quantity_delta × effectiveUnitCost(default_cost_price, latest_batch_cost)`; `is_stale = status === 'pending' && age_days > 7`.

- [ ] **Step 1: Tulis tes yang gagal** — `StockAdjustmentRequests.test.js` (mock `../../db` dengan `createFakePool`, mock `cache` dan `logger`):
  - `normalizes a valid manual request`: `{obat_id:'7', quantity_delta:'-3', reason_category:'rusak', reason_note:' pecah botol '}` → `{obatId:7, batchId:null, quantityDelta:-3, reasonCategory:'rusak', reasonNote:'pecah botol'}`.
  - `rejects malformed quantity_delta` (Review Focus 2): untuk setiap nilai `['2.5','1e2',' 3','-0',0,true,'',null,'abc',100001]` → error `statusCode 400`.
  - `rejects opname and unknown categories, batch on increases, expiry without batch`: masing-masing 400 dengan pesan persis dari tabel di atas.
  - `create stores a pending request without touching stock`: fake `SELECT id, stock FROM obat` → `[[{id:7, stock:10}]]`, INSERT → `[{insertId:41}]`. Hasil `{id:41, status:'pending'}`. Params INSERT memuat `10`, `'U1'`, dan `'Staf Uji'`. Tidak ada call yang cocok `/UPDATE obat|INSERT INTO stock_movements/`.
  - `approve applies FIFO deductions in lock order and records the decision`:
    - Data: pengajuan `{id:41, obat_id:7, batch_id:null, quantity_delta:-3, reason_category:'rusak', status:'pending'}`, obat `{id:7, stock:10, default_cost_price:1000}`, batch `[{id:1,quantity_remaining:2,cost_price:1000},{id:2,quantity_remaining:5,cost_price:1100}]`.
    - Urutan call: kunci pengajuan → kunci obat → kunci batch.
    - UPDATE batch: `[2,1,2]` lalu `[1,2,1]` (params `qty,id,qty`).
    - INSERT mutasi dengan quantity `-2` dan `-1`, `reference_type` `stock_adjustment_request`, `reference_id` `41`.
    - `UPDATE obat SET stock = stock + ?` dengan `-3`.
    - UPDATE pengajuan memuat `'approved'`, `10`, dan `movement_ids` berupa JSON array.
    - `commit` dipanggil sekali. Hasil `{id:41, status:'approved', stockAfter:7}`.
  - `approve records the legacy remainder` (Review Focus 3): stok 10, total batch 2 (satu batch), delta −6 → satu INSERT mutasi dengan `batch_id` NULL dan quantity `-4`, berhasil.
  - `approve refuses to drive stock below zero` (Review Focus 3): stok 2, delta −5 → reject 422 `Stok tidak cukup untuk penyesuaian ini`, `rollback` dipanggil, dan tidak ada call yang cocok `/UPDATE obat_batches|UPDATE obat SET|INSERT INTO stock_movements|UPDATE stock_adjustment_requests/`.
  - `approve creates a batch for increases`: delta +4 → INSERT `obat_batches` dengan params memuat `4` dan `'Penyesuaian #41'`, lalu mutasi `+4` dengan `batch_id` = insertId batch.
  - `approve on a decided request returns 409`: status `approved` → 409 `Pengajuan sudah diputuskan`, rollback, dan tidak ada kunci obat.
  - `approve on a deleted obat returns 404 and keeps the request pending` (Review Focus 4): kunci obat → `[[]]` → 404 `Obat tidak ditemukan`, tidak ada `UPDATE stock_adjustment_requests`, rollback.
  - `reject requires a note and never writes stock`: `'   '` → 400 dan `calls.length === 0`. Catatan valid → UPDATE memuat `'rejected'` dan stok saat itu, tanpa `/UPDATE obat|stock_movements|obat_batches/`.
  - `request view computes value and staleness`: `{quantity_delta:-3, default_cost_price:0, latest_batch_cost:1100, status:'pending', age_days:8}` → `value -3300`, `is_stale true`. Dengan `age_days:7` → `false`.
  - `list rejects unknown status`: `{status:'bogus'}` → 400 `Status tidak valid`.
- [ ] **Step 2: Jalankan, pastikan gagal** — `VPS_JEST tests/unit/StockAdjustmentRequests.test.js` → FAIL (modul belum ada).
- [ ] **Step 3: Implementasi** migrasi, `applyAdjustmentInTransaction`, dan `StockAdjustmentRequestService` sesuai aturan di atas.
- [ ] **Step 4: Jalankan, pastikan lulus** — `VPS_JEST "tests/unit/(StockAdjustmentRequests|StockLedger|StaffPanelWave6StartupSchema)"` → PASS.
- [ ] **Step 5: Commit + push** — `git commit -m "Add stock adjustment requests with doctor approval applied through the ledger"`.

---

### Task 4: Tutup jalur ubah-stok langsung

**Files:**
- Modify: `staff/backend/routes/obat.js` (POST `/api/obat`, PUT `/api/obat/:id`, PATCH `/api/obat/:id/stock`)
- Modify: `staff/backend/routes/v1/obat.js` (PATCH `/obat/:id/stock`)
- Modify: `staff/backend/services/ObatService.js` (`createObat`, `updateObat`; hapus `updateStock`, `deductStock`, `addStock`)
- Modify: `staff/backend/routes/inventory.js` (`/adjust`, `/deduct`)
- Modify: `staff/backend/services/InventoryService.js` (hapus `adjustStock`)
- Test: `staff/backend/tests/unit/StockDirectEditClosed.test.js`

**Interfaces:**
- Consumes: `assertNoDirectStockEdit` (Task 1), `createAdjustmentRequest`, `actorFromRequest` (Task 3).
- Produces (kontrak HTTP):
  - PATCH (lama dan v1) dan `/api/inventory/deduct` → 410 `{ success:false, code:'STOCK_ENDPOINT_REMOVED', message:'Endpoint ini sudah ditutup. Gunakan Ajukan Penyesuaian di Kelola Obat.' }`. Rantai middleware tetap sama seperti sekarang, supaya pemetaan registri tidak berubah.
  - PUT `/api/obat/:id`:
    - Jalankan `SELECT stock FROM obat WHERE id = ?`. Kosong → 404 `{success:false, message:'Obat not found'}`.
    - `assertNoDirectStockEdit(req.body.stock, row.stock)`. Kalau gagal → 409 `{ success:false, code, message }`.
    - UPDATE tanpa kolom `stock`.
  - POST `/api/obat` dan `ObatService.createObat` → stok selalu `0`.
  - `ObatService.updateObat`:
    - Baca stok **tanpa cache** dengan `await db.findById('obat', id)`. **Jangan** pakai `getObatById`, karena fungsi itu membaca `cache.getOrSet` dan stoknya bisa basi. Kalau tidak ada baris → `AppError('Obat not found', 404)`.
    - Panggil `assertNoDirectStockEdit(obatData.stock, row.stock)`. Kalau gagal, lempar ulang sebagai `AppError(message, 409)`.
    - `updateData` tidak memuat `stock`.
  - POST `/api/inventory/adjust` → `createAdjustmentRequest(req.body, actorFromRequest(req))`, lalu balas 201 `{ success:true, data:{ id, status:'pending' }, message:'Pengajuan penyesuaian dikirim. Stok berubah setelah disetujui dokter.' }`. Error yang punya `statusCode` → dibalas dengan status itu dan `message`-nya. Selain itu 500 `Gagal mengirim pengajuan penyesuaian`.

- [ ] **Step 1: Tulis tes yang gagal** — `StockDirectEditClosed.test.js` (supertest):
  - Mock `../../middleware/auth`: semua guard pass-through, dan `verifyToken` mengisi `req.user = {id:'U1', name:'Staf Uji'}`.
  - Mock `../../middleware/validation`: `validateObat` dan `validateObatUpdate` = `[(req,res,next)=>next()]`.
  - Mock `../../db` (`query: jest.fn()`), `../../utils/cache`, dan `../../services/StockAdjustmentRequestService` (`createAdjustmentRequest: jest.fn()`, `actorFromRequest` asli).
  - Router yang di-mount: `app.use('/', require('../../routes/obat'))`, `app.use('/api/v1', require('../../routes/v1/obat'))`, dan `app.use('/api/inventory', require('../../routes/inventory'))`.

  Daftar tes:
  - `different stock on PUT is rejected with 409 and nothing is written`: `db.query` untuk SELECT → `[[{stock:10}]]`. Body `{name:'A', category:'Obat', price:1, stock:3}` → 409 `STOCK_EDIT_NOT_ALLOWED`, dan tidak ada call `/^UPDATE obat/`.
  - `stale cached form stock is rejected with a reload hint` (Review Focus 1): body stock `9` vs stok saat ini `10` → 409, `message` memuat `muat ulang`.
  - `PUT without stock or with equal stock saves and the UPDATE has no stock column`: dua permintaan (tanpa stock, dan stock `10`) → 200, dan SQL UPDATE tidak cocok `/\bstock\s*=/`.
  - `POST always inserts stock 0`: body stock `50` → params INSERT pada posisi stock bernilai `0`.
  - `PATCH stock endpoints are gone`: `PATCH /api/obat/7/stock` dan `PATCH /api/v1/obat/7/stock` → 410 `STOCK_ENDPOINT_REMOVED`, dan `db.query` tidak dipanggil.
  - `manual FIFO deduct endpoint is gone`: `POST /api/inventory/deduct` → 410.
  - `adjust creates a pending request instead of changing stock`: mock resolve `{id:5, status:'pending'}` → 201, `createAdjustmentRequest` dipanggil dengan `(body, {id:'U1', name:'Staf Uji'})`.
  - `adjust maps validation errors`: mock reject `Object.assign(new Error('Obat harus dipilih'), {statusCode:400})` → 400 dengan pesan yang sama.
  - `ObatService no longer writes stock`:
    - `jest.isolateModules` dengan mock `../../utils/database` (`findById: jest.fn(async () => ({id:7, stock:10}))`, `updateById: jest.fn(async () => 1)`, `insert: jest.fn(async () => ({insertId:9}))`, `exists: jest.fn(async () => false)`).
    - Mock `../../utils/cache`: `{ keys: { obat: id => 'obat:' + id }, getOrSet: jest.fn(async () => ({ id: 7, stock: 999 })), delPattern: jest.fn() }`. Stok 999 di cache sengaja dibuat basi.
    - `updateObat(7, {name:'A', stock:3})` → reject `statusCode 409`.
    - `updateObat(7, {name:'A', stock:10})` → berhasil (membuktikan stok dibaca dari `findById`, bukan dari cache yang berisi 999), dan `cache.getOrSet` tidak dipanggil.
    - `updateObat(7, {name:'A'})` → objek `updateById` tidak punya key `stock`.
    - `createObat({code:'X', name:'A', category:'Obat', price:1, stock:50})` → `insert` dipanggil dengan `stock: 0`.
    - `typeof ObatService.updateStock === 'undefined'`.
- [ ] **Step 2: Jalankan, pastikan gagal** — `VPS_JEST tests/unit/StockDirectEditClosed.test.js` → FAIL (PUT masih 200, PATCH masih mengubah stok).
- [ ] **Step 3: Implementasi** semua perilaku pada blok Produces di atas.
- [ ] **Step 4: Jalankan, pastikan lulus** — `VPS_JEST "tests/unit/(StockDirectEditClosed|AccessControlCatalogRegistry|KelolaObat|validation)"` → PASS.
- [ ] **Step 5: Commit + push** — `git commit -m "Close direct stock edit endpoints and turn manual adjustments into requests"`.

---

### Task 5: Layanan rekonsiliasi (mode belum ada baseline)

**Files:**
- Create: `staff/backend/services/DrugAuditReconciliationService.js`
- Test: `staff/backend/tests/unit/DrugAuditReconciliation.test.js`

**Interfaces:**
- Produces:
  - `classifyReconciliationRow({ stock, batchTotal, expectedStock })` → `'match' | 'batch_mismatch' | 'movement_mismatch'`. Jika `expectedStock != null && stock !== expectedStock`, hasilnya `movement_mismatch` (diutamakan). Jika tidak dan `stock !== batchTotal`, hasilnya `batch_mismatch`. Selain itu `match`.
  - `getReconciliation({ onlyMismatch = false } = {})` → `{ baseline: null, summary: { total, match, batch_mismatch, movement_mismatch }, rows: [{ obat_id, code, name, unit, is_active, stock, batch_total, expected_stock: null, status }] }`. Jumlah di `summary` selalu dihitung dari semua obat; `onlyMismatch` hanya menyaring `rows`.

- [ ] **Step 1: Tulis tes yang gagal:**
  - `classification prefers movement mismatch`: `(10,10,null)` → `match`, `(10,8,null)` → `batch_mismatch`, `(10,10,9)` → `movement_mismatch`, `(10,8,9)` → `movement_mismatch`.
  - `reads inside one consistent snapshot`: fake connection. Call pertama harus cocok `/START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY/`, query agregat harus memakai `LEFT JOIN obat_batches`, lalu `commit` dan `release` masing-masing dipanggil sekali.
  - `obat without batch rows reconcile against zero` (Review Focus 5): baris `{id:1, stock:0, batch_total:null}` → `batch_total 0`, status `match`. Baris `{id:2, stock:3, batch_total:null}` → `batch_mismatch`.
  - `onlyMismatch filters rows but not the summary`: 3 baris (2 cocok, 1 selisih) → `rows.length === 1`, `summary` `{total:3, match:2, batch_mismatch:1, movement_mismatch:0}`.
- [ ] **Step 2: Jalankan, pastikan gagal** — `VPS_JEST tests/unit/DrugAuditReconciliation.test.js` → FAIL.
- [ ] **Step 3: Implementasi.**
  - Ambil koneksi dari `db.getConnection()`, lalu jalankan `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY`.
  - Query agregat: `SELECT o.id, o.code, o.name, o.unit, o.is_active, o.stock, COALESCE(SUM(ob.quantity_remaining), 0) AS batch_total FROM obat o LEFT JOIN obat_batches ob ON ob.obat_id = o.id GROUP BY o.id ORDER BY o.name`.
  - Commit di `try`, rollback di `catch`, `release` di `finally`. Angka diubah dengan `Number()`.
  - Obat nonaktif tetap ikut ditampilkan.
- [ ] **Step 4: Jalankan, pastikan lulus** — `VPS_JEST tests/unit/DrugAuditReconciliation.test.js` → PASS.
- [ ] **Step 5: Commit + push** — `git commit -m "Add drug audit reconciliation of stock against batch totals"`.

---

### Task 6: Izin khusus dokter + API `/api/drug-audit`

**Files:**
- Modify: `staff/backend/config/accessControlCatalog.js` (dua izin baru di daftar izin baru, dekat izin dokter lainnya)
- Modify: `staff/backend/middleware/auth.js` (`NON_DELEGABLE_ACCOUNT_PERMISSIONS` ditambah `'drug_audit.view'` dan `'drug_audit.approve'`)
- Modify: `staff/backend/config/accessControlRegistry.js` (`SOURCE_POLICIES['drug-audit']`)
- Create: `staff/backend/routes/drug-audit.js`
- Modify: `staff/backend/server.js` (tepat setelah baris `app.use('/api/inventory', require('./routes/inventory-orders'));` tambahkan `app.use('/api/drug-audit', require('./routes/drug-audit'));`)
- Test: `staff/backend/tests/unit/DrugAuditRoutes.test.js`

**Interfaces:**
- Consumes: `getReconciliation` (Task 5), dan `listAdjustmentRequests`, `approveAdjustmentRequest`, `rejectAdjustmentRequest`, `toRequestView`, `actorFromRequest` (Task 3).
- Produces:
  - Entri katalog (persis):

```js
permission('drug_audit.view', 'Baca audit obat', 'Obat dan Inventori', 'view', [{ kind: 'doctor' }], { protected: true }),
permission('drug_audit.approve', 'Putuskan pengajuan dan opname audit obat', 'Obat dan Inventori', 'finalize', [{ kind: 'doctor' }], { protected: true }),
```

  - Registri: `'drug-audit': CRUD('drug_audit.view', 'drug_audit.approve', 'drug_audit.approve', 'drug_audit.approve', { finalize: 'drug_audit.approve' })`. `security/accessRouteInventory.js` memindai `routes/` secara otomatis, jadi tidak perlu diedit. Yang membuktikan cakupannya adalah tes `AccessControlCatalogRegistry`.
  - Rute. Semua memakai `verifyToken, requireDoctorRole` dari `../middleware/auth`:

| Method & path | Parameter | Memanggil | Balasan |
|---|---|---|---|
| `GET /reconciliation` | `only_mismatch=1` | `getReconciliation({ onlyMismatch })` | 200 `{ success:true, data }` |
| `GET /adjustment-requests` | `status` (default `pending`), `limit` (default 50, dibatasi 1..200), `offset` (default 0, minimal 0) | `listAdjustmentRequests` | 200 `{ success:true, data: rows.map(toRequestView), pagination:{ total, limit, offset } }` |
| `POST /adjustment-requests/:id/approve` | body `{ decision_note? }` | `approveAdjustmentRequest(Number(id), actor, note)` | 200 `{ success:true, data }` |
| `POST /adjustment-requests/:id/reject` | body `{ decision_note }` | `rejectAdjustmentRequest(Number(id), actor, note)` | 200 `{ success:true, data }` |

  - `:id` yang bukan bilangan bulat positif → 400 `Pengajuan tidak valid`.
  - Error yang punya `statusCode` → `{ success:false, code: error.code || null, message }` dengan status itu. Selain itu → 500 `Gagal memproses audit obat` dan `logger.error`.

- [ ] **Step 1: Tulis tes yang gagal** — `DrugAuditRoutes.test.js`:
  - Set `process.env.JWT_SECRET ||= 'drug-audit-test'`.
  - Pakai helper `accountRequest` dan `responseDouble` dengan pola yang sama seperti `Task11MonitoringSystemAccess.test.js`.

  Daftar tes:
  - `delegated drug audit grants never pass the doctor guard`: untuk `drug_audit.view` dan `drug_audit.approve`, `isDelegatedAccountPermission(accountRequest(p), [p])` bernilai `false`, dan `requireDoctorRole(accountRequest(p), res, next)` → `next` tidak dipanggil, `res.statusCode === 403`.
  - `superadmin without the doctor role is rejected`: `{ user:{ id:'S', is_superadmin:1, role_id: ROLE_IDS.ADMIN } }` → 403.
  - `doctor role passes`: `role_id: ROLE_IDS.DOKTER` → `next` dipanggil sekali.
  - `drug audit permissions are protected and not delegable`: entri katalog punya `protected: true`, dan `getDelegableCatalog()` tidak memuat kedua nama itu.
  - `registry maps drug audit routes`: `resolveRouteAccess` untuk `{sourceFile:'drug-audit', method:'POST', routePath:'/adjustment-requests/:id/approve', fileMiddleware:'', handlerPrefix:'verifyToken, requireDoctorRole'}` → `permission 'drug_audit.approve'`, dan GET `/reconciliation` → `'drug_audit.view'`.
  - Tes HTTP (supertest). Mock `../../middleware/auth` = `{ ...jest.requireActual(...), verifyToken: (req,res,next) => { req.user = JSON.parse(req.headers['x-test-user'] || 'null'); return req.user ? next() : res.status(401).end(); } }`. Kedua service di-mock.
    - `GET /api/drug-audit/reconciliation` sebagai staf (`role_id: ROLE_IDS.ADMIN`) → 403. Sebagai dokter dengan `?only_mismatch=1` → 200, service dipanggil dengan `{ onlyMismatch: true }`.
    - `GET /adjustment-requests?limit=999` → service dipanggil dengan `{ status:'pending', limit:200, offset:0 }`.
    - `POST /adjustment-requests/41/approve` → service dipanggil dengan `(41, {id, name}, undefined)` → 200. Mock reject 409 → 409 dengan pesan yang sama.
    - `POST /adjustment-requests/abc/reject` → 400 `Pengajuan tidak valid`.
- [ ] **Step 2: Jalankan, pastikan gagal** — `VPS_JEST tests/unit/DrugAuditRoutes.test.js` → FAIL.
- [ ] **Step 3: Implementasi** entri katalog, set non-delegable, policy registri, router, dan mount di `server.js`.
- [ ] **Step 4: Jalankan, pastikan lulus** — `VPS_JEST "tests/unit/(DrugAuditRoutes|AccessControlCatalogRegistry|AccessControlManagement|Task11MonitoringSystemAccess|Task10FinanceTeamAccess)"` → PASS.
- [ ] **Step 5: Commit + push** — `git commit -m "Add doctor-only drug audit API with non-delegable permissions"`.

---

### Task 7: Halaman Audit Obat (tab Persetujuan + Rekonsiliasi)

**Files:**
- Modify: `staff/public/index-adminlte.html`:
  - Tambah `<li>` setelah `#nav-staff-payroll` di dalam `#nav-private`.
  - Tambah container setelah `#content-staff-payroll`.
  - Tambah `'content-drug-audit'` ke array di `_scHideAllStaffPages`.
- Modify: `staff/public/scripts/shell/page-descriptors.js` (tuple `['drug-audit', 'content-drug-audit', 'nav-drug-audit', 'Audit Obat']`)
- Modify: `staff/public/scripts/shell/feature-loader.js` (`drugAudit` → `import(\`../pages/drug-audit-page.js?v=${version}\`)`, pola sama dengan `financeAnalysis`)
- Modify: `staff/public/scripts/main.js`:
  - `pages.drugAudit = grab('content-drug-audit')`
  - fungsi `showDrugAuditPage()`
  - entri peta pemulihan nav `'nav-drug-audit': () => showDrugAuditPage()`
  - `window.showDrugAuditPage = showDrugAuditPage`
- Modify: `staff/backend/config/accessControlRegistry.js` (`STAFF_NAVIGATION_MAP['nav-drug-audit'] = 'drug_audit.view'`)
- Modify: `staff/backend/config/menu-activity-sources.js` (`'nav-drug-audit': [{ table: 'stock_adjustment_requests' }]`)
- Create: `staff/public/fragments/pages/content-drug-audit.html`
- Create: `staff/public/scripts/pages/drug-audit-page.js`
- Test: `staff/backend/tests/unit/DrugAuditPageShell.test.js`, `staff/backend/tests/browser/drug-audit-mobile-smoke.cjs`

**Interfaces:**
- Consumes: kontrak HTTP dari Task 6.
- Produces (fungsi global di `drug-audit-page.js`):
  - `initDrugAuditPage()`
  - `loadDrugAuditRequests(status)`
  - `approveDrugAuditRequest(id)`
  - `openDrugAuditReject(id)`
  - `submitDrugAuditReject()`
  - `toggleDrugAuditSelection(id, checked)`
  - `approveSelectedDrugAuditRequests()`
  - `loadDrugAuditReconciliation()`

Markup menu (persis):

```html
<li class="nav-item doctor-role-only d-none" id="nav-drug-audit">
    <a href="#" class="nav-link" data-staff-call="showDrugAuditPage">
        <i class="far fa-circle nav-icon"></i>
        <p>Audit Obat</p>
    </a>
</li>
```

Container: `<div id="content-drug-audit" class="d-none" data-page-fragment="/staff/public/fragments/pages/content-drug-audit.html"></div>`.

`showDrugAuditPage()` meniru `showFinanceAnalysisPage`:
1. `reserveStaffNavigation`
2. `ensureRegisteredPage('drug-audit')`
3. `ensureStaffFeature('drugAudit')`
4. `hideAllPages(navGen)`
5. `pages.drugAudit` ditampilkan
6. `setTitleAndActive('Audit Obat', 'nav-drug-audit', 'drug-audit')`
7. Buka treeview `#nav-private` (`menu-open` + link aktif), seperti di `showStaffPayrollPage`
8. `window.initDrugAuditPage?.()`

Aturan tampilan (fragment + modul):
- **Dua tab Bootstrap:** `Persetujuan` (`#drug-audit-tab-approvals`, default) dan `Rekonsiliasi` (`#drug-audit-tab-reconciliation`, dimuat saat tab pertama kali dibuka).
- **Kartu pengajuan**, isinya:
  - nama dan kode obat
  - selisih bertanda beserta satuan (`+4 pcs` / `-3 pcs`)
  - nilai `Rp` dari `value` (format `toLocaleString('id-ID')`, tanda minus dipertahankan)
  - label kategori: `rusak` Rusak, `pecah` Pecah, `kedaluwarsa` Kedaluwarsa, `hilang` Hilang, `salah_hitung` Salah hitung, `opname` Opname, `lainnya` Lainnya
  - catatan, pengaju, dan tanggal (komponen lokal `DD/MM/YYYY HH:mm`)
  - `Stok saat diajukan: X · sekarang: Y`
  - badge `Menunggu > 7 hari` jika `is_stale`
  - tombol `Setuju` / `Tolak` hanya untuk status `pending`
- **Filter status:** `<select id="drug-audit-status">` (Menunggu / Disetujui / Ditolak / Semua).
- **Setuju:** `confirm()` dengan teks `Setujui penyesuaian <nama> <selisih> <satuan> (Rp <nilai>)?`, lalu POST approve dan muat ulang daftar.
- **Tolak:** modal `#drug-audit-reject-modal` dengan `<textarea id="drug-audit-reject-note" maxlength="1000">`. Catatan kosong ditolak di klien dengan pesan `Catatan penolakan wajib diisi`.
- **Pilih beberapa:** checkbox per kartu `pending`. Bar `#drug-audit-bulk-bar` menampilkan `<n> dipilih · total Rp <jumlah value>` dan tombol `Setujui terpilih`, yang menyetujui satu per satu secara berurutan dan berhenti di error pertama sambil menampilkan pesannya. **Tidak ada** tombol "setujui semua".
- **Rekonsiliasi:**
  - Banner `#drug-audit-baseline-banner` dengan teks persis: `Belum ada baseline. Halaman ini hanya membandingkan stok sistem dengan total batch. Baseline dibuat setelah hitung penuh pertama.`
  - Ringkasan `Cocok <n> · Selisih batch <n>`.
  - Checkbox `#drug-audit-only-mismatch` (`Hanya yang selisih`).
  - Tabel `.drug-audit-table`: Obat, Stok sistem, Total batch, Status (`Cocok` / `Selisih batch` / `Selisih mutasi`).
- **HP:** di `@media (max-width: 767px)`, `.drug-audit-table tr` menjadi blok kartu dan `td::before { content: attr(data-label) }`. Tanpa `vh`, dan tidak boleh ada scroll horizontal pada lebar 375px.
- **Fetch:** header `Authorization: Bearer ${getAuthToken()}`. Respons 403 → kontainer menampilkan `Halaman ini hanya untuk dokter.`
- **Keamanan HTML:** semua teks dari server di-escape dengan fungsi `escapeHtml` lokal sebelum masuk `innerHTML`.

- [ ] **Step 1: Tulis tes yang gagal** — `DrugAuditPageShell.test.js` (baca file sebagai string, pola `KelolaObatNewItemAction.test.js`):
  - `nav item lives inside the doctor-only Private group`: potongan HTML dari `id="nav-private"` sampai `<!-- MONITORING -->` memuat `id="nav-drug-audit"` dengan `doctor-role-only` dan `data-staff-call="showDrugAuditPage"`.
  - `container, descriptor, loader and navigation are wired`: HTML cocok dengan `/id="content-drug-audit"[^>]+data-page-fragment="\/staff\/public\/fragments\/pages\/content-drug-audit\.html"/`. `_scHideAllStaffPages` memuat `'content-drug-audit'`. `page-descriptors.js` memuat tuple tersebut. `feature-loader.js` memuat `drugAudit` dan `../pages/drug-audit-page.js?v=`. `main.js` memuat `'nav-drug-audit'`, `grab('content-drug-audit')`, dan `window.showDrugAuditPage = showDrugAuditPage`.
  - `every onclick handler is exported`: kumpulkan nama dari `/window\.([A-Za-z]+)\(/g` di dalam atribut `onclick="..."` pada fragment dan template string modul; setiap nama harus muncul sebagai `window.<nama> =` di modul.
  - `module follows token, date and layout rules`: modul memuat `getAuthToken()`, tidak memuat `localStorage.getItem(`, `toISOString`, `Setujui semua`, atau `approve-all`. Blok `<style>` di fragment tidak cocok `/\d+vh\b/`.
  - `menu source and navigation permission exist`: `MENU_ACTIVITY_SOURCES['nav-drug-audit']` terdefinisi, dan `STAFF_NAVIGATION_MAP['nav-drug-audit'] === 'drug_audit.view'`.
- [ ] **Step 2: Jalankan, pastikan gagal** — `VPS_JEST tests/unit/DrugAuditPageShell.test.js` → FAIL.
- [ ] **Step 3: Implementasi** semua file di daftar Files sesuai aturan di atas.
- [ ] **Step 4: Jalankan, pastikan lulus** — `VPS_JEST "tests/unit/(DrugAuditPageShell|StaffMenuBadges|AccessControlCatalogRegistry|StaffPanelWave1Hardening|StaffPanelWave2LazyShell|FrontendModularization)"` → PASS.
- [ ] **Step 5: Tulis smoke browser** — `tests/browser/drug-audit-mobile-smoke.cjs`, dengan pola yang sama seperti `booking-settings-mobile-smoke.cjs`:
  - Express menyajikan fragment dan modul. Stub `GET /api/drug-audit/adjustment-requests` mengembalikan 2 pengajuan pending (salah satunya `is_stale: true`). Stub `GET /api/drug-audit/reconciliation` mengembalikan 1 baris `batch_mismatch`. `POST approve` mengembalikan sukses.
  - Viewport 375×812.
  - Assert:
    - 2 kartu terlihat
    - badge `Menunggu > 7 hari` ada
    - `document.documentElement.scrollWidth <= 375`
    - mencentang 2 kartu menampilkan teks `2 dipilih`
    - klik `Tolak` membuka modal
    - tab Rekonsiliasi menampilkan banner dan `Selisih batch`
  - Cetak `drug-audit mobile smoke OK`.
- [ ] **Step 6: Jalankan smoke di VPS** — dari salinan tes:

```bash
ssh dokterdibya 'cd /tmp/drug-audit-test/staff/backend && PUPPETEER_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome node tests/browser/drug-audit-mobile-smoke.cjs'
```

  Hasil yang diharapkan: `drug-audit mobile smoke OK`.
- [ ] **Step 7: Commit + push** — `git commit -m "Add doctor-only Audit Obat page with approvals and reconciliation tabs"`.

---

### Task 8: Kelola Obat — stok baca-saja + Ajukan Penyesuaian

**Files:**
- Modify: `staff/public/fragments/pages/kelola-obat-page.html`:
  - Bungkus input stok dengan `<div class="col-md-1 d-none" id="kelola-obat-stock-group">`, ganti label menjadi `Stok (baca-saja)`, dan beri input `readonly`.
  - Tambah modal `#kelola-obat-adjustment-modal`.
- Modify: `staff/public/scripts/kelola-obat.js`:
  - Hapus `stock` dari body POST dan PUT.
  - `editObat` menampilkan grup stok; `resetForm` menyembunyikannya.
  - Tambah tombol per baris obat aktif.
  - `import { openAdjustmentRequestModal, submitAdjustmentRequest } from './kelola-obat-adjustment.js';`
- Create: `staff/public/scripts/kelola-obat-adjustment.js`
- Test: `staff/backend/tests/unit/KelolaObatAdjustmentRequest.test.js`

**Interfaces:**
- Consumes: `POST /api/inventory/adjust` (Task 4) dan `GET /api/inventory/batches/:obatId` (sudah ada).
- Produces: `openAdjustmentRequestModal(obatId, obatName)` dan `submitAdjustmentRequest()`. Keduanya diekspor sebagai named export **dan** dipasang ke `window`.

Isi modal (id persis):

| Id | Elemen | Isi / aturan |
|---|---|---|
| `adj-obat-id` | hidden | id obat |
| `adj-obat-name` | teks | nama obat |
| `adj-direction` | select | `minus` "Kurangi stok" (default), `plus` "Tambah stok" |
| `adj-quantity` | `number` | `min="1" step="1"` |
| `adj-category` | select | `rusak` Rusak, `pecah` Pecah, `kedaluwarsa` Kedaluwarsa, `hilang` Hilang, `salah_hitung` Salah hitung / salah input, `lainnya` Lainnya. **Tanpa** `opname`. |
| `adj-batch` | select | Opsi kosong `FIFO otomatis` + batch dari `GET /api/inventory/batches/:obatId` (`batch_number · exp DD/MM/YYYY · sisa N`). Dinonaktifkan saat arah `plus`. Jika fetch gagal, tetap hanya berisi opsi kosong dan menampilkan `Daftar batch tidak bisa dimuat`. |
| `adj-note` | textarea | `maxlength="1000"` |
| — | teks info | `Stok tidak langsung berubah. Pengajuan menunggu persetujuan dokter.` |
| — | tombol kirim | `onclick="window.submitAdjustmentRequest()"` |

Aturan kirim:
- Validasi klien, pesan muncul lewat `showWarning`:
  - jumlah bukan bilangan bulat ≥ 1 → `Jumlah harus bilangan bulat minimal 1`
  - catatan kosong → `Catatan alasan wajib diisi`
  - kategori `kedaluwarsa` tanpa batch, atau arah `plus` → `Pilih batch dan arah Kurangi untuk obat kedaluwarsa`
- Body: `{ obat_id, quantity_delta: arah === 'minus' ? -qty : qty, reason_category, reason_note, batch_id: batch || null }`, dikirim ke `fetch('/api/inventory/adjust', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:\`Bearer ${await getIdToken()}\` } })`.
- Sukses → `showSuccess(message dari server)` lalu modal ditutup. Gagal → `showError(message dari server)`.

Tombol baris, hanya bila `hasAccountPermission('inventory.adjust')`, diletakkan sebelum `editButtons`:

```html
<button class="btn btn-xs btn-outline-secondary mr-1" onclick="window.openAdjustmentRequestModal('${item.id}', '${(item.name || '').replace(/'/g, "\\'")}')" title="Ajukan Penyesuaian"><i class="fas fa-balance-scale"></i></button>
```

- [ ] **Step 1: Tulis tes yang gagal** — `KelolaObatAdjustmentRequest.test.js`:
  - `save payloads no longer carry stock`: `kelola-obat.js` tidak cocok `/JSON\.stringify\(\{[^}]*\bstock\b[^}]*\}\)/`.
  - `stock is read-only and only shown while editing`: fragment memuat `id="kelola-obat-stock-group"` dengan `d-none`, `Stok (baca-saja)`, dan input `kelola-obat-stock` ber-`readonly`. Isi fungsi `editObat` memuat `getElementById('kelola-obat-stock-group')` dan `classList.remove('d-none')`. Isi `resetForm` memuat `classList.add('d-none')` untuk grup itu.
  - `adjustment action is permission gated`: `kelola-obat.js` cocok `/hasAccountPermission\('inventory\.adjust'\)[\s\S]{0,400}window\.openAdjustmentRequestModal\(/`.
  - `adjustment modal matches the request contract`: fragment memuat keenam `value` kategori, tidak memuat `value="opname"`, dan memuat teks info persis. Modul memuat `'/api/inventory/adjust'`, `quantity_delta`, `reason_category`, `reason_note`, `batch_id`, `window.openAdjustmentRequestModal =`, dan `window.submitAdjustmentRequest =`.
  - Tes `KelolaObatNewItemAction.test.js` yang sudah ada tetap lulus.
- [ ] **Step 2: Jalankan, pastikan gagal** — `VPS_JEST tests/unit/KelolaObatAdjustmentRequest.test.js` → FAIL.
- [ ] **Step 3: Implementasi** sesuai Files, Interfaces, dan aturan di atas.
- [ ] **Step 4: Jalankan, pastikan lulus** — `VPS_JEST "tests/unit/(KelolaObat|OrderObatFrontend|StaffPanelWave2LazyShell)"` → PASS.
- [ ] **Step 5: Commit + push** — `git commit -m "Make Kelola Obat stock read-only and add Ajukan Penyesuaian requests"`.

---

### Task 9: Naikkan versi aset, verifikasi DB terisolasi, jalankan seluruh tes

**Files:**
- Modify: `staff/public/index-adminlte.html`, `staff/public/sw.js` (semua `v493` → `v494`. Jika `v494` sudah ada di `/var/www/dokterdibya-staff-releases` atau di `origin/main`, pakai nomor berikutnya yang belum terpakai.)
- Create: `staff/backend/scripts/verify-stock-ledger-isolated.js`

**Interfaces:**
- Consumes: `StockLedgerService`, `StockAdjustmentRequestService`, `DrugAuditReconciliationService`, dan migrasi Task 3.

- [ ] **Step 1: Cek versi yang belum terpakai**:

```bash
ssh dokterdibya 'ls /var/www/dokterdibya-staff-releases | tail -3'
git fetch origin main && git show origin/main:staff/public/sw.js | grep STAFF_PWA_VERSION
```

  Hasil yang diharapkan: nomor tertinggi yang terlihat < v494 (atau pakai nomor berikutnya yang bebas).
- [ ] **Step 2: Ganti versi** — `grep -c "v493" staff/public/index-adminlte.html staff/public/sw.js` (catat jumlahnya), ganti semua kemunculannya, lalu `grep -c "v494"` harus menghasilkan jumlah yang sama.
- [ ] **Step 3: Tulis skrip verifikasi terisolasi** — `verify-stock-ledger-isolated.js`, mengikuti pola `verify-clinic-returns-isolated.js`.
  - Nama DB `stock_ledger_qa_<Date.now()>`, divalidasi dengan regex `^stock_ledger_qa_\d+$`.
  - `CREATE TABLE ... LIKE dibyaklinik.*` untuk `obat`, `obat_batches`, `stock_movements`, lalu jalankan file migrasi Task 3.
  - Pool di-inject lewat `require.cache` untuk `./db`.
  - Skenario:
    1. Cetak `Type` dari `SHOW COLUMNS FROM stock_movements LIKE 'movement_type'`.
    2. Insert obat id 1 dengan stok 10 dan `default_cost_price` 1000, plus batch 2@1000 dan 5@1100 (sisa 3 unit legacy).
    3. Buat pengajuan −6 `rusak`, lalu setujui **dua kali bersamaan** (`Promise.allSettled`). Assert tepat satu fulfilled dan satu rejected dengan `statusCode 409`.
    4. Assert stok 4, sisa batch `[0, 1]`.
    5. Buat pengajuan +2, lalu jalankan `deductStockFIFO(1, 1, 'qa', 1, 'QA')` dan approve secara bersamaan (`Promise.all`). Assert stok akhir 5, dan `10 + SUM(stock_movements.quantity) === stok akhir`.
    6. Assert `getReconciliation()` untuk obat 1 berstatus `batch_mismatch`.
  - Selalu `DROP DATABASE` di `finally`. Cetak `stock ledger isolated verification OK`.
- [ ] **Step 4: Jalankan skrip di VPS** — **butuh izin eksplisit pengguna**, karena membuat lalu menghapus database QA di server MySQL produksi:

```bash
tar -czf - --exclude=node_modules staff | ssh dokterdibya 'set -e; rm -rf /tmp/drug-audit-test; mkdir -p /tmp/drug-audit-test; tar -xzf - -C /tmp/drug-audit-test; ln -s /var/www/dokterdibya/staff/backend/node_modules /tmp/drug-audit-test/staff/backend/node_modules; cd /tmp/drug-audit-test/staff/backend; node scripts/verify-stock-ledger-isolated.js'
```

  Hasil yang diharapkan: tipe `movement_type` tercetak, lalu `stock ledger isolated verification OK`. Catat tipe kolom tersebut di laporan untuk rencana tahap 2.
- [ ] **Step 5: Jalankan seluruh tes unit** — `VPS_JEST tests/unit` → semua PASS. Kegagalan yang sudah ada sebelum perubahan ini dicek dengan menjalankan tes yang sama di `origin/main` dan dilaporkan terpisah, bukan diperbaiki diam-diam.
- [ ] **Step 6: Commit + push** — `git commit -m "Bump staff assets to v494 and add isolated stock ledger verification"`.

---

## Deploy (bukan task kode — butuh persetujuan pengguna)

Ikuti `deployment/STAFF_ASSET_RELEASES.md` dan catatan rilis sebelumnya:

1. Beri tahu staf bahwa stok tidak bisa lagi diedit langsung. Penyesuaian kini lewat tombol Ajukan Penyesuaian dan menunggu persetujuan dokter.
2. Backup: `mysqldump dibyaklinik obat obat_batches stock_movements > /root/backups/pre-drug-audit-tahap1-<tanggal>.sql`.
3. Jalankan migrasi `20261106_stock_adjustment_requests.sql`, lalu cek dengan `DESCRIBE stock_adjustment_requests`.
4. Stage snapshot aset `v494` dari worktree terpisah **sebelum** pull, lalu jalankan verifier rilis.
5. Kirim commit lewat git bundle, `git merge --ff-only`, lalu `pm2 reload ecosystem.config.js --only dibyaklinik-backend --update-env` (dari `staff/backend`).
6. Verifikasi produksi:
   - `/api/health` → 200
   - Audit Obat terbuka sebagai dokter; `GET /api/drug-audit/reconciliation` sebagai staf → 403
   - Ubah stok di Kelola Obat (form lama) → pesan 409
   - Kirim satu pengajuan uji lalu **tolak** (stok tidak berubah)
