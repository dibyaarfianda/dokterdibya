'use strict';

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { verifyToken, verifyActiveStaff } = require('../middleware/auth');
const { accessControlService } = require('../services/AccessControlService');

function createAccountAccessSelfRouter({
    effectiveAccessService = accessControlService,
    auth = { verifyToken, verifyActiveStaff }
} = {}) {
    const router = express.Router();
    router.get('/me', auth.verifyToken, auth.verifyActiveStaff, asyncHandler(async (req, res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        const access = await effectiveAccessService.getEffectiveAccess(req.user.id);
        return res.json({ success: true, data: effectiveAccessService.toPublicAccess(access) });
    }));
    return router;
}

module.exports = createAccountAccessSelfRouter();
module.exports.createAccountAccessSelfRouter = createAccountAccessSelfRouter;
