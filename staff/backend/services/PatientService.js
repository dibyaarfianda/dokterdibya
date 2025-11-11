/**
 * Patient Service
 * Business logic layer for patient operations
 */

const db = require('../utils/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class PatientService {
    /**
     * Get all patients with optional search and limit
     */
    async getAllPatients(search = null, limit = null) {
        const cacheKey = `patients:list:${search || 'all'}:${limit || 'all'}`;
        
        return cache.getOrSet(cacheKey, async () => {
            let query = 'SELECT * FROM patients WHERE 1=1';
            const params = [];
            
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
            
            const rows = await db.query(query, params);
            logger.info(`Fetched ${rows.length} patients`, { search, limit });
            
            return rows;
        }, 'short');
    }
    
    /**
     * Get patient by ID
     */
    async getPatientById(id) {
        const cacheKey = cache.keys.patient(id);
        
        return cache.getOrSet(cacheKey, async () => {
            const patient = await db.findById('patients', id);
            
            if (!patient) {
                throw new AppError('Patient not found', 404);
            }
            
            return patient;
        }, 'short');
    }
    
    /**
     * Create new patient
     */
    async createPatient(patientData) {
        const { id, full_name, whatsapp, birth_date } = patientData;
        
        // Validate required fields
        if (!id || !full_name) {
            throw new AppError('Missing required fields: id, full_name', 400);
        }
        
        // Check if patient already exists
        const exists = await db.exists('patients', 'id', id);
        if (exists) {
            throw new AppError('Patient ID already exists', 400);
        }
        
        // Calculate age from birth_date
        let age = null;
        if (birth_date) {
            age = this._calculateAge(birth_date);
        }
        
        // Insert patient
        const insertData = {
            id,
            full_name,
            whatsapp: whatsapp || null,
            birth_date: birth_date || null,
            age
        };
        
        const result = await db.insert('patients', insertData);
        
        // Invalidate cache
        cache.delPattern('patients:');
        
        logger.info('Patient created', { patientId: id, fullName: full_name });
        
        return { id, age };
    }
    
    /**
     * Update patient
     */
    async updatePatient(id, patientData) {
        const { full_name, whatsapp, birth_date, allergy, medical_history } = patientData;
        
        // Calculate age from birth_date
        let age = null;
        if (birth_date) {
            age = this._calculateAge(birth_date);
        }
        
        // Update patient
        const updateData = {
            full_name,
            whatsapp,
            birth_date,
            age,
            allergy: allergy || null,
            medical_history: medical_history || null
        };
        
        const affectedRows = await db.updateById('patients', id, updateData);
        
        if (affectedRows === 0) {
            throw new AppError('Patient not found', 404);
        }
        
        // Invalidate cache
        cache.delPattern('patients:');
        
        logger.info('Patient updated', { patientId: id });
        
        return { age };
    }
    
    /**
     * Delete patient
     */
    async deletePatient(id) {
        const affectedRows = await db.deleteById('patients', id);
        
        if (affectedRows === 0) {
            throw new AppError('Patient not found', 404);
        }
        
        // Invalidate cache
        cache.delPattern('patients:');
        
        logger.info('Patient deleted', { patientId: id });
    }
    
    /**
     * Update last visit date
     */
    async updateLastVisit(id) {
        const updateData = {
            last_visit: new Date()
        };
        
        await db.updateById('patients', id, updateData);
        
        // Invalidate cache
        cache.delPattern('patients:');
        
        logger.debug('Patient last visit updated', { patientId: id });
    }
    
    /**
     * Calculate age from birth date
     */
    _calculateAge(birthDate) {
        const birth = new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        return age;
    }
}

module.exports = new PatientService();
