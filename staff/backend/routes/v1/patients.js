/**
 * Patients Routes v1
 * API version 1 for patient operations
 */

const express = require('express');
const router = express.Router();
const PatientService = require('../../services/PatientService');
const { verifyToken, requireSuperadmin } = require('../../middleware/auth');
const { validatePatient } = require('../../middleware/validation');
const { asyncHandler } = require('../../middleware/errorHandler');
const { sendSuccess, sendCreated, sendError } = require('../../utils/response');

// ==================== PUBLIC ENDPOINTS (READ) ====================

// GET ALL PATIENTS (Public - no auth required)
router.get('/patients', asyncHandler(async (req, res) => {
    const { search, limit } = req.query;
    const patients = await PatientService.getAllPatients(search, limit);
    sendSuccess(res, patients, patients.length);
}));

// GET PATIENT BY ID (Public)
router.get('/patients/:id', asyncHandler(async (req, res) => {
    const patient = await PatientService.getPatientById(req.params.id);
    sendSuccess(res, patient);
}));

// ==================== PROTECTED ENDPOINTS (WRITE) ====================

// ADD NEW PATIENT
router.post('/patients', verifyToken, validatePatient, asyncHandler(async (req, res) => {
    const result = await PatientService.createPatient(req.body);
    sendCreated(res, result, 'Patient added successfully');
}));

// UPDATE PATIENT
router.put('/patients/:id', verifyToken, validatePatient, asyncHandler(async (req, res) => {
    const result = await PatientService.updatePatient(req.params.id, req.body);
    sendSuccess(res, result, 'Patient updated successfully');
}));

// DELETE PATIENT (superadmin/dokter only)
router.delete('/patients/:id', verifyToken, requireSuperadmin, asyncHandler(async (req, res) => {
    await PatientService.deletePatient(req.params.id);
    sendSuccess(res, null, 'Patient deleted successfully');
}));

// UPDATE LAST VISIT
router.patch('/patients/:id/last-visit', verifyToken, asyncHandler(async (req, res) => {
    await PatientService.updateLastVisit(req.params.id);
    sendSuccess(res, null, 'Last visit updated successfully');
}));

module.exports = router;
