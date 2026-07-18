'use strict';

const express = require('express');
const { verifyToken, verifyPatientToken, requireSuperadmin } = require('../../middleware/auth');
const handlers = require('../../services/sunday-clinic/prescription');

const router = express.Router();

router.get('/prescription-templates', verifyToken, handlers.getPrescriptionTemplates);
router.post('/prescription-templates', verifyToken, handlers.postPrescriptionTemplates);
router.put('/prescription-templates/:id', verifyToken, handlers.putPrescriptionTemplatesById);
router.delete('/prescription-templates/:id', verifyToken, handlers.deletePrescriptionTemplatesById);

module.exports = router;
