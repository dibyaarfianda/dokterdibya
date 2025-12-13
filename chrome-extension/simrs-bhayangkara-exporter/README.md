# RS Bhayangkara to Klinik Dibya Exporter

Chrome extension untuk export data rekam medis dari SIMRS RS Bhayangkara ke sistem Klinik Dibya.

## Fitur

- Export otomatis dari halaman CPPT/rekam medis
- AI parsing untuk ekstraksi data medis
- Auto-search pasien berdasarkan nama
- Auto-create MR dengan lokasi RS Bhayangkara
- Langsung navigate ke halaman rekam medis

## Instalasi

1. Buka Chrome, masuk ke `chrome://extensions/`
2. Aktifkan "Developer mode" (toggle kanan atas)
3. Klik "Load unpacked"
4. Pilih folder `simrs-bhayangkara-exporter`

## Cara Pakai

1. Klik icon extension, login dengan akun Klinik Dibya
2. Buka halaman rekam medis pasien di SIMRS RS Bhayangkara
3. Klik tombol "Export" di pojok kanan bawah
4. Data otomatis masuk ke sistem Klinik Dibya

## Flow

```
SIMRS RS Bhayangkara
       │
       │ Klik Export
       ▼
   API Parse (AI)
       │
       ▼
   Staff Panel
       │
       ├─ Search pasien by nama
       │
       ├─ Found → Buat MR (lokasi: RS Bhayangkara)
       │
       └─ Navigate ke /sunday-clinic/{mrId}/anamnesa
```

## URL Pattern

- `https://simrs.rsbhayangkara-kediri.com/*`
- `https://*.rsbhayangkara-kediri.com/*`
