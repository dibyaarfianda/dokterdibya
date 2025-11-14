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
        const { search, limit, _ } = req.query;
        const clientCacheControl = (req.headers['cache-control'] || '').toLowerCase();
        const clientRequestsFresh = clientCacheControl.includes('no-cache') || clientCacheControl.includes('no-store');
        const bypassCache = typeof _ !== 'undefined' || clientRequestsFresh;
        
        // Generate cache key and honor bypass flag (frontend sends _=timestamp)
        const cacheKey = `patients:list:${search || 'all'}:${limit || 'all'}`;
        
        if (!bypassCache) {
            const cached = cache.get(cacheKey, 'short');
            if (cached) {
                applyCacheHeaders(res, { bypassCache, cacheKey, hit: true });
                return res.json(cached);
            }
        }
        
        let query = 'SELECT * FROM patients';
        const params = [];
        
        if (search) {
            query += ' WHERE (full_name LIKE ? OR id LIKE ? OR whatsapp LIKE ?)';
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

