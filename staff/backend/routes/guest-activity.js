'use strict';

/**
 * Guest/Demo Activity API
 * Tracks anonymous SISIwanita demo visitors without creating patient records.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');
const logger = require('../utils/logger');

const VALID_EVENTS = new Set([
    'guest_start',
    'page_view',
    'demo_navigation',
    'upgrade_prompt',
    'login_redirect'
]);

let tableReady = false;

async function ensureTable() {
    if (tableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS guest_activity_log (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(64) NOT NULL,
            event_type VARCHAR(40) NOT NULL,
            page_path VARCHAR(255) NULL,
            page_title VARCHAR(120) NULL,
            details VARCHAR(500) NULL,
            referrer VARCHAR(255) NULL,
            ip_address VARCHAR(45) NULL,
            user_agent VARCHAR(255) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_guest_activity_created (created_at),
            INDEX idx_guest_activity_session (session_id, created_at),
            INDEX idx_guest_activity_event (event_type, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tableReady = true;
}

function cleanText(value, maxLength) {
    if (value == null) return null;
    const cleaned = String(value).replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    return cleaned.slice(0, maxLength);
}

function cleanPath(value) {
    const raw = cleanText(value, 255);
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            return (parsed.pathname + parsed.search + parsed.hash).slice(0, 255);
        } catch (error) {
            return raw.slice(0, 255);
        }
    }
    return raw.slice(0, 255);
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim().slice(0, 45);
    return cleanText(req.ip, 45);
}

function localDateString(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

router.post('/', async (req, res) => {
    try {
        await ensureTable();

        const sessionId = cleanText(req.body && req.body.session_id, 64);
        const eventType = cleanText(req.body && req.body.event_type, 40);
        if (!sessionId || !eventType || !VALID_EVENTS.has(eventType)) {
            return res.status(400).json({ success: false, message: 'Invalid guest activity payload' });
        }

        await db.query(
            `INSERT INTO guest_activity_log
             (session_id, event_type, page_path, page_title, details, referrer, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sessionId,
                eventType,
                cleanPath(req.body.page_path),
                cleanText(req.body.page_title, 120),
                cleanText(req.body.details, 500),
                cleanPath(req.body.referrer),
                getClientIp(req),
                cleanText(req.get('User-Agent'), 255)
            ]
        );

        res.json({ success: true });
    } catch (error) {
        logger.error('Guest activity log failed', { error: error.message });
        res.status(500).json({ success: false, message: 'Failed to log guest activity' });
    }
});

router.get('/', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        await ensureTable();

        const {
            type,
            from,
            to,
            search,
            limit = 50,
            offset = 0
        } = req.query;

        const fromDate = from || localDateString(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const toDate = to || localDateString(Date.now());
        const toDateEnd = `${toDate} 23:59:59`;
        const params = [fromDate, toDateEnd];

        let where = 'WHERE created_at >= ? AND created_at <= ?';
        if (type && VALID_EVENTS.has(type)) {
            where += ' AND event_type = ?';
            params.push(type);
        }
        if (search) {
            where += ' AND (session_id LIKE ? OR page_path LIKE ? OR page_title LIKE ? OR details LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        const [[countResult]] = await db.query(
            `SELECT COUNT(*) as total FROM guest_activity_log ${where}`,
            params
        );

        const [data] = await db.query(
            `SELECT id, session_id, event_type as type, page_path, page_title, details, referrer, ip_address, user_agent, created_at as timestamp
             FROM guest_activity_log
             ${where}
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, Math.min(parseInt(limit, 10) || 50, 200), parseInt(offset, 10) || 0]
        );

        const statsFromDate = localDateString(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const statsToDate = `${localDateString(Date.now())} 23:59:59`;
        const [statsRows] = await db.query(
            `SELECT event_type, COUNT(*) as count
             FROM guest_activity_log
             WHERE created_at >= ? AND created_at <= ?
             GROUP BY event_type`,
            [statsFromDate, statsToDate]
        );
        const [[sessionStats]] = await db.query(
            `SELECT COUNT(DISTINCT session_id) as sessions
             FROM guest_activity_log
             WHERE created_at >= ? AND created_at <= ?`,
            [statsFromDate, statsToDate]
        );
        const [[todayStats]] = await db.query(
            `SELECT COUNT(DISTINCT session_id) as sessions_today, COUNT(*) as events_today
             FROM guest_activity_log
             WHERE created_at >= ? AND created_at <= ?`,
            [localDateString(Date.now()), statsToDate]
        );

        const byEvent = statsRows.reduce((acc, row) => {
            acc[row.event_type] = Number(row.count) || 0;
            return acc;
        }, {});

        res.json({
            success: true,
            data,
            count: Number(countResult.total) || 0,
            stats: {
                sessions: Number(sessionStats.sessions) || 0,
                sessionsToday: Number(todayStats.sessions_today) || 0,
                eventsToday: Number(todayStats.events_today) || 0,
                guestStarts: byEvent.guest_start || 0,
                pageViews: byEvent.page_view || 0,
                demoNavigation: byEvent.demo_navigation || 0,
                upgradePrompts: byEvent.upgrade_prompt || 0,
                loginRedirects: byEvent.login_redirect || 0
            }
        });
    } catch (error) {
        logger.error('Failed to load guest activity', { error: error.message });
        res.status(500).json({ success: false, message: 'Failed to load guest activity' });
    }
});

module.exports = router;
