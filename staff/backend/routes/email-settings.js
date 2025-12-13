const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendSuccess, sendError } = require('../utils/response');
const EmailTemplateService = require('../services/EmailTemplateService');
const NotificationService = require('../utils/notification');

// GET /api/email-settings
router.get('/', verifyToken, asyncHandler(async (req, res) => {
    const settings = await EmailTemplateService.getSettings();
    return sendSuccess(res, settings, 'Email settings loaded');
}));

// PUT /api/email-settings
router.put('/', verifyToken, asyncHandler(async (req, res) => {
    const { senderName, templates } = req.body || {};

    try {
        await EmailTemplateService.saveSettings({
            senderName,
            templates,
            userId: req.user?.id
        });
    } catch (error) {
        return sendError(res, error.message || 'Failed to save email settings', 400);
    }

    if (typeof NotificationService.invalidateTemplateCache === 'function') {
        NotificationService.invalidateTemplateCache();
    }

    const updatedSettings = await EmailTemplateService.getSettings();
    return sendSuccess(res, updatedSettings, 'Email settings updated');
}));

module.exports = router;
