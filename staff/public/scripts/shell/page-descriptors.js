const fragmentPages = [
    ['sunday-clinic', 'sunday-clinic-page', 'nav-sunday-clinic', 'Sunday Clinic'],
    ['anamnesa', 'anamnesa-page', 'nav-anamnesa', 'Anamnesa'],
    ['usg', 'usg-exam-page', 'nav-usg', 'Pemeriksaan USG'],
    ['kelola-roles', 'kelola-roles-page', 'management-nav-kelola-roles', 'Roles Manajemen'],
    ['estimasi-biaya', 'estimasi-biaya-page', 'nav-estimasi-biaya', 'Estimasi Biaya Kehamilan'],
    ['finance-analysis', 'finance-analysis-page', 'nav-finance-analysis', 'Finance Analysis'],
    ['profile-settings', 'profile-settings-page', 'nav-profile-settings', 'Profile Settings'],
    ['kelola-obat', 'kelola-obat-page', 'management-nav-kelola-obat', 'Kelola Obat'],
    ['activity-log', 'activity-log-page', 'nav-activity-log', 'Activity Log'],
    ['patient-activity', 'patient-activity-page', 'nav-patient-activity', 'Aktivitas Pasien'],
    ['support-chat', 'content-support-chat-page', 'nav-support-chat', 'Chat Bantuan'],
    ['troubleshooting', 'troubleshooting-page', 'nav-troubleshooting', 'Troubleshooting'],
    ['staff-points', 'content-staff-points', 'nav-staff-points', 'Point Staff'],
    ['staff-briefing', 'content-staff-briefing', 'nav-staff-briefing', 'Briefing'],
    ['staff-payroll', 'content-staff-payroll', 'nav-staff-payroll', 'Gajian'],
    ['tanya-dokter', 'tanya-dokter-page', 'nav-tanya-dokter', 'Tanya Dokter'],
    ['birth-congrats', 'birth-congrats-page', 'nav-birth-congrats', 'Ucapan Kelahiran'],
    ['birth-testimonials', 'birth-testimonials-page', 'nav-birth-testimonials', 'Testimoni Pasien'],
    ['invoice-history', 'invoice-history-page', 'nav-invoice-history', 'Riwayat Invoice'],
    ['artikel-kesehatan', 'artikel-kesehatan-page', 'nav-artikel-kesehatan', 'Ruang Membaca'],
    ['ruang-cerita', 'ruang-cerita-page', 'nav-ruang-cerita', 'Ruang Cerita']
];

export function createPageDescriptors() {
    return [
        {
            key: 'dashboard',
            containerId: 'dashboard-page',
            navId: 'nav-dashboard',
            title: 'Dashboard',
            fragment: null,
            load: null,
            activate: null,
            deactivate: null
        },
        {
            key: 'patients',
            containerId: 'patient-page',
            navId: 'nav-patient',
            title: 'Data Pasien',
            fragment: '/staff/public/fragments/pages/patient-page.html',
            load: async () => {
                const { loadPatientPage } = await import('../pages/patient-page.js');
                await loadPatientPage();
            },
            activate: null,
            deactivate: null
        },
        ...fragmentPages.map(([key, containerId, navId, title]) => ({
            key,
            containerId,
            navId,
            title,
            fragment: `/staff/public/fragments/pages/${containerId}.html`,
            load: null,
            activate: null,
            deactivate: null
        }))
    ];
}
