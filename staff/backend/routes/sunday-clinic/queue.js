'use strict';

const express = require('express');
const { verifyToken, verifyPatientToken, requireSuperadmin } = require('../../middleware/auth');
const handlers = require('../../services/sunday-clinic/queue');

const router = express.Router();

router.get('/queue/today', verifyToken, handlers.getQueueToday);
router.get('/queue/settings', handlers.getQueueSettings);
router.put('/queue/settings', verifyToken, handlers.putQueueSettings);
router.put('/records/:mrId/queue-status', verifyToken, handlers.putRecordsByMrIdQueueStatus);
router.get('/queue/public', verifyPatientToken, handlers.getQueuePublic);

module.exports = router;
