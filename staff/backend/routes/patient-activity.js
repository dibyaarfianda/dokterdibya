'use strict';

/**
 * Patient Activity API
 * Aggregates patient activities: bookings, intake forms, registrations,
 * plus tracked events from patient_activity_log (login, page views, payments)
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
                WHERE DATE(sa.created_at) BETWEEN ? AND ?
            `;
            const bookingParams = [fromDate, toDate];

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
                WHERE DATE(pis.created_at) BETWEEN ? AND ?
            `;
            const intakeParams = [fromDate, toDate];

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
                WHERE DATE(p.created_at) BETWEEN ? AND ?
            `;
            const regParams = [fromDate, toDate];

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
                WHERE pal.event_type = 'login' AND DATE(pal.created_at) BETWEEN ? AND ?
            `;
            const loginParams = [fromDate, toDate];

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
                WHERE pal.event_type = 'view_halaman' AND DATE(pal.created_at) BETWEEN ? AND ?
            `;
            const viewParams = [fromDate, toDate];

            if (search) {
                viewQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ?)`;
                const searchTerm = `%${search}%`;
                viewParams.push(searchTerm, searchTerm);
            }

            queries.push({ query: viewQuery, params: viewParams });
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
                WHERE pal.event_type = 'pembayaran' AND DATE(pal.created_at) BETWEEN ? AND ?
            `;
            const payParams = [fromDate, toDate];

            if (search) {
                payQuery += ` AND (p.full_name LIKE ? OR p.email LIKE ?)`;
                const searchTerm = `%${search}%`;
                payParams.push(searchTerm, searchTerm);
            }

            queries.push({ query: payQuery, params: payParams });
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

        const combinedQuery = queries.map(q => `(${q.query})`).join(' UNION ALL ');
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

        const [[appointmentStats]] = await db.query(
            'SELECT COUNT(*) as count FROM sunday_appointments WHERE created_at >= ? AND created_at <= ?',
            [statsFromDate, rangeEnd]
        );

        const [[intakeStats]] = await db.query(
            'SELECT COUNT(*) as count FROM patient_intake_submissions WHERE created_at >= ? AND created_at <= ?',
            [statsFromDate, rangeEnd]
        );

        const [[regStats]] = await db.query(
            'SELECT COUNT(*) as count FROM patients WHERE created_at >= ? AND created_at <= ?',
            [statsFromDate, rangeEnd]
        );

        const [[totalPatients]] = await db.query('SELECT COUNT(*) as count FROM patients');

        const [[loginStats]] = await db.query(
            "SELECT COUNT(*) as count FROM patient_activity_log WHERE event_type = 'login' AND created_at >= ? AND created_at <= ?",
            [statsFromDate, rangeEnd]
        );

        const [[pageViewStats]] = await db.query(
            "SELECT COUNT(*) as count FROM patient_activity_log WHERE event_type = 'view_halaman' AND created_at >= ? AND created_at <= ?",
            [statsFromDate, rangeEnd]
        );

        const [[paymentStats]] = await db.query(
            "SELECT COUNT(*) as count FROM patient_activity_log WHERE event_type = 'pembayaran' AND created_at >= ? AND created_at <= ?",
            [statsFromDate, rangeEnd]
        );

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
                payments: paymentStats.count
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

        res.json({
            success: true,
            days,
            topPages,
            loginTrend,
            topPatients,
            eventBreakdown,
            hourlyPattern
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
