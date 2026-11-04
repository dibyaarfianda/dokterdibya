/**
 * Staff menu "new activity" sources (GLOBAL RULE).
 *
 * Every sidebar menu in staff/public/index-adminlte.html (keyed by its <li id>)
 * MUST have an entry here. The staff panel shows a small red dot on a menu when
 * the newest activity of its sources is newer than the last time the current
 * staff member opened that page (table staff_menu_seen).
 *
 * Source fields:
 *   table    - table to read (required)
 *   alias    - optional table alias used by `join` / `where`
 *   join     - optional JOIN clause
 *   where    - optional static WHERE condition (no user input!)
 *   columns  - candidate timestamp columns; only the ones that actually exist in
 *              the database (information_schema) are used. Default created_at + updated_at.
 *
 * A source whose table/columns do not exist is skipped (logged once), so a wrong
 * entry never breaks the endpoint.
 */

const DEFAULT_COLUMNS = ['created_at', 'updated_at'];

const MENU_ACTIVITY_SOURCES = {
    // Utama
    'nav-dashboard': [{ table: 'patient_intake_submissions' }, { table: 'staff_announcements' }],
    'nav-kantor-saya': [{ table: 'staff_duty_logs' }, { table: 'staff_announcements' }],
    'nav-docboard': [{ table: 'docboard_events' }],

    // Pelayanan / booking
    'nav-klinik-private': [{ table: 'sunday_appointments' }],
    'nav-antrian-online': [{ table: 'sunday_appointments' }],
    'nav-rsia-melinda': [{ table: 'appointments', where: "hospital_location = 'rsia_melinda'" }],
    'nav-rsud-gambiran': [{ table: 'appointments', where: "hospital_location = 'rsud_gambiran'" }],
    'nav-rs-bhayangkara': [{ table: 'appointments', where: "hospital_location = 'rs_bhayangkara'" }],
    'nav-jadwal-booking': [{ table: 'practice_schedules' }, { table: 'disabled_practice_dates' }],

    // Pasien
    'nav-kelola-pasien': [{ table: 'patients' }],
    'nav-pasien-baru': [{ table: 'patients', columns: ['created_at'] }],
    'nav-perhatian-khusus': [{ table: 'sunday_clinic_records' }],
    'nav-record-history': [{ table: 'sunday_clinic_records' }],

    // Komunikasi
    'nav-tanya-dokter': [{ table: 'patient_questions' }, { table: 'question_replies', columns: ['created_at'] }],
    'nav-support-chat': [{ table: 'support_chat_messages', columns: ['created_at'] }],
    'nav-community-chat': [{
        table: 'community_chat_messages',
        alias: 'm',
        join: 'JOIN community_chat_rooms r ON r.id = m.room_id',
        where: 'r.is_direct = 0',
        columns: ['created_at']
    }],
    'nav-patient-inbox': [{
        table: 'community_chat_messages',
        alias: 'm',
        join: 'JOIN community_chat_rooms r ON r.id = m.room_id',
        where: "r.is_direct = 1 AND m.sender_type = 'patient'",
        columns: ['created_at']
    }],
    'nav-pengumuman': [{ table: 'announcements' }],
    'nav-voting': [{ table: 'public_polls' }, { table: 'public_poll_responses', columns: ['created_at'] }],
    'nav-birth-class': [{ table: 'birth_class_registrations' }],
    'nav-birth-congrats': [{ table: 'birth_congratulations' }],
    'nav-birth-testimonials': [{ table: 'birth_congratulations', columns: ['patient_testimonial_submitted_at'] }],
    'nav-artikel-kesehatan': [{ table: 'health_articles' }, { table: 'article_likes', columns: ['created_at'] }],
    'nav-ruang-cerita': [{ table: 'patient_stories' }],

    // Manajemen
    'management-nav-kelola-obat': [{ table: 'obat' }],
    'nav-template-resep': [{ table: 'sunday_clinic_prescription_templates' }],
    'management-nav-kelola-supplier': [{ table: 'suppliers' }],
    'management-nav-kelola-tindakan': [{ table: 'tindakan' }],
    'nav-penjualan-obat': [{ table: 'obat_sales' }],
    'nav-estimasi-biaya': [{ table: 'settings', where: "setting_key = 'pregnancy_cost_estimate_medications'" }],
    'nav-invoice-history': [{ table: 'sunday_clinic_billings' }],
    'nav-finance-analysis': [{ table: 'sunday_clinic_billings' }],
    'nav-staff-briefing': [{ table: 'staff_daily_briefings' }],
    'nav-bulk-upload-usg': [{ table: 'usg_bulk_upload_jobs' }],

    // Private
    'nav-staff-payroll': [{ table: 'staff_payroll_batches' }, { table: 'staff_driver_payrolls' }],

    // Monitoring
    'nav-patient-activity': [{ table: 'patient_activity_log', columns: ['created_at', 'activity_at', 'timestamp'] }],
    'nav-guest-activity': [{ table: 'guest_activity_log', columns: ['created_at'] }],
    'nav-patient-demo': [{ table: 'patient_demo_sessions', columns: ['created_at'] }],
    'nav-staff-activity': [{ table: 'activity_logs', columns: ['timestamp', 'created_at'] }],
    'nav-troubleshooting': [{ table: 'patient_feedback' }],
    'management-nav-block-list': [{ table: 'patient_access_blocklist' }],

    // Pengaturan
    'management-nav-kelola-roles': [{ table: 'user_access_policies' }, { table: 'staff_access_templates' }],
    'nav-booking-settings': [{ table: 'booking_settings' }],
    'nav-pengaturan': [{ table: 'settings' }],
    'nav-import-fields': [{ table: 'import_field_config' }],
    'nav-medify-sync': [{ table: 'medify_import_jobs' }]
};

module.exports = { MENU_ACTIVITY_SOURCES, DEFAULT_COLUMNS };
