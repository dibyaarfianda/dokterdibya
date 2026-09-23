'use strict';

const express = require('express');
const { verifyStaffToken } = require('../../middleware/auth');
const db = require('../../db');
const handlers = require('../../services/sunday-clinic/visit-walk-in');
const {
    acquireSundayClinicAccountingDateGuard
} = require('../../services/SundayClinicClosingService');

const router = express.Router();

async function requireOpenAccountingDate(req, res, next) {
    try {
        const context = handlers.resolveWalkInVisitContext(req.body);
        if (context.finalLocation !== 'klinik_private') return next();

        const guard = await acquireSundayClinicAccountingDateGuard(db, {
            clinicDate: context.visitDateStr
        });
        let released = false;
        const releaseOnce = () => {
            if (released) return;
            released = true;
            Promise.resolve(guard.release()).catch(() => {});
        };
        res.once('finish', releaseOnce);
        res.once('close', releaseOnce);
        return next();
    } catch (error) {
        return next(error);
    }
}

router.post('/start-walk-in', verifyStaffToken, requireOpenAccountingDate, handlers.postStartWalkIn);
router.get('/patient-visits/:patientId', verifyStaffToken, handlers.getPatientVisitsByPatientId);
router.get('/last-anthropometry/:patientId', verifyStaffToken, handlers.getLastAnthropometryByPatientId);

module.exports = router;
