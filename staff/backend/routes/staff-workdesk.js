const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const db = require('../db');
const r2Storage = require('../services/r2Storage');
const { verifyToken, verifyStaffToken } = require('../middleware/auth');

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

let schemaReady = false;
let schemaPromise = null;
const columnCheckCache = new Map();

function getUserId(req) {
    return String(req.user?.id || '').trim();
}

function parseJsonSafe(value, fallbackValue) {
    if (!value) return fallbackValue;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallbackValue;
    }
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function formatDateLocal(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthRangeLocal(monthStr) {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;

    if (typeof monthStr === 'string' && /^\d{4}-\d{2}$/.test(monthStr)) {
        const parts = monthStr.split('-').map(Number);
        if (parts[0] >= 2000 && parts[0] <= 2100 && parts[1] >= 1 && parts[1] <= 12) {
            year = parts[0];
            month = parts[1];
        }
    }

    const start = `${year}-${pad2(month)}-01 00:00:00`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const end = `${nextYear}-${pad2(nextMonth)}-01 00:00:00`;

    return { monthLabel: `${year}-${pad2(month)}`, start, end };
}

function getWeekRangeLocal() {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;

    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(now.getDate() + mondayOffset);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    return {
        start: formatDateLocal(startDate),
        end: formatDateLocal(endDate),
        startDate,
        endDate
    };
}

function computeNextBirthdayDays(birthDate) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) return null;

    const month = birth.getMonth();
    const date = birth.getDate();

    let upcoming = new Date(now.getFullYear(), month, date);
    upcoming.setHours(0, 0, 0, 0);

    if (upcoming < now) {
        upcoming = new Date(now.getFullYear() + 1, month, date);
        upcoming.setHours(0, 0, 0, 0);
    }

    return Math.round((upcoming - now) / 86400000);
}

function setNoCacheHeaders(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Vary', 'Authorization');
}

function getDefaultLayout() {
    return {
        version: 1,
        widgets: [
            {
                instance_id: 'clock-main',
                widget_id: 'clock-greeting',
                x: 0,
                y: 0,
                w: 4,
                h: 2,
                config: {}
            },
            {
                instance_id: 'shortcut-main',
                widget_id: 'shortcut-menu',
                x: 4,
                y: 0,
                w: 8,
                h: 2,
                config: { pinned: ['nav-dashboard', 'nav-kelola-pasien', 'nav-jadwal', 'nav-docboard', 'nav-notifications'] }
            },
            {
                instance_id: 'notes-main',
                widget_id: 'sticky-notes',
                x: 0,
                y: 2,
                w: 6,
                h: 3,
                config: { notes: [{ id: 'n1', color: 'yellow', text: '' }] }
            },
            {
                instance_id: 'todo-main',
                widget_id: 'todo-list',
                x: 6,
                y: 2,
                w: 6,
                h: 3,
                config: { items: [] }
            },
            {
                instance_id: 'stats-main',
                widget_id: 'mini-stats',
                x: 0,
                y: 5,
                w: 12,
                h: 2,
                config: {}
            }
        ]
    };
}

function getDefaultTheme() {
    return {
        accent_color: '#0d6efd',
        wallpaper_url: null,
        wallpaper_download_url: null
    };
}

async function columnExists(tableName, columnName) {
    const cacheKey = `${tableName}:${columnName}`;
    if (columnCheckCache.has(cacheKey)) {
        return columnCheckCache.get(cacheKey);
    }

    const [rows] = await db.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = ?
           AND column_name = ?
         LIMIT 1`,
        [tableName, columnName]
    );

    const exists = rows.length > 0;
    columnCheckCache.set(cacheKey, exists);
    return exists;
}

async function ensureSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await db.query(
            `CREATE TABLE IF NOT EXISTS staff_workdesk_layouts (
                user_id VARCHAR(64) NOT NULL,
                layout_json JSON NOT NULL,
                theme_json JSON NULL,
                wallpaper_url VARCHAR(1024) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id),
                INDEX idx_staff_workdesk_updated_at (updated_at),
                CONSTRAINT fk_staff_workdesk_user
                    FOREIGN KEY (user_id) REFERENCES users(new_id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );

        schemaReady = true;
    })();

    return schemaPromise;
}

async function getStoredLayout(userId) {
    const [rows] = await db.query(
        `SELECT user_id, layout_json, theme_json, wallpaper_url, updated_at
         FROM staff_workdesk_layouts
         WHERE user_id = ?
         LIMIT 1`,
        [userId]
    );

    if (rows.length === 0) {
        return null;
    }

    const row = rows[0];
    const layout = parseJsonSafe(row.layout_json, getDefaultLayout());
    const theme = parseJsonSafe(row.theme_json, getDefaultTheme());
    const wallpaperUrl = row.wallpaper_url || theme.wallpaper_url || null;

    return {
        user_id: row.user_id,
        layout,
        theme,
        wallpaper_url: wallpaperUrl,
        updated_at: row.updated_at
    };
}

async function toLayoutResponse(record) {
    const theme = {
        ...getDefaultTheme(),
        ...(record.theme || {})
    };

    const wallpaperKey = record.wallpaper_url || theme.wallpaper_url || null;
    let wallpaperSignedUrl = null;

    if (wallpaperKey && r2Storage.isR2Configured()) {
        try {
            wallpaperSignedUrl = await r2Storage.getSignedDownloadUrl(wallpaperKey, 3600);
        } catch (error) {
            wallpaperSignedUrl = null;
            console.warn('[staff-workdesk] wallpaper signed URL generation failed:', {
                user_id: record.user_id || null,
                wallpaper_key: wallpaperKey,
                error: error && error.message ? error.message : String(error)
            });
        }
    }

    return {
        layout: record.layout || getDefaultLayout(),
        theme: {
            ...theme,
            wallpaper_url: wallpaperKey,
            wallpaper_download_url: wallpaperSignedUrl
        },
        updated_at: record.updated_at || null
    };
}

router.use(verifyToken, verifyStaffToken);
router.use(async (_req, _res, next) => {
    try {
        await ensureSchema();
        next();
    } catch (error) {
        next(error);
    }
});

router.get('/layout', async (req, res) => {
    try {
        setNoCacheHeaders(res);

        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User tidak valid' });
        }

        const stored = await getStoredLayout(userId);
        const responseData = stored
            ? await toLayoutResponse(stored)
            : await toLayoutResponse({ layout: getDefaultLayout(), theme: getDefaultTheme(), wallpaper_url: null, updated_at: null });

        return res.json({ success: true, data: responseData });
    } catch (error) {
        console.error('[staff-workdesk] get layout error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat layout' });
    }
});

router.put('/layout', async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User tidak valid' });
        }

        const layoutInput = req.body?.layout;
        const themeInput = req.body?.theme;

        if (!layoutInput || typeof layoutInput !== 'object' || !Array.isArray(layoutInput.widgets)) {
            return res.status(400).json({ success: false, message: 'Format layout tidak valid' });
        }

        const existing = await getStoredLayout(userId);
        const existingTheme = existing?.theme || getDefaultTheme();

        const nextTheme = {
            ...existingTheme,
            ...(themeInput && typeof themeInput === 'object' ? themeInput : {})
        };

        const wallpaperUrl =
            typeof nextTheme.wallpaper_url === 'string' && nextTheme.wallpaper_url.trim()
                ? nextTheme.wallpaper_url.trim()
                : existing?.wallpaper_url || null;

        await db.query(
            `INSERT INTO staff_workdesk_layouts (user_id, layout_json, theme_json, wallpaper_url)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                layout_json = VALUES(layout_json),
                theme_json = VALUES(theme_json),
                wallpaper_url = VALUES(wallpaper_url),
                updated_at = NOW()`,
            [
                userId,
                JSON.stringify(layoutInput),
                JSON.stringify(nextTheme),
                wallpaperUrl
            ]
        );

        const saved = await getStoredLayout(userId);
        const responseData = await toLayoutResponse(saved || {
            layout: layoutInput,
            theme: nextTheme,
            wallpaper_url: wallpaperUrl,
            updated_at: null
        });

        return res.json({ success: true, data: responseData });
    } catch (error) {
        console.error('[staff-workdesk] save layout error:', error);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan layout' });
    }
});

router.post('/wallpaper', upload.single('wallpaper'), async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User tidak valid' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File wallpaper wajib diisi' });
        }

        if (!r2Storage.isR2Configured()) {
            return res.status(503).json({ success: false, message: 'R2 belum dikonfigurasi di server' });
        }

        const optimizedBuffer = await sharp(req.file.buffer)
            .rotate()
            .resize({ width: 1920, withoutEnlargement: true })
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer();

        const fileName = `wallpaper-${Date.now()}.jpg`;
        const uploadResult = await r2Storage.uploadFile(
            optimizedBuffer,
            fileName,
            'image/jpeg',
            `kantor-saya-wallpapers/${userId}`
        );

        const existing = await getStoredLayout(userId);
        const oldWallpaper = existing?.wallpaper_url || null;

        const nextTheme = {
            ...(existing?.theme || getDefaultTheme()),
            wallpaper_url: uploadResult.key
        };

        await db.query(
            `INSERT INTO staff_workdesk_layouts (user_id, layout_json, theme_json, wallpaper_url)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                theme_json = VALUES(theme_json),
                wallpaper_url = VALUES(wallpaper_url),
                updated_at = NOW()`,
            [
                userId,
                JSON.stringify(existing?.layout || getDefaultLayout()),
                JSON.stringify(nextTheme),
                uploadResult.key
            ]
        );

        if (oldWallpaper && oldWallpaper !== uploadResult.key) {
            try {
                await r2Storage.deleteFile(oldWallpaper);
            } catch (_) {
                // Ignore old file deletion failure.
            }
        }

        const downloadUrl = await r2Storage.getSignedDownloadUrl(uploadResult.key, 3600);

        return res.json({
            success: true,
            data: {
                wallpaper_url: uploadResult.key,
                wallpaper_download_url: downloadUrl
            }
        });
    } catch (error) {
        console.error('[staff-workdesk] upload wallpaper error:', error);
        return res.status(500).json({ success: false, message: 'Gagal upload wallpaper' });
    }
});

router.get('/widgets/point-saya', async (req, res) => {
    try {
        const userId = getUserId(req);
        const range = monthRangeLocal(req.query?.month);

        const [[pointRow]] = await db.query(
            `SELECT
                COALESCE(SUM(rating), 0) AS total_points,
                COUNT(*) AS rated_sessions,
                ROUND(AVG(rating), 2) AS avg_rating
             FROM support_chat_ratings
             WHERE owner_staff_id = ?
               AND created_at >= ?
               AND created_at < ?`,
            [userId, range.start, range.end]
        );

        const [[resolvedRow]] = await db.query(
            `SELECT COUNT(*) AS resolved_sessions
             FROM support_chat_sessions
             WHERE owner_staff_id = ?
               AND status = 'resolved'
               AND resolved_at >= ?
               AND resolved_at < ?`,
            [userId, range.start, range.end]
        );

        const [[dutyRow]] = await db.query(
            `SELECT COUNT(*) AS duty_count
             FROM staff_duty_logs
             WHERE staff_id = ?
               AND duty_date >= DATE(?)
               AND duty_date < DATE(?)`,
            [userId, range.start, range.end]
        );

        return res.json({
            success: true,
            data: {
                month: range.monthLabel,
                total_points: Number(pointRow?.total_points || 0),
                rated_sessions: Number(pointRow?.rated_sessions || 0),
                avg_rating: Number(pointRow?.avg_rating || 0),
                resolved_sessions: Number(resolvedRow?.resolved_sessions || 0),
                duty_count: Number(dutyRow?.duty_count || 0)
            }
        });
    } catch (error) {
        console.error('[staff-workdesk] point widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat Point Saya' });
    }
});

router.get('/widgets/briefing-hari-ini', async (req, res) => {
    try {
        const userId = getUserId(req);
        const today = formatDateLocal(new Date());

        const [[briefingRow]] = await db.query(
            `SELECT staff_id, checklist_json, started_at, updated_at
             FROM staff_daily_briefings
             WHERE briefing_date = ?
               AND staff_id = ?
             LIMIT 1`,
            [today, userId]
        );

        const [[dutyRow]] = await db.query(
            `SELECT created_at
             FROM staff_duty_logs
             WHERE duty_date = ?
               AND staff_id = ?
             LIMIT 1`,
            [today, userId]
        );

        const [[patientCountRow]] = await db.query(
            `SELECT COUNT(*) AS patient_count
             FROM sunday_appointments
             WHERE appointment_date = ?
               AND status IN ('confirmed', 'pending_confirmation', 'completed')`,
            [today]
        );

        return res.json({
            success: true,
            data: {
                date: today,
                patient_count: Number(patientCountRow?.patient_count || 0),
                checked: Boolean(briefingRow),
                started: Boolean(dutyRow),
                started_at: dutyRow?.created_at || briefingRow?.started_at || null,
                checklist: parseJsonSafe(briefingRow?.checklist_json, { checked: Boolean(briefingRow) })
            }
        });
    } catch (error) {
        console.error('[staff-workdesk] briefing widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat Briefing Hari Ini' });
    }
});

router.get('/widgets/jadwal-jaga', async (req, res) => {
    try {
        const userId = getUserId(req);
        const range = getWeekRangeLocal();

        const [rows] = await db.query(
            `SELECT duty_date
             FROM staff_duty_logs
             WHERE staff_id = ?
               AND duty_date >= ?
               AND duty_date <= ?
             ORDER BY duty_date ASC`,
            [userId, range.start, range.end]
        );

        const dutySet = new Set(rows.map((row) => formatDateLocal(row.duty_date)));

        const days = [];
        for (let i = 0; i < 7; i += 1) {
            const d = new Date(range.startDate);
            d.setDate(range.startDate.getDate() + i);
            const dateStr = formatDateLocal(d);
            days.push({
                date: dateStr,
                day_label: d.toLocaleDateString('id-ID', { weekday: 'short' }),
                has_duty: dutySet.has(dateStr)
            });
        }

        return res.json({
            success: true,
            data: {
                week_start: range.start,
                week_end: range.end,
                days
            }
        });
    } catch (error) {
        console.error('[staff-workdesk] jadwal-jaga widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat Jadwal Jaga' });
    }
});

router.get('/widgets/online-users', async (req, res) => {
    try {
        const io = req.app.get('io') || global.io;
        if (!io || !io.sockets || !io.sockets.sockets) {
            return res.json({ success: true, data: { total: 0, users: [] } });
        }

        const users = [];
        for (const [, socket] of io.sockets.sockets) {
            if (socket?.userId && socket?.userName) {
                users.push({
                    user_id: socket.userId,
                    name: socket.userName,
                    role: socket.userRole || '',
                    photo: socket.userPhoto || null,
                    activity: socket.userActivity || 'Online',
                    timestamp: socket.activityTimestamp || null
                });
            }
        }

        return res.json({
            success: true,
            data: {
                total: users.length,
                users: users.slice(0, 12)
            }
        });
    } catch (error) {
        console.error('[staff-workdesk] online-users widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat online users' });
    }
});

router.get('/widgets/quick-search-patients', async (req, res) => {
    try {
        const q = String(req.query?.q || '').trim();
        if (!q) {
            return res.json({ success: true, data: { items: [] } });
        }

        const term = `%${q}%`;
        const [rows] = await db.query(
            `SELECT id, full_name, whatsapp, last_visit
             FROM patients
             WHERE full_name LIKE ? OR id LIKE ? OR whatsapp LIKE ?
             ORDER BY last_visit DESC, created_at DESC
             LIMIT 8`,
            [term, term, term]
        );

        return res.json({ success: true, data: { items: rows } });
    } catch (error) {
        console.error('[staff-workdesk] quick-search widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal mencari pasien' });
    }
});

router.get('/widgets/mini-stats', async (req, res) => {
    try {
        const userId = getUserId(req);
        const today = formatDateLocal(new Date());
        const start = `${today} 00:00:00`;
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 1);
        const end = `${formatDateLocal(endDate)} 00:00:00`;

        const [[appointmentRow]] = await db.query(
            `SELECT COUNT(*) AS total
             FROM sunday_appointments
             WHERE appointment_date = ?
               AND status IN ('confirmed', 'pending_confirmation', 'completed')`,
            [today]
        );

        const [[supportOpenRow]] = await db.query(
            `SELECT COUNT(*) AS total
             FROM support_chat_sessions
             WHERE status = 'escalated'`
        );

        const [[questionOpenRow]] = await db.query(
            `SELECT COUNT(*) AS total
             FROM patient_questions
             WHERE status = 'open'`
        );

        const [[resolvedTodayRow]] = await db.query(
            `SELECT COUNT(*) AS total
             FROM support_chat_sessions
             WHERE owner_staff_id = ?
               AND status = 'resolved'
               AND resolved_at >= ?
               AND resolved_at < ?`,
            [userId, start, end]
        );

        return res.json({
            success: true,
            data: {
                appointments_today: Number(appointmentRow?.total || 0),
                support_open: Number(supportOpenRow?.total || 0),
                unanswered_questions: Number(questionOpenRow?.total || 0),
                my_resolved_today: Number(resolvedTodayRow?.total || 0)
            }
        });
    } catch (error) {
        console.error('[staff-workdesk] mini-stats widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat mini stats' });
    }
});

router.get('/widgets/recent-patients', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT p.id, p.full_name, p.whatsapp, sa.appointment_date, sa.created_at
             FROM sunday_appointments sa
             INNER JOIN patients p ON p.id = sa.patient_id
             WHERE sa.status IN ('confirmed', 'completed', 'pending_confirmation')
             ORDER BY sa.appointment_date DESC, sa.created_at DESC
             LIMIT 5`
        );

        return res.json({ success: true, data: { items: rows } });
    } catch (error) {
        console.error('[staff-workdesk] recent-patients widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat pasien terbaru' });
    }
});

router.get('/widgets/inventory-alert', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, name, stock, min_stock, category
             FROM obat
             WHERE is_active = 1
               AND stock <= min_stock
             ORDER BY stock ASC
             LIMIT 10`
        );

        return res.json({ success: true, data: { items: rows } });
    } catch (error) {
        console.error('[staff-workdesk] inventory-alert widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat alert stok' });
    }
});

router.get('/widgets/tanya-dokter-preview', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT pq.id, pq.status, pq.question_text, pq.created_at, p.full_name AS patient_name
             FROM patient_questions pq
             INNER JOIN patients p ON p.id = pq.patient_id
             WHERE pq.status = 'open'
             ORDER BY pq.created_at DESC
             LIMIT 3`
        );

        return res.json({ success: true, data: { items: rows } });
    } catch (error) {
        console.error('[staff-workdesk] tanya-dokter-preview widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat preview Tanya Dokter' });
    }
});

router.get('/widgets/recent-activity', async (req, res) => {
    try {
        const userId = getUserId(req);

        const [rows] = await db.query(
            `SELECT action, details, timestamp
             FROM activity_logs
             WHERE user_id = ?
             ORDER BY timestamp DESC
             LIMIT 5`,
            [userId]
        );

        return res.json({ success: true, data: { items: rows } });
    } catch (error) {
        console.error('[staff-workdesk] recent-activity widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat aktivitas terbaru' });
    }
});

router.get('/widgets/birthday-reminder', async (req, res) => {
    try {
        const windowDays = Math.max(1, Math.min(14, Number(req.query?.days || 7)));
        const today = new Date();
        const endWindow = new Date(today);
        endWindow.setDate(today.getDate() + windowDays);

        const startMonth = today.getMonth() + 1;
        const startDay = today.getDate();
        const endMonth = endWindow.getMonth() + 1;
        const endDay = endWindow.getDate();

        const sameMonthWindow = startMonth === endMonth;

        const hasPatientBirthDate = await columnExists('patients', 'birth_date');
        const hasUserBirthDate = await columnExists('users', 'birth_date');

        const items = [];

        if (hasPatientBirthDate) {
            const patientWhere = sameMonthWindow
                ? `MONTH(birth_date) = ? AND DAY(birth_date) BETWEEN ? AND ?`
                : `(
                    (MONTH(birth_date) = ? AND DAY(birth_date) >= ?)
                    OR
                    (MONTH(birth_date) = ? AND DAY(birth_date) <= ?)
                )`;

            const patientParams = sameMonthWindow
                ? [startMonth, startDay, endDay]
                : [startMonth, startDay, endMonth, endDay];

            const [patients] = await db.query(
                `SELECT id AS ref_id, full_name AS name, birth_date
                 FROM patients
                 WHERE birth_date IS NOT NULL
                   AND ${patientWhere}`,
                patientParams
            );

            for (const row of patients) {
                const daysUntil = computeNextBirthdayDays(row.birth_date);
                if (daysUntil !== null && daysUntil >= 0 && daysUntil <= windowDays) {
                    items.push({
                        type: 'patient',
                        ref_id: row.ref_id,
                        name: row.name,
                        birth_date: formatDateLocal(row.birth_date),
                        days_until: daysUntil
                    });
                }
            }
        }

        if (hasUserBirthDate) {
            const userWhere = sameMonthWindow
                ? `MONTH(birth_date) = ? AND DAY(birth_date) BETWEEN ? AND ?`
                : `(
                    (MONTH(birth_date) = ? AND DAY(birth_date) >= ?)
                    OR
                    (MONTH(birth_date) = ? AND DAY(birth_date) <= ?)
                )`;

            const userParams = sameMonthWindow
                ? [startMonth, startDay, endDay]
                : [startMonth, startDay, endMonth, endDay];

            const [users] = await db.query(
                `SELECT new_id AS ref_id, name, birth_date
                 FROM users
                 WHERE user_type = 'staff'
                   AND is_active = 1
                   AND birth_date IS NOT NULL
                   AND ${userWhere}`,
                userParams
            );

            for (const row of users) {
                const daysUntil = computeNextBirthdayDays(row.birth_date);
                if (daysUntil !== null && daysUntil >= 0 && daysUntil <= windowDays) {
                    items.push({
                        type: 'staff',
                        ref_id: row.ref_id,
                        name: row.name,
                        birth_date: formatDateLocal(row.birth_date),
                        days_until: daysUntil
                    });
                }
            }
        }

        items.sort((a, b) => a.days_until - b.days_until || a.name.localeCompare(b.name));

        return res.json({
            success: true,
            data: {
                window_days: windowDays,
                items: items.slice(0, 20)
            }
        });
    } catch (error) {
        console.error('[staff-workdesk] birthday-reminder widget error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat pengingat ulang tahun' });
    }
});

module.exports = router;
