/**
 * Tanya Stats Route - Revenue reporting for Tanya dr. Dibya
 * Calculates revenue split per doctor based on questions answered
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

// Middleware: Only superadmin can view revenue stats
const requireSuperadmin = (req, res, next) => {
    if (!req.user.is_superadmin) {
        return res.status(403).json({
            success: false,
            message: 'Hanya superadmin yang dapat mengakses laporan revenue'
        });
    }
    next();
};

/**
 * GET /api/tanya-stats/revenue
 * Get revenue split per doctor for a specific month
 * Query params: month (YYYY-MM format, defaults to current month)
 */
router.get('/revenue', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { month } = req.query;

        // Default to current month if not specified
        const targetMonth = month || new Date().toISOString().slice(0, 7);
        const startDate = `${targetMonth}-01`;
        const endDate = new Date(targetMonth + '-01');
        endDate.setMonth(endDate.getMonth() + 1);
        const endDateStr = endDate.toISOString().slice(0, 10);

        // 1. Get total subscription revenue this month
        const [revenueResult] = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total_revenue
             FROM tanya_payments
             WHERE payment_status = 'paid'
             AND paid_at >= ? AND paid_at < ?`,
            [startDate, endDateStr]
        );
        const totalRevenue = parseInt(revenueResult[0].total_revenue) || 0;

        // 2. Get total questions answered this month (count of doctor replies)
        const [totalQuestionsResult] = await db.query(
            `SELECT COUNT(*) as total
             FROM question_replies
             WHERE sender_type = 'doctor'
             AND created_at >= ? AND created_at < ?`,
            [startDate, endDateStr]
        );
        const totalQuestionsAnswered = totalQuestionsResult[0].total || 0;

        // 3. Get questions answered per doctor with revenue calculation
        const [doctorStats] = await db.query(
            `SELECT
                u.new_id as doctor_id,
                u.name as doctor_name,
                u.specialty,
                u.specialty_label,
                COUNT(qr.id) as questions_answered,
                ROUND(
                    (COUNT(qr.id) / NULLIF(?, 0)) * ?,
                    0
                ) as revenue_share
             FROM users u
             LEFT JOIN question_replies qr ON qr.sender_id = u.new_id
                AND qr.sender_type = 'doctor'
                AND qr.created_at >= ? AND qr.created_at < ?
             WHERE u.role = 'dokter' AND u.is_available_for_qa = 1
             GROUP BY u.new_id, u.name, u.specialty, u.specialty_label
             ORDER BY questions_answered DESC`,
            [totalQuestionsAnswered, totalRevenue, startDate, endDateStr]
        );

        // 4. Get summary stats
        const [summaryStats] = await db.query(
            `SELECT
                COUNT(DISTINCT CASE WHEN status = 'open' THEN id END) as open_questions,
                COUNT(DISTINCT CASE WHEN status = 'answered' THEN id END) as answered_questions,
                COUNT(DISTINCT CASE WHEN status = 'closed' THEN id END) as closed_questions,
                COUNT(DISTINCT id) as total_questions,
                COUNT(DISTINCT patient_id) as unique_patients
             FROM patient_questions
             WHERE created_at >= ? AND created_at < ?`,
            [startDate, endDateStr]
        );

        // 5. Get active subscribers count
        const [subscriberResult] = await db.query(
            `SELECT
                COUNT(DISTINCT CASE WHEN tier = 'free' THEN patient_id END) as free_tier,
                COUNT(DISTINCT CASE WHEN tier = 'first_class' THEN patient_id END) as first_class,
                COUNT(DISTINCT CASE WHEN tier = 'executive' THEN patient_id END) as executive,
                COUNT(DISTINCT CASE WHEN tier = 'vip' THEN patient_id END) as vip,
                COUNT(DISTINCT patient_id) as total_subscribers
             FROM tanya_subscriptions
             WHERE is_active = TRUE
             AND (expires_at IS NULL OR expires_at > NOW())`
        );

        res.json({
            success: true,
            month: targetMonth,
            revenue: {
                total: totalRevenue,
                currency: 'IDR'
            },
            doctors: doctorStats.map(d => ({
                id: d.doctor_id,
                name: d.doctor_name,
                specialty: d.specialty,
                specialtyLabel: d.specialty_label,
                questionsAnswered: d.questions_answered,
                revenueShare: parseInt(d.revenue_share) || 0,
                percentage: totalQuestionsAnswered > 0
                    ? Math.round((d.questions_answered / totalQuestionsAnswered) * 100)
                    : 0
            })),
            summary: {
                totalQuestionsAnswered,
                ...summaryStats[0]
            },
            subscribers: subscriberResult[0]
        });
    } catch (error) {
        console.error('Error getting revenue stats:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * GET /api/tanya-stats/monthly-trend
 * Get revenue trend for last 6 months
 */
router.get('/monthly-trend', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const months = [];
        const now = new Date();

        // Get last 6 months
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(d.toISOString().slice(0, 7));
        }

        const trends = [];
        for (const month of months) {
            const startDate = `${month}-01`;
            const endDate = new Date(month + '-01');
            endDate.setMonth(endDate.getMonth() + 1);
            const endDateStr = endDate.toISOString().slice(0, 10);

            // Get revenue
            const [revenue] = await db.query(
                `SELECT COALESCE(SUM(amount), 0) as total
                 FROM tanya_payments
                 WHERE payment_status = 'paid'
                 AND paid_at >= ? AND paid_at < ?`,
                [startDate, endDateStr]
            );

            // Get questions count
            const [questions] = await db.query(
                `SELECT COUNT(*) as total
                 FROM patient_questions
                 WHERE created_at >= ? AND created_at < ?`,
                [startDate, endDateStr]
            );

            // Get answers count
            const [answers] = await db.query(
                `SELECT COUNT(*) as total
                 FROM question_replies
                 WHERE sender_type = 'doctor'
                 AND created_at >= ? AND created_at < ?`,
                [startDate, endDateStr]
            );

            trends.push({
                month,
                revenue: parseInt(revenue[0].total) || 0,
                questions: questions[0].total || 0,
                answers: answers[0].total || 0
            });
        }

        res.json({
            success: true,
            trends
        });
    } catch (error) {
        console.error('Error getting monthly trend:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * POST /api/tanya-stats/calculate
 * Manually trigger revenue calculation for a month
 * This would normally be run by cron job
 */
router.post('/calculate', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { month } = req.body;

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({
                success: false,
                message: 'Month format should be YYYY-MM'
            });
        }

        const startDate = `${month}-01`;
        const endDate = new Date(month + '-01');
        endDate.setMonth(endDate.getMonth() + 1);
        const endDateStr = endDate.toISOString().slice(0, 10);
        const periodMonth = startDate; // First day of month

        // 1. Get total revenue
        const [revenueResult] = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total
             FROM tanya_payments
             WHERE payment_status = 'paid'
             AND paid_at >= ? AND paid_at < ?`,
            [startDate, endDateStr]
        );
        const totalRevenue = parseInt(revenueResult[0].total) || 0;

        // 2. Get total questions answered
        const [totalQuestionsResult] = await db.query(
            `SELECT COUNT(*) as total
             FROM question_replies
             WHERE sender_type = 'doctor'
             AND created_at >= ? AND created_at < ?`,
            [startDate, endDateStr]
        );
        const totalQuestions = totalQuestionsResult[0].total || 0;

        // 3. Get per-doctor stats
        const [doctorStats] = await db.query(
            `SELECT
                qr.sender_id as doctor_id,
                COUNT(*) as questions_answered
             FROM question_replies qr
             WHERE qr.sender_type = 'doctor'
             AND qr.created_at >= ? AND qr.created_at < ?
             GROUP BY qr.sender_id`,
            [startDate, endDateStr]
        );

        // 4. Insert/Update doctor_revenue_stats
        for (const doc of doctorStats) {
            const revenueShare = totalQuestions > 0
                ? Math.round((doc.questions_answered / totalQuestions) * totalRevenue)
                : 0;

            await db.query(
                `INSERT INTO doctor_revenue_stats
                 (doctor_id, period_month, questions_answered, revenue_share, total_questions_system, total_revenue_system, calculated_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                     questions_answered = VALUES(questions_answered),
                     revenue_share = VALUES(revenue_share),
                     total_questions_system = VALUES(total_questions_system),
                     total_revenue_system = VALUES(total_revenue_system),
                     calculated_at = NOW()`,
                [doc.doctor_id, periodMonth, doc.questions_answered, revenueShare, totalQuestions, totalRevenue]
            );
        }

        res.json({
            success: true,
            message: `Revenue calculated for ${month}`,
            summary: {
                totalRevenue,
                totalQuestions,
                doctorsProcessed: doctorStats.length
            }
        });
    } catch (error) {
        console.error('Error calculating revenue:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/**
 * GET /api/tanya-stats/doctor/:id
 * Get specific doctor's stats history
 */
router.get('/doctor/:id', verifyToken, async (req, res) => {
    try {
        const doctorId = req.params.id;
        const currentUser = req.user;

        // Dokter can only view their own stats, superadmin can view all
        if (currentUser.role === 'dokter' && !currentUser.is_superadmin && currentUser.new_id !== doctorId) {
            return res.status(403).json({
                success: false,
                message: 'Anda hanya dapat melihat statistik Anda sendiri'
            });
        }

        // Get doctor info
        const [doctors] = await db.query(
            `SELECT new_id, name, specialty, specialty_label
             FROM users WHERE new_id = ? AND role = 'dokter'`,
            [doctorId]
        );

        if (doctors.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Dokter tidak ditemukan'
            });
        }

        // Get historical stats (last 12 months)
        const [stats] = await db.query(
            `SELECT period_month, questions_answered, revenue_share,
                    total_questions_system, total_revenue_system, calculated_at
             FROM doctor_revenue_stats
             WHERE doctor_id = ?
             ORDER BY period_month DESC
             LIMIT 12`,
            [doctorId]
        );

        // Get current month live stats
        const now = new Date();
        const currentMonth = now.toISOString().slice(0, 7);
        const startDate = `${currentMonth}-01`;
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

        const [currentStats] = await db.query(
            `SELECT COUNT(*) as questions_answered
             FROM question_replies
             WHERE sender_id = ? AND sender_type = 'doctor'
             AND created_at >= ? AND created_at < ?`,
            [doctorId, startDate, endDate]
        );

        res.json({
            success: true,
            doctor: doctors[0],
            currentMonth: {
                month: currentMonth,
                questionsAnswered: currentStats[0].questions_answered
            },
            history: stats
        });
    } catch (error) {
        console.error('Error getting doctor stats:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
