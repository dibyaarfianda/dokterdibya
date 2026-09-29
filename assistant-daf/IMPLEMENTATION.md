# Asisten DAF — rilis manual, 30 September 2026

## Batas rilis

PWA `/assistant-daf/` menggunakan passkey, menerima satu pesan pilihan Dokter, membuat usulan terenkripsi, dan meminta konfirmasi sebelum menulis ke DocBoard. Pesan tidak dikirim ke model AI. Diskusi AI tampil sebagai ruang yang belum aktif. Pemantauan WhatsApp, mode bayangan, dan penulisan otomatis tetap nonaktif.

VPS AI terpisah belum tersedia. Rilis ini tidak menjalankan inferensi di server COMM. Integrasi konteks hanya pemeriksaan identitas pasien melalui COMM; bukan akses rekam medis bebas.

## Identitas dan konfirmasi

- Pilih fasilitas lalu ketik nomor RM lengkap. COMM memanggil direktori SIMRS Melinda/Gambiran atau pencarian pasien ERM Bhayangkara. Hasil harus cocok persis dengan RM dan hanya satu ID pasien. Nama sama tidak cukup.
- Tidak ada pencarian dengan kemiripan nama. Nomor RM dengan nol di depan harus dimasukkan lengkap.
- Pembuatan, perubahan, pembatalan memerlukan konfirmasi. Perubahan memeriksa versi jadwal; tampilan lama ditolak.
- Perpindahan antar-fasilitas ditahan sampai ada penghubung identitas lintas fasilitas yang terverifikasi. Jangan membuat penghubung dari nama saja.
- Jadwal tindakan dari Asisten diubah melalui Asisten. DocBoard tetap menampilkan hasilnya.
- Duplikasi diperiksa berdasarkan identitas/fasilitas/jenis/tanggal. Operasi yang sudah ada di modul operasi pada fasilitas/tanggal/RM sama juga menahan pembuatan; perlu diperiksa di DocBoard.
- Kata relatif pada pesan terusan (besok/lusa) tidak otomatis diberi tanggal karena waktu pesan asli tidak tersedia.
- Pembacaan awal direktori Gambiran terukur sekitar 29 detik. Batas pemeriksaan identitas 45 detik di COMM, satu permintaan per fasilitas pada proses yang sama; kegagalan tetap menahan jadwal. Ini bukan waktu inferensi AI.

## Keamanan

- Hanya pemilik tetap yang dapat mendaftarkan passkey pertama melalui sesi staff DocBoard. Token pasien ditolak. Penambahan/pencabutan passkey perlu sesi passkey berumur maksimal lima menit. Pencabutan mengakhiri seluruh sesi.
- WebAuthn mewajibkan verifikasi pengguna, origin dan RP ID tetap. Cookie HttpOnly, SameSite=Strict, Secure di HTTPS. Tampilan dibersihkan saat dikunci, ditinggalkan, atau sesi kedaluwarsa; sesi baru pada halaman baru memerlukan passkey.
- Pesan dan usulan memakai AES-256-GCM dengan AAD pemilik+ID. Jejak keputusan dan langganan push juga terenkripsi. Audit aplikasi tidak memuat pesan/nama/RM/tautan kalender. Jadwal hasil konfirmasi mengikuti penyimpanan klinis DocBoard yang sudah ada.
- Isi sumber dihapus setelah 30 hari, diperiksa setiap menit. Berbagi sebelum login hanya disimpan dalam memori worker lima menit, tidak di IndexedDB atau URL.
- Kunci Asisten disimpan di `/etc/assistant-daf/`, root-only, di luar direktori aplikasi dan git. Jangan memasukkan kunci ke log atau artefak.
- COMM menerima fungsi POST identitas terbatas melalui loopback dengan kunci khusus. Jalur itu diblokir pada nginx publik. Kedua backend bind loopback; akses pengguna melalui HTTPS nginx.
- Push memakai tabel terpisah dari broadcast DocBoard, payload generik tanpa pasien. Endpoint dibatasi ke provider push yang dikenal.
- Kalender ICS memiliki token acak yang hash-nya disimpan; rotasi/pencabutan langsung memutus akses berikutnya. Kalender hanya berisi waktu dan label fasilitas yang dikenal. Salinan yang sudah tersimpan pada perangkat tidak dapat ditarik kembali.

## Cadangan dan pemulihan

`staff/backend/scripts/assistant-daf-backup.js` membuat snapshot konsisten milik pemilik Asisten, terenkripsi AES-256-GCM, disimpan root-only di `/var/backups/assistant-daf`, retensi tujuh hari. Isi pesan/usulan mentah tidak disertakan agar masa retensi sumber tidak diperpanjang oleh cadangan. Sesi, tantangan passkey, dan token kalender juga tidak disertakan; setelah pemulihan buat tautan kalender baru.

Kunci backup `/etc/assistant-daf/backup.key` terpisah dari file cadangan. Kunci data aplikasi tetap dibutuhkan untuk membaca keputusan/push dalam cadangan. Cadangan pada mesin yang sama belum melindungi dari kehilangan seluruh VPS; salinan terenkripsi di lokasi terpisah dan uji pemulihan menyeluruh masih diperlukan. Enkripsi seluruh disk dan cadangan klinis yang sudah ada belum dinyatakan terverifikasi oleh rilis ini. Jangan menganggap rilis ini telah memenuhi semua gerbang keamanan produksi penuh.

Pemulihan harus dilakukan administrator pada basis data uji lebih dulu: verifikasi autentikasi cadangan (`--verify`), konversi Buffer JSON, pulihkan tabel yang sesuai, terapkan migrasi, kosongkan sesi/tantangan/token kalender, periksa versi jadwal dan status pengingat sebelum mengaktifkan layanan. Jangan mengimpor dump secara buta ke rekam pasien produksi.

Jika seluruh passkey hilang, pemulihan memerlukan tindakan administrator setelah memverifikasi Dokter; tidak ada penggantian otomatis dengan kata sandi atau OTP. Cabut sesi/kalender saat perangkat hilang. Simpan lebih dari satu passkey pada perangkat yang dikuasai Dokter.

## Penerapan

1. Uji migrasi `20260929_assistant_daf_phase1.sql` pada skema terpisah. Cadangkan skema/jadwal sebelum menerapkan sekali pada produksi.
2. Deploy fungsi baca COMM dan kunci konteks khusus; jangan memakai kunci internal umum yang dapat membuka operasi lain.
3. Deploy DOKTERDIBYA, pasang dependensi terkunci, terapkan migrasi, siapkan kunci/origin/RP ID, nginx privat, restart hanya backend terkait.
4. Periksa commit aktif, halaman/manifest/worker, penolakan akses tanpa passkey, jalur konteks dari luar, dan kesehatan aplikasi klinis.
5. Daftarkan passkey sendiri dari browser yang sudah login DocBoard pada origin yang sama.

## Bukti pengujian dan gerbang tersisa

Uji unit mencakup 50 kalimat bahasa Indonesia, enkripsi, akses pemilik, token pasien, stale update, URL log, pemisahan push dan pencabutan passkey. Uji MariaDB terpisah dan Chromium dengan virtual authenticator mencakup WebAuthn nyata, formulir konfirmasi, pasien bernama sama, duplikasi, perubahan/pembatalan, enkripsi yang tersimpan, pencabutan ICS, expired-session purge, serta POST Share Target tanpa IndexedDB plaintext. Semua data uji sintetis; tidak ada penulisan pasien produksi untuk pengujian.

Belum boleh dianggap lulus:

- Android WhatsApp → Bagikan ke PWA terpasang pada perangkat nyata.
- iPhone Home Screen, passkey perangkat nyata, push H-1, pembaruan langganan ICS dan alarm kalender Android/iPhone.
- Pemulihan bencana dari backup terpisah, disk encryption, rotasi kunci menyeluruh.
- AI privat: VPS terpisah, WireGuard/private networking, fungsi konteks baca terbatas, uji model 50 perintah p95 <10 detik. Uji parser bukan uji model.
- WhatsApp resmi: bukti dokumentasi+mitra tentang coexistence dan semua pesan grup lama, uji nomor cadangan. Tanpa bukti, gerbang gagal. Jangan memakai WhatsApp Web/scraping/notifikasi.
- Mode bayangan 2–4 minggu dan sedikitnya 100 usulan tanpa salah tanggal/lokasi, baru pertimbangkan otomatisasi. Perubahan/pembatalan selalu dikonfirmasi. Tahap ini boleh tidak pernah dijalankan.

## Pemeriksaan gerbang WhatsApp, 30 September 2026

Dokumentasi produk [8x8 tentang coexistence](https://developer.8x8.com/connect/docs/whatsapp/whatsapp-business-app-coexistence/) menyatakan chat grup tidak disinkronkan melalui platform. Akses langsung ke halaman dokumentasi Meta tentang coexistence dan Groups API pada sesi ini mendapat HTTP 429; belum ada konfirmasi tertulis khusus nomor Dokter dari mitra. Karena persyaratan cakupan semua pesan grup lama belum terbukti, gerbang tetap tidak lulus dan tahap pemantauan otomatis dihentikan. Nomor praktik belum di-onboard atau diubah.
