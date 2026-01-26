'use strict';

/**
 * Patient Activity API
 * Aggregates patient activities: bookings, intake forms, registrations
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
        const countQueries = [];

        // Booking activities
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

        // Intake form activities
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

        // Registration activities
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
        const statsFromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const statsToDate = new Date().toISOString().split('T')[0];

        const [[appointmentStats]] = await db.query(
            'SELECT COUNT(*) as count FROM sunday_appointments WHERE DATE(created_at) BETWEEN ? AND ?',
            [statsFromDate, statsToDate]
        );

        const [[intakeStats]] = await db.query(
            'SELECT COUNT(*) as count FROM patient_intake_submissions WHERE DATE(created_at) BETWEEN ? AND ?',
            [statsFromDate, statsToDate]
        );

        const [[regStats]] = await db.query(
            'SELECT COUNT(*) as count FROM patients WHERE DATE(created_at) BETWEEN ? AND ?',
            [statsFromDate, statsToDate]
        );

        const [[totalPatients]] = await db.query('SELECT COUNT(*) as count FROM patients');

        res.json({
            success: true,
            data,
            count: totalCount,
            stats: {
                appointments: appointmentStats.count,
                intakes: intakeStats.count,
                registrations: regStats.count,
                totalPatients: totalPatients.count
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

module.exports = router;
