# Prompt Claude: Stabilize Bottom Nav Neighbor Transition

## Role
Anda adalah engineer frontend senior yang harus memperbaiki animasi neighbor pada bottom nav di halaman trial sampai benar-benar konsisten di production.

## Tujuan
Perbaiki masalah: animasi neighbor pada bottom nav masih terasa instant.

Target perilaku:
- Neighbor enter: 0.2s ease-in
- Neighbor exit: 0.5s ease-out
- Hover item utama tetap sesuai behavior saat ini (scale besar, warna, dll)

## Scope File
Kerjakan hanya file berikut kecuali benar-benar diperlukan:
- [public/patient-menu-trial.html](public/patient-menu-trial.html)
- [public/sw.js](public/sw.js)

## Konteks Penting
- Masalah terjadi pada interplay CSS transition + class toggle JS untuk class neighbor.
- Ada history script nav magnify yang sempat berada di lokasi salah; pastikan block JS nav magnify berada di area yang benar dan tidak nyangkut di event scroll welcome.
- Halaman menggunakan service worker, jadi cache version wajib dinaikkan setelah perubahan frontend.

## Batasan Wajib
1. Jangan ubah file lain di luar scope jika tidak perlu.
2. Jangan revert perubahan user yang tidak terkait.
3. Jangan gunakan destructive git command.
4. Pertahankan tampilan visual yang sudah diset user untuk hover utama.

## Rencana Eksekusi
1. Audit selector yang berpotensi override timing neighbor di [public/patient-menu-trial.html](public/patient-menu-trial.html).
2. Terapkan mekanisme timing yang deterministik untuk neighbor:
   - enter neighbor selalu 0.2s ease-in
   - exit neighbor selalu 0.5s ease-out
3. Pastikan tidak ada race condition saat class neighbor ditambah/dihapus.
4. Pastikan JS nav magnify tidak berada di dalam callback yang salah.
5. Naikkan CACHE_VERSION di [public/sw.js](public/sw.js).
6. Commit dan push perubahan.
7. Deploy ke server production dan restart PM2.
8. Verifikasi snippet code di server bahwa nilai timing sudah benar.

## Acceptance Criteria
Semua poin ini harus lolos:
1. Saat pointer masuk ke nav item, neighbor muncul dengan easing masuk 0.2s (tidak instant).
2. Saat pointer keluar dari area nav, neighbor kembali dengan easing keluar 0.5s.
3. Hover utama masih berfungsi seperti sebelumnya.
4. CACHE_VERSION di [public/sw.js](public/sw.js) berubah ke versi baru.
5. Perubahan sudah commit, push, pull di server, dan PM2 restart sukses.
6. Tidak ada perubahan tidak sengaja pada file lain.

## Bukti Verifikasi yang Harus Ditulis di Laporan
- Potongan CSS/JS final dari [public/patient-menu-trial.html](public/patient-menu-trial.html).
- Nilai CACHE_VERSION final dari [public/sw.js](public/sw.js).
- Output ringkas deploy:
  - git pull
  - pm2 restart all
  - status process online

## Format Laporan Akhir
Tuliskan ringkas dalam urutan:
1. Root cause yang dipastikan
2. Perubahan yang dilakukan
3. Commit hash
4. Hasil deploy production
5. Status acceptance criteria (checklist)