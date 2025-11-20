const db = require('../db');
const logger = require('../utils/logger');

// MR ID category prefixes
const MR_PREFIX = {
    'obstetri': 'MROBS',
    'gyn_repro': 'MRGPR',
    'gyn_special': 'MRGPS'
};

// Valid intake categories
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
 * Generate category-based MR ID (MROBS0001, MRGPR0002, MRGPS0003)
 * @param {string} category - Category: 'obstetri', 'gyn_repro', or 'gyn_special'
 * @param {Object} connection - Optional database connection for transaction
 * @returns {Promise<{mrId: string, category: string, sequence: number}>}
 */
async function generateCategoryBasedMrId(category, connection) {
    // Validate category
    if (!category || !VALID_CATEGORIES.includes(category)) {
        throw new Error(`Invalid MR category: ${category}. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    const conn = connection || await db.getConnection();
    const releaseLater = !connection;

    try {
        // Lock and increment counter for this category
        await conn.query(
            'UPDATE sunday_clinic_mr_counters SET current_sequence = current_sequence + 1 WHERE category = ?',
            [category]
        );

        // Get new sequence number
        const [rows] = await conn.query(
            'SELECT current_sequence FROM sunday_clinic_mr_counters WHERE category = ?',
            [category]
        );

        if (!rows.length) {
            throw new Error(`Counter not found for category: ${category}`);
        }

        const sequence = rows[0].current_sequence;
        const prefix = MR_PREFIX[category];
        const mrId = `${prefix}${String(sequence).padStart(4, '0')}`;

        logger.info('Generated category-based MR ID', { mrId, category, sequence });

        return { mrId, category, sequence };
    } catch (error) {
        logger.error('Failed to generate category-based MR ID', {
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
