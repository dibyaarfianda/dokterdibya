const DibyaDateTime = require('../../../public/scripts/date-time-format.js');
const { formatDateLocal } = require('../utils/date');

const DATE_FORMAT = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
const SEND_INTERVAL_MS = 1000;

// Copied from appointmentScheduler.js (not imported, to avoid a circular dependency).
const NOT_DISABLED_PRACTICE_DATE_SQL = `NOT EXISTS (
                       SELECT 1 FROM disabled_practice_dates dpd
                       WHERE dpd.disabled_date = sunday_appointments.appointment_date
                         AND (dpd.location IS NULL OR dpd.location = 'klinik_privat'))`;

function janjiSql(statusClause) {
    return `SELECT id, patient_id, patient_name, patient_phone, session, slot_number, appointment_date
            FROM sunday_appointments
            WHERE appointment_date = ?
              AND ${statusClause}
              AND patient_phone IS NOT NULL AND patient_phone <> ''
              AND ${NOT_DISABLED_PRACTICE_DATE_SQL}
            ORDER BY id`;
}

const JANJI_H1_SQL = janjiSql(`status IN ('pending_confirmation','confirmed')`);
const JANJI_BELUM_KONFIRMASI_SQL = janjiSql(`status = 'pending_confirmation'`);

const KONTROL_SQL = `SELECT mr.id AS record_id, scr.patient_id, p.full_name,
       COALESCE(NULLIF(p.whatsapp, ''), p.phone) AS phone,
       JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.kontrol_date')) AS kontrol_date
FROM medical_records mr
JOIN (SELECT mr_id, MAX(id) AS latest_id FROM medical_records
      WHERE record_type = 'planning' GROUP BY mr_id) latest ON latest.latest_id = mr.id
JOIN sunday_clinic_records scr ON scr.mr_id = mr.mr_id
JOIN patients p ON p.id = scr.patient_id
WHERE scr.visit_location = 'klinik_private'
  AND NOT EXISTS (SELECT 1 FROM sunday_clinic_records newer
                  WHERE newer.patient_id = scr.patient_id
                    AND newer.created_at > scr.created_at)
  AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.kontrol_date')) = ?
  AND NOT EXISTS (SELECT 1 FROM sunday_appointments sa
                  WHERE sa.patient_id = scr.patient_id
                    AND sa.status IN ('pending_confirmation','confirmed')
                    AND sa.appointment_date BETWEEN ? AND DATE_ADD(?, INTERVAL 7 DAY))`;

function parseLocalDate(dateStr) {
    const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatTanggal(dateStr) {
    return DibyaDateTime.date(parseLocalDate(dateStr), DATE_FORMAT);
}

function createWhatsAppReminderJobs({
    db,
    sender,
    sessionSettings,
    logger,
    now = () => new Date(),
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
    const database = db || require('../db');
    const log = logger || require('../utils/logger');
    const settingsApi = sessionSettings || require('./booking-session-settings');
    let senderInstance = sender || null;

    function getSender() {
        if (!senderInstance) {
            const { createWhatsAppTemplateSender } = require('./WhatsAppTemplateSender');
            senderInstance = createWhatsAppTemplateSender();
        }
        return senderInstance;
    }

    function dayOffset(days) {
        const d = new Date(now());
        d.setDate(d.getDate() + days);
        return formatDateLocal(d);
    }

    // Returns a disabled result, or null when the job may proceed.
    async function preflight(jobName) {
        if (!getSender().isConfigured()) {
            log.warn(`[WhatsAppReminderJobs] ${jobName} skipped: Meta WhatsApp is not configured`);
            return { disabled: true, reason: 'meta_not_configured' };
        }
        try {
            await database.query('SELECT 1 FROM wa_messages LIMIT 1');
        } catch (err) {
            if (err && err.code === 'ER_NO_SUCH_TABLE') {
                log.warn(`[WhatsAppReminderJobs] ${jobName} skipped: wa_messages table is missing (run migration)`);
                return { disabled: true, reason: 'table_missing' };
            }
            throw err;
        }
        return null;
    }

    // items: [{ skip?: true, message?: sendArgs }]
    async function deliver(jobName, items) {
        const stats = { total: items.length, sent: 0, skipped: 0, failed: 0 };
        let sentAny = false;
        for (const item of items) {
            if (item.skip) {
                stats.skipped += 1;
                continue;
            }
            if (sentAny) await sleep(SEND_INTERVAL_MS);
            sentAny = true;
            let result;
            try {
                result = await getSender().send(item.message);
            } catch (err) {
                log.error(`[WhatsAppReminderJobs] ${jobName} send threw for ref=${item.message.refId}`);
                result = { status: 'failed' };
            }
            if (result && result.status === 'sent') stats.sent += 1;
            else if (result && result.status === 'skipped') stats.skipped += 1;
            else stats.failed += 1;
        }
        return stats;
    }

    async function runJanji(jobName, purpose, sql, targetDate, includeTanggal) {
        const blocked = await preflight(jobName);
        if (blocked) return blocked;

        const [rows] = await database.query(sql, [targetDate]);
        const settings = await settingsApi.getSessionSettings({ strict: true });
        const tanggal = includeTanggal ? formatTanggal(targetDate) : null;

        const items = (rows || []).map(row => {
            // Only a real, active session setting yields a time; never fall back to legacy hours.
            const setting = settingsApi.findSessionSetting(settings, row.session);
            const jam = setting
                ? (settingsApi.getSlotTimeFromSettings(settings, row.session, row.slot_number)
                    || settingsApi.getSessionLabelFromSettings(settings, row.session)
                    || '-')
                : '-';
            const values = includeTanggal
                ? { nama: row.patient_name, tanggal, jam }
                : { nama: row.patient_name, jam };
            return {
                message: {
                    purpose,
                    refType: 'sunday_appointment',
                    refId: String(row.id),
                    patientId: row.patient_id,
                    phone: row.patient_phone,
                    values
                }
            };
        });
        return deliver(jobName, items);
    }

    function runJanjiH1() {
        return runJanji('runJanjiH1', 'janji_h1', JANJI_H1_SQL, dayOffset(1), true);
    }

    function runJanjiBelumKonfirmasi() {
        return runJanji('runJanjiBelumKonfirmasi', 'janji_belum_konfirmasi', JANJI_BELUM_KONFIRMASI_SQL, dayOffset(0), false);
    }

    async function runKontrolH3() {
        const jobName = 'runKontrolH3';
        const blocked = await preflight(jobName);
        if (blocked) return blocked;

        const today = formatDateLocal(now());
        const kontrolDate = dayOffset(3);
        const [rows] = await database.query(KONTROL_SQL, [kontrolDate, today, kontrolDate]);

        const items = (rows || []).map(row => {
            if (!row.phone || !String(row.phone).trim()) return { skip: true };
            return {
                message: {
                    purpose: 'kontrol_h3',
                    refType: 'medical_record',
                    refId: String(row.record_id),
                    patientId: row.patient_id,
                    phone: row.phone,
                    values: { nama: row.full_name, tanggal: formatTanggal(row.kontrol_date) }
                }
            };
        });
        return deliver(jobName, items);
    }

    return { runJanjiH1, runJanjiBelumKonfirmasi, runKontrolH3 };
}

module.exports = { createWhatsAppReminderJobs };
