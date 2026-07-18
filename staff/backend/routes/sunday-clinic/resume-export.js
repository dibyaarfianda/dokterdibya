'use strict';

const express = require('express');
const { verifyToken, verifyPatientToken, requireSuperadmin } = require('../../middleware/auth');
const handlers = require('../../services/sunday-clinic/resume-export');

const router = express.Router();

router.get('/statistics/categories', verifyToken, handlers.getStatisticsCategories);
router.post('/generate-anamnesa/:mrId', verifyToken, handlers.postGenerateAnamnesaByMrId);
router.post('/resume-medis/pdf', verifyToken, handlers.postResumeMedisPdf);
router.get('/resume-medis/download/:filename', verifyToken, handlers.getResumeMedisDownloadByFilename);
router.post('/resume-medis/send-whatsapp', verifyToken, handlers.postResumeMedisSendWhatsapp);

module.exports = router;
