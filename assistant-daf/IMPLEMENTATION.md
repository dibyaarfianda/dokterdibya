# Asisten DAF — rilis manual dan Diskusi AI, 1 Oktober 2026

## Rancangan pemantauan Android terbatas (persetujuan 1 Oktober 2026)

Dokter mengubah batas rencana untuk menerima pemantauan otomatis **terbatas** dari ponsel Android cadangan yang ditautkan ke WhatsApp Business. Pembacaan dilakukan oleh aplikasi pendamping Android terpisah melalui izin akses pemberitahuan. Ini bukan Cloud API resmi dan tidak menjamin seluruh pesan terbaca. Dokter tetap menentukan chat yang dipantau, menerima atau mengoreksi tiap usulan, serta mempertahankan ruang Diskusi AI nonaktif.

Tab Pemantauan di PWA menghasilkan kode pemasangan 10 menit, menampilkan perangkat dan chat yang ditemukan, dan mengizinkan Dokter memilih chat. Pembaca Android hanya mengirim metadata chat sebelum chat dipilih. Isi pemberitahuan dikirim melalui HTTPS setelah server mengonfirmasi bahwa chat masih dipilih. Bila WhatsApp tidak memberikan identitas percakapan yang stabil melalui notification shortcut ID, pesan dibuang. Pemberitahuan yang tidak muncul, terpotong, atau tergabung tidak dapat direkonstruksi. Status koneksi perangkat terlihat, tetapi status online bukan bukti tidak ada pesan terlewat.

Server menyimpan isi sumber sebagai payload AES-GCM maksimal 30 hari, membuat usulan, dan meninjau secara asinkron dengan RunPod melalui sakelar `ASSISTANT_DAF_RUNPOD_REVIEW_ENABLED` yang terpisah dari sakelar Diskusi AI. AI hanya mengklasifikasi maksud dan memberi alasan pendek; tanggal, jam, lokasi, identitas pasien, dan penulisan jadwal tetap melewati parser serta konfirmasi yang sudah ada. Setiap pesan chat terpilih tetap terlihat sebagai usulan, termasuk ketika AI menganggapnya bukan jadwal atau gagal merespons. Memori keputusan hanya berisi kategori tindakan, lokasi, jenis tindakan jadwal, dan jumlah keputusan dari persetujuan/koreksi Dokter; tidak berisi teks pesan, nama, atau nomor RM. Dokter dapat menghapusnya.

**Gerbang aktivasi:** menerapkan migrasi `20261001_assistant_daf_monitor.sql`, memasang APK rilis bertanda tangan pada ponsel cadangan, menautkan WhatsApp Business dengan ponsel utama, memberikan izin pemberitahuan, memasangkan ponsel ke PWA, dan memilih chat. Pada perangkat nyata harus dibuktikan bahwa WhatsApp Business mengisi shortcut ID yang stabil untuk chat yang hendak dipantau; bila tidak, chat tersebut tidak dapat dipantau melalui rancangan ini. Sebelum verifikasi perangkat nyata dan pilihan chat, klaim pemantauan aktif dilarang. Kunci penandatanganan rilis disimpan di luar repositori; APK debug dari build awal hanya untuk pilot tanpa data pasien.

## Batas rilis

PWA `/assistant-daf/` menggunakan passkey, menerima satu pesan pilihan Dokter, membuat usulan terenkripsi, dan meminta konfirmasi sebelum menulis ke DocBoard. Pesan pada alur berbagi manual tidak dikirim ke model AI. Saat Diskusi AI diaktifkan kelak, hanya pertanyaan yang sengaja dikirim dari ruang itu yang diproses oleh RunPod. Pemantauan WhatsApp otomatis, mode bayangan, dan penulisan otomatis tetap nonaktif.

RunPod Serverless disiapkan untuk inferensi terpisah dari server COMM. Integrasi konteks hanya pemeriksaan identitas pasien melalui COMM pada alur konfirmasi jadwal; Diskusi AI belum membaca jadwal, COMM, atau DOKTERDIBYA secara langsung.

## Konektor RunPod Flex

`staff/backend/services/AssistantDafRunpodClient.js` memanggil endpoint Serverless milik Dokter pada host tetap `api.runpod.ai`. Rute `/api/assistant-daf/ai/discuss` memerlukan sesi passkey dan dibatasi enam permintaan per menit. Ia mengirim hanya teks pertanyaan yang dimasukkan Dokter, mengembalikan jawaban teks terbatas, dan tidak menulis jadwal. Perintah yang hendak dijadikan usulan dibuat dari teks Dokter melalui alur draft terpisah, lalu harus dikonfirmasi. Klasifikasi terbatas yang sudah ada belum mengendalikan usulan, tanggal, jam, lokasi, atau identitas pasien.

Aktivasi memerlukan endpoint ID, nama model, dan kunci di luar repositori, serta **kedua** gerbang `ASSISTANT_DAF_RUNPOD_ENABLED=1` dan `ASSISTANT_DAF_RUNPOD_DATA_CONSENT=1`. Dokter telah mengizinkan pemrosesan pihak ketiga, termasuk kemungkinan di luar Indonesia. Tidak ada penyamaran otomatis pada pertanyaan Diskusi AI: teks pasien yang sengaja diketik ikut terkirim. Jangan menempelkan rekam medis lengkap. Periksa biaya dan latensi pada RunPod; status "siap" hanya berarti konfigurasi tersedia, bukan jaminan model selalu menjawab.

Ini bukan bukti ketepatan model untuk mengenali tanggal, lokasi, atau identitas. Jawaban AI tetap saran dan tidak boleh dipakai sebagai konfirmasi klinis atau jadwal.

**Status produksi 1 Oktober 2026:** kode, halaman, dan kunci di file root-only sudah terpasang, tetapi `ASSISTANT_DAF_RUNPOD_ENABLED=0`. Dokter memilih agar Diskusi AI tetap nonaktif. Permintaan sintetis pertama tertahan di antrean; setelah pekerja idle yang macet disegarkan, model mulai sekitar 169 detik dan permintaan berikutnya berhasil. Panggilan OpenAI langsung yang sederhana menjawab sekitar 4 detik, sedangkan pertanyaan jadwal melalui konektor aplikasi sekitar 18 detik. Keduanya tidak membuktikan target p95 <10 detik pada 50 perintah. Dua permintaan awal dan satu permintaan diagnosis yang tertahan telah dibatalkan. Jangan menyimpulkan `private_ai_ready=true` hanya dari tersedianya kunci; uji respons nyata tetap diperlukan setelah perubahan endpoint.

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
- AI dengan konteks klinis: fungsi konteks baca terbatas, uji model 50 perintah p95 <10 detik. Diskusi RunPod saat ini belum memakai konteks klinis; uji parser bukan uji model.
- WhatsApp resmi: bukti dokumentasi+mitra tentang coexistence dan semua pesan grup lama, uji nomor cadangan. Tanpa bukti, gerbang resmi gagal. Larangan notifikasi pada rencana awal diganti oleh keputusan Dokter 1 Oktober 2026 untuk pemantauan Android terbatas, dengan batas dan gerbang aktivasi di atas.
- Mode bayangan 2–4 minggu dan sedikitnya 100 usulan tanpa salah tanggal/lokasi, baru pertimbangkan otomatisasi. Perubahan/pembatalan selalu dikonfirmasi. Tahap ini boleh tidak pernah dijalankan.

## Pemeriksaan gerbang WhatsApp, 30 September 2026

Dokumentasi produk [8x8 tentang coexistence](https://developer.8x8.com/connect/docs/whatsapp/whatsapp-business-app-coexistence/) menyatakan chat grup tidak disinkronkan melalui platform. Akses langsung ke halaman dokumentasi Meta tentang coexistence dan Groups API pada sesi ini mendapat HTTP 429; belum ada konfirmasi tertulis khusus nomor Dokter dari mitra. Karena persyaratan cakupan semua pesan grup lama belum terbukti, gerbang tetap tidak lulus dan tahap pemantauan otomatis dihentikan. Nomor praktik belum di-onboard atau diubah.
