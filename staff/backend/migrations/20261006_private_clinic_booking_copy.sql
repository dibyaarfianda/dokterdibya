-- Generalize private clinic booking copy for Saturday and Sunday sessions.

SET NAMES utf8mb4;

START TRANSACTION;

UPDATE support_faq SET answer = '🕐 *Jadwal Praktik*

*RSUD GAMBIRAN*
• SELASA: 08.30-11.00
• RABU: 08.30-11.00

*RSIA MELINDA*
• SENIN: 18.30-20.00
• KAMIS: 18.30-20.00
• JUMAT: 18.30-20.00

*RS BHAYANGKARA*
• SABTU: 10.00-13.00

*KLINIK PRIVAT*
• Lihat tanggal dan jam praktik yang tersedia di menu Booking Klinik Privat.' WHERE JSON_SEARCH(keywords, 'one', 'jam praktik') IS NOT NULL;

UPDATE support_faq SET answer = '📋 *Cara Booking Klinik Privat*

Pilih menu **Booking Klinik Privat**, pilih tanggal praktik yang tersedia, pilih jam, pilih jenis konsultasi, isi keluhan yang dirasakan, lalu konfirmasi booking.

Untuk konfirmasi kehadiran, ikuti petunjuk dan batas waktu yang tertera pada jadwal atau notifikasi booking Anda.' WHERE JSON_SEARCH(keywords, 'one', 'cara booking') IS NOT NULL;

UPDATE support_faq SET answer = '💰 *Biaya/Tarif*

Biaya tergantung lokasi dan tindakan. Untuk update biaya, hubungi klinik/staff saat booking.

Klinik Privat tidak menerima BPJS.' WHERE JSON_SEARCH(keywords, 'one', 'biaya') IS NOT NULL;

UPDATE support_faq SET answer = '✅ *Cara Konfirmasi Kehadiran Klinik Privat:*

1. Buka menu **Booking Klinik Privat** atau **Riwayat Booking**
2. Pilih jadwal konsultasi Anda
3. Tekan **Konfirmasi Hadir**

Ikuti petunjuk dan batas waktu yang tertera pada jadwal atau notifikasi booking Anda.' WHERE JSON_SEARCH(keywords, 'one', 'konfirmasi hadir') IS NOT NULL;

COMMIT;
