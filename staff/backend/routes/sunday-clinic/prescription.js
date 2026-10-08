'use strict';

const express = require('express');
const { verifyToken, verifyStaffToken, requireDoctorRoleOrAccountPermission } = require('../../middleware/auth');
const handlers = require('../../services/sunday-clinic/prescription');

const router = express.Router();

router.get('/prescription-templates', verifyToken, handlers.getPrescriptionTemplates);
router.post('/prescription-templates', verifyStaffToken, requireDoctorRoleOrAccountPermission('medications.select'), handlers.postPrescriptionTemplates);
router.put('/prescription-templates/:id', verifyStaffToken, requireDoctorRoleOrAccountPermission('medications.select'), handlers.putPrescriptionTemplatesById);
router.delete('/prescription-templates/:id', verifyStaffToken, requireDoctorRoleOrAccountPermission('medications.select'), handlers.deletePrescriptionTemplatesById);

module.exports = router;
