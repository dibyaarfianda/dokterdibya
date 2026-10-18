# Laboratorium PWA Staff

Menu mobile: **Lainnya → Laboratorium**. Pilih pasien dan DRD yang sudah ada di Klinik Privat, lalu unggah sumber atau isi manual. Modul tidak membuat kunjungan baru dan tidak memindahkan laporan ke pasien lain.

## Alur petugas

1. Pilih pasien/DRD, tanggal pemeriksaan, kemudian foto JPG/PNG/WebP atau PDF. Maksimal 10 sumber, 10 MB per unggahan dan 30 MB total, termasuk sumber tersimpan.
2. Baca dengan OCR bila diperlukan. Pratinjau tidak menyimpan laporan; petugas harus memilih menerapkan hasilnya. Pilihan mengisi baris kosong mempertahankan nilai yang telah diisi. Penggantian seluruh daftar memerlukan konfirmasi.
3. Periksa setiap hasil, satuan, rujukan dan keterangan. Angka seperti `9.370` memerlukan konfirmasi nilai numerik. Rujukan trimester Hb dipilih secara eksplisit; rujukan kosong tetap tidak dicantumkan.
4. Simpan draf. Periksa identitas/tanggal yang berbeda dan centang pemeriksaan setiap parameter sebelum menerbitkan. Publikasi membuat satu dokumen portal dan notifikasi setelah transaksi berhasil.
5. Koreksi laporan terbit menjadi draf revisi. Portal mempertahankan versi terbit terakhir sampai koreksi diterbitkan. Nomor lab tetap sama. Penghapusan menyembunyikan laporan/dokumen dan mempertahankan audit.

PDF Hasil dan Cetak Komparasi terpisah. Komparasi hanya memakai laporan terstruktur terbit milik pasien yang sama dengan tanggal terdahulu. Selisih dihitung hanya jika parameter dan satuannya sama; BUN dan ureum berbeda. Lampiran lama tetap di Penunjang.

## Akses dan konfigurasi

- `lab_exam.view`: daftar, detail, pencarian DRD, komparasi.
- `lab_exam.create`: draf baru dan OCR unggahan sementara.
- `lab_exam.edit`: koreksi draf dan OCR sumber laporan tersimpan.
- `patient_documents.create`: penerbitan.
- `medical_records.delete`: penghapusan.
- `medical_records.export`: PDF hasil dan komparasi.

Izin mengikuti pengaturan hak akun yang sudah ada. Tidak ada pemberian izin otomatis. Pasien tidak dapat memakai `/api/lab-reports`; portal menggunakan jalur dokumen pasien yang memeriksa kepemilikan dan tidak menggunakan cache.

OCR memakai `OPENAI_API_KEY` server yang sudah tersedia dan `LAB_OCR_MODEL` (default `gpt-4o`). Output memakai JSON Schema dan validasi server. Data dokumen diperlakukan sebagai sumber transkripsi. Model tidak memilih pasien atau memberi diagnosis. OCR gagal tetap memungkinkan isi manual. Sumber dan PDF disimpan di R2 privat; tautan sumber staff berlaku lima menit dan tautan portal ditandatangani sesudah pemeriksaan identitas.

## Validasi dan rilis

Migrasi aditif: `staff/backend/migrations/20261018_structured_lab_reports.sql`. Terapkan sebelum backend baru. Tidak ada backfill klinis. Tabel baru: `lab_reports`, `lab_report_revisions`, `lab_report_sequences`; `patient_documents.lab_report_id` unik dan nullable. Sinkronisasi Penunjang lama mengecualikan dokumen terhubung.

Tes unit/API: `LabReportContract`, `LabReportServices`, `LabReportForm`, `LabReportScopeReset`, `labReportsAuth`, serta regresi Penunjang, hak akun, shell dan aset Staff. Harness `tests/integration/labReports.mysql.cjs` hanya menerima nama database baru berawalan `codex_lab_test_` dan direktori output absolut; membuat fixture fiktif, menguji transaksi/publikasi/koreksi/konflik/rollback/R2 gagal/komparasi/audit, lalu menghapus database buatannya sendiri. Opsi `--serve` mempertahankan database sampai server uji dihentikan.

`tests/integration/labReports.ocr.cjs --output=/absolute/test-output --env=/existing/server/.env` menguji provider nyata dengan 18 parameter fiktif pada PNG dan PDF tiga halaman, tanpa akses database. Jangan simpan kredensial atau data pasien ke fixture.

Rilis memakai snapshot aset Staff immutable `stage-staff-assets.js`, mempertahankan rilis sebelumnya, lalu `verify-staff-asset-release.js` untuk kedua versi/origin. Rollback aplikasi ke commit sebelumnya tetap kompatibel dengan migrasi aditif; jangan menghapus tabel/kolom atau snapshot lama saat rollback. Verifikasi produksi dibatasi pembacaan, pratinjau OCR anonim dan pemeriksaan aset/health. Alur tulis lengkap dijalankan di database uji.
