/**
 * Appointment Reminder Service
 * Sends WhatsApp reminders to patients:
 * - H-1 (1 day before appointment)
 * - 2 hours before appointment
 */

const db = require('../db');
const logger = require('../utils/logger');
const notificationService = require('../utils/notification');

// Session times for each session
const SESSION_TIMES = {
    1: '08:00', // Pagi
    2: '13:00', // Siang
    3: '17:00'  // Sore
};

const SESSION_LABELS = {
    1: 'Pagi (08:00 - 12:00)',
    2: 'Siang (13:00 - 16:00)',
    3: 'Sore (17:00 - 20:00)'
};

/**
 * Format date to Indonesian locale
 */
function formatDateIndonesian(date) {
    return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Generate reminder message
 */
function generateReminderMessage(appointment, type) {
    const date = formatDateIndonesian(new Date(appointment.appointment_date));
    const sessionLabel = SESSION_LABELS[appointment.session] || `Sesi ${appointment.session}`;
    const clinicName = process.env.CLINIC_NAME || 'Klinik dr. Dibya, SpOG';

    if (type === 'h1') {
        return `Halo ${appointment.patient_name},

Ini adalah pengingat bahwa Anda memiliki janji temu *BESOK*:

Tanggal: ${date}
Sesi: ${sessionLabel}
Keluhan: ${appointment.chief_complaint || '-'}

Mohon datang 15 menit sebelum waktu yang dijadwalkan.

Jika ingin membatalkan atau mengubah jadwal, silakan hubungi kami.

Terima kasih,
${clinicName}`;
    } else {
        return `Halo ${appointment.patient_name},

Pengingat: Janji temu Anda akan dimulai dalam *2 JAM*:

Tanggal: Hari Ini
Sesi: ${sessionLabel}
Keluhan: ${appointment.chief_complaint || '-'}

Mohon segera bersiap dan datang ke klinik.

Terima kasih,
${clinicName}`;
    }
}

/**
 * Send H-1 reminders (appointments tomorrow)
 */
async function sendH1Reminders() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    logger.info(`[Reminder] Checking H-1 reminders for ${tomorrowStr}`);

    try {
        // Get appointments for tomorrow that haven't been reminded yet
        const [appointments] = await db.query(`
            SELECT id, patient_id, patient_name, patient_phone,
                   appointment_date, session, chief_complaint
            FROM sunday_appointments
            WHERE appointment_date = ?
              AND status = 'confirmed'
              AND reminder_h1_sent_at IS NULL
              AND patient_phone IS NOT NULL
        `, [tomorrowStr]);

        logger.info(`[Reminder] Found ${appointments.length} appointments for H-1 reminder`);

        let successCount = 0;
        let failCount = 0;

        for (const apt of appointments) {
            try {
                const message = generateReminderMessage(apt, 'h1');
                const result = await notificationService.sendWhatsAppAuto(apt.patient_phone, message);

                if (result.success) {
                    // Mark as sent
                    await db.query(
                        'UPDATE sunday_appointments SET reminder_h1_sent_at = NOW() WHERE id = ?',
                        [apt.id]
                    );
                    successCount++;
                    logger.info(`[Reminder] H-1 sent to ${apt.patient_name} (${apt.patient_phone})`);
                } else {
                    failCount++;
                    logger.error(`[Reminder] H-1 failed for ${apt.patient_name}: ${result.error}`);
                }

                // Add small delay between messages to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                failCount++;
                logger.error(`[Reminder] H-1 error for ${apt.patient_name}:`, error);
            }
        }

        return { type: 'h1', total: appointments.length, success: successCount, failed: failCount };
    } catch (error) {
        logger.error('[Reminder] Error sending H-1 reminders:', error);
        throw error;
    }
}

/**
 * Send 2-hour reminders (appointments starting in ~2 hours)
 */
async function send2HourReminders() {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    logger.info(`[Reminder] Checking 2-hour reminders for ${todayStr} at ${currentHour}:${currentMinute}`);

    // Determine which session is starting in about 2 hours
    let targetSession = null;

    // Session 1 (08:00) - remind at 06:00
    if (currentHour >= 5 && currentHour < 7) targetSession = 1;
    // Session 2 (13:00) - remind at 11:00
    else if (currentHour >= 10 && currentHour < 12) targetSession = 2;
    // Session 3 (17:00) - remind at 15:00
    else if (currentHour >= 14 && currentHour < 16) targetSession = 3;

    if (!targetSession) {
        logger.info('[Reminder] No session starting in ~2 hours');
        return { type: '2h', total: 0, success: 0, failed: 0 };
    }

    try {
        // Get today's appointments for this session that haven't been 2h reminded
        const [appointments] = await db.query(`
            SELECT id, patient_id, patient_name, patient_phone,
                   appointment_date, session, chief_complaint
            FROM sunday_appointments
            WHERE appointment_date = ?
              AND session = ?
              AND status = 'confirmed'
              AND reminder_2h_sent_at IS NULL
              AND patient_phone IS NOT NULL
        `, [todayStr, targetSession]);

        logger.info(`[Reminder] Found ${appointments.length} appointments for 2-hour reminder (session ${targetSession})`);

        let successCount = 0;
        let failCount = 0;

        for (const apt of appointments) {
            try {
                const message = generateReminderMessage(apt, '2h');
                const result = await notificationService.sendWhatsAppAuto(apt.patient_phone, message);

                if (result.success) {
                    // Mark as sent
                    await db.query(
                        'UPDATE sunday_appointments SET reminder_2h_sent_at = NOW() WHERE id = ?',
                        [apt.id]
                    );
                    successCount++;
                    logger.info(`[Reminder] 2h sent to ${apt.patient_name} (${apt.patient_phone})`);
                } else {
                    failCount++;
                    logger.error(`[Reminder] 2h failed for ${apt.patient_name}: ${result.error}`);
                }

                // Add small delay
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                failCount++;
                logger.error(`[Reminder] 2h error for ${apt.patient_name}:`, error);
            }
        }

        return { type: '2h', total: appointments.length, success: successCount, failed: failCount };
    } catch (error) {
        logger.error('[Reminder] Error sending 2-hour reminders:', error);
        throw error;
    }
}

/**
 * Run all reminders
 */
async function runAllReminders() {
    logger.info('[Reminder] Starting reminder job...');

    const results = {
        timestamp: new Date().toISOString(),
        h1: null,
        twoHour: null
    };

    try {
        results.h1 = await sendH1Reminders();
    } catch (error) {
        results.h1 = { error: error.message };
    }

    try {
        results.twoHour = await send2HourReminders();
    } catch (error) {
        results.twoHour = { error: error.message };
    }

    logger.info('[Reminder] Job completed:', JSON.stringify(results));
    return results;
}

module.exports = {
    sendH1Reminders,
    send2HourReminders,
    runAllReminders
};
