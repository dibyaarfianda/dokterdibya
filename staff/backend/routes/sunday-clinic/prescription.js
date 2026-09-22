'use strict';

const express = require('express');
const { verifyToken, verifyStaffToken, requireDoctorRole } = require('../../middleware/auth');
const handlers = require('../../services/sunday-clinic/prescription');

const router = express.Router();

router.get('/prescription-templates', verifyToken, handlers.getPrescriptionTemplates);
router.post('/prescription-templates', verifyStaffToken, requireDoctorRole, handlers.postPrescriptionTemplates);
router.put('/prescription-templates/:id', verifyStaffToken, requireDoctorRole, handlers.putPrescriptionTemplatesById);
router.delete('/prescription-templates/:id', verifyStaffToken, requireDoctorRole, handlers.deletePrescriptionTemplatesById);

module.exports = router;
