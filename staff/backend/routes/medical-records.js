const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// Create medical_records table if not exists
async function ensureMedicalRecordsTable() {
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS medical_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            patient_id VARCHAR(10) NOT NULL,
            doctor_id INT,
            doctor_name VARCHAR(255),
            record_type ENUM('anamnesa', 'physical_exam', 'usg', 'lab', 'complete') NOT NULL,
            record_data JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_patient_id (patient_id),
            INDEX idx_record_type (record_type),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    
    try {
        await db.query(createTableSQL);
        logger.info('Medical records table ensured');
    } catch (error) {
        logger.error('Error creating medical_records table:', error);
    }
}

// Initialize table
ensureMedicalRecordsTable();

// Save medical record
router.post('/api/medical-records', verifyToken, async (req, res) => {
    try {
        const { patientId, type, data, anamnesa, physical_exam, usg, lab, diagnosis, doctorId, doctorName, timestamp } = req.body;
        
        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }
        
        let recordType = type || 'complete';
        let recordData = {};
        
        // Organize data based on type
        if (type === 'complete') {
            recordData = {
                anamnesa: anamnesa || {},
                physical_exam: physical_exam || {},
                usg: usg || {},
                lab: lab || {},
                diagnosis: diagnosis || {}
            };
        } else {
            recordData = data || {};
        }
        
        // Insert into database
        await db.query(
            `INSERT INTO medical_records (patient_id, doctor_id, doctor_name, record_type, record_data, created_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                patientId,
                doctorId || req.user.id,
                doctorName || req.user.name || req.user.email,
                recordType,
                JSON.stringify(recordData),
                timestamp || new Date().toISOString()
            ]
        );
        
        logger.info(`Medical record saved: Patient ${patientId}, Type: ${recordType}, Doctor: ${doctorName || req.user.email}`);
        
        res.json({ 
            success: true, 
            message: 'Medical record saved successfully' 
        });
        
    } catch (error) {
        logger.error('Error saving medical record:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to save medical record',
            error: error.message 
        });
    }
});

// Get medical records for a patient
router.get('/api/medical-records/:patientId', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;
        
        const [records] = await db.query(
            `SELECT * FROM medical_records 
             WHERE patient_id = ? 
             ORDER BY created_at DESC`,
            [patientId]
        );
        
        // Parse JSON data
        const parsedRecords = records.map(record => ({
            ...record,
            record_data: typeof record.record_data === 'string' ? JSON.parse(record.record_data) : record.record_data
        }));
        
        res.json({ 
            success: true, 
            data: parsedRecords 
        });
        
    } catch (error) {
        logger.error('Error fetching medical records:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch medical records',
            error: error.message 
        });
    }
});

// Get latest complete medical record for a patient
router.get('/api/medical-records/:patientId/latest', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;
        
        const [records] = await db.query(
            `SELECT * FROM medical_records 
             WHERE patient_id = ? AND record_type = 'complete'
             ORDER BY created_at DESC 
             LIMIT 1`,
            [patientId]
        );
        
        if (records.length === 0) {
            return res.json({ 
                success: true, 
                data: null 
            });
        }
        
        const record = {
            ...records[0],
            record_data: typeof records[0].record_data === 'string' ? JSON.parse(records[0].record_data) : records[0].record_data
        };
        
        res.json({ 
            success: true, 
            data: record 
        });
        
    } catch (error) {
        logger.error('Error fetching latest medical record:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch latest medical record',
            error: error.message 
        });
    }
});

// Update medical record
router.put('/api/medical-records/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { data, type } = req.body;
        
        await db.query(
            `UPDATE medical_records 
             SET record_data = ?, record_type = ?, updated_at = NOW()
             WHERE id = ?`,
            [JSON.stringify(data), type, id]
        );
        
        logger.info(`Medical record updated: ID ${id}`);
        
        res.json({ 
            success: true, 
            message: 'Medical record updated successfully' 
        });
        
    } catch (error) {
        logger.error('Error updating medical record:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update medical record',
            error: error.message 
        });
    }
});

// Delete medical record
router.delete('/api/medical-records/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        await db.query('DELETE FROM medical_records WHERE id = ?', [id]);
        
        logger.info(`Medical record deleted: ID ${id}`);
        
        res.json({ 
            success: true, 
            message: 'Medical record deleted successfully' 
        });
        
    } catch (error) {
        logger.error('Error deleting medical record:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete medical record',
            error: error.message 
        });
    }
});

module.exports = router;
