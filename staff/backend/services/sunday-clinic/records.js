'use strict';

const {
    db,
    logger,
    createSession,
    findRecordByMrId,
    activityLogger,
    sundayClinicMedifySyncQueue,
    normalizeMrId,
    buildMedifyIdentityPrefill,
    normalizePhone,
    createPatientNotification,
    realtimeSync,
    toDate,
    MEDIFY_SOAP_SYNC_SECTIONS,
    parseJson,
    getPatient,
    getSessionLabel,
    getSlotTime,
    getGmt7DayWindow,
    getAppointment,
    findLatestIntake,
    mergeStructuredCpptPayload,
    formatRecord,
    formatPatient,
    formatIntakeRow,
    loadMedicalRecordsBundle,
    buildAggregateSummary
} = require('./shared');

async function getCheckExisting(req, res, next) {
    try {
        const { patient_id, location } = req.query;
        const { startDateTime: todayStart, endDateTime: tomorrowStart } = getGmt7DayWindow();

        if (!patient_id) {
            return res.status(400).json({
                success: false,
                message: 'patient_id is required'
            });
        }

        // Check for existing record today at this location (or any location if not specified)
        let query = `
            SELECT mr_id, id, status, visit_location
            FROM sunday_clinic_records
                        WHERE patient_id = ?
                            AND created_at >= ?
                            AND created_at < ?
        `;
                const params = [patient_id, todayStart, tomorrowStart];

        if (location) {
            query += ` AND visit_location = ?`;
            params.push(location);
        }

        query += ` ORDER BY created_at DESC, id DESC LIMIT 1`;

        const [rows] = await db.query(query, params);

        res.json({
            success: true,
            existingMrId: rows[0]?.mr_id || null,
            existingRecordId: rows[0]?.id || null,
            status: rows[0]?.status || null,
            location: rows[0]?.visit_location || null
        });

    } catch (error) {
        logger.error('Error checking existing record:', error);
        next(error);
    }
}

async function getDirectory(req, res, next) {
    const search = (req.query.search || '').trim();
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const defaultLimit = search ? 120 : 200;
    const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 20), 400)
        : defaultLimit;
    const conditions = [];
    const params = [];

    if (search) {
        const like = `%${search}%`;
        conditions.push(`(
            scr.mr_id LIKE ?
            OR p.full_name LIKE ?
            OR sa.patient_name LIKE ?
            OR p.phone LIKE ?
            OR p.whatsapp LIKE ?
            OR sa.patient_phone LIKE ?
        )`);
        params.push(like, like, like, like, like, like);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderByClause = search
        ? `ORDER BY COALESCE(p.full_name, sa.patient_name, scr.mr_id) ASC,
                 IFNULL(sa.appointment_date, scr.created_at) DESC,
                 scr.created_at DESC`
        : `ORDER BY scr.updated_at DESC, scr.created_at DESC`;

    try {
        const [rows] = await db.query(
            `SELECT scr.mr_id,
                    scr.patient_id,
                    scr.appointment_id,
                    scr.status AS record_status,
                    scr.created_at AS record_created_at,
                    scr.updated_at AS record_updated_at,
                    p.full_name AS patient_name,
                    p.whatsapp AS patient_whatsapp,
                    p.phone AS patient_phone,
                    p.age AS patient_age,
                    p.birth_date AS patient_birth_date,
                    sa.patient_name AS appointment_patient_name,
                    sa.patient_phone AS appointment_patient_phone,
                    sa.appointment_date,
                    sa.session,
                    sa.slot_number,
                    sa.status AS appointment_status,
                    sa.chief_complaint
             FROM sunday_clinic_records scr
             LEFT JOIN patients p ON p.id = scr.patient_id
             LEFT JOIN sunday_appointments sa ON sa.id = scr.appointment_id
             ${whereClause}
             ${orderByClause}
             LIMIT ?`,
            [...params, limit]
        );

        const patientsMap = new Map();

        rows.forEach((row) => {
            const patientId = row.patient_id || `unknown:${row.mr_id}`;
            let entry = patientsMap.get(patientId);
            if (!entry) {
                entry = {
                    patientId,
                    fullName: row.patient_name || row.appointment_patient_name || row.mr_id,
                    whatsapp: row.patient_whatsapp || null,
                    phone: row.patient_phone || row.appointment_patient_phone || null,
                    age: row.patient_age || null,
                    birthDate: row.patient_birth_date || null,
                    visits: []
                };
                patientsMap.set(patientId, entry);
            }

            entry.visits.push({
                mrId: row.mr_id,
                appointmentId: row.appointment_id,
                appointmentDate: row.appointment_date,
                session: row.session,
                sessionLabel: getSessionLabel(row.session) || null,
                slotNumber: row.slot_number,
                slotTime: getSlotTime(row.session, row.slot_number),
                recordStatus: row.record_status,
                recordCreatedAt: row.record_created_at,
                recordUpdatedAt: row.record_updated_at,
                appointmentStatus: row.appointment_status,
                chiefComplaint: row.chief_complaint || null
            });
        });

        const patients = Array.from(patientsMap.values()).map((entry) => {
            entry.visits.sort((a, b) => {
                const aDate = toDate(a.recordUpdatedAt || a.recordCreatedAt || a.appointmentDate);
                const bDate = toDate(b.recordUpdatedAt || b.recordCreatedAt || b.appointmentDate);
                const aTime = aDate ? aDate.getTime() : 0;
                const bTime = bDate ? bDate.getTime() : 0;
                return bTime - aTime;
            });

            const latestVisit = entry.visits[0];
            const latestVisitAt = latestVisit
                ? toDate(latestVisit.recordUpdatedAt || latestVisit.recordCreatedAt || latestVisit.appointmentDate)
                : null;

            return {
                patientId: entry.patientId,
                fullName: entry.fullName,
                whatsapp: entry.whatsapp,
                phone: entry.phone,
                age: entry.age,
                birthDate: entry.birthDate,
                totalVisits: entry.visits.length,
                latestVisitAt: latestVisitAt ? latestVisitAt.toISOString() : null,
                visits: entry.visits
            };
        });

        res.json({
            success: true,
            data: {
                patients,
                totalPatients: patients.length,
                totalRecords: rows.length,
                limit
            }
        });
    } catch (error) {
        logger.error('Failed to load Sunday clinic directory', {
            search,
            error: error.message
        });
        next(error);
    }
}

async function getRecordsByMrId(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan untuk MR ID tersebut.'
            });
        }

        const record = formatRecord(recordRow);
        const patientRow = await getPatient(record.patientId);
        const patient = formatPatient(patientRow);
        const appointment = await getAppointment(record.appointmentId);

        const phoneCandidates = Array.from(new Set([
            normalizePhone(patient && patient.whatsapp),
            normalizePhone(patient && patient.phone),
            normalizePhone(appointment && appointment.patientPhone)
        ].filter(Boolean)));

        const [intakeRow, medicalRecords] = await Promise.all([
            findLatestIntake(record.patientId, phoneCandidates),
            loadMedicalRecordsBundle(record.patientId, record.mrId) // Pass mrId for visit-specific records
        ]);
        const intake = formatIntakeRow(intakeRow);

        const summary = buildAggregateSummary(record, patient, appointment, intake);

        res.json({
            success: true,
            data: {
                record,
                patient,
                appointment,
                intake,
                medicalRecords,
                summary
            }
        });
    } catch (error) {
        logger.error('Failed to load Sunday clinic record', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
}

async function postRecordsByMrIdBySection(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const section = req.params.section;
    const data = req.body;
    const skipMedifySync = req.get('X-Skip-Medify-Sync') === '1';

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    const validSections = ['anamnesa', 'pemeriksaan_ginekologi', 'usg', 'diagnosis', 'planning', 'physical_exam', 'pemeriksaan_obstetri', 'resume_medis', 'penunjang'];
    if (!validSections.includes(section)) {
        return res.status(400).json({
            success: false,
            message: `Section tidak valid. Gunakan: ${validSections.join(', ')}`
        });
    }

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        let medifySyncResult = null;

        // Check if record exists for this section and mr_id
        const [existingRows] = await db.query(
            `SELECT id FROM medical_records WHERE patient_id = ? AND mr_id = ? AND record_type = ?`,
            [recordRow.patient_id, normalizedMrId, section]
        );

        if (existingRows.length > 0) {
            // Update existing record - also update doctor_id and doctor_name to current user
            await db.query(
                `UPDATE medical_records SET record_data = ?, doctor_id = ?, doctor_name = ?, updated_at = NOW() WHERE id = ?`,
                [JSON.stringify(data), req.user.id || null, req.user.name || null, existingRows[0].id]
            );
        } else {
            // Insert new record with mr_id
            await db.query(
                `INSERT INTO medical_records (patient_id, mr_id, record_type, record_data, doctor_id, doctor_name, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [
                    recordRow.patient_id,
                    normalizedMrId,
                    section,
                    JSON.stringify(data),
                    req.user.id || null,
                    req.user.name || null
                ]
            );
        }

        // Update last_activity_at on the Sunday Clinic record
        await db.query(
            `UPDATE sunday_clinic_records SET last_activity_at = NOW() WHERE mr_id = ?`,
            [normalizedMrId]
        );

        // Update queue status when anamnesa is saved (klinik_private only)
        if (section === 'anamnesa' && recordRow.visit_location === 'klinik_private') {
            await updateQueueStatus(normalizedMrId, 'anamnesa');
        }

        if (MEDIFY_SOAP_SYNC_SECTIONS.has(section) && recordRow.visit_location === 'rsia_melinda' && !skipMedifySync) {
            try {
                medifySyncResult = await sundayClinicMedifySyncQueue.enqueueDiagnosis({
                    mrId: normalizedMrId,
                    patientId: recordRow.patient_id,
                    visitLocation: recordRow.visit_location,
                    diagnosisData: section === 'diagnosis' ? data : undefined,
                    changedSection: section,
                    eventAt: new Date().toISOString(),
                    createdBy: req.user?.name || req.user?.id || null
                });
            } catch (syncError) {
                logger.warn('Failed to enqueue SOAP sync to Medify', {
                    mrId: normalizedMrId,
                    patientId: recordRow.patient_id,
                    section,
                    error: syncError.message
                });
            }
        }

        // Auto-complete hospital appointment when resume_medis is saved
        // Only for RSIA Melinda, RSUD Gambiran, RS Bhayangkara (not Klinik Private or Sunday Clinic)
        if (section === 'resume_medis') {
            try {
                // Check if this patient has a pending/confirmed appointment at the 3 hospitals
                const [appointmentCheck] = await db.query(
                    `SELECT id, hospital_location, appointment_date
                     FROM appointments
                     WHERE patient_id = ?
                     AND hospital_location IN ('rsia_melinda', 'rsud_gambiran', 'rs_bhayangkara')
                     AND status IN ('scheduled', 'confirmed')
                     ORDER BY appointment_date DESC, created_at DESC
                     LIMIT 1`,
                    [recordRow.patient_id]
                );

                if (appointmentCheck.length > 0) {
                    const appointmentScheduler = require('../appointmentScheduler');
                    await appointmentScheduler.autoCompleteOnPayment(
                        appointmentCheck[0].id,
                        `Resume saved for MR ${normalizedMrId}`
                    );
                    logger.info('Auto-completed hospital appointment on resume save', {
                        appointmentId: appointmentCheck[0].id,
                        hospitalLocation: appointmentCheck[0].hospital_location,
                        patientId: recordRow.patient_id
                    });
                }
            } catch (appointmentError) {
                logger.warn('Appointment auto-complete warning:', appointmentError);
                // Don't fail the resume save, just log the error
            }

            // Auto-finalize when resume_medis is saved (all locations including klinik_privat)
            try {
                const [recordInfo] = await db.query(
                    'SELECT visit_location, status FROM sunday_clinic_records WHERE mr_id = ?',
                    [normalizedMrId]
                );

                if (recordInfo.length > 0 && recordInfo[0].status === 'draft') {
                    const userId = req.user.new_id || req.user.id || null;
                    await db.query(
                        `UPDATE sunday_clinic_records
                         SET status = 'finalized',
                             finalized_at = NOW(),
                             finalized_by = ?
                         WHERE mr_id = ?`,
                        [userId, normalizedMrId]
                    );
                    logger.info(`Medical record ${normalizedMrId} auto-finalized after resume_medis saved (location: ${recordInfo[0].visit_location})`);
                }
            } catch (finalizeError) {
                logger.warn('Auto-finalize warning:', finalizeError);
                // Don't fail the resume save
            }

            // Auto-publish resume medis to patient portal
            try {
                const patientId = recordRow.patient_id;
                const resumeContent = data.resume || data.content || '';

                if (resumeContent) {
                    // Get patient name for title
                    const [patientRows] = await db.query(
                        'SELECT full_name FROM patients WHERE id = ?', [patientId]
                    );
                    const patientName = patientRows[0]?.full_name || 'Pasien';
                    const today = new Date();
                    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
                    const title = `Resume Medis - ${patientName} - ${dateStr}`;

                    // Check if already published for this MR
                    const [existingDoc] = await db.query(
                        `SELECT id FROM patient_documents
                         WHERE patient_id = ? AND mr_id = ? AND document_type = 'resume_medis' AND status = 'published'`,
                        [patientId, normalizedMrId]
                    );

                    const sourceData = JSON.stringify({ content: resumeContent, generatedAt: new Date().toISOString() });

                    if (existingDoc.length > 0) {
                        // Update existing
                        await db.query(
                            `UPDATE patient_documents SET title = ?, source_data = ?, published_at = NOW(), published_by = ?, updated_at = NOW()
                             WHERE id = ?`,
                            [title, sourceData, req.user.id || null, existingDoc[0].id]
                        );
                    } else {
                        // Insert new
                        await db.query(
                            `INSERT INTO patient_documents
                             (patient_id, mr_id, document_type, title, file_name, file_type, file_size,
                              source_data, source, status, published_at, published_by, created_by, created_at)
                             VALUES (?, ?, 'resume_medis', ?, ?, 'text/plain', 0, ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
                            [patientId, normalizedMrId, title, title,
                             sourceData, req.user.id || null, req.user.id || null]
                        );

                        // Only notify on first publish (not updates)
                        const { createPatientNotification } = require('../../routes/patient-notifications');
                        await createPatientNotification({
                            patient_id: patientId,
                            type: 'document',
                            title: 'Resume Medis Baru',
                            message: 'Resume medis Anda telah tersedia. Klik untuk melihat.',
                            link: '/dokumen-medis.html',
                            icon: 'fa fa-file-medical',
                            icon_color: 'text-success'
                        });
                    }

                    // Broadcast Socket.IO for real-time refresh
                    const realtimeSync = require('../../realtime-sync');
                    realtimeSync.broadcast({
                        type: 'document:patient_updated',
                        patient_id: patientId,
                        mr_id: normalizedMrId,
                        document_type: 'resume_medis'
                    });

                    logger.info('Resume medis auto-published to patient portal', {
                        mrId: normalizedMrId, patientId, isUpdate: existingDoc.length > 0
                    });
                }
            } catch (autoPublishError) {
                logger.warn('Resume medis auto-publish warning:', autoPublishError);
            }
        }

        // Auto-publish USG photos to patient portal when USG section is saved
        if (section === 'usg') {
            try {
                const photos = data.photos || [];
                const patientId = recordRow.patient_id;

                // 1. Get currently published USG docs for this MR
                const [existingDocs] = await db.query(
                    `SELECT id, file_url FROM patient_documents
                     WHERE patient_id = ? AND mr_id = ? AND document_type = 'usg_photo' AND status = 'published'`,
                    [patientId, normalizedMrId]
                );

                // 2. Build sets for comparison
                const existingUrls = new Set(existingDocs.map(d => d.file_url));
                const currentUrls = new Set(photos.map(p => p.url));

                // 3. Delete removed photos from patient_documents
                const toDelete = existingDocs.filter(d => !currentUrls.has(d.file_url));
                if (toDelete.length > 0) {
                    await db.query(
                        `DELETE FROM patient_documents WHERE id IN (?)`,
                        [toDelete.map(d => d.id)]
                    );
                }

                // 4. Insert new photos into patient_documents
                const toInsert = photos.filter(p => !existingUrls.has(p.url));
                for (const photo of toInsert) {
                    await db.query(
                        `INSERT INTO patient_documents
                         (patient_id, mr_id, document_type, title, file_url, file_path, file_name, file_type, file_size,
                          source, status, published_at, published_by, created_by, created_at)
                         VALUES (?, ?, 'usg_photo', ?, ?, ?, ?, ?, ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
                        [patientId, normalizedMrId, photo.name || 'Foto USG',
                         photo.url, photo.key || photo.filename, photo.name, photo.type || 'image/jpeg', photo.size || 0,
                         req.user.id || null, req.user.id || null]
                    );
                }

                // 5. Send notification only if new photos were added
                if (toInsert.length > 0) {
                    const { createPatientNotification } = require('../../routes/patient-notifications');
                    await createPatientNotification({
                        patient_id: patientId,
                        type: 'document',
                        title: 'Foto USG Baru',
                        message: `${toInsert.length} foto USG baru telah tersedia. Klik untuk melihat.`,
                        link: '/album-usg.html',
                        icon: 'fa fa-image',
                        icon_color: 'text-primary'
                    });
                }

                // 6. Broadcast Socket.IO event for real-time refresh on patient side
                const realtimeSync = require('../../realtime-sync');
                realtimeSync.broadcast({
                    type: 'usg:patient_updated',
                    patient_id: patientId,
                    mr_id: normalizedMrId,
                    added: toInsert.length,
                    removed: toDelete.length
                });

                if (toInsert.length > 0 || toDelete.length > 0) {
                    logger.info('USG auto-published to patient portal', {
                        mrId: normalizedMrId, patientId,
                        added: toInsert.length, removed: toDelete.length
                    });
                }
            } catch (autoPublishError) {
                logger.warn('USG auto-publish warning:', autoPublishError);
                // Don't fail the save
            }
        }

        // Auto-publish penunjang/lab results to patient portal when penunjang section is saved
        if (section === 'penunjang') {
            try {
                const files = data.files || [];
                const interpretation = data.interpretation || '';
                const patientId = recordRow.patient_id;

                // 1. Get currently published lab_result docs for this MR
                const [existingDocs] = await db.query(
                    `SELECT id, file_url FROM patient_documents
                     WHERE patient_id = ? AND mr_id = ? AND document_type = 'lab_result' AND status = 'published'`,
                    [patientId, normalizedMrId]
                );

                // 2. Build sets for comparison
                const existingUrls = new Set(existingDocs.map(d => d.file_url));
                const currentUrls = new Set(files.map(f => f.url));

                // 3. Delete removed files from patient_documents
                const toDelete = existingDocs.filter(d => !currentUrls.has(d.file_url));
                if (toDelete.length > 0) {
                    await db.query(
                        `DELETE FROM patient_documents WHERE id IN (?)`,
                        [toDelete.map(d => d.id)]
                    );
                }

                // 4. Insert new files into patient_documents
                const toInsert = files.filter(f => !existingUrls.has(f.url));
                for (const file of toInsert) {
                    await db.query(
                        `INSERT INTO patient_documents
                         (patient_id, mr_id, document_type, title, file_url, file_path, file_name, file_type, file_size,
                          source, status, published_at, published_by, created_by, created_at)
                         VALUES (?, ?, 'lab_result', ?, ?, ?, ?, ?, ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
                        [patientId, normalizedMrId, file.name || 'Hasil Lab',
                         file.url, file.key || file.filename, file.name, file.type || 'application/octet-stream', file.size || 0,
                         req.user.id || null, req.user.id || null]
                    );
                }

                // 5. Upsert interpretation as lab_interpretation doc
                if (interpretation.trim()) {
                    const [existingInterp] = await db.query(
                        `SELECT id FROM patient_documents
                         WHERE patient_id = ? AND mr_id = ? AND document_type = 'lab_interpretation' AND status = 'published'`,
                        [patientId, normalizedMrId]
                    );
                    const sourceData = JSON.stringify({ content: interpretation, generatedAt: new Date().toISOString() });
                    if (existingInterp.length > 0) {
                        await db.query(
                            `UPDATE patient_documents SET source_data = ?, published_at = NOW(), published_by = ?, updated_at = NOW() WHERE id = ?`,
                            [sourceData, req.user.id || null, existingInterp[0].id]
                        );
                    } else {
                        await db.query(
                            `INSERT INTO patient_documents
                             (patient_id, mr_id, document_type, title, file_name, file_type, file_size, source_data,
                              source, status, published_at, published_by, created_by, created_at)
                             VALUES (?, ?, 'lab_interpretation', 'Interpretasi Hasil Lab', 'Interpretasi Hasil Lab', 'text/plain', 0, ?,
                              'clinic', 'published', NOW(), ?, ?, NOW())`,
                            [patientId, normalizedMrId, sourceData, req.user.id || null, req.user.id || null]
                        );
                    }
                }

                // 6. Send notification only if new files were added
                if (toInsert.length > 0) {
                    const { createPatientNotification } = require('../../routes/patient-notifications');
                    await createPatientNotification({
                        patient_id: patientId,
                        type: 'document',
                        title: 'Hasil Lab Baru',
                        message: `${toInsert.length} hasil lab baru telah tersedia. Klik untuk melihat.`,
                        link: '/hasil-lab.html',
                        icon: 'fa fa-flask',
                        icon_color: 'text-info'
                    });
                }

                // 7. Broadcast Socket.IO event for real-time refresh
                const realtimeSync = require('../../realtime-sync');
                realtimeSync.broadcast({
                    type: 'document:patient_updated',
                    patient_id: patientId,
                    mr_id: normalizedMrId,
                    document_type: 'lab_result',
                    added: toInsert.length,
                    removed: toDelete.length
                });

                if (toInsert.length > 0 || toDelete.length > 0) {
                    logger.info('Penunjang auto-published to patient portal', {
                        mrId: normalizedMrId, patientId,
                        added: toInsert.length, removed: toDelete.length
                    });
                }
            } catch (autoPublishError) {
                logger.warn('Penunjang auto-publish warning:', autoPublishError);
                // Don't fail the save
            }
        }

        logger.info('Saved section data for Sunday Clinic', {
            mrId: normalizedMrId,
            section,
            patientId: recordRow.patient_id,
            userId: req.user.id
        });

        const responsePayload = {
            success: true,
            message: `Data ${section} berhasil disimpan`
        };

        if (medifySyncResult) {
            responsePayload.sync = medifySyncResult;
        }

        res.json(responsePayload);
    } catch (error) {
        logger.error('Failed to save section data', {
            mrId: normalizedMrId,
            section,
            error: error.message
        });
        next(error);
    }
}

async function getRecordsByMrIdPrefillMedify(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const emptySections = {
        anamnesa: {},
        physical_exam: {},
        pemeriksaan_obstetri: {},
        usg: {},
        diagnosis: {},
        planning: {}
    };

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    try {
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        const medifyPrefillSourceByLocation = {
            rsia_melinda: 'medify_melinda',
            rsud_gambiran: 'medify_gambiran'
        };
        const medifySource = medifyPrefillSourceByLocation[recordRow.visit_location] || null;

        if (!medifySource) {
            return res.json({
                success: true,
                data: {
                    mrId: normalizedMrId,
                    source: null,
                    hasData: false,
                    hasIdentity: false,
                    identity: {},
                    simrsMedId: null,
                    reason: 'unsupported_location',
                    sections: emptySections
                }
            });
        }

        const [rows] = await db.query(
            `SELECT cppt_data, simrs_med_id, completed_at, created_at
             FROM medify_import_jobs
             WHERE patient_id = ?
               AND simrs_source = ?
               AND simrs_med_id IS NOT NULL
               AND status IN ('success', 'skipped')
             ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
             LIMIT 1`,
            [recordRow.patient_id, recordRow.visit_location]
        );

        if (!rows.length) {
            return res.json({
                success: true,
                data: {
                    mrId: normalizedMrId,
                    source: medifySource,
                    hasData: false,
                    hasIdentity: false,
                    identity: {},
                    simrsMedId: null,
                    sections: emptySections
                }
            });
        }

        const cachedCpptPayload = parseJson(rows[0].cppt_data, 'medify_prefill_cppt_data') || {};
        let cpptPayload = cachedCpptPayload;
        let livePrefillFetchedAt = rows[0].completed_at || rows[0].created_at || null;
        let identity = {};

        if (rows[0].simrs_med_id) {
            const medifySession = createSession(recordRow.visit_location);
            try {
                await medifySession.login();

                const liveCpptPayload = await medifySession.extractCPPT(rows[0].simrs_med_id);
                if (liveCpptPayload && !liveCpptPayload.skipReason && String(liveCpptPayload.rawText || '').trim()) {
                    cpptPayload = liveCpptPayload;
                    livePrefillFetchedAt = new Date().toISOString();

                    try {
                        await db.query(
                            `UPDATE medify_import_jobs
                             SET cppt_data = ?,
                                 status = 'success',
                                 error_message = NULL,
                                 completed_at = NOW()
                             WHERE patient_id = ?
                               AND simrs_source = ?
                               AND simrs_med_id = ?
                             ORDER BY COALESCE(completed_at, created_at) DESC, id DESC
                             LIMIT 1`,
                            [
                                JSON.stringify(liveCpptPayload),
                                recordRow.patient_id,
                                recordRow.visit_location,
                                rows[0].simrs_med_id
                            ]
                        );
                    } catch (updateCpptError) {
                        logger.warn('Failed to persist refreshed Medify CPPT payload for Sunday Clinic prefill', {
                            mrId: normalizedMrId,
                            patientId: recordRow.patient_id,
                            simrsMedId: rows[0].simrs_med_id,
                            visitLocation: recordRow.visit_location,
                            error: updateCpptError.message
                        });
                    }
                } else if (liveCpptPayload?.skipReason) {
                    logger.warn('Live Medify CPPT refresh skipped for Sunday Clinic prefill, falling back to cached payload', {
                        mrId: normalizedMrId,
                        patientId: recordRow.patient_id,
                        simrsMedId: rows[0].simrs_med_id,
                        visitLocation: recordRow.visit_location,
                        reason: liveCpptPayload.skipReason
                    });
                }

                const medifyIdentity = await medifySession.extractPatientIdentity(rows[0].simrs_med_id);
                identity = buildMedifyIdentityPrefill(medifyIdentity);
            } catch (medifyRefreshError) {
                logger.warn('Failed to refresh Medify CPPT/identity for Sunday Clinic prefill', {
                    mrId: normalizedMrId,
                    patientId: recordRow.patient_id,
                    simrsMedId: rows[0].simrs_med_id,
                    visitLocation: recordRow.visit_location,
                    error: medifyRefreshError.message
                });
            } finally {
                try {
                    await medifySession.close();
                } catch (closeError) {
                    logger.warn('Failed to close Medify session after Sunday Clinic prefill refresh', {
                        mrId: normalizedMrId,
                        simrsMedId: rows[0].simrs_med_id,
                        error: closeError.message
                    });
                }
            }
        }

        const structured = mergeStructuredCpptPayload(cpptPayload);

        const usiaKehamilanMinggu = structured.assessment?.usia_kehamilan_minggu;
        const usiaKehamilanHari = structured.assessment?.usia_kehamilan_hari;
        const usiaKehamilan = Number.isFinite(usiaKehamilanMinggu)
            ? `${usiaKehamilanMinggu} minggu${usiaKehamilanHari ? ` ${usiaKehamilanHari} hari` : ''}`
            : '';

        const anamnesa = {
            keluhan_utama: structured.subjective?.keluhan_utama || '',
            riwayat_kehamilan_saat_ini: structured.subjective?.rps || '',
            detail_riwayat_penyakit: structured.subjective?.rpd || '',
            riwayat_keluarga: structured.subjective?.rpk || '',
            hpht: convertLooseDateToIso(structured.subjective?.hpht),
            hpl: convertLooseDateToIso(structured.subjective?.hpl),
            usia_kehamilan: usiaKehamilan,
            gravida: structured.assessment?.gravida || '',
            para: structured.assessment?.para || '',
            abortus: structured.assessment?.abortus || '',
            anak_hidup: structured.assessment?.anak_hidup || ''
        };

        const physicalExam = {
            tensi: structured.objective?.tensi || '',
            td: structured.objective?.tensi || '',
            tekanan_darah: structured.objective?.tensi || '',
            nadi: structured.objective?.nadi || '',
            suhu: structured.objective?.suhu || '',
            rr: structured.objective?.rr || '',
            respirasi: structured.objective?.rr || '',
            bb: structured.objective?.berat_badan || '',
            berat_badan: structured.objective?.berat_badan || '',
            tb: structured.objective?.tinggi_badan || '',
            tinggi_badan: structured.objective?.tinggi_badan || ''
        };

        const pemeriksaanObstetri = {
            findings: [
                structured.objective?.lila ? `LILA: ${structured.objective.lila}` : '',
                structured.objective?.tfu ? `TFU: ${structured.objective.tfu}` : '',
                structured.objective?.djj ? `DJJ: ${structured.objective.djj}` : '',
                structured.objective?.vt ? `VT: ${structured.objective.vt}` : ''
            ].filter(Boolean).join('\n')
        };

        const usg = {
            hasil_usg: structured.objective?.usg || '',
            berat_janin: structured.objective?.berat_janin || '',
            presentasi: structured.objective?.presentasi || structured.assessment?.presentasi || '',
            plasenta: structured.objective?.plasenta || '',
            ketuban: structured.objective?.ketuban || ''
        };

        const diagnosis = {
            diagnosis_utama: structured.assessment?.diagnosis || '',
            diagnosis_sekunder: ''
        };

        const hasStructuredPlanParts = Boolean(
            (Array.isArray(structured.plan?.obat) && structured.plan.obat.length > 0)
            || (Array.isArray(structured.plan?.tindakan) && structured.plan.tindakan.length > 0)
            || (Array.isArray(structured.plan?.instruksi) && structured.plan.instruksi.length > 0)
        );

        const planning = {
            tindakan: Array.isArray(structured.plan?.tindakan)
                ? structured.plan.tindakan.join('\n')
                : (structured.plan?.tindakan || ''),
            terapi: Array.isArray(structured.plan?.obat)
                ? structured.plan.obat.join('\n')
                : (structured.plan?.obat || (!hasStructuredPlanParts ? (structured.plan?.raw || '') : '')),
            rencana: Array.isArray(structured.plan?.instruksi)
                ? structured.plan.instruksi.join('\n')
                : (structured.plan?.instruksi || '')
        };

        const hasSectionData = [anamnesa, physicalExam, pemeriksaanObstetri, usg, diagnosis, planning]
            .some(section => Object.values(section).some(value => String(value || '').trim() !== ''));
        const hasIdentity = Object.values(identity).some(value => String(value || '').trim() !== '');

        res.json({
            success: true,
            data: {
                mrId: normalizedMrId,
                source: medifySource,
                hasData: hasSectionData || hasIdentity,
                hasIdentity,
                simrsMedId: rows[0].simrs_med_id,
                fetchedAt: livePrefillFetchedAt,
                identity,
                sections: {
                    anamnesa,
                    physical_exam: physicalExam,
                    pemeriksaan_obstetri: pemeriksaanObstetri,
                    usg,
                    diagnosis,
                    planning
                }
            }
        });
    } catch (error) {
        logger.error('Failed to load Medify prefill data', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
}

async function getMedifySyncJobsByMrId(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    const limit = Number(req.query.limit || 20);

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid.'
        });
    }

    try {
        const jobs = await sundayClinicMedifySyncQueue.getJobsByMr(normalizedMrId, limit);
        res.json({
            success: true,
            data: {
                mrId: normalizedMrId,
                jobs
            }
        });
    } catch (error) {
        logger.error('Failed to load Medify sync jobs by MR', {
            mrId: normalizedMrId,
            error: error.message
        });
        next(error);
    }
}

async function getMedifySyncStats(req, res, next) {
    try {
        const stats = await sundayClinicMedifySyncQueue.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('Failed to load Medify sync stats', {
            error: error.message
        });
        next(error);
    }
}

async function deleteRecordsByMrId(req, res, next) {
    const { mrId } = req.params;

    try {
        logger.info(`[DELETE MR] Superadmin ${req.user.name} attempting to delete ${mrId}`);

        // First verify the record exists
        const [existing] = await db.query(
            'SELECT mr_id, patient_id, status FROM sunday_clinic_records WHERE mr_id = ?',
            [mrId]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Rekam medis ${mrId} tidak ditemukan`
            });
        }

        const record = existing[0];

        // Prevent deleting finalized/billed records unless forced
        if (record.status === 'finalized' || record.status === 'billed') {
            const forceDelete = req.query.force === 'true';
            if (!forceDelete) {
                return res.status(400).json({
                    success: false,
                    message: `Rekam medis ${mrId} sudah ${record.status}. Tambahkan ?force=true untuk tetap menghapus.`
                });
            }
        }

        // Start transaction for cleanup
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Delete additional billing items before their parent bills for explicit cleanup.
            await connection.query(
                `DELETE FROM sunday_clinic_additional_billing_items
                 WHERE additional_billing_id IN (
                    SELECT id FROM sunday_clinic_additional_billings WHERE mr_id = ?
                 )`,
                [mrId]
            );

            await connection.query(
                'DELETE FROM sunday_clinic_additional_billings WHERE mr_id = ?',
                [mrId]
            );

            // Delete related billing items first (if any)
            await connection.query(
                'DELETE FROM sunday_clinic_billing_items WHERE billing_id IN (SELECT id FROM sunday_clinic_billings WHERE mr_id = ?)',
                [mrId]
            );

            // Delete billing record
            await connection.query(
                'DELETE FROM sunday_clinic_billings WHERE mr_id = ?',
                [mrId]
            );

            // Delete medical records (JSON data)
            await connection.query(
                'DELETE FROM medical_records WHERE mr_id = ?',
                [mrId]
            );

            // Delete patient documents (optional - keep for audit?)
            // await connection.query(
            //     'DELETE FROM patient_documents WHERE mr_id = ?',
            //     [mrId]
            // );

            // Finally delete the main record
            await connection.query(
                'DELETE FROM sunday_clinic_records WHERE mr_id = ?',
                [mrId]
            );

            await connection.commit();

            logger.info(`[DELETE MR] Successfully deleted ${mrId} by ${req.user.name}`, {
                mrId,
                patientId: record.patient_id,
                deletedBy: req.user.id,
                deletedByName: req.user.name
            });

            res.json({
                success: true,
                message: `Rekam medis ${mrId} berhasil dihapus`
            });

        } catch (txError) {
            await connection.rollback();
            throw txError;
        } finally {
            connection.release();
        }

    } catch (error) {
        logger.error(`[DELETE MR] Error deleting ${mrId}:`, error);
        next(error);
    }
}

async function patchRecordsByIdCategory(req, res, next) {
    const recordId = req.params.id;
    const { category } = req.body;

    // Valid categories
    const validCategories = ['obstetri', 'gyn_repro', 'gyn_special'];

    if (!category || !validCategories.includes(category)) {
        return res.status(400).json({
            success: false,
            message: `Kategori tidak valid. Pilihan: ${validCategories.join(', ')}`
        });
    }

    try {
        // Check if record exists
        const [records] = await db.query(
            'SELECT id, mr_id, patient_id, mr_category FROM sunday_clinic_records WHERE id = ?',
            [recordId]
        );

        if (records.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Record tidak ditemukan'
            });
        }

        const record = records[0];
        const oldCategory = record.mr_category;

        // Update category
        await db.query(
            'UPDATE sunday_clinic_records SET mr_category = ?, updated_at = NOW() WHERE id = ?',
            [category, recordId]
        );

        // Log activity
        await activityLogger.log({
            userId: req.user.id,
            userName: req.user.name,
            action: 'update_mr_category',
            entityType: 'sunday_clinic_records',
            entityId: record.mr_id,
            details: {
                recordId,
                mrId: record.mr_id,
                patientId: record.patient_id,
                oldCategory,
                newCategory: category
            }
        });

        logger.info(`[UPDATE CATEGORY] ${record.mr_id} changed from ${oldCategory} to ${category} by ${req.user.name}`);

        res.json({
            success: true,
            message: `Kategori berhasil diubah ke ${category}`,
            data: {
                id: recordId,
                mr_id: record.mr_id,
                old_category: oldCategory,
                new_category: category
            }
        });

    } catch (error) {
        logger.error(`[UPDATE CATEGORY] Error updating record ${recordId}:`, error);
        next(error);
    }
}
module.exports = {
    getCheckExisting,
    getDirectory,
    getRecordsByMrId,
    postRecordsByMrIdBySection,
    getRecordsByMrIdPrefillMedify,
    getMedifySyncJobsByMrId,
    getMedifySyncStats,
    deleteRecordsByMrId,
    patchRecordsByIdCategory
};
