/**
 * Visit Service
 * Business logic layer for visit operations
 */

const db = require('../utils/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class VisitService {
    /**
     * Get all visits with filters
     */
    async getAllVisits(filters = {}) {
        const { patient_id, start_date, end_date, exclude_dummy } = filters;
        
        let query = 'SELECT * FROM visits WHERE 1=1';
        const params = [];
        
        if (patient_id) {
            query += ' AND patient_id = ?';
            params.push(patient_id);
        }
        
        if (start_date) {
            query += ' AND visit_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND visit_date <= ?';
            params.push(end_date);
        }
        
        if (exclude_dummy) {
            query += ' AND patient_id NOT LIKE "DUMMY%"';
        }
        
        query += ' ORDER BY visit_date DESC';
        
        const visits = await db.query(query, params);
        logger.info(`Fetched ${visits.length} visits`, { patient_id, start_date, end_date });
        
        return visits;
    }
    
    /**
     * Get visit by ID
     */
    async getVisitById(id) {
        const visit = await db.findById('visits', id);
        
        if (!visit) {
            throw new AppError('Visit not found', 404);
        }
        
        return visit;
    }
    
    /**
     * Get visits for a patient
     */
    async getVisitsByPatientId(patientId) {
        const cacheKey = `visits:patient:${patientId}`;
        
        return cache.getOrSet(cacheKey, async () => {
            const visits = await db.query(
                'SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC',
                [patientId]
            );
            
            logger.info(`Fetched ${visits.length} visits for patient ${patientId}`);
            return visits;
        }, 'short');
    }
    
    /**
     * Create new visit
     */
    async createVisit(visitData) {
        const {
            patient_id,
            visit_date,
            doctor_name,
            complaint,
            diagnosis,
            notes,
            status
        } = visitData;
        
        // Validate required fields
        if (!patient_id || !visit_date) {
            throw new AppError('Missing required fields: patient_id, visit_date', 400);
        }
        
        const insertData = {
            patient_id,
            visit_date: visit_date || new Date(),
            doctor_name: doctor_name || 'Dr. Dibya',
            complaint: complaint || '',
            diagnosis: diagnosis || '',
            notes: notes || '',
            status: status || 'ongoing',
            created_at: new Date()
        };
        
        const result = await db.insert('visits', insertData);
        
        // Invalidate cache
        cache.delPattern('visits:');
        
        logger.info('Visit created', { visitId: result.insertId, patientId: patient_id });
        
        return { id: result.insertId };
    }
    
    /**
     * Update visit
     */
    async updateVisit(id, visitData) {
        const affectedRows = await db.updateById('visits', id, visitData);
        
        if (affectedRows === 0) {
            throw new AppError('Visit not found', 404);
        }
        
        // Invalidate cache
        cache.delPattern('visits:');
        
        logger.info('Visit updated', { visitId: id });
    }
    
    /**
     * Delete visit
     */
    async deleteVisit(id) {
        const affectedRows = await db.deleteById('visits', id);
        
        if (affectedRows === 0) {
            throw new AppError('Visit not found', 404);
        }
        
        // Invalidate cache
        cache.delPattern('visits:');
        
        logger.info('Visit deleted', { visitId: id });
    }
    
    /**
     * Finalize visit
     */
    async finalizeVisit(id) {
        const visit = await this.getVisitById(id);
        
        if (visit.status === 'finalized') {
            throw new AppError('Visit already finalized', 400);
        }
        
        await db.updateById('visits', id, {
            status: 'finalized',
            finalized_at: new Date()
        });
        
        // Invalidate cache
        cache.delPattern('visits:');
        
        logger.info('Visit finalized', { visitId: id });
    }
    
    /**
     * Get visit statistics
     */
    async getStatistics(filters = {}) {
        const { start_date, end_date } = filters;
        
        let query = 'SELECT COUNT(*) as total_visits, COUNT(DISTINCT patient_id) as unique_patients FROM visits WHERE 1=1';
        const params = [];
        
        if (start_date) {
            query += ' AND visit_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND visit_date <= ?';
            params.push(end_date);
        }
        
        const [stats] = await db.query(query, params);
        
        return stats || { total_visits: 0, unique_patients: 0 };
    }
}

module.exports = new VisitService();
