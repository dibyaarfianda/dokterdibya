/**
 * Support Chat Route - Patient Help Chat with Bot + Staff Escalation
 * Floating chat widget for patient portal. Bot answers FAQ first,
 * escalates to staff via Socket.IO when bot can't answer.
 */

const express = require('express');
const db = require('../db');
const { verifyToken, verifyPatientToken } = require('../middleware/auth');

const router = express.Router();

// Temporary rollout guard: expose support chat only to selected patient accounts.
const SUPPORT_CHAT_ALLOWED_PATIENT_IDS = new Set([
    'P2025091' // Nanda Ananda
]);

function ensureSupportChatAllowed(req, res, next) {
    const patientId = String(req.user && req.user.id ? req.user.id : '').trim();
    if (SUPPORT_CHAT_ALLOWED_PATIENT_IDS.has(patientId)) {
        return next();
    }

    return res.status(403).json({
        success: false,
        message: 'Fitur chat bantuan belum tersedia untuk akun ini'
    });
}

// ===================== SCHEMA MIGRATION =====================
let schemaReady = false;
let schemaPromise = null;

async function ensureSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        const ensureColumn = async (tableName, columnName, definition) => {
            const [rows] = await db.query(
                `SELECT 1
                 FROM information_schema.columns
                 WHERE table_schema = DATABASE()
                   AND table_name = ?
                   AND column_name = ?
                 LIMIT 1`,
                [tableName, columnName]
            );

            if (rows.length === 0) {
                await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
            }
        };

        const ensureIndex = async (tableName, indexName, ddl) => {
            const [rows] = await db.query(
                `SELECT 1
                 FROM information_schema.statistics
                 WHERE table_schema = DATABASE()
                   AND table_name = ?
                   AND index_name = ?
                 LIMIT 1`,
                [tableName, indexName]
            );

            if (rows.length === 0) {
                await db.query(ddl);
            }
        };

        // support_faq table
        await db.query(`
            CREATE TABLE IF NOT EXISTS support_faq (
                id INT AUTO_INCREMENT PRIMARY KEY,
                keywords JSON NOT NULL,
                answer TEXT NOT NULL,
                category VARCHAR(60) NOT NULL DEFAULT 'umum',
                priority INT NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_active (is_active, priority)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // support_chat_sessions table
        await db.query(`
            CREATE TABLE IF NOT EXISTS support_chat_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                patient_id VARCHAR(64) NOT NULL,
                patient_name VARCHAR(255) NOT NULL DEFAULT '',
                status ENUM('bot','escalated','resolved') NOT NULL DEFAULT 'bot',
                assigned_staff_id VARCHAR(64) NULL,
                assigned_staff_name VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_patient (patient_id, status),
                INDEX idx_status (status, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await ensureColumn(
            'support_chat_sessions',
            'resolved_at',
            'resolved_at DATETIME NULL AFTER assigned_staff_name'
        );
        await ensureColumn(
            'support_chat_sessions',
            'resolved_by_staff_id',
            'resolved_by_staff_id VARCHAR(64) NULL AFTER resolved_at'
        );
        await ensureColumn(
            'support_chat_sessions',
            'resolved_by_staff_name',
            'resolved_by_staff_name VARCHAR(255) NULL AFTER resolved_by_staff_id'
        );

        await ensureIndex(
            'support_chat_sessions',
            'idx_patient_resolved',
            'CREATE INDEX idx_patient_resolved ON support_chat_sessions (patient_id, status, updated_at)'
        );

        // support_chat_messages table
        await db.query(`
            CREATE TABLE IF NOT EXISTS support_chat_messages (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                sender_type ENUM('patient','bot','staff') NOT NULL,
                sender_name VARCHAR(255) NOT NULL DEFAULT '',
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_session (session_id, created_at),
                CONSTRAINT fk_support_messages_session
                    FOREIGN KEY (session_id) REFERENCES support_chat_sessions(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // support_chat_ratings table
        await db.query(`
            CREATE TABLE IF NOT EXISTS support_chat_ratings (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                session_id INT NOT NULL,
                patient_id VARCHAR(64) NOT NULL,
                staff_id VARCHAR(64) NULL,
                staff_name VARCHAR(255) NULL,
                rating TINYINT UNSIGNED NOT NULL,
                feedback TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_support_chat_ratings_session (session_id),
                INDEX idx_support_chat_ratings_patient (patient_id, created_at),
                INDEX idx_support_chat_ratings_staff (staff_id, created_at),
                CONSTRAINT fk_support_chat_ratings_session
                    FOREIGN KEY (session_id) REFERENCES support_chat_sessions(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Seed FAQ if empty
        const [faqCount] = await db.query('SELECT COUNT(*) as cnt FROM support_faq');
        if (faqCount[0].cnt === 0) {
            await seedFAQ();
        }

        // Keep critical FAQ responses synchronized even on existing databases.
        await syncRevisedFaqAnswers();

        schemaReady = true;
    })();

    return schemaPromise;
}

async function seedFAQ() {
    const faqs = [
        {
            keywords: ['jam praktik', 'jadwal dokter', 'jadwal praktik', 'jam buka', 'kapan buka', 'jam berapa', 'praktek', 'jadwal'],
            answer: '🕐 *Jadwal Praktik*\n\n*RSUD GAMBIRAN*\n• SELASA: 08.30-11.00\n• RABU: 08.30-11.00\n\n*RSIA MELINDA*\n• SENIN: 18.30-20.00\n• KAMIS: 18.30-20.00\n• JUMAT: 18.30-20.00\n\n*RS BHAYANGKARA*\n• SABTU: 10.00-13.00\n\n*PRAKTEK PRIBADI (POLI RSIA MELINDA)*\n• MINGGU: 09.00-16.00',
            category: 'jadwal',
            priority: 10
        },
        {
            keywords: ['cara booking', 'cara daftar', 'cara pesan', 'daftar konsultasi', 'buat janji', 'booking', 'daftar antrian', 'mau periksa', 'pesan slot', 'reservasi'],
            answer: '📋 *Cara Booking*\n\nPilih menu Booking, pilih tanggal, pilih jam, pilih jenis konsultasi, isi keluhan yang dirasakan, lalu konfirmasi.\n\nSelanjutnya akan ada 2x konfirmasi yaitu pukul 18.00 hari Sabtu dan pukul 05.00 WIB hari Minggu.\n\nJika sampai pukul 09.00 hari Minggu tidak ada konfirmasi, booking hangus.',
            category: 'booking',
            priority: 10
        },
        {
            keywords: ['konfirmasi hadir', 'konfirmasi kehadiran', 'konfirmasi minggu', 'slot hangus', 'expired', 'konfirmasi'],
            answer: '✅ *Cara Konfirmasi Kehadiran (Klinik Minggu):*\n\nSetiap Sabtu malam Anda akan mendapat pesan WhatsApp untuk konfirmasi kehadiran hari Minggu.\n\n⏰ **Deadline: Minggu pukul 05.00 WIB**\n\nJika belum konfirmasi:\n1. Buka menu **Booking**\n2. Pilih jadwal hari Minggu\n3. Tekan **Konfirmasi Hadir**',
            category: 'booking',
            priority: 9
        },
        {
            keywords: ['batal booking', 'batalkan', 'cancel booking', 'batalkan janji', 'tidak jadi periksa', 'mau batal'],
            answer: '❌ *Batal Booking*\n\nMasuk ke menu **Riwayat Booking**, pilih jadwal yang ingin dibatalkan, lalu tekan **Batalkan**.',
            category: 'booking',
            priority: 8
        },
        {
            keywords: ['download usg', 'lihat usg', 'foto usg', 'gambar usg', 'album usg', 'hasil usg', 'usg'],
            answer: '🖼️ *Cara Melihat & Download Foto USG:*\n\n1. Dari menu utama, pilih **Dokumen**\n2. Pilih **Album USG**\n3. Foto USG tersedia setelah dokter mengunggah\n4. Tekan foto untuk melihat ukuran penuh\n5. Tekan ikon unduh untuk menyimpan\n\nFoto tersedia selama 90 hari setelah kunjungan.',
            category: 'dokumen',
            priority: 8
        },
        {
            keywords: ['hasil lab', 'download lab', 'lihat lab', 'hasil laboratorium', 'lab', 'laboratorium'],
            answer: '🔬 *Cara Melihat Hasil Lab:*\n\n1. Dari menu utama, pilih **Dokumen**\n2. Pilih **Hasil Lab**\n3. Pilih tanggal pemeriksaan\n4. Tekan untuk membuka PDF hasil lab\n\nJika hasil belum tersedia, hubungi klinik.',
            category: 'dokumen',
            priority: 8
        },
        {
            keywords: ['reset password', 'lupa password', 'ganti password', 'ubah password', 'lupa kata sandi', 'password', 'sandi'],
            answer: '🔑 *Cara Reset Password:*\n\n1. Di halaman login, tekan **Lupa Password**\n2. Masukkan email yang terdaftar\n3. Cek email untuk link reset (berlaku 30 menit)\n4. Buat password baru\n\nJika tidak menerima email, cek folder spam atau hubungi staff kami.',
            category: 'akun',
            priority: 7
        },
        {
            keywords: ['biaya', 'tarif', 'harga', 'berapa biaya', 'bayar berapa', 'konsultasi berapa', 'biaya periksa', 'harga konsultasi'],
            answer: '💰 *Biaya/Tarif*\n\nBiaya tergantung lokasi dan tindakan. Untuk update biaya, hubungi klinik/staff saat booking.\n\nPraktek Minggu tidak menerima BPJS.',
            category: 'biaya',
            priority: 7
        },
        {
            keywords: ['kelas hamil', 'kelas ibu hamil', 'senam hamil', 'birth class', 'kelas melahirkan', 'kelas'],
            answer: '🤱 *Kelas Dr. Dibya (Kelas Ibu Hamil):*\n\n1. Dari menu utama, pilih **Kelas Dr. Dibya**\n2. Lihat jadwal kelas yang tersedia\n3. Daftar langsung dari aplikasi\n\nKelas meliputi: persiapan persalinan, laktasi, dan perawatan bayi baru lahir.',
            category: 'kelas',
            priority: 7
        },
        {
            keywords: ['riwayat kunjungan', 'riwayat periksa', 'riwayat rekam medis', 'rekam medis', 'riwayat', 'history'],
            answer: '📁 *Cara Melihat Riwayat Kunjungan:*\n\n1. Dari menu utama, pilih **Riwayat**\n2. Pilih kunjungan yang ingin dilihat\n3. Detail kunjungan, diagnosa, dan resep akan tampil\n\nRiwayat tersedia untuk kunjungan di semua lokasi.',
            category: 'riwayat',
            priority: 6
        },
        {
            keywords: ['tanya dokter', 'tanya jawab', 'konsultasi online', 'tanya', 'konsultasi chat', 'bertanya', 'pertanyaan medis'],
            answer: '💬 *Fitur Tanya Dokter:*\n\nAnda bisa mengajukan pertanyaan medis kepada dr. Dibya secara langsung.\n\n• **Free:** 1 pertanyaan per minggu\n• **Premium:** lebih banyak pertanyaan\n\nCara akses: Menu utama → **Tanya Dokter**',
            category: 'tanya',
            priority: 6
        },
        {
            keywords: ['lokasi', 'alamat', 'dimana', 'letak klinik', 'klinik mana', 'google maps', 'di mana'],
            answer: '📍 *Lokasi Klinik:*\n\n• **Klinik Privat dr. Dibya:** Kediri\n• **RSIA Melinda:** Kediri\n• **RSUD Gambiran:** Kediri\n• **RS Bhayangkara:** Kediri\n\nUntuk petunjuk arah, tekan "Hubungi Kami" di menu Bantuan.',
            category: 'lokasi',
            priority: 5
        },
        {
            keywords: ['update profil', 'ganti nomor', 'ubah data', 'edit profil', 'nomor hp', 'profil'],
            answer: '👤 *Cara Update Profil:*\n\n1. Tekan foto profil di pojok kanan atas\n2. Pilih **Edit Profil**\n3. Ubah data yang diperlukan\n4. Tekan **Simpan**\n\nUntuk perubahan data medis penting, hubungi staff klinik.',
            category: 'akun',
            priority: 5
        },
        {
            keywords: ['kick counter', 'gerak bayi', 'hitung tendangan', 'tendangan bayi', 'gerakan janin'],
            answer: '👶 *Fitur Kick Counter (Hitung Gerak Bayi):*\n\n1. Dari menu utama, pilih **Kick Counter**\n2. Tekan tombol setiap kali bayi bergerak\n3. Catat minimal 10 gerakan dalam 2 jam\n\nHubungi dokter jika bayi kurang dari 10 gerakan dalam 2 jam.',
            category: 'fitur',
            priority: 5
        },
        {
            keywords: ['notifikasi', 'notif', 'aktifkan notif', 'push notification'],
            answer: '🔔 *Cara Mengaktifkan Notifikasi:*\n\n1. Dari menu utama, pilih **Pengingat**\n2. Tekan **Aktifkan Notifikasi**\n3. Izinkan notifikasi di browser/app\n\nNotifikasi akan memberitahu Anda untuk konfirmasi kehadiran dan reminder janji.',
            category: 'fitur',
            priority: 4
        },
        {
            keywords: ['daftar akun', 'registrasi', 'buat akun', 'signup', 'mendaftar', 'bergabung', 'pasien baru'],
            answer: '📝 *Cara Mendaftar Sebagai Pasien Baru:*\n\n1. Buka halaman utama portal\n2. Tekan **Daftar**\n3. Masukkan kode registrasi (dapatkan dari klinik)\n4. Isi data diri\n5. Verifikasi email\n\nKode registrasi bisa diperoleh saat berkunjung ke klinik.',
            category: 'akun',
            priority: 5
        }
    ];

    for (const faq of faqs) {
        await db.query(
            `INSERT INTO support_faq (keywords, answer, category, priority) VALUES (?, ?, ?, ?)`,
            [JSON.stringify(faq.keywords), faq.answer, faq.category, faq.priority]
        );
    }
}

async function syncRevisedFaqAnswers() {
    const scheduleAnswer = '🕐 *Jadwal Praktik*\n\n*RSUD GAMBIRAN*\n• SELASA: 08.30-11.00\n• RABU: 08.30-11.00\n\n*RSIA MELINDA*\n• SENIN: 18.30-20.00\n• KAMIS: 18.30-20.00\n• JUMAT: 18.30-20.00\n\n*RS BHAYANGKARA*\n• SABTU: 10.00-13.00\n\n*PRAKTEK PRIBADI (POLI RSIA MELINDA)*\n• MINGGU: 09.00-16.00';
    const bookingAnswer = '📋 *Cara Booking*\n\nPilih menu Booking, pilih tanggal, pilih jam, pilih jenis konsultasi, isi keluhan yang dirasakan, lalu konfirmasi.\n\nSelanjutnya akan ada 2x konfirmasi yaitu pukul 18.00 hari Sabtu dan pukul 05.00 WIB hari Minggu.\n\nJika sampai pukul 09.00 hari Minggu tidak ada konfirmasi, booking hangus.';
    const cancelAnswer = '❌ *Batal Booking*\n\nMasuk ke menu **Riwayat Booking**, pilih jadwal yang ingin dibatalkan, lalu tekan **Batalkan**.';
    const feeAnswer = '💰 *Biaya/Tarif*\n\nBiaya tergantung lokasi dan tindakan. Untuk update biaya, hubungi klinik/staff saat booking.\n\nPraktek Minggu tidak menerima BPJS.';

    await db.query(
        `UPDATE support_faq
         SET answer = ?
         WHERE JSON_SEARCH(keywords, 'one', 'jam praktik') IS NOT NULL`,
        [scheduleAnswer]
    );

    await db.query(
        `UPDATE support_faq
         SET answer = ?
         WHERE JSON_SEARCH(keywords, 'one', 'cara booking') IS NOT NULL`,
        [bookingAnswer]
    );

    await db.query(
        `UPDATE support_faq
         SET answer = ?
         WHERE JSON_SEARCH(keywords, 'one', 'batal booking') IS NOT NULL`,
        [cancelAnswer]
    );

    await db.query(
        `UPDATE support_faq
         SET answer = ?
         WHERE JSON_SEARCH(keywords, 'one', 'biaya') IS NOT NULL`,
        [feeAnswer]
    );
}

// ===================== BOT ENGINE =====================
async function findBestFAQ(message) {
    const [faqs] = await db.query(
        'SELECT id, keywords, answer, category FROM support_faq WHERE is_active = 1 ORDER BY priority DESC'
    );

    const normalMsg = message.toLowerCase().trim();

    let bestScore = 0;
    let bestFaq = null;

    for (const faq of faqs) {
        let keywords;
        try {
            keywords = typeof faq.keywords === 'string' ? JSON.parse(faq.keywords) : faq.keywords;
        } catch (e) {
            continue;
        }

        let score = 0;
        for (const kw of keywords) {
            if (normalMsg.includes(kw.toLowerCase())) {
                // Longer keyword match = higher score
                score += kw.length;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestFaq = faq;
        }
    }

    // Minimum score threshold: at least 3 chars matched
    return bestScore >= 3 ? bestFaq : null;
}

// ===================== PATIENT ROUTES =====================

// POST /api/support-chat/sessions — get or create active session
router.post('/sessions', verifyPatientToken, ensureSupportChatAllowed, async (req, res) => {
    try {
        await ensureSchema();

        const patientId = String(req.user.id);
        const patientName = req.user.name || req.user.full_name || 'Pasien';

        // Look for existing non-resolved session
        const [existing] = await db.query(
            `SELECT id, status, assigned_staff_id, assigned_staff_name, created_at
             FROM support_chat_sessions
             WHERE patient_id = ? AND status != 'resolved'
             ORDER BY created_at DESC
             LIMIT 1`,
            [patientId]
        );

        if (existing.length > 0) {
            const session = existing[0];
            const [messages] = await db.query(
                `SELECT id, sender_type, sender_name, content, created_at
                 FROM support_chat_messages
                 WHERE session_id = ?
                 ORDER BY created_at ASC`,
                [session.id]
            );
            return res.json({ success: true, session: { ...session, messages } });
        }

        // Create new session
        const [result] = await db.query(
            `INSERT INTO support_chat_sessions (patient_id, patient_name, status) VALUES (?, ?, 'bot')`,
            [patientId, patientName]
        );

        const sessionId = result.insertId;

        // Insert bot greeting
        const greeting = `Halo ${patientName}! 👋\n\nSaya asisten virtual dokterDIBYA. Ada yang bisa saya bantu?\n\nAnda bisa tanya tentang:\n• Jadwal praktik dokter\n• Cara booking & konfirmasi\n• Download foto USG & hasil lab\n• Informasi biaya\n• Dan lainnya\n\nKetik pertanyaan Anda!`;

        await db.query(
            `INSERT INTO support_chat_messages (session_id, sender_type, sender_name, content) VALUES (?, 'bot', 'Asisten Virtual', ?)`,
            [sessionId, greeting]
        );

        const [messages] = await db.query(
            `SELECT id, sender_type, sender_name, content, created_at
             FROM support_chat_messages
             WHERE session_id = ?
             ORDER BY created_at ASC`,
            [sessionId]
        );

        return res.json({
            success: true,
            session: {
                id: sessionId,
                status: 'bot',
                assigned_staff_id: null,
                assigned_staff_name: null,
                created_at: new Date(),
                messages
            }
        });

    } catch (err) {
        console.error('[support-chat] sessions error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/support-chat/sessions/current — get active session
router.get('/sessions/current', verifyPatientToken, ensureSupportChatAllowed, async (req, res) => {
    try {
        await ensureSchema();

        const patientId = String(req.user.id);
        const includeRecentResolved = ['1', 'true', 'yes'].includes(String(req.query.include_recent_resolved || '').toLowerCase());

        const [existing] = await db.query(
            `SELECT s.id, s.status, s.assigned_staff_id, s.assigned_staff_name, s.created_at,
                    s.resolved_at, s.resolved_by_staff_id, s.resolved_by_staff_name,
                    r.rating AS rating_score, r.created_at AS rated_at
             FROM support_chat_sessions s
             LEFT JOIN support_chat_ratings r ON r.session_id = s.id
             WHERE s.patient_id = ? AND s.status != 'resolved'
             ORDER BY s.created_at DESC
             LIMIT 1`,
            [patientId]
        );

        let session = existing[0] || null;

        // Optional fallback for active polling: when a session is just resolved,
        // return latest resolved session so client can still pick up closing message + status.
        if (!session && includeRecentResolved) {
            const [resolvedRows] = await db.query(
                `SELECT s.id, s.status, s.assigned_staff_id, s.assigned_staff_name, s.created_at,
                        s.resolved_at, s.resolved_by_staff_id, s.resolved_by_staff_name,
                        r.rating AS rating_score, r.created_at AS rated_at
                 FROM support_chat_sessions s
                 LEFT JOIN support_chat_ratings r ON r.session_id = s.id
                 WHERE s.patient_id = ? AND s.status = 'resolved'
                 ORDER BY s.updated_at DESC
                 LIMIT 1`,
                [patientId]
            );
            session = resolvedRows[0] || null;
        }

        if (!session) {
            return res.json({ success: true, session: null });
        }

        const [messages] = await db.query(
            `SELECT id, sender_type, sender_name, content, created_at
             FROM support_chat_messages
             WHERE session_id = ?
             ORDER BY created_at ASC`,
            [session.id]
        );

        return res.json({ success: true, session: { ...session, messages } });

    } catch (err) {
        console.error('[support-chat] sessions/current error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/support-chat/sessions/archive — rated resolved sessions for current patient
router.get('/sessions/archive', verifyPatientToken, ensureSupportChatAllowed, async (req, res) => {
    try {
        await ensureSchema();

        const patientId = String(req.user.id);
        const reqLimit = parseInt(String(req.query.limit || '20'), 10);
        const limit = Number.isFinite(reqLimit) ? Math.max(1, Math.min(reqLimit, 100)) : 20;

        const [sessions] = await db.query(
            `SELECT s.id,
                    s.created_at,
                    s.updated_at,
                    s.resolved_at,
                    COALESCE(s.resolved_by_staff_name, s.assigned_staff_name, 'Staff') AS staff_name,
                    r.rating,
                    r.created_at AS rated_at,
                    (
                        SELECT sm.content
                        FROM support_chat_messages sm
                        WHERE sm.session_id = s.id
                        ORDER BY sm.id DESC
                        LIMIT 1
                    ) AS last_message
             FROM support_chat_sessions s
             INNER JOIN support_chat_ratings r ON r.session_id = s.id
             WHERE s.patient_id = ?
               AND s.status = 'resolved'
             ORDER BY r.created_at DESC
             LIMIT ?`,
            [patientId, limit]
        );

        return res.json({ success: true, sessions });
    } catch (err) {
        console.error('[support-chat] sessions/archive error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/support-chat/sessions/archive/:id — transcript of a rated resolved session
router.get('/sessions/archive/:id', verifyPatientToken, ensureSupportChatAllowed, async (req, res) => {
    try {
        await ensureSchema();

        const sessionId = parseInt(String(req.params.id || ''), 10);
        if (Number.isNaN(sessionId)) {
            return res.status(400).json({ success: false, message: 'Sesi tidak valid' });
        }

        const patientId = String(req.user.id);

        const [sessions] = await db.query(
            `SELECT s.id,
                    s.patient_id,
                    s.patient_name,
                    s.status,
                    s.assigned_staff_id,
                    s.assigned_staff_name,
                    s.created_at,
                    s.resolved_at,
                    s.resolved_by_staff_id,
                    s.resolved_by_staff_name,
                    r.rating,
                    r.feedback,
                    r.created_at AS rated_at
             FROM support_chat_sessions s
             INNER JOIN support_chat_ratings r ON r.session_id = s.id
             WHERE s.id = ?
               AND s.patient_id = ?
               AND s.status = 'resolved'
             LIMIT 1`,
            [sessionId, patientId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({ success: false, message: 'Arsip tidak ditemukan' });
        }

        const [messages] = await db.query(
            `SELECT id, sender_type, sender_name, content, created_at
             FROM support_chat_messages
             WHERE session_id = ?
             ORDER BY created_at ASC`,
            [sessionId]
        );

        return res.json({ success: true, session: { ...sessions[0], messages } });
    } catch (err) {
        console.error('[support-chat] sessions/archive/:id error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/support-chat/sessions/:id/rating — submit 1-5 rating for resolved session
router.post('/sessions/:id/rating', verifyPatientToken, ensureSupportChatAllowed, async (req, res) => {
    let conn = null;
    try {
        await ensureSchema();

        const sessionId = parseInt(String(req.params.id || ''), 10);
        if (Number.isNaN(sessionId)) {
            return res.status(400).json({ success: false, message: 'Sesi tidak valid' });
        }

        const ratingRaw = parseInt(String(req.body && req.body.rating ? req.body.rating : ''), 10);
        if (!Number.isFinite(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
            return res.status(400).json({ success: false, message: 'Rating harus antara 1 sampai 5' });
        }

        const feedback = req.body && typeof req.body.feedback === 'string'
            ? String(req.body.feedback).trim().slice(0, 2000)
            : null;
        const patientId = String(req.user.id);

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [sessions] = await conn.query(
            `SELECT id,
                    patient_id,
                    status,
                    assigned_staff_id,
                    assigned_staff_name,
                    resolved_by_staff_id,
                    resolved_by_staff_name
             FROM support_chat_sessions
             WHERE id = ?
               AND patient_id = ?
             FOR UPDATE`,
            [sessionId, patientId]
        );

        if (sessions.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        const session = sessions[0];
        if (session.status !== 'resolved') {
            await conn.rollback();
            return res.status(400).json({ success: false, message: 'Sesi belum selesai dan belum dapat dirating' });
        }

        const [existingRatings] = await conn.query(
            `SELECT id, rating, created_at
             FROM support_chat_ratings
             WHERE session_id = ?
             FOR UPDATE`,
            [sessionId]
        );

        if (existingRatings.length > 0) {
            await conn.commit();
            return res.json({
                success: true,
                alreadyRated: true,
                rating: {
                    session_id: sessionId,
                    rating: existingRatings[0].rating,
                    rated_at: existingRatings[0].created_at
                }
            });
        }

        const staffId = String(session.resolved_by_staff_id || session.assigned_staff_id || '').trim() || null;
        const staffName = String(session.resolved_by_staff_name || session.assigned_staff_name || 'Staff').trim();

        await conn.query(
            `INSERT INTO support_chat_ratings (session_id, patient_id, staff_id, staff_name, rating, feedback)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, patientId, staffId, staffName, ratingRaw, feedback]
        );

        await conn.query(
            `UPDATE support_chat_sessions
             SET updated_at = NOW()
             WHERE id = ?`,
            [sessionId]
        );

        await conn.commit();

        return res.json({
            success: true,
            rating: {
                session_id: sessionId,
                rating: ratingRaw,
                rated_at: new Date()
            }
        });
    } catch (err) {
        if (conn) {
            try { await conn.rollback(); } catch (rollbackErr) { /* ignore rollback errors */ }
        }
        console.error('[support-chat] sessions/:id/rating error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// POST /api/support-chat/sessions/:id/message — patient sends a message
router.post('/sessions/:id/message', verifyPatientToken, ensureSupportChatAllowed, async (req, res) => {
    let conn = null;
    try {
        await ensureSchema();

        const sessionId = parseInt(req.params.id, 10);
        if (Number.isNaN(sessionId)) {
            return res.status(400).json({ success: false, message: 'Sesi tidak valid' });
        }

        const patientId = String(req.user.id);
        const { content } = req.body;
        const DUPLICATE_WINDOW_MS = 5000;

        if (!content || !String(content).trim()) {
            return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });
        }

        const msgContent = String(content).trim().slice(0, 2000);

        conn = await db.getConnection();
        await conn.beginTransaction();

        // Verify session belongs to this patient
        const [sessions] = await conn.query(
            `SELECT id, status, patient_name
             FROM support_chat_sessions
             WHERE id = ? AND patient_id = ?
             FOR UPDATE`,
            [sessionId, patientId]
        );

        if (sessions.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        const session = sessions[0];

        if (session.status === 'resolved') {
            await conn.rollback();
            return res.status(409).json({
                success: false,
                message: 'Sesi sudah selesai. Silakan mulai sesi baru untuk chat berikutnya.'
            });
        }

        // Idempotency guard: avoid duplicate inserts when client triggers rapid double submit.
        const [recentRows] = await conn.query(
            `SELECT id, sender_name, content, created_at
             FROM support_chat_messages
             WHERE session_id = ? AND sender_type = 'patient'
             ORDER BY id DESC
             LIMIT 1`,
            [sessionId]
        );

        if (recentRows.length > 0) {
            const recent = recentRows[0];
            const recentText = String(recent.content || '').trim();
            const recentTs = recent.created_at instanceof Date
                ? recent.created_at.getTime()
                : new Date(recent.created_at).getTime();
            const nowTs = Date.now();
            const isDuplicateWindow = Number.isFinite(recentTs) && recentTs <= nowTs && (nowTs - recentTs) <= DUPLICATE_WINDOW_MS;

            if (recentText === msgContent && isDuplicateWindow) {
                await conn.commit();
                return res.json({
                    success: true,
                    message: {
                        id: recent.id,
                        session_id: sessionId,
                        sender_type: 'patient',
                        sender_name: recent.sender_name || session.patient_name,
                        content: recent.content,
                        created_at: recent.created_at
                    },
                    botReply: null,
                    escalated: false,
                    deduped: true
                });
            }
        }

        // Save patient message
        const [patientMsgResult] = await conn.query(
            `INSERT INTO support_chat_messages (session_id, sender_type, sender_name, content) VALUES (?, 'patient', ?, ?)`,
            [sessionId, session.patient_name, msgContent]
        );

        await conn.commit();
        conn.release();
        conn = null;

        const patientMsg = {
            id: patientMsgResult.insertId,
            session_id: sessionId,
            sender_type: 'patient',
            sender_name: session.patient_name,
            content: msgContent,
            created_at: new Date()
        };

        // Emit to session room (for staff who might be watching)
        if (global.io) {
            global.io.to(`support:${sessionId}`).emit('support:new_message', patientMsg);
        }

        // If already escalated to staff, just notify staff of new message
        if (session.status === 'escalated') {
            if (global.io) {
                global.io.emit('support:escalated_message', {
                    sessionId,
                    patientName: session.patient_name,
                    preview: msgContent.slice(0, 100)
                });
            }
            return res.json({ success: true, message: patientMsg, botReply: null, escalated: false });
        }

        // Bot engine — find matching FAQ
        const faq = await findBestFAQ(msgContent);

        let botReply = null;
        let escalated = false;

        if (faq) {
            // Bot has an answer
            const [botMsgResult] = await db.query(
                `INSERT INTO support_chat_messages (session_id, sender_type, sender_name, content) VALUES (?, 'bot', 'Asisten Virtual', ?)`,
                [sessionId, faq.answer]
            );

            botReply = {
                id: botMsgResult.insertId,
                session_id: sessionId,
                sender_type: 'bot',
                sender_name: 'Asisten Virtual',
                content: faq.answer,
                created_at: new Date()
            };

            if (global.io) {
                global.io.to(`support:${sessionId}`).emit('support:new_message', botReply);
            }
        } else {
            // Bot can't answer → escalate to staff
            await db.query(
                `UPDATE support_chat_sessions SET status = 'escalated', updated_at = NOW() WHERE id = ?`,
                [sessionId]
            );

            const escalateMsg = 'Bila kurang puas dengan jawaban sementara, akan kami sambungkan dengan staff kami.';
            const [botMsgResult] = await db.query(
                `INSERT INTO support_chat_messages (session_id, sender_type, sender_name, content) VALUES (?, 'bot', 'Asisten Virtual', ?)`,
                [sessionId, escalateMsg]
            );

            botReply = {
                id: botMsgResult.insertId,
                session_id: sessionId,
                sender_type: 'bot',
                sender_name: 'Asisten Virtual',
                content: escalateMsg,
                created_at: new Date()
            };

            escalated = true;

            if (global.io) {
                global.io.to(`support:${sessionId}`).emit('support:new_message', botReply);
                // Broadcast to all staff online
                global.io.emit('support:escalated', {
                    sessionId,
                    patientId,
                    patientName: session.patient_name,
                    lastMessage: msgContent.slice(0, 150)
                });
            }
        }

        return res.json({ success: true, message: patientMsg, botReply, escalated });

    } catch (err) {
        if (conn) {
            try { await conn.rollback(); } catch (rollbackErr) { /* ignore rollback errors */ }
        }
        console.error('[support-chat] message error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// ===================== STAFF ROUTES =====================

// GET /api/support-chat/staff/pending — list escalated sessions
router.get('/staff/pending', verifyToken, async (req, res) => {
    try {
        await ensureSchema();

        const [sessions] = await db.query(
            `SELECT s.id, s.patient_id, s.patient_name, s.status,
                    s.assigned_staff_id, s.assigned_staff_name,
                    s.created_at, s.updated_at,
                    m.content AS last_message, m.created_at AS last_message_at
             FROM support_chat_sessions s
             LEFT JOIN (
                 SELECT session_id, content, created_at
                 FROM support_chat_messages sm
                 WHERE sm.created_at = (
                     SELECT MAX(sm2.created_at)
                     FROM support_chat_messages sm2
                     WHERE sm2.session_id = sm.session_id
                 )
             ) m ON m.session_id = s.id
             WHERE s.status = 'escalated'
             ORDER BY s.updated_at ASC
             LIMIT 50`
        );

        return res.json({ success: true, sessions });

    } catch (err) {
        console.error('[support-chat] staff/pending error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/support-chat/staff/session/:id — get full session for staff
router.get('/staff/session/:id', verifyToken, async (req, res) => {
    try {
        await ensureSchema();

        const sessionId = parseInt(req.params.id);

        const [sessions] = await db.query(
            `SELECT id, patient_id, patient_name, status, assigned_staff_id, assigned_staff_name, created_at
             FROM support_chat_sessions WHERE id = ?`,
            [sessionId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        const [messages] = await db.query(
            `SELECT id, sender_type, sender_name, content, created_at
             FROM support_chat_messages
             WHERE session_id = ?
             ORDER BY created_at ASC`,
            [sessionId]
        );

        return res.json({ success: true, session: { ...sessions[0], messages } });

    } catch (err) {
        console.error('[support-chat] staff/session error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/support-chat/staff/:id/reply — staff sends reply
router.post('/staff/:id/reply', verifyToken, async (req, res) => {
    let conn = null;
    try {
        await ensureSchema();

        const sessionId = parseInt(req.params.id, 10);
        if (Number.isNaN(sessionId)) {
            return res.status(400).json({ success: false, message: 'Sesi tidak valid' });
        }

        const { content } = req.body;
        const DUPLICATE_WINDOW_MS = 5000;

        if (!content || !String(content).trim()) {
            return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });
        }

        const staffName = req.user.name || req.user.display_name || 'Staff';
        const staffId = String(req.user.id || req.user.new_id || '').trim();
        const msgContent = String(content).trim().slice(0, 2000);

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [sessions] = await conn.query(
            `SELECT id, patient_id, patient_name, status, assigned_staff_id, assigned_staff_name
             FROM support_chat_sessions
             WHERE id = ?
             FOR UPDATE`,
            [sessionId]
        );

        if (sessions.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        const session = sessions[0];
        const lockedStaffId = String(session.assigned_staff_id || '').trim();
        if (lockedStaffId && staffId && lockedStaffId !== staffId) {
            await conn.rollback();
            return res.status(423).json({
                success: false,
                message: `Sesi ini sedang ditangani oleh ${session.assigned_staff_name || 'staff lain'}`,
                readOnly: true,
                assigned_staff_id: session.assigned_staff_id,
                assigned_staff_name: session.assigned_staff_name || null
            });
        }

        const [recentRows] = await conn.query(
            `SELECT id, sender_type, sender_name, content, created_at
             FROM support_chat_messages
             WHERE session_id = ?
             ORDER BY id DESC
             LIMIT 1`,
            [sessionId]
        );

        if (recentRows.length > 0) {
            const recent = recentRows[0];
            const recentText = String(recent.content || '').trim();
            const recentTs = recent.created_at instanceof Date
                ? recent.created_at.getTime()
                : new Date(recent.created_at).getTime();
            const nowTs = Date.now();
            const isDuplicateWindow = Number.isFinite(recentTs) && recentTs <= nowTs && (nowTs - recentTs) <= DUPLICATE_WINDOW_MS;
            const sameSender = String(recent.sender_type || '') === 'staff' && String(recent.sender_name || '') === String(staffName);

            if (sameSender && recentText === msgContent && isDuplicateWindow) {
                await conn.commit();
                return res.json({
                    success: true,
                    message: {
                        id: recent.id,
                        session_id: sessionId,
                        sender_type: 'staff',
                        sender_name: recent.sender_name || staffName,
                        content: recent.content,
                        created_at: recent.created_at
                    },
                    deduped: true
                });
            }
        }

        // Assign staff if not yet assigned; also ensure status is correct
        await conn.query(
            `UPDATE support_chat_sessions
             SET assigned_staff_id = COALESCE(assigned_staff_id, ?),
                 assigned_staff_name = COALESCE(assigned_staff_name, ?),
                 updated_at = NOW()
             WHERE id = ?`,
            [staffId, staffName, sessionId]
        );

        const [result] = await conn.query(
            `INSERT INTO support_chat_messages (session_id, sender_type, sender_name, content)
             VALUES (?, 'staff', ?, ?)`,
            [sessionId, staffName, msgContent]
        );

        await conn.commit();
        conn.release();
        conn = null;

        const staffMsg = {
            id: result.insertId,
            session_id: sessionId,
            sender_type: 'staff',
            sender_name: staffName,
            content: msgContent,
            created_at: new Date()
        };

        if (global.io) {
            // Deliver to patient's open widget
            global.io.to(`support:${sessionId}`).emit('support:new_message', staffMsg);
            // Notify other staff that session is being handled
            global.io.emit('support:staff_replied', { sessionId, staffName });
        }

        return res.json({ success: true, message: staffMsg });

    } catch (err) {
        if (conn) {
            try { await conn.rollback(); } catch (rollbackErr) { /* ignore rollback errors */ }
        }
        console.error('[support-chat] staff reply error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// PUT /api/support-chat/staff/:id/resolve — mark session resolved
router.put('/staff/:id/resolve', verifyToken, async (req, res) => {
    let conn = null;
    try {
        await ensureSchema();

        const sessionId = parseInt(req.params.id, 10);
        if (Number.isNaN(sessionId)) {
            return res.status(400).json({ success: false, message: 'Sesi tidak valid' });
        }

        const staffName = req.user.name || req.user.display_name || 'Staff';
        const staffId = String(req.user.id || req.user.new_id || '').trim();
        const defaultClosingMessage = 'Terima kasih sudah menghubungi kami. Sesi bantuan ini kami tutup. Jika masih ada pertanyaan, silakan mulai chat baru kapan saja. 🙏';
        const incomingClosingMessage = req.body && typeof req.body.closingMessage === 'string'
            ? req.body.closingMessage
            : '';
        const closingMessage = String(incomingClosingMessage || defaultClosingMessage).trim().slice(0, 2000) || defaultClosingMessage;

        conn = await db.getConnection();
        await conn.beginTransaction();

        const [sessions] = await conn.query(
            `SELECT id, status, assigned_staff_id, assigned_staff_name
             FROM support_chat_sessions
             WHERE id = ?
             FOR UPDATE`,
            [sessionId]
        );

        if (sessions.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        const lockedStaffId = String(sessions[0].assigned_staff_id || '').trim();
        if (lockedStaffId && staffId && lockedStaffId !== staffId) {
            await conn.rollback();
            return res.status(423).json({
                success: false,
                message: `Sesi ini sedang ditangani oleh ${sessions[0].assigned_staff_name || 'staff lain'}`,
                readOnly: true,
                assigned_staff_id: sessions[0].assigned_staff_id,
                assigned_staff_name: sessions[0].assigned_staff_name || null
            });
        }

        if (sessions[0].status === 'resolved') {
            await conn.commit();
            return res.json({ success: true, message: 'Sesi sudah diselesaikan' });
        }

        const [msgResult] = await conn.query(
            `INSERT INTO support_chat_messages (session_id, sender_type, sender_name, content)
             VALUES (?, 'staff', ?, ?)`,
            [sessionId, staffName, closingMessage]
        );

        await conn.query(
            `UPDATE support_chat_sessions
             SET status = 'resolved',
                 assigned_staff_id = COALESCE(assigned_staff_id, NULLIF(?, '')),
                 assigned_staff_name = COALESCE(assigned_staff_name, ?),
                 resolved_at = NOW(),
                 resolved_by_staff_id = COALESCE(resolved_by_staff_id, NULLIF(?, '')),
                 resolved_by_staff_name = COALESCE(resolved_by_staff_name, ?),
                 updated_at = NOW()
             WHERE id = ?`,
            [staffId, staffName, staffId, staffName, sessionId]
        );

        await conn.commit();

        const closingMessagePayload = {
            id: msgResult.insertId,
            session_id: sessionId,
            sender_type: 'staff',
            sender_name: staffName,
            content: closingMessage,
            created_at: new Date()
        };

        if (global.io) {
            global.io.to(`support:${sessionId}`).emit('support:new_message', closingMessagePayload);
            global.io.to(`support:${sessionId}`).emit('support:resolved', {
                sessionId,
                closingMessage: closingMessagePayload.content,
                closingMessageId: closingMessagePayload.id,
                closingSenderName: closingMessagePayload.sender_name,
                closingCreatedAt: closingMessagePayload.created_at
            });
            global.io.emit('support:session_resolved', {
                sessionId,
                closingMessageId: closingMessagePayload.id
            });
        }

        return res.json({
            success: true,
            message: 'Sesi telah diselesaikan',
            closingMessage: closingMessagePayload
        });

    } catch (err) {
        if (conn) {
            try { await conn.rollback(); } catch (rollbackErr) { /* ignore rollback errors */ }
        }
        console.error('[support-chat] resolve error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    } finally {
        if (conn) conn.release();
    }
});

// GET /api/support-chat/staff/points — leaderboard poin staff dari sesi resolved
router.get('/staff/points', verifyToken, async (req, res) => {
    try {
        await ensureSchema();

        const reqDays = parseInt(String(req.query.days || '30'), 10);
        const days = Number.isFinite(reqDays) ? Math.max(7, Math.min(reqDays, 90)) : 30;
        const currentStaffId = String(req.user.id || req.user.new_id || '').trim();

        const [rows] = await db.query(
            `SELECT t.staff_id,
                    t.staff_name,
                    COUNT(*) AS resolved_count,
                    SUM(CASE
                        WHEN t.rating IS NULL THEN 8
                        ELSE 10 + (t.rating * 2)
                    END) AS total_points,
                    SUM(CASE WHEN t.rating IS NOT NULL THEN 1 ELSE 0 END) AS rated_count,
                    ROUND(AVG(t.rating), 2) AS avg_rating
             FROM (
                SELECT s.id,
                       COALESCE(NULLIF(s.resolved_by_staff_id, ''), NULLIF(s.assigned_staff_id, '')) AS staff_id,
                       COALESCE(NULLIF(s.resolved_by_staff_name, ''), NULLIF(s.assigned_staff_name, ''), 'Staff') AS staff_name,
                       r.rating,
                       COALESCE(s.resolved_at, s.updated_at) AS resolved_ts
                FROM support_chat_sessions s
                LEFT JOIN support_chat_ratings r ON r.session_id = s.id
                WHERE s.status = 'resolved'
                  AND COALESCE(NULLIF(s.resolved_by_staff_id, ''), NULLIF(s.assigned_staff_id, '')) IS NOT NULL
                  AND COALESCE(s.resolved_at, s.updated_at) >= DATE_SUB(NOW(), INTERVAL ? DAY)
             ) t
             GROUP BY t.staff_id, t.staff_name
             ORDER BY total_points DESC, resolved_count DESC, t.staff_name ASC
             LIMIT 30`,
            [days]
        );

        const leaderboard = rows.map((row, index) => ({
            rank: index + 1,
            staff_id: row.staff_id,
            staff_name: row.staff_name,
            resolved_count: Number(row.resolved_count || 0),
            total_points: Number(row.total_points || 0),
            rated_count: Number(row.rated_count || 0),
            avg_rating: row.avg_rating === null ? null : Number(row.avg_rating)
        }));

        let me = null;
        if (currentStaffId) {
            me = leaderboard.find((row) => String(row.staff_id || '') === currentStaffId) || null;
        }

        return res.json({
            success: true,
            days,
            leaderboard,
            me
        });

    } catch (err) {
        console.error('[support-chat] staff/points error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/support-chat/staff/briefing-weekly — ringkasan operasional 7 hari
router.get('/staff/briefing-weekly', verifyToken, async (req, res) => {
    try {
        await ensureSchema();

        const reqDays = parseInt(String(req.query.days || '7'), 10);
        const days = Number.isFinite(reqDays) ? Math.max(7, Math.min(reqDays, 30)) : 7;

        const [[pendingSummary]] = await db.query(
            `SELECT COUNT(*) AS pending_count,
                    COALESCE(MAX(TIMESTAMPDIFF(MINUTE, s.updated_at, NOW())), 0) AS oldest_wait_minutes
             FROM support_chat_sessions s
             WHERE s.status = 'escalated'`
        );

        const [[resolvedSummary]] = await db.query(
            `SELECT COUNT(*) AS resolved_count,
                    SUM(CASE WHEN r.rating IS NOT NULL THEN 1 ELSE 0 END) AS rated_count,
                    ROUND(AVG(r.rating), 2) AS avg_rating
             FROM support_chat_sessions s
             LEFT JOIN support_chat_ratings r ON r.session_id = s.id
             WHERE s.status = 'resolved'
               AND COALESCE(s.resolved_at, s.updated_at) >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );

        const [[replySummary]] = await db.query(
            `SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, p.first_patient_at, st.first_staff_at)), 1) AS avg_first_reply_minutes
             FROM (
                SELECT session_id, MIN(created_at) AS first_patient_at
                FROM support_chat_messages
                WHERE sender_type = 'patient'
                GROUP BY session_id
             ) p
             INNER JOIN (
                SELECT session_id, MIN(created_at) AS first_staff_at
                FROM support_chat_messages
                WHERE sender_type = 'staff'
                GROUP BY session_id
             ) st ON st.session_id = p.session_id AND st.first_staff_at >= p.first_patient_at
             INNER JOIN support_chat_sessions s ON s.id = p.session_id
             WHERE COALESCE(s.resolved_at, s.updated_at) >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );

        const [ratingRows] = await db.query(
            `SELECT r.rating, COUNT(*) AS total
             FROM support_chat_ratings r
             INNER JOIN support_chat_sessions s ON s.id = r.session_id
             WHERE COALESCE(s.resolved_at, s.updated_at) >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY r.rating
             ORDER BY r.rating DESC`,
            [days]
        );

        const [topStaffRows] = await db.query(
            `SELECT t.staff_id,
                    t.staff_name,
                    COUNT(*) AS resolved_count,
                    SUM(CASE
                        WHEN t.rating IS NULL THEN 8
                        ELSE 10 + (t.rating * 2)
                    END) AS total_points,
                    ROUND(AVG(t.rating), 2) AS avg_rating
             FROM (
                SELECT s.id,
                       COALESCE(NULLIF(s.resolved_by_staff_id, ''), NULLIF(s.assigned_staff_id, '')) AS staff_id,
                       COALESCE(NULLIF(s.resolved_by_staff_name, ''), NULLIF(s.assigned_staff_name, ''), 'Staff') AS staff_name,
                       r.rating
                FROM support_chat_sessions s
                LEFT JOIN support_chat_ratings r ON r.session_id = s.id
                WHERE s.status = 'resolved'
                  AND COALESCE(NULLIF(s.resolved_by_staff_id, ''), NULLIF(s.assigned_staff_id, '')) IS NOT NULL
                  AND COALESCE(s.resolved_at, s.updated_at) >= DATE_SUB(NOW(), INTERVAL ? DAY)
             ) t
             GROUP BY t.staff_id, t.staff_name
             ORDER BY total_points DESC, resolved_count DESC
             LIMIT 3`,
            [days]
        );

        const resolvedCount = Number(resolvedSummary.resolved_count || 0);
        const ratedCount = Number(resolvedSummary.rated_count || 0);
        const avgRating = resolvedSummary.avg_rating === null ? null : Number(resolvedSummary.avg_rating);
        const pendingCount = Number(pendingSummary.pending_count || 0);
        const oldestWaitMinutes = Number(pendingSummary.oldest_wait_minutes || 0);
        const avgFirstReplyMinutes = replySummary.avg_first_reply_minutes === null
            ? null
            : Number(replySummary.avg_first_reply_minutes);

        const ratingBreakdown = [5, 4, 3, 2, 1].map((score) => {
            const found = ratingRows.find((row) => Number(row.rating) === score);
            return { rating: score, total: found ? Number(found.total || 0) : 0 };
        });

        const topStaff = topStaffRows.map((row) => ({
            staff_id: row.staff_id,
            staff_name: row.staff_name,
            resolved_count: Number(row.resolved_count || 0),
            total_points: Number(row.total_points || 0),
            avg_rating: row.avg_rating === null ? null : Number(row.avg_rating)
        }));

        const actions = [];
        if (pendingCount >= 5) {
            actions.push('Antrian eskalasi cukup tinggi. Prioritaskan sesi paling lama terlebih dahulu.');
        }
        if (oldestWaitMinutes >= 30) {
            actions.push('Ada pasien menunggu lebih dari 30 menit. Perlu penanganan cepat.');
        }
        if (avgFirstReplyMinutes !== null && avgFirstReplyMinutes > 10) {
            actions.push('Rata-rata respons pertama di atas 10 menit. Coba percepat pickup sesi baru.');
        }
        if (avgRating !== null && avgRating < 4.5) {
            actions.push('Rata-rata rating di bawah 4.5. Perbaiki kualitas closing dan follow-up.');
        }
        if (actions.length === 0) {
            actions.push('Performa minggu ini stabil. Pertahankan respons cepat dan closing yang jelas.');
        }

        return res.json({
            success: true,
            generated_at: new Date(),
            days,
            kpis: {
                pending_count: pendingCount,
                oldest_wait_minutes: oldestWaitMinutes,
                resolved_count: resolvedCount,
                rated_count: ratedCount,
                avg_rating: avgRating,
                avg_first_reply_minutes: avgFirstReplyMinutes
            },
            rating_breakdown: ratingBreakdown,
            top_staff: topStaff,
            actions
        });

    } catch (err) {
        console.error('[support-chat] staff/briefing-weekly error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/support-chat/staff/count — pending count for badge
router.get('/staff/count', verifyToken, async (req, res) => {
    try {
        await ensureSchema();

        const [rows] = await db.query(
            `SELECT COUNT(*) as count FROM support_chat_sessions WHERE status = 'escalated'`
        );

        return res.json({ success: true, count: rows[0].count });

    } catch (err) {
        console.error('[support-chat] staff/count error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ===================== SOCKET SETUP =====================
function setupSocketHandlers(io) {
    io.on('connection', (socket) => {
        // Patient or staff joins a support chat room to receive real-time messages
        socket.on('support:join', (data) => {
            if (!data || !data.sessionId) return;
            socket.join(`support:${data.sessionId}`);
        });

        socket.on('support:leave', (data) => {
            if (!data || !data.sessionId) return;
            socket.leave(`support:${data.sessionId}`);
        });
    });
}

module.exports = router;
module.exports.setupSocketHandlers = setupSocketHandlers;
module.exports.ensureSchema = ensureSchema;
