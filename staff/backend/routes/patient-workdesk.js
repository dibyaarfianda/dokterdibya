const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { verifyPatientToken } = require('../middleware/auth');

const router = express.Router();

let schemaReady = false;
let schemaPromise = null;

const DEFAULT_WIDGETS = [
    { id: 'active-booking', label: 'Booking Aktif', visible: true, order: 10 },
    { id: 'pregnancy-tracker', label: 'Pregnancy Tracker', visible: true, order: 20 },
    { id: 'documents', label: 'Dokumen', visible: true, order: 30 },
    { id: 'vitamin-reminder', label: 'Vitamin', visible: true, order: 40 },
    { id: 'tanya-dokter', label: 'Tanya Dokter', visible: true, order: 50 },
    { id: 'personal-note', label: 'Catatan Pribadi', visible: true, order: 60 },
    { id: 'favorites', label: 'Favorit', visible: true, order: 70 }
];

const PUBLIC_WIDGET_ALLOWLIST = new Set(['intro', 'favorites', 'journey-note', 'public-links']);

function setNoCacheHeaders(res, isPublic = false) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    if (!isPublic) {
        res.set('Vary', 'Authorization');
    }
}

function parseJsonSafe(value, fallbackValue) {
    if (!value) return fallbackValue;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_error) {
        return fallbackValue;
    }
}

function normalizeText(value, maxLength, fallbackValue = '') {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!text) return fallbackValue;
    return text.slice(0, maxLength);
}

function normalizeMultilineText(value, maxLength, fallbackValue = '') {
    const text = String(value == null ? '' : value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!text) return fallbackValue;
    return text.slice(0, maxLength);
}

function normalizeHexColor(value, fallbackValue = '#5c7f72') {
    const text = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallbackValue;
}

function getDefaultLayout() {
    return {
        version: 1,
        mode: 'mobile-stack',
        widgets: DEFAULT_WIDGETS.map((widget) => ({ ...widget })),
        favorites: [
            { id: 'album-usg', label: 'Album USG', icon: 'fa-image', url: '/album-usg-trial.html' },
            { id: 'booking', label: 'Booking', icon: 'fa-calendar-check', url: '/booking-klinik-trial.html' },
            { id: 'tanya-dokter', label: 'Tanya Dokter', icon: 'fa-comments', url: '/tanya-dokter-trial.html' }
        ]
    };
}

function getDefaultTheme() {
    return {
        corner_name: 'My Corner',
        note: 'Simpan catatan kecil, atur preferensi, dan pin hal yang sering Anda buka.',
        preset: 'calm',
        accent: '#5c7f72'
    };
}

function getDefaultPublicProfile(patientName = '') {
    const firstName = normalizeText(patientName, 32, 'Pasien').split(' ')[0] || 'Pasien';
    return {
        display_name: firstName,
        corner_name: 'My Corner',
        intro: 'Ruang publik kecil untuk berbagi hal yang ingin saya tampilkan.',
        avatar_initials: firstName.slice(0, 2).toUpperCase()
    };
}

function normalizeFavorite(item) {
    if (!item || typeof item !== 'object') return null;
    const label = normalizeText(item.label, 32);
    const url = normalizeText(item.url, 180);
    if (!label || !url || !url.startsWith('/')) return null;
    return {
        id: normalizeText(item.id, 40, label.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
        label,
        icon: normalizeText(item.icon, 32, 'fa-circle'),
        url
    };
}

function normalizeLayout(input) {
    const fallback = getDefaultLayout();
    const source = input && typeof input === 'object' ? input : fallback;
    const widgets = Array.isArray(source.widgets) ? source.widgets : fallback.widgets;
    const normalizedWidgets = widgets.slice(0, 20).map((widget, index) => {
        const id = normalizeText(widget && widget.id, 50);
        if (!id) return null;
        return {
            id,
            label: normalizeText(widget.label, 40, id),
            visible: widget.visible !== false,
            order: Number.isFinite(Number(widget.order)) ? Number(widget.order) : (index + 1) * 10
        };
    }).filter(Boolean);

    const favorites = Array.isArray(source.favorites)
        ? source.favorites.map(normalizeFavorite).filter(Boolean).slice(0, 8)
        : fallback.favorites;

    return {
        version: 1,
        mode: 'mobile-stack',
        widgets: normalizedWidgets.length ? normalizedWidgets : fallback.widgets,
        favorites
    };
}

function normalizeTheme(input) {
    const fallback = getDefaultTheme();
    const source = input && typeof input === 'object' ? input : fallback;
    return {
        corner_name: normalizeText(source.corner_name, 32, fallback.corner_name),
        note: normalizeMultilineText(source.note, 500, fallback.note),
        preset: normalizeText(source.preset, 24, fallback.preset),
        accent: normalizeHexColor(source.accent, fallback.accent)
    };
}

function normalizePublicWidgets(input) {
    if (!Array.isArray(input)) return ['intro', 'favorites'];
    return input
        .map((value) => normalizeText(value, 40))
        .filter((value, index, arr) => value && PUBLIC_WIDGET_ALLOWLIST.has(value) && arr.indexOf(value) === index)
        .slice(0, 8);
}

function normalizePublicProfile(input, patientName = '') {
    const fallback = getDefaultPublicProfile(patientName);
    const source = input && typeof input === 'object' ? input : fallback;
    return {
        display_name: normalizeText(source.display_name, 32, fallback.display_name),
        corner_name: normalizeText(source.corner_name, 32, fallback.corner_name),
        intro: normalizeMultilineText(source.intro, 220, fallback.intro),
        avatar_initials: normalizeText(source.avatar_initials, 2, fallback.avatar_initials).toUpperCase()
    };
}

function normalizePublicSettings(input, existing = {}, patientName = '') {
    const source = input && typeof input === 'object' ? input : {};
    const existingProfile = existing.public_profile || getDefaultPublicProfile(patientName);
    return {
        public_enabled: Boolean(source.public_enabled),
        public_profile: normalizePublicProfile(source.public_profile || existingProfile, patientName),
        public_widgets: normalizePublicWidgets(source.public_widgets || existing.public_widgets || ['intro', 'favorites']),
        regenerate_share_code: Boolean(source.regenerate_share_code)
    };
}

function createShareCode() {
    return crypto.randomBytes(9).toString('base64url');
}

async function ensureUniqueShareCode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = createShareCode();
        const [rows] = await db.query(
            'SELECT patient_id FROM patient_workdesk_layouts WHERE share_code = ? LIMIT 1',
            [code]
        );
        if (!rows.length) return code;
    }
    return crypto.randomBytes(12).toString('base64url');
}

async function ensureSchema() {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        await db.query(
            `CREATE TABLE IF NOT EXISTS patient_workdesk_layouts (
                patient_id VARCHAR(10) NOT NULL,
                layout_json JSON NOT NULL,
                theme_json JSON NULL,
                public_enabled TINYINT(1) NOT NULL DEFAULT 0,
                share_code VARCHAR(32) NULL,
                public_profile_json JSON NULL,
                public_widgets_json JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (patient_id),
                UNIQUE KEY uniq_patient_workdesk_share_code (share_code),
                INDEX idx_patient_workdesk_public (public_enabled, share_code),
                CONSTRAINT fk_patient_workdesk_patient
                    FOREIGN KEY (patient_id) REFERENCES patients(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );

        schemaReady = true;
    })();

    return schemaPromise;
}

async function getPatientName(patientId) {
    const [rows] = await db.query('SELECT full_name FROM patients WHERE id = ? LIMIT 1', [patientId]);
    return rows[0]?.full_name || '';
}

async function getStoredLayout(patientId) {
    const [rows] = await db.query(
        `SELECT patient_id, layout_json, theme_json, public_enabled, share_code,
                public_profile_json, public_widgets_json, updated_at
         FROM patient_workdesk_layouts
         WHERE patient_id = ?
         LIMIT 1`,
        [patientId]
    );

    if (!rows.length) return null;

    const row = rows[0];
    const patientName = await getPatientName(patientId);
    return {
        patient_id: row.patient_id,
        layout: normalizeLayout(parseJsonSafe(row.layout_json, getDefaultLayout())),
        theme: normalizeTheme(parseJsonSafe(row.theme_json, getDefaultTheme())),
        public_enabled: Boolean(row.public_enabled),
        share_code: row.share_code || null,
        public_profile: normalizePublicProfile(parseJsonSafe(row.public_profile_json, null), patientName),
        public_widgets: normalizePublicWidgets(parseJsonSafe(row.public_widgets_json, ['intro', 'favorites'])),
        updated_at: row.updated_at || null
    };
}

function toOwnerResponse(record, patientName = '') {
    const data = record || {
        layout: getDefaultLayout(),
        theme: getDefaultTheme(),
        public_enabled: false,
        share_code: null,
        public_profile: getDefaultPublicProfile(patientName),
        public_widgets: ['intro', 'favorites'],
        updated_at: null
    };

    return {
        layout: normalizeLayout(data.layout),
        theme: normalizeTheme(data.theme),
        public_settings: {
            public_enabled: Boolean(data.public_enabled),
            share_code: data.share_code || null,
            public_profile: normalizePublicProfile(data.public_profile, patientName),
            public_widgets: normalizePublicWidgets(data.public_widgets)
        },
        updated_at: data.updated_at || null
    };
}

async function saveLayout(patientId, layout, theme, publicSettings = null) {
    const existing = await getStoredLayout(patientId);
    const patientName = await getPatientName(patientId);
    const normalizedLayout = normalizeLayout(layout || existing?.layout || getDefaultLayout());
    const normalizedTheme = normalizeTheme(theme || existing?.theme || getDefaultTheme());
    const normalizedPublic = publicSettings
        ? normalizePublicSettings(publicSettings, existing || {}, patientName)
        : {
            public_enabled: existing?.public_enabled || false,
            public_profile: existing?.public_profile || getDefaultPublicProfile(patientName),
            public_widgets: existing?.public_widgets || ['intro', 'favorites'],
            regenerate_share_code: false
        };

    let shareCode = existing?.share_code || null;
    if (normalizedPublic.public_enabled && (!shareCode || normalizedPublic.regenerate_share_code)) {
        shareCode = await ensureUniqueShareCode();
    }

    await db.query(
        `INSERT INTO patient_workdesk_layouts
            (patient_id, layout_json, theme_json, public_enabled, share_code, public_profile_json, public_widgets_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            layout_json = VALUES(layout_json),
            theme_json = VALUES(theme_json),
            public_enabled = VALUES(public_enabled),
            share_code = VALUES(share_code),
            public_profile_json = VALUES(public_profile_json),
            public_widgets_json = VALUES(public_widgets_json),
            updated_at = NOW()`,
        [
            patientId,
            JSON.stringify(normalizedLayout),
            JSON.stringify(normalizedTheme),
            normalizedPublic.public_enabled ? 1 : 0,
            shareCode,
            JSON.stringify(normalizedPublic.public_profile),
            JSON.stringify(normalizedPublic.public_widgets)
        ]
    );

    return getStoredLayout(patientId);
}

router.use(async (_req, _res, next) => {
    try {
        await ensureSchema();
        next();
    } catch (error) {
        next(error);
    }
});

router.get('/public/:shareCode', async (req, res) => {
    try {
        setNoCacheHeaders(res, true);

        const shareCode = normalizeText(req.params.shareCode, 32);
        if (!shareCode) {
            return res.status(404).json({ success: false, message: 'Corner tidak ditemukan' });
        }

        const [rows] = await db.query(
            `SELECT l.patient_id, l.theme_json, l.public_profile_json, l.public_widgets_json, l.updated_at,
                    p.full_name
             FROM patient_workdesk_layouts l
             JOIN patients p ON p.id = l.patient_id
             WHERE l.public_enabled = 1 AND l.share_code = ?
             LIMIT 1`,
            [shareCode]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Corner tidak ditemukan atau belum dibuka untuk publik' });
        }

        const row = rows[0];
        const theme = normalizeTheme(parseJsonSafe(row.theme_json, getDefaultTheme()));
        const profile = normalizePublicProfile(parseJsonSafe(row.public_profile_json, null), row.full_name || '');
        const widgets = normalizePublicWidgets(parseJsonSafe(row.public_widgets_json, ['intro', 'favorites']));

        return res.json({
            success: true,
            data: {
                profile,
                theme: {
                    corner_name: theme.corner_name,
                    preset: theme.preset,
                    accent: theme.accent
                },
                public_widgets: widgets,
                updated_at: row.updated_at || null
            }
        });
    } catch (error) {
        console.error('[patient-workdesk] public corner error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat public corner' });
    }
});

router.use(verifyPatientToken);

router.get('/layout', async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const patientId = String(req.user?.id || '').trim();
        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Pasien tidak valid' });
        }

        const patientName = await getPatientName(patientId);
        const stored = await getStoredLayout(patientId);
        return res.json({ success: true, data: toOwnerResponse(stored, patientName) });
    } catch (error) {
        console.error('[patient-workdesk] get layout error:', error);
        return res.status(500).json({ success: false, message: 'Gagal memuat My Corner' });
    }
});

router.put('/layout', async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const patientId = String(req.user?.id || '').trim();
        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Pasien tidak valid' });
        }

        const saved = await saveLayout(
            patientId,
            req.body?.layout,
            req.body?.theme,
            req.body?.public_settings || null
        );
        const patientName = await getPatientName(patientId);
        return res.json({ success: true, data: toOwnerResponse(saved, patientName) });
    } catch (error) {
        console.error('[patient-workdesk] save layout error:', error);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan My Corner' });
    }
});

router.put('/public-settings', async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const patientId = String(req.user?.id || '').trim();
        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Pasien tidak valid' });
        }

        const existing = await getStoredLayout(patientId);
        const saved = await saveLayout(
            patientId,
            existing?.layout || getDefaultLayout(),
            existing?.theme || getDefaultTheme(),
            req.body || {}
        );
        const patientName = await getPatientName(patientId);
        return res.json({ success: true, data: toOwnerResponse(saved, patientName) });
    } catch (error) {
        console.error('[patient-workdesk] save public settings error:', error);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan publik' });
    }
});

router.post('/reset', async (req, res) => {
    try {
        setNoCacheHeaders(res);
        const patientId = String(req.user?.id || '').trim();
        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Pasien tidak valid' });
        }

        const existing = await getStoredLayout(patientId);
        const saved = await saveLayout(
            patientId,
            getDefaultLayout(),
            getDefaultTheme(),
            {
                public_enabled: existing?.public_enabled || false,
                public_profile: existing?.public_profile || null,
                public_widgets: existing?.public_widgets || ['intro', 'favorites']
            }
        );
        const patientName = await getPatientName(patientId);
        return res.json({ success: true, data: toOwnerResponse(saved, patientName) });
    } catch (error) {
        console.error('[patient-workdesk] reset layout error:', error);
        return res.status(500).json({ success: false, message: 'Gagal reset My Corner' });
    }
});

module.exports = router;
