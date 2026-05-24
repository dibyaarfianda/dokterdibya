const express = require('express');
const router = express.Router();
const { verifyToken, requireSuperadmin } = require('../middleware/auth');
const {
    addBlocklistEntry,
    deactivateBlocklistEntry,
    listBlocklistEntries,
    refreshConfiguredBlocklist
} = require('../utils/patientAccessBlocklist');

router.get('/', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        await refreshConfiguredBlocklist();
        const entries = await listBlocklistEntries();
        res.json({ success: true, data: entries });
    } catch (error) {
        console.error('[PatientAccessBlocklist] list failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const { block_type, type, value, reason } = req.body || {};
        const entry = await addBlocklistEntry({
            blockType: block_type || type,
            value,
            reason,
            createdBy: req.user?.id || req.user?.name || 'staff'
        });

        res.status(201).json({
            success: true,
            message: 'Blocklist berhasil disimpan',
            data: entry
        });
    } catch (error) {
        console.error('[PatientAccessBlocklist] create failed:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

router.delete('/:id', verifyToken, requireSuperadmin, async (req, res) => {
    try {
        const removed = await deactivateBlocklistEntry(req.params.id);
        if (!removed) {
            return res.status(404).json({ success: false, message: 'Data blocklist tidak ditemukan' });
        }

        res.json({ success: true, message: 'Blocklist berhasil dinonaktifkan' });
    } catch (error) {
        console.error('[PatientAccessBlocklist] delete failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;