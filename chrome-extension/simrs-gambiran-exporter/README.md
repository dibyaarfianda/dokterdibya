# RSUD Gambiran to Klinik Dibya Exporter

Chrome extension untuk mengekspor data rekam medis dari SIMRS RSUD Gambiran Kediri ke sistem Klinik Dr. Dibya.

## Instalasi

1. Buka Chrome dan akses `chrome://extensions/`
2. Aktifkan "Developer mode" di pojok kanan atas
3. Klik "Load unpacked"
4. Pilih folder `simrs-gambiran-exporter`

## Cara Penggunaan

1. Klik icon extension dan login dengan akun Klinik Dibya
2. Buka SIMRS RSUD Gambiran (`simrsg.kedirikota.go.id`)
3. Navigate ke halaman CPPT pasien (contoh: `/kasus/med.../datamedis/cppt`)
4. Klik tombol "Export" di pojok kanan bawah
5. Data akan otomatis dikirim ke Staff Panel

## Fitur

- Export data CPPT (Subjective, Objective, Assessment, Plan)
- Parsing otomatis data vital signs
- Parsing otomatis data obstetri (G_P_, UK, HPHT, HPL)
- Integrasi langsung dengan Staff Panel Klinik Dibya

## URL yang Didukung

- `https://simrsg.kedirikota.go.id/kasus/med*/datamedis/cppt`
- `https://simrsg.kedirikota.go.id/kasus/med*`

## Troubleshooting

### Tombol Export tidak muncul
- Pastikan URL sudah benar (halaman CPPT pasien)
- Coba refresh halaman (F5)
- Periksa apakah extension sudah aktif (lihat badge "ON")

### Error "Silakan login terlebih dahulu"
- Klik icon extension
- Login dengan akun Klinik Dibya

### Error saat export
- Pastikan ada koneksi internet
- Coba refresh halaman dan ulangi
- Jika tetap error, hubungi administrator

## Versi

- v1.0.0 - Initial release
