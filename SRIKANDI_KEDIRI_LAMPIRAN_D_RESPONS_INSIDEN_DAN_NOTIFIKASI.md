# SRIKANDI KEDIRI — Lampiran D
## Prosedur Respons Insiden & Template Notifikasi 24 Jam

Dokumen ini menetapkan prosedur minimum penanganan insiden keamanan/layanan pada platform KIA **SRIKANDI KEDIRI**.

## 1. Tujuan

- Menjamin respon cepat, terstruktur, dan terdokumentasi.
- Memastikan notifikasi awal ke PIHAK PERTAMA maksimal **1 x 24 jam** sejak insiden diketahui.
- Menjaga dampak insiden terhadap layanan KIA tetap minimal.

## 2. Definisi Insiden

Insiden adalah kejadian yang menyebabkan atau berpotensi menyebabkan:
- kebocoran/akses tidak sah data
- gangguan integritas data
- gangguan ketersediaan API/layanan
- pelanggaran kebijakan keamanan

## 3. Klasifikasi Severity

- **SEV-1 (Critical):** layanan inti lumpuh / indikasi kompromi data sensitif skala besar
- **SEV-2 (High):** layanan utama terganggu signifikan / potensi paparan data terbatas
- **SEV-3 (Medium):** gangguan terbatas, ada workaround
- **SEV-4 (Low):** isu minor, dampak rendah

## 4. Alur Respons Insiden

### 4.1 Deteksi & Triage

- Sumber deteksi: monitoring, alert SIEM, laporan pengguna, audit log.
- Triage awal maksimal:
  - SEV-1: 15 menit
  - SEV-2: 1 jam
  - SEV-3/4: hari kerja berjalan

### 4.2 Containment

Tindakan minimum:
- isolasi komponen terdampak
- pembatasan akses sementara
- rotasi kredensial/token jika relevan
- aktifkan mode aman/failover bila tersedia

### 4.3 Eradikasi & Pemulihan

- identifikasi akar teknis
- patch/perbaikan konfigurasi
- validasi integritas sistem & data
- pemulihan layanan bertahap dengan observasi ketat

### 4.4 Post-Incident (RCA)

- RCA untuk SEV-1/SEV-2: maksimal 5 hari kerja
- berisi akar masalah, dampak, timeline, tindakan pencegahan

## 5. SLA Komunikasi Insiden

- Notifikasi awal ke PIHAK PERTAMA: maksimal **1 x 24 jam**
- Update berkala:
  - SEV-1: tiap 60 menit
  - SEV-2: tiap 4 jam
  - SEV-3/4: sesuai jam kerja / milestone

## 6. Kanal & Matriks Eskalasi

### 6.1 Kanal Resmi

- Email resmi insiden: ____________________
- Hotline/WA darurat: ____________________
- Ticketing system: ____________________

### 6.2 Matriks Eskalasi

1. On-call engineer PIHAK KEDUA
2. Lead engineer / Incident Manager PIHAK KEDUA
3. PIC Teknis PIHAK PERTAMA
4. Pimpinan unit terkait PIHAK PERTAMA (untuk SEV-1)

## 7. Bukti & Dokumentasi Wajib

- waktu deteksi dan waktu konfirmasi insiden
- sistem/endpoint terdampak
- estimasi jumlah data/subjek terdampak (jika ada)
- tindakan containment/pemulihan
- log teknis utama dan bukti perubahan
- keputusan operasional penting

---

## 8. Template Notifikasi Awal (≤ 24 Jam)

**Subjek:** [INSIDEN][SEV-X] SRIKANDI KEDIRI — [Ringkasan Singkat]

**Isi minimal:**
1. Waktu diketahui: __________
2. Klasifikasi: SEV-__
3. Ringkasan insiden: __________
4. Sistem/API terdampak: __________
5. Dampak layanan/data (sementara): __________
6. Tindakan awal yang sudah dilakukan: __________
7. Status saat ini: __________
8. ETA update berikutnya: __________
9. PIC insiden (nama + kontak): __________

---

## 9. Template Laporan RCA (SEV-1/SEV-2)

1. Ringkasan eksekutif
2. Timeline kejadian end-to-end
3. Akar masalah utama
4. Faktor pendukung/kontributor
5. Dampak layanan dan data
6. Tindakan mitigasi cepat
7. Tindakan korektif permanen
8. Tindakan pencegahan berulang + owner + due date

---

## 10. Checklist Kepatuhan Lampiran D

- [ ] Tim insiden & on-call ditunjuk resmi
- [ ] Kanal notifikasi aktif dan diuji
- [ ] Simulasi tabletop insiden dilakukan
- [ ] Template notifikasi dan RCA siap dipakai
- [ ] Bukti audit respons insiden terdokumentasi

---

## Tanda Persetujuan Lampiran D

PIHAK PERTAMA,                               PIHAK KEDUA,

Nama: ____________________                   Nama: ____________________
Jabatan: ____________________                Jabatan: ____________________
Tanggal: ____________________                Tanggal: ____________________
