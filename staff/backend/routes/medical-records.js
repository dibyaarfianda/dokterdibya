const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getGMT7Timestamp, toMySQLTimestamp } = require('../utils/idGenerator');

// Create medical_records table if not exists
async function ensureMedicalRecordsTable() {
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS medical_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            patient_id VARCHAR(10) NOT NULL,
            visit_id INT NULL,
            doctor_id INT,
            doctor_name VARCHAR(255),
            record_type ENUM('identitas', 'anamnesa', 'physical_exam', 'usg', 'lab', 'diagnosis', 'planning', 'complete') NOT NULL,
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

        // Update record_type ENUM to include all types
        try {
            await db.query(`
                ALTER TABLE medical_records
                MODIFY COLUMN record_type ENUM('identitas', 'anamnesa', 'physical_exam', 'pemeriksaan_obstetri', 'usg', 'lab', 'diagnosis', 'planning', 'resume_medis', 'complete') NOT NULL
            `);
            logger.info('Updated record_type ENUM to include pemeriksaan_obstetri and resume_medis');
        } catch (enumError) {
            // Ignore if already updated
            if (!enumError.message.includes('Duplicate')) {
                logger.warn('Could not update record_type ENUM:', enumError.message);
            }
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
        
        // Convert ISO timestamp to MySQL datetime format (preserve GMT+7)
        const mysqlTimestamp = toMySQLTimestamp(timestamp);

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
                mysqlTimestamp
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

// Generate AI Resume Medis
router.post('/api/medical-records/generate-resume', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.body;
        
        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID is required'
            });
        }

        // Fetch all medical records for this patient
        const [records] = await db.query(
            `SELECT record_type, record_data, doctor_name, created_at 
             FROM medical_records 
             WHERE patient_id = ? 
             ORDER BY created_at DESC`,
            [patientId]
        );

        if (records.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No medical records found for this patient'
            });
        }

        // Fetch patient intake data
        const [intakeRecords] = await db.query(
            'SELECT payload FROM patient_intake WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1',
            [patientId]
        );

        let identitas = {};
        if (intakeRecords.length > 0) {
            identitas = intakeRecords[0].payload;
        }

        // Organize records by type
        const recordsByType = {};
        records.forEach(record => {
            if (!recordsByType[record.record_type]) {
                recordsByType[record.record_type] = record.record_data;
            }
        });

        // Generate resume using AI-like logic
        const resume = generateMedicalResume(identitas, recordsByType);

        res.json({
            success: true,
            data: { resume }
        });

    } catch (error) {
        logger.error('Error generating resume:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate resume',
            error: error.message
        });
    }
});

/**
 * Generate medical resume from patient data
 */
function generateMedicalResume(identitas, records) {
    let resume = '';

    // Header
    resume += '═══════════════════════════════════════════════════\n';
    resume += '           RESUME MEDIS PASIEN\n';
    resume += '═══════════════════════════════════════════════════\n\n';

    // Identitas Pasien
    if (identitas && Object.keys(identitas).length > 0) {
        resume += '📋 IDENTITAS PASIEN\n';
        resume += '───────────────────────────────────────────────────\n';
        if (identitas.nama) resume += `Nama           : ${identitas.nama}\n`;
        if (identitas.tanggal_lahir) resume += `Tanggal Lahir  : ${identitas.tanggal_lahir}\n`;
        if (identitas.umur) resume += `Umur           : ${identitas.umur}\n`;
        if (identitas.alamat) resume += `Alamat         : ${identitas.alamat}\n`;
        if (identitas.no_telp) resume += `No. Telepon    : ${identitas.no_telp}\n`;
        resume += '\n';
    }

    // Anamnesa
    if (records.anamnesa) {
        resume += '🩺 ANAMNESA\n';
        resume += '───────────────────────────────────────────────────\n';
        const anamnesa = records.anamnesa;
        if (anamnesa.keluhan_utama) resume += `Keluhan Utama: ${anamnesa.keluhan_utama}\n`;
        if (anamnesa.hpht) resume += `HPHT: ${anamnesa.hpht}\n`;
        if (anamnesa.hpl) resume += `HPL: ${anamnesa.hpl}\n`;
        if (anamnesa.usia_kehamilan) resume += `Usia Kehamilan: ${anamnesa.usia_kehamilan}\n`;
        if (anamnesa.gravida || anamnesa.para || anamnesa.abortus) {
            resume += `G${anamnesa.gravida || 0}P${anamnesa.para || 0}A${anamnesa.abortus || 0}\n`;
        }
        if (anamnesa.riwayat_kehamilan_saat_ini) resume += `Riwayat Kehamilan: ${anamnesa.riwayat_kehamilan_saat_ini}\n`;
        if (anamnesa.alergi_obat) resume += `Alergi Obat: ${anamnesa.alergi_obat}\n`;
        resume += '\n';
    }

    // Pemeriksaan Fisik
    if (records.physical_exam) {
        resume += '🔬 PEMERIKSAAN FISIK\n';
        resume += '───────────────────────────────────────────────────\n';
        const pe = records.physical_exam;
        resume += `Tanda Vital:\n`;
        if (pe.tekanan_darah) resume += `  - TD: ${pe.tekanan_darah} mmHg\n`;
        if (pe.nadi) resume += `  - Nadi: ${pe.nadi} x/menit\n`;
        if (pe.suhu) resume += `  - Suhu: ${pe.suhu}°C\n`;
        if (pe.respirasi) resume += `  - RR: ${pe.respirasi} x/menit\n`;
        if (pe.tinggi_badan && pe.berat_badan) {
            resume += `  - TB/BB: ${pe.tinggi_badan} cm / ${pe.berat_badan} kg\n`;
            if (pe.imt) resume += `  - IMT: ${pe.imt} (${pe.kategori_imt})\n`;
        }
        if (pe.kepala_leher) resume += `Kepala & Leher: ${pe.kepala_leher}\n`;
        if (pe.thorax) resume += `Thorax: ${pe.thorax}\n`;
        if (pe.abdomen) resume += `Abdomen: ${pe.abdomen}\n`;
        if (pe.ekstremitas) resume += `Ekstremitas: ${pe.ekstremitas}\n`;
        resume += '\n';
    }

    // Pemeriksaan Obstetri
    if (records.pemeriksaan_obstetri) {
        resume += '🤰 PEMERIKSAAN OBSTETRI\n';
        resume += '───────────────────────────────────────────────────\n';
        const obs = records.pemeriksaan_obstetri;
        if (obs.findings) resume += `${obs.findings}\n`;
        resume += '\n';
    }

    // USG
    if (records.usg) {
        resume += '📡 USG\n';
        resume += '───────────────────────────────────────────────────\n';
        const usg = records.usg;
        if (usg.trimester) resume += `Trimester: ${usg.trimester}\n`;
        if (usg.date) resume += `Tanggal: ${usg.date}\n`;
        if (usg.crl_cm) resume += `CRL: ${usg.crl_cm} cm\n`;
        if (usg.heart_rate) resume += `DJJ: ${usg.heart_rate} bpm\n`;
        if (usg.bpd) resume += `BPD: ${usg.bpd} cm\n`;
        if (usg.ac) resume += `AC: ${usg.ac} cm\n`;
        if (usg.fl) resume += `FL: ${usg.fl} cm\n`;
        if (usg.efw) resume += `EFW: ${usg.efw} gram\n`;
        if (usg.edd) resume += `EDD: ${usg.edd}\n`;
        if (usg.notes) resume += `Catatan: ${usg.notes}\n`;
        resume += '\n';
    }

    // Penunjang
    if (records.penunjang) {
        resume += '🧪 PEMERIKSAAN PENUNJANG\n';
        resume += '───────────────────────────────────────────────────\n';
        const penunjang = records.penunjang;
        if (penunjang.lab_findings) resume += `Laboratorium:\n${penunjang.lab_findings}\n`;
        if (penunjang.imaging_findings) resume += `Imaging:\n${penunjang.imaging_findings}\n`;
        if (penunjang.other_findings) resume += `Lainnya:\n${penunjang.other_findings}\n`;
        resume += '\n';
    }

    // Diagnosis
    if (records.diagnosis) {
        resume += '⚕️ DIAGNOSIS\n';
        resume += '───────────────────────────────────────────────────\n';
        const diagnosis = records.diagnosis;
        if (diagnosis.diagnosis_utama) resume += `Diagnosis Utama: ${diagnosis.diagnosis_utama}\n`;
        if (diagnosis.diagnosis_sekunder) resume += `Diagnosis Sekunder: ${diagnosis.diagnosis_sekunder}\n`;
        resume += '\n';
    }

    // Planning
    if (records.planning) {
        resume += '📝 RENCANA TATALAKSANA\n';
        resume += '───────────────────────────────────────────────────\n';
        const planning = records.planning;
        if (planning.tindakan) resume += `Tindakan: ${planning.tindakan}\n`;
        if (planning.terapi) resume += `Terapi: ${planning.terapi}\n`;
        if (planning.rencana) resume += `Rencana: ${planning.rencana}\n`;
        resume += '\n';
    }

    // Footer
    resume += '═══════════════════════════════════════════════════\n';
    resume += `Generated: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n`;

    return resume;
}

module.exports = router;
