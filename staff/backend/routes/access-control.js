'use strict';

const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const {
    verifyToken,
    verifyActiveStaff,
    requireSuperadmin
} = require('../middleware/auth');
const { accessControlService } = require('../services/AccessControlService');
const { accessControlManagementService } = require('../services/AccessControlManagementService');
const { refreshUserAccessRooms } = require('../security/socketAccess');

function sendData(res, data, statusCode = 200) {
    return res.status(statusCode).json({ success: true, data });
}

function createAccessControlRouter({
    managementService = accessControlManagementService,
    effectiveAccessService = accessControlService,
    refreshAccessRooms = refreshUserAccessRooms,
    auth = { verifyToken, verifyActiveStaff, requireSuperadmin }
} = {}) {
    const router = express.Router();

    router.use((_req, res, next) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        next();
    });

    // Public activation endpoints accept the raw invitation token only in the JSON body.
    router.post('/invitations/validate', asyncHandler(async (req, res) => {
        const data = await managementService.validateInvitation(req.body?.token);
        return sendData(res, data);
    }));

    router.post('/invitations/accept', asyncHandler(async (req, res) => {
        const data = await managementService.acceptInvitation(req.body?.token, req.body?.password);
        return sendData(res, data);
    }));

    router.get('/me', auth.verifyToken, auth.verifyActiveStaff, asyncHandler(async (req, res) => {
        const access = await effectiveAccessService.getEffectiveAccess(req.user.id);
        return sendData(res, effectiveAccessService.toPublicAccess(access));
    }));

    router.use(auth.verifyToken, auth.verifyActiveStaff, auth.requireSuperadmin);

    router.get('/catalog', asyncHandler(async (_req, res) => {
        return sendData(res, await managementService.getCatalog());
    }));

    router.get('/users', asyncHandler(async (_req, res) => {
        return sendData(res, await managementService.listUsers());
    }));

    router.get('/users/:id', asyncHandler(async (req, res) => {
        return sendData(res, await managementService.getUser(req.params.id));
    }));

    router.put('/users/:id/permissions', asyncHandler(async (req, res) => {
        const data = await managementService.savePermissions(req.params.id, req.body, req.user.id);
        await refreshAccessRooms(req.app.get('io'), req.params.id);
        return sendData(res, data);
    }));

    router.patch('/users/:id/status', asyncHandler(async (req, res) => {
        const data = await managementService.setStatus(req.params.id, req.body, req.user.id);
        await refreshAccessRooms(req.app.get('io'), req.params.id);
        return sendData(res, data);
    }));

    router.post('/invitations', asyncHandler(async (req, res) => {
        const data = await managementService.createInvitation(req.body, req.user.id);
        return sendData(res, data, 201);
    }));

    router.post('/users/:id/invitations', asyncHandler(async (req, res) => {
        const data = await managementService.resendInvitation(req.params.id, req.user.id);
        return sendData(res, data);
    }));

    return router;
}

module.exports = createAccessControlRouter();
module.exports.createAccessControlRouter = createAccessControlRouter;
