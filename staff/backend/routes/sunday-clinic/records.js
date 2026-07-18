'use strict';

const express = require('express');
const { verifyToken, verifyPatientToken, requireSuperadmin } = require('../../middleware/auth');
const handlers = require('../../services/sunday-clinic/records');

const router = express.Router();

router.get('/check-existing', verifyToken, handlers.getCheckExisting);
router.get('/directory', verifyToken, handlers.getDirectory);
router.get('/records/:mrId', verifyToken, handlers.getRecordsByMrId);
router.post('/records/:mrId/:section', verifyToken, handlers.postRecordsByMrIdBySection);
router.get('/records/:mrId/prefill/medify', verifyToken, handlers.getRecordsByMrIdPrefillMedify);
router.get('/medify-sync/jobs/:mrId', verifyToken, handlers.getMedifySyncJobsByMrId);
router.get('/medify-sync/stats', verifyToken, handlers.getMedifySyncStats);
router.delete('/records/:mrId', verifyToken, requireSuperadmin, handlers.deleteRecordsByMrId);
router.patch('/records/:id/category', verifyToken, handlers.patchRecordsByIdCategory);

module.exports = router;
