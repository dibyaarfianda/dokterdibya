/**
 * Analytics API Routes
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Business analytics and reporting
 */

const express = require('express');
const router = express.Router();
const AnalyticsService = require('../services/AnalyticsService');
const { verifyToken, requirePermission } = require('../middleware/auth');
const { success, error } = require('../utils/response');
const logger = require('../utils/logger');
const { resolveFinancePeriod, prorateMonthlyAmounts } = require('../utils/finance-period');

/**
 * @swagger
 * /api/analytics/revenue:
 *   get:
 *     summary: Get revenue analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: End date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Revenue analytics data
 */
router.get('/revenue', verifyToken, requirePermission('analytics.view'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json(error('Parameter startDate dan endDate diperlukan'));
        }
        
        const data = await AnalyticsService.getRevenueAnalytics(startDate, endDate);
        res.json(success(data, 'Analitik pendapatan berhasil dimuat'));
    } catch (err) {
        logger.error('Revenue analytics error:', err);
        res.status(500).json(error('Gagal memuat analitik pendapatan'));
    }
});

/**
 * @swagger
 * /api/analytics/demographics:
 *   get:
 *     summary: Get patient demographics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Patient demographics data
 */
router.get('/demographics', verifyToken, requirePermission('analytics.view'), async (req, res) => {
    try {
        const data = await AnalyticsService.getPatientDemographics();
        res.json(success(data, 'Demografis pasien berhasil dimuat'));
    } catch (err) {
        logger.error('Demographics error:', err);
        res.status(500).json(error('Gagal memuat demografis pasien'));
    }
});

/**
 * @swagger
 * /api/analytics/medications:
 *   get:
 *     summary: Get medication analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *     responses:
 *       200:
 *         description: Medication analytics data
 */
router.get('/medications', verifyToken, requirePermission('analytics.view'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json(error('Parameter startDate dan endDate diperlukan'));
        }
        
        const data = await AnalyticsService.getMedicationAnalytics(startDate, endDate);
        res.json(success(data, 'Analitik obat berhasil dimuat'));
    } catch (err) {
        logger.error('Medication analytics error:', err);
        res.status(500).json(error('Gagal memuat analitik obat'));
    }
});

/**
 * @swagger
 * /api/analytics/visits:
 *   get:
 *     summary: Get visit trends
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *     responses:
 *       200:
 *         description: Visit trends data
 */
router.get('/visits', verifyToken, requirePermission('analytics.view'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json(error('Parameter startDate dan endDate diperlukan'));
        }
        
        const data = await AnalyticsService.getVisitTrends(startDate, endDate);
        res.json(success(data, 'Tren kunjungan berhasil dimuat'));
    } catch (err) {
        logger.error('Visit trends error:', err);
        res.status(500).json(error('Gagal memuat tren kunjungan'));
    }
});

/**
 * @swagger
 * /api/analytics/doctors:
 *   get:
 *     summary: Get doctor performance metrics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *     responses:
 *       200:
 *         description: Doctor performance data
 */
router.get('/doctors', verifyToken, requirePermission('analytics.view'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json(error('Parameter startDate dan endDate diperlukan'));
        }
        
        const data = await AnalyticsService.getDoctorPerformance(startDate, endDate);
        res.json(success(data, 'Performa dokter berhasil dimuat'));
    } catch (err) {
        logger.error('Doctor performance error:', err);
        res.status(500).json(error('Gagal memuat performa dokter'));
    }
});

/**
 * @swagger
 * /api/analytics/dashboard:
 *   get:
 *     summary: Get comprehensive dashboard statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 */
router.get('/dashboard', verifyToken, requirePermission('analytics.view'), async (req, res) => {
    try {
        const data = await AnalyticsService.getDashboardStats();
        res.json(success(data, 'Statistik dashboard berhasil dimuat'));
    } catch (err) {
        logger.error('Dashboard stats error:', err);
        res.status(500).json(error('Gagal memuat statistik dashboard'));
    }
});

/**
 * @swagger
 * /api/analytics/private-clinic:
 *   get:
 *     summary: Get private clinic (Sunday Clinic) financial analysis
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive start date (YYYY-MM-DD). Must be sent together with end_date.
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive end date (YYYY-MM-DD). Must be sent together with start_date.
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *         description: Legacy month filter in YYYY-MM format, used when no date range is sent (defaults to current month)
 *     responses:
 *       200:
 *         description: Private clinic financial analysis
 *       400:
 *         description: Invalid date range or month
 */
router.get('/private-clinic', verifyToken, requirePermission('analytics.view'), async (req, res) => {
    const pool = require('../db');

    try {
        const period = resolveFinancePeriod(req.query);
        if (!period.ok) {
            return res.status(400).json(error(period.message));
        }

        const { startDate, endDate: endDateStr } = period;
        // Exclusive upper bound for index-friendly range query (no DATE() wrapping)
        const nextMonthStart = period.endExclusive;
        // Driver payroll rows are keyed by the first day of their month.
        const driverMonthFrom = `${startDate.slice(0, 7)}-01`;

        // 1. Get summary data
        const [summaryRows] = await pool.query(`
            SELECT
                COUNT(DISTINCT b.id) as total_kunjungan,
                COUNT(DISTINCT DATE(b.created_at)) as total_hari_kerja,
                COALESCE(SUM(bi.total), 0) as pendapatan_kotor,
                COALESCE(SUM(CASE WHEN bi.item_type = 'tindakan' THEN bi.total ELSE 0 END), 0) as pendapatan_tindakan,
                COALESCE(SUM(CASE WHEN bi.item_type = 'obat' THEN bi.total ELSE 0 END), 0) as pendapatan_obat
            FROM sunday_clinic_billings b
            LEFT JOIN sunday_clinic_billing_items bi ON b.id = bi.billing_id
            WHERE b.status IN ('paid', 'confirmed')
            AND b.created_at >= ? AND b.created_at < ?
        `, [startDate, nextMonthStart]);

        // 2. Get HPP (Cost of Goods Sold) for medications
        const [hppRows] = await pool.query(`
            SELECT
                COALESCE(SUM(COALESCE(o.default_cost_price, 0) * bi.quantity), 0) as total_hpp
            FROM sunday_clinic_billing_items bi
            JOIN sunday_clinic_billings b ON bi.billing_id = b.id
            LEFT JOIN obat o ON bi.item_code = o.code
            WHERE bi.item_type = 'obat'
            AND b.status IN ('paid', 'confirmed')
            AND b.created_at >= ? AND b.created_at < ?
        `, [startDate, nextMonthStart]);

        // 3. Get tindakan breakdown by category
        const [tindakanByCategory] = await pool.query(`
            SELECT
                COALESCE(t.category, 'LAINNYA') as category,
                COUNT(DISTINCT bi.item_code) as jenis_tindakan,
                COUNT(*) as jumlah_transaksi,
                COALESCE(SUM(bi.total), 0) as total_pendapatan
            FROM sunday_clinic_billing_items bi
            JOIN sunday_clinic_billings b ON bi.billing_id = b.id
            LEFT JOIN tindakan t ON bi.item_code = t.code
            WHERE bi.item_type = 'tindakan'
            AND b.status IN ('paid', 'confirmed')
            AND b.created_at >= ? AND b.created_at < ?
            GROUP BY t.category
            ORDER BY total_pendapatan DESC
        `, [startDate, nextMonthStart]);

        // 4. Get top tindakan
        const [topTindakan] = await pool.query(`
            SELECT
                bi.item_name,
                bi.item_code,
                COALESCE(t.category, 'LAINNYA') as category,
                COUNT(*) as jumlah_transaksi,
                SUM(bi.quantity) as total_qty,
                AVG(bi.price) as avg_harga,
                SUM(bi.total) as total_pendapatan
            FROM sunday_clinic_billing_items bi
            JOIN sunday_clinic_billings b ON bi.billing_id = b.id
            LEFT JOIN tindakan t ON bi.item_code = t.code
            WHERE bi.item_type = 'tindakan'
            AND b.status IN ('paid', 'confirmed')
            AND b.created_at >= ? AND b.created_at < ?
            GROUP BY bi.item_code, bi.item_name, t.category
            ORDER BY total_pendapatan DESC
            LIMIT 10
        `, [startDate, nextMonthStart]);

        // 5. Get obat with profit analysis
        const [obatAnalysis] = await pool.query(`
            SELECT
                bi.item_name,
                bi.item_code,
                SUM(bi.quantity) as total_qty,
                AVG(bi.price) as harga_jual,
                COALESCE(o.default_cost_price, 0) as hpp_per_unit,
                SUM(bi.total) as pendapatan_kotor,
                COALESCE(o.default_cost_price, 0) * SUM(bi.quantity) as total_hpp,
                SUM(bi.total) - (COALESCE(o.default_cost_price, 0) * SUM(bi.quantity)) as keuntungan_kotor,
                CASE
                    WHEN SUM(bi.total) > 0
                    THEN ROUND(((SUM(bi.total) - (COALESCE(o.default_cost_price, 0) * SUM(bi.quantity))) / SUM(bi.total)) * 100, 2)
                    ELSE 0
                END as margin_persen
            FROM sunday_clinic_billing_items bi
            JOIN sunday_clinic_billings b ON bi.billing_id = b.id
            LEFT JOIN obat o ON bi.item_code = o.code
            WHERE bi.item_type = 'obat'
            AND b.status IN ('paid', 'confirmed')
            AND b.created_at >= ? AND b.created_at < ?
            GROUP BY bi.item_code, bi.item_name, o.default_cost_price
            ORDER BY pendapatan_kotor DESC
        `, [startDate, nextMonthStart]);

        // Calculate financial metrics
        const summary = summaryRows[0];
        const totalHPP = parseFloat(hppRows[0].total_hpp) || 0;
        const pendapatanKotor = parseFloat(summary.pendapatan_kotor) || 0;
        const pendapatanTindakan = parseFloat(summary.pendapatan_tindakan) || 0;
        const pendapatanObat = parseFloat(summary.pendapatan_obat) || 0;
        const labaKotor = pendapatanKotor - totalHPP;
        const totalHariKerja = parseInt(summary.total_hari_kerja) || 0;
        const totalKunjungan = parseInt(summary.total_kunjungan) || 0;

        // 6. Get finalized staff payroll paid in this period.
        // Payroll is cash-based here: a batch reduces the period that contains its payroll_date.
        const [payrollRows] = await pool.query(`
            SELECT
                COUNT(*) AS batch_count,
                COALESCE(SUM(total_amount), 0) AS total_gaji
            FROM staff_payroll_batches
            WHERE status = 'finalized'
              AND payroll_date >= ? AND payroll_date < ?
        `, [startDate, nextMonthStart]);

        // Driver payroll is monthly; a partly covered month is prorated per calendar day.
        const [driverPayrollRows] = await pool.query(`
            SELECT
                DATE_FORMAT(payroll_month, '%Y-%m') AS payroll_month,
                -- Only the dokterdibya part is a clinic expense; RSIA Melinda pays fixed_salary.
                GREATEST(CAST(total_amount AS SIGNED) - CAST(fixed_salary AS SIGNED), 0) AS clinic_amount
            FROM staff_driver_payrolls
            WHERE status = 'finalized'
              AND payroll_month >= ? AND payroll_month < ?
            ORDER BY payroll_month
        `, [driverMonthFrom, nextMonthStart]);

        const [payrollItemRows] = await pool.query(`
            SELECT
                COUNT(*) AS item_count,
                COALESCE(SUM(CASE WHEN i.total_amount > 0 THEN 1 ELSE 0 END), 0) AS paid_staff_count,
                COALESCE(SUM(i.attendance_count), 0) AS total_kehadiran
            FROM staff_payroll_items i
            JOIN staff_payroll_batches b ON b.id = i.batch_id
            WHERE b.status = 'finalized'
              AND b.payroll_date >= ? AND b.payroll_date < ?
        `, [startDate, nextMonthStart]);

        const payrollSummary = payrollRows[0] || {};
        const payrollItems = payrollItemRows[0] || {};
        const driverPayroll = prorateMonthlyAmounts(
            driverPayrollRows.map(row => ({ month: row.payroll_month, amount: row.clinic_amount })),
            startDate,
            endDateStr
        );
        const totalGajiPraktik = parseFloat(payrollSummary.total_gaji) || 0;
        const totalGajiSupir = driverPayroll.total;
        const totalGajiStaff = totalGajiPraktik + totalGajiSupir;
        const payrollBatchCount = parseInt(payrollSummary.batch_count, 10) || 0;
        const driverPayrollCount = driverPayrollRows.length;
        const payrollItemCount = parseInt(payrollItems.item_count, 10) || 0;
        const paidStaffCount = parseInt(payrollItems.paid_staff_count, 10) || 0;
        const totalPayrollAttendance = parseInt(payrollItems.total_kehadiran, 10) || 0;

        // Net profit calculation
        const labaBersih = labaKotor - totalGajiStaff;
        const marginLabaBersih = pendapatanKotor > 0 ? (labaBersih / pendapatanKotor * 100) : 0;
        const labaPerHari = totalHariKerja > 0 ? labaBersih / totalHariKerja : 0;
        const labaPerKunjungan = totalKunjungan > 0 ? labaBersih / totalKunjungan : 0;

        res.json(success({
            period: {
                month: period.month,
                startDate,
                endDate: endDateStr,
                totalDays: period.totalDays
            },
            summary: {
                totalKunjungan,
                totalHariKerja,
                pendapatanKotor,
                pendapatanTindakan,
                pendapatanObat,
                totalHPP,
                labaKotor,
                marginLabaKotor: pendapatanKotor > 0 ? (labaKotor / pendapatanKotor * 100) : 0
            },
            staffCost: {
                source: 'staff_payroll_batches + staff_driver_payrolls',
                batchCount: payrollBatchCount,
                driverPayrollCount,
                driverProrated: driverPayroll.prorated,
                driverMonths: driverPayroll.months,
                itemCount: payrollItemCount,
                paidStaffCount,
                totalKehadiran: totalPayrollAttendance,
                totalGajiPraktik,
                totalGajiSupir,
                totalGaji: totalGajiStaff
            },
            netProfit: {
                labaBersih,
                marginLabaBersih,
                labaPerHari,
                labaPerKunjungan
            },
            breakdown: {
                tindakanByCategory,
                topTindakan,
                obatAnalysis
            }
        }, 'Analisis keuangan klinik privat berhasil dimuat'));

    } catch (err) {
        logger.error('Private clinic analytics error:', err);
        res.status(500).json(error('Gagal memuat analisis keuangan klinik privat'));
    }
});

module.exports = router;
