# SRIKANDI KEDIRI — Lampiran E
## Prosedur Serah-Terima Terminasi (Exit Procedure)

Dokumen ini mengatur proses transisi ketika kontrak berakhir atau diakhiri, agar layanan KIA tetap aman dan berkelanjutan.

## 1. Tujuan

- Menjamin data milik PIHAK PERTAMA kembali lengkap, aman, dan dapat digunakan.
- Mencegah kehilangan kontrol, lock-in, dan kebocoran data saat transisi.
- Menetapkan tenggat, artefak wajib, dan bukti serah-terima yang terukur.

## 2. Prinsip Umum

- Kepemilikan data tetap pada PIHAK PERTAMA.
- Serah-terima wajib selesai maksimal **30 hari kalender** sejak tanggal efektif terminasi (kecuali disepakati lain).
- Penghapusan salinan data oleh PIHAK KEDUA maksimal **14 hari kalender** setelah serah-terima dinyatakan lengkap.

## 3. Cakupan Serah-Terima Wajib

### 3.1 Data & Backup

- data operasional terbaru
- backup terenkripsi sesuai periode retensi
- data dictionary & skema data final
- mapping integrasi antar fasilitas

### 3.2 Aset Teknis

- source code sesuai klausul lisensi/kontrak
- dokumentasi deployment, runbook, SOP operasional
- konfigurasi API gateway dan endpoint registry
- konfigurasi monitoring/alert/dashboard

### 3.3 Akses & Kredensial

- daftar akun layanan (service accounts)
- kredensial/secrets yang wajib dipindahkan atau dirotasi
- daftar sertifikat, key, dan lifecycle-nya
- daftar integrasi pihak ketiga dan status aksesnya

### 3.4 Operasional & Kepatuhan

- log audit periode kontrak sesuai retensi
- daftar insiden + status tindak lanjut
- daftar temuan audit + status remediation
- daftar item teknis yang belum selesai (open issues)

## 4. Tahapan Exit

### Tahap 1 — Persiapan (Hari 0–7)

- penunjukan PIC transisi kedua pihak
- freeze perubahan non-kritis
- finalisasi daftar artefak serah-terima

### Tahap 2 — Transfer (Hari 8–21)

- transfer data, dokumen, konfigurasi, dan source code
- verifikasi checksum/integritas data
- transfer knowledge (KT session) minimal 2 sesi

### Tahap 3 — Validasi (Hari 22–30)

- UAT transisi oleh PIHAK PERTAMA
- penutupan gap kritis
- berita acara serah-terima final

## 5. Checklist Exit (Wajib)

- [ ] Daftar aset dan artefak final disepakati
- [ ] Data utama + backup diterima dan tervalidasi integritasnya
- [ ] Dokumentasi teknis lengkap diterima
- [ ] Kredensial dirotasi/ditransfer aman
- [ ] Akses PIHAK KEDUA ke produksi dicabut sesuai jadwal
- [ ] Open issues dan technical debt diserahterimakan tertulis
- [ ] Berita acara serah-terima ditandatangani
- [ ] Bukti penghapusan salinan data oleh PIHAK KEDUA diterima

## 6. Bukti Penghapusan Data

PIHAK KEDUA wajib menyerahkan bukti:
- pernyataan resmi penghapusan data
- log/hapus media penyimpanan yang relevan
- daftar lokasi data yang telah dihapus
- pengecualian legal (jika ada) beserta dasar hukumnya

## 7. Kontinuitas Layanan Pasca Terminasi

- rencana transisi ke operator baru/internal
- periode hypercare pasca go-live transisi: `14–30 hari` (sesuai kesepakatan)
- jalur eskalasi khusus transisi tetap aktif hingga hypercare selesai

## 8. Risiko Transisi dan Mitigasi

- Risiko kehilangan data → mitigasi: backup + verifikasi integritas
- Risiko downtime → mitigasi: cutover plan + rollback
- Risiko kredensial bocor → mitigasi: rotasi total secret/key
- Risiko knowledge gap → mitigasi: KT terstruktur + dokumentasi

---

## 9. Template Berita Acara Serah-Terima (Ringkas)

Pada tanggal __________, PIHAK PERTAMA dan PIHAK KEDUA menyatakan bahwa:
1. Seluruh artefak wajib sesuai Lampiran E telah diserahkan.
2. Validasi integritas data dan akses telah dilakukan.
3. Akses produksi PIHAK KEDUA telah dicabut/diatur sesuai kesepakatan.
4. Kewajiban penghapusan salinan data oleh PIHAK KEDUA diselesaikan / dalam proses sesuai tenggat.

Catatan tambahan: ____________________

---

## Tanda Persetujuan Lampiran E

PIHAK PERTAMA,                               PIHAK KEDUA,

Nama: ____________________                   Nama: ____________________
Jabatan: ____________________                Jabatan: ____________________
Tanggal: ____________________                Tanggal: ____________________
