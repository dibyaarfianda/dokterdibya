const { ClinicHospitalMonitor } = require('./ClinicHospitalMonitor');
const ClinicMonitorStore = require('./ClinicMonitorStore');

let service;
let timer;
function getService() {
    if (service) return service;
    const db = require('../db');
    const env = process.env;
    service = new ClinicHospitalMonitor({
        store: new ClinicMonitorStore(db),
        storage: require('./r2Storage'),
        identity: async () => {
            const [cohort] = await db.query(`SELECT p.id, p.full_name, DATE_FORMAT(p.birth_date, '%Y-%m-%d') AS birth_date
                FROM patients p WHERE EXISTS (SELECT 1 FROM sunday_clinic_records s WHERE s.patient_id=p.id AND s.visit_location='klinik_private')`);
            const [external] = await db.query(`SELECT patient_id,facility,hospital_mr_id FROM patient_external_ids WHERE source_system='COMM'`);
            return { cohort, external };
        },
        config: {
            ownerId: env.CLINIC_MONITOR_OWNER_ID,
            enabled: env.CLINIC_MONITOR_NOTIFICATIONS_ENABLED === 'true',
            botToken: env.CLINIC_MONITOR_TELEGRAM_BOT_TOKEN,
            botUsername: env.CLINIC_MONITOR_TELEGRAM_BOT_USERNAME,
            webhookSecret: env.CLINIC_MONITOR_TELEGRAM_WEBHOOK_SECRET,
            commUrl: env.CLINIC_MONITOR_COMM_URL
        }
    });
    return service;
}
function startWorker() {
    if (timer) return;
    let busy = false;
    timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try { await getService().tick(); }
        catch (_) { require('../utils/logger').warn('Clinic monitor worker unavailable'); }
        finally { busy = false; }
    }, 30000);
    timer.unref();
}
function stopWorker() { if (timer) clearInterval(timer); timer = null; }
module.exports = { getService, startWorker, stopWorker };
