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
        
        // Check if mr_id column exists for Sunday Clinic integration
        const [mrIdColumns] = await db.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'medical_records'
            AND COLUMN_NAME = 'mr_id'
        `);

        if (mrIdColumns.length === 0) {
            await db.query(`
                ALTER TABLE medical_records
                ADD COLUMN mr_id VARCHAR(20) NULL AFTER visit_id,
                ADD INDEX idx_mr_id (mr_id)
            `);
            logger.info('Added mr_id column to medical_records table for Sunday Clinic integration');
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
        
        // Determine if visitId is numeric (legacy visit_id) or string MR ID (Sunday Clinic)
        let numericVisitId = null;
        let mrId = null;
        
        if (visitId) {
            if (typeof visitId === 'string' && visitId.match(/^[A-Za-z]+\d+$/i)) {
                // String MR ID format (e.g., "DRD0001" or "drd0001")
                mrId = visitId.toUpperCase(); // Normalize to uppercase
            } else if (!isNaN(visitId)) {
                // Numeric visit_id
                numericVisitId = visitId;
            } else {
                // If not matching either pattern, treat as string MR ID
                mrId = visitId.toUpperCase();
            }
        }

        // Insert into database
        const [result] = await db.query(
            `INSERT INTO medical_records (patient_id, visit_id, mr_id, doctor_id, doctor_name, record_type, record_data, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                patientId,
                numericVisitId,
                mrId,
                finalDoctorId,
                finalDoctorName,
                recordType,
                JSON.stringify(recordData),
                mysqlTimestamp
            ]
        );
        
        logger.info(`Medical record saved: ID ${result.insertId}, Patient ${patientId}, Visit ${numericVisitId || mrId || 'none'}, Type: ${recordType}, Doctor: ${finalDoctorName}`);
        
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
// Delete all medical records by type
router.delete('/api/medical-records/by-type/:recordType', verifyToken, async (req, res) => {
    try {
        const { recordType } = req.params;
        const { patientId, mrId } = req.query;
        
        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID is required'
            });
        }
        
        // Build query - if mrId provided, use it; otherwise delete all for patient+type
        let query = 'DELETE FROM medical_records WHERE patient_id = ? AND record_type = ?';
        let params = [patientId, recordType];
        
        if (mrId && mrId !== 'null' && mrId !== 'undefined') {
            query += ' AND (mr_id = ? OR mr_id IS NULL)';
            params.push(mrId);
        }
        
        console.log('DELETE Query:', query);
        console.log('DELETE Params:', params);
        
        const [result] = await db.query(query, params);
        
        console.log('DELETE Result:', result.affectedRows, 'rows deleted');
        logger.info(`Medical records deleted: Type ${recordType}, Patient ${patientId}, MR ${mrId || 'none'}, Count: ${result.affectedRows}`);
        
        res.json({ 
            success: true, 
            message: `${result.affectedRows} record(s) deleted successfully`,
            deletedCount: result.affectedRows
        });
        
    } catch (error) {
        logger.error('Error deleting medical records by type:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete medical records',
            error: error.message 
        });
    }
});

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
        const { patientId, visitId } = req.body;
        
        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID is required'
            });
        }

        // Fetch medical records for this patient (optionally filtered by visit)
        let query = `SELECT record_type, record_data, doctor_name, created_at 
                     FROM medical_records 
                     WHERE patient_id = ?`;
        let params = [patientId];
        
        // If visitId provided, filter ONLY by mr_id (no legacy null records)
        // This ensures new visits don't include old obstetri data
        if (visitId) {
            if (typeof visitId === 'string' && visitId.match(/^[A-Za-z]+\d+$/i)) {
                // Sunday Clinic MR ID format - ONLY matching mr_id, no NULL
                query += ` AND mr_id = ?`;
                params.push(visitId.toUpperCase());
            } else if (!isNaN(visitId)) {
                // Legacy numeric visit_id
                query += ` AND visit_id = ?`;
                params.push(visitId);
            } else {
                // Default to mr_id for any other string format
                query += ` AND mr_id = ?`;
                params.push(visitId.toUpperCase());
            }
        }
        
        query += ` ORDER BY created_at DESC`;
        
        const [records] = await db.query(query, params);

        if (records.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No medical records found for this patient'
            });
        }

        // Fetch patient data from patients table
        let identitas = {};
        try {
            const [patients] = await db.query(
                'SELECT * FROM patients WHERE id = ? OR mr_id = ?',
                [patientId, patientId]
            );
            
            if (patients.length > 0) {
                const patient = patients[0];
                identitas = {
                    nama: patient.nama || patient.name,
                    tanggal_lahir: patient.tanggal_lahir || patient.birth_date,
                    umur: patient.umur || patient.age,
                    alamat: patient.alamat || patient.address,
                    no_telp: patient.no_telp || patient.phone
                };
            }
        } catch (error) {
            logger.warn('Could not fetch patient data:', error.message);
        }

        // Organize records by type (take the most recent one for each type)
        const recordsByType = {};
        records.forEach(record => {
            if (!recordsByType[record.record_type]) {
                // Parse JSON if it's a string
                let data = record.record_data;
                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        logger.warn('Failed to parse record_data:', e.message);
                    }
                }
                recordsByType[record.record_type] = data;
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
 * Generate professional medical resume from patient data
 * This creates a comprehensive medical summary similar to hospital discharge summaries
 */
function generateMedicalResume(identitas, records) {
    let resume = '';
    const today = new Date().toLocaleDateString('id-ID', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric',
        timeZone: 'Asia/Jakarta'
    });

    // Header - Professional Format
    resume += '═══════════════════════════════════════════════════════════════\n';
    resume += '           RESUME MEDIS DR. DIBYA ARFIANDA, SPOG, M.KED.KLIN.\n';
    resume += '═══════════════════════════════════════════════════════════════\n';
    resume += `Tanggal: ${today}\n`;
    resume += '═══════════════════════════════════════════════════════════════\n\n';

    // I. IDENTITAS PASIEN
    if (identitas && Object.keys(identitas).length > 0) {
        resume += 'I. IDENTITAS PASIEN\n';
        resume += '──────────────────────────────────────────────────\n';
        if (identitas.nama) resume += `Nama               : ${identitas.nama}\n`;
        if (identitas.tanggal_lahir) resume += `Tanggal Lahir      : ${identitas.tanggal_lahir}\n`;
        if (identitas.umur) resume += `Usia               : ${identitas.umur} tahun\n`;
        if (identitas.alamat) resume += `Alamat             : ${identitas.alamat}\n`;
        if (identitas.no_telp) resume += `Nomor Telepon      : ${identitas.no_telp}\n`;
        resume += '\n';
    }

    // II. ANAMNESA
    if (records.anamnesa && typeof records.anamnesa === 'object') {
        const anamnesa = records.anamnesa;
        const hasData = Object.values(anamnesa).some(val => val && val !== '');
        
        if (hasData) {
            resume += 'II. ANAMNESA\n';
            resume += '──────────────────────────────────────────────────\n';
            
            // Keluhan Utama
            if (anamnesa.keluhan_utama) {
                resume += `Pasien datang dengan keluhan ${anamnesa.keluhan_utama}.\n\n`;
            }
            
            // Riwayat Obstetri
            if (anamnesa.para || anamnesa.abortus) {
                resume += `Status Obstetri: Para ${anamnesa.para || 0}, Abortus ${anamnesa.abortus || 0} (P${anamnesa.para || 0}A${anamnesa.abortus || 0})`;
                if (anamnesa.anak_hidup) resume += `, dengan ${anamnesa.anak_hidup} anak hidup`;
                resume += '.\n\n';
            }
            
            // Riwayat Menstruasi dan Kehamilan
            if (anamnesa.hpht || anamnesa.hpl || anamnesa.usia_kehamilan) {
                resume += 'Riwayat Menstruasi dan Kehamilan:\n';
                if (anamnesa.hpht) resume += `- Hari Pertama Haid Terakhir (HPHT): ${anamnesa.hpht}\n`;
                if (anamnesa.hpl) resume += `- Hari Perkiraan Lahir (HPL): ${anamnesa.hpl}\n`;
                if (anamnesa.usia_kehamilan) resume += `- Usia Kehamilan Saat Ini: ${anamnesa.usia_kehamilan}\n`;
                if (anamnesa.usia_menarche) resume += `- Usia Menarche: ${anamnesa.usia_menarche} tahun\n`;
                if (anamnesa.lama_siklus) resume += `- Lama Siklus Menstruasi: ${anamnesa.lama_siklus} hari\n`;
                if (anamnesa.siklus_teratur) resume += `- Keteraturan Siklus: ${anamnesa.siklus_teratur === 'ya' ? 'Teratur' : 'Tidak Teratur'}\n`;
                resume += '\n';
            }
            
            // Riwayat Kehamilan Saat Ini
            if (anamnesa.riwayat_kehamilan_saat_ini) {
                resume += `Riwayat Kehamilan Saat Ini:\n${anamnesa.riwayat_kehamilan_saat_ini}\n\n`;
            }
            
            // Riwayat Penyakit
            if (anamnesa.detail_riwayat_penyakit) {
                resume += `Riwayat Penyakit Terdahulu:\n${anamnesa.detail_riwayat_penyakit}\n\n`;
            }
            
            if (anamnesa.riwayat_keluarga) {
                resume += `Riwayat Penyakit Keluarga:\n${anamnesa.riwayat_keluarga}\n\n`;
            }
            
            // Alergi
            const alergiList = [];
            if (anamnesa.alergi_obat && anamnesa.alergi_obat !== 'Tidak ada') alergiList.push(`Obat: ${anamnesa.alergi_obat}`);
            if (anamnesa.alergi_makanan && anamnesa.alergi_makanan !== 'Tidak ada') alergiList.push(`Makanan: ${anamnesa.alergi_makanan}`);
            if (anamnesa.alergi_lingkungan) alergiList.push(`Lingkungan: ${anamnesa.alergi_lingkungan}`);
            
            if (alergiList.length > 0) {
                resume += `Riwayat Alergi: ${alergiList.join(', ')}\n\n`;
            } else {
                resume += 'Riwayat Alergi: Tidak ada alergi yang dilaporkan.\n\n';
            }
        }
    }

    // III. PEMERIKSAAN FISIK
    if (records.physical_exam && typeof records.physical_exam === 'object') {
        const pe = records.physical_exam;
        const hasData = Object.values(pe).some(val => val && val !== '');
        
        if (hasData) {
            resume += 'III. PEMERIKSAAN FISIK\n';
            resume += '──────────────────────────────────────────────────\n';
            
            // Tanda Vital
            resume += 'Tanda-tanda Vital:\n';
            if (pe.tekanan_darah) resume += `- Tekanan Darah    : ${pe.tekanan_darah} mmHg\n`;
            if (pe.nadi) resume += `- Nadi             : ${pe.nadi} kali/menit\n`;
            if (pe.suhu) resume += `- Suhu             : ${pe.suhu}°C\n`;
            if (pe.respirasi) resume += `- Respirasi        : ${pe.respirasi} kali/menit\n`;
            resume += '\n';
            
            // Antropometri
            if (pe.tinggi_badan || pe.berat_badan) {
                resume += 'Antropometri:\n';
                if (pe.tinggi_badan) resume += `- Tinggi Badan     : ${pe.tinggi_badan} cm\n`;
                if (pe.berat_badan) resume += `- Berat Badan      : ${pe.berat_badan} kg\n`;
                if (pe.imt) resume += `- Indeks Massa Tubuh: ${pe.imt} kg/m² (${pe.kategori_imt || 'Normal'})\n`;
                resume += '\n';
            }
            
            // Pemeriksaan Sistemik
            resume += 'Pemeriksaan Sistemik:\n';
            if (pe.kepala_leher) {
                resume += `- Kepala & Leher   : ${pe.kepala_leher}\n`;
            }
            if (pe.thorax) {
                resume += `- Thorax           : ${pe.thorax}\n`;
            }
            if (pe.abdomen) {
                resume += `- Abdomen          : ${pe.abdomen}\n`;
            }
            if (pe.ekstremitas) {
                resume += `- Ekstremitas      : ${pe.ekstremitas}\n`;
            }
            resume += '\n';
        }
    }

    // IV. PEMERIKSAAN OBSTETRI
    if (records.pemeriksaan_obstetri && typeof records.pemeriksaan_obstetri === 'object') {
        const obs = records.pemeriksaan_obstetri;
        if (obs.findings) {
            resume += 'IV. PEMERIKSAAN OBSTETRI\n';
            resume += '──────────────────────────────────────────────────\n';
            resume += `${obs.findings}\n\n`;
        }
    }

    // V. PEMERIKSAAN ULTRASONOGRAFI (USG)
    if (records.usg && typeof records.usg === 'object') {
        const usg = records.usg;
        const hasData = Object.values(usg).some(val => val && val !== '' && val !== 'first');

        if (hasData) {
            resume += 'V. PEMERIKSAAN ULTRASONOGRAFI (USG)\n';
            resume += '──────────────────────────────────────────────────\n';

            // Check if this is gynecology USG (has uterus or ovarium data but no trimester)
            const isGynecologyUSG = (usg.uterus_posisi || usg.uterus_length || usg.kesan ||
                                     usg.ovarium_kanan_visible || usg.ovarium_kiri_visible) &&
                                    !usg.trimester && !usg.current_trimester;

            if (isGynecologyUSG) {
                // Gynecology USG format
                if (usg.transabdominal || usg.transvaginal) {
                    const methods = [];
                    if (usg.transabdominal) methods.push('Transabdominal');
                    if (usg.transvaginal) methods.push('Transvaginal');
                    resume += `Metode: ${methods.join(' + ')}\n\n`;
                }

                // Uterus
                if (usg.uterus_posisi || usg.uterus_length) {
                    resume += 'Uterus:\n';
                    if (usg.uterus_posisi) resume += `- Posisi: ${usg.uterus_posisi}\n`;
                    if (usg.uterus_length && usg.uterus_width && usg.uterus_depth) {
                        resume += `- Ukuran: ${usg.uterus_length} x ${usg.uterus_width} x ${usg.uterus_depth} cm\n`;
                    }
                    if (usg.uterus_volume) resume += `- Volume: ${usg.uterus_volume} ml\n`;
                    if (usg.mioma === 'ada') {
                        resume += '- Mioma: Ada';
                        const miomaTypes = [];
                        if (usg.mioma_submukosa) miomaTypes.push('Submukosa');
                        if (usg.mioma_intramural) miomaTypes.push('Intramural');
                        if (usg.mioma_subserosa) miomaTypes.push('Subserosa');
                        if (miomaTypes.length > 0) resume += ` (${miomaTypes.join(', ')})`;
                        if (usg.mioma_size_1) resume += ` ukuran ${usg.mioma_size_1}x${usg.mioma_size_2 || '?'}x${usg.mioma_size_3 || '?'} cm`;
                        resume += '\n';
                    } else if (usg.mioma === 'tidak_ada') {
                        resume += '- Mioma: Tidak ada\n';
                    }
                    if (usg.adenomyosis === 'ada') resume += '- Adenomyosis: Ada\n';
                    resume += '\n';
                }

                // Endometrium
                if (usg.endometrium_thickness) {
                    resume += 'Endometrium:\n';
                    resume += `- Ketebalan: ${usg.endometrium_thickness} mm\n`;
                    const morphology = [];
                    if (usg.endo_trilaminar) morphology.push('Trilaminar');
                    if (usg.endo_echogenic) morphology.push('Echogenic');
                    if (usg.endo_normal) morphology.push('Normal');
                    if (usg.endo_polyp) morphology.push('Polip');
                    if (morphology.length > 0) resume += `- Morfologi: ${morphology.join(', ')}\n`;
                    resume += '\n';
                }

                // Ovarium
                if (usg.ovarium_kanan_visible || usg.ovarium_kiri_visible) {
                    resume += 'Ovarium:\n';
                    if (usg.ovarium_kanan_visible && usg.ovarium_kanan_1) {
                        resume += `- Kanan: ${usg.ovarium_kanan_1} x ${usg.ovarium_kanan_2 || '?'} x ${usg.ovarium_kanan_3 || '?'} cm\n`;
                    }
                    if (usg.ovarium_kiri_visible && usg.ovarium_kiri_1) {
                        resume += `- Kiri: ${usg.ovarium_kiri_1} x ${usg.ovarium_kiri_2 || '?'} x ${usg.ovarium_kiri_3 || '?'} cm\n`;
                    }
                    if (usg.ovarium_pco) resume += '- PCO (Polycystic Ovary): Ya\n';
                    if (usg.ovarium_massa) {
                        resume += '- Massa: Ada';
                        if (usg.massa_size_1) resume += ` ukuran ${usg.massa_size_1}x${usg.massa_size_2 || '?'} cm`;
                        resume += '\n';
                    }
                    resume += '\n';
                }

                // Kesan/Kesimpulan
                if (usg.kesan) {
                    resume += `Kesan/Kesimpulan:\n${usg.kesan}\n\n`;
                }
            } else {
                // Obstetri USG format (original)

            // Check current trimester
            const currentTrimester = usg.current_trimester || usg.trimester;
            
            // Skrining Kongenital - Check for screening data (flat structure)
            if (currentTrimester === 'screening' || usg.trimester === 'screening') {
                resume += 'Hasil Skrining Kelainan Kongenital:\n\n';
                
                if (usg.date) resume += `Tanggal Pemeriksaan: ${usg.date}\n`;
                if (usg.gender) {
                    const genderMap = { 'male': 'Laki-laki', 'female': 'Perempuan' };
                    resume += `Jenis Kelamin: ${genderMap[usg.gender] || usg.gender}\n`;
                }
                resume += '\n';
                
                // Kepala dan Otak
                const headItems = [];
                if (usg.simetris_hemisfer) headItems.push('Simetris hemisfer');
                if (usg.falx_bpd) headItems.push('Falx cerebri jelas, BPD sesuai usia kehamilan');
                if (usg.ventrikel) headItems.push('Ventrikel lateral, Atrium < 10 mm');
                if (usg.cavum_septum) headItems.push('Cavum septum pellucidum');
                if (headItems.length > 0) {
                    resume += 'Kepala dan Otak:\n';
                    headItems.forEach(item => resume += `• ${item}\n`);
                    resume += '\n';
                }
                
                // Muka dan Leher
                const faceItems = [];
                if (usg.profil_muka) faceItems.push('Profil muka normal');
                if (usg.tulang_hidung) faceItems.push('Tulang hidung tampak, ukuran normal');
                if (usg.garis_bibir) faceItems.push('Garis bibir atas menyambung');
                if (faceItems.length > 0) {
                    resume += 'Muka dan Leher:\n';
                    faceItems.forEach(item => resume += `• ${item}\n`);
                    resume += '\n';
                }
                
                // Jantung dan Rongga Dada
                const heartItems = [];
                if (usg.four_chamber) heartItems.push('Gambaran jelas 4-chamber view');
                if (usg.jantung_kiri) heartItems.push('Jantung di sebelah kiri');
                if (usg.septum_interv) heartItems.push('Septum interventrikular intak');
                if (usg.besar_jantung) heartItems.push('Besar jantung <1/3 area dada');
                if (usg.dua_atrium) heartItems.push('Terlihat 2 atrium');
                if (usg.katup_atrioventricular) heartItems.push('Katup atrioventricular terlihat');
                if (usg.ritme_jantung) heartItems.push('Ritme jantung normal');
                if (usg.echogenic_pads) heartItems.push('Tidak ada echogenic intracardiac focus');
                if (heartItems.length > 0) {
                    resume += 'Jantung dan Rongga Dada:\n';
                    heartItems.forEach(item => resume += `• ${item}\n`);
                    resume += '\n';
                }
                
                // Tulang Belakang
                const spineItems = [];
                if (usg.vertebra) spineItems.push('Tidak tampak kelainan vertebra');
                if (usg.kulit_dorsal) spineItems.push('Garis kulit dorsal tampak baik');
                if (spineItems.length > 0) {
                    resume += 'Tulang Belakang:\n';
                    spineItems.forEach(item => resume += `• ${item}\n`);
                    resume += '\n';
                }
                
                // Anggota Gerak
                const limbItems = [];
                if (usg.alat_gerak_atas) limbItems.push('Alat gerak kiri kanan atas normal');
                if (usg.alat_gerak_bawah) limbItems.push('Alat gerak kiri kanan bawah normal');
                if (usg.visual_tangan) limbItems.push('Visualisasi tulang tangan dan kaki baik');
                if (limbItems.length > 0) {
                    resume += 'Anggota Gerak:\n';
                    limbItems.forEach(item => resume += `• ${item}\n`);
                    resume += '\n';
                }
                
                // Rongga Perut
                const abdomenItems = [];
                if (usg.lambung_kiri) abdomenItems.push('Lambung di sebelah kiri');
                if (usg.posisi_liver) abdomenItems.push('Posisi liver dan echogenicity normal');
                if (usg.ginjal_kiri_kanan) abdomenItems.push('Terlihat ginjal kiri & kanan');
                if (usg.ginjal_echohypoic) abdomenItems.push('Ginjal tampak echohypoic normal');
                if (usg.kandung_kemih) abdomenItems.push('Kandung kemih terisi');
                if (usg.insersi_tali_pusat) abdomenItems.push('Insersi tali pusat baik');
                if (usg.dinding_perut) abdomenItems.push('Dinding perut tidak tampak defek');
                if (abdomenItems.length > 0) {
                    resume += 'Rongga Perut:\n';
                    abdomenItems.forEach(item => resume += `• ${item}\n`);
                    resume += '\n';
                }
                
                // Kesimpulan Skrining
                if (usg.tidak_kelainan) {
                    resume += 'Kesimpulan: Tidak tampak kelainan kongenital mayor\n\n';
                } else if (usg.kecurigaan) {
                    resume += 'Kesimpulan: Dicurigai ada kelainan\n';
                    if (usg.kecurigaan_text) resume += `Catatan: ${usg.kecurigaan_text}\n\n`;
                }
            }
            
            // Get data from current trimester
            let trimesterData = usg;
            if (currentTrimester === 'first' && usg.trimester_1) trimesterData = usg.trimester_1;
            if (currentTrimester === 'second' && usg.trimester_2) trimesterData = usg.trimester_2;
            if (currentTrimester === 'third' && usg.trimester_3) trimesterData = usg.trimester_3;
            if (currentTrimester === 'screening' && usg.screening) trimesterData = usg.screening;
            
            // Biometri Janin
            const biometri = [];
            if (trimesterData.crl_cm) biometri.push(`Crown-Rump Length (CRL): ${trimesterData.crl_cm} cm`);
            if (trimesterData.bpd) biometri.push(`Biparietal Diameter (BPD): ${trimesterData.bpd} cm`);
            if (trimesterData.ac) biometri.push(`Abdominal Circumference (AC): ${trimesterData.ac} cm`);
            if (trimesterData.fl) biometri.push(`Femur Length (FL): ${trimesterData.fl} cm`);
            if (trimesterData.hc) biometri.push(`Head Circumference (HC): ${trimesterData.hc} cm`);
            
            if (biometri.length > 0) {
                resume += 'Biometri Janin:\n';
                biometri.forEach(item => resume += `- ${item}\n`);
                resume += '\n';
            }
            
            // Parameter Lainnya
            if (trimesterData.heart_rate) resume += `Denyut Jantung Janin (DJJ): ${trimesterData.heart_rate} bpm\n`;
            if (trimesterData.efw) resume += `Estimasi Berat Janin (EFW): ${trimesterData.efw} gram\n`;
            if (trimesterData.edd) resume += `Hari Perkiraan Lahir (EDD): ${trimesterData.edd}\n`;
            if (trimesterData.ga_weeks) resume += `Usia Kehamilan: ${trimesterData.ga_weeks} minggu\n`;
            if (trimesterData.placenta) resume += `Lokasi Plasenta: ${trimesterData.placenta}\n`;
            if (trimesterData.afi) resume += `Amniotic Fluid Index (AFI): ${trimesterData.afi} cm\n`;
            if (trimesterData.gender && currentTrimester !== 'screening') {
                const genderMap = { 'male': 'Laki-laki', 'female': 'Perempuan' };
                resume += `Jenis Kelamin: ${genderMap[trimesterData.gender] || trimesterData.gender}\n`;
            }
            
            if (usg.notes) {
                resume += `\nCatatan Tambahan:\n${usg.notes}\n`;
            }
            resume += '\n';
            } // End of else (obstetri USG)
        }
    }

    // VI. PEMERIKSAAN PENUNJANG
    if (records.penunjang && typeof records.penunjang === 'object') {
        const penunjang = records.penunjang;

        // Skip placeholder text
        const placeholderText = 'Mohon menunggu';
        const skipValues = [placeholderText, '', null, undefined];

        // Check for actual data (not placeholders)
        const hasInterpretation = penunjang.interpretation &&
                                  !penunjang.interpretation.includes(placeholderText) &&
                                  penunjang.interpretation.trim() !== '';
        const hasLabFindings = penunjang.lab_findings &&
                               !penunjang.lab_findings.includes(placeholderText) &&
                               penunjang.lab_findings.trim() !== '';
        const hasImagingFindings = penunjang.imaging_findings &&
                                   !penunjang.imaging_findings.includes(placeholderText) &&
                                   penunjang.imaging_findings.trim() !== '';
        const hasOtherFindings = penunjang.other_findings &&
                                 !penunjang.other_findings.includes(placeholderText) &&
                                 penunjang.other_findings.trim() !== '';
        const hasFiles = penunjang.files && penunjang.files.length > 0;

        if (hasInterpretation || hasLabFindings || hasImagingFindings || hasOtherFindings) {
            resume += 'VI. PEMERIKSAAN PENUNJANG\n';
            resume += '──────────────────────────────────────────────────\n';

            // AI interpretation from uploaded files
            if (hasInterpretation) {
                resume += `Hasil Interpretasi:\n${penunjang.interpretation}\n\n`;
            }

            if (hasLabFindings) {
                resume += `A. Hasil Pemeriksaan Laboratorium:\n${penunjang.lab_findings}\n\n`;
            }

            if (hasImagingFindings) {
                resume += `B. Hasil Pemeriksaan Pencitraan/Imaging:\n${penunjang.imaging_findings}\n\n`;
            }

            if (hasOtherFindings) {
                resume += `C. Pemeriksaan Penunjang Lainnya:\n${penunjang.other_findings}\n\n`;
            }

            resume += '\n';
        }
    }

    // VII. DIAGNOSIS
    if (records.diagnosis && typeof records.diagnosis === 'object') {
        const diagnosis = records.diagnosis;
        const hasData = diagnosis.diagnosis_utama || diagnosis.diagnosis_sekunder;
        
        if (hasData) {
            resume += 'VII. DIAGNOSIS\n';
            resume += '──────────────────────────────────────────────────\n';
            
            if (diagnosis.diagnosis_utama) {
                resume += `Diagnosis Utama:\n${diagnosis.diagnosis_utama}\n\n`;
            }
            
            if (diagnosis.diagnosis_sekunder) {
                resume += `Diagnosis Sekunder:\n${diagnosis.diagnosis_sekunder}\n\n`;
            }
            
            resume += '\n';
        }
    }

    // VIII. RENCANA TATALAKSANA (PLANNING)
    if (records.planning && typeof records.planning === 'object') {
        const planning = records.planning;
        const hasData = Object.values(planning).some(val => val && val !== '');
        
        if (hasData) {
            resume += 'VIII. RENCANA TATALAKSANA\n';
            resume += '──────────────────────────────────────────────────\n';
            
            if (planning.tindakan) {
                resume += `A. Tindakan Medis:\n${planning.tindakan}\n\n`;
            }
            
            if (planning.terapi) {
                resume += `B. Terapi:\n${planning.terapi}\n\n`;
            }
            
            if (planning.rencana) {
                resume += `C. Rencana Perawatan dan Follow-up:\n${planning.rencana}\n\n`;
            }
            
            if (planning.edukasi) {
                resume += `D. Edukasi Pasien:\n${planning.edukasi}\n\n`;
            }
            
            if (planning.rujukan) {
                resume += `E. Rujukan:\n${planning.rujukan}\n\n`;
            }
            
            resume += '\n';
        }
    }

    // Footer
    resume += '═══════════════════════════════════════════════════════════════\n';
    resume += `Tanggal Pembuatan Resume: ${new Date().toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })}\n`;
    resume += '═══════════════════════════════════════════════════════════════\n\n';
    resume += 'File USG dan Lab/Hasil Tes akan segera dikirimkan ke Portal Anda\n';

    return resume;
}

module.exports = router;
