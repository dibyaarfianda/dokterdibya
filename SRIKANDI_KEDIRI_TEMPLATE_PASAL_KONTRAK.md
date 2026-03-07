# SRIKANDI KEDIRI — Template Pasal Kontrak (Draft 1 Halaman)

> Dokumen ini adalah template awal untuk penyusunan kontrak kerja sama/pengadaan.
> Wajib direview dan disahkan oleh tim hukum resmi para pihak sebelum ditandatangani.

## Isian Cepat (Recommended Defaults)

Gunakan nilai default ini sebagai draft awal (boleh disesuaikan tim legal):

- Instansi PIHAK PERTAMA: `Dinas Kesehatan Kota Kediri` (koordinasi dengan `Diskominfo Kota Kediri` untuk tata kelola sistem).
- Batas laporan insiden awal: `maksimal 1 x 24 jam` sejak insiden diketahui.
- Batas musyawarah sengketa: `30 hari kerja`.
- Ketersediaan layanan (availability) bulanan: `99,5%` (di luar jadwal maintenance yang disetujui).
- Respons insiden:
	- `Critical`: respon ≤ `1 jam`, pemulihan awal ≤ `4 jam`
	- `High`: respon ≤ `4 jam`, pemulihan awal ≤ `12 jam`
	- `Medium`: respon ≤ `1 hari kerja`
	- `Low`: respon ≤ `3 hari kerja`
- Masa retensi log audit minimum: `2 tahun` (atau lebih sesuai kebijakan pemilik data).
- Hak akses developer produksi: `temporary + ticketed + approval` dari PIC Pemkot.
- Forum sengketa: `Pengadilan Negeri Kediri` (jika musyawarah gagal, sesuai kesepakatan para pihak).
- Kewajiban serah-terima terminasi: `maksimal 30 hari kalender` sejak tanggal efektif terminasi.
- Kewajiban hapus salinan data setelah serah-terima: `maksimal 14 hari kalender`, disertai berita acara.

## Isian Wajib Sebelum TTD

- Nomor dokumen kontrak/SPK: __________
- Nama lengkap pejabat PIHAK PERTAMA: __________
- Nama lengkap PIHAK KEDUA/perusahaan: __________
- Nama penanggung jawab perlindungan data (dari PIHAK PERTAMA): __________
- Daftar subprosesor/subkontraktor (jika ada): __________
- Lokasi data center/region cloud: __________
- Lampiran SLA final versi: __________
- Lampiran standar keamanan minimum versi: __________
- Lampiran daftar data KIA final: __________

## 1) Definisi Para Pihak
1. **PIHAK PERTAMA**: Pemerintah Kota Kediri melalui __________.
2. **PIHAK KEDUA**: __________ (Developer Utama SRIKANDI KEDIRI).
3. **Sistem**: Platform data Kesehatan Ibu dan Anak “SRIKANDI KEDIRI” berbasis API-only.
4. **Data**: Seluruh data operasional, metadata, log audit, dokumentasi, dan turunan data yang diproses dalam sistem.

## 2) Kepemilikan Data dan Sistem
1. Kepemilikan seluruh Data berada pada **PIHAK PERTAMA**.
2. PIHAK KEDUA hanya bertindak sebagai pelaksana teknis/pengolah data berdasarkan instruksi tertulis PIHAK PERTAMA.
3. PIHAK KEDUA tidak memperoleh hak kepemilikan atas Data, termasuk data turunan, agregasi, dan backup.
4. Hak akses PIHAK KEDUA ke lingkungan produksi dibatasi sesuai prinsip least privilege, dicatat dalam audit trail, dan dapat dicabut sewaktu-waktu oleh PIHAK PERTAMA.

## 3) Tujuan dan Batas Penggunaan Data
1. Data hanya boleh diproses untuk tujuan layanan Kesehatan Ibu dan Anak di wilayah Kediri sesuai ruang lingkup kontrak.
2. Dilarang menggunakan Data untuk pelatihan model, komersialisasi, publikasi, atau tujuan lain tanpa persetujuan tertulis PIHAK PERTAMA.
3. Dilarang mentransfer Data ke pihak ketiga tanpa persetujuan tertulis PIHAK PERTAMA, kecuali diwajibkan oleh peraturan perundang-undangan.

## 4) Keamanan Informasi dan Kerahasiaan
1. PIHAK KEDUA wajib menerapkan kontrol keamanan minimum: enkripsi in-transit dan at-rest, segmentasi jaringan, manajemen kredensial, serta pemantauan akses.
2. Arsitektur **API-only** wajib diterapkan: database tidak boleh diakses langsung dari publik; akses data hanya melalui API terautentikasi dan terotorisasi.
3. PIHAK KEDUA wajib menjaga kerahasiaan Data dan memastikan seluruh personel/subkontraktor menandatangani NDA.
4. PIHAK KEDUA wajib melaporkan insiden keamanan kepada PIHAK PERTAMA paling lambat ____ jam sejak diketahui, disertai rencana mitigasi.

## 5) Kepatuhan Hukum
1. Para pihak wajib mematuhi ketentuan peraturan perundang-undangan yang berlaku terkait perlindungan data pribadi dan kerahasiaan data kesehatan.
2. PIHAK KEDUA wajib memfasilitasi audit kepatuhan, audit teknis, dan permintaan bukti kontrol oleh PIHAK PERTAMA atau auditor yang ditunjuk.

## 6) Hak Kekayaan Intelektual dan Lisensi
1. Hak cipta atas source code, modul, dokumentasi, dan artefak pengembangan diatur sebagai berikut: __________.
2. Terlepas dari pengaturan hak cipta, PIHAK PERTAMA memperoleh hak pakai penuh untuk operasional layanan publik sesuai masa kontrak dan ketentuan perpanjangan.
3. Ketentuan escrow/source handover (jika disepakati): __________.

## 7) SLA, Dukungan, dan Tanggung Jawab
1. PIHAK KEDUA wajib memenuhi SLA layanan: ketersediaan, waktu respons insiden, dan pemulihan layanan sesuai Lampiran SLA.
2. PIHAK KEDUA bertanggung jawab atas kerugian yang timbul akibat kelalaian dalam penerapan kontrol keamanan sesuai ketentuan kontrak dan hukum yang berlaku.

## 8) Serah Terima dan Terminasi
1. Pada saat kontrak berakhir/diakhiri, PIHAK KEDUA wajib menyerahkan kepada PIHAK PERTAMA: data, backup, kredensial, dokumentasi teknis, runbook, dan artefak operasional lainnya.
2. PIHAK KEDUA wajib menghapus salinan Data yang berada di penguasaannya setelah serah terima dinyatakan lengkap, kecuali diwajibkan lain oleh hukum.
3. Berita acara serah terima menjadi bukti final pemenuhan kewajiban transisi.

## 9) Penyelesaian Sengketa
1. Sengketa diselesaikan terlebih dahulu secara musyawarah dalam waktu ____ hari kerja.
2. Jika tidak tercapai kesepakatan, sengketa diselesaikan sesuai forum hukum yang disepakati para pihak: __________.

---

## Blok Tanda Tangan

PIHAK PERTAMA,                               PIHAK KEDUA,

Nama: ____________________                   Nama: ____________________
Jabatan: ____________________                Jabatan: ____________________
Tanggal: ____________________                Tanggal: ____________________

---

## Lampiran yang Disarankan
- Lampiran A: SLA dan matriks severity insiden (`SRIKANDI_KEDIRI_LAMPIRAN_A_SLA.md`)
- Lampiran B: Standar keamanan minimum (`SRIKANDI_KEDIRI_LAMPIRAN_B_STANDAR_KEAMANAN_MINIMUM.md`)
- Lampiran C: Daftar data KIA yang diproses (data minimization) (`SRIKANDI_KEDIRI_LAMPIRAN_C_DAFTAR_DATA_KIA_MINIMUM.md`)
- Lampiran D: Prosedur respons insiden dan notifikasi (`SRIKANDI_KEDIRI_LAMPIRAN_D_RESPONS_INSIDEN_DAN_NOTIFIKASI.md`)
- Lampiran E: Prosedur serah terima terminasi (`SRIKANDI_KEDIRI_LAMPIRAN_E_PROSEDUR_SERAH_TERIMA_TERMINASI.md`)
