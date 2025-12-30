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
 *         name: month
 *         schema:
 *           type: string
 *         description: Month in YYYY-MM format (defaults to current month)
 *       - in: query
 *         name: staffCount
 *         schema:
 *           type: integer
 *         description: Number of staff (defaults to 3)
 *       - in: query
 *         name: attendancePerStaff
 *         schema:
 *           type: integer
 *         description: Attendance days per staff (defaults to working days)
 *     responses:
 *       200:
 *         description: Private clinic financial analysis
 */
router.get('/private-clinic', verifyToken, requirePermission('analytics.view'), async (req, res) => {
    const pool = require('../db');

    try {
        const { month, staffCount = 3 } = req.query;

        // Default to current month if not specified (GMT+7 aware)
        let targetMonth = month;
        if (!targetMonth) {
            const now = new Date();
            const year = now.getFullYear();
            const monthNum = String(now.getMonth() + 1).padStart(2, '0');
            targetMonth = `${year}-${monthNum}`;
        }

        const startDate = `${targetMonth}-01`;
        const [year, monthNum] = targetMonth.split('-').map(Number);
        const endDate = new Date(year, monthNum, 0); // Last day of month
        const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

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
            AND DATE(b.created_at) BETWEEN ? AND ?
        `, [startDate, endDateStr]);

        // 2. Get HPP (Cost of Goods Sold) for medications
        const [hppRows] = await pool.query(`
            SELECT
                COALESCE(SUM(COALESCE(o.default_cost_price, 0) * bi.quantity), 0) as total_hpp
            FROM sunday_clinic_billing_items bi
            JOIN sunday_clinic_billings b ON bi.billing_id = b.id
            LEFT JOIN obat o ON bi.item_code = o.code
            WHERE bi.item_type = 'obat'
            AND b.status IN ('paid', 'confirmed')
            AND DATE(b.created_at) BETWEEN ? AND ?
        `, [startDate, endDateStr]);

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
            AND DATE(b.created_at) BETWEEN ? AND ?
            GROUP BY t.category
            ORDER BY total_pendapatan DESC
        `, [startDate, endDateStr]);

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
            AND DATE(b.created_at) BETWEEN ? AND ?
            GROUP BY bi.item_code, bi.item_name, t.category
            ORDER BY total_pendapatan DESC
            LIMIT 10
        `, [startDate, endDateStr]);

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
            AND DATE(b.created_at) BETWEEN ? AND ?
            GROUP BY bi.item_code, bi.item_name, o.default_cost_price
            ORDER BY pendapatan_kotor DESC
        `, [startDate, endDateStr]);

        // Calculate financial metrics
        const summary = summaryRows[0];
        const totalHPP = parseFloat(hppRows[0].total_hpp) || 0;
        const pendapatanKotor = parseFloat(summary.pendapatan_kotor) || 0;
        const pendapatanTindakan = parseFloat(summary.pendapatan_tindakan) || 0;
        const pendapatanObat = parseFloat(summary.pendapatan_obat) || 0;
        const labaKotor = pendapatanKotor - totalHPP;
        const totalHariKerja = parseInt(summary.total_hari_kerja) || 0;
        const totalKunjungan = parseInt(summary.total_kunjungan) || 0;

        // Staff cost: 8 staff, base 150k + bonus 100k per additional attendance day
        // Formula: gaji = 150000 + max(0, (hari_kerja - 1)) × 100000
        // Example: 4 hari Minggu = 150,000 + (3 × 100,000) = 450,000 per staff
        const numStaff = 8;
        const attendancePerStaff = totalHariKerja; // Jumlah hari Minggu dalam bulan
        const bonusPerStaff = Math.max(0, attendancePerStaff - 1) * 100000;
        const gajiPerStaff = 150000 + bonusPerStaff;
        const totalGajiStaff = numStaff * gajiPerStaff;

        // Net profit calculation
        const labaBersih = labaKotor - totalGajiStaff;
        const marginLabaBersih = pendapatanKotor > 0 ? (labaBersih / pendapatanKotor * 100) : 0;
        const labaPerHari = totalHariKerja > 0 ? labaBersih / totalHariKerja : 0;
        const labaPerKunjungan = totalKunjungan > 0 ? labaBersih / totalKunjungan : 0;

        res.json(success({
            period: {
                month: targetMonth,
                startDate,
                endDate: endDateStr
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
                jumlahStaff: numStaff,
                kehadiranPerStaff: attendancePerStaff,
                gajiPerStaff,
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
