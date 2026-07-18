'use strict';

const express = require('express');
const { verifyToken, verifyPatientToken, requireSuperadmin } = require('../../middleware/auth');
const handlers = require('../../services/sunday-clinic/visit-walk-in');

const router = express.Router();

router.post('/start-walk-in', verifyToken, handlers.postStartWalkIn);
router.get('/patient-visits/:patientId', verifyToken, handlers.getPatientVisitsByPatientId);
router.get('/last-anthropometry/:patientId', verifyToken, handlers.getLastAnthropometryByPatientId);

module.exports = router;
