'use strict';
const express = require('express');
const db = require('../db');
const { verifyStaffToken, requirePermission } = require('../middleware/auth');
const { DRAFT_KEY, MANDATORY_SERVICE_IDS, normalizeDraft, buildPreview } = require('../services/EstimasiBiayaDraft');
const router = express.Router();
router.use((req, res, next) => ['/draft', '/preview'].includes(req.path.replace(/\/$/, '')) ? next() : next('router'));
router.use(verifyStaffToken);
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache'); res.set('Expires', '0'); next();
});
async function catalogFor(draft) {
    const phases = Object.values(draft.trimesters);
    const read = async (table, fields, ids) => {
        const unique = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))];
        if (!unique.length) return [];
        const [rows] = await db.query('SELECT ' + fields + ' FROM ' + table + ' WHERE id IN (' + unique.map(() => '?').join(',') + ')', unique);
        return rows;
    };
    const [medications, services, templates] = await Promise.all([
        read('obat', 'id, name, price, unit, is_active', phases.flatMap(p => p.medications.map(i => i.obat_id))),
        read('tindakan', 'id, name, price, category, is_active', [...Object.values(MANDATORY_SERVICE_IDS), ...phases.flatMap(p => p.services.map(i => i.tindakan_id))]),
        read('sunday_clinic_prescription_templates', 'id, is_active', phases.map(p => p.template_id))
    ]);
    return { medications, services, templates: templates.filter(t => Number(t.is_active) === 1) };
}
router.get('/draft', requirePermission('obat_alkes.view'), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1', [DRAFT_KEY]);
        const draft = normalizeDraft(rows.length ? JSON.parse(rows[0].setting_value) : {});
        res.json({ success: true, draft });
    } catch (_) { res.status(500).json({ success: false, message: 'Draft gagal dimuat. Coba lagi.' }); }
});
router.put('/draft', requirePermission('obat_alkes.edit'), async (req, res) => {
    try {
        const draft = normalizeDraft(req.body || {});
        draft.updated_at = new Date().toISOString();
        await db.query('INSERT INTO settings (setting_key, setting_value, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [DRAFT_KEY, JSON.stringify(draft), 'Staff-only cost estimate draft; not published']);
        res.json({ success: true, draft, message: 'Draft tersimpan. Belum diterbitkan ke portal pasien.' });
    } catch (_) { res.status(500).json({ success: false, message: 'Draft gagal disimpan. Coba lagi.' }); }
});
router.post('/preview', requirePermission('obat_alkes.view'), async (req, res) => {
    try {
        const draft = normalizeDraft(req.body || {});
        res.json({ success: true, preview: buildPreview(draft, await catalogFor(draft)) });
    } catch (_) { res.status(500).json({ success: false, message: 'Pratinjau gagal dimuat. Coba lagi.' }); }
});
module.exports = router;
