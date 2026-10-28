'use strict';

const db = require('../../db');
const cache = require('../../utils/cache');
const { formatDateLocal } = require('../../utils/date');
const { normalizeMrId } = require('../SundayClinicRouteHelpers');
const { logBillingAudit } = require('../SundayClinicBillingAuditService');
const { acquireSundayClinicAccountingDateGuard, resolveServiceDate } = require('../SundayClinicClosingService');
const { listReturns, createReturn, findSavedReturn, resolveReturnAccountingDate } = require('./billing-returns');

function invoiceServiceDate(mrId, invoice) {
    return resolveServiceDate(db, invoice.additional_billing_id ? { additionalBillingId: invoice.additional_billing_id } : { mrId });
}

async function getReturns(req, res, next) {
    try {
        res.set('Cache-Control', 'no-store');
        const mrId = normalizeMrId(req.params.mrId);
        const data = await listReturns(db, mrId);
        for (const invoice of data.invoices) invoice.service_date = await invoiceServiceDate(mrId, invoice);
        res.json({ success: true, data: { ...data, today: formatDateLocal() } });
    } catch (error) { next(error); }
}

async function postReturn(req, res, next) {
    let guard;
    try {
        const mrId = normalizeMrId(req.params.mrId);
        const input = req.body || {};
        let saved = await findSavedReturn(db, mrId, input);
        if (saved) return res.json({ success: true, data: saved });
        const accountingDate = resolveReturnAccountingDate(input.accounting_date, {
            today: formatDateLocal(),
            minDate: await invoiceServiceDate(mrId, input)
        });
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
