'use strict';

const {
    formatDateLocal,
    db,
    logger
} = require('./shared');

async function postStartWalkIn(req, res, next) {
    try {
        const { patient_id, category, location, visit_date, is_retrospective, import_source } = req.body;

        if (!patient_id) {
            return res.status(400).json({
                success: false,
                message: 'patient_id wajib diisi'
            });
        }

        // Validate category
        const validCategories = ['obstetri', 'gyn_repro', 'gyn_special'];
        const finalCategory = validCategories.includes(category) ? category : 'obstetri';

        // Validate location
        const validLocations = ['klinik_private', 'rsia_melinda', 'rsud_gambiran', 'rs_bhayangkara'];
        const finalLocation = validLocations.includes(location) ? location : 'klinik_private';

        // Parse visit date for retrospective imports
        let visitDateTime = new Date();
        if (visit_date && is_retrospective) {
            visitDateTime = new Date(visit_date);
            if (isNaN(visitDateTime.getTime())) {
                visitDateTime = new Date(); // Fallback to now if invalid
            }
        }
        const visitDateStr = formatDateLocal(visitDateTime); // YYYY-MM-DD

        // Check if patient exists
        const [patients] = await db.query(
            'SELECT id, full_name, whatsapp, phone, age, birth_date FROM patients WHERE id = ? LIMIT 1',
            [patient_id]
        );

        if (patients.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pasien tidak ditemukan'
            });
        }

        const patient = patients[0];
        const patientName = patient.full_name || 'Unknown';

        // Get user ID from token
        const userId = req.user?.id || null;

        // Import service
        const { generateCategoryBasedMrId } = require('../sundayClinicService');

        // Retry logic for duplicate key errors (race condition on sequence)
        const MAX_RETRIES = 3;
        let lastError = null;
        let mrId, sequence, folderPath;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const conn = await db.getConnection();

            try {
                await conn.beginTransaction();

                // Generate MR ID (only if no existing record)
                const result = await generateCategoryBasedMrId(finalCategory, conn);
                mrId = result.mrId;
                sequence = result.sequence;
                folderPath = `sunday-clinic/${mrId.toLowerCase()}`;

                // Create the record with visit_location, import_source, and retrospective date if provided
                // import_source values: simrs_gambiran, simrs_melinda, simrs_bhayangkara, or NULL for manual
                await conn.query(
                    `INSERT INTO sunday_clinic_records
                     (mr_id, mr_category, mr_sequence, patient_id, appointment_id, visit_location, import_source, folder_path, status, created_by, created_at)
                     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'draft', ?, ?)`,
                    [mrId, finalCategory, sequence, patient_id, finalLocation, import_source || null, folderPath, userId, visitDateTime]
                );

                // Create patient_mr_history if not exists
                const [existingHistory] = await conn.query(
                    'SELECT id FROM patient_mr_history WHERE patient_id = ? AND mr_category = ? LIMIT 1',
                    [patient_id, finalCategory]
                );

                if (existingHistory.length === 0) {
                    await conn.query(
                        `INSERT INTO patient_mr_history
                         (patient_id, mr_id, mr_category, first_visit_date, last_visit_date, visit_count)
                         VALUES (?, ?, ?, ?, ?, 1)`,
                        [patient_id, mrId, finalCategory, visitDateStr, visitDateStr]
                    );
                } else {
                    // For retrospective imports, only update if the visit date is more recent than existing last_visit_date
                    await conn.query(
                        `UPDATE patient_mr_history
                         SET last_visit_date = GREATEST(last_visit_date, ?), visit_count = visit_count + 1, updated_at = NOW()
                         WHERE patient_id = ? AND mr_category = ?`,
                        [visitDateStr, patient_id, finalCategory]
                    );
                }

                await conn.commit();
                conn.release();
                lastError = null;
                break; // Success - exit retry loop

            } catch (error) {
                await conn.rollback();
                conn.release();
                lastError = error;

                // Check if it's a duplicate key error (ER_DUP_ENTRY)
                if (error.code === 'ER_DUP_ENTRY' && attempt < MAX_RETRIES) {
                    logger.warn(`Duplicate key error on attempt ${attempt}, retrying...`, {
                        sequence,
                        error: error.message
                    });
                    // Sync counter before retry
                    await db.query(`
                        UPDATE sunday_clinic_mr_counters c
                        SET c.current_sequence = (SELECT COALESCE(MAX(mr_sequence), 0) FROM sunday_clinic_records)
                        WHERE c.category = 'unified'
                    `);
                    continue;
                }
                throw error; // Non-duplicate error or max retries reached
            }
        }

        if (lastError) {
            throw lastError;
        }

        logger.info('Created walk-in visit record', {
            mrId,
            patientId: patient_id,
            patientName,
            category: finalCategory,
            location: finalLocation,
            importSource: import_source || null,
            visitDate: visitDateStr,
            isRetrospective: !!is_retrospective,
            createdBy: userId
        });

        res.json({
            success: true,
            message: is_retrospective ? 'Rekam medis retrospektif berhasil dibuat' : 'Kunjungan berhasil dibuat',
            data: {
                mrId,
                category: finalCategory,
                location: finalLocation,
                importSource: import_source || null,
                patientId: patient_id,
                patientName,
                folderPath,
                status: 'draft',
                visitDate: visitDateStr,
                isRetrospective: !!is_retrospective
            }
        });

    } catch (error) {
        logger.error('Start walk-in visit error:', error);
        next(error);
    }
}

async function getPatientVisitsByPatientId(req, res, next) {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const patientId = req.params.patientId;
        const isPatient = req.user?.user_type === 'patient' || req.user?.role === 'patient';

        // Patients can only access their own data
        if (isPatient && req.user.id !== patientId) {
            return res.status(403).json({
                success: false,
                message: 'Akses ditolak'
            });
        }

        const [visits] = await db.query(
            `SELECT
                scr.mr_id,
                scr.mr_category,
                scr.visit_location,
                scr.status,
                scr.created_at as visit_date,
                scr.finalized_at,
                p.full_name as patient_name
             FROM sunday_clinic_records scr
             JOIN patients p ON scr.patient_id = p.id
             WHERE scr.patient_id = ?
             ORDER BY scr.created_at DESC`,
            [patientId]
        );

        // Location config for frontend display
        const locationConfig = {
            'klinik_private': {
                name: 'Klinik Privat dr. Dibya',
                shortName: 'Klinik Privat',
                logo: '/images/dibyablacklogo.svg',
                color: '#3c8dbc'
            },
            'rsia_melinda': {
                name: 'RSIA Melinda',
                shortName: 'RSIA Melinda',
                logo: '/images/melinda-logo.png',
                color: '#e91e63'
            },
            'rsud_gambiran': {
                name: 'RSUD Gambiran',
                shortName: 'RSUD Gambiran',
                logo: '/images/gambiran-logo.png',
                color: '#17a2b8'
            },
            'rs_bhayangkara': {
                name: 'RS Bhayangkara',
                shortName: 'RS Bhayangkara',
                logo: '/images/bhayangkara-logo.png',
                color: '#28a745'
            }
        };

        // Enrich visits with location display info
        const enrichedVisits = visits.map(visit => {
            const locConfig = locationConfig[visit.visit_location] || locationConfig['klinik_private'];
            return {
                ...visit,
                location_name: locConfig.name,
                location_short: locConfig.shortName,
                location_logo: locConfig.logo,
                location_color: locConfig.color
            };
        });

        res.json({
            success: true,
            count: enrichedVisits.length,
            data: enrichedVisits,
            locationConfig // Send config for frontend use
        });

    } catch (error) {
        logger.error('Error fetching patient visits:', error);
        next(error);
    }
}

async function getLastAnthropometryByPatientId(req, res, next) {
    const { patientId } = req.params;
    const { exclude } = req.query; // Current MR ID to exclude

    try {
        const [rows] = await db.query(`
            SELECT
                mr.record_data,
                scr.mr_id,
                scr.created_at as visit_date
            FROM medical_records mr
            JOIN sunday_clinic_records scr ON mr.mr_id = scr.mr_id
            WHERE scr.patient_id = ?
              AND mr.record_type = 'physical_exam'
              AND (? IS NULL OR scr.mr_id != ?)
            ORDER BY scr.created_at DESC
            LIMIT 1
        `, [patientId, exclude || null, exclude || null]);

        if (rows.length === 0) {
            return res.json({
                success: false,
                message: 'Tidak ada data TB/BB dari kunjungan sebelumnya'
            });
        }

        const recordData = typeof rows[0].record_data === 'string'
            ? JSON.parse(rows[0].record_data)
            : rows[0].record_data;

        // Format visit date for display
        const visitDate = new Date(rows[0].visit_date);
        const formattedDate = `${visitDate.getDate()}/${visitDate.getMonth() + 1}/${visitDate.getFullYear()}`;

        res.json({
            success: true,
            data: {
                tinggi_badan: recordData.tinggi_badan || '',
                berat_badan: recordData.berat_badan || '',
                mr_id: rows[0].mr_id,
                visit_date: formattedDate
            }
        });

    } catch (error) {
        logger.error(`[LAST ANTHROPOMETRY] Error fetching for patient ${patientId}:`, error);
        next(error);
    }
}
module.exports = {
    postStartWalkIn,
    getPatientVisitsByPatientId,
    getLastAnthropometryByPatientId
};
