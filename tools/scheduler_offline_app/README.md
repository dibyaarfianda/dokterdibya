# Generator Jadwal Jaga RSIA MELINDA

Desktop app offline untuk meramu jadwal jaga berbasis Excel (`.xlsx`) dengan rule engine.

## Fitur

- 100% offline (Python + Tkinter)
- Load file template jadwal yang sudah ada
- Welcome screen dengan pilihan:
  - Jadwal Jaga VK / Ruangan
  - Jadwal Jaga Neonatus (coming soon)
- Tema UI modern ala Staff Panel dokterDIBYA (topbar gelap, card putih, aksen biru)
- Ikon visual per section dan tombol aksi utama
- Badge status berwarna real-time (idle, preparing, optimizing, saving, done, error)
- Animasi transisi progress yang lebih halus saat generate berjalan
- Branding logo dari `tools/scheduler_offline_app/assets/jadwaljaga.png` (topbar + welcome)
- Icon logo multi-size otomatis (`16,24,32,48,64,96,128,256,512` + `.ico`) untuk app dan EXE
- Setting alih bahasa aplikasi: Indonesia <-> English
- Simpan/Muat konfigurasi ke file JSON
- Reset konfigurasi ke default
- Otomatis mengingat konfigurasi terakhir saat aplikasi dibuka lagi
- Generate jadwal otomatis dengan optimasi swap per hari
- Tombol preset cepat: `Apply Preset: Final VK`
- Progress bar 0-100% + status realtime (fase kerja, iterasi, elapsed, ETA)
- Font hasil generate dipaksa hitam agar tetap terbaca (termasuk tanggal awal)
- Fitur MAGANG bisa diatur langsung di UI:
  - Toggle `Proses Jadwal MAGANG` (default: OFF)
  - Kata kunci MAGANG kustom (CSV)
  - Daftar rank MAGANG eksplisit (CSV, opsional)
- Saat fitur MAGANG dimatikan, baris MAGANG tidak akan diproses untuk jaga
- Baris non-core yang tidak diproses dipaksa tetap `L` agar tidak muncul jaga liar
- Validasi otomatis:
  - Coverage harian (`P/S/M/L`)
  - Tandem rank
  - Rank group tidak bersamaan
  - `M -> P` next day
  - At least one `M-L-L` per staff
  - Distribusi libur dan malam per rank
  - Cek monotonic libur (rank atas tidak boleh kurang libur dari rank bawah)
- Policy warna:
  - Kuning untuk back duty (rank tertentu)
  - Polos/no-fill untuk front duty
- Export hasil ke file Excel baru
- Auto export report setelah generate:
  - JSON detail
  - CSV ringkas (summary + off_by_rank + m_by_rank)
- Jika output utama terkunci/tidak bisa ditulis (misalnya file masih terbuka di Excel), aplikasi otomatis menyimpan ke nama file cadangan (`autosave`) dan menampilkan notifikasi lokasi file.

## Struktur

- `app.py`: GUI
- `scheduler_engine.py`: engine optimasi + validasi + pewarnaan

## Cara Menjalankan

Dari root repo (Python):

```powershell
.\.venv\Scripts\python.exe .\tools\scheduler_offline_app\app.py
```

Atau dari folder ini:

```powershell
cd .\tools\scheduler_offline_app
..\..\.venv\Scripts\python.exe .\app.py
```

Atau jalankan launcher:

```powershell
.\run_scheduler_offline_app.bat
```

## Build EXE

Untuk membuat file `.exe` (Windows), jalankan:

```powershell
.\build_scheduler_offline_app_exe.bat
```

Hasil build:

- `dist\Generator Jadwal Jaga RSIA MELINDA.exe`
- Otomatis disalin ke `Desktop\Scheduler` (root folder dibersihkan agar hanya berisi `Generator Jadwal Jaga RSIA MELINDA.exe` dan `README.md`)

## Input yang Diharapkan

- Sheet default: `JADWAL BARU`
- Header hari ada di baris 2 (angka tanggal 1-31)
- Kolom A: nomor rank/staff
- Kolom B: nama staff

## Catatan

- Jika coverage awal di file input tidak sesuai (`P/S/M/L`), engine akan rebuild assignment harian lalu optimasi.
- Untuk workflow aman, simpan output ke file baru (jangan overwrite file sumber).
- Report export folder bisa dipilih terpisah; jika kosong, report disimpan di folder file output.
- Target libur otomatis disesuaikan dengan jumlah hari aktif (misalnya 27 hari vs 30 hari) agar total libur tetap konsisten tanpa melanggar hirarki rank.
