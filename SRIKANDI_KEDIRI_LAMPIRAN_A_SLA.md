# SRIKANDI KEDIRI — Lampiran A
## Service Level Agreement (SLA)

Dokumen ini menjadi lampiran resmi kontrak untuk layanan platform data KIA **SRIKANDI KEDIRI**.

## 1. Ruang Lingkup Layanan

Layanan yang dicakup SLA:
- API operasional SRIKANDI KEDIRI
- Integrasi data lintas fasilitas (sesuai endpoint yang disepakati)
- Monitoring, incident response, dan pemulihan layanan
- Dukungan operasional teknis sesuai jam layanan

Di luar cakupan (kecuali diperjanjikan):
- Gangguan jaringan internal pihak fasilitas kesehatan
- Gangguan infrastruktur pihak ketiga di luar kendali para pihak
- Permintaan perubahan fitur besar (major enhancement)

## 2. Definisi Waktu Layanan

- Jam operasional dukungan standar: `08:00–17:00 WIB`, Senin–Jumat
- Dukungan insiden kritis: `24/7`
- Zona waktu: `WIB`
- Periode pengukuran SLA: `bulanan`

## 3. Target Ketersediaan (Availability)

- Target availability bulanan API: **99,5%**
- Planned maintenance tidak dihitung downtime jika:
  - diumumkan minimal `2 x 24 jam` sebelumnya
  - dilakukan di luar jam puncak layanan

Rumus availability bulanan:

`Availability (%) = ((Total menit dalam bulan - Downtime tidak terencana) / Total menit dalam bulan) x 100`

## 4. Klasifikasi Insiden & Respons

### 4.1 Severity Level

- **Critical (SEV-1)**
  - Dampak: layanan utama tidak dapat digunakan, potensi dampak klinis/rujukan tinggi
  - Respons awal: ≤ **1 jam**
  - Pemulihan awal (workaround/restore): ≤ **4 jam**
  - Update status: setiap **60 menit**

- **High (SEV-2)**
  - Dampak: fungsi penting terganggu, sebagian besar pengguna terdampak
  - Respons awal: ≤ **4 jam**
  - Pemulihan awal: ≤ **12 jam**
  - Update status: setiap **4 jam**

- **Medium (SEV-3)**
  - Dampak: gangguan terbatas, ada alternatif/manual workaround
  - Respons awal: ≤ **1 hari kerja**
  - Target penyelesaian: ≤ **3 hari kerja**

- **Low (SEV-4)**
  - Dampak: minor defect/permintaan non-kritis
  - Respons awal: ≤ **3 hari kerja**
  - Target penyelesaian: dimasukkan sprint/rilis berikutnya

## 5. Keamanan & Notifikasi Insiden

- Notifikasi awal insiden keamanan ke PIHAK PERTAMA: maksimal **1 x 24 jam** sejak diketahui
- Laporan awal minimal memuat:
  - waktu kejadian
  - sistem terdampak
  - klasifikasi dampak
  - mitigasi awal
  - rencana perbaikan

## 6. Manajemen Perubahan (Change Management)

- Perubahan minor/non-breaking: pemberitahuan minimal `2 x 24 jam`
- Perubahan breaking/API versioning:
  - pemberitahuan minimal `14 hari kalender`
  - dokumentasi migrasi wajib tersedia
  - masa transisi endpoint lama minimal `30 hari` (kecuali keadaan darurat keamanan)

## 7. Backup & Pemulihan

- Backup data operasional: harian
- Uji restore: minimal bulanan
- Target RPO: ≤ `24 jam`
- Target RTO: ≤ `8 jam`

## 8. Pelaporan SLA

Laporan bulanan minimal berisi:
- uptime/availability bulanan
- daftar insiden per severity
- MTTA (mean time to acknowledge)
- MTTR (mean time to recover)
- akar masalah (RCA) untuk SEV-1/SEV-2
- daftar tindakan pencegahan berulang

## 9. Tata Kelola Eskalasi

Level eskalasi:
1. Tim support operasional
2. Lead engineer/on-call manager
3. PIC teknis PIHAK PERTAMA + manajemen PIHAK KEDUA

Kontak eskalasi (diisi saat finalisasi kontrak):
- PIC Teknis PIHAK PERTAMA: __________
- PIC Teknis PIHAK KEDUA: __________
- Kontak darurat 24/7: __________

## 10. Pengecualian SLA

SLA tidak berlaku pada kondisi berikut:
- force majeure
- gangguan sistem pihak ketiga di luar kontrol langsung
- kesalahan konfigurasi/perubahan oleh pihak selain PIHAK KEDUA tanpa prosedur change request
- planned maintenance yang telah diumumkan

## 11. Review Berkala

- SLA direview minimal setiap `6 bulan`
- Perubahan SLA harus disetujui tertulis oleh para pihak

---

## Tanda Persetujuan Lampiran A

PIHAK PERTAMA,                               PIHAK KEDUA,

Nama: ____________________                   Nama: ____________________
Jabatan: ____________________                Jabatan: ____________________
Tanggal: ____________________                Tanggal: ____________________
