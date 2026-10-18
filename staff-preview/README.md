# Staff Mobile Preview

Prototipe interaktif Staff dan DocBoard dengan tema Laboratorium. Target: **https://dokterdibya.com/staff-preview/**. Fokus mobile; desktop menampilkan bingkai ponsel. Aplikasi operasional tetap terpisah.

## Menjalankan

Gunakan Node.js 24 dan pnpm. Versi dependensi terkunci di `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec eslint .
pnpm build
pnpm preview
```

Buka `http://127.0.0.1:4175/staff-preview/`. [Katalog layar](SCREEN-CATALOG.md) mencatat seluruh rute dan alias sumber. `pnpm catalog` mencetak katalog lengkap beserta referensi sumber. Katalog di dalam aplikasi juga dapat diunduh sebagai JSON.

## Mencoba desain

- Enam tab: Dashboard, Janji Temu, DocBoard, Pasien, Tanya Dokter, Lainnya.
- Tombol **Demo** di atas memilih Dokter, Administrasi, Bidan, Front Office, atau Managerial. Ini preset fiktif berdasarkan konstanta dan izin proyek, bukan pembacaan hak akun produksi.
- Skenario: Normal, Kosong, Memuat, Gagal, Offline, Tanpa akses, Konflik versi. Tombol Coba Lagi mengembalikan keadaan normal.
- Pasien/DRD dapat diganti melalui kartu identitas. Tersedia Obstetri, Ginekologi Reproduksi, Ginekologi Khusus, dan kunjungan rumah sakit. Tagihan dan lab terstruktur memakai DRD Klinik Privat.
- Coba daftar → detail → edit → simpan → buka ulang. Draf dipisahkan per kunjungan; konflik menahan perubahan sampai pengguna memilih memuat versi tersimpan.
- Laboratorium mendukung foto/galeri/PDF lokal, kandidat OCR **simulasi**, koreksi manual, penerbitan lokal, komparasi, dan cetak. **OCR tidak mentranskripsikan berkas yang dipilih**; kandidat selalu berasal dari fixture fiktif.
- Cetak/PDF menggunakan dialog cetak browser dan selalu bertanda **DUMMY**. Pilih “Simpan sebagai PDF” untuk mengekspor.
- Pratinjau berkas PDF memakai penampil bawaan browser. Jika browser tidak mendukung penampil dalam halaman, gunakan **Buka PDF Sumber** untuk membuka atau mengunduh berkas lokal.
- **Reset Data Demo** mengembalikan fixture, draf, preferensi, dan berkas preview saja.

## Penyimpanan dan batas integrasi

Tidak ada panggilan API klinis, autentikasi produksi, SIMRS, Socket.IO, email, pembayaran, atau notifikasi nyata. Semua identitas, rekam medis, transaksi, dan percakapan adalah fixture. State memakai satu key `dibya-staff-preview:v1`; berkas lokal memakai IndexedDB `dibya-staff-preview-files`. Jika penyimpanan gagal, sesi menggunakan memory dan menampilkan pemberitahuan.

Manifest, worker, dan cache hanya mencakup `/staff-preview/`; cache bernama `dibya-staff-preview-*`. Reset tidak membersihkan storage/cookie/cache aplikasi lain. Jangan memasukkan data pasien nyata ke dummy publik ini.

## Rilis dan rollback

Commit dan push kode terlebih dahulu, lalu build agar versi aplikasi/manifest rilis menunjuk commit tersebut. Tar seluruh isi `dist/` ke `/var/tmp/staff-preview-<commit8>.tar.gz` di VPS yang sudah digunakan. Jalankan `scripts/deploy-preview.sh <tarball-absolut> <commit40>` melalui SSH yang tersedia. Skrip memeriksa hash/commit, hanya menerima diff prototype ini, menambahkan route Nginx preview, lalu mengganti symlink rilis secara atomik. Hash HTML Staff dan DocBoard harus tetap sama.

Rilis disimpan di `/var/www/dokterdibya-staff-preview/releases/<commit>`, aset dengan nama hash disimpan aditif di `assets/`. Rilis sebelumnya dan backup konfigurasi Nginx dipertahankan. Untuk rollback, arahkan `current` secara atomik ke path pada `previous-release`, uji Nginx lalu reload; aset lama tetap tersedia.

Setelah deploy, periksa `release.json`, hash aset kedua origin, health, dan alur UI melalui Codex in-app browser. Bukti pengujian lokal berada di `.qa/` dan tidak masuk Git.

## Validasi implementasi

- 12 tes kontrak lulus: kelengkapan katalog, draf per DRD, penyimpanan gagal, izin aksi, konflik, publikasi/koreksi, komparasi dan isolasi service worker.
- Seluruh 89 layar diperiksa melalui in-app browser pada 360, 390 dan 430 px; 55 detail modul dan 44 editor juga diperiksa pada ketiga lebar tersebut. Tidak ada overflow horizontal di luar area tabel komparasi.
- Uji interaksi meliputi simpan/buka ulang, konflik dua tab, identitas DRD, unggah PNG/PDF dan pembukaan ulang setelah reload, penerapan OCR simulasi yang menjaga nilai manual, versi portal sebelum/sesudah koreksi, chat, hapus dan reset.
- Landscape 844×390 dan tinggi 390×500 (simulasi ruang keyboard) menjaga navigasi tetap terlihat. PDF hasil dan komparasi diperiksa terpisah; pencetakan memerlukan pilihan printer/Simpan PDF dari browser pengguna.

Matriks ini memverifikasi dummy browser. Kamera perangkat, keyboard native dan pemasangan PWA pada perangkat fisik tetap memerlukan uji perangkat sebelum UI dipakai secara operasional.
