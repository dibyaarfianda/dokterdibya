'use strict';

const LEGACY_PERMISSION_NAMES = [
    'analytics.export', 'analytics.view',
    'anamnesa.create', 'anamnesa.edit', 'anamnesa.view',
    'announcements.create', 'announcements.delete', 'announcements.edit', 'announcements.view',
    'appointments.create', 'appointments.delete', 'appointments.edit', 'appointments.view',
    'billing.create', 'billing.process_payment', 'billing.view',
    'booking.manage', 'booking.view',
    'dashboard.view', 'finance_analysis.view',
    'hospital_appointments.create', 'hospital_appointments.edit', 'hospital_appointments.view',
    'inventory.adjust', 'inventory.purchase', 'inventory.view',
    'lab_exam.create', 'lab_exam.edit', 'lab_exam.view',
    'logs.view', 'medical_import.use',
    'medical_records.anamnesa_write', 'medical_records.create', 'medical_records.edit',
    'medical_records.export', 'medical_records.reset_section', 'medical_records.view',
    'medications.select', 'medications.view',
    'obat_alkes.create', 'obat_alkes.delete', 'obat_alkes.edit', 'obat_alkes.view',
    'obat_alkes_logs.export', 'obat_alkes_logs.view', 'obat_logs.export', 'obat_logs.view',
    'patients.create', 'patients.delete', 'patients.edit', 'patients.view',
    'patient_documents.create', 'patient_documents.share', 'patient_documents.view',
    'physical_exam.create', 'physical_exam.edit', 'physical_exam.view',
    'registration_codes.create', 'registration_codes.delete', 'registration_codes.view',
    'roles.create', 'roles.delete', 'roles.edit', 'roles.manage_permissions', 'roles.view',
    'services.select', 'services.view',
    'settings.medications_manage', 'settings.services_manage', 'settings.system',
    'stock.update', 'stock.view',
    'sunday_clinic.create', 'sunday_clinic.edit', 'sunday_clinic.view',
    'suppliers.create', 'suppliers.delete', 'suppliers.edit', 'suppliers.view',
    'users.manage_roles',
    'usg_exam.create', 'usg_exam.edit', 'usg_exam.view',
    'visits.create', 'visits.delete', 'visits.edit', 'visits.view'
];

const CATEGORY_LABELS = {
    analytics: 'Analitik',
    anamnesa: 'Rekam Medis',
    announcements: 'Komunikasi dan Konten',
    appointments: 'Klinik dan Jadwal',
    billing: 'Keuangan',
    booking: 'Antrian Online',
    dashboard: 'Dashboard',
    finance_analysis: 'Keuangan',
    hospital_appointments: 'Klinik dan Jadwal',
    inventory: 'Obat dan Inventori',
    lab_exam: 'Rekam Medis',
    logs: 'Monitoring dan Sistem',
    medical_import: 'Rekam Medis',
    medical_records: 'Rekam Medis',
    medications: 'Obat dan Inventori',
    obat_alkes: 'Obat dan Inventori',
    obat_alkes_logs: 'Obat dan Inventori',
    obat_logs: 'Obat dan Inventori',
    patients: 'Pasien',
    patient_documents: 'Pasien',
    physical_exam: 'Rekam Medis',
    registration_codes: 'Pasien',
    roles: 'Kelola Akses',
    services: 'Tindakan',
    settings: 'Monitoring dan Sistem',
    stock: 'Obat dan Inventori',
    sunday_clinic: 'Klinik dan Jadwal',
    suppliers: 'Obat dan Inventori',
    users: 'Kelola Akses',
    usg_exam: 'Rekam Medis',
    visits: 'Pasien'
};

function actionFromName(name) {
    const suffix = name.split('.').pop();
    if (suffix === 'view') return 'view';
    if (suffix === 'delete') return 'delete';
    if (suffix === 'export') return 'export';
    if (suffix.includes('payment')) return 'payment';
    if (suffix.includes('reset')) return 'reset';
    if (suffix.includes('sync')) return 'sync';
    if (suffix.includes('publish')) return 'publish';
    return 'write';
}

function legacyDefinition(name) {
    const prefix = name.split('.')[0];
    return {
        name,
        displayName: name.replace(/[._]/g, ' '),
        category: CATEGORY_LABELS[prefix] || 'Lainnya',
        description: `Izin kompatibilitas ${name}`,
        action: actionFromName(name),
        legacySources: [{ kind: 'permission', value: name }]
    };
}

function permission(name, displayName, category, action, legacySources, options = {}) {
    return {
        name,
        displayName,
        category,
        description: options.description || displayName,
        action,
        legacySources,
        protected: Boolean(options.protected),
        internal: Boolean(options.internal)
    };
}

function navigationPermission(key, displayName, source = { kind: 'menu', value: key }) {
    return permission(
        `navigation.${key.replace(/-/g, '_').replace(/\./g, '_')}`,
        `Navigasi ${displayName}`,
        'Navigasi Internal',
        'view',
        [source],
        { internal: true }
    );
}

const NAVIGATION_PERMISSIONS = [
    navigationPermission('kantor_saya', 'Kantor Saya'),
    navigationPermission('dashboard', 'Dashboard'),
    navigationPermission('kelola_pasien', 'Kelola Pasien'),
    navigationPermission('pasien_baru', 'Pasien Baru'),
    navigationPermission('penjualan-obat', 'Penjualan Obat'),
    navigationPermission('klinik_privat', 'Klinik Privat'),
    navigationPermission('rsia_melinda', 'RSIA Melinda'),
    navigationPermission('rsud_gambiran', 'RSUD Gambiran'),
    navigationPermission('rs_bhayangkara', 'RS Bhayangkara'),
    navigationPermission('obat_alkes', 'Obat dan Alkes'),
    navigationPermission('keuangan', 'Keuangan'),
    navigationPermission('kelola_roles', 'Kelola Akses'),
    navigationPermission('ucapan_kelahiran', 'Ucapan Kelahiran'),
    navigationPermission('staff_points', 'Poin Staff'),
    navigationPermission('staff_briefing', 'Briefing Staff'),
    navigationPermission('staff_payroll', 'Gajian Staff'),
    navigationPermission('bulk-upload-usg', 'Bulk Upload USG'),
    navigationPermission('registration_codes.view', 'Kode Registrasi'),
    navigationPermission('ruang_cerita', 'Ruang Cerita', { kind: 'all_staff' })
];

const NEW_PERMISSIONS = [
    ...NAVIGATION_PERMISSIONS,
    permission('access.manage', 'Kelola akses per akun', 'Kelola Akses', 'write', [{ kind: 'doctor' }], { protected: true }),
    permission('clinical_ai.use', 'Gunakan bantuan AI klinis', 'Rekam Medis', 'write', [{ kind: 'permission', value: 'medical_records.edit' }]),
    permission('appointments.archive', 'Arsipkan atau pulihkan janji', 'Klinik dan Jadwal', 'finalize', [{ kind: 'permission', value: 'appointments.edit' }]),
    permission('appointments.sync', 'Sinkronkan janji dan antrean', 'Klinik dan Jadwal', 'sync', [{ kind: 'permission', value: 'booking.manage' }]),
    permission('articles.view', 'Baca artikel kesehatan', 'Komunikasi dan Konten', 'view', [{ kind: 'doctor' }]),
    permission('articles.write', 'Buat dan edit artikel kesehatan', 'Komunikasi dan Konten', 'write', [{ kind: 'doctor' }]),
    permission('articles.delete', 'Hapus artikel kesehatan', 'Komunikasi dan Konten', 'delete', [{ kind: 'doctor' }]),
    permission('articles.publish', 'Terbitkan artikel kesehatan', 'Komunikasi dan Konten', 'publish', [{ kind: 'doctor' }]),
    permission('assistant_daf.use', 'Gunakan Asisten DAF', 'Monitoring dan Sistem', 'write', [{ kind: 'doctor' }]),
    permission('billing.export', 'Ekspor dokumen keuangan', 'Keuangan', 'export', [{ kind: 'permission', value: 'billing.view' }]),
    permission('billing.reset', 'Reset transaksi keuangan', 'Keuangan', 'reset', [{ kind: 'doctor' }]),
    permission('billing.finalize', 'Finalisasi tagihan', 'Keuangan', 'finalize', [{ kind: 'permission', value: 'billing.process_payment' }]),
    permission('birth_classes.view', 'Baca kelas Dr. Dibya', 'Komunikasi dan Konten', 'view', [{ kind: 'menu', value: 'klinik_privat' }]),
    permission('birth_classes.write', 'Kelola kelas Dr. Dibya', 'Komunikasi dan Konten', 'write', [{ kind: 'doctor' }]),
    permission('birth_classes.delete', 'Hapus kelas Dr. Dibya', 'Komunikasi dan Konten', 'delete', [{ kind: 'doctor' }]),
    permission('clinic_monitor.view', 'Baca monitoring klinik', 'Monitoring dan Sistem', 'view', [{ kind: 'doctor' }]),
    permission('clinic_monitor.sync', 'Sinkronkan monitoring klinik', 'Monitoring dan Sistem', 'sync', [{ kind: 'doctor' }]),
    permission('clinic_monitor.reset', 'Pulihkan monitoring klinik', 'Monitoring dan Sistem', 'reset', [{ kind: 'doctor' }]),
    permission('community_chat.view', 'Baca chat komunitas', 'Komunikasi dan Konten', 'view', [{ kind: 'doctor' }]),
    permission('community_chat.write', 'Balas chat komunitas', 'Komunikasi dan Konten', 'write', [{ kind: 'doctor' }]),
    permission('community_chat.delete', 'Hapus isi chat komunitas', 'Komunikasi dan Konten', 'delete', [{ kind: 'doctor' }]),
    permission('community_chat.moderate', 'Moderasi chat komunitas', 'Komunikasi dan Konten', 'write', [{ kind: 'doctor' }]),
    permission('docboard.view', 'Baca DocBoard', 'Monitoring dan Sistem', 'view', [{ kind: 'doctor' }]),
    permission('docboard.write', 'Kelola DocBoard', 'Monitoring dan Sistem', 'write', [{ kind: 'doctor' }]),
    permission('docboard.delete', 'Hapus data DocBoard', 'Monitoring dan Sistem', 'delete', [{ kind: 'doctor' }]),
    permission('cost_estimates.view', 'Baca estimasi biaya', 'Keuangan', 'view', [{ kind: 'menu', value: 'penjualan-obat' }]),
    permission('cost_estimates.write', 'Kelola estimasi biaya', 'Keuangan', 'write', [{ kind: 'doctor' }]),
    permission('cost_estimates.delete', 'Hapus estimasi biaya', 'Keuangan', 'delete', [{ kind: 'doctor' }]),
    permission('cost_estimates.publish', 'Terbitkan estimasi biaya', 'Keuangan', 'publish', [{ kind: 'doctor' }]),
    permission('greeting_cards.view', 'Baca ucapan kelahiran', 'Komunikasi dan Konten', 'view', [{ kind: 'menu', value: 'ucapan_kelahiran' }]),
    permission('greeting_cards.write', 'Kelola ucapan kelahiran', 'Komunikasi dan Konten', 'write', [{ kind: 'menu', value: 'ucapan_kelahiran' }]),
    permission('greeting_cards.delete', 'Hapus ucapan kelahiran', 'Komunikasi dan Konten', 'delete', [{ kind: 'doctor' }]),
    permission('integrations.view', 'Baca status integrasi', 'Integrasi', 'view', [{ kind: 'doctor' }]),
    permission('integrations.write', 'Kelola integrasi', 'Integrasi', 'write', [{ kind: 'doctor' }]),
    permission('integrations.sync', 'Jalankan sinkronisasi integrasi', 'Integrasi', 'sync', [{ kind: 'doctor' }]),
    permission('integrations.reset', 'Pulihkan integrasi', 'Integrasi', 'reset', [{ kind: 'doctor' }]),
    permission('medical_records.delete', 'Hapus rekam medis', 'Rekam Medis', 'delete', [{ kind: 'permission', value: 'medical_records.edit' }]),
    permission('medical_records.finalize', 'Finalisasi rekam medis', 'Rekam Medis', 'finalize', [{ kind: 'permission', value: 'medical_records.edit' }]),
    permission('medical_records.merge', 'Gabungkan rekam medis', 'Rekam Medis', 'merge', [{ kind: 'permission', value: 'medical_records.edit' }]),
    permission('medical_records.bulk_delete', 'Hapus massal rekam medis', 'Rekam Medis', 'bulk_delete', [{ kind: 'permission', value: 'medical_records.delete' }]),
    permission('medications.sales_view', 'Baca penjualan obat', 'Obat dan Inventori', 'view', [{ kind: 'menu', value: 'penjualan-obat' }]),
    permission('medications.sales_write', 'Kelola penjualan obat', 'Obat dan Inventori', 'write', [{ kind: 'menu', value: 'penjualan-obat' }]),
    permission('medications.sales_delete', 'Hapus penjualan obat', 'Obat dan Inventori', 'delete', [{ kind: 'doctor' }]),
    permission('notifications.view', 'Baca notifikasi staff', 'Komunikasi dan Konten', 'view', [{ kind: 'all_staff' }]),
    permission('notifications.write', 'Kelola notifikasi staff', 'Komunikasi dan Konten', 'write', [{ kind: 'doctor' }]),
    permission('notifications.delete', 'Hapus notifikasi staff', 'Komunikasi dan Konten', 'delete', [{ kind: 'doctor' }]),
    permission('online_queue.view', 'Baca antrian online', 'Klinik dan Jadwal', 'view', [{ kind: 'permission', value: 'booking.view' }]),
    permission('online_queue.write', 'Kelola antrian online', 'Klinik dan Jadwal', 'write', [{ kind: 'permission', value: 'booking.manage' }]),
    permission('online_queue.delete', 'Hapus antrian online', 'Klinik dan Jadwal', 'delete', [{ kind: 'doctor' }]),
    permission('online_queue.sync', 'Sinkronkan antrian online', 'Klinik dan Jadwal', 'sync', [{ kind: 'permission', value: 'booking.manage' }]),
    permission('patient_access.manage', 'Kelola blokir akses pasien', 'Monitoring dan Sistem', 'write', [{ kind: 'doctor' }]),
    permission('patient_activity.view', 'Baca aktivitas pasien', 'Monitoring dan Sistem', 'view', [{ kind: 'doctor' }]),
    permission('patient_demo.manage', 'Kelola portal pasien dummy', 'Monitoring dan Sistem', 'write', [{ kind: 'doctor' }]),
    permission('patient_feedback.view', 'Baca masukan pasien', 'Komunikasi dan Konten', 'view', [{ kind: 'doctor' }]),
    permission('patient_feedback.write', 'Tindak lanjuti masukan pasien', 'Komunikasi dan Konten', 'write', [{ kind: 'doctor' }]),
    permission('patient_feedback.delete', 'Hapus masukan pasien', 'Komunikasi dan Konten', 'delete', [{ kind: 'doctor' }]),
    permission('patient_questions.view', 'Baca Tanya Dokter', 'Tanya Dokter', 'view', [{ kind: 'doctor' }]),
    permission('patient_questions.write', 'Jawab Tanya Dokter', 'Tanya Dokter', 'write', [{ kind: 'doctor' }]),
    permission('patient_questions.delete', 'Hapus Tanya Dokter', 'Tanya Dokter', 'delete', [{ kind: 'doctor' }]),
    permission('patient_questions.finalize', 'Finalisasi Tanya Dokter', 'Tanya Dokter', 'finalize', [{ kind: 'doctor' }]),
    permission('patient_stories.view', 'Baca cerita pasien', 'Komunikasi dan Konten', 'view', [{ kind: 'menu', value: 'ucapan_kelahiran' }]),
    permission('patient_stories.write', 'Moderasi cerita pasien', 'Komunikasi dan Konten', 'write', [{ kind: 'doctor' }]),
    permission('patient_stories.delete', 'Hapus cerita pasien', 'Komunikasi dan Konten', 'delete', [{ kind: 'doctor' }]),
    permission('patient_stories.publish', 'Terbitkan cerita pasien', 'Komunikasi dan Konten', 'publish', [{ kind: 'doctor' }]),
    permission('patients.export', 'Ekspor data pasien', 'Pasien', 'export', [{ kind: 'permission', value: 'patients.view' }]),
    permission('patients.reset', 'Reset akses atau data pasien', 'Pasien', 'reset', [{ kind: 'doctor' }]),
    permission('patients.merge', 'Gabungkan data pasien', 'Pasien', 'merge', [{ kind: 'permission', value: 'patients.edit' }]),
    permission('patients.bulk_delete', 'Hapus massal data pasien', 'Pasien', 'bulk_delete', [{ kind: 'permission', value: 'patients.delete' }]),
    permission('polls.view', 'Baca voting', 'Komunikasi dan Konten', 'view', [{ kind: 'menu', value: 'klinik_privat' }]),
    permission('polls.write', 'Kelola voting', 'Komunikasi dan Konten', 'write', [{ kind: 'doctor' }]),
    permission('polls.delete', 'Hapus voting', 'Komunikasi dan Konten', 'delete', [{ kind: 'doctor' }]),
    permission('polls.publish', 'Terbitkan voting', 'Komunikasi dan Konten', 'publish', [{ kind: 'doctor' }]),
    permission('practice_schedules.view', 'Baca jadwal praktik', 'Klinik dan Jadwal', 'view', [{ kind: 'permission', value: 'hospital_appointments.view' }]),
    permission('practice_schedules.write', 'Kelola jadwal praktik', 'Klinik dan Jadwal', 'write', [{ kind: 'permission', value: 'hospital_appointments.edit' }]),
    permission('practice_schedules.delete', 'Hapus jadwal praktik', 'Klinik dan Jadwal', 'delete', [{ kind: 'doctor' }]),
    permission('r2_files.view', 'Baca berkas tersimpan', 'Pasien', 'view', [{ kind: 'permission', value: 'patient_documents.view' }]),
    permission('r2_files.write', 'Kelola berkas tersimpan', 'Pasien', 'write', [{ kind: 'permission', value: 'patient_documents.create' }]),
    permission('r2_files.delete', 'Hapus berkas tersimpan', 'Pasien', 'delete', [{ kind: 'doctor' }]),
    permission('staff_announcements.view', 'Baca pengumuman staff', 'Komunikasi dan Konten', 'view', [{ kind: 'all_staff' }]),
    permission('staff_announcements.write', 'Kelola pengumuman staff', 'Komunikasi dan Konten', 'write', [{ kind: 'doctor' }]),
    permission('staff_announcements.delete', 'Hapus pengumuman staff', 'Komunikasi dan Konten', 'delete', [{ kind: 'doctor' }]),
    permission('staff_announcements.publish', 'Terbitkan pengumuman staff', 'Komunikasi dan Konten', 'publish', [{ kind: 'doctor' }]),
    permission('staff_briefing.view', 'Baca briefing staff', 'Tim', 'view', [{ kind: 'menu', value: 'staff_briefing' }]),
    permission('staff_briefing.write', 'Kelola briefing staff', 'Tim', 'write', [{ kind: 'menu', value: 'staff_briefing' }]),
    permission('staff_briefing.delete', 'Hapus briefing staff', 'Tim', 'delete', [{ kind: 'doctor' }]),
    permission('staff_briefing.finalize', 'Finalisasi briefing staff', 'Tim', 'finalize', [{ kind: 'doctor' }]),
    permission('staff_payroll.view', 'Baca gajian staff', 'Tim', 'view', [{ kind: 'menu', value: 'staff_payroll' }]),
    permission('staff_payroll.write', 'Kelola gajian staff', 'Tim', 'write', [{ kind: 'doctor' }]),
    permission('staff_payroll.delete', 'Hapus gajian staff', 'Tim', 'delete', [{ kind: 'doctor' }]),
    permission('staff_payroll.finalize', 'Finalisasi gajian staff', 'Tim', 'finalize', [{ kind: 'doctor' }]),
    permission('staff_payroll.export', 'Ekspor gajian staff', 'Tim', 'export', [{ kind: 'doctor' }]),
    permission('staff_points.view', 'Baca poin staff', 'Tim', 'view', [{ kind: 'menu', value: 'staff_points' }]),
    permission('staff_points.write', 'Kelola poin staff', 'Tim', 'write', [{ kind: 'doctor' }]),
    permission('staff_points.reset', 'Reset poin staff', 'Tim', 'reset', [{ kind: 'doctor' }]),
    permission('staff_workdesk.view', 'Baca Kantor Saya', 'Tim', 'view', [{ kind: 'menu', value: 'kantor_saya' }]),
    permission('staff_workdesk.write', 'Kelola Kantor Saya', 'Tim', 'write', [{ kind: 'menu', value: 'kantor_saya' }]),
    permission('staff_workdesk.delete', 'Hapus data Kantor Saya', 'Tim', 'delete', [{ kind: 'doctor' }]),
    permission('support_chat.view', 'Baca Chat Bantuan', 'Komunikasi dan Konten', 'view', [{ kind: 'doctor' }]),
    permission('support_chat.write', 'Balas Chat Bantuan', 'Komunikasi dan Konten', 'write', [{ kind: 'doctor' }]),
    permission('support_chat.delete', 'Hapus Chat Bantuan', 'Komunikasi dan Konten', 'delete', [{ kind: 'doctor' }]),
    permission('system.monitor', 'Baca monitoring sistem', 'Monitoring dan Sistem', 'view', [{ kind: 'doctor' }]),
    permission('system.write', 'Kelola konfigurasi sistem', 'Monitoring dan Sistem', 'write', [{ kind: 'doctor' }]),
    permission('system.reset', 'Pulihkan layanan sistem', 'Monitoring dan Sistem', 'reset', [{ kind: 'doctor' }], { protected: true }),
    permission('tanya_finance.view', 'Baca keuangan Tanya Dokter', 'Tanya Dokter', 'view', [{ kind: 'doctor' }]),
    permission('tanya_finance.export', 'Ekspor keuangan Tanya Dokter', 'Tanya Dokter', 'export', [{ kind: 'doctor' }]),
    permission('usg_exam.delete', 'Hapus pemeriksaan USG', 'Rekam Medis', 'delete', [{ kind: 'permission', value: 'usg_exam.edit' }]),
    permission('usg_exam.bulk_delete', 'Hapus massal pemeriksaan USG', 'Rekam Medis', 'bulk_delete', [{ kind: 'permission', value: 'usg_exam.delete' }]),
    permission('usg_exam.sync', 'Sinkronkan pemeriksaan USG', 'Rekam Medis', 'sync', [{ kind: 'permission', value: 'usg_exam.create' }]),
    permission('usg_reader.use', 'Gunakan pembaca USG', 'Rekam Medis', 'write', [{ kind: 'permission', value: 'usg_exam.view' }])
];

const catalogByName = new Map();
for (const item of [...LEGACY_PERMISSION_NAMES.map(legacyDefinition), ...NEW_PERMISSIONS]) {
    if (catalogByName.has(item.name)) throw new Error(`Duplicate permission catalog entry: ${item.name}`);
    catalogByName.set(item.name, Object.freeze(item));
}

const PERMISSION_CATALOG = Object.freeze([...catalogByName.values()]);

module.exports = {
    LEGACY_PERMISSION_NAMES: Object.freeze([...LEGACY_PERMISSION_NAMES]),
    PERMISSION_CATALOG
};
