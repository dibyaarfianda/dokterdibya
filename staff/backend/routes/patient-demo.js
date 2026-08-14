const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { verifyStaffToken, requireDoctorRole, JWT_SECRET } = require('../middleware/auth');
const PatientDemoService = require('../services/PatientDemoService');

const router = express.Router();
const exchangeLimiter = rateLimit({
    windowMs: 2 * 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, code: 'DEMO_EXCHANGE_RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba kembali nanti.' }
});

router.post('/sessions', verifyStaffToken, requireDoctorRole, async (req, res, next) => {
    try {
        const access = await PatientDemoService.createAccessCode(req.user.id);
        const launchUrl = new URL('/patient-demo-login.html', process.env.PATIENT_PORTAL_ORIGIN || 'https://sisiwanita.id');
        launchUrl.searchParams.set('code', access.code);
        return res.status(201).json({
            success: true,
            launchUrl: launchUrl.toString(),
            expiresInSeconds: access.expiresInSeconds
        });
    } catch (error) {
        return next(error);
    }
});

router.post('/exchange', exchangeLimiter, async (req, res, next) => {
    try {
        const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
        if (!/^[A-Za-z0-9_-]{20,80}$/.test(code)) {
            return res.status(400).json({ success: false, code: 'INVALID_DEMO_CODE', message: 'Kode demo tidak valid.' });
        }
        const session = await PatientDemoService.exchangeCode(code);
        if (!session) {
            return res.status(410).json({ success: false, code: 'DEMO_CODE_EXPIRED_OR_USED', message: 'Kode demo sudah kedaluwarsa atau telah digunakan.' });
        }
        const state = await PatientDemoService.getState();
        const user = { ...state.profile, demo_mode: true };
        const token = jwt.sign({
            id: user.id,
            email: user.email,
            role: 'patient',
            user_type: 'patient',
            demo_mode: true,
            demo_session_id: session.id
        }, JWT_SECRET, { expiresIn: '60m' });
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, token, expiresInSeconds: 3600, user });
    } catch (error) {
        return next(error);
    }
});

router.get('/status', verifyStaffToken, requireDoctorRole, async (_req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, status: await PatientDemoService.getStatus() });
    } catch (error) {
        return next(error);
    }
});

router.post('/reset', verifyStaffToken, requireDoctorRole, async (req, res, next) => {
    try {
        const state = await PatientDemoService.resetState(req.user.id);
        return res.json({
            success: true,
            message: 'Data dummy dikembalikan ke kondisi awal dan seluruh sesi aktif dicabut.',
            schemaVersion: state.schemaVersion
        });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
