'use strict';

const express = require('express');
const { verifyToken, verifyPatientToken, verifyStaffToken, requirePermission } = require('../../middleware/auth');
const handlers = require('../../services/sunday-clinic/queue');

const router = express.Router();

router.get('/queue/today', verifyToken, handlers.getQueueToday);
router.get('/queue/settings', handlers.getQueueSettings);
router.put('/queue/settings', verifyToken, handlers.putQueueSettings);
router.put('/records/:mrId/queue-status', verifyToken, handlers.putRecordsByMrIdQueueStatus);
router.get('/queue/public', verifyPatientToken, handlers.getQueuePublic);
router.get('/queue/preview', verifyStaffToken, requirePermission('online_queue.view'), handlers.getQueuePreview);

module.exports = router;
