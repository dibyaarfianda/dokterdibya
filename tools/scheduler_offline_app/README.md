# Offline Jadwal Jaga Builder

Desktop app offline untuk meramu jadwal jaga berbasis Excel (`.xlsx`) dengan rule engine.

## Fitur

- 100% offline (Python + Tkinter)
- Load file template jadwal yang sudah ada
- Generate jadwal otomatis dengan optimasi swap per hari
- Tombol preset cepat: `Apply Preset: Final VK`
- Progress bar + status realtime (iterasi, elapsed, ETA)
- Validasi otomatis:
  - Coverage harian (`P/S/M/L`)
  - Tandem rank
  - Rank group tidak bersamaan
  - `M -> P` next day
  - At least one `M-L-L` per staff
  - Distribusi libur dan malam per rank
- Policy warna:
  - Kuning untuk back duty (rank tertentu)
  - Polos/no-fill untuk front duty
- Export hasil ke file Excel baru
- Auto export report setelah generate:
  - JSON detail
  - CSV ringkas (summary + off_by_rank + m_by_rank)

## Struktur

- `app.py`: GUI
- `scheduler_engine.py`: engine optimasi + validasi + pewarnaan

## Cara Menjalankan

Dari root repo:

```powershell
.\.venv\Scripts\python.exe .\tools\scheduler_offline_app\app.py
```

Atau dari folder ini:

```powershell
cd .\tools\scheduler_offline_app
..\..\.venv\Scripts\python.exe .\app.py
```

## Input yang Diharapkan

- Sheet default: `JADWAL BARU`
- Header hari ada di baris 2 (angka tanggal 1-31)
- Kolom A: nomor rank/staff
- Kolom B: nama staff

## Catatan

- Jika coverage awal di file input tidak sesuai (`P/S/M/L`), engine akan rebuild assignment harian lalu optimasi.
- Untuk workflow aman, simpan output ke file baru (jangan overwrite file sumber).
- Report export folder bisa dipilih terpisah; jika kosong, report disimpan di folder file output.
