/**
 * Appointment Scheduler Service
 * Handles auto-confirm and auto-complete for appointments
 */

const cron = require('node-cron');
const db = require('../db');
const logger = require('../utils/logger');
const { validateSundayClinicSchema } = require('./SundayClinicSchemaValidator');

// Hospital locations that require auto-confirm after 2 hours
const AUTO_CONFIRM_LOCATIONS = [
    'klinik_private',
    'rsia_melinda',
    'rsud_gambiran',
    'rs_bhayangkara'
];

/**
 * Auto-confirm appointments after 2 hours for specific hospital locations
 * Runs every 15 minutes
 */
function startAutoConfirmScheduler() {
    // Run every 15 minutes: */15 * * * *
    cron.schedule('*/15 * * * *', async () => {
        try {
            logger.info('[Scheduler] Running auto-confirm job...');

            // Find appointments that are:
            // 1. Status = 'scheduled' (not yet confirmed)
            // 2. Hospital location in AUTO_CONFIRM_LOCATIONS
            // 3. Created more than 2 hours ago
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

            const [pendingAppointments] = await db.query(
                `SELECT id, patient_name, hospital_location, appointment_date, appointment_time, created_at
                 FROM appointments
                 WHERE status = 'scheduled'
                 AND hospital_location IN (?, ?, ?, ?)
                 AND created_at <= ?`,
                [...AUTO_CONFIRM_LOCATIONS, twoHoursAgo]
            );

            if (pendingAppointments.length === 0) {
                logger.info('[Scheduler] No appointments to auto-confirm');
                return;
            }

            // Update all eligible appointments to confirmed
            const appointmentIds = pendingAppointments.map(apt => apt.id);
            await db.query(
                `UPDATE appointments
                 SET status = 'confirmed', updated_at = NOW()
                 WHERE id IN (?)`,
                [appointmentIds]
            );

            logger.info(`[Scheduler] Auto-confirmed ${pendingAppointments.length} appointments`, {
                count: pendingAppointments.length,
                appointments: pendingAppointments.map(apt => ({
                    id: apt.id,
                    patient: apt.patient_name,
                    location: apt.hospital_location,
                    created_at: apt.created_at
                }))
            });

        } catch (error) {
            logger.error('[Scheduler] Error in auto-confirm job:', error);
        }
    });

    logger.info('[Scheduler] Auto-confirm scheduler started (runs every 15 minutes)');
}

/**
 * Auto-complete appointment when payment is marked as paid
 * This is called directly from the billing route, not scheduled
 */
async function autoCompleteOnPayment(appointmentId, billingNumber) {
    try {
        logger.info(`[Scheduler] Auto-completing appointment ${appointmentId} for billing ${billingNumber}`);

        // Update appointment status to completed
        const [result] = await db.query(
            `UPDATE appointments
             SET status = 'completed', updated_at = NOW()
             WHERE id = ? AND status != 'completed'`,
            [appointmentId]
        );

        if (result.affectedRows > 0) {
            logger.info(`[Scheduler] Appointment ${appointmentId} auto-completed successfully`);
            return { success: true, message: 'Appointment auto-completed' };
        } else {
            logger.warn(`[Scheduler] Appointment ${appointmentId} already completed or not found`);
            return { success: false, message: 'Appointment already completed or not found' };
        }

    } catch (error) {
        logger.error('[Scheduler] Error auto-completing appointment:', error);
        throw error;
    }
}

/**
 * Find appointment by patient ID and billing date
 * Used when we have billing info but not direct appointment ID
 */
async function findAndCompleteAppointmentByBilling(patientId, billingDate) {
    try {
        logger.info(`[Scheduler] Finding appointment for patient ${patientId} on ${billingDate}`);

        // Find the most recent appointment for this patient on this date
        const [appointments] = await db.query(
            `SELECT id, patient_name, appointment_date, status
             FROM appointments
             WHERE patient_id = ?
             AND appointment_date = ?
             AND status IN ('scheduled', 'confirmed')
             ORDER BY created_at DESC
             LIMIT 1`,
            [patientId, billingDate]
        );

        if (appointments.length === 0) {
            logger.warn(`[Scheduler] No matching appointment found for patient ${patientId} on ${billingDate}`);
            return { success: false, message: 'No matching appointment found' };
        }

        const appointment = appointments[0];
        return await autoCompleteOnPayment(appointment.id, 'N/A');

    } catch (error) {
        logger.error('[Scheduler] Error finding and completing appointment:', error);
        throw error;
    }
}

/**
 * Generate a unique 6-character alphanumeric code
 */
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed I, O, 0, 1 for clarity
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Auto-generate public registration code at midnight WIB
 * Runs daily at 00:00 WIB (server timezone is WIB)
 */
function startPublicCodeScheduler() {
    // Run at 00:00 WIB (midnight) - server uses WIB timezone
    cron.schedule('0 0 * * *', async () => {
        try {
            logger.info('[Scheduler] Running auto-generate public code job...');

            // Invalidate all previous public codes
            await db.query(
                `UPDATE registration_codes SET status = 'expired' WHERE is_public = 1 AND status = 'active'`
            );

            // Generate unique code
            let code;
            let isUnique = false;
            let attempts = 0;

            while (!isUnique && attempts < 10) {
                code = generateCode();
                const [existing] = await db.query(
                    'SELECT id FROM registration_codes WHERE code = ?',
                    [code]
                );
                if (existing.length === 0) {
                    isUnique = true;
                }
                attempts++;
            }

            if (!isUnique) {
                logger.error('[Scheduler] Failed to generate unique public code after 10 attempts');
                return;
            }

            // Set expiration to next midnight (00:00 WIB)
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 1); // Tomorrow
            expiresAt.setHours(0, 0, 0, 0); // Midnight

            // Insert public code
            await db.query(
                `INSERT INTO registration_codes (code, is_public, created_by, expires_at)
                 VALUES (?, 1, ?, ?)`,
                [code, 'system-scheduler', expiresAt]
            );

            logger.info('[Scheduler] Auto-generated public registration code', {
                code,
                expiresAt: expiresAt.toISOString()
            });

        } catch (error) {
            logger.error('[Scheduler] Error in auto-generate public code job:', error);
        }
    });

    logger.info('[Scheduler] Public code auto-generation scheduler started (runs daily at 00:00 WIB)');
}

/**
 * Manually trigger public code generation (for testing)
 */
async function generatePublicCodeNow() {
    try {
        logger.info('[Scheduler] Manual public code generation triggered...');

        // Invalidate all previous public codes
        await db.query(
            `UPDATE registration_codes SET status = 'expired' WHERE is_public = 1 AND status = 'active'`
        );

        // Generate unique code
        let code;
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            code = generateCode();
            const [existing] = await db.query(
                'SELECT id FROM registration_codes WHERE code = ?',
                [code]
            );
            if (existing.length === 0) {
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) {
            throw new Error('Failed to generate unique code');
        }

        // Set expiration to next midnight (00:00 WIB)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 1); // Tomorrow
        expiresAt.setHours(0, 0, 0, 0); // Midnight

        // Insert public code
        await db.query(
            `INSERT INTO registration_codes (code, is_public, created_by, expires_at)
             VALUES (?, 1, ?, ?)`,
            [code, 'system-scheduler', expiresAt]
        );

        logger.info('[Scheduler] Manual public code generated', { code, expiresAt });
        return { success: true, code, expiresAt };

    } catch (error) {
        logger.error('[Scheduler] Error in manual public code generation:', error);
        throw error;
    }
}

/**
 * Send daily surgery reminders at 21:00 WIB (9 PM)
 * Notifies about tomorrow's surgeries
 */
function startSurgeryReminderScheduler() {
    cron.schedule('0 21 * * *', async () => {
        try {
            logger.info('[Scheduler] Running daily surgery reminder job...');
            const docboardPush = require('./DocBoardPushService');
            const result = await docboardPush.sendDailyReminders();
            logger.info('[Scheduler] Surgery reminder job completed', result);
        } catch (error) {
            logger.error('[Scheduler] Error in surgery reminder job:', error);
        }
    });

    logger.info('[Scheduler] Surgery reminder scheduler started (runs daily at 21:00 WIB)');
}

/**
 * Cleanup old policy log entries daily at 03:00 WIB
 */
function startPolicyLogCleanupScheduler() {
    cron.schedule('0 3 * * *', async () => {
        try {
            logger.info('[Scheduler] Running policy log cleanup...');
            const commandCenter = require('./DocBoardCommandCenter');
            const result = await commandCenter.cleanupPolicyLog(false);
            await commandCenter.logCleanupAudit('system', 'policy_log', 'real', result);
            logger.info('[Scheduler] Policy log cleanup completed', result);
        } catch (error) {
            logger.error('[Scheduler] Policy log cleanup error:', error);
        }
    });

    logger.info('[Scheduler] Policy log cleanup scheduler started (runs daily at 03:00 WIB)');
}

/**
 * Cleanup old rule execution log entries daily at 03:15 WIB
 */
function startRuleExecCleanupScheduler() {
    cron.schedule('15 3 * * *', async () => {
        try {
            logger.info('[Scheduler] Running rule execution log cleanup...');
            const commandCenter = require('./DocBoardCommandCenter');
            const result = await commandCenter.cleanupRuleExecutions(false);
            await commandCenter.logCleanupAudit('system', 'rule_executions', 'real', result);
            logger.info('[Scheduler] Rule execution log cleanup completed', result);
        } catch (error) {
            logger.error('[Scheduler] Rule execution log cleanup error:', error);
        }
    });

    logger.info('[Scheduler] Rule execution log cleanup scheduler started (runs daily at 03:15 WIB)');
}

/**
 * Persist daily metrics snapshot at 23:55 WIB
 */
function startDailyMetricsScheduler() {
    cron.schedule('55 23 * * *', async () => {
        try {
            logger.info('[Scheduler] Persisting daily metrics...');
            const commandCenter = require('./DocBoardCommandCenter');
            const result = await commandCenter.persistDailyMetrics();
            logger.info('[Scheduler] Daily metrics persisted', result);
        } catch (error) {
            logger.error('[Scheduler] Daily metrics persist error:', error);
        }
    });

    logger.info('[Scheduler] Daily metrics scheduler started (runs daily at 23:55 WIB)');
}

/**
 * Ensure sunday_appointments schema has confirmation columns
 */
async function ensureSundayConfirmationSchema() {
    return validateSundayClinicSchema();
        // MariaDB/MySQL ENUM cannot be easily checked — safe to run ALTER even if value exists
            // Already has the value or different schema — non-fatal
}

/**
 * Saturday 18:00 WIB and Sunday 07:00 WIB — enable the in-app confirmation popup.
 */
function startSundayConfirmationSender() {
    async function enableSundayConfirmationPopup(targetDateSql, scheduleLabel) {
        try {
            logger.info(`[Scheduler] Enabling Sunday confirmation popup (${scheduleLabel})...`);

            const [result] = await db.query(
                `UPDATE sunday_appointments
                 SET confirmation_popup_enabled_at = COALESCE(confirmation_popup_enabled_at, NOW())
                 WHERE status = 'pending_confirmation'
                   AND appointment_date = ${targetDateSql}`
            );

            logger.info(`[Scheduler] Sunday confirmation popup enabled for ${result.affectedRows || 0} appointment(s)`);
        } catch (error) {
            logger.error('[Scheduler] Error enabling Sunday confirmation popup:', error);
        }
    }

    cron.schedule('0 18 * * 6', async () => {
        await enableSundayConfirmationPopup('DATE_ADD(CURDATE(), INTERVAL 1 DAY)', 'Saturday 18:00');
    }, { timezone: 'Asia/Jakarta' });

    cron.schedule('0 7 * * 0', async () => {
        await enableSundayConfirmationPopup('CURDATE()', 'Sunday 07:00');
    }, { timezone: 'Asia/Jakarta' });

    logger.info('[Scheduler] Sunday confirmation popup scheduler started (runs Saturdays at 18:00 and Sundays at 07:00 WIB)');
}

/**
 * Sunday 09:00 WIB — expire all unconfirmed pending_confirmation appointments
 */
function startSundayExpiryJob() {
    cron.schedule('0 9 * * 0', async () => {
        try {
            logger.info('[Scheduler] Running Sunday expiry job...');

            const [expiring] = await db.query(
                `SELECT id, patient_id, patient_name, session, slot_number
                 FROM sunday_appointments
                 WHERE status = 'pending_confirmation'
                   AND appointment_date = CURDATE()`
            );

            if (expiring.length === 0) {
                logger.info('[Scheduler] No appointments to expire');
                return;
            }

            const ids = expiring.map(a => a.id);
            await db.query(
                `UPDATE sunday_appointments
                 SET status = 'cancelled',
                     cancelled_by = 'system',
                     cancellation_reason = 'Tidak konfirmasi kehadiran sebelum jam 09.00 WIB',
                     cancelled_at = NOW()
                 WHERE id IN (?)`,
                [ids]
            );

            // Notify each patient
            try {
                const { createPatientNotification } = require('../routes/patient-notifications');
                for (const apt of expiring) {
                    try {
                        const sessionLabel = apt.session === 1 ? 'Pagi' :
                                            apt.session === 2 ? 'Siang' :
                                            apt.session === 3 ? 'Sore' : `Sesi ${apt.session}`;
                        await createPatientNotification({
                            patient_id: apt.patient_id,
                            type: 'appointment',
                            title: 'Jadwal Hangus — Tidak Ada Konfirmasi',
                            message: `Slot Anda (${sessionLabel}, nomor ${apt.slot_number}) hangus karena tidak ada konfirmasi kehadiran sebelum jam 09.00 WIB. Slot telah dibuka kembali untuk pasien lain.`,
                            link: '/riwayat-kunjungan.html',
                            icon: 'fa fa-times-circle',
                            icon_color: 'text-danger'
                        });
                    } catch (e) {
                        logger.warn('[Scheduler] Failed to notify expired patient:', e.message);
                    }
                }
            } catch (notifErr) {
                logger.warn('[Scheduler] Failed to load notification module:', notifErr.message);
            }

            // Broadcast to staff that slots are now open
            try {
                const realtimeSync = require('../realtime-sync');
                realtimeSync.broadcastToStaff('booking:slots_released', {
                    count: ids.length,
                    reason: 'Sunday expiry job'
                });
            } catch (rtErr) {
                logger.warn('[Scheduler] Failed to broadcast slot release:', rtErr.message);
            }

            logger.info(`[Scheduler] Sunday expiry job: ${ids.length} appointments cancelled`);
        } catch (error) {
            logger.error('[Scheduler] Error in Sunday expiry job:', error);
        }
    }, { timezone: 'Asia/Jakarta' });

    logger.info('[Scheduler] Sunday expiry job started (runs Sundays at 09:00 WIB)');
}

/**
 * Seed the attendance confirmation announcement (runs once, idempotent)
 */
async function ensureAttendanceAnnouncementSeeded() {
    try {
        const TITLE = 'Konfirmasi Kehadiran Wajib untuk Jadwal Minggu';
        const [existing] = await db.query(
            'SELECT id FROM announcements WHERE title = ? LIMIT 1',
            [TITLE]
        );
        if (existing.length > 0) return;

        await db.query(
            `INSERT INTO announcements (title, message, created_by, created_by_name, priority, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                TITLE,
                'Mulai sekarang, dikarenakan sering terjadi blocking jadwal namun pasien tidak dapat hadir, setiap jadwal praktek hari Minggu memerlukan konfirmasi kehadiran melalui popup di aplikasi.\n\nCara konfirmasi:\n- Buka aplikasi setelah popup konfirmasi aktif\n- Popup diaktifkan Sabtu pukul 18.00 WIB dan diperbarui lagi Minggu pukul 07.00 WIB\n- Pilih "Datang" jika akan hadir\n- Pilih "Batal" jika tidak dapat hadir\n\nBatas waktu konfirmasi: pukul 09.00 WIB hari Minggu.\n\nJika belum konfirmasi hingga pukul 09.00, slot akan hangus otomatis dan dibuka untuk pasien lain.\n\nTerima kasih atas pengertiannya.',
                'system',
                'dr. Dibya Arfianda, SpOG, M.Ked.Klin.',
                'important',
                'active'
            ]
        );
        logger.info('[Scheduler] Attendance confirmation announcement seeded');
    } catch (err) {
        logger.warn('[Scheduler] Could not seed announcement:', err.message);
    }
}

/**
 * Initialize all schedulers
 */
function initSchedulers() {
    logger.info('[Scheduler] Initializing appointment schedulers...');
    startAutoConfirmScheduler();
    startPublicCodeScheduler();
    startSurgeryReminderScheduler();
    startPolicyLogCleanupScheduler();
    startRuleExecCleanupScheduler();
    startDailyMetricsScheduler();
    startSundayConfirmationSender();
    startSundayExpiryJob();

    // Run async migrations + seed (non-blocking)
    ensureSundayConfirmationSchema().catch(err =>
        logger.error('[Scheduler] Schema migration failed:', err)
    );
    ensureAttendanceAnnouncementSeeded().catch(err =>
        logger.error('[Scheduler] Announcement seed failed:', err)
    );

    logger.info('[Scheduler] All appointment schedulers initialized');
}

module.exports = {
    initSchedulers,
    autoCompleteOnPayment,
    findAndCompleteAppointmentByBilling,
    generatePublicCodeNow,
    AUTO_CONFIRM_LOCATIONS
};
