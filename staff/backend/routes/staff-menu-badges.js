/**
 * Staff menu "new" red dots (global rule for every sidebar menu).
 * GET  /api/staff-menu-badges        -> { success, badges: { navKey: boolean } }
 * POST /api/staff-menu-badges/seen   -> body { navKey } marks the page as opened
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyStaffToken } = require('../middleware/auth');
const { createStaffMenuBadges } = require('../services/StaffMenuBadges');

const service = createStaffMenuBadges({ db });

function noStore(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

router.get('/', verifyStaffToken, async (req, res) => {
    noStore(res);
    try {
        const badges = await service.getBadges(req.user?.id);
        res.json({ success: true, badges });
    } catch (error) {
        console.error('[staff-menu-badges] get failed:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat penanda menu' });
    }
});

router.post('/seen', verifyStaffToken, async (req, res) => {
    noStore(res);
    try {
        const ok = await service.markSeen(req.user?.id, req.body?.navKey);
        if (!ok) return res.status(400).json({ success: false, message: 'Menu tidak dikenal' });
        res.json({ success: true });
    } catch (error) {
        console.error('[staff-menu-badges] seen failed:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan status menu' });
    }
});

module.exports = router;
module.exports.service = service;
