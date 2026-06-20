/**
 * Staff Briefing Route — Daily checklist + "Mari Bekerja" duty log.
 * Today = local server date (WIB).
 */

const express = require('express');
const db = require('../db');
const { verifyToken, verifyStaffToken, requireSuperadmin } = require('../middleware/auth');
const { ROLE_NAMES, isSuperadminRole } = require('../constants/roles');

const router = express.Router();

// Local date YYYY-MM-DD (WIB)
function todayLocalDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function loadActiveStaff() {
    const [rows] = await db.query(
        `SELECT u.new_id AS staff_id, u.name, u.email, u.role,
                r.display_name AS role_display
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE u.user_type = 'staff' AND u.is_active = 1
         ORDER BY u.name ASC`
    );
    return rows.map(r => ({
        staff_id: r.staff_id,
        name: r.name,
        email: r.email,
        role: r.role,
        role_display: r.role_display || r.role || ''
    }));
}

function canStartBriefing(user) {
    return Boolean(
        user &&
        (user.is_superadmin || user.role === ROLE_NAMES.DOKTER || isSuperadminRole(user.role_id))
    );
}

// GET /api/staff-briefing/today
router.get('/today', verifyToken, verifyStaffToken, async (req, res) => {
    try {
        const today = todayLocalDate();
        const currentStaffId = String((req.user && (req.user.id || req.user.new_id || '')) || '').trim();

        // Patient count for today's Sunday clinic
        const [pc] = await db.query(
            `SELECT COUNT(*) AS cnt
             FROM sunday_appointments
             WHERE appointment_date = ?
               AND status IN ('confirmed', 'pending_confirmation')`,
            [today]
        );
        const patient_count = Number(pc[0] ? pc[0].cnt : 0);

        const active_staff = await loadActiveStaff();

        // Existing briefing rows for today
        const [briefs] = await db.query(
            `SELECT staff_id, checklist_json, started_at, created_at, updated_at
             FROM staff_daily_briefings
             WHERE briefing_date = ?`,
            [today]
        );
        const checked_staff_ids = briefs.map(b => b.staff_id);

        // Started flag: any duty log today with source='briefing'
        const [dutyToday] = await db.query(
            `SELECT staff_id FROM staff_duty_logs
             WHERE duty_date = ? AND source = 'briefing'`,
            [today]
        );
        const started_staff_ids = dutyToday.map(r => r.staff_id);
        const started = currentStaffId
            ? started_staff_ids.map(String).includes(currentStaffId)
            : false;

        return res.json({
            success: true,
            date: today,
            patient_count,
            active_staff,
            checked_staff_ids,
            started_staff_ids,
            started,
            can_start: canStartBriefing(req.user)
        });

    } catch (err) {
        console.error('[staff-briefing] today error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/staff-briefing/today/checklist  body: { checklist: { staff_id: bool } }
router.post('/today/checklist', verifyToken, verifyStaffToken, async (req, res) => {
    try {
        const today = todayLocalDate();
        const checklist = req.body && req.body.checklist;
        if (!checklist || typeof checklist !== 'object') {
            return res.status(400).json({ success: false, message: 'checklist tidak valid' });
        }

        const entries = Object.entries(checklist);
        let upserted = 0;
        let removed = 0;
        for (const [staffId, val] of entries) {
            if (!staffId) continue;
            const sid = String(staffId);
            const checked = Boolean(val);
            if (checked) {
                await db.query(
                    `INSERT INTO staff_daily_briefings (staff_id, briefing_date, checklist_json)
                     VALUES (?, ?, JSON_OBJECT('checked', true))
                     ON DUPLICATE KEY UPDATE
                       checklist_json = JSON_OBJECT('checked', true),
                       updated_at = NOW()`,
                    [sid, today]
                );
                upserted++;
            } else {
                const [r] = await db.query(
                    `DELETE FROM staff_daily_briefings
                     WHERE staff_id = ? AND briefing_date = ?
                       AND started_at IS NULL`,
                    [sid, today]
                );
                if (r.affectedRows) removed++;
            }
        }

        return res.json({ success: true, upserted, removed, date: today });

    } catch (err) {
        console.error('[staff-briefing] checklist error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/staff-briefing/today/start  body: { staff_ids: [] }
router.post('/today/start', verifyToken, verifyStaffToken, requireSuperadmin, async (req, res) => {
    try {
        const today = todayLocalDate();
        const ids = Array.isArray(req.body && req.body.staff_ids) ? req.body.staff_ids : [];
        const cleaned = Array.from(new Set(ids.map(x => String(x || '').trim()).filter(Boolean)));

        if (cleaned.length === 0) {
            return res.status(400).json({ success: false, message: 'staff_ids kosong' });
        }

        const placeholders = cleaned.map(() => '(?, ?, \'briefing\')').join(', ');
        const params = [];
        cleaned.forEach(sid => { params.push(sid, today); });

        const [r] = await db.query(
            `INSERT IGNORE INTO staff_duty_logs (staff_id, duty_date, source)
             VALUES ${placeholders}`,
            params
        );

        // Mark briefing rows as started_at
        await db.query(
            `UPDATE staff_daily_briefings
             SET started_at = COALESCE(started_at, NOW()), updated_at = NOW()
             WHERE briefing_date = ? AND staff_id IN (${cleaned.map(() => '?').join(',')})`,
            [today, ...cleaned]
        );

        return res.json({
            success: true,
            date: today,
            inserted: r.affectedRows,
            requested: cleaned.length
        });

    } catch (err) {
        console.error('[staff-briefing] start error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
