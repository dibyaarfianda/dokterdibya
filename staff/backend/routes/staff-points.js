/**
 * Staff Points Route — Aggregate support-chat ratings + duty logs per active staff per month.
 * Formula v1: total_points = SUM(rating) for sessions owned by staff in given month (WIB).
 * Default period: current month in GMT+7 (WIB).
 */

const express = require('express');
const db = require('../db');
const { verifyToken, verifyStaffToken } = require('../middleware/auth');

const router = express.Router();

// GMT+7 month boundary helpers (server already runs WIB per AGENTS.md §14).
function parseMonth(monthStr) {
    // YYYY-MM → returns { start: 'YYYY-MM-01', end: 'YYYY-MM-01' next month }
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1; // 1-12

    if (typeof monthStr === 'string' && /^\d{4}-\d{2}$/.test(monthStr)) {
        const [y, m] = monthStr.split('-').map(Number);
        if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
            year = y;
            month = m;
        }
    }

    const pad = (n) => String(n).padStart(2, '0');
    const start = `${year}-${pad(month)}-01 00:00:00`;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const end = `${nextYear}-${pad(nextMonth)}-01 00:00:00`;

    return { year, month, start, end, label: `${year}-${pad(month)}` };
}

// GET /api/staff-points?month=YYYY-MM — default current month (WIB)
router.get('/', verifyToken, verifyStaffToken, async (req, res) => {
    try {
        const period = parseMonth(req.query.month);

        // Active staff baseline
        const [staffRows] = await db.query(
            `SELECT u.new_id AS staff_id, u.name, u.email, u.role,
                    r.display_name AS role_display
             FROM users u
             LEFT JOIN roles r ON u.role_id = r.id
             WHERE u.user_type = 'staff' AND u.is_active = 1
             ORDER BY u.name ASC`
        );

        // Ratings sum per owner staff within range
        const [ratingRows] = await db.query(
            `SELECT owner_staff_id AS staff_id,
                    COALESCE(SUM(rating), 0) AS total_points,
                    COUNT(*) AS rated_sessions,
                    ROUND(AVG(rating), 2) AS avg_rating
             FROM support_chat_ratings
             WHERE owner_staff_id IS NOT NULL
               AND created_at >= ? AND created_at < ?
             GROUP BY owner_staff_id`,
            [period.start, period.end]
        );
        const ratingMap = new Map();
        ratingRows.forEach(r => {
            if (r.staff_id) ratingMap.set(String(r.staff_id), r);
        });

        // Resolved sessions count per owner within range
        const [resolvedRows] = await db.query(
            `SELECT owner_staff_id AS staff_id, COUNT(*) AS resolved_sessions
             FROM support_chat_sessions
             WHERE owner_staff_id IS NOT NULL
               AND status = 'resolved'
               AND resolved_at >= ? AND resolved_at < ?
             GROUP BY owner_staff_id`,
            [period.start, period.end]
        );
        const resolvedMap = new Map();
        resolvedRows.forEach(r => {
            if (r.staff_id) resolvedMap.set(String(r.staff_id), r.resolved_sessions);
        });

        // Duty logs count per staff within range
        const [dutyRows] = await db.query(
            `SELECT staff_id, COUNT(*) AS duty_count
             FROM staff_duty_logs
             WHERE duty_date >= DATE(?) AND duty_date < DATE(?)
             GROUP BY staff_id`,
            [period.start, period.end]
        );
        const dutyMap = new Map();
        dutyRows.forEach(r => {
            if (r.staff_id) dutyMap.set(String(r.staff_id), r.duty_count);
        });

        const data = staffRows.map(s => {
            const sid = String(s.staff_id);
            const rating = ratingMap.get(sid);
            return {
                staff_id: s.staff_id,
                name: s.name,
                email: s.email,
                role: s.role,
                role_display: s.role_display || s.role || '',
                total_points: rating ? Number(rating.total_points) : 0,
                rated_sessions: rating ? Number(rating.rated_sessions) : 0,
                avg_rating: rating ? Number(rating.avg_rating) : 0,
                resolved_sessions: Number(resolvedMap.get(sid) || 0),
                duty_count: Number(dutyMap.get(sid) || 0)
            };
        });

        // Sort by total_points desc, then name asc
        data.sort((a, b) => (b.total_points - a.total_points) || a.name.localeCompare(b.name));

        return res.json({
            success: true,
            period: { month: period.label, start: period.start, end: period.end },
            staff: data
        });

    } catch (err) {
        console.error('[staff-points] list error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
