'use strict';

/**
 * Patient Activity API
 * Aggregates patient activities: bookings, intake forms, registrations,
 * tracked events from patient_activity_log (login, page views, payments),
 * and patient portal interactions such as community chat, feedback,
 * support chat, and Tanya Dokter.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * GET /api/patient-activity
 * Get aggregated patient activity data
 */
router.get('/', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const {
            type,
            from,
            to,
            search,
            limit = 50,
            offset = 0
        } = req.query;

        // Default date range: last 30 days
        const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const toDate = to || new Date().toISOString().split('T')[0];

        // Build queries for each activity type
        // Use range scan (>= / <=) instead of DATE() to allow index usage
        const toDateEnd = `${toDate} 23:59:59`;
        const queries = [];

        // Booking activities (from sunday_appointments table)
        if (!type || type === 'booking') {
            let bookingQuery = `
                SELECT
                    'booking' as type,
                    sa.created_at as timestamp,
                    COALESCE(p.full_name, sa.patient_name) as patient_name,
                    p.email as patient_email,
                    COALESCE(p.phone, sa.patient_phone) as patient_phone,
                    CONCAT('Booking ', DATE_FORMAT(sa.appointment_date, '%d %b %Y'), ' Sesi ', sa.session, ' - ', COALESCE(sa.chief_complaint, 'Tidak ada keluhan')) as details
                FROM sunday_appointments sa
                LEFT JOIN patients p ON sa.patient_id = p.id
                WHERE sa.created_at >= ? AND sa.created_at <= ?
            `;
            const bookingParams = [fromDate, toDateEnd];

            if (search) {
                bookingQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ? OR sa.patient_name LIKE ?)`;
                const searchTerm = `%${search}%`;
                bookingParams.push(searchTerm, searchTerm, searchTerm);
            }

            queries.push({ query: bookingQuery, params: bookingParams });
        }

        // Intake form activities (from patient_intake_submissions table)
        if (!type || type === 'intake') {
            let intakeQuery = `
                SELECT
                    'intake' as type,
                    pis.created_at as timestamp,
                    pis.full_name as patient_name,
                    NULL as patient_email,
                    pis.phone as patient_phone,
                    CONCAT('Intake form submitted', IF(pis.high_risk = 1, ' (HIGH RISK)', ''), ' - Status: ', pis.status) as details
                FROM patient_intake_submissions pis
                WHERE pis.created_at >= ? AND pis.created_at <= ?
            `;
            const intakeParams = [fromDate, toDateEnd];

            if (search) {
                intakeQuery += ` AND (pis.full_name LIKE ? OR pis.phone LIKE ?)`;
                const searchTerm = `%${search}%`;
                intakeParams.push(searchTerm, searchTerm);
            }

            queries.push({ query: intakeQuery, params: intakeParams });
        }

        // Registration activities (from patients table)
        if (!type || type === 'registration') {
            let regQuery = `
                SELECT
                    'registration' as type,
                    p.created_at as timestamp,
                    p.full_name as patient_name,
                    p.email as patient_email,
                    p.phone as patient_phone,
                    CONCAT('Pasien baru terdaftar', IF(p.google_id IS NOT NULL, ' (via Google)', '')) as details
                FROM patients p
                WHERE p.created_at >= ? AND p.created_at <= ?
            `;
            const regParams = [fromDate, toDateEnd];

            if (search) {
                regQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ? OR p.phone LIKE ?)`;
                const searchTerm = `%${search}%`;
                regParams.push(searchTerm, searchTerm, searchTerm);
            }

            queries.push({ query: regQuery, params: regParams });
        }

        // Login activities (from patient_activity_log)
        if (!type || type === 'login') {
            let loginQuery = `
                SELECT
                    'login' as type,
                    pal.created_at as timestamp,
                    p.full_name as patient_name,
                    p.email as patient_email,
                    p.phone as patient_phone,
                    CONCAT('Login dari ', COALESCE(SUBSTRING(pal.user_agent, 1, 80), 'unknown')) as details
                FROM patient_activity_log pal
                LEFT JOIN patients p ON pal.patient_id = p.id
                WHERE pal.event_type = 'login' AND pal.created_at >= ? AND pal.created_at <= ?
            `;
            const loginParams = [fromDate, toDateEnd];

            if (search) {
                loginQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ?)`;
                const searchTerm = `%${search}%`;
                loginParams.push(searchTerm, searchTerm);
            }

            queries.push({ query: loginQuery, params: loginParams });
        }

        // Page view activities (from patient_activity_log)
        if (!type || type === 'view_halaman') {
            let viewQuery = `
                SELECT
                    'view_halaman' as type,
                    pal.created_at as timestamp,
                    p.full_name as patient_name,
                    p.email as patient_email,
                    p.phone as patient_phone,
                    CONCAT('Buka halaman: ', COALESCE(pal.page_name, '-')) as details
                FROM patient_activity_log pal
                LEFT JOIN patients p ON pal.patient_id = p.id
                WHERE pal.event_type = 'view_halaman' AND pal.created_at >= ? AND pal.created_at <= ?
            `;
            const viewParams = [fromDate, toDateEnd];

            if (search) {
                viewQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ?)`;
                const searchTerm = `%${search}%`;
                viewParams.push(searchTerm, searchTerm);
            }

            queries.push({ query: viewQuery, params: viewParams });
        }

        // Patient tool usage (from tracked page views)
        if (!type || type === 'tool_pasien') {
            let toolQuery = `
                SELECT
                    'tool_pasien' as type,
                    pal.created_at as timestamp,
                    p.full_name as patient_name,
                    p.email as patient_email,
                    p.phone as patient_phone,
                    CONCAT('Tool pasien: ', COALESCE(pal.page_name, pal.details, '-')) as details
                FROM patient_activity_log pal
                LEFT JOIN patients p ON pal.patient_id = p.id
                WHERE pal.event_type = 'view_halaman'
                  AND LOWER(COALESCE(pal.page_name, pal.details, '')) REGEXP 'album|usg|antrian|fertility|kesuburan|gerakan|kick|vitamin|lab|pregnancy|kehamilan|perjalanan|kalender'
                  AND pal.created_at >= ? AND pal.created_at <= ?
            `;
            const toolParams = [fromDate, toDateEnd];

            if (search) {
                toolQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ? OR pal.page_name LIKE ? OR pal.details LIKE ?)`;
                const searchTerm = `%${search}%`;
                toolParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
            }

            queries.push({ query: toolQuery, params: toolParams });
        }

        // Ruang Saya usage / Coming Soon attempts
        if (!type || type === 'ruang_saya') {
            let myCornerQuery = `
                SELECT
                    'ruang_saya' as type,
                    pal.created_at as timestamp,
                    p.full_name as patient_name,
                    p.email as patient_email,
                    p.phone as patient_phone,
                    CONCAT('Ruang Saya: ', COALESCE(pal.page_name, pal.details, '-')) as details
                FROM patient_activity_log pal
                LEFT JOIN patients p ON pal.patient_id = p.id
                WHERE pal.event_type = 'view_halaman'
                  AND LOWER(COALESCE(pal.page_name, pal.details, '')) REGEXP 'ruang saya|my corner'
                  AND pal.created_at >= ? AND pal.created_at <= ?
            `;
            const myCornerParams = [fromDate, toDateEnd];

            if (search) {
                myCornerQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ? OR pal.page_name LIKE ? OR pal.details LIKE ?)`;
                const searchTerm = `%${search}%`;
                myCornerParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
            }

            queries.push({ query: myCornerQuery, params: myCornerParams });
        }

        // Payment activities (from patient_activity_log)
        if (!type || type === 'pembayaran') {
            let payQuery = `
                SELECT
                    'pembayaran' as type,
                    pal.created_at as timestamp,
                    p.full_name as patient_name,
                    p.email as patient_email,
                    p.phone as patient_phone,
                    COALESCE(pal.details, 'Pembayaran online') as details
                FROM patient_activity_log pal
                LEFT JOIN patients p ON pal.patient_id = p.id
                WHERE pal.event_type = 'pembayaran' AND pal.created_at >= ? AND pal.created_at <= ?
            `;
            const payParams = [fromDate, toDateEnd];

            if (search) {
                payQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ?)`;
                const searchTerm = `%${search}%`;
                payParams.push(searchTerm, searchTerm);
            }

            queries.push({ query: payQuery, params: payParams });
        }

        // Community chat messages (patient messages only)
        if (!type || type === 'community_chat') {
            let communityChatQuery = `
                SELECT
                    'community_chat' as type,
                    m.created_at as timestamp,
                    COALESCE(p.full_name, m.sender_name, m.sender_nickname, 'Pasien') as patient_name,
                    p.email as patient_email,
                    p.phone as patient_phone,
                    CONCAT(
                        'Chat komunitas: ',
                        COALESCE(r.name, r.slug, '-'),
                        IF(r.is_direct = 1, ' (direct)', ''),
                        ' - ',
                        LEFT(COALESCE(m.message, ''), 180)
                    ) as details
                FROM community_chat_messages m
                JOIN community_chat_rooms r ON r.id = m.room_id
                LEFT JOIN patients p ON p.id = m.sender_id AND m.sender_type = 'patient'
                WHERE m.sender_type = 'patient' AND m.created_at >= ? AND m.created_at <= ?
            `;
            const communityChatParams = [fromDate, toDateEnd];

            if (search) {
                communityChatQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ? OR m.sender_name LIKE ? OR m.sender_nickname LIKE ? OR m.message LIKE ? OR r.name LIKE ?)`;
                const searchTerm = `%${search}%`;
                communityChatParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            }

            queries.push({ query: communityChatQuery, params: communityChatParams });
        }

        // Patient feedback / bug reports
        if (!type || type === 'bug_report') {
            let feedbackQuery = `
                SELECT
                    'bug_report' as type,
                    pf.created_at as timestamp,
                    CASE
                        WHEN pf.is_anonymous = 1 THEN 'Anonim'
                        ELSE COALESCE(p_direct.full_name, p_user.full_name, pf.patient_name, u.name, 'Pasien')
                    END as patient_name,
                    CASE WHEN pf.is_anonymous = 1 THEN NULL ELSE COALESCE(p_direct.email, p_user.email, u.email) END as patient_email,
                    CASE WHEN pf.is_anonymous = 1 THEN NULL ELSE COALESCE(p_direct.phone, p_user.phone) END as patient_phone,
                    CONCAT(
                        'Feedback ', pf.category,
                        IF(pf.rating IS NOT NULL, CONCAT(' - rating ', pf.rating, '/5'), ''),
                        ': ',
                        LEFT(COALESCE(pf.message, ''), 180)
                    ) as details
                FROM patient_feedback pf
                LEFT JOIN patients p_direct ON p_direct.id = pf.patient_id
                LEFT JOIN users u ON u.new_id = pf.patient_id
                LEFT JOIN patients p_user ON LOWER(TRIM(p_user.email)) = LOWER(TRIM(u.email))
                WHERE pf.category = 'bug' AND pf.created_at >= ? AND pf.created_at <= ?
            `;
            const feedbackParams = [fromDate, toDateEnd];

            if (search) {
                feedbackQuery += ` AND (p_direct.full_name LIKE ? OR p_direct.email LIKE ? OR p_user.full_name LIKE ? OR p_user.email LIKE ? OR pf.patient_name LIKE ? OR pf.message LIKE ?)`;
                const searchTerm = `%${search}%`;
                feedbackParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            }

            queries.push({ query: feedbackQuery, params: feedbackParams });
        }

        // Support chat sessions
        if (!type || type === 'support_chat') {
            let supportChatQuery = `
                SELECT
                    'support_chat' as type,
                    COALESCE(m.last_message_at, s.updated_at, s.created_at) as timestamp,
                    COALESCE(p.full_name, s.patient_name, 'Pasien') as patient_name,
                    p.email as patient_email,
                    p.phone as patient_phone,
                    CONCAT(
                        'Support chat ', s.status,
                        IF(s.owner_staff_name IS NOT NULL, CONCAT(' - ', s.owner_staff_name), ''),
                        IF(m.last_message IS NOT NULL, CONCAT(': ', LEFT(m.last_message, 180)), '')
                    ) as details
                FROM support_chat_sessions s
                LEFT JOIN patients p ON p.id = s.patient_id
                LEFT JOIN (
                    SELECT sm.session_id, sm.content AS last_message, sm.created_at AS last_message_at
                    FROM support_chat_messages sm
                    INNER JOIN (
                        SELECT session_id, MAX(created_at) AS max_created_at
                        FROM support_chat_messages
                        GROUP BY session_id
                    ) latest ON latest.session_id = sm.session_id AND latest.max_created_at = sm.created_at
                ) m ON m.session_id = s.id
                WHERE COALESCE(m.last_message_at, s.updated_at, s.created_at) >= ?
                  AND COALESCE(m.last_message_at, s.updated_at, s.created_at) <= ?
            `;
            const supportChatParams = [fromDate, toDateEnd];

            if (search) {
                supportChatQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ? OR s.patient_name LIKE ? OR s.patient_id LIKE ? OR m.last_message LIKE ?)`;
                const searchTerm = `%${search}%`;
                supportChatParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            }

            queries.push({ query: supportChatQuery, params: supportChatParams });
        }

        // Tanya Dokter questions
        if (!type || type === 'tanya_dokter') {
            let tanyaDokterQuery = `
                SELECT
                    'tanya_dokter' as type,
                    pq.created_at as timestamp,
                    p.full_name as patient_name,
                    p.email as patient_email,
                    p.phone as patient_phone,
                    CONCAT(
                        'Tanya Dokter ', pq.status,
                        IF(reply_stats.reply_count IS NOT NULL, CONCAT(' - ', reply_stats.reply_count, ' balasan'), ''),
                        ': ',
                        LEFT(COALESCE(pq.question_text, ''), 180)
                    ) as details
                FROM patient_questions pq
                JOIN patients p ON p.id = pq.patient_id
                LEFT JOIN (
                    SELECT question_id, COUNT(*) AS reply_count
                    FROM question_replies
                    GROUP BY question_id
                ) reply_stats ON reply_stats.question_id = pq.id
                WHERE pq.created_at >= ? AND pq.created_at <= ?
            `;
            const tanyaDokterParams = [fromDate, toDateEnd];

            if (search) {
                tanyaDokterQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ? OR pq.question_text LIKE ?)`;
                const searchTerm = `%${search}%`;
                tanyaDokterParams.push(searchTerm, searchTerm, searchTerm);
            }

            queries.push({ query: tanyaDokterQuery, params: tanyaDokterParams });
        }

        // Combine all queries with UNION ALL
        if (queries.length === 0) {
            return res.json({
                success: true,
                data: [],
                count: 0,
                stats: {}
            });
        }

        const combinedQuery = queries.map((q, index) => {
            const alias = `activity_source_${index}`;
            return `(
                SELECT
                    CONVERT(${alias}.type USING utf8mb4) COLLATE utf8mb4_unicode_ci as type,
                    ${alias}.timestamp as timestamp,
                    CONVERT(${alias}.patient_name USING utf8mb4) COLLATE utf8mb4_unicode_ci as patient_name,
                    CONVERT(${alias}.patient_email USING utf8mb4) COLLATE utf8mb4_unicode_ci as patient_email,
                    CONVERT(${alias}.patient_phone USING utf8mb4) COLLATE utf8mb4_unicode_ci as patient_phone,
                    CONVERT(${alias}.details USING utf8mb4) COLLATE utf8mb4_unicode_ci as details
                FROM (${q.query}) ${alias}
            )`;
        }).join(' UNION ALL ');
        const combinedParams = queries.flatMap(q => q.params);

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM (${combinedQuery}) as combined`;
        const [[countResult]] = await db.query(countQuery, combinedParams);
        const totalCount = countResult.total;

        // Get paginated data
        const dataQuery = `${combinedQuery} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
        const dataParams = [...combinedParams, parseInt(limit), parseInt(offset)];
        const [data] = await db.query(dataQuery, dataParams);

        // Get stats (always for last 30 days)
        const fromDateObj = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const statsFromDate = `${fromDateObj.getFullYear()}-${String(fromDateObj.getMonth() + 1).padStart(2, '0')}-${String(fromDateObj.getDate()).padStart(2, '0')}`;
        // Use today's LOCAL date (GMT+7) to avoid UTC shift
        const now = new Date();
        const statsToDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        // Range-based date filters: avoids DATE() function on column so indexes can be used
        const rangeEnd = `${statsToDate} 23:59:59`;

        const [
            [[appointmentStats]],
            [[intakeStats]],
            [[regStats]],
            [[totalPatients]],
            [[loginStats]],
            [[pageViewStats]],
            [[paymentStats]],
            [[communityChatStats]],
            [[bugReportStats]],
            [[supportChatStats]],
            [[doctorQuestionStats]],
            [[toolUsageStats]],
            [[myCornerStats]]
        ] = await Promise.all([
            db.query('SELECT COUNT(*) as count FROM sunday_appointments WHERE created_at >= ? AND created_at <= ?', [statsFromDate, rangeEnd]),
            db.query('SELECT COUNT(*) as count FROM patient_intake_submissions WHERE created_at >= ? AND created_at <= ?', [statsFromDate, rangeEnd]),
            db.query('SELECT COUNT(*) as count FROM patients WHERE created_at >= ? AND created_at <= ?', [statsFromDate, rangeEnd]),
            db.query('SELECT COUNT(*) as count FROM patients'),
            db.query("SELECT COUNT(*) as count FROM patient_activity_log WHERE event_type = 'login' AND created_at >= ? AND created_at <= ?", [statsFromDate, rangeEnd]),
            db.query("SELECT COUNT(*) as count FROM patient_activity_log WHERE event_type = 'view_halaman' AND created_at >= ? AND created_at <= ?", [statsFromDate, rangeEnd]),
            db.query("SELECT COUNT(*) as count FROM patient_activity_log WHERE event_type = 'pembayaran' AND created_at >= ? AND created_at <= ?", [statsFromDate, rangeEnd]),
            db.query("SELECT COUNT(*) as count FROM community_chat_messages WHERE sender_type = 'patient' AND created_at >= ? AND created_at <= ?", [statsFromDate, rangeEnd]),
            db.query("SELECT COUNT(*) as count FROM patient_feedback WHERE category = 'bug' AND created_at >= ? AND created_at <= ?", [statsFromDate, rangeEnd]),
            db.query('SELECT COUNT(*) as count FROM support_chat_sessions WHERE created_at >= ? AND created_at <= ?', [statsFromDate, rangeEnd]),
            db.query('SELECT COUNT(*) as count FROM patient_questions WHERE created_at >= ? AND created_at <= ?', [statsFromDate, rangeEnd]),
            db.query("SELECT COUNT(*) as count FROM patient_activity_log WHERE event_type = 'view_halaman' AND LOWER(COALESCE(page_name, details, '')) REGEXP 'album|usg|antrian|fertility|kesuburan|gerakan|kick|vitamin|lab|pregnancy|kehamilan|perjalanan|kalender' AND created_at >= ? AND created_at <= ?", [statsFromDate, rangeEnd]),
            db.query("SELECT COUNT(*) as count FROM patient_activity_log WHERE event_type = 'view_halaman' AND LOWER(COALESCE(page_name, details, '')) REGEXP 'ruang saya|my corner' AND created_at >= ? AND created_at <= ?", [statsFromDate, rangeEnd])
        ]);

        res.json({
            success: true,
            data,
            count: totalCount,
            stats: {
                appointments: appointmentStats.count,
                intakes: intakeStats.count,
                registrations: regStats.count,
                totalPatients: totalPatients.count,
                logins: loginStats.count,
                pageViews: pageViewStats.count,
                payments: paymentStats.count,
                communityChats: communityChatStats.count,
                bugReports: bugReportStats.count,
                supportChats: supportChatStats.count,
                doctorQuestions: doctorQuestionStats.count,
                toolUsage: toolUsageStats.count,
                myCorner: myCornerStats.count
            }
        });

    } catch (error) {
        logger.error('Failed to load patient activity', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Failed to load patient activity',
            error: error.message
        });
    }
});

/**
 * GET /api/patient-activity/stats
 * Aggregated statistics for the patient activity dashboard.
 * All queries use existing indexes (event_type, created_at, patient_id).
 */
router.get('/stats', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const days = Math.min(parseInt(req.query.days) || 30, 90);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // 1. Top pages (most viewed) — uses idx_event_type + idx_created_at
        const [topPages] = await db.query(
            `SELECT page_name, COUNT(*) as views
             FROM patient_activity_log
             WHERE event_type = 'view_halaman' AND created_at >= ? AND page_name IS NOT NULL
             GROUP BY page_name
             ORDER BY views DESC
             LIMIT 10`,
            [since]
        );

        // 2. Login trend per day — uses idx_event_type + idx_created_at
        const [loginTrend] = await db.query(
            `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date, COUNT(*) as count
             FROM patient_activity_log
             WHERE event_type = 'login' AND created_at >= ?
             GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
             ORDER BY date ASC`,
            [since]
        );

        // 3. Top active patients — uses idx_patient_id + idx_created_at
        const [topPatients] = await db.query(
            `SELECT pal.patient_id, p.full_name, COUNT(*) as total_events,
                    SUM(pal.event_type = 'login') as logins,
                    SUM(pal.event_type = 'view_halaman') as page_views,
                    SUM(pal.event_type = 'booking') as bookings,
                    SUM(pal.event_type = 'pembayaran') as payments
             FROM patient_activity_log pal
             LEFT JOIN patients p ON pal.patient_id = p.id
             WHERE pal.created_at >= ?
             GROUP BY pal.patient_id, p.full_name
             ORDER BY total_events DESC
             LIMIT 10`,
            [since]
        );

        // 4. Event breakdown — uses idx_event_type + idx_created_at
        const [eventBreakdown] = await db.query(
            `SELECT event_type, COUNT(*) as count
             FROM patient_activity_log
             WHERE created_at >= ?
             GROUP BY event_type
             ORDER BY count DESC`,
            [since]
        );

        // 5. Activity per hour of day (engagement pattern)
        const [hourlyPattern] = await db.query(
            `SELECT HOUR(created_at) as hour, COUNT(*) as count
             FROM patient_activity_log
             WHERE created_at >= ?
             GROUP BY HOUR(created_at)
             ORDER BY hour ASC`,
            [since]
        );

        // 6. Feature interactions that live outside patient_activity_log.
        const [featureBreakdown] = await db.query(
            `SELECT feature_type, SUM(count) as count
             FROM (
                 SELECT 'community_chat' as feature_type, COUNT(*) as count
                 FROM community_chat_messages
                 WHERE sender_type = 'patient' AND created_at >= ?
                 UNION ALL
                 SELECT 'bug_report' as feature_type, COUNT(*) as count
                 FROM patient_feedback
                 WHERE category = 'bug' AND created_at >= ?
                 UNION ALL
                 SELECT 'support_chat' as feature_type, COUNT(*) as count
                 FROM support_chat_sessions
                 WHERE created_at >= ?
                 UNION ALL
                 SELECT 'tanya_dokter' as feature_type, COUNT(*) as count
                 FROM patient_questions
                 WHERE created_at >= ?
                 UNION ALL
                 SELECT 'tool_pasien' as feature_type, COUNT(*) as count
                 FROM patient_activity_log
                 WHERE event_type = 'view_halaman'
                   AND LOWER(COALESCE(page_name, details, '')) REGEXP 'album|usg|antrian|fertility|kesuburan|gerakan|kick|vitamin|lab|pregnancy|kehamilan|perjalanan|kalender'
                   AND created_at >= ?
                 UNION ALL
                 SELECT 'ruang_saya' as feature_type, COUNT(*) as count
                 FROM patient_activity_log
                 WHERE event_type = 'view_halaman'
                   AND LOWER(COALESCE(page_name, details, '')) REGEXP 'ruang saya|my corner'
                   AND created_at >= ?
              ) feature_counts
             GROUP BY feature_type
             ORDER BY count DESC`,
            [since, since, since, since, since, since]
        );

        res.json({
            success: true,
            days,
            topPages,
            loginTrend,
            topPatients,
            eventBreakdown,
            hourlyPattern,
            featureBreakdown
        });

    } catch (error) {
        logger.error('Failed to load patient activity stats', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Failed to load stats',
            error: error.message
        });
    }
});

module.exports = router;
