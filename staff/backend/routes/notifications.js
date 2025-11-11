/**
 * Notification Routes
 * Send email and WhatsApp notifications
 */

const express = require('express');
const router = express.Router();
const NotificationService = require('../utils/notification');
const { verifyToken, requireRole, requirePermission } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendSuccess } = require('../utils/response');

/**
 * Test email configuration
 */
router.post('/test-email', verifyToken, requirePermission('settings.system'), asyncHandler(async (req, res) => {
    const { email } = req.body;
    const result = await NotificationService.testEmail(email);
    sendSuccess(res, result, result.success ? 'Test email sent' : 'Failed to send email');
}));

/**
 * Test WhatsApp configuration
 */
router.post('/test-whatsapp', verifyToken, requirePermission('settings.system'), asyncHandler(async (req, res) => {
    const { phone } = req.body;
    const result = await NotificationService.testWhatsApp(phone);
    sendSuccess(res, result, result.success ? 'Test WhatsApp sent' : 'Failed to send WhatsApp');
}));

/**
 * Send appointment reminder
 */
router.post('/appointment-reminder/:id', verifyToken, requirePermission('appointments.view'), asyncHandler(async (req, res) => {
    const AppointmentService = require('../services/AppointmentService');
    const appointment = await AppointmentService.getAppointmentById(req.params.id);
    
    await NotificationService.sendAppointmentReminder(appointment);
    sendSuccess(res, null, 'Appointment reminder sent');
}));

/**
 * Send low stock alert
 */
router.post('/low-stock-alert', verifyToken, requirePermission('stock.view'), asyncHandler(async (req, res) => {
    const ObatService = require('../services/ObatService');
    const lowStockItems = await ObatService.getLowStockItems();
    
    if (lowStockItems.length > 0) {
        await NotificationService.sendLowStockAlert(lowStockItems);
        sendSuccess(res, { itemCount: lowStockItems.length }, 'Low stock alert sent');
    } else {
        sendSuccess(res, null, 'No low stock items found');
    }
}));

/**
 * Send visit summary
 */
router.post('/visit-summary/:visitId', verifyToken, requirePermission('patients.view'), asyncHandler(async (req, res) => {
    const VisitService = require('../services/VisitService');
    const PatientService = require('../services/PatientService');
    
    const visit = await VisitService.getVisitById(req.params.visitId);
    const patient = await PatientService.getPatientById(visit.patient_id);
    
    await NotificationService.sendVisitSummary(visit, patient);
    sendSuccess(res, null, 'Visit summary sent');
}));

module.exports = router;
