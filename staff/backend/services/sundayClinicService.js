const db = require('../db');
const logger = require('../utils/logger');

// Unified MR ID prefix (Dr. Dibya Medical Record)
const MR_PREFIX = 'DRD';

// Valid intake categories (for smart triage and form routing)
const VALID_CATEGORIES = ['obstetri', 'gyn_repro', 'gyn_special'];

/**
 * Determine MR category from intake data
 * @param {Object} intakeData - Patient intake data with category information
 * @returns {string} - Category: 'obstetri', 'gyn_repro', or 'gyn_special'
 */
function determineMrCategory(intakeData) {
    if (!intakeData) {
        return 'obstetri'; // Default fallback
    }

    // Check intake category from metadata or payload
    const category = intakeData.summary?.intakeCategory
        || intakeData.metadata?.intakeCategory
        || intakeData.payload?.metadata?.intakeCategory
        || intakeData.payload?.intake_category;

    // Validate and normalize category
    if (category && VALID_CATEGORIES.includes(category.toLowerCase())) {
        return category.toLowerCase();
    }

    // Fallback: check pregnant status
    const pregnantStatus = intakeData.payload?.pregnant_status
        || intakeData.summary?.routing?.pregnantStatus;

    if (pregnantStatus === 'yes') {
        return 'obstetri';
    }

    // Default to obstetri if cannot determine
    logger.warn('Could not determine MR category from intake data, defaulting to obstetri', {
        intakeData: JSON.stringify(intakeData).substring(0, 200)
    });
    return 'obstetri';
}

/**
 * Generate unified MR ID (DRD0001, DRD0002, DRD0003...)
 * @param {string} category - Category: 'obstetri', 'gyn_repro', or 'gyn_special' (for tracking only)
 * @param {Object} connection - Optional database connection for transaction
 * @returns {Promise<{mrId: string, category: string, sequence: number}>}
 */
async function generateCategoryBasedMrId(category, connection) {
    // Validate category (still needed for smart triage tracking)
    if (!category || !VALID_CATEGORIES.includes(category)) {
        throw new Error(`Invalid MR category: ${category}. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    const conn = connection || await db.getConnection();
    const releaseLater = !connection;

    try {
        // Use unified counter (category = 'unified')
        await conn.query(
            'UPDATE sunday_clinic_mr_counters SET current_sequence = current_sequence + 1 WHERE category = ?',
            ['unified']
        );

        // Get new sequence number from unified counter
        const [rows] = await conn.query(
            'SELECT current_sequence FROM sunday_clinic_mr_counters WHERE category = ?',
            ['unified']
        );

        if (!rows.length) {
            throw new Error('Unified counter not found');
        }

        const sequence = rows[0].current_sequence;
        const mrId = `${MR_PREFIX}${String(sequence).padStart(4, '0')}`;

        logger.info('Generated unified MR ID', { mrId, category, sequence });

        return { mrId, category, sequence };
    } catch (error) {
        logger.error('Failed to generate unified MR ID', {
            category,
            error: error.message
        });
        throw error;
    } finally {
        if (releaseLater) {
            conn.release();
        }
    }
}

/**
 * Legacy MR ID generation (MR0001, MR0002, ...)
 * @deprecated Use generateCategoryBasedMrId instead
 */
function parseNextCounter(mrId) {
    if (!mrId || typeof mrId !== 'string') return 0;
    const match = mrId.match(/(\d+)$/);
    if (!match) return 0;
    return parseInt(match[1], 10) || 0;
}

/**
 * Legacy MR ID generation
 * @deprecated Use generateCategoryBasedMrId instead
 */
async function generateSundayClinicMrId(connection) {
    const conn = connection || await db.getConnection();
    const releaseLater = !connection;

    try {
        const [rows] = await conn.query('SELECT mr_id FROM sunday_clinic_records ORDER BY id DESC LIMIT 1 FOR UPDATE');
        const lastNumber = rows.length ? parseNextCounter(rows[0].mr_id) : 0;
        const nextNumber = lastNumber + 1;
        return `MR${String(nextNumber).padStart(4, '0')}`;
    } finally {
        if (releaseLater) {
            conn.release();
        }
    }
}

async function findRecordByAppointment(appointmentId, connection) {
    const conn = connection || db;
    const [rows] = await conn.query(
        'SELECT * FROM sunday_clinic_records WHERE appointment_id = ? LIMIT 1',
        [appointmentId]
    );
    return rows[0] || null;
}

async function findRecordByMrId(mrId, connection) {
    const conn = connection || db;
    const [rows] = await conn.query(
        'SELECT * FROM sunday_clinic_records WHERE mr_id = ? LIMIT 1',
        [mrId]
    );
    return rows[0] || null;
}

/**
 * Find patient's MR history by category
 * @param {string} patientId - Patient ID
 * @param {string} category - Category (obstetri/gyn_repro/gyn_special)
 * @param {Object} connection - Optional database connection
 * @returns {Promise<Object|null>} MR history record or null
 */
async function findPatientMrByCategory(patientId, category, connection) {
    const conn = connection || db;
    const [rows] = await conn.query(
        `SELECT * FROM patient_mr_history
         WHERE patient_id = ? AND mr_category = ?
         ORDER BY last_visit_date DESC
         LIMIT 1`,
        [patientId, category]
    );
    return rows[0] || null;
}

/**
 * Get all MR IDs for a patient
 * @param {string} patientId - Patient ID
 * @param {Object} connection - Optional database connection
 * @returns {Promise<Array>} Array of MR history records
 */
async function getPatientMrHistory(patientId, connection) {
    const conn = connection || db;
    const [rows] = await conn.query(
        `SELECT * FROM patient_mr_history
         WHERE patient_id = ?
         ORDER BY last_visit_date DESC`,
        [patientId]
    );
    return rows;
}

/**
 * Smart category detection based on appointment complaint and patient history
 * @param {Object} params
 * @param {string} params.patientId - Patient ID
 * @param {string} params.complaint - Chief complaint from appointment
 * @param {Object} params.intakeData - Latest patient intake data
 * @param {Object} connection - Optional database connection
 * @returns {Promise<Object>} Detection result with category, confidence, reason
 */
async function detectVisitCategory({ patientId, complaint = '', intakeData = null }, connection) {
    const conn = connection || db;

    // Get patient's MR history
    const mrHistory = await getPatientMrHistory(patientId, conn);

    const chiefComplaint = (complaint || '').toLowerCase();

    // RULE 1: Pregnancy-related keywords → Obstetri
    const obstetriKeywords = [
        'hamil', 'kehamilan', 'pregnant', 'pregnancy',
        'usg', 'kontrol kandungan', 'cek janin',
        'mual muntah', 'morning sickness', 'anc', 'prenatal',
        'antenatal', 'trimester', 'usia kehamilan'
    ];

    if (obstetriKeywords.some(keyword => chiefComplaint.includes(keyword))) {
        return {
            category: 'obstetri',
            confidence: 'high',
            reason: 'Pregnancy-related complaint detected',
            needsConfirmation: false,
            keywords: obstetriKeywords.filter(k => chiefComplaint.includes(k))
        };
    }

    // RULE 2: Contraception/reproductive → Gyn Repro
    const reproKeywords = [
        'kb', 'kontrasepsi', 'contraception',
        'menstruasi', 'haid', 'menstrual', 'period',
        'ingin punya anak', 'program hamil', 'fertility',
        'pasca melahirkan', 'post partum', 'nifas',
        'siklus haid', 'telat haid', 'amenorrhea'
    ];

    if (reproKeywords.some(keyword => chiefComplaint.includes(keyword))) {
        return {
            category: 'gyn_repro',
            confidence: 'high',
            reason: 'Reproductive health concern detected',
            needsConfirmation: false,
            keywords: reproKeywords.filter(k => chiefComplaint.includes(k))
        };
    }

    // RULE 3: Gynecological issues → Gyn Special
    const gynKeywords = [
        'keputihan', 'discharge', 'gatal', 'itching',
        'nyeri panggul', 'pelvic pain', 'perdarahan', 'bleeding',
        'kista', 'cyst', 'miom', 'fibroid', 'endometriosis',
        'kanker', 'cancer', 'tumor', 'benjolan'
    ];

    if (gynKeywords.some(keyword => chiefComplaint.includes(keyword))) {
        return {
            category: 'gyn_special',
            confidence: 'high',
            reason: 'Gynecological issue detected',
            needsConfirmation: false,
            keywords: gynKeywords.filter(k => chiefComplaint.includes(k))
        };
    }

    // RULE 4: Check if currently pregnant from recent intake
    if (intakeData?.pregnant_status === 'yes') {
        const intakeDate = intakeData.created_at || intakeData.submission_date;
        const isRecent = intakeDate && isWithinMonths(intakeDate, 9); // Within pregnancy period

        if (isRecent) {
            return {
                category: 'obstetri',
                confidence: 'medium',
                reason: 'Currently pregnant (from recent intake)',
                needsConfirmation: true,
                intakeDate
            };
        }
    }

    // RULE 5: Post-partum period (< 6 months after obstetri visit)
    const recentObstetri = mrHistory.find(mr =>
        mr.mr_category === 'obstetri' && isWithinMonths(mr.last_visit_date, 6)
    );

    if (recentObstetri) {
        return {
            category: 'gyn_repro',
            confidence: 'medium',
            reason: 'Post-partum period (likely contraception or reproductive)',
            needsConfirmation: true,
            lastObstetriVisit: recentObstetri.last_visit_date
        };
    }

    // RULE 6: Default to most recent category
    if (mrHistory.length > 0) {
        const mostRecent = mrHistory[0];
        return {
            category: mostRecent.mr_category,
            confidence: 'low',
            reason: `Last visit category: ${mostRecent.mr_category}`,
            needsConfirmation: true,
            lastVisit: mostRecent.last_visit_date,
            mrId: mostRecent.mr_id
        };
    }

    // RULE 7: First time patient - must ask
    return {
        category: null,
        confidence: 'none',
        reason: 'First time patient - category selection required',
        needsConfirmation: true
    };
}

/**
 * Helper function to check if date is within specified months
 * @param {Date|string} date - Date to check
 * @param {number} months - Number of months
 * @returns {boolean}
 */
function isWithinMonths(date, months) {
    if (!date) return false;
    const checkDate = new Date(date);
    const now = new Date();
    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - months);
    return checkDate >= monthsAgo && checkDate <= now;
}

/**
 * Get or create MR ID for visit with smart category detection
 * @param {Object} params
 * @param {string} params.patientId - Patient ID
 * @param {string} params.category - Category (if manually specified)
 * @param {string} params.complaint - Chief complaint
 * @param {Object} params.intakeData - Patient intake data
 * @param {Object} connection - Optional database connection
 * @returns {Promise<Object>} MR ID information with category
 */
async function getOrCreateMrIdForVisit({
    patientId,
    category = null,
    complaint = '',
    intakeData = null
}, connection) {
    const conn = connection || await db.getConnection();
    const releaseLater = !connection;

    try {
        // If category not specified, detect it
        let finalCategory = category;
        let detection = null;

        if (!finalCategory) {
            detection = await detectVisitCategory({
                patientId,
                complaint,
                intakeData
            }, conn);
            finalCategory = detection.category || 'obstetri';
        }

        // Check if patient already has an MR ID for this category
        const existingMr = await findPatientMrByCategory(patientId, finalCategory, conn);

        if (existingMr) {
            // Reuse existing MR ID
            await conn.query(
                `UPDATE patient_mr_history
                 SET last_visit_date = CURDATE(),
                     visit_count = visit_count + 1,
                     updated_at = NOW()
                 WHERE id = ?`,
                [existingMr.id]
            );

            logger.info('Reusing existing MR ID for patient', {
                patientId,
                mrId: existingMr.mr_id,
                category: finalCategory,
                visitCount: existingMr.visit_count + 1
            });

            return {
                mrId: existingMr.mr_id,
                category: finalCategory,
                sequence: existingMr.mr_id.match(/\d+/)?.[0],
                isNew: false,
                previousVisits: existingMr.visit_count,
                detection
            };
        }

        // Generate NEW MR ID for this category
        const { mrId, sequence } = await generateCategoryBasedMrId(finalCategory, conn);

        // Record in patient MR history
        await conn.query(
            `INSERT INTO patient_mr_history
             (patient_id, mr_id, mr_category, first_visit_date, last_visit_date, visit_count)
             VALUES (?, ?, ?, CURDATE(), CURDATE(), 1)`,
            [patientId, mrId, finalCategory]
        );

        logger.info('Created new MR ID for patient', {
            patientId,
            mrId,
            category: finalCategory,
            sequence
        });

        return {
            mrId,
            category: finalCategory,
            sequence,
            isNew: true,
            previousVisits: 0,
            detection
        };
    } finally {
        if (releaseLater) {
            conn.release();
        }
    }
}

/**
 * Create Sunday Clinic record with category-based MR ID
 * @param {Object} params
 * @param {number} params.appointmentId - Appointment ID
 * @param {string} params.patientId - Patient ID
 * @param {string} params.category - MR category (obstetri/gyn_repro/gyn_special)
 * @param {Object} params.intakeData - Optional intake data to auto-determine category
 * @param {number|null} params.createdBy - User ID who created the record
 * @param {Object} transactionConnection - Optional database connection
 */
async function createSundayClinicRecord({
    appointmentId,
    patientId,
    category = null,
    intakeData = null,
    createdBy = null
}, transactionConnection = null) {
    const conn = transactionConnection || await db.getConnection();
    const manageTransaction = !transactionConnection;

    try {
        if (manageTransaction) {
            await conn.beginTransaction();
        }

        // Check if record already exists for this appointment
        const existing = await findRecordByAppointment(appointmentId, conn);
        if (existing) {
            if (manageTransaction) {
                await conn.commit();
                conn.release();
            }
            return { record: existing, created: false };
        }

        // Determine category if not provided
        let mrCategory = category;
        if (!mrCategory && intakeData) {
            mrCategory = determineMrCategory(intakeData);
            logger.info('Auto-determined MR category from intake data', {
                patientId,
                appointmentId,
                category: mrCategory
            });
        }

        // Default to obstetri if still not determined
        if (!mrCategory || !VALID_CATEGORIES.includes(mrCategory)) {
            mrCategory = 'obstetri';
            logger.warn('Using default category: obstetri', { patientId, appointmentId });
        }

        // Generate category-based MR ID
        const { mrId, sequence } = await generateCategoryBasedMrId(mrCategory, conn);
        const folderPath = `sunday-clinic/${mrId.toLowerCase()}`;

        const createdByValue = createdBy && /^\d+$/.test(String(createdBy))
            ? parseInt(createdBy, 10)
            : null;

        // Insert record with category and sequence
        const [result] = await conn.query(
            `INSERT INTO sunday_clinic_records
             (mr_id, mr_category, mr_sequence, patient_id, appointment_id, folder_path, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
            [mrId, mrCategory, sequence, patientId, appointmentId || null, folderPath, createdByValue]
        );

        const [rows] = await conn.query(
            'SELECT * FROM sunday_clinic_records WHERE id = ? LIMIT 1',
            [result.insertId]
        );

        if (manageTransaction) {
            await conn.commit();
        }

        logger.info('Created Sunday Clinic record', {
            mrId,
            category: mrCategory,
            sequence,
            patientId,
            appointmentId
        });

        return { record: rows[0], created: true };
    } catch (error) {
        if (manageTransaction) {
            await conn.rollback();
        }
        logger.error('Failed to create Sunday Clinic record', {
            patientId,
            appointmentId,
            error: error.message
        });
        throw error;
    } finally {
        if (manageTransaction) {
            conn.release();
        }
    }
}

/**
 * Get statistics by category
 */
async function getCategoryStatistics() {
    try {
        const [rows] = await db.query(`
            SELECT
                mr_category,
                COUNT(*) as total_records,
                COUNT(CASE WHEN status = 'finalized' THEN 1 END) as finalized_count,
                COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
                MAX(mr_sequence) as highest_sequence
            FROM sunday_clinic_records
            WHERE mr_category IS NOT NULL
            GROUP BY mr_category
        `);

        const [counters] = await db.query('SELECT * FROM sunday_clinic_mr_counters ORDER BY category');

        return {
            recordStats: rows,
            counters: counters
        };
    } catch (error) {
        logger.error('Failed to get category statistics', { error: error.message });
        throw error;
    }
}

module.exports = {
    // New category-based functions
    generateCategoryBasedMrId,
    determineMrCategory,
    getCategoryStatistics,

    // Smart Triage functions
    detectVisitCategory,
    getOrCreateMrIdForVisit,
    getPatientMrHistory,
    findPatientMrByCategory,

    // Updated functions
    createSundayClinicRecord,
    findRecordByAppointment,
    findRecordByMrId,

    // Legacy (deprecated but kept for backward compatibility)
    generateSundayClinicMrId,

    // Constants
    MR_PREFIX,
    VALID_CATEGORIES
};
