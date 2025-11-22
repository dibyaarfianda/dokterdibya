const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, requirePermission } = require('../middleware/auth');

/**
 * GET /api/dashboard-stats
 * Get dashboard statistics for the staff interface
 */
router.get('/', verifyToken, requirePermission('appointments.view'), async (req, res) => {
    try {
        // 1. Total Patients Count
        const [totalPatientsResult] = await db.query(
            'SELECT COUNT(*) as total FROM patients WHERE status = ?',
            ['active']
        );
        const totalPatients = totalPatientsResult[0].total;

        // 2. Gynae Special Cases (high risk + pregnant patients)
        const [gynaeResult] = await db.query(`
            SELECT COUNT(DISTINCT p.id) as total
            FROM patients p
            LEFT JOIN patient_intake_submissions pi ON p.id = pi.patient_id
            WHERE p.status = 'active'
            AND (p.is_pregnant = 1 OR pi.high_risk = 1)
        `);
        const gynaeCases = gynaeResult[0].total;

        // 3. Next Sunday Confirmed Appointments
        // Calculate next Sunday date in WIB timezone (server is already in GMT+7)
        const now = new Date();
        const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

        // Calculate days until next Sunday
        // If today is Sunday and before 9 PM, show today. Otherwise show next Sunday
        let daysUntilSunday;
        if (currentDay === 0) {
            const currentHour = now.getHours();
            daysUntilSunday = currentHour >= 21 ? 7 : 0; // After 9 PM, show next Sunday
        } else {
            daysUntilSunday = 7 - currentDay;
        }

        // Create next Sunday date
        const nextSunday = new Date(now);
        nextSunday.setDate(now.getDate() + daysUntilSunday);
        nextSunday.setHours(0, 0, 0, 0);

        // Format as YYYY-MM-DD for MySQL query
        const year = nextSunday.getFullYear();
        const month = String(nextSunday.getMonth() + 1).padStart(2, '0');
        const day = String(nextSunday.getDate()).padStart(2, '0');
        const nextSundayStr = `${year}-${month}-${day}`;

        const [nextSundayResult] = await db.query(
            `SELECT COUNT(*) as total
             FROM sunday_appointments
             WHERE appointment_date = ?
             AND status NOT IN ('cancelled', 'no_show')`,
            [nextSundayStr]
        );
        const nextSundayAppointments = nextSundayResult[0].total;

        // 4. Get next Sunday appointments list with details
        const [appointments] = await db.query(
            `SELECT
                a.id,
                a.patient_name,
                a.patient_phone,
                a.chief_complaint,
                a.session,
                a.slot_number,
                a.appointment_date
             FROM sunday_appointments a
             WHERE a.appointment_date = ?
             AND a.status NOT IN ('cancelled', 'no_show')
             ORDER BY a.session ASC, a.slot_number ASC`,
            [nextSundayStr]
        );

        // Format appointments with slot time
        const formattedAppointments = appointments.map(apt => {
            const startHours = { 1: 9, 2: 12, 3: 15 };
            const startHour = startHours[apt.session];
            const minutes = (apt.slot_number - 1) * 15;
            const hour = startHour + Math.floor(minutes / 60);
            const minute = minutes % 60;
            const slotTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

            return {
                id: apt.id,
                nama: apt.patient_name,
                whatsapp: apt.patient_phone,
                keluhan: apt.chief_complaint,
                slotWaktu: slotTime
            };
        });

        res.json({
            success: true,
            stats: {
                totalPatients,
                gynaeCases,
                nextSundayAppointments,
                nextSundayDate: nextSundayStr
            },
            appointments: formattedAppointments
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics',
            error: error.message
        });
    }
});

module.exports = router;
