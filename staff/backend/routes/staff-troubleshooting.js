'use strict';

const express = require('express');
const router = express.Router();
const { verifyStaffToken } = require('../middleware/auth');
const activityLogger = require('../services/activityLogger');

const MAX_REPORT_LENGTH = 3000;

function sanitize(value, maxLength) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) : text;
}

router.post('/reports', verifyStaffToken, async (req, res) => {
    try {
        const body = req.body || {};
        const report = sanitize(body.message, MAX_REPORT_LENGTH + 1);

        if (!report) {
            return res.status(400).json({
                success: false,
                message: 'Laporan bug/error tidak boleh kosong'
            });
        }

        if (report.length > MAX_REPORT_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Laporan terlalu panjang, maksimal ${MAX_REPORT_LENGTH} karakter`
            });
        }

        const user = req.user || {};
        const userId = user.id || user.new_id || user.email || 'unknown';
        const userName = user.name || user.display_name || user.email || userId;
        const pageUrl = sanitize(body.page_url, 1000) || '-';
        const pageTitle = sanitize(body.page_title, 200) || '-';
        const assetVersion = sanitize(body.asset_version, 80) || '-';
        const viewport = sanitize(body.viewport, 80) || '-';
        const userAgent = sanitize(body.user_agent || req.get('user-agent'), 600) || '-';

        const details = [
            `Pesan: ${report}`,
            `Halaman: ${pageUrl}`,
            `Judul halaman: ${pageTitle}`,
            `Asset version: ${assetVersion}`,
            `Viewport: ${viewport}`,
            `User agent: ${userAgent}`,
            `IP: ${req.ip || '-'}`
        ].join('\n');

        const logEntry = await activityLogger.log(
            userId,
            userName,
            'Troubleshooting Report',
            details,
            req.app.get('io') || global.io
        );

        if (!logEntry) {
            return res.status(500).json({
                success: false,
                message: 'Gagal menyimpan laporan bug/error'
            });
        }

        res.json({
            success: true,
            message: 'Laporan bug/error berhasil dikirim',
            report_id: logEntry.id
        });
    } catch (error) {
        console.error('[staff-troubleshooting] report error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menyimpan laporan bug/error'
        });
    }
});

module.exports = router;