'use strict';

const db = require('../../db');
const cache = require('../../utils/cache');
const { formatDateLocal } = require('../../utils/date');
const { normalizeMrId } = require('../SundayClinicRouteHelpers');
const { logBillingAudit } = require('../SundayClinicBillingAuditService');
const { acquireSundayClinicAccountingDateGuard } = require('../SundayClinicClosingService');
const { listReturns, createReturn, findSavedReturn } = require('./billing-returns');

async function getReturns(req, res, next) {
    try {
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data: await listReturns(db, normalizeMrId(req.params.mrId)) });
    } catch (error) { next(error); }
}

async function postReturn(req, res, next) {
    let guard;
    try {
        const mrId = normalizeMrId(req.params.mrId);
        const input = req.body || {};
        let saved = await findSavedReturn(db, mrId, input);
        if (saved) return res.json({ success: true, data: saved });
        const accountingDate = formatDateLocal();
        try {
            guard = await acquireSundayClinicAccountingDateGuard(db, { clinicDate: accountingDate });
        } catch (error) {
            // A concurrent save can commit while this request waits behind closing.
            saved = await findSavedReturn(db, mrId, input);
            if (saved) return res.json({ success: true, data: saved });
            throw error;
        }
        const user = req.user || {};
        const result = await createReturn({ db, audit: logBillingAudit }, {
            mrId, input, accountingDate,
            actor: { id: String(user.new_id || user.id), name: String(user.name || user.display_name || user.id), role: user.role || null }
        });
        cache.delPattern('obat:');
        res.json({ success: true, data: result, message: 'Retur / pengembalian berhasil dicatat.' });
    } catch (error) { next(error); }
    finally { if (guard) await guard.release(); }
}

module.exports = { getReturns, postReturn };
