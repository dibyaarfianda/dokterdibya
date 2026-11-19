'use strict';

/**
 * Public, unauthenticated estimate of one Klinik Privat visit per booking category.
 * GET /api/public/checkup-estimates
 *
 * Shown on the sisiwanita.id home page (products with Rupiah prices). Only categories whose
 * estimate is complete are listed; tindakan ids and configuration problems are never exposed.
 */

const express = require('express');
const defaultLogger = require('../utils/logger');
const { toPublicEstimate } = require('../services/CheckupEstimateService');

function noStore(req, res, next) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
}

function createPublicCheckupEstimatesRouter({ estimates, logger = defaultLogger } = {}) {
    const router = express.Router();
    const service = () => estimates || require('../services/CheckupEstimateService').getCheckupEstimateService();

    router.get('/', noStore, async (req, res) => {
        try {
            const result = await service().priceAll();
            const categories = result.categories.filter(category => category.ready).map(toPublicEstimate);
            res.json({ success: true, categories, priced_at: result.priced_at });
        } catch (error) {
            logger.error('[PublicCheckupEstimates] Failed to price estimates', { message: error.message });
            res.status(503).json({ success: false, categories: [], message: 'Estimasi biaya sedang tidak tersedia' });
        }
    });

    return router;
}

module.exports = { createPublicCheckupEstimatesRouter };
