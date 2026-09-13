# Pembatalan invoice belum dibayar

Dokter/superadmin membuka tagihan utama atau tambahan, memilih **Batalkan Invoice**, mengisi alasan, lalu mengonfirmasi invoice, pasien, dan nilai yang ditampilkan. Invoice tambahan dibatalkan sendiri; invoice induk tidak ikut berubah.

Invoice batal menyimpan nomor, nilai awal, item, petugas, waktu WIB, alasan, dan snapshot audit. Invoice tidak bisa diubah, dilunasi, diaktifkan kembali, atau dihapus melalui penghapusan MR/pasien. Cetakan invoice berikutnya bertanda BATAL dan memakai objek R2 terpisah; etiket hanya bisa diambil dari berkas asli yang sudah ada.

Invoice batal tidak masuk tagihan aktif atau penerimaan. Rekap dan snapshot tutup buku menyimpan jumlah serta nilai pembatalan secara terpisah. Tanggal yang sudah ditutup tetap terkunci. Repo saat implementasi ini belum memiliki fitur membuka kembali tutup buku; fitur tersebut tidak ditambahkan oleh perubahan ini.

## Pembayaran

- Pembatalan ditolak bila ada pembayaran, pengurangan stok, atau bukti yang memerlukan rekonsiliasi.
- Status lokal pembayaran online bukan bukti pembatalan di penyedia. Semua percobaan online diperiksa; status aktif/tidak pasti menahan pembatalan.
- Percobaan pembayaran disimpan beserta referensi callback sebelum permintaan dikirim ke penyedia, sehingga timeout tidak menghilangkan jejak percobaan.
- Pembayaran yang datang setelah pembatalan tetap disimpan sebagai bukti pembayaran dengan `reconciliation_required`, tanpa mengubah status invoice, MR, atau stok. Tutup buku menampilkan kebutuhan rekonsiliasi.
- Permintaan asuransi internal yang sudah dibatalkan/gagal dapat dilewati bila tidak memiliki bukti pembayaran; permintaan tertunda tetap menahan pembatalan.

## API dan migrasi

`POST /api/sunday-clinic/billing/:mrId/cancel` dan `POST /api/sunday-clinic/billing/:mrId/additional/:additionalBillingId/cancel` menerima `{ "reason": "alasan pembatalan" }`. Hak dokter/superadmin diperiksa di backend. Percobaan berulang mengembalikan status yang sama tanpa audit kedua. Alasan wajib berisi 1–2000 karakter setelah trim.

Jalankan `staff/backend/migrations/20260913_cancel_unpaid_sunday_clinic_billings.sql` sebelum memulai ulang backend. Migrasi menambahkan status/metadata pembatalan dan flag rekonsiliasi, tanpa membatalkan invoice lama. Migrasi dapat dijalankan ulang pada MariaDB produksi.

## Verifikasi

Tes regresi mencakup hak akses, transaksi/audit, retry, pembayaran online tidak pasti, asuransi, callback terlambat, larangan mutasi/penghapusan, penyimpanan dokumen asli, UI staf/pasien, dan snapshot tutup buku. Uji produksi menggunakan identitas QA terpisah dan tanggal kosong, lalu membersihkan fixture serta objek R2 QA. Tidak ada tagihan pasien nyata yang dibatalkan otomatis.
