'use strict';
const router = require('express').Router();
const db = require('../db');
const service = require('../services/PatientStoryDraftService').createService(db);
const logger = require('../utils/logger');
const { verifyPatientToken } = require('../middleware/auth');
async function dispatch(req, res, owner, demo = false, submit = false) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache'); res.set('Expires', '0');
    try {
        let data;
        if (submit && req.method === 'POST') data = await service.submit(owner, req.body, { demo, patientId: req.patient?.id });
        else if (req.method === 'GET') data = await service.read(owner);
        else if (req.method === 'PUT') data = await service.save(owner, req.body);
        else if (req.method === 'DELETE') data = await service.remove(owner, req.body);
        else return res.status(405).json({ success: false, message: 'Metode tidak didukung.' });
        return res.json({ success: true, data });
    } catch (error) {
        if (!error.status) logger.error('Patient story draft storage failed', { code: error.code || 'STORAGE_ERROR' });
        return res.status(error.status || 503).json({ success: false, code: error.status ? error.code : 'DRAFT_UNAVAILABLE', message: error.status ? error.message : 'Draft belum tersimpan di server. Tulisan tetap dipertahankan di perangkat.', ...(error.data ? { data: error.data } : {}) });
    }
}
router.get('/', verifyPatientToken, (req, res) => dispatch(req, res, 'patient:' + req.patient.id));
router.put('/', verifyPatientToken, (req, res) => dispatch(req, res, 'patient:' + req.patient.id));
router.delete('/', verifyPatientToken, (req, res) => dispatch(req, res, 'patient:' + req.patient.id));
router.post('/submit', verifyPatientToken, (req, res) => dispatch(req, res, 'patient:' + req.patient.id, false, true));
module.exports = router;
module.exports.dispatch = dispatch;
