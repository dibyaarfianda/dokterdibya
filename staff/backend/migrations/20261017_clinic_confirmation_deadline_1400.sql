-- Preserve the existing announcement and its publication settings; update only
-- the obsolete deadline and the claim that same-day rebooking stays open after expiry.
UPDATE announcements
SET message = REPLACE(
    REPLACE(message, 'pukul 09.00', 'pukul 14.00'),
    'slot akan hangus otomatis dan dibuka untuk pasien lain',
    'jadwal akan dibatalkan otomatis. Silakan hubungi staff klinik jika memerlukan bantuan'
)
WHERE title = 'Konfirmasi Kehadiran Wajib untuk Jadwal Minggu'
  AND message LIKE '%pukul 09.00%';
