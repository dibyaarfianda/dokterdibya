# SIMRS Melinda to Klinik Dibya Exporter

Chrome Extension untuk export rekam medis dari SIMRS Melinda ke sistem Klinik Dibya.

## Instalasi

### 1. Generate Icons (Pertama Kali)
Sebelum install, generate icon PNG dari SVG:

```bash
# Menggunakan ImageMagick
convert icons/icon.svg -resize 16x16 icons/icon16.png
convert icons/icon.svg -resize 48x48 icons/icon48.png
convert icons/icon.svg -resize 128x128 icons/icon128.png
```

Atau gunakan online converter: https://svgtopng.com/

### 2. Load Extension di Chrome

1. Buka `chrome://extensions/`
2. Aktifkan **Developer mode** (toggle di pojok kanan atas)
3. Klik **Load unpacked**
4. Pilih folder `simrs-melinda-exporter`

### 3. Login

1. Klik icon extension di toolbar
2. Login dengan akun staff Klinik Dibya
3. Extension siap digunakan

## Penggunaan

1. Buka halaman pasien di SIMRS Melinda (https://simrs.melinda.co.id/kasus/...)
2. Tombol **"Export"** akan muncul di pojok kanan bawah
3. Klik tombol untuk export data ke sistem Klinik Dibya
4. Data akan otomatis di-parse dan tersimpan

## Struktur Data yang Di-extract

- **Identitas**: Nama, NIK, Jenis Kelamin, Tanggal Lahir, Alamat, No HP, TB, BB
- **CPPT/SOAP**:
  - Subjective: Keluhan Utama, RPS, RPD, RPK, HPHT, HPL
  - Objective: K/U, Tensi, Nadi, Suhu, SpO2, GCS, RR, USG
  - Assessment: Diagnosis, Gravida, Para, Usia Kehamilan
  - Plan: Obat, Tindakan, Instruksi

## Troubleshooting

### Tombol Export tidak muncul
- Pastikan Anda di halaman pasien (URL: `/kasus/med...`)
- Refresh halaman
- Cek console untuk error

### Login gagal
- Pastikan koneksi internet aktif
- Gunakan email dan password yang sama dengan Staff Panel

### Data tidak lengkap
- Extension membaca data yang terlihat di halaman
- Pastikan tab CPPT sudah dibuka/di-expand

## Update

Untuk update extension:
1. Download versi terbaru
2. Buka `chrome://extensions/`
3. Klik tombol refresh pada extension

## Support

Hubungi: support@dokterdibya.com
