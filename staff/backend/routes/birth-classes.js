const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, optionalAuth, requireMenuAccess } = require('../middleware/auth');

let tablesReady = false;

async function ensureColumn(tableName, columnName, alterSql) {
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
        await db.query(alterSql);
    }
}

async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS birth_class_sessions (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            class_title VARCHAR(150) NOT NULL,
            session_date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NULL,
            location VARCHAR(150) NOT NULL,
            instructor_name VARCHAR(120) NULL,
            quota INT NOT NULL DEFAULT 20,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            notes TEXT NULL,
            created_by VARCHAR(120) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_birth_class_sessions_date_active (session_date, is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await ensureColumn(
        'birth_class_sessions',
        'learning_points',
        'ALTER TABLE birth_class_sessions ADD COLUMN learning_points TEXT NULL AFTER quota'
    );
    await ensureColumn(
        'birth_class_sessions',
        'items_to_bring',
        'ALTER TABLE birth_class_sessions ADD COLUMN items_to_bring TEXT NULL AFTER learning_points'
    );
    await ensureColumn(
        'birth_class_sessions',
        'price',
        'ALTER TABLE birth_class_sessions ADD COLUMN price DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER items_to_bring'
    );
    await ensureColumn(
        'birth_class_sessions',
        'benefits',
        'ALTER TABLE birth_class_sessions ADD COLUMN benefits TEXT NULL AFTER price'
    );

    await db.query(`
        CREATE TABLE IF NOT EXISTS birth_class_registrations (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            session_id BIGINT UNSIGNED NOT NULL,
            patient_id VARCHAR(50) NULL,
            patient_name VARCHAR(150) NOT NULL,
            phone VARCHAR(30) NOT NULL,
            email VARCHAR(150) NULL,
            due_date DATE NULL,
            gestational_weeks INT NULL,
            notes TEXT NULL,
            admin_notes TEXT NULL,
            status ENUM('registered','confirmed','attended','cancelled') NOT NULL DEFAULT 'registered',
            registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_by VARCHAR(120) NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uniq_birth_class_session_phone (session_id, phone),
            KEY idx_birth_class_reg_status (status),
            KEY idx_birth_class_reg_registered_at (registered_at),
            CONSTRAINT fk_birth_class_session
                FOREIGN KEY (session_id) REFERENCES birth_class_sessions(id)
                ON DELETE RESTRICT ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    tablesReady = true;
}

function normalizePhone(value) {
    return String(value || '').trim().replace(/\s+/g, '');
}

function normalizeDecimal(value, fallback = 0) {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return fallback;
    return parsed;
}

function formatDateLocal(dateValue) {
    const d = new Date(dateValue);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mapSessionRow(row) {
    const registeredCount = Number(row.registered_count || 0);
    const quota = Number(row.quota || 0);
    const price = normalizeDecimal(row.price, 0);
    return {
        ...row,
        quota,
        price,
        registered_count: registeredCount,
        available_slots: Math.max(quota - registeredCount, 0)
    };
}

// Public: list active upcoming sessions
router.get('/sessions/public', async (req, res) => {
    try {
        await ensureTables();

        const [rows] = await db.query(`
            SELECT
                s.*,
                COALESCE(r.registered_count, 0) AS registered_count
            FROM birth_class_sessions s
            LEFT JOIN (
                SELECT session_id, COUNT(*) AS registered_count
                FROM birth_class_registrations
                WHERE status != 'cancelled'
                GROUP BY session_id
            ) r ON r.session_id = s.id
            WHERE s.is_active = 1
              AND s.session_date >= CURDATE()
            ORDER BY s.session_date ASC, s.start_time ASC
        `);

        res.json({
            success: true,
            data: rows.map(mapSessionRow)
        });
    } catch (error) {
        console.error('Error loading public birth class sessions:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat jadwal Kelas Dr. Dibya'
        });
    }
});

// Public: register to class
router.post('/register', optionalAuth, async (req, res) => {
    try {
        await ensureTables();

        const {
            session_id,
            patient_name,
            phone,
            email,
            notes
        } = req.body || {};

        const sessionId = Number(session_id);
        let patientId = null;
        let trimmedName = String(patient_name || '').trim();
        let normalizedPhone = normalizePhone(phone);
        let normalizedEmail = String(email || '').trim();
        const normalizedNotes = String(notes || '').trim();
        let registrationSource = 'public_form';

        const isPatientToken = req.user && (req.user.user_type === 'patient' || req.user.role === 'patient');
        if (isPatientToken) {
            const [patientRows] = await db.query(
                `SELECT id, full_name, email, phone
                 FROM patients
                 WHERE id = ?
                 LIMIT 1`,
                [req.user.id]
            );

            if (patientRows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Profil pasien tidak ditemukan'
                });
            }

            const patient = patientRows[0];
            patientId = patient.id;
            trimmedName = String(patient.full_name || '').trim();
            normalizedPhone = normalizePhone(patient.phone || '');
            normalizedEmail = String(patient.email || '').trim();
            registrationSource = `patient:${patient.id}`;

            if (!normalizedPhone) {
                return res.status(400).json({
                    success: false,
                    message: 'Nomor HP Anda belum tersedia. Silakan lengkapi profil terlebih dahulu.'
                });
            }
        }

        if (!sessionId || !trimmedName || !normalizedPhone) {
            return res.status(400).json({
                success: false,
                message: 'session_id, patient_name, dan phone wajib diisi'
            });
        }

        const [sessionRows] = await db.query(`
            SELECT
                s.id,
                s.class_title,
                s.quota,
                s.is_active,
                s.session_date,
                COALESCE(r.registered_count, 0) AS registered_count
            FROM birth_class_sessions s
            LEFT JOIN (
                SELECT session_id, COUNT(*) AS registered_count
                FROM birth_class_registrations
                WHERE status != 'cancelled'
                GROUP BY session_id
            ) r ON r.session_id = s.id
            WHERE s.id = ?
            LIMIT 1
        `, [sessionId]);

        if (sessionRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sesi kelas tidak ditemukan'
            });
        }

        const session = sessionRows[0];
        if (Number(session.is_active) !== 1) {
            return res.status(400).json({
                success: false,
                message: 'Sesi kelas tidak aktif'
            });
        }

        const sessionDate = formatDateLocal(session.session_date);
        const todayDate = formatDateLocal(new Date());
        if (sessionDate < todayDate) {
            return res.status(400).json({
                success: false,
                message: 'Sesi kelas sudah lewat'
            });
        }

        const availableSlots = Math.max(Number(session.quota || 0) - Number(session.registered_count || 0), 0);
        if (availableSlots <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Kuota kelas sudah penuh'
            });
        }

        await db.query(`
            INSERT INTO birth_class_registrations
            (session_id, patient_id, patient_name, phone, email, notes, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, 'registered', ?)
        `, [
            sessionId,
            patientId,
            trimmedName,
            normalizedPhone,
            normalizedEmail || null,
            normalizedNotes || null,
            registrationSource
        ]);

        res.status(201).json({
            success: true,
            message: `Pendaftaran berhasil. Anda terdaftar di kelas ${session.class_title}`
        });
    } catch (error) {
        console.error('Error registering birth class:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'Nomor HP ini sudah terdaftar pada sesi yang sama'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Gagal melakukan pendaftaran Kelas Dr. Dibya'
        });
    }
});

// Staff: list sessions (active + inactive)
router.get('/sessions', verifyToken, requireMenuAccess('klinik_privat'), async (req, res) => {
    try {
        await ensureTables();

        const [rows] = await db.query(`
            SELECT
                s.*,
                COALESCE(r.registered_count, 0) AS registered_count
            FROM birth_class_sessions s
            LEFT JOIN (
                SELECT session_id, COUNT(*) AS registered_count
                FROM birth_class_registrations
                WHERE status != 'cancelled'
                GROUP BY session_id
            ) r ON r.session_id = s.id
            ORDER BY s.session_date DESC, s.start_time DESC
        `);

        res.json({
            success: true,
            data: rows.map(mapSessionRow)
        });
    } catch (error) {
        console.error('Error loading birth class sessions (staff):', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat data sesi kelas'
        });
    }
});

// Staff: create session
router.post('/sessions', verifyToken, requireMenuAccess('klinik_privat'), async (req, res) => {
    try {
        await ensureTables();

        const {
            class_title,
            session_date,
            start_time,
            end_time,
            location,
            instructor_name,
            quota,
            learning_points,
            items_to_bring,
            price,
            benefits,
            notes
        } = req.body || {};

        const classTitle = String(class_title || '').trim();
        const locationText = String(location || '').trim();
        const instructor = String(instructor_name || '').trim();
        const learningPoints = String(learning_points || '').trim();
        const itemsToBring = String(items_to_bring || '').trim();
        const benefitsText = String(benefits || '').trim();
        const noteText = String(notes || '').trim();
        const quotaNumber = Number(quota || 0);
        const priceNumber = normalizeDecimal(price, 0);

        if (!classTitle || !session_date || !start_time || !locationText || !quotaNumber) {
            return res.status(400).json({
                success: false,
                message: 'class_title, session_date, start_time, location, dan quota wajib diisi'
            });
        }

        if (Number.isNaN(quotaNumber) || quotaNumber < 1 || quotaNumber > 200) {
            return res.status(400).json({
                success: false,
                message: 'Quota harus antara 1 hingga 200'
            });
        }

        if (Number.isNaN(priceNumber) || priceNumber < 0 || priceNumber > 1000000000) {
            return res.status(400).json({
                success: false,
                message: 'Harga kelas tidak valid'
            });
        }

        await db.query(`
            INSERT INTO birth_class_sessions
            (class_title, session_date, start_time, end_time, location, instructor_name, quota, learning_points, items_to_bring, price, benefits, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            classTitle,
            session_date,
            start_time,
            end_time || null,
            locationText,
            instructor || null,
            quotaNumber,
            learningPoints || null,
            itemsToBring || null,
            priceNumber,
            benefitsText || null,
            noteText || null,
            req.user?.name || req.user?.id || 'staff'
        ]);

        res.status(201).json({
            success: true,
            message: 'Sesi Kelas Dr. Dibya berhasil dibuat'
        });
    } catch (error) {
        console.error('Error creating birth class session:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal membuat sesi kelas'
        });
    }
});

// Staff: update session
router.put('/sessions/:id', verifyToken, requireMenuAccess('klinik_privat'), async (req, res) => {
    try {
        await ensureTables();

        const sessionId = Number(req.params.id);
        const {
            class_title,
            session_date,
            start_time,
            end_time,
            location,
            instructor_name,
            quota,
            learning_points,
            items_to_bring,
            price,
            benefits,
            is_active,
            notes
        } = req.body || {};

        const classTitle = String(class_title || '').trim();
        const locationText = String(location || '').trim();
        const instructor = String(instructor_name || '').trim();
        const learningPoints = String(learning_points || '').trim();
        const itemsToBring = String(items_to_bring || '').trim();
        const benefitsText = String(benefits || '').trim();
        const noteText = String(notes || '').trim();
        const quotaNumber = Number(quota || 0);
        const priceNumber = normalizeDecimal(price, 0);
        const activeValue = is_active === true || is_active === 1 ? 1 : 0;

        if (!sessionId || !classTitle || !session_date || !start_time || !locationText || !quotaNumber) {
            return res.status(400).json({
                success: false,
                message: 'Data sesi belum lengkap'
            });
        }

        if (Number.isNaN(quotaNumber) || quotaNumber < 1 || quotaNumber > 200) {
            return res.status(400).json({
                success: false,
                message: 'Quota harus antara 1 hingga 200'
            });
        }

        if (Number.isNaN(priceNumber) || priceNumber < 0 || priceNumber > 1000000000) {
            return res.status(400).json({
                success: false,
                message: 'Harga kelas tidak valid'
            });
        }

        const [result] = await db.query(`
            UPDATE birth_class_sessions
            SET class_title = ?,
                session_date = ?,
                start_time = ?,
                end_time = ?,
                location = ?,
                instructor_name = ?,
                quota = ?,
                learning_points = ?,
                items_to_bring = ?,
                price = ?,
                benefits = ?,
                is_active = ?,
                notes = ?
            WHERE id = ?
        `, [
            classTitle,
            session_date,
            start_time,
            end_time || null,
            locationText,
            instructor || null,
            quotaNumber,
            learningPoints || null,
            itemsToBring || null,
            priceNumber,
            benefitsText || null,
            activeValue,
            noteText || null,
            sessionId
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sesi kelas tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: 'Sesi kelas berhasil diperbarui'
        });
    } catch (error) {
        console.error('Error updating birth class session:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memperbarui sesi kelas'
        });
    }
});

// Staff: toggle active session
router.patch('/sessions/:id/status', verifyToken, requireMenuAccess('klinik_privat'), async (req, res) => {
    try {
        await ensureTables();

        const sessionId = Number(req.params.id);
        const isActive = req.body?.is_active === true || req.body?.is_active === 1 ? 1 : 0;

        const [result] = await db.query(
            'UPDATE birth_class_sessions SET is_active = ? WHERE id = ?',
            [isActive, sessionId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sesi kelas tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: isActive ? 'Sesi kelas diaktifkan' : 'Sesi kelas dinonaktifkan'
        });
    } catch (error) {
        console.error('Error toggling birth class session status:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengubah status sesi kelas'
        });
    }
});

// Staff: list registrations
router.get('/registrations', verifyToken, requireMenuAccess('klinik_privat'), async (req, res) => {
    try {
        await ensureTables();

        const { status, session_id } = req.query;
        let query = `
            SELECT
                r.*,
                s.class_title,
                s.session_date,
                s.start_time,
                s.end_time,
                s.location,
                s.instructor_name
            FROM birth_class_registrations r
            JOIN birth_class_sessions s ON s.id = r.session_id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND r.status = ?';
            params.push(status);
        }

        if (session_id) {
            query += ' AND r.session_id = ?';
            params.push(Number(session_id));
        }

        query += ' ORDER BY r.registered_at DESC';

        const [rows] = await db.query(query, params);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error loading birth class registrations:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memuat data pendaftar kelas'
        });
    }
});

// Staff: update registration status
router.patch('/registrations/:id/status', verifyToken, requireMenuAccess('klinik_privat'), async (req, res) => {
    try {
        await ensureTables();

        const registrationId = Number(req.params.id);
        const status = String(req.body?.status || '').trim();
        const adminNotes = String(req.body?.admin_notes || '').trim();
        const allowedStatus = ['registered', 'confirmed', 'attended', 'cancelled'];

        if (!allowedStatus.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status tidak valid'
            });
        }

        const [result] = await db.query(
            'UPDATE birth_class_registrations SET status = ?, admin_notes = ? WHERE id = ?',
            [status, adminNotes || null, registrationId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Data pendaftaran tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: 'Status pendaftaran berhasil diperbarui'
        });
    } catch (error) {
        console.error('Error updating birth class registration status:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memperbarui status pendaftaran'
        });
    }
});

module.exports = router;
