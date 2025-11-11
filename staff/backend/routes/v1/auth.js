/**
 * Authentication Routes v1
 * API version 1 for authentication
 */

const express = require('express');
const router = express.Router();
const AuthService = require('../../services/AuthService');
const { verifyToken } = require('../../middleware/auth');
const { validateLogin, validatePasswordChange } = require('../../middleware/validation');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sendSuccess, sendError } = require('../../utils/response');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../../config/constants');

// LOGIN
router.post('/login', validateLogin, asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const result = await AuthService.login(username, password);
    sendSuccess(res, result, SUCCESS_MESSAGES.LOGIN_SUCCESS);
}));

// GET CURRENT USER
router.get('/me', verifyToken, asyncHandler(async (req, res) => {
    const user = await AuthService.getUserById(req.user.id);
    sendSuccess(res, user);
}));

// CHANGE PASSWORD
router.post('/change-password', verifyToken, validatePasswordChange, asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    await AuthService.changePassword(req.user.id, oldPassword, newPassword);
    sendSuccess(res, null, SUCCESS_MESSAGES.PASSWORD_CHANGE_SUCCESS);
}));

module.exports = router;
