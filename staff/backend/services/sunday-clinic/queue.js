'use strict';

const {
    db,
    logger,
    normalizeMrId,
    createPatientNotification,
    realtimeSync,
    getSessionLabel,
    getSlotTime,
    getGmt7DayWindow,
    summarizeMedifySyncStatus,
    QUEUE_CACHE_TTL_MS,
    queueTodayCache
} = require('./shared');

// ==================== CHECK EXISTING RECORD ====================


// ==================== PATIENT PORTAL - PUBLIC QUEUE ====================

/**
 * Mask a patient name for privacy: first letter + ***
 */
function maskPatientName(name) {
    if (!name) return 'Pasien';
    const trimmed = name.trim();
    return trimmed.charAt(0).toUpperCase() + '***';
}

/**
 * Compute a simplified queue status for patient-facing display.
 * Prefers the explicit queue_status column when available.
 */
function computeQueueStatus(apt) {
    // Use explicit 5-stage status if present
    if (apt.queue_status && apt.queue_status !== 'menunggu') return apt.queue_status;
    // Fallback to legacy 3-stage logic for old records without queue_status
    if (apt.status === 'completed') return 'selesai_periksa';
    if (apt.record_status === 'completed') return 'selesai_periksa';
    if (apt.mr_id) return 'anamnesa';
    return 'menunggu';
}

function isQueueClosedStatus(status) {
    return status === 'selesai_periksa' || status === 'lunas' || status === 'selesai';
}

async function loadTodayQueueForReminderChecks() {
    const { dateStr: todayStr, startDateTime: todayStart, endDateTime: tomorrowStart } = getGmt7DayWindow();
    const [rows] = await db.query(
        `SELECT
            sa.patient_id,
            sa.appointment_date,
            sa.session,
            sa.slot_number,
            COALESCE(scr1.queue_status, scr2.queue_status) as queue_status
         FROM sunday_appointments sa
         LEFT JOIN sunday_clinic_records scr1
                        ON scr1.id = (
                                SELECT scrx.id
                                FROM sunday_clinic_records scrx
                                WHERE scrx.appointment_id = sa.id
                                ORDER BY scrx.created_at DESC, scrx.id DESC
                                LIMIT 1
                        )
         LEFT JOIN sunday_clinic_records scr2
                        ON scr2.id = (
                                SELECT scry.id
                                FROM sunday_clinic_records scry
                                WHERE scry.patient_id = sa.patient_id
                                  AND scry.appointment_id IS NULL
                                  AND scry.created_at >= ?
                                  AND scry.created_at < ?
                                ORDER BY scry.created_at DESC, scry.id DESC
                                LIMIT 1
                        )
         WHERE sa.appointment_date = ?
           AND sa.status IN ('pending_confirmation', 'confirmed', 'completed')
         ORDER BY sa.session ASC, sa.slot_number ASC`,
        [todayStart, tomorrowStart, todayStr]
    );

    return {
        dateStr: todayStr,
        queue: rows.map((row) => ({
            patient_id: row.patient_id,
            appointment_date: row.appointment_date,
            session: Number(row.session),
            slot_number: Number(row.slot_number),
            queue_status: row.queue_status || 'menunggu'
        }))
    };
}

async function processQueueReminderNotifications() {
    try {
        if (!createPatientNotification || !patientNotifications.listActiveQueueReminderSettings) {
            return;
        }

        const { dateStr, queue } = await loadTodayQueueForReminderChecks();
        if (!Array.isArray(queue) || queue.length === 0) {
            return;
        }

        const patientIds = queue.map((item) => item.patient_id).filter(Boolean);
        const settingsRows = await patientNotifications.listActiveQueueReminderSettings(patientIds);

        if (!settingsRows.length) {
            return;
        }

        for (const settings of settingsRows) {
            const patientQueueItem = queue.find((item) => item.patient_id === settings.patient_id);
            if (!patientQueueItem) {
                continue;
            }

            if (patientQueueItem.queue_status === 'diperiksa' || isQueueClosedStatus(patientQueueItem.queue_status)) {
                continue;
            }

            const aheadCount = queue.filter((item) => (
                Number(item.session) === Number(patientQueueItem.session)
                && Number(item.slot_number) < Number(patientQueueItem.slot_number)
                && !isQueueClosedStatus(item.queue_status)
            )).length;

            if (aheadCount > Number(settings.threshold_ahead || 2)) {
                continue;
            }

            const signature = `${dateStr}|${patientQueueItem.session}|${patientQueueItem.slot_number}`;
            if (settings.last_notified_signature === signature) {
                continue;
            }

            const message = aheadCount <= 0
                ? `Nomor antrian Anda di sesi ${patientQueueItem.session} sudah hampir diperiksa. Silakan segera bersiap.`
                : `Tinggal ${aheadCount} pasien lagi sebelum nomor antrian Anda di sesi ${patientQueueItem.session}. Silakan bersiap.`;

            const notification = await createPatientNotification({
                patient_id: settings.patient_id,
                type: 'queue_reminder',
                title: 'Antrian Anda Sudah Dekat',
                message,
                link: '/antrian.html',
                icon: 'fa fa-bell',
                icon_color: 'text-warning'
            });

            if (notification && notification.success) {
                await patientNotifications.markQueueReminderTriggered(settings.patient_id, signature);
            }
        }
    } catch (error) {
        logger.warn('processQueueReminderNotifications failed', { error: error.message });
    }
}

/**
 * Update queue_status for a record, invalidate cache, and broadcast to clients.
 * Only upgrades status (will not downgrade).
 */
const QUEUE_STATUS_ORDER = ['menunggu', 'anamnesa', 'diperiksa', 'selesai_periksa', 'lunas'];
async function updateQueueStatus(mrId, newStatus) {
    if (!QUEUE_STATUS_ORDER.includes(newStatus)) return;
    try {
        const currentIdx = QUEUE_STATUS_ORDER.indexOf(newStatus);
        // Only upgrade
        await db.query(
            `UPDATE sunday_clinic_records
             SET queue_status = ?
             WHERE mr_id = ?
               AND FIELD(queue_status, ${QUEUE_STATUS_ORDER.map(() => '?').join(',')}) < ?`,
            [newStatus, mrId, ...QUEUE_STATUS_ORDER, currentIdx + 1]
        );
        // If diperiksa, also stamp exam start time
        if (newStatus === 'diperiksa') {
            await db.query(
                `UPDATE sunday_clinic_records
                 SET exam_started_at = COALESCE(exam_started_at, NOW())
                 WHERE mr_id = ?`,
                [mrId]
            );
        }
        // Invalidate queue cache
        queueTodayCache.expiresAt = 0;
        // Broadcast via socket.io
        const { dateStr: todayStr } = getGmt7DayWindow();
        if (realtimeSync && realtimeSync.broadcast) {
            realtimeSync.broadcast({
                type: 'queue:updated',
                date: todayStr,
                mrId,
                status: newStatus
            });
        }
        processQueueReminderNotifications().catch((error) => {
            logger.warn('Queue reminder background process failed', {
                mrId,
                newStatus,
                error: error.message
            });
        });
        logger.info(`Queue status updated: ${mrId} -> ${newStatus}`);
    } catch (err) {
        logger.warn('updateQueueStatus failed', { mrId, newStatus, error: err.message });
    }
}

// ==================== QUEUE SETTINGS ====================

/**
 * GET /api/sunday-clinic/queue/settings
 * Returns is_queue_visible flag. No auth required (patients need this).
 */


async function getQueueToday(req, res, next) {
    try {
        const { dateStr: todayStr, startDateTime: todayStart, endDateTime: tomorrowStart } = getGmt7DayWindow();
        const forceRefresh = req.query.refresh === '1';

        if (!forceRefresh && queueTodayCache.key === todayStr && queueTodayCache.expiresAt > Date.now() && queueTodayCache.payload) {
            return res.json(queueTodayCache.payload);
        }

        // Join by appointment_id first, then fallback to patient_id + today's date
        // This handles cases where record was created without appointment_id link
        const [appointments] = await db.query(
            `SELECT
                sa.id,
                sa.patient_id,
                sa.patient_name,
                sa.patient_phone,
                sa.appointment_date,
                sa.session,
                sa.slot_number,
                sa.chief_complaint,
                sa.consultation_category,
                sa.status,
                COALESCE(scr1.mr_id, scr2.mr_id) as mr_id,
                COALESCE(scr1.mr_category, scr2.mr_category) as mr_category,
                     COALESCE(scr1.visit_location, scr2.visit_location) as visit_location,
                COALESCE(scr1.status, scr2.status) as record_status,
                COALESCE(scr1.queue_status, scr2.queue_status) as queue_status,
                COALESCE(scr1.exam_started_at, scr2.exam_started_at) as exam_started_at
             FROM sunday_appointments sa
             LEFT JOIN sunday_clinic_records scr1
                                ON scr1.id = (
                                        SELECT scrx.id
                                        FROM sunday_clinic_records scrx
                                        WHERE scrx.appointment_id = sa.id
                                        ORDER BY scrx.created_at DESC, scrx.id DESC
                                        LIMIT 1
                                )
             LEFT JOIN sunday_clinic_records scr2
                                ON scr2.id = (
                                        SELECT scry.id
                                        FROM sunday_clinic_records scry
                                        WHERE scry.patient_id = sa.patient_id
                                            AND scry.appointment_id IS NULL
                                            AND scry.created_at >= ?
                                            AND scry.created_at < ?
                                        ORDER BY scry.created_at DESC, scry.id DESC
                                        LIMIT 1
                                )
             WHERE sa.appointment_date = ?
               AND sa.status IN ('pending_confirmation', 'confirmed', 'completed')
             ORDER BY sa.session ASC, sa.slot_number ASC`,
                        [todayStart, tomorrowStart, todayStr]
        );

        const mrIds = appointments
            .map(apt => normalizeMrId(apt.mr_id))
            .filter(Boolean);

        const medifySyncByMrId = new Map();

        if (mrIds.length > 0) {
            try {
                const placeholders = mrIds.map(() => '?').join(',');
                const [syncRows] = await db.query(
                    `SELECT mr_id, status, updated_at
                     FROM sunday_clinic_medify_sync_jobs
                     WHERE mr_id IN (${placeholders})`,
                    mrIds
                );

                for (const row of syncRows) {
                    const normalizedMrId = normalizeMrId(row.mr_id);
                    if (!normalizedMrId) {
                        continue;
                    }

                    if (!medifySyncByMrId.has(normalizedMrId)) {
                        medifySyncByMrId.set(normalizedMrId, []);
                    }

                    medifySyncByMrId.get(normalizedMrId).push(row);
                }
            } catch (syncError) {
                if (syncError.code !== 'ER_NO_SUCH_TABLE') {
                    throw syncError;
                }

                logger.warn('Medify sync table not ready while loading queue', {
                    error: syncError.message
                });
            }
        }

        // Enrich with session labels and slot times
        const enriched = appointments.map(apt => ({
            id: apt.id,
            patient_id: apt.patient_id,
            patient_name: apt.patient_name,
            patient_phone: apt.patient_phone,
            appointment_date: apt.appointment_date,
            session: apt.session,
            session_label: getSessionLabel(apt.session),
            slot_number: apt.slot_number,
            slot_time: getSlotTime(apt.session, apt.slot_number),
            chief_complaint: apt.chief_complaint,
            consultation_category: apt.consultation_category,
            status: apt.status,
            mr_id: apt.mr_id || null,
            mr_category: apt.mr_category || null,
            visit_location: apt.visit_location || null,
            record_status: apt.record_status || null,
            queue_status: apt.queue_status || 'menunggu',
            exam_started_at: apt.exam_started_at || null,
            has_record: !!apt.mr_id,
            medify_sync: apt.visit_location === 'rsia_melinda' && apt.mr_id
                ? summarizeMedifySyncStatus(medifySyncByMrId.get(normalizeMrId(apt.mr_id)) || [])
                : null
        }));

        const payload = {
            success: true,
            date: todayStr,
            count: enriched.length,
            data: enriched
        };

        queueTodayCache.key = todayStr;
        queueTodayCache.expiresAt = Date.now() + QUEUE_CACHE_TTL_MS;
        queueTodayCache.payload = payload;

        res.json(payload);

    } catch (error) {
        logger.error('Error fetching today queue:', error);
        next(error);
    }
}

async function getQueueSettings(req, res, next) {
    try {
        const [[row]] = await db.query(
            'SELECT is_queue_visible, doctor_arrived, queue_label FROM clinic_queue_settings WHERE id = 1'
        );
        res.json({
            success: true,
            is_queue_visible: row ? Boolean(row.is_queue_visible) : false,
            doctor_arrived: row ? Boolean(row.doctor_arrived) : false,
            queue_label: row?.queue_label || 'Klinik Privat Dr. Dibya'
        });
    } catch (error) {
        logger.error('Error fetching queue settings:', error);
        next(error);
    }
}

async function putQueueSettings(req, res, next) {
    try {
        const { is_queue_visible, doctor_arrived } = req.body;

        // Always read current values first so each toggle is independent
        const [[currentSettings]] = await db.query(
            'SELECT is_queue_visible, doctor_arrived FROM clinic_queue_settings WHERE id = 1 LIMIT 1'
        );
        const curVisible = currentSettings ? Number(currentSettings.is_queue_visible) : 0;
        const curArrived = currentSettings ? Number(currentSettings.doctor_arrived) : 0;

        let visible;
        let doctorArrived;

        if (typeof is_queue_visible === 'boolean' || is_queue_visible === 0 || is_queue_visible === 1) {
            // Explicit value provided for queue visibility
            visible = is_queue_visible ? 1 : 0;
        } else if (typeof doctor_arrived !== 'undefined') {
            // Only doctor_arrived is being updated — preserve queue visibility as-is
            visible = curVisible;
        } else {
            // Empty body: toggle queue visibility
            visible = curVisible === 1 ? 0 : 1;
        }

        if (typeof doctor_arrived === 'boolean' || doctor_arrived === 0 || doctor_arrived === 1) {
            doctorArrived = doctor_arrived ? 1 : 0;
        } else {
            // Preserve current doctor_arrived when not explicitly provided
            doctorArrived = curArrived;
        }

        await db.query(
            'UPDATE clinic_queue_settings SET is_queue_visible = ?, doctor_arrived = ? WHERE id = 1',
            [visible, doctorArrived]
        );
        // Broadcast setting change to patient portal
        if (realtimeSync && realtimeSync.broadcast) {
            realtimeSync.broadcast({
                type: 'queue:settings_changed',
                is_queue_visible: Boolean(visible),
                doctor_arrived: Boolean(doctorArrived)
            });
        }
        res.json({
            success: true,
            is_queue_visible: Boolean(visible),
            doctor_arrived: Boolean(doctorArrived)
        });
    } catch (error) {
        logger.error('Error updating queue settings:', error);
        next(error);
    }
}

async function putRecordsByMrIdQueueStatus(req, res, next) {
    const normalizedMrId = normalizeMrId(req.params.mrId);
    if (!normalizedMrId) {
        return res.status(400).json({ success: false, message: 'MR ID tidak valid' });
    }
    const { status } = req.body;
    if (!QUEUE_STATUS_ORDER.includes(status)) {
        return res.status(400).json({
            success: false,
            message: `Status tidak valid. Gunakan: ${QUEUE_STATUS_ORDER.join(', ')}`
        });
    }
    try {
        await updateQueueStatus(normalizedMrId, status);
        const [[row]] = await db.query(
            'SELECT queue_status, exam_started_at FROM sunday_clinic_records WHERE mr_id = ?',
            [normalizedMrId]
        );
        res.json({
            success: true,
            mr_id: normalizedMrId,
            queue_status: row?.queue_status || status,
            exam_started_at: row?.exam_started_at || null
        });
    } catch (error) {
        logger.error('Error updating queue status:', error);
        next(error);
    }
}

async function getQueuePublic(req, res, next) {
    try {
        const { dateStr: todayStr, startDateTime: todayStart, endDateTime: tomorrowStart } = getGmt7DayWindow();
        const patientId = req.user?.id;

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const [[activeBooking]] = await db.query(
            `SELECT id, appointment_date, session, slot_number, status
             FROM sunday_appointments
             WHERE patient_id = ?
               AND appointment_date = ?
                    AND status IN ('pending', 'pending_confirmation', 'confirmed', 'completed')
             ORDER BY CASE status
                WHEN 'confirmed' THEN 1
                WHEN 'pending_confirmation' THEN 2
                     WHEN 'pending' THEN 3
                     WHEN 'completed' THEN 4
                ELSE 5
             END, session ASC, slot_number ASC
             LIMIT 1`,
            [patientId, todayStr]
        );

        if (!activeBooking) {
            return res.status(403).json({
                success: false,
                code: 'QUEUE_ACCESS_DENIED',
                message: 'Live queue hanya dapat dilihat oleh pasien yang sudah mendaftar antrian hari ini.'
            });
        }

        // Reuse existing staff queue cache if available (same data, just masked)
        if (queueTodayCache.key === todayStr && queueTodayCache.expiresAt > Date.now() && queueTodayCache.payload) {
            const publicData = queueTodayCache.payload.data.map((apt, index) => ({
                queue_position: index + 1,
                session: apt.session,
                session_label: apt.session_label,
                slot_number: apt.slot_number,
                slot_time: apt.slot_time,
                masked_name: maskPatientName(apt.patient_name),
                queue_status: computeQueueStatus(apt),
                appointment_date: todayStr
            }));
            return res.json({ success: true, date: todayStr, count: publicData.length, my_booking: activeBooking, data: publicData });
        }

        // Fetch fresh data when cache is empty
        const [rows] = await db.query(
            `SELECT
                sa.session,
                sa.slot_number,
                sa.patient_name,
                sa.status,
                COALESCE(scr1.mr_id, scr2.mr_id) as mr_id,
                COALESCE(scr1.status, scr2.status) as record_status,
                COALESCE(scr1.queue_status, scr2.queue_status) as queue_status
             FROM sunday_appointments sa
             LEFT JOIN sunday_clinic_records scr1
                ON scr1.id = (
                    SELECT scrx.id FROM sunday_clinic_records scrx
                    WHERE scrx.appointment_id = sa.id
                    ORDER BY scrx.created_at DESC, scrx.id DESC LIMIT 1
                )
             LEFT JOIN sunday_clinic_records scr2
                ON scr2.id = (
                    SELECT scry.id FROM sunday_clinic_records scry
                    WHERE scry.patient_id = sa.patient_id
                      AND scry.appointment_id IS NULL
                      AND scry.created_at >= ? AND scry.created_at < ?
                    ORDER BY scry.created_at DESC, scry.id DESC LIMIT 1
                )
             WHERE sa.appointment_date = ?
               AND sa.status IN ('pending', 'pending_confirmation', 'confirmed', 'completed')
             ORDER BY sa.session ASC, sa.slot_number ASC`,
            [todayStart, tomorrowStart, todayStr]
        );

        const publicData = rows.map((apt, index) => ({
            queue_position: index + 1,
            session: apt.session,
            session_label: getSessionLabel(apt.session),
            slot_number: apt.slot_number,
            slot_time: getSlotTime(apt.session, apt.slot_number),
            masked_name: maskPatientName(apt.patient_name),
            queue_status: computeQueueStatus(apt),
            appointment_date: todayStr
        }));

        res.json({ success: true, date: todayStr, count: publicData.length, my_booking: activeBooking, data: publicData });

    } catch (error) {
        logger.error('Error fetching public queue:', error);
        next(error);
    }
}

function setupSocketHandlers() {
    logger.info('Setting up Socket.io handlers for Sunday Clinic billing');
}

module.exports = {
    getQueueToday,
    getQueueSettings,
    putQueueSettings,
    putRecordsByMrIdQueueStatus,
    getQueuePublic,
    setupSocketHandlers
};
