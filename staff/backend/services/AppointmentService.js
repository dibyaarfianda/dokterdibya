/**
 * Appointment Service
 * Business logic layer for appointment operations
 */

const db = require('../utils/database');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class AppointmentService {
    /**
     * Get all appointments with filters
     */
    async getAllAppointments(filters = {}) {
        const { patient_id, start_date, end_date, status } = filters;
        
        let query = 'SELECT * FROM appointments WHERE 1=1';
        const params = [];
        
        if (patient_id) {
            query += ' AND patient_id = ?';
            params.push(patient_id);
        }
        
        if (start_date) {
            query += ' AND appointment_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND appointment_date <= ?';
            params.push(end_date);
        }
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY appointment_date ASC';
        
        const appointments = await db.query(query, params);
        logger.info(`Fetched ${appointments.length} appointments`, filters);
        
        return appointments;
    }
    
    /**
     * Get appointment by ID
     */
    async getAppointmentById(id) {
        const appointment = await db.findById('appointments', id);
        
        if (!appointment) {
            throw new AppError('Appointment not found', 404);
        }
        
        return appointment;
    }
    
    /**
     * Get appointments for today
     */
    async getTodayAppointments() {
        const cacheKey = 'appointments:today';
        
        return cache.getOrSet(cacheKey, async () => {
            const today = new Date().toISOString().split('T')[0];
            
            const appointments = await db.query(
                'SELECT * FROM appointments WHERE DATE(appointment_date) = ? ORDER BY appointment_date ASC',
                [today]
            );
            
            logger.info(`Fetched ${appointments.length} appointments for today`);
            return appointments;
        }, 'short');
    }
    
    /**
     * Create new appointment
     */
    async createAppointment(appointmentData) {
        const {
            patient_id,
            patient_name,
            appointment_date,
            time_slot,
            phone,
            notes,
            status
        } = appointmentData;
        
        // Validate required fields
        if (!patient_id || !patient_name || !appointment_date) {
            throw new AppError('Missing required fields: patient_id, patient_name, appointment_date', 400);
        }
        
        // Check for conflicting appointments
        const conflicts = await db.query(
            'SELECT id FROM appointments WHERE appointment_date = ? AND time_slot = ? AND status != "cancelled"',
            [appointment_date, time_slot]
        );
        
        if (conflicts.length > 0) {
            throw new AppError('Time slot already booked', 400);
        }
        
        const insertData = {
            patient_id,
            patient_name,
            appointment_date,
            time_slot: time_slot || 'morning',
            phone: phone || '',
            notes: notes || '',
            status: status || 'scheduled',
            created_at: new Date()
        };
        
        const result = await db.insert('appointments', insertData);
        
        // Invalidate cache
        cache.delPattern('appointments:');
        
        logger.info('Appointment created', { appointmentId: result.insertId, patientId: patient_id });
        
        return { id: result.insertId };
    }
    
    /**
     * Update appointment
     */
    async updateAppointment(id, appointmentData) {
        const affectedRows = await db.updateById('appointments', id, appointmentData);
        
        if (affectedRows === 0) {
            throw new AppError('Appointment not found', 404);
        }
        
        // Invalidate cache
        cache.delPattern('appointments:');
        
        logger.info('Appointment updated', { appointmentId: id });
    }
    
    /**
     * Cancel appointment
     */
    async cancelAppointment(id) {
        const appointment = await this.getAppointmentById(id);
        
        if (appointment.status === 'cancelled') {
            throw new AppError('Appointment already cancelled', 400);
        }
        
        await db.updateById('appointments', id, {
            status: 'cancelled',
            cancelled_at: new Date()
        });
        
        // Invalidate cache
        cache.delPattern('appointments:');
        
        logger.info('Appointment cancelled', { appointmentId: id });
    }
    
    /**
     * Complete appointment
     */
    async completeAppointment(id) {
        const appointment = await this.getAppointmentById(id);
        
        if (appointment.status === 'completed') {
            throw new AppError('Appointment already completed', 400);
        }
        
        await db.updateById('appointments', id, {
            status: 'completed',
            completed_at: new Date()
        });
        
        // Invalidate cache
        cache.delPattern('appointments:');
        
        logger.info('Appointment completed', { appointmentId: id });
    }
    
    /**
     * Delete appointment
     */
    async deleteAppointment(id) {
        const affectedRows = await db.deleteById('appointments', id);
        
        if (affectedRows === 0) {
            throw new AppError('Appointment not found', 404);
        }
        
        // Invalidate cache
        cache.delPattern('appointments:');
        
        logger.info('Appointment deleted', { appointmentId: id });
    }
    
    /**
     * Get appointment statistics
     */
    async getStatistics(filters = {}) {
        const { start_date, end_date } = filters;
        
        let query = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM appointments 
            WHERE 1=1
        `;
        const params = [];
        
        if (start_date) {
            query += ' AND appointment_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND appointment_date <= ?';
            params.push(end_date);
        }
        
        const [stats] = await db.query(query, params);
        
        return stats || { total: 0, scheduled: 0, completed: 0, cancelled: 0 };
    }
}

module.exports = new AppointmentService();
