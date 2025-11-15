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
            visit_id INT NULL,
            doctor_id INT,
            doctor_name VARCHAR(255),
            record_type ENUM('anamnesa', 'physical_exam', 'usg', 'lab', 'complete') NOT NULL,
            record_data JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_patient_id (patient_id),
            INDEX idx_visit_id (visit_id),
            INDEX idx_record_type (record_type),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    
    try {
        await db.query(createTableSQL);
        logger.info('Medical records table ensured');
        
        // Check if visit_id column exists, if not add it
        const [columns] = await db.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'medical_records' 
            AND COLUMN_NAME = 'visit_id'
        `);
        
        if (columns.length === 0) {
            await db.query(`
                ALTER TABLE medical_records 
                ADD COLUMN visit_id INT NULL AFTER patient_id,
                ADD INDEX idx_visit_id (visit_id)
            `);
            logger.info('Added visit_id column to medical_records table');
        }
        
        // Try to add foreign key constraint if visits table exists
        try {
            const [fkCheck] = await db.query(`
                SELECT CONSTRAINT_NAME 
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'medical_records' 
                AND CONSTRAINT_NAME = 'medical_records_ibfk_1'
            `);
            
            if (fkCheck.length === 0) {
                // Check if visits table exists first
                const [visitsTable] = await db.query(`
                    SELECT TABLE_NAME 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA = DATABASE() 
                    AND TABLE_NAME = 'visits'
                `);
                
                if (visitsTable.length > 0) {
                    await db.query(`
                        ALTER TABLE medical_records 
                        ADD CONSTRAINT medical_records_ibfk_1 
                        FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE SET NULL
                    `);
                    logger.info('Added foreign key constraint to medical_records.visit_id');
                }
            }
        } catch (fkError) {
            logger.warn('Could not add foreign key constraint (visits table may not exist yet):', fkError.message);
        }
    } catch (error) {
        logger.error('Error creating medical_records table:', error);
    }
}

// Initialize table
ensureMedicalRecordsTable();

// Save medical record
router.post('/api/medical-records', verifyToken, async (req, res) => {
    try {
        const { patientId, visitId, type, data, anamnesa, physical_exam, usg, lab, diagnosis, doctorId, doctorName, timestamp } = req.body;
        
        logger.info('Received medical record save request:', { patientId, visitId, type, doctorId, doctorName });
        
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
        
        // Get doctor info from token or request body
        const finalDoctorId = doctorId || (req.user ? req.user.id : null);
        const finalDoctorName = doctorName || (req.user ? (req.user.name || req.user.email) : 'Unknown');
        
        // Insert into database
        const [result] = await db.query(
            `INSERT INTO medical_records (patient_id, visit_id, doctor_id, doctor_name, record_type, record_data, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                patientId,
                visitId || null,
                finalDoctorId,
                finalDoctorName,
                recordType,
                JSON.stringify(recordData),
                timestamp || new Date().toISOString()
            ]
        );
        
        logger.info(`Medical record saved: ID ${result.insertId}, Patient ${patientId}, Visit ${visitId || 'none'}, Type: ${recordType}, Doctor: ${finalDoctorName}`);
        
        res.json({ 
            success: true, 
            message: 'Medical record saved successfully',
            data: {
                id: result.insertId,
                patientId,
                visitId,
                recordType
            }
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
