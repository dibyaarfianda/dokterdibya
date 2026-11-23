'use strict';

/**
 * Staff page "Pengeluaran Obat RS" (read-only). Serves stored data and never contacts Medify.
 */

const express = require('express');
const { verifyToken, requirePermission } = require('../middleware/auth');
const { getDrugUsage, buildDrugUsageWorkbook } = require('../services/MelindaDrugUsageQuery');
const logger = require('../utils/logger');

const router = express.Router();
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function respondError(res, error) {
    if (error && error.statusCode) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logger.error('Melinda drug usage route error', { message: error?.message });
    return res.status(500).json({ success: false, message: 'Gagal memuat data pengeluaran obat' });
}

router.get('/', verifyToken, requirePermission('integrations.view'), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        return res.json({ success: true, data: await getDrugUsage(req.query) });
    } catch (error) {
        return respondError(res, error);
    }
});

router.get('/export', verifyToken, requirePermission('integrations.view'), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const data = await getDrugUsage(req.query);
        if (!data.filters.period) {
            return res.status(404).json({ success: false, message: 'Belum ada data untuk diunduh' });
        }
        const buffer = await buildDrugUsageWorkbook(data);
        const { period, depot, type } = data.filters;
        res.set('Content-Type', XLSX_TYPE);
        res.set('Content-Disposition', `attachment; filename="pengeluaran-obat-rs-${period}-${depot}-${type}.xlsx"`);
        return res.send(buffer);
    } catch (error) {
        return respondError(res, error);
    }
});

module.exports = router;
