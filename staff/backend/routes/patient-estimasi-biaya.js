// Published patient estimates share the staff calculator and sanitized view contract.
const express = require('express');
const db = require('../db');
const { verifyPatientToken } = require('../middleware/auth');
const { normalizeDraft, buildPreview, PUBLISHED_KEY } = require('../services/EstimasiBiayaDraft');
const { catalogFor } = require('../services/EstimasiBiayaCatalog');
const router = express.Router();
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache'); res.set('Expires', '0'); next();
});
router.use(verifyPatientToken);
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1', [PUBLISHED_KEY]);
        if (!rows.length) throw new Error('Not published');
        const saved = JSON.parse(rows[0].setting_value);
        if (!saved || saved.version !== 2 || !saved.trimesters) throw new Error('Invalid publication');
        const draft = normalizeDraft(saved);
        const preview = buildPreview(draft, await catalogFor(draft));
        res.json({ success: true, preview: { ...preview, is_published: true } });
    } catch (_) {
        res.status(503).json({ success: false, message: 'Estimasi biaya belum dapat dimuat. Silakan coba lagi.' });
    }
});
module.exports = router;
