# Urutan Penghapusan Data Pasien

## Gambaran Umum
Dokumen ini menjelaskan urutan yang HARUS diikuti saat menghapus data pasien dari database untuk menghindari error foreign key constraint.

## Prinsip Dasar
**Hapus data CHILD terlebih dahulu, baru kemudian data PARENT.**

## Struktur Relasi Database

```
patients (PARENT/ROOT)
    ├── billings (child dari patients)
    │   ├── billing_items (child dari billings)
    │   └── payment_transactions (child dari billings)
    ├── patient_records (child dari patients)
    ├── medical_records (child dari patients)
    ├── medical_exams (child dari patients)
    ├── visits (child dari patients)
    ├── appointments (child dari patients)
    └── patient_intake_submissions (child dari patients)
```

## Urutan Penghapusan yang Benar

### 1. Billing Items
```sql
DELETE FROM billing_items 
WHERE billing_id IN (
    SELECT id FROM billings WHERE patient_id = ?
);
```
**Alasan:** Child dari `billings`, harus dihapus dulu sebelum `billings`

### 2. Payment Transactions
```sql
DELETE FROM payment_transactions 
WHERE billing_id IN (
    SELECT id FROM billings WHERE patient_id = ?
);
```
**Alasan:** Child dari `billings`, ada foreign key constraint

### 3. Billings
```sql
DELETE FROM billings WHERE patient_id = ?;
```
**Alasan:** Parent dari `billing_items` dan `payment_transactions`, tapi child dari `patients`

### 4. Patient Records
```sql
DELETE FROM patient_records WHERE patient_id = ?;
```
**Alasan:** Ada foreign key constraint ke `patients`

### 5. Medical Records
```sql
DELETE FROM medical_records WHERE patient_id = ?;
```
**Alasan:** Berisi riwayat rekam medis pasien

### 6. Medical Exams
```sql
DELETE FROM medical_exams WHERE patient_id = ?;
```
**Alasan:** Data pemeriksaan medis

### 7. Visits
```sql
DELETE FROM visits WHERE patient_id = ?;
```
**Alasan:** Riwayat kunjungan pasien

### 8. Appointments
```sql
DELETE FROM appointments WHERE patient_id = ?;
```
**Alasan:** Janji temu/appointment pasien

### 9. Patient Intake Submissions
```sql
DELETE FROM patient_intake_submissions WHERE patient_id = ?;
```
**Alasan:** Form intake yang disubmit pasien

### 10. Patients (TERAKHIR!)
```sql
DELETE FROM patients WHERE id = ?;
```
**Alasan:** ROOT/PARENT table, harus dihapus paling akhir setelah semua child dihapus

## Implementasi di Backend

### File: `/var/www/dokterdibya/staff/backend/routes/patients.js`
**Endpoint:** `DELETE /api/patients/:id`

### File: `/var/www/dokterdibya/staff/backend/routes/auth.js`
**Endpoint:** `DELETE /api/admin/web-patients/:id`

Kedua endpoint ini sudah mengimplementasikan urutan penghapusan yang benar dengan menggunakan **database transaction** untuk memastikan:
- Semua penghapusan berhasil, atau
- Tidak ada yang dihapus sama sekali (rollback)

## Implementasi di UI

### Halaman Kelola Pasien (Superadmin Only)
**Lokasi:** Menu sidebar → "Kelola Pasien Web"

**Tombol Hapus:**
- ❌ Merah dengan icon trash
- Menampilkan konfirmasi 2 langkah:
  1. Konfirmasi dengan daftar data yang akan dihapus
  2. Ketik "HAPUS" untuk konfirmasi final

**Data yang dihapus:**
```
✗ Data pasien (profil, email, nomor telepon)
✗ Riwayat billing dan invoice
✗ Detail item billing
✗ Transaksi pembayaran
✗ Rekam medis (medical records)
✗ Data pemeriksaan medis
✗ Riwayat kunjungan
✗ Janji temu (appointments)
✗ Form patient intake
```

### Tombol Hapus Dihilangkan Dari:
- ❌ Detail pasien di halaman Data Pasien
- ❌ Detail pasien di patients-v2.js
- ✅ Hanya tersedia di halaman "Kelola Pasien Web"

## Response Setelah Penghapusan

Backend akan mengembalikan detail jumlah data yang dihapus:

```json
{
  "success": true,
  "message": "Pasien [Nama] dan semua data terkait berhasil dihapus",
  "data": {
    "patient": {
      "id": "12345",
      "full_name": "Nama Pasien",
      "email": "email@example.com"
    },
    "deleted_data": {
      "billing_items": 5,
      "payment_transactions": 2,
      "billings": 1,
      "patient_records": 1,
      "medical_records": 3,
      "medical_exams": 2,
      "visits": 4,
      "appointments": 1,
      "patient_intake_submissions": 1
    }
  }
}
```

## Catatan Penting

### ⚠️ Transaction Safety
Semua penghapusan menggunakan **database transaction**:
```javascript
const connection = await db.getConnection();
await connection.beginTransaction();
try {
    // ... semua operasi DELETE ...
    await connection.commit();
} catch (error) {
    await connection.rollback();
    throw error;
}
```

### ⚠️ Logging
Setiap penghapusan dicatat di log:
```javascript
logger.info(`Patient deleted: ${name} (ID: ${id}) by user: ${email}`, deleted_data);
```

### ⚠️ Permission
Hanya user dengan role **superadmin** atau **admin** yang bisa menghapus pasien.

### ⚠️ Tidak Dapat Dibatalkan
Penghapusan bersifat PERMANEN dan tidak dapat di-undo. Pastikan melakukan backup database secara berkala.

## Testing

Untuk menguji urutan penghapusan:

```bash
# 1. Buat pasien test dengan data lengkap
# 2. Buat billing, medical records, appointments, dll untuk pasien tersebut
# 3. Hapus pasien melalui UI Kelola Pasien
# 4. Verifikasi semua data terhapus:

mysql -u root -p'#Bismillah#@2024' dibyaklinik << EOF
-- Cek data tersisa untuk patient_id tertentu
SELECT 'billing_items' as tabel, COUNT(*) as jumlah FROM billing_items WHERE billing_id IN (SELECT id FROM billings WHERE patient_id = 'PATIENT_ID')
UNION ALL
SELECT 'billings', COUNT(*) FROM billings WHERE patient_id = 'PATIENT_ID'
UNION ALL
SELECT 'patient_records', COUNT(*) FROM patient_records WHERE patient_id = 'PATIENT_ID'
UNION ALL
SELECT 'medical_records', COUNT(*) FROM medical_records WHERE patient_id = 'PATIENT_ID'
UNION ALL
SELECT 'patients', COUNT(*) FROM patients WHERE id = 'PATIENT_ID';
EOF
```

Semua hasil harus 0 jika penghapusan berhasil.

## Versi
- **Dibuat:** 13 November 2025
- **Update Terakhir:** 13 November 2025
- **Backend Restart:** #77
