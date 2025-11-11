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
router.get('/revenue', verifyToken, requirePermission('dashboard.view'), async (req, res) => {
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
router.get('/demographics', verifyToken, requirePermission('dashboard.view'), async (req, res) => {
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
router.get('/medications', verifyToken, requirePermission('dashboard.view'), async (req, res) => {
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
router.get('/visits', verifyToken, requirePermission('dashboard.view'), async (req, res) => {
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
router.get('/doctors', verifyToken, requirePermission('dashboard.view'), async (req, res) => {
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
router.get('/dashboard', verifyToken, requirePermission('dashboard.view'), async (req, res) => {
    try {
        const data = await AnalyticsService.getDashboardStats();
        res.json(success(data, 'Statistik dashboard berhasil dimuat'));
    } catch (err) {
        logger.error('Dashboard stats error:', err);
        res.status(500).json(error('Gagal memuat statistik dashboard'));
    }
});

module.exports = router;
