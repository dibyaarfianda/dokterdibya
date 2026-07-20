'use strict';

const db = require('../../db');
const realtimeSync = require('../../realtime-sync');
const { ROLE_NAMES } = require('../../constants/roles');
const { AppError } = require('../../middleware/errorHandler');
const { sendSuccess, sendCreated } = require('../../utils/response');
const SundayClinicClosingService = require('../SundayClinicClosingService');

function getActor(req) {
    const user = req.user || {};
    return {
        userId: user.new_id || user.id,
        name: user.name || user.display_name || user.email || user.id,
        role: user.role || ROLE_NAMES.DOKTER
    };
}

async function getClosingPreview(req, res) {
    const data = await SundayClinicClosingService.getClosingPreview(db, req.query.date || null);
    return sendSuccess(res, data, 'Preview closing Sunday Clinic berhasil dimuat.');
}

async function postClosing(req, res) {
    const date = req.body?.date;
    const fingerprint = req.body?.fingerprint;
    if (!date || !fingerprint) {
        throw new AppError('Tanggal dan fingerprint preview wajib diisi.', 400, true, 'CLOSING_INPUT_REQUIRED');
    }

    const data = await SundayClinicClosingService.createClosing(db, {
        date,
        fingerprint,
        actor: getActor(req)
    });

    if (data.created) {
        realtimeSync.broadcast({
            type: 'sunday_clinic_closing_updated',
            closingId: data.id,
            clinicDate: data.clinic_date,
            closedBy: data.closed_record?.closed_by_name || null,
            timestamp: new Date().toISOString()
        });
        return sendCreated(res, data, 'Closing Sunday Clinic berhasil disimpan.');
    }
    return sendSuccess(res, data, 'Closing Sunday Clinic sudah tersimpan sebelumnya.');
}

async function getClosings(req, res) {
    const data = await SundayClinicClosingService.listClosings(db, { limit: req.query.limit });
    return sendSuccess(res, data, 'Riwayat closing Sunday Clinic berhasil dimuat.');
}

async function getClosingById(req, res) {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
        throw new AppError('ID closing tidak valid.', 400, true, 'INVALID_CLOSING_ID');
    }
    const data = await SundayClinicClosingService.getClosingDetailWithReconciliation(db, id);
    return sendSuccess(res, data, 'Detail closing Sunday Clinic berhasil dimuat.');
}

module.exports = {
    getClosingPreview,
    postClosing,
    getClosings,
    getClosingById
};
