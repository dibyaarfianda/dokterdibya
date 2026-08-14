/**
 * Support Chat Route - Patient Help Chat with Bot + Staff Escalation
 * Floating chat widget for patient portal. Bot answers FAQ first,
 * escalates to staff via Socket.IO when bot can't answer.
 */

const express = require('express');
const db = require('../db');
const { validateOperationalSchemaScope } = require('../services/OperationalSchemaValidator');
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
    return validateOperationalSchemaScope('supportChat');
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
            keywords: ['kontraksi', 'penghitung kontraksi', 'timer kontraksi', 'hitung kontraksi', 'braxton hicks', 'fase laten'],
            answer: '*Hitung Kontraksi*\n\nFitur ini mencatat durasi dan jarak kontraksi sebagai edukasi + alarm, bukan diagnosis fase persalinan.\n\nGunakan dari menu Aplikasi > Hitung Kontraksi. Bila ada perdarahan, air ketuban keluar, gerak bayi berkurang, nyeri menetap, gejala berat, atau kontraksi teratur sebelum 37 minggu, segera ke unit persalinan/IGD.',
            category: 'fitur',
            priority: 6
        },
        {
            keywords: ['notifikasi', 'notif', 'aktifkan notif', 'push notification'],
            answer: '🔔 *Cara Mengaktifkan Notifikasi:*\n\n1. Dari menu utama, pilih **Pengingat**\n2. Tekan **Aktifkan Notifikasi**\n3. Izinkan notifikasi di browser/app\n\nNotifikasi akan memberitahu Anda untuk konfirmasi kehadiran dan reminder janji.',
            category: 'fitur',
            priority: 4
        },
        {
            keywords: ['daftar akun', 'registrasi', 'buat akun', 'signup', 'mendaftar', 'bergabung', 'pasien baru'],
            answer: '📝 *Cara Mendaftar Sebagai Pasien Baru:*\n\n1. Buka halaman utama portal\n2. Tekan **Daftar**\n3. Masukkan kode registrasi (dapatkan dari klinik)\n4. Lanjutkan dengan akun Google\n5. Lengkapi data diri bila diminta\n\nKode registrasi bisa diperoleh saat berkunjung ke klinik.',
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

    const contractionKeywords = ['kontraksi', 'penghitung kontraksi', 'timer kontraksi', 'hitung kontraksi', 'braxton hicks', 'fase laten'];
    const contractionAnswer = '*Hitung Kontraksi*\n\nFitur ini mencatat durasi dan jarak kontraksi sebagai edukasi + alarm, bukan diagnosis fase persalinan.\n\nGunakan dari menu Aplikasi > Hitung Kontraksi. Bila ada perdarahan, air ketuban keluar, gerak bayi berkurang, nyeri menetap, gejala berat, atau kontraksi teratur sebelum 37 minggu, segera ke unit persalinan/IGD.';

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

    const [contractionRows] = await db.query(
        `SELECT id FROM support_faq
         WHERE JSON_SEARCH(keywords, 'one', 'kontraksi') IS NOT NULL
         LIMIT 1`
    );
    if (contractionRows.length > 0) {
        await db.query(
            `UPDATE support_faq
             SET keywords = ?,
                 answer = ?,
                 category = 'fitur',
                 priority = 6,
                 is_active = 1
             WHERE id = ?`,
            [JSON.stringify(contractionKeywords), contractionAnswer, contractionRows[0].id]
        );
    } else {
        await db.query(
            `INSERT INTO support_faq (keywords, answer, category, priority, is_active)
             VALUES (?, ?, 'fitur', 6, 1)`,
            [JSON.stringify(contractionKeywords), contractionAnswer]
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

// ===================== HELPERS =====================

// Cooldown: 5 hours between staff-escalations for the same patient.
const ESCALATION_COOLDOWN_SECONDS = 5 * 60 * 60;

async function getLastRatingForPatient(patientId) {
    const [rows] = await db.query(
        `SELECT id, session_id, rating, created_at
         FROM support_chat_ratings
         WHERE patient_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [String(patientId)]
    );
    return rows[0] || null;
}

function computeCooldownRemainingSeconds(lastRating) {
    if (!lastRating || !lastRating.created_at) return 0;
    const ts = lastRating.created_at instanceof Date
        ? lastRating.created_at.getTime()
        : new Date(lastRating.created_at).getTime();
    if (!Number.isFinite(ts)) return 0;
    const elapsed = Math.floor((Date.now() - ts) / 1000);
    const remaining = ESCALATION_COOLDOWN_SECONDS - elapsed;
    return remaining > 0 ? remaining : 0;
}

async function getPatientChatMeta(patientId, sessionId) {
    const lastRating = await getLastRatingForPatient(patientId);
    const remaining = computeCooldownRemainingSeconds(lastRating);
    const cooldown = {
        active: remaining > 0,
        remaining_seconds: remaining,
        last_rating_at: lastRating ? lastRating.created_at : null,
        last_rated_session_id: lastRating ? lastRating.session_id : null
    };

    const sessionFlags = { rated: false, requires_rating: false };
    if (sessionId) {
        const [r] = await db.query(
            `SELECT 1 FROM support_chat_ratings WHERE session_id = ? LIMIT 1`,
            [sessionId]
        );
        sessionFlags.rated = r.length > 0;
        // Check if this session is resolved → requires rating if not yet rated
        const [s] = await db.query(
            `SELECT status FROM support_chat_sessions WHERE id = ? LIMIT 1`,
            [sessionId]
        );
        if (s.length > 0 && s[0].status === 'resolved' && !sessionFlags.rated) {
            sessionFlags.requires_rating = true;
        }
    }

    return { cooldown, sessionFlags, lastRating };
}

// ===================== PATIENT ROUTES =====================

// POST /api/support-chat/sessions — get or create active session
router.post('/sessions', verifyPatientToken, ensureSupportChatAllowed, async (req, res) => {
    try {
        await ensureSchema();
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

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
            const meta = await getPatientChatMeta(patientId);
            return res.json({ success: true, session: { ...session, messages }, ...meta });
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

        const meta = await getPatientChatMeta(patientId);
        return res.json({
            success: true,
            session: {
                id: sessionId,
                status: 'bot',
                assigned_staff_id: null,
                assigned_staff_name: null,
                created_at: new Date(),
                messages
            },
            ...meta
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
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const patientId = String(req.user.id);
        const includeRecentResolved = ['1', 'true', 'yes'].includes(String(req.query.include_recent_resolved || '').toLowerCase());

        const [existing] = await db.query(
            `SELECT id, status, assigned_staff_id, assigned_staff_name, created_at
             FROM support_chat_sessions
             WHERE patient_id = ? AND status != 'resolved'
             ORDER BY created_at DESC
             LIMIT 1`,
            [patientId]
        );

        let session = existing[0] || null;

        // Optional fallback for active polling: when a session is just resolved,
        // return latest resolved session so client can still pick up closing message + status.
        if (!session && includeRecentResolved) {
            const [resolvedRows] = await db.query(
                `SELECT id, status, assigned_staff_id, assigned_staff_name, created_at
                 FROM support_chat_sessions
                 WHERE patient_id = ? AND status = 'resolved'
                 ORDER BY updated_at DESC
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

        const meta = await getPatientChatMeta(patientId, session.id);
        return res.json({ success: true, session: { ...session, messages, ...meta.sessionFlags }, cooldown: meta.cooldown });

    } catch (err) {
        console.error('[support-chat] sessions/current error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
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
            // Bot can't answer → check cooldown before escalating to staff
            const lastRating = await getLastRatingForPatient(patientId);
            const cooldownRemaining = computeCooldownRemainingSeconds(lastRating);

            if (cooldownRemaining > 0) {
                // Cooldown active: do NOT escalate. Save a bot notice instead.
                const minutes = Math.ceil(cooldownRemaining / 60);
                const hours = Math.floor(minutes / 60);
                const remMin = minutes % 60;
                const timeText = hours > 0
                    ? `${hours} jam${remMin > 0 ? ` ${remMin} menit` : ''}`
                    : `${minutes} menit`;
                const cooldownMsg = `Anda baru saja terhubung dengan staff kami. Untuk pertanyaan baru ke staff, silakan tunggu ${timeText} lagi.\n\nSementara itu, saya tetap siap membantu menjawab pertanyaan umum. 🤖`;

                const [botMsgResult] = await db.query(
                    `INSERT INTO support_chat_messages (session_id, sender_type, sender_name, content) VALUES (?, 'bot', 'Asisten Virtual', ?)`,
                    [sessionId, cooldownMsg]
                );

                botReply = {
                    id: botMsgResult.insertId,
                    session_id: sessionId,
                    sender_type: 'bot',
                    sender_name: 'Asisten Virtual',
                    content: cooldownMsg,
                    created_at: new Date()
                };

                if (global.io) {
                    global.io.to(`support:${sessionId}`).emit('support:new_message', botReply);
                }

                return res.json({
                    success: true,
                    message: patientMsg,
                    botReply,
                    escalated: false,
                    cooldown: {
                        active: true,
                        remaining_seconds: cooldownRemaining,
                        last_rating_at: lastRating ? lastRating.created_at : null
                    }
                });
            }

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

// POST /api/support-chat/sessions/:id/rating — patient submits rating (1-5) for resolved session
router.post('/sessions/:id/rating', verifyPatientToken, ensureSupportChatAllowed, async (req, res) => {
    try {
        await ensureSchema();

        // Patient endpoints: no-store
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const sessionId = parseInt(req.params.id, 10);
        if (Number.isNaN(sessionId)) {
            return res.status(400).json({ success: false, message: 'Sesi tidak valid' });
        }

        const patientId = String(req.user.id);
        const ratingRaw = req.body && req.body.rating;
        const rating = parseInt(ratingRaw, 10);
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating harus 1-5' });
        }
        const comment = req.body && typeof req.body.comment === 'string'
            ? String(req.body.comment).trim().slice(0, 1000)
            : null;

        const [sessions] = await db.query(
            `SELECT id, patient_id, status, owner_staff_id
             FROM support_chat_sessions
             WHERE id = ? LIMIT 1`,
            [sessionId]
        );
        if (sessions.length === 0 || String(sessions[0].patient_id) !== patientId) {
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }
        if (sessions[0].status !== 'resolved') {
            return res.status(400).json({ success: false, message: 'Sesi belum diselesaikan' });
        }

        const ownerStaffId = sessions[0].owner_staff_id || null;

        try {
            await db.query(
                `INSERT INTO support_chat_ratings (session_id, patient_id, owner_staff_id, rating, comment)
                 VALUES (?, ?, ?, ?, ?)`,
                [sessionId, patientId, ownerStaffId, rating, comment]
            );
        } catch (err) {
            if (err && err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ success: false, message: 'Sesi sudah dirating', code: 'ALREADY_RATED' });
            }
            throw err;
        }

        if (global.io) {
            global.io.to(`support:${sessionId}`).emit('support:session_rated', { sessionId, rating });
            global.io.emit('support:session_rated', { sessionId, rating });
        }

        return res.json({
            success: true,
            rating,
            cooldown: {
                active: true,
                remaining_seconds: ESCALATION_COOLDOWN_SECONDS,
                last_rating_at: new Date()
            }
        });

    } catch (err) {
        console.error('[support-chat] rating error:', err);
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
                    s.owner_staff_id, s.owner_staff_name, s.owner_locked_at,
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
            `SELECT id, patient_id, patient_name, status, assigned_staff_id, assigned_staff_name,
                    owner_staff_id, owner_staff_name, owner_locked_at,
                    resolved_at, resolved_by_staff_id, resolved_by_staff_name, created_at
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
            `SELECT id, patient_id, patient_name, status, owner_staff_id, owner_staff_name
             FROM support_chat_sessions
             WHERE id = ?
             FOR UPDATE`,
            [sessionId]
        );

        if (sessions.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        const sessionRow = sessions[0];

        // Ownership lock: if owner already set and not this staff → forbidden
        if (sessionRow.owner_staff_id && String(sessionRow.owner_staff_id) !== String(staffId)) {
            await conn.rollback();
            return res.status(403).json({
                success: false,
                message: `Sesi sudah ditangani oleh ${sessionRow.owner_staff_name || 'staff lain'}`,
                code: 'NOT_SESSION_OWNER',
                owner_staff_id: sessionRow.owner_staff_id,
                owner_staff_name: sessionRow.owner_staff_name || null
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

        // Assign + claim ownership (atomic via WHERE clause: only sets owner if currently NULL)
        await conn.query(
            `UPDATE support_chat_sessions
             SET assigned_staff_id = COALESCE(assigned_staff_id, ?),
                 assigned_staff_name = COALESCE(assigned_staff_name, ?),
                 owner_staff_id = COALESCE(owner_staff_id, ?),
                 owner_staff_name = COALESCE(owner_staff_name, ?),
                 owner_locked_at = COALESCE(owner_locked_at, NOW()),
                 updated_at = NOW()
             WHERE id = ?`,
            [staffId, staffName, staffId, staffName, sessionId]
        );

        const justClaimed = !sessionRow.owner_staff_id;

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
            if (justClaimed) {
                global.io.emit('support:session_locked', {
                    sessionId,
                    owner_staff_id: staffId,
                    owner_staff_name: staffName
                });
            }
        }

        return res.json({ success: true, message: staffMsg, owner_staff_id: staffId, owner_staff_name: staffName });

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
            `SELECT id, status, assigned_staff_id, assigned_staff_name, owner_staff_id, owner_staff_name
             FROM support_chat_sessions
             WHERE id = ?
             FOR UPDATE`,
            [sessionId]
        );

        if (sessions.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
        }

        const sessionRow = sessions[0];

        // Ownership lock: only owner can resolve (if owner already claimed)
        if (sessionRow.owner_staff_id && String(sessionRow.owner_staff_id) !== String(staffId)) {
            await conn.rollback();
            return res.status(403).json({
                success: false,
                message: `Sesi sudah ditangani oleh ${sessionRow.owner_staff_name || 'staff lain'}`,
                code: 'NOT_SESSION_OWNER',
                owner_staff_id: sessionRow.owner_staff_id,
                owner_staff_name: sessionRow.owner_staff_name || null
            });
        }

        if (sessionRow.status === 'resolved') {
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
                 owner_staff_id = COALESCE(owner_staff_id, NULLIF(?, '')),
                 owner_staff_name = COALESCE(owner_staff_name, ?),
                 owner_locked_at = COALESCE(owner_locked_at, NOW()),
                 resolved_at = NOW(),
                 resolved_by_staff_id = NULLIF(?, ''),
                 resolved_by_staff_name = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [staffId, staffName, staffId, staffName, staffId, staffName, sessionId]
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
            if (String(data.sessionId).startsWith('DEMO-')) {
                socket.emit('support:error', { code: 'DEMO_SOCKET_BLOCKED', message: 'Support chat nyata dinonaktifkan pada mode dummy.' });
                return;
            }
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
