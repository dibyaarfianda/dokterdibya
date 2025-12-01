// Backend API for Patients
// Save as: /var/www/dokterdibya/staff/backend/routes/patients.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../utils/cache');
const { verifyToken, requirePermission } = require('../middleware/auth');
const { validatePatient } = require('../middleware/validation');
const { deletePatientWithRelations } = require('../services/patientDeletion');

// ==================== PATIENT ENDPOINTS ====================

function applyCacheHeaders(res, { bypassCache, cacheKey, hit }) {
    const cacheControl = bypassCache
        ? 'no-store, no-cache, must-revalidate, proxy-revalidate'
        : 'private, max-age=60';

    res.set({
        'Cache-Control': cacheControl,
        'Pragma': bypassCache ? 'no-cache' : 'private',
        'Expires': bypassCache ? '0' : new Date(Date.now() + 60000).toUTCString(),
        'X-Cache-Status': hit ? 'HIT' : (bypassCache ? 'BYPASS' : 'MISS'),
        'X-Cache-Key': cacheKey
    });
}

// GET ALL PATIENTS (Protected - requires authentication and permission)
router.get('/api/patients', verifyToken, requirePermission('patients.view'), async (req, res) => {
    try {
        const { search, limit, hospital, sort, page, _ } = req.query;
        const clientCacheControl = (req.headers['cache-control'] || '').toLowerCase();
        const clientRequestsFresh = clientCacheControl.includes('no-cache') || clientCacheControl.includes('no-store');
        const bypassCache = typeof _ !== 'undefined' || clientRequestsFresh;

        // Generate cache key and honor bypass flag (frontend sends _=timestamp)
        const cacheKey = `patients:list:${search || 'all'}:${limit || 'all'}:${hospital || 'all'}:${sort || 'default'}:${page || '1'}`;

        if (!bypassCache) {
            const cached = cache.get(cacheKey, 'short');
            if (cached) {
                applyCacheHeaders(res, { bypassCache, cacheKey, hit: true });
                return res.json(cached);
            }
        }

        let query;
        const params = [];

        // If hospital filter is provided, get patients who have appointments at that hospital
        if (hospital) {
            query = `
                SELECT DISTINCT p.*
                FROM patients p
                INNER JOIN appointments a ON p.id = a.patient_id
                WHERE a.hospital_location = ?
            `;
            params.push(hospital);

            if (search) {
                query += ' AND (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            // Apply sorting based on sort parameter
            if (sort === 'recent') {
                query += ' ORDER BY p.created_at DESC';
            } else {
                query += ' ORDER BY p.last_visit DESC, p.full_name ASC';
            }
        } else {
            query = `SELECT p.*,
                (SELECT MAX(sa.appointment_date) FROM sunday_appointments sa
                 WHERE sa.patient_id = p.id AND sa.status IN ('completed','confirmed')) as actual_last_visit
                FROM patients p`;

            if (search) {
                query += ' WHERE (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            // Apply sorting based on sort parameter
            if (sort === 'recent') {
                query += ' ORDER BY p.created_at DESC';
            } else {
                query += ' ORDER BY p.last_visit DESC, p.full_name ASC';
            }
        }

        // Handle pagination - only apply if limit is explicitly provided
        let total = 0;
        let pageNum = 1;
        let limitNum = null;

        if (limit) {
            pageNum = parseInt(page) || 1;
            limitNum = parseInt(limit);
            const offset = (pageNum - 1) * limitNum;

            // Count total for pagination - use simple count query
            let countQuery = hospital
                ? `SELECT COUNT(DISTINCT p.id) as total FROM patients p
                   INNER JOIN appointments a ON p.id = a.patient_id
                   WHERE a.hospital_location = ?`
                : 'SELECT COUNT(*) as total FROM patients p';

            const countParams = [];
            if (hospital) {
                countParams.push(hospital);
                if (search) {
                    countQuery += ' AND (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                    const searchTerm = `%${search}%`;
                    countParams.push(searchTerm, searchTerm, searchTerm);
                }
            } else if (search) {
                countQuery += ' WHERE (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                const searchTerm = `%${search}%`;
                countParams.push(searchTerm, searchTerm, searchTerm);
            }

            const [countResult] = await db.query(countQuery, countParams);
            total = countResult[0]?.total || 0;

            // Apply limit and offset
            query += ' LIMIT ? OFFSET ?';
            params.push(limitNum, offset);
        }

        const [rows] = await db.query(query, params);

        // Map phone to whatsapp if whatsapp is null (for backward compatibility)
        // Use actual_last_visit from sunday_appointments if last_visit is null
        const mappedRows = rows.map(patient => ({
            ...patient,
            whatsapp: patient.whatsapp || patient.phone || null,
            last_visit: patient.last_visit || patient.actual_last_visit || null
        }));

        const response = {
            success: true,
            data: mappedRows,
            count: mappedRows.length
        };

        // Only include pagination if limit was provided
        if (limitNum) {
            response.pagination = {
                total,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum),
                limit: limitNum
            };
        }

        // Cache the result unless caller explicitly requested a fresh fetch
        if (!bypassCache) {
            cache.set(cacheKey, response, 'short');
        } else {
            cache.del(cacheKey, 'short');
        }

        applyCacheHeaders(res, { bypassCache, cacheKey, hit: false });
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

// GET OWN PROFILE (Patient can view their own profile)
router.get('/api/patients/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id; // From JWT token

        const [rows] = await db.query(
            `SELECT
                p.id,
                p.full_name as fullname,
                p.birth_date,
                p.age,
                p.phone,
                p.whatsapp,
                p.address,
                p.emergency_contact,
                p.marital_status,
                p.husband_name,
                p.husband_age,
                p.husband_job,
                p.occupation,
                p.education,
                p.insurance,
                p.nik,
                p.profile_completed,
                p.created_at,
                u.email,
                u.photo_url as profile_picture
            FROM patients p
            LEFT JOIN users u ON p.id = u.new_id
            WHERE p.id = ?`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Patient profile not found'
            });
        }

        res.json({
            success: true,
            user: rows[0]
        });
    } catch (error) {
        console.error('Error fetching patient profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile',
            error: error.message
        });
    }
});

// UPDATE OWN PROFILE (Patient can update their own profile)
router.put('/api/patients/profile/me', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id; // From JWT token
        const {
            patient_name,
            patient_dob,
            patient_phone,
            patient_emergency_contact,
            patient_address,
            patient_marital_status,
            patient_husband_name,
            husband_age,
            husband_job,
            patient_occupation,
            patient_education,
            patient_insurance,
            nik
        } = req.body;

        // Calculate age from birth_date
        let age = null;
        if (patient_dob) {
            const birthDate = new Date(patient_dob);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
        }

        // Update patient record
        const [result] = await db.query(
            `UPDATE patients SET
                full_name = ?,
                birth_date = ?,
                age = ?,
                phone = ?,
                whatsapp = ?,
                updated_at = NOW()
            WHERE id = ?`,
            [patient_name, patient_dob, age, patient_phone, patient_phone, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Patient profile not found' });
        }

        // Invalidate patient cache
        cache.delPattern('patients:');

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                patient_id: userId
            }
        });
    } catch (error) {
        console.error('Error updating patient profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
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

// UPDATE PATIENT STATUS
router.patch('/api/patients/:id/status', verifyToken, requirePermission('patients.edit'), async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status. Must be "active" or "inactive"' 
            });
        }
        
        const [result] = await db.query(
            'UPDATE patients SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }
        
        // Invalidate cache
        cache.invalidatePattern('patients:');
        
        res.json({ 
            success: true, 
            message: `Patient status updated to ${status}`,
            data: { id: req.params.id, status }
        });
    } catch (error) {
        console.error('Error updating patient status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update patient status', 
            error: error.message 
        });
    }
});

// DELETE PATIENT - Handled by patients-auth.js to avoid route conflicts
// (All /api/patients CRUD is routed through patients-auth.js)

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

