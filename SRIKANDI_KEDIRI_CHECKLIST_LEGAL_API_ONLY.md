# SRIKANDI KEDIRI — Checklist Legal & Keamanan (API-Only)

Checklist ini untuk memastikan platform data Kesehatan Ibu & Anak (KIA) **SRIKANDI KEDIRI** berjalan legal, aman, dan siap audit.

> Catatan: dokumen ini adalah panduan implementasi. Keputusan final tetap memerlukan review hukum resmi oleh tim legal, Dinkes, dan pihak fasilitas kesehatan.

## Informasi Dasar

- Nama Program: **SRIKANDI KEDIRI**
- Ruang Lingkup: Data KIA (Ibu hamil, nifas, bayi, balita)
- Wilayah: Kediri
- Arsitektur: **API-only** (database tidak diekspos langsung)
- Tanggal Checklist: __________
- PIC Teknis: __________
- PIC Legal/Compliance: __________

## Kepemilikan & Peran Resmi

- Pemilik data dan sistem: **Pemerintah Kota Kediri** (melalui unit yang ditetapkan, mis. Dinkes/Kominfo).
- Developer utama: **____________________** (nama Anda/perusahaan Anda).
- Posisi hukum developer: pelaksana teknis/pengolah data berdasarkan kontrak, **bukan pemilik data**.
- Hak akses developer ke data produksi dibatasi dan diaudit sesuai prinsip least privilege.
- Seluruh penggunaan data oleh developer wajib berbasis instruksi tertulis dari pemilik data.

### Checklist Kepemilikan & Kontrak

- [ ] Klausul kontrak menyebut tegas kepemilikan data berada pada Pemerintah Kota Kediri.
- [ ] Klausul lisensi/source code jelas (hak pakai pemerintah, hak pengembangan lanjutan, escrow bila perlu).
- [ ] Klausul kerahasiaan (NDA) mencakup seluruh tim developer dan subkontraktor.
- [ ] Klausul larangan penggunaan ulang data untuk tujuan lain tanpa izin tertulis.
- [ ] Klausul serah-terima saat terminasi (data, dokumentasi, kredensial, runbook, source code).
- [ ] Klausul audit hak akses developer di lingkungan produksi.
- [ ] Klausul tanggung jawab insiden keamanan dan SLA penanganan insiden.
- [ ] Penunjukan pejabat penanggung jawab data dari pihak Pemkot terdokumentasi.

## Status Checklist

Gunakan tanda:
- `[ ]` Belum
- `[~]` Proses
- `[x]` Selesai

---

## A. Legal & Tata Kelola Data

- [ ] Dasar hukum pemrosesan data KIA didokumentasikan per use case.
- [ ] Peran para pihak jelas: controller/processor/joint-controller.
- [ ] Perjanjian berbagi data antar fasyankes (DSA) ditandatangani.
- [ ] DPA (Data Processing Agreement) dengan vendor/cloud ditandatangani.
- [ ] Kebijakan privasi dan pemberitahuan pasien diperbarui untuk SRIKANDI KEDIRI.
- [ ] Mekanisme hak subjek data (akses, koreksi, pembatasan, dsb.) tersedia.
- [ ] Aturan retensi dan penghapusan data disahkan secara internal.
- [ ] DPIA/PIA selesai dan disetujui PIC legal/compliance.
- [ ] SOP notifikasi insiden kebocoran data tersedia dan diuji.
- [ ] Register aktivitas pemrosesan data (RoPA) aktif dan rutin diperbarui.

## B. Batasan Data (Data Minimization)

- [ ] Hanya elemen data KIA yang diperlukan yang diambil dari sumber.
- [ ] API klinis individual dan API analitik agregat dipisahkan.
- [ ] Field sensitif tinggi (mis. NIK lengkap) dibatasi ketat per role.
- [ ] Pseudonimisasi/tokenisasi patient ID lintas institusi diterapkan.
- [ ] Data untuk dashboard kebijakan menggunakan agregasi/anonymized output.

## C. Arsitektur API-Only (Tanpa Akses DB Langsung)

- [ ] Database berada di private subnet (tanpa public IP).
- [ ] Port database tidak terbuka ke internet.
- [ ] Akses DB hanya dari service API (allowlist host/service account).
- [ ] Tidak ada user DB umum yang dipakai lintas aplikasi.
- [ ] Secrets DB disimpan di secret manager (bukan hardcoded).
- [ ] Rotasi kredensial DB terjadwal dan terdokumentasi.

## D. Kontrol Akses & Autentikasi

- [ ] Semua API menggunakan OAuth2/OIDC (atau standar setara enterprise).
- [ ] mTLS diterapkan untuk komunikasi antar sistem (machine-to-machine).
- [ ] RBAC/ABAC diterapkan per role dan fasilitas.
- [ ] Scope API dibatasi per fungsi (least privilege).
- [ ] MFA diwajibkan untuk akses admin dan operasi sensitif.
- [ ] Session/token expiry dan refresh policy ditetapkan.

## E. Keamanan Data

- [ ] TLS 1.2+ aktif untuk seluruh trafik eksternal/internal relevan.
- [ ] Enkripsi at-rest aktif pada DB, backup, dan object storage.
- [ ] Key management terpisah (KMS/HSM), akses key dibatasi.
- [ ] Data sensitif di log dimasking (NIK, nomor telepon, alamat, dsb.).
- [ ] Backup terenkripsi, diuji restore, dan punya RPO/RTO.

## F. Logging, Audit, dan Forensik

- [ ] Audit trail immutable mencatat: siapa, kapan, aksi apa, data apa, tujuan.
- [ ] Log akses API terpusat (SIEM/log server) dengan retensi memadai.
- [ ] Alert otomatis untuk anomali akses (volume, lokasi, jam tidak wajar).
- [ ] Prosedur investigasi insiden tersedia (forensik dasar).
- [ ] Bukti audit dapat ditarik per periode/pengguna/fasilitas.

## G. Integrasi Fasilitas Kesehatan

- [ ] Daftar sistem sumber RS/puskesmas/bidan terinventarisasi.
- [ ] Mapping data lintas sistem ke model KIA standar terdokumentasi.
- [ ] Validasi kualitas data (kelengkapan, duplikasi, konsistensi) berjalan.
- [ ] Mekanisme deduplikasi pasien (MPI) diuji pada data nyata Kediri.
- [ ] SOP koreksi data antar fasilitas tersedia.

## H. Operasional & Keberlanjutan

- [ ] SOP perubahan skema API (versioning, deprecation, rollback) tersedia.
- [ ] Uji keamanan berkala (vuln scan + pentest) dijadwalkan.
- [ ] Uji DR/BCP (disaster recovery/business continuity) dilakukan.
- [ ] SLA/OLA antar tim (IT, Dinkes, vendor) ditetapkan.
- [ ] Pelatihan petugas akses data dilakukan dan didokumentasikan.

## I. Checklist Go-Live Final

- [ ] Semua item kritis A–F berstatus `[x]`.
- [ ] Legal sign-off tertulis diterbitkan.
- [ ] Security sign-off tertulis diterbitkan.
- [ ] UAT lintas fasilitas pilot Kediri dinyatakan lulus.
- [ ] Runbook insiden + kontak darurat 24/7 tersedia.
- [ ] Persetujuan go-live ditandatangani pemangku kepentingan.

---

## Lampiran Bukti (Wajib untuk Audit)

Isi lokasi dokumen bukti:

- DSA/DPA: ____________________
- DPIA/PIA: ____________________
- Arsitektur jaringan/API: ____________________
- Bukti enkripsi & key management: ____________________
- Hasil uji keamanan: ____________________
- SOP insiden dan notifikasi: ____________________
- Log audit sampel: ____________________
- Referensi parameter kontrak default: `SRIKANDI_KEDIRI_TEMPLATE_PASAL_KONTRAK.md` bagian **Isian Cepat (Recommended Defaults)**

## Persetujuan

- PIC Teknis: ____________________  Tanggal: __________
- PIC Legal/Compliance: ____________________  Tanggal: __________
- Perwakilan Dinkes/Fasyankes: ____________________  Tanggal: __________
