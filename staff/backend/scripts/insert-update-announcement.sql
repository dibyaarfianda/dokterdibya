-- Update announcement with all latest updates (March 22, 2026)
-- Usage: mysql -u root dibyaklinik < insert-update-announcement.sql

USE dibyaklinik;

UPDATE announcements SET
    title = '🎉 Pembaruan Portal Pasien - Maret 2026',
    message = 'Kami telah merilis 9 pembaruan untuk meningkatkan pengalaman Anda, termasuk sistem badge dokumen baru dan perbaikan Album USG!',
    formatted_content = '<h3>Pembaruan Terbaru Portal Dokter Dibya</h3><p>Kami dengan senang hati mengumumkan beberapa perbaikan penting untuk portal pasien Anda:</p><h4>🔔 Sistem Notifikasi Dokumen Baru</h4><ul><li><strong>Badge per Sub-menu Dokumen</strong> — Sekarang Anda bisa melihat jumlah dokumen baru di setiap sub-menu: Album USG, Hasil Lab, dan Resume Medis. Tidak perlu menebak lagi mana yang belum dibaca!</li><li><strong>Badge Otomatis Hilang</strong> — Setelah Anda membuka dan melihat dokumen, tanda "BARU" langsung hilang tanpa perlu refresh halaman</li><li><strong>Notifikasi Real-time</strong> — Saat dokter mengirim dokumen baru, badge langsung muncul secara otomatis tanpa perlu reload</li><li><strong>Auto-Refresh Saat Kembali</strong> — Badge otomatis diperbarui saat Anda kembali ke halaman menu dari halaman lain</li></ul><h4>📸 Perbaikan Album USG</h4><ul><li><strong>Loading Lebih Cepat</strong> — Foto USG sekarang dapat dimuat dengan lebih cepat dan stabil</li><li><strong>Tanda "BARU" pada Foto</strong> — Foto USG yang belum pernah dilihat ditandai dengan label BARU, dan hilang otomatis setelah dibuka</li></ul><h4>⚡ Optimasi Performa</h4><ul><li><strong>Smart Caching</strong> — Portal menggunakan smart caching untuk loading yang lebih baik</li><li><strong>Update Otomatis</strong> — Service worker dioptimalkan agar update terbaru langsung tersedia tanpa hard reset</li><li><strong>Pesan Error Lebih Jelas</strong> — Jika ada masalah, pesan error yang lebih detail akan muncul untuk membantu kami memperbaikinya</li></ul><p><strong>Apa yang perlu Anda lakukan?</strong></p><p>Cukup reload halaman atau buka kembali aplikasi. Semua update akan langsung berlaku!</p><p>Terima kasih telah menggunakan Portal Dokter Dibya 🙏</p>',
    created_at = NOW()
WHERE id = 20;

SELECT 'Announcement berhasil diupdate!' as status;
SELECT id, title, priority, status, created_at FROM announcements WHERE id = 20;
