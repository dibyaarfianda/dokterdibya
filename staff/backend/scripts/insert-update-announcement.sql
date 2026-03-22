-- Insert announcement about latest updates (March 21, 2026)
-- Usage: mysql -u root dibyaklinik < insert-update-announcement.sql

USE dibyaklinik;

INSERT INTO announcements (
    title,
    message,
    formatted_content,
    content_type,
    created_by,
    created_by_name,
    priority,
    status,
    created_at
) VALUES (
    '🎉 Pembaruan Portal Pasien - Perbaikan Album USG & Performa',
    'Kami telah merilis 5 pembaruan untuk meningkatkan pengalaman Anda. Silakan reload portal untuk mendapatkan update terbaru!',
    '<h3>Pembaruan Terbaru Portal Dokter Dibya</h3><p>Kami dengan senang hati mengumumkan beberapa perbaikan penting untuk portal pasien Anda:</p><ul><li><strong>✅ Perbaikan Album USG</strong> - Foto USG sekarang dapat dimuat dengan lebih cepat dan stabil</li><li><strong>⚡ Optimasi Performa</strong> - Portal sekarang menggunakan smart caching untuk loading yang lebih baik</li><li><strong>🔧 Pesan Error yang Lebih Jelas</strong> - Jika ada masalah, Anda akan melihat pesan yang lebih detail untuk membantu kami</li><li><strong>📱 Dukungan PWA Lebih Baik</strong> - Service worker dioptimalkan untuk update otomatis tanpa perlu hard reset</li><li><strong>🚀 Performa Cache Ditingkatkan</strong> - Data cache secara otomatis diperbarui dengan versi terbaru</li></ul><p><strong>Apa yang perlu Anda lakukan?</strong></p><p>Cukup reload halaman (tekan F5) atau buka kembali aplikasi. Semua update akan langsung berlaku!</p><p>Terima kasih telah menggunakan Portal Dokter Dibya. Kami terus berinovasi untuk memberikan layanan terbaik.</p>',
    'html',
    'system',
    'Sistem Dokter Dibya',
    'urgent',
    'active',
    NOW()
);

SELECT 'Announcement berhasil dibuat!' as status;
SELECT * FROM announcements ORDER BY id DESC LIMIT 1;
