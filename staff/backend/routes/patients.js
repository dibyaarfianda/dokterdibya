// Backend API for Patients
// Save as: /var/www/dokterdibya/staff/backend/routes/patients.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../utils/cache');
const { verifyToken, requirePermission } = require('../middleware/auth');
const { validatePatient } = require('../middleware/validation');

// ==================== PATIENT ENDPOINTS ====================

// GET ALL PATIENTS (Protected - requires authentication and permission)
router.get('/api/patients', verifyToken, requirePermission('patients.view'), async (req, res) => {
    try {
        const { search, limit } = req.query;
        
        // Generate cache key
        const cacheKey = `patients:list:${search || 'all'}:${limit || 'all'}`;
        
        // Try to get from cache
        const cached = cache.get(cacheKey, 'short');
        if (cached) {
            return res.json(cached);
        }
        
        let query = 'SELECT * FROM patients WHERE patient_type = ?';
        const params = ['walk-in'];
        
        if (search) {
            query += ' AND (full_name LIKE ? OR id LIKE ? OR whatsapp LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }
        
        query += ' ORDER BY last_visit DESC, full_name ASC';
        
        if (limit) {
            query += ' LIMIT ?';
            params.push(parseInt(limit));
        }
        
        const [rows] = await db.query(query, params);
        
        // Map phone to whatsapp if whatsapp is null (for backward compatibility)
        const mappedRows = rows.map(patient => ({
            ...patient,
            whatsapp: patient.whatsapp || patient.phone || null
        }));
        
        const response = {
            success: true,
            data: mappedRows,
            count: mappedRows.length
        };
        
        // Cache the result
        cache.set(cacheKey, response, 'short');
        
        res.json(response);
    } catch (error) {
        console.error('Error fetching patients:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patients',
            error: error.message
        });
    }
});

// GET PATIENT BY ID (Protected)
router.get('/api/patients/:id', verifyToken, requirePermission('patients.view'), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM patients WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error fetching patient by ID:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch patient', error: error.message });
    }
});

// ==================== PROTECTED ENDPOINTS (WRITE) ====================

// ADD NEW PATIENT
router.post('/api/patients', verifyToken, requirePermission('patients.create'), validatePatient, async (req, res) => {
    try {
        const { id, full_name, whatsapp, birth_date } = req.body;
        
        if (!id || !full_name) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: id, full_name' 
            });
        }
        
        // Check if patient ID already exists
        const [existing] = await db.query('SELECT id FROM patients WHERE id = ?', [id]);
        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Patient ID already exists' 
            });
        }
        
        // Calculate age from birth_date
        let age = null;
        if (birth_date) {
            const birthDate = new Date(birth_date);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
        }
        
        const [result] = await db.query(
            'INSERT INTO patients (id, full_name, whatsapp, birth_date, age, patient_type) VALUES (?, ?, ?, ?, ?, ?)',
            [id, full_name, whatsapp || null, birth_date || null, age, 'walk-in']
        );
        
        // Invalidate patient list cache
        cache.delPattern('patients:list');
        
        res.status(201).json({ 
            success: true, 
            message: 'Patient added successfully', 
            id: id,
            age: age
        });
    } catch (error) {
        console.error('Error adding patient:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                success: false, 
                message: 'Patient ID already exists' 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add patient', 
            error: error.message 
        });
    }
});

// UPDATE PATIENT
router.put('/api/patients/:id', verifyToken, requirePermission('patients.edit'), validatePatient, async (req, res) => {
    try {
        const { full_name, whatsapp, birth_date, allergy, medical_history } = req.body;
        
        // Calculate age from birth_date
        let age = null;
        if (birth_date) {
            const birthDate = new Date(birth_date);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
        }
        
        const [result] = await db.query(
            'UPDATE patients SET full_name = ?, whatsapp = ?, birth_date = ?, age = ?, allergy = ?, medical_history = ? WHERE id = ?',
            [full_name, whatsapp, birth_date, age, allergy || null, medical_history || null, req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }
        
        // Invalidate patient cache
        cache.delPattern('patients:');
        
        res.json({ success: true, message: 'Patient updated successfully', age: age });
    } catch (error) {
        console.error('Error updating patient:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update patient', 
            error: error.message 
        });
    }
});

// UPDATE LAST VISIT
router.patch('/api/patients/:id/visit', verifyToken, async (req, res) => {
    try {
        const [result] = await db.query(
            'UPDATE patients SET last_visit = NOW(), visit_count = visit_count + 1 WHERE id = ?',
            [req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }
        
        res.json({ success: true, message: 'Visit recorded successfully' });
    } catch (error) {
        console.error('Error updating visit:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update visit', 
            error: error.message 
        });
    }
});

// DELETE PATIENT
router.delete('/api/patients/:id', verifyToken, requirePermission('patients.delete'), async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const patientId = req.params.id;
        console.log('DELETE request for patient ID:', patientId, 'Type:', typeof patientId);
        
        // First check if patient exists
        const [checkResult] = await connection.query('SELECT id, full_name, email FROM patients WHERE id = ?', [patientId]);
        console.log('Patient check result:', checkResult);
        
        if (checkResult.length === 0) {
            console.log('Patient not found in database');
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Pasien tidak ditemukan' });
        }
        
        const patient = checkResult[0];
        const deletionLog = {
            patient_id: patientId,
            patient_name: patient.full_name,
            patient_email: patient.email,
            deleted_data: {}
        };
        
        // URUTAN PENGHAPUSAN (PENTING!)
        // Hapus dari tabel child terlebih dahulu, baru tabel parent
        
        // 1. Hapus billing_items (child dari billings)
        const [billingItemsResult] = await connection.query(
            'DELETE FROM billing_items WHERE billing_id IN (SELECT id FROM billings WHERE patient_id = ?)',
            [patientId]
        );
        deletionLog.deleted_data.billing_items = billingItemsResult.affectedRows;
        console.log(`Deleted ${billingItemsResult.affectedRows} billing items`);
        
        // 2. Hapus payment_transactions (child dari billings)
        const [paymentResult] = await connection.query(
            'DELETE FROM payment_transactions WHERE billing_id IN (SELECT id FROM billings WHERE patient_id = ?)',
            [patientId]
        );
        deletionLog.deleted_data.payment_transactions = paymentResult.affectedRows;
        console.log(`Deleted ${paymentResult.affectedRows} payment transactions`);
        
        // 3. Hapus billings (parent, ada FK ke patients)
        const [billingsResult] = await connection.query(
            'DELETE FROM billings WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.billings = billingsResult.affectedRows;
        console.log(`Deleted ${billingsResult.affectedRows} billings`);
        
        // 4. Hapus patient_records (ada FK ke patients)
        const [recordsResult] = await connection.query(
            'DELETE FROM patient_records WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.patient_records = recordsResult.affectedRows;
        console.log(`Deleted ${recordsResult.affectedRows} patient records`);
        
        // 5. Hapus medical_records (ada patient_id)
        const [medicalResult] = await connection.query(
            'DELETE FROM medical_records WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.medical_records = medicalResult.affectedRows;
        console.log(`Deleted ${medicalResult.affectedRows} medical records`);
        
        // 6. Hapus medical_exams (ada patient_id)
        const [examsResult] = await connection.query(
            'DELETE FROM medical_exams WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.medical_exams = examsResult.affectedRows;
        console.log(`Deleted ${examsResult.affectedRows} medical exams`);
        
        // 7. Hapus visits (ada patient_id)
        const [visitsResult] = await connection.query(
            'DELETE FROM visits WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.visits = visitsResult.affectedRows;
        console.log(`Deleted ${visitsResult.affectedRows} visits`);
        
        // 8. Hapus appointments (ada patient_id)
        const [appointmentsResult] = await connection.query(
            'DELETE FROM appointments WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.appointments = appointmentsResult.affectedRows;
        console.log(`Deleted ${appointmentsResult.affectedRows} appointments`);
        
        // 9. Hapus patient intake submissions (jika ada)
        const [intakeResult] = await connection.query(
            'DELETE FROM patient_intake_submissions WHERE patient_id = ?',
            [patientId]
        );
        deletionLog.deleted_data.patient_intake_submissions = intakeResult.affectedRows;
        console.log(`Deleted ${intakeResult.affectedRows} patient intake submissions`);
        
        // 10. TERAKHIR: Hapus patients (parent table)
        const [patientResult] = await connection.query(
            'DELETE FROM patients WHERE id = ?',
            [patientId]
        );
        deletionLog.deleted_data.patient = patientResult.affectedRows;
        console.log(`Deleted ${patientResult.affectedRows} patient`);
        
        if (patientResult.affectedRows === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Pasien tidak ditemukan' });
        }
        
        await connection.commit();
        connection.release();
        
        console.log(`Patient ${patient.full_name} (ID: ${patientId}) deleted successfully with all related data:`, deletionLog.deleted_data);
        
        res.json({ 
            success: true, 
            message: `Pasien ${patient.full_name} dan semua data terkait berhasil dihapus`,
            deleted_data: deletionLog.deleted_data
        });
        
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Error deleting patient:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal menghapus pasien: ' + error.message, 
            error: error.message 
        });
    }
});

// GENERATE UNIQUE PATIENT ID
router.get('/api/patients/generate-id', async (req, res) => {
    try {
        // Get last patient ID
        const [rows] = await db.query('SELECT id FROM patients ORDER BY id DESC LIMIT 1');
        
        let newId;
        if (rows.length === 0) {
            newId = '10001'; // Start from 10001
        } else {
            const lastId = parseInt(rows[0].id);
            newId = (lastId + 1).toString();
        }
        
        res.json({ success: true, id: newId });
    } catch (error) {
        console.error('Error generating patient ID:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to generate patient ID', 
            error: error.message 
        });
    }
});

module.exports = router;

