# SRIKANDI KEDIRI — Lampiran C
## Daftar Data KIA Minimum (Data Minimization)

Dokumen ini menetapkan elemen data minimum yang boleh diproses dalam platform KIA **SRIKANDI KEDIRI**.

Prinsip utama:
- Hanya data yang diperlukan untuk layanan KIA, monitoring risiko, dan rujukan.
- Tidak mengumpulkan data di luar tujuan layanan.
- API analitik hanya mengembalikan agregasi/anonymized bila tidak memerlukan identitas individu.

## 1. Kategori Dataset

- **Dataset Klinis Individual (terbatas):** untuk layanan klinis dan rujukan pasien.
- **Dataset Operasional Rujukan:** untuk koordinasi rujukan antar fasilitas.
- **Dataset Analitik Agregat:** untuk monitoring program KIA tingkat wilayah/fasilitas.

## 2. Elemen Data Wajib (Minimum)

### 2.1 Identitas Dasar Pasien (Ibu)

| Elemen | Tipe | Wajib | Catatan Minimization |
|---|---|---|---|
| patient_token_id | string | Ya | ID pseudonim lintas sistem (bukan NIK langsung) |
| nama_lengkap | string | Ya | Untuk verifikasi layanan klinis |
| tanggal_lahir | date | Ya | Untuk perhitungan usia risiko |
| nomor_hp | string | Opsional | Untuk komunikasi rujukan/follow-up bila tersedia |
| alamat_kecamatan | string | Ya | Gunakan level kecamatan (bukan alamat detail jika tidak perlu) |
| fasyankes_asal | string | Ya | Sumber layanan |

### 2.2 Data Kehamilan Inti

| Elemen | Tipe | Wajib | Catatan Minimization |
|---|---|---|---|
| status_kehamilan | enum | Ya | hamil / nifas / selesai |
| usia_kehamilan_minggu | integer | Ya | Monitoring risiko |
| gravidity_parity_abortus | string | Ya | Ringkasan obstetri |
| hpht | date | Opsional | Jika diperlukan untuk hitung UK/HPL |
| hpl | date | Opsional | Estimasi persalinan |
| faktor_risiko_kehamilan | array/enum | Ya | Daftar risiko utama (preeklamsia, anemia, dll.) |

### 2.3 Kunjungan ANC & Klinis Ringkas

| Elemen | Tipe | Wajib | Catatan Minimization |
|---|---|---|---|
| tanggal_kunjungan | datetime | Ya | Tracking kesinambungan layanan |
| jenis_kunjungan | enum | Ya | ANC rutin / emergency / kontrol |
| tekanan_darah_sistolik | integer | Ya | Risiko maternal |
| tekanan_darah_diastolik | integer | Ya | Risiko maternal |
| hemoglobin | decimal | Opsional | Jika pemeriksaan tersedia |
| keluhan_utama_ringkas | string | Opsional | Batasi ringkas, hindari narasi panjang tidak perlu |
| diagnosis_ringkas | string/enum | Ya | Kode/diagnosis utama |
| rencana_tindak_lanjut | string | Ya | Observasi, kontrol, rujukan |

### 2.4 Data Rujukan

| Elemen | Tipe | Wajib | Catatan Minimization |
|---|---|---|---|
| status_rujukan | enum | Ya | tidak dirujuk / dirujuk / diterima / selesai |
| tanggal_rujukan | datetime | Opsional | Wajib jika dirujuk |
| fasyankes_tujuan | string | Opsional | Wajib jika dirujuk |
| alasan_rujukan | enum/string | Opsional | Risiko maternal/fetal, kegawatdaruratan |
| waktu_respons_rujukan | integer | Opsional | Menit/jam untuk KPI |
| hasil_rujukan_ringkas | string | Opsional | Outcome singkat |

### 2.5 Data Bayi Baru Lahir (Jika Sudah Persalinan)

| Elemen | Tipe | Wajib | Catatan Minimization |
|---|---|---|---|
| bayi_token_id | string | Ya | ID pseudonim bayi |
| tanggal_lahir_bayi | date | Ya | Cohort bayi |
| berat_lahir_gram | integer | Ya | Risiko neonatal |
| panjang_lahir_cm | decimal | Opsional | Jika tersedia |
| apgar_1_5 | string | Opsional | Skor ringkas |
| komplikasi_neonatal_ringkas | string/enum | Opsional | Jika ada |

### 2.6 Data Balita (Monitoring Dasar)

| Elemen | Tipe | Wajib | Catatan Minimization |
|---|---|---|---|
| umur_bulan | integer | Ya | Analitik pertumbuhan |
| berat_badan_kg | decimal | Ya | Monitoring status gizi |
| tinggi_badan_cm | decimal | Ya | Monitoring status gizi |
| status_imunisasi_dasar | enum | Ya | lengkap / belum lengkap |
| flag_risiko_stunting | boolean | Ya | Flag dini program |

## 3. Elemen Data Terbatas (Akses Khusus)

Elemen berikut hanya boleh diakses peran tertentu dan kebutuhan sah:
- NIK lengkap
- Alamat lengkap detail rumah
- Nomor identitas lain
- Catatan klinis bebas panjang/full narrative
- Dokumen lampiran mentah yang tidak diperlukan untuk alur API

Kontrol wajib:
- Role-based access
- Logging akses detail
- Masking pada output non-klinis

## 4. Elemen Data yang Tidak Dikumpulkan (Default)

Secara default tidak dikumpulkan kecuali ada dasar hukum/operasional yang kuat:
- Data biometrik
- Data finansial non-klinis
- Data keluarga yang tidak relevan dengan KIA
- Data perilaku pribadi yang tidak terkait risiko klinis

## 5. Aturan API Output (Data Minimization by Design)

- Endpoint klinis menampilkan data individual seperlunya untuk tindakan layanan.
- Endpoint dashboard kebijakan menampilkan agregasi per kecamatan/fasilitas/periode.
- Endpoint publik (jika ada) dilarang mengembalikan data identitas individu.
- Semua response harus menerapkan field-level filtering sesuai role.

## 6. Retensi & Penghapusan (Acuan Operasional)

- Data operasional: mengikuti ketentuan retensi yang disahkan PIHAK PERTAMA.
- Log audit: minimal 2 tahun atau sesuai kebijakan lebih ketat.
- Data salinan kerja sementara developer: dilarang kecuali disetujui; wajib dihapus setelah pekerjaan selesai.

## 7. Kualitas Data Minimum

- Kelengkapan field wajib: ≥ 95%
- Duplikasi patient token: < 1%
- Ketepatan waktu sinkronisasi data: sesuai SLA integrasi
- Validasi format wajib untuk setiap payload API

## 8. Persetujuan Perubahan Skema Data

Setiap penambahan elemen data baru wajib melalui:
1. Justifikasi kebutuhan layanan KIA
2. Review legal/compliance
3. Persetujuan tertulis PIHAK PERTAMA
4. Update dokumentasi API + changelog

---

## Tanda Persetujuan Lampiran C

PIHAK PERTAMA,                               PIHAK KEDUA,

Nama: ____________________                   Nama: ____________________
Jabatan: ____________________                Jabatan: ____________________
Tanggal: ____________________                Tanggal: ____________________
