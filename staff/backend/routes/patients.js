// Backend API for Patients
// Save as: /var/www/dokterdibya/staff/backend/routes/patients.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../utils/cache');
const { verifyToken } = require('../middleware/auth');
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
router.get('/api/patients', verifyToken, async (req, res) => {
    try {
        const { search, limit, hospital, sort, page, _, last_visit_location } = req.query;
        const clientCacheControl = (req.headers['cache-control'] || '').toLowerCase();
        const clientRequestsFresh = clientCacheControl.includes('no-cache') || clientCacheControl.includes('no-store');
        const bypassCache = typeof _ !== 'undefined' || clientRequestsFresh;

        // Generate cache key and honor bypass flag (frontend sends _=timestamp)
        const cacheKey = `patients:list:${search || 'all'}:${limit || 'all'}:${hospital || 'all'}:${sort || 'default'}:${page || '1'}:${last_visit_location || 'all'}`;

        if (!bypassCache) {
            const cached = cache.get(cacheKey, 'short');
            if (cached) {
                applyCacheHeaders(res, { bypassCache, cacheKey, hit: true });
                return res.json(cached);
            }
        }

        let query;
        const params = [];

        // Filter by last visit location from sunday_clinic_records
        if (last_visit_location) {
            if (last_visit_location === 'no_visit') {
                // Patients with no visits (Pasien Baru)
                query = `
                    SELECT p.*,
                        NULL as last_visit_loc,
                        NULL as last_visit_date,
                        NULL as mr_id
                    FROM patients p
                    WHERE NOT EXISTS (
                        SELECT 1 FROM sunday_clinic_records scr WHERE scr.patient_id = p.id
                    )
                `;
            } else {
                // Patients whose last visit was at specific location
                // Use resume_medis creation date from medical_records as visit date
                query = `
                    SELECT p.*,
                        latest.visit_location as last_visit_loc,
                        latest.mr_id as mr_id,
                        COALESCE(resume.resume_date, latest.last_activity_at) as last_visit_date
                    FROM patients p
                    INNER JOIN (
                        SELECT scr.patient_id, scr.visit_location, scr.mr_id, scr.last_activity_at
                        FROM sunday_clinic_records scr
                        INNER JOIN (
                            SELECT patient_id, MAX(last_activity_at) as max_activity
                            FROM sunday_clinic_records
                            GROUP BY patient_id
                        ) latest_visit ON scr.patient_id = latest_visit.patient_id
                            AND scr.last_activity_at = latest_visit.max_activity
                    ) latest ON p.id = latest.patient_id
                    LEFT JOIN (
                        SELECT mr_id COLLATE utf8mb4_general_ci as mr_id, MAX(created_at) as resume_date
                        FROM medical_records
                        WHERE record_type = 'resume_medis'
                        GROUP BY mr_id
                    ) resume ON latest.mr_id = resume.mr_id
                    WHERE latest.visit_location = ?
                `;
                params.push(last_visit_location);
            }

            if (search) {
                query += ' AND (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            // Apply sorting - default to last_visit DESC (most recent visit first)
            if (sort === 'name') {
                query += ' ORDER BY p.full_name ASC';
            } else {
                query += ' ORDER BY p.last_visit DESC, p.created_at DESC';
            }
        }
        // If hospital filter is provided, get patients who have appointments at that hospital
        else if (hospital) {
            query = `
                SELECT DISTINCT p.*,
                    (SELECT scr.mr_id FROM sunday_clinic_records scr
                     WHERE scr.patient_id = p.id
                     ORDER BY scr.last_activity_at DESC LIMIT 1) as mr_id,
                    (SELECT scr.visit_location FROM sunday_clinic_records scr
                     WHERE scr.patient_id = p.id
                     ORDER BY scr.last_activity_at DESC LIMIT 1) as visit_location
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

            // Apply sorting - default to last_visit DESC (most recent visit first)
            if (sort === 'name') {
                query += ' ORDER BY p.full_name ASC';
            } else {
                query += ' ORDER BY p.last_visit DESC, p.created_at DESC';
            }
        } else {
            query = `SELECT p.*,
                (SELECT MAX(sa.appointment_date) FROM sunday_appointments sa
                 WHERE sa.patient_id = p.id AND sa.status IN ('completed','confirmed')) as actual_last_visit,
                (SELECT scr.mr_id FROM sunday_clinic_records scr
                 WHERE scr.patient_id = p.id
                 ORDER BY scr.last_activity_at DESC LIMIT 1) as mr_id,
                (SELECT scr.visit_location FROM sunday_clinic_records scr
                 WHERE scr.patient_id = p.id
                 ORDER BY scr.last_activity_at DESC LIMIT 1) as visit_location
                FROM patients p`;

            if (search) {
                query += ' WHERE (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            // Apply sorting - default to last_visit DESC (most recent visit first)
            if (sort === 'name') {
                query += ' ORDER BY p.full_name ASC';
            } else {
                query += ' ORDER BY p.last_visit DESC, p.created_at DESC';
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

            // Count total for pagination
            let countQuery;
            const countParams = [];

            if (last_visit_location) {
                if (last_visit_location === 'no_visit') {
                    countQuery = `
                        SELECT COUNT(*) as total FROM patients p
                        WHERE NOT EXISTS (
                            SELECT 1 FROM sunday_clinic_records scr WHERE scr.patient_id = p.id
                        )
                    `;
                } else {
                    countQuery = `
                        SELECT COUNT(*) as total FROM patients p
                        INNER JOIN (
                            SELECT scr.patient_id, scr.visit_location
                            FROM sunday_clinic_records scr
                            INNER JOIN (
                                SELECT patient_id, MAX(last_activity_at) as max_activity
                                FROM sunday_clinic_records
                                GROUP BY patient_id
                            ) latest_visit ON scr.patient_id = latest_visit.patient_id
                                AND scr.last_activity_at = latest_visit.max_activity
                        ) latest ON p.id = latest.patient_id
                        WHERE latest.visit_location = ?
                    `;
                    countParams.push(last_visit_location);
                }
                if (search) {
                    countQuery += ' AND (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                    const searchTerm = `%${search}%`;
                    countParams.push(searchTerm, searchTerm, searchTerm);
                }
            } else if (hospital) {
                countQuery = `SELECT COUNT(DISTINCT p.id) as total FROM patients p
                   INNER JOIN appointments a ON p.id = a.patient_id
                   WHERE a.hospital_location = ?`;
                countParams.push(hospital);
                if (search) {
                    countQuery += ' AND (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                    const searchTerm = `%${search}%`;
                    countParams.push(searchTerm, searchTerm, searchTerm);
                }
            } else {
                countQuery = 'SELECT COUNT(*) as total FROM patients p';
                if (search) {
                    countQuery += ' WHERE (p.full_name LIKE ? OR p.id LIKE ? OR p.whatsapp LIKE ?)';
                    const searchTerm = `%${search}%`;
                    countParams.push(searchTerm, searchTerm, searchTerm);
                }
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
        // Also use last_visit_date from sunday_clinic_records for location-based queries
        const mappedRows = rows.map(patient => ({
            ...patient,
            whatsapp: patient.whatsapp || patient.phone || null,
            last_visit: patient.last_visit || patient.actual_last_visit || patient.last_visit_date || null
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

// ADVANCED SEARCH - Search by specific fields
router.get('/api/patients/search/advanced', verifyToken, async (req, res) => {
    try {
        const {
            name,       // Nama pasien
            id,         // ID pasien
            mr_id,      // MR ID dari sunday_clinic_records
            email,      // Email dari users table
            age_min,    // Umur minimum
            age_max,    // Umur maximum
            phone,      // Nomor HP
            whatsapp,   // Nomor WhatsApp
            husband,    // Nama suami
            limit,
            page
        } = req.query;

        // Build dynamic query with LEFT JOINs for MR and email
        let query = `
            SELECT DISTINCT
                p.*,
                scr.mr_id,
                u.email,
                (SELECT MAX(sa.appointment_date) FROM sunday_appointments sa
                 WHERE sa.patient_id = p.id AND sa.status IN ('completed','confirmed')) as actual_last_visit
            FROM patients p
            LEFT JOIN sunday_clinic_records scr ON p.id = scr.patient_id
            LEFT JOIN users u ON p.id = u.new_id
            WHERE 1=1
        `;
        const params = [];

        // Filter by name (full_name)
        if (name && name.trim()) {
            query += ' AND p.full_name LIKE ?';
            params.push(`%${name.trim()}%`);
        }

        // Filter by patient ID
        if (id && id.trim()) {
            query += ' AND p.id LIKE ?';
            params.push(`%${id.trim()}%`);
        }

        // Filter by MR ID
        if (mr_id && mr_id.trim()) {
            query += ' AND scr.mr_id LIKE ?';
            params.push(`%${mr_id.trim()}%`);
        }

        // Filter by email
        if (email && email.trim()) {
            query += ' AND u.email LIKE ?';
            params.push(`%${email.trim()}%`);
        }

        // Filter by age range
        if (age_min) {
            query += ' AND p.age >= ?';
            params.push(parseInt(age_min));
        }
        if (age_max) {
            query += ' AND p.age <= ?';
            params.push(parseInt(age_max));
        }

        // Filter by phone
        if (phone && phone.trim()) {
            query += ' AND p.phone LIKE ?';
            params.push(`%${phone.trim()}%`);
        }

        // Filter by WhatsApp
        if (whatsapp && whatsapp.trim()) {
            query += ' AND p.whatsapp LIKE ?';
            params.push(`%${whatsapp.trim()}%`);
        }

        // Filter by husband name
        if (husband && husband.trim()) {
            query += ' AND p.husband_name LIKE ?';
            params.push(`%${husband.trim()}%`);
        }

        // Order by name
        query += ' ORDER BY p.full_name ASC';

        // Handle pagination
        let total = 0;
        let pageNum = parseInt(page) || 1;
        let limitNum = parseInt(limit) || 50;
        const offset = (pageNum - 1) * limitNum;

        // Count total results
        const countQuery = query.replace(
            /SELECT DISTINCT[\s\S]*?FROM patients/,
            'SELECT COUNT(DISTINCT p.id) as total FROM patients'
        ).replace(/ORDER BY[\s\S]*$/, '');

        const [countResult] = await db.query(countQuery, params);
        total = countResult[0]?.total || 0;

        // Add pagination
        query += ' LIMIT ? OFFSET ?';
        params.push(limitNum, offset);

        const [rows] = await db.query(query, params);

        // Map and deduplicate results
        const seen = new Set();
        const mappedRows = rows.filter(patient => {
            if (seen.has(patient.id)) return false;
            seen.add(patient.id);
            return true;
        }).map(patient => ({
            ...patient,
            whatsapp: patient.whatsapp || patient.phone || null,
            last_visit: patient.last_visit || patient.actual_last_visit || null
        }));

        res.json({
            success: true,
            data: mappedRows,
            count: mappedRows.length,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (error) {
        console.error('Error in advanced search:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search patients',
            error: error.message
        });
    }
});

// GET PATIENT BY ID (Protected)
router.get('/api/patients/:id', verifyToken, async (req, res) => {
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
router.post('/api/patients', verifyToken, validatePatient, async (req, res) => {
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
router.put('/api/patients/:id', verifyToken, validatePatient, async (req, res) => {
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
router.patch('/api/patients/:id/status', verifyToken, async (req, res) => {
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

