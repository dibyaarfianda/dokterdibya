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

        // Seed FAQ if empty
        const [faqCount] = await db.query('SELECT COUNT(*) as cnt FROM support_faq');
        if (faqCount[0].cnt === 0) {
            await seedFAQ();
        }

        schemaReady = true;
    })();

    return schemaPromise;
}

async function seedFAQ() {
    const faqs = [
        {
            keywords: ['jam praktik', 'jadwal dokter', 'jadwal praktik', 'jam buka', 'kapan buka', 'jam berapa', 'praktek', 'jadwal'],
            answer: '🕐 *Jadwal Praktik dr. Dibya SpOG:*\n\n📍 *Klinik Privat:* Setiap Minggu pukul 08.00–12.00 WIB\n📍 *RSIA Melinda:* Cek jadwal di jadwal.rsia-melinda.com\n📍 *RSUD Gambiran:* Setiap Senin–Jumat\n\nUntuk jadwal terbaru, hubungi langsung klinik melalui tombol "Hubungi Kami" di menu Bantuan.',
            category: 'jadwal',
            priority: 10
        },
        {
            keywords: ['cara booking', 'cara daftar', 'cara pesan', 'daftar konsultasi', 'buat janji', 'booking', 'daftar antrian', 'mau periksa', 'pesan slot', 'reservasi'],
            answer: '📋 *Cara Booking Konsultasi:*\n\n1. Dari menu utama, pilih **Booking**\n2. Pilih jenis konsultasi (Klinik Privat / RS)\n3. Pilih tanggal & waktu yang tersedia\n4. Konfirmasi booking\n5. Cek email untuk nomor antrian\n\n⚠️ Untuk Klinik Privat, pastikan konfirmasi kehadiran sebelum jam 05.00 WIB hari Minggu.',
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
            answer: '❌ *Cara Membatalkan Booking:*\n\n1. Dari menu utama, pilih **Riwayat Booking**\n2. Temukan booking yang ingin dibatalkan\n3. Tekan tombol **Batalkan**\n4. Konfirmasi pembatalan\n\n⚠️ Pembatalan kurang dari 2 jam sebelum jadwal tidak dapat diproses.',
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
            answer: '💰 *Informasi Biaya:*\n\nBiaya konsultasi bervariasi tergantung lokasi dan jenis pemeriksaan. Untuk informasi terbaru:\n\n• Hubungi klinik via WhatsApp\n• Tanya pada saat booking\n\nKami menerima BPJS dan asuransi swasta di beberapa lokasi.',
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

        const [existing] = await db.query(
            `SELECT id, status, assigned_staff_id, assigned_staff_name, created_at
             FROM support_chat_sessions
             WHERE patient_id = ? AND status != 'resolved'
             ORDER BY created_at DESC
             LIMIT 1`,
            [patientId]
        );

        if (existing.length === 0) {
            return res.json({ success: true, session: null });
        }

        const session = existing[0];
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

// POST /api/support-chat/sessions/:id/message — patient sends a message
router.post('/sessions/:id/message', verifyPatientToken, ensureSupportChatAllowed, async (req, res) => {
    try {
        await ensureSchema();

        const sessionId = parseInt(req.params.id);
        const patientId = String(req.user.id);
        const { content } = req.body;

        if (!content || !String(content).trim()) {
            return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });
        }

        const msgContent = String(content).trim().slice(0, 2000);

        // Verify session belongs to this patient
        const [sessions] = await db.query(
            `SELECT id, status, patient_name FROM support_chat_sessions WHERE id = ? AND patient_id = ?`,
            [sessionId, patientId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        const session = sessions[0];

        // Save patient message
        const [patientMsgResult] = await db.query(
            `INSERT INTO support_chat_messages (session_id, sender_type, sender_name, content) VALUES (?, 'patient', ?, ?)`,
            [sessionId, session.patient_name, msgContent]
        );

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

            const escalateMsg = 'Pertanyaan Anda sedang kami teruskan ke staff. Mohon tunggu sebentar, staff akan segera membalas... 🙏';
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
        console.error('[support-chat] message error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
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
    try {
        await ensureSchema();

        const sessionId = parseInt(req.params.id);
        const { content } = req.body;

        if (!content || !String(content).trim()) {
            return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });
        }

        const staffName = req.user.name || req.user.display_name || 'Staff';
        const staffId = String(req.user.id || req.user.new_id);
        const msgContent = String(content).trim().slice(0, 2000);

        const [sessions] = await db.query(
            `SELECT id, patient_id, patient_name, status FROM support_chat_sessions WHERE id = ?`,
            [sessionId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        // Assign staff if not yet assigned; also ensure status is correct
        await db.query(
            `UPDATE support_chat_sessions
             SET assigned_staff_id = COALESCE(assigned_staff_id, ?),
                 assigned_staff_name = COALESCE(assigned_staff_name, ?),
                 updated_at = NOW()
             WHERE id = ?`,
            [staffId, staffName, sessionId]
        );

        const [result] = await db.query(
            `INSERT INTO support_chat_messages (session_id, sender_type, sender_name, content)
             VALUES (?, 'staff', ?, ?)`,
            [sessionId, staffName, msgContent]
        );

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
        console.error('[support-chat] staff reply error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/support-chat/staff/:id/resolve — mark session resolved
router.put('/staff/:id/resolve', verifyToken, async (req, res) => {
    try {
        await ensureSchema();

        const sessionId = parseInt(req.params.id);

        await db.query(
            `UPDATE support_chat_sessions SET status = 'resolved', updated_at = NOW() WHERE id = ?`,
            [sessionId]
        );

        if (global.io) {
            global.io.to(`support:${sessionId}`).emit('support:resolved', { sessionId });
            global.io.emit('support:session_resolved', { sessionId });
        }

        return res.json({ success: true, message: 'Sesi telah diselesaikan' });

    } catch (err) {
        console.error('[support-chat] resolve error:', err);
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
