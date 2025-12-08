/**
 * Appointment Scheduler Service
 * Handles auto-confirm and auto-complete for appointments
 */

const cron = require('node-cron');
const db = require('../db');
const logger = require('../utils/logger');

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
 * Runs daily at 00:00 WIB (17:00 UTC)
 */
function startPublicCodeScheduler() {
    // Run at 17:00 UTC = 00:00 WIB (midnight)
    cron.schedule('0 17 * * *', async () => {
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

            // Set expiration to 24 hours from now
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);

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

        // Set expiration to 24 hours from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

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
 * Initialize all schedulers
 */
function initSchedulers() {
    logger.info('[Scheduler] Initializing appointment schedulers...');
    startAutoConfirmScheduler();
    startPublicCodeScheduler();
    logger.info('[Scheduler] All appointment schedulers initialized');
}

module.exports = {
    initSchedulers,
    autoCompleteOnPayment,
    findAndCompleteAppointmentByBilling,
    generatePublicCodeNow,
    AUTO_CONFIRM_LOCATIONS
};
