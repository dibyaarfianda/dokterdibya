const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Encryption config
const ENCRYPTION_KEY = process.env.INTAKE_ENCRYPTION_KEY || '';
const ALGORITHM = 'aes-256-gcm';

// Get encryption key as Buffer
function getEncryptionKey() {
    if (!ENCRYPTION_KEY) {
        throw new Error('INTAKE_ENCRYPTION_KEY tidak ditemukan');
    }
    return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

// Decrypt patient intake data
function decryptData(encrypted) {
    try {
        const key = getEncryptionKey();
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            key,
            Buffer.from(encrypted.iv, 'base64')
        );
        decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
        
        let decrypted = decipher.update(encrypted.data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        return JSON.parse(decrypted);
    } catch (error) {
        logger.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
}

// Convert intake submission to patient record
router.post('/api/patient-records/from-intake', verifyToken, async (req, res) => {
    const { submissionId } = req.body;
    
    if (!submissionId) {
        return res.status(400).json({
            success: false,
            message: 'Submission ID required'
        });
    }
    
    try {
        // Read intake file
        const intakeDir = path.join(__dirname, '../logs/patient-intake');
        const intakeFile = path.join(intakeDir, `${submissionId}.json`);
        
        const fileContent = await fs.readFile(intakeFile, 'utf8');
        const intakeData = JSON.parse(fileContent);
        
        // Decrypt patient data
        const decryptedData = decryptData(intakeData.encrypted);
        
        logger.info('Decrypted intake data:', JSON.stringify(decryptedData, null, 2));
        
        // Insert into patient_records
        const insertSQL = `
            INSERT INTO patient_records (
                patient_id, submission_id, patient_name, nik, phone,
                birth_date, age, address,
                lmp, edd, gestational_age, gravida, para, abortus, living,
                chief_complaint, current_pregnancy_history, obstetric_history,
                medical_history, family_history, current_symptoms,
                high_risk, risk_factors, status, reported_at,
                doctor_id, doctor_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const values = [
            decryptedData.patientId || null,
            submissionId,
            decryptedData.name || null,
            decryptedData.nik || null,
            decryptedData.phone || null,
            decryptedData.birthDate || null,
            decryptedData.age || null,
            decryptedData.address || null,
            decryptedData.lmp || null,
            decryptedData.edd || null,
            decryptedData.gestationalAge || null,
            decryptedData.gravida || null,
            decryptedData.para || null,
            decryptedData.abortus || null,
            decryptedData.living || null,
            decryptedData.chiefComplaint || decryptedData.reason || null,
            decryptedData.currentPregnancyHistory || null,
            decryptedData.obstetricHistory || null,
            JSON.stringify(decryptedData.medicalHistory || {}),
            JSON.stringify(decryptedData.familyHistory || {}),
            decryptedData.currentSymptoms || null,
            intakeData.highRisk || false,
            JSON.stringify(intakeData.riskFlags || []),
            'patient_reported',
            intakeData.receivedAt,
            req.user.id,
            req.user.name || req.user.email
        ];
        
        const [result] = await db.query(insertSQL, values);
        
        logger.info(`Patient record created from intake: ${submissionId}`);
        
        res.json({
            success: true,
            message: 'Patient record created successfully',
            data: {
                recordId: result.insertId,
                submissionId: submissionId,
                patientId: decryptedData.patientId
            }
        });
        
    } catch (error) {
        logger.error('Error creating patient record from intake:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create patient record',
            error: error.message
        });
    }
});

// Update patient record (examination)
router.put('/api/patient-records/:recordId', verifyToken, async (req, res) => {
    const { recordId } = req.params;
    const {
        // Physical Examination
        vitalSigns,
        generalCondition,
        headNeck,
        thorax,
        abdomen,
        extremities,
        obstetricExam,
        
        // USG
        usgFindings,
        usgImages,
        
        // Laboratory
        labResults,
        
        // Diagnosis & Treatment
        diagnosis,
        treatmentPlan,
        medications,
        nextVisit,
        
        // Status
        status
    } = req.body;
    
    try {
        // Build update query dynamically
        const updates = [];
        const values = [];
        
        if (vitalSigns) {
            updates.push('vital_signs = ?');
            values.push(JSON.stringify(vitalSigns));
        }
        if (generalCondition !== undefined) {
            updates.push('general_condition = ?');
            values.push(generalCondition);
        }
        if (headNeck !== undefined) {
            updates.push('head_neck = ?');
            values.push(headNeck);
        }
        if (thorax !== undefined) {
            updates.push('thorax = ?');
            values.push(thorax);
        }
        if (abdomen !== undefined) {
            updates.push('abdomen = ?');
            values.push(abdomen);
        }
        if (extremities !== undefined) {
            updates.push('extremities = ?');
            values.push(extremities);
        }
        if (obstetricExam) {
            updates.push('obstetric_exam = ?');
            values.push(JSON.stringify(obstetricExam));
        }
        if (usgFindings) {
            updates.push('usg_findings = ?');
            values.push(JSON.stringify(usgFindings));
        }
        if (usgImages) {
            updates.push('usg_images = ?');
            values.push(JSON.stringify(usgImages));
        }
        if (labResults) {
            updates.push('lab_results = ?');
            values.push(JSON.stringify(labResults));
        }
        if (diagnosis !== undefined) {
            updates.push('diagnosis = ?');
            values.push(diagnosis);
        }
        if (treatmentPlan !== undefined) {
            updates.push('treatment_plan = ?');
            values.push(treatmentPlan);
        }
        if (medications) {
            updates.push('medications = ?');
            values.push(JSON.stringify(medications));
        }
        if (nextVisit !== undefined) {
            updates.push('next_visit = ?');
            values.push(nextVisit);
        }
        if (status) {
            updates.push('status = ?');
            values.push(status);
            
            if (status === 'examined' && !values.includes('examined_at')) {
                updates.push('examined_at = NOW()');
            }
            if (status === 'completed' && !values.includes('completed_at')) {
                updates.push('completed_at = NOW()');
            }
        }
        
        // Add examiner info
        updates.push('examined_by = ?');
        values.push(req.user.email);
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        
        values.push(recordId);
        
        const updateSQL = `UPDATE patient_records SET ${updates.join(', ')} WHERE id = ?`;
        
        await db.query(updateSQL, values);
        
        logger.info(`Patient record updated: ${recordId} by ${req.user.email}`);
        
        res.json({
            success: true,
            message: 'Patient record updated successfully'
        });
        
    } catch (error) {
        logger.error('Error updating patient record:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update patient record',
            error: error.message
        });
    }
});

// GET ROUTES - Order matters! Specific routes BEFORE dynamic param routes

// Get all records for a patient
router.get('/api/patient-records/patient/:patientId', verifyToken, async (req, res) => {
    const { patientId } = req.params;
    
    try {
        const [records] = await db.query(
            `SELECT id, submission_id, patient_name, status, 
                    reported_at, examined_at, completed_at, 
                    chief_complaint, diagnosis, doctor_name
             FROM patient_records 
             WHERE patient_id = ? 
             ORDER BY reported_at DESC`,
            [patientId]
        );
        
        res.json({
            success: true,
            count: records.length,
            data: records
        });
        
    } catch (error) {
        logger.error('Error fetching patient records:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patient records',
            error: error.message
        });
    }
});

// Get record by submission ID
router.get('/api/patient-records/submission/:submissionId', verifyToken, async (req, res) => {
    const { submissionId } = req.params;
    
    try {
        const [results] = await db.query(
            'SELECT * FROM patient_records WHERE submission_id = ? LIMIT 1',
            [submissionId]
        );
        
        if (!results || results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Patient record not found'
            });
        }
        
        const record = results[0];
        
        // Parse JSON fields
        if (record.vital_signs) record.vital_signs = JSON.parse(record.vital_signs);
        if (record.obstetric_exam) record.obstetric_exam = JSON.parse(record.obstetric_exam);
        if (record.usg_findings) record.usg_findings = JSON.parse(record.usg_findings);
        if (record.usg_images) record.usg_images = JSON.parse(record.usg_images);
        if (record.lab_results) record.lab_results = JSON.parse(record.lab_results);
        if (record.risk_factors) record.risk_factors = JSON.parse(record.risk_factors);
        if (record.medications) record.medications = JSON.parse(record.medications);
        if (record.medical_history) record.medical_history = JSON.parse(record.medical_history);
        if (record.family_history) record.family_history = JSON.parse(record.family_history);
        
        res.json({
            success: true,
            data: record
        });
        
    } catch (error) {
        logger.error('Error fetching patient record:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patient record',
            error: error.message
        });
    }
});

// Get patient record by ID (MUST be last among GET routes)
router.get('/api/patient-records/:recordId', verifyToken, async (req, res) => {
    const { recordId } = req.params;
    
    try {
        const [results] = await db.query(
            'SELECT * FROM patient_records WHERE id = ? LIMIT 1',
            [recordId]
        );
        
        if (!results || results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Patient record not found'
            });
        }
        
        const record = results[0];
        
        // Parse JSON fields
        if (record.vital_signs) record.vital_signs = JSON.parse(record.vital_signs);
        if (record.obstetric_exam) record.obstetric_exam = JSON.parse(record.obstetric_exam);
        if (record.usg_findings) record.usg_findings = JSON.parse(record.usg_findings);
        if (record.usg_images) record.usg_images = JSON.parse(record.usg_images);
        if (record.lab_results) record.lab_results = JSON.parse(record.lab_results);
        if (record.risk_factors) record.risk_factors = JSON.parse(record.risk_factors);
        if (record.medications) record.medications = JSON.parse(record.medications);
        if (record.medical_history) record.medical_history = JSON.parse(record.medical_history);
        if (record.family_history) record.family_history = JSON.parse(record.family_history);
        
        res.json({
            success: true,
            data: record
        });
        
    } catch (error) {
        logger.error('Error fetching patient record:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patient record',
            error: error.message
        });
    }
});

module.exports = router;
