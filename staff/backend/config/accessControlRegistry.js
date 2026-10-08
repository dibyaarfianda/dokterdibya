'use strict';

const NAMED_EXEMPTIONS = new Set([
    'activation',
    'ci_oidc',
    'emergency_recovery',
    'health',
    'integration_api_key',
    'legacy_access_adapter',
    'patient',
    'payment_webhook',
    'public',
    'staff_chat',
    'staff_identity',
    'staff_profile',
    'telemetry'
]);

const MENU_PERMISSION_MAP = Object.freeze({
    kantor_saya: 'navigation.kantor_saya',
    dashboard: 'navigation.dashboard',
    kelola_pasien: 'navigation.kelola_pasien',
    pasien_baru: 'navigation.pasien_baru',
    'penjualan-obat': 'navigation.penjualan_obat',
    klinik_privat: 'navigation.klinik_privat',
    rsia_melinda: 'navigation.rsia_melinda',
    rsud_gambiran: 'navigation.rsud_gambiran',
    rs_bhayangkara: 'navigation.rs_bhayangkara',
    obat_alkes: 'navigation.obat_alkes',
    keuangan: 'navigation.keuangan',
    kelola_roles: 'navigation.kelola_roles',
    ucapan_kelahiran: 'navigation.ucapan_kelahiran',
    ruang_cerita: 'navigation.ruang_cerita',
    staff_points: 'navigation.staff_points',
    staff_briefing: 'navigation.staff_briefing',
    staff_payroll: 'navigation.staff_payroll',
    'bulk-upload-usg': 'navigation.bulk_upload_usg',
    'registration_codes.view': 'navigation.registration_codes_view'
});

const LEGACY_MENU_MODULE_MAP = Object.freeze({
    kantor_saya: 'staff_workdesk.view', dashboard: 'dashboard.view', kelola_pasien: 'patients.view',
    pasien_baru: 'patients.create', 'penjualan-obat': 'medications.sales_view', klinik_privat: 'sunday_clinic.view',
    rsia_melinda: 'hospital_appointments.view', rsud_gambiran: 'hospital_appointments.view',
    rs_bhayangkara: 'hospital_appointments.view', obat_alkes: 'obat_alkes.view', keuangan: 'finance_analysis.view',
    kelola_roles: 'access.manage', ucapan_kelahiran: 'greeting_cards.view', staff_points: 'staff_points.view',
    staff_briefing: 'staff_briefing.view', staff_payroll: 'staff_payroll.view',
    'bulk-upload-usg': 'usg_exam.create', 'registration_codes.view': 'registration_codes.view'
});

const STAFF_NAVIGATION_MAP = Object.freeze({
    'management-nav-block-list': 'patient_access.manage',
    'management-nav-kelola-obat': 'navigation.obat_alkes',
    'management-nav-kelola-roles': 'navigation.kelola_roles',
    'management-nav-kelola-supplier': 'suppliers.view',
    'management-nav-kelola-tindakan': 'navigation.obat_alkes',
    'nav-antrian-online': 'online_queue.view',
    'nav-artikel-kesehatan': 'articles.view',
    'nav-birth-class': 'navigation.klinik_privat',
    'nav-birth-congrats': 'navigation.ucapan_kelahiran',
    'nav-birth-testimonials': 'navigation.ucapan_kelahiran',
    'nav-booking-settings': 'booking.manage',
    'nav-bulk-upload-usg': 'navigation.bulk_upload_usg',
    'nav-community-chat': 'community_chat.view',
    'nav-dashboard': 'navigation.dashboard',
    'nav-estimasi-biaya': 'navigation.penjualan_obat',
    'nav-finance-analysis': 'finance_analysis.view',
    'nav-guest-activity': 'logs.view',
    'nav-import-fields': 'medical_import.use',
    'nav-invoice-history': 'navigation.keuangan',
    'nav-jadwal-booking': 'appointments.view',
    'nav-kantor-saya': 'navigation.kantor_saya',
    'nav-kelola-pasien': 'navigation.kelola_pasien',
    'nav-klinik-private': 'navigation.klinik_privat',
    'nav-medify-sync': 'integrations.sync',
    'nav-pasien-baru': 'navigation.pasien_baru',
    'nav-patient-activity': 'patient_activity.view',
    'nav-patient-demo': 'patient_demo.manage',
    'nav-pengaturan': 'settings.system',
    'nav-pengumuman': 'announcements.view',
    'nav-penjualan-obat': 'navigation.penjualan_obat',
    'nav-perhatian-khusus': 'patient_access.manage',
    'nav-private': 'dashboard.view',
    'nav-record-history': 'navigation.kelola_pasien',
    'nav-rs-bhayangkara': 'navigation.rs_bhayangkara',
    'nav-rsia-melinda': 'navigation.rsia_melinda',
    'nav-rsud-gambiran': 'navigation.rsud_gambiran',
    'nav-ruang-cerita': 'navigation.ruang_cerita',
    'nav-staff-activity': 'logs.view',
    'nav-staff-briefing': 'navigation.staff_briefing',
    'nav-staff-payroll': 'navigation.staff_payroll',
    'nav-support-chat': 'support_chat.view',
    'nav-tanya-dokter': 'patient_questions.view',
    'nav-template-resep': 'medications.view',
    'nav-troubleshooting': 'system.monitor',
    'nav-voting': 'navigation.klinik_privat'
});

function CRUD(view, create, write, remove, specials = {}) {
    return Object.freeze({ view, create: create || write, write, delete: remove, specials });
}

const SOURCE_POLICIES = Object.freeze({
    '02-tindakan-api': CRUD('services.view', 'settings.services_manage', 'settings.services_manage', 'settings.services_manage', { export: 'services.view' }),
    '05-public-tindakan': CRUD('services.view', 'settings.services_manage', 'settings.services_manage', 'settings.services_manage'),
    ai: CRUD('clinical_ai.use', 'clinical_ai.use', 'clinical_ai.use', 'clinical_ai.use'),
    analytics: CRUD('analytics.view', 'analytics.view', 'analytics.view', 'analytics.view', { export: 'analytics.export' }),
    announcements: CRUD('announcements.view', 'announcements.create', 'announcements.edit', 'announcements.delete', { publish: 'announcements.edit' }),
    'app-version': CRUD('system.monitor', 'system.write', 'system.write', 'system.write'),
    app: CRUD('system.monitor', 'system.write', 'system.write', 'system.write'),
    'appointment-archive': CRUD('appointments.view', 'appointments.archive', 'appointments.archive', 'appointments.delete', { finalize: 'appointments.archive' }),
    appointments: CRUD('appointments.view', 'appointments.create', 'appointments.edit', 'appointments.delete', { sync: 'appointments.sync' }),
    articles: CRUD('articles.view', 'articles.write', 'articles.write', 'articles.delete', { publish: 'articles.publish' }),
    'assistant-daf': CRUD('assistant_daf.use', 'assistant_daf.use', 'assistant_daf.use', 'assistant_daf.use'),
    'assistant-daf-ai': CRUD('assistant_daf.use', 'assistant_daf.use', 'assistant_daf.use', 'assistant_daf.use'),
    auth: CRUD('access.manage', 'access.manage', 'access.manage', 'access.manage', { reset: 'patients.reset', sync: 'patients.reset' }),
    'billing-payment': CRUD('billing.view', 'billing.create', 'billing.create', 'billing.reset', { payment: 'billing.process_payment', export: 'billing.export', finalize: 'billing.finalize', reset: 'billing.reset' }),
    billing: CRUD('billing.view', 'billing.create', 'billing.create', 'billing.reset', { payment: 'billing.process_payment', export: 'billing.export', finalize: 'billing.finalize', reset: 'billing.reset' }),
    billings: CRUD('billing.view', 'billing.create', 'billing.create', 'billing.reset', { payment: 'billing.process_payment', export: 'billing.export', finalize: 'billing.finalize', reset: 'billing.reset' }),
    'birth-classes': CRUD('birth_classes.view', 'birth_classes.write', 'birth_classes.write', 'birth_classes.delete', { publish: 'birth_classes.write' }),
    'booking-settings': CRUD('booking.view', 'booking.manage', 'booking.manage', 'booking.manage'),
    'clinic-monitor': CRUD('clinic_monitor.view', 'clinic_monitor.sync', 'clinic_monitor.sync', 'clinic_monitor.reset', { sync: 'clinic_monitor.sync', reset: 'clinic_monitor.reset' }),
    'community-chat': CRUD('community_chat.view', 'community_chat.write', 'community_chat.write', 'community_chat.delete', { finalize: 'community_chat.moderate', reset: 'community_chat.moderate' }),
    'community-chat-attention': CRUD('community_chat.view', 'community_chat.write', 'community_chat.write', 'community_chat.delete'),
    'dashboard-stats': CRUD('dashboard.view', 'dashboard.view', 'dashboard.view', 'dashboard.view'),
    docboard: CRUD('docboard.view', 'docboard.write', 'docboard.write', 'docboard.delete', { sync: 'docboard.write', reset: 'docboard.write' }),
    'email-settings': CRUD('system.monitor', 'system.write', 'system.write', 'system.write'),
    'estimasi-biaya': CRUD('cost_estimates.view', 'cost_estimates.write', 'cost_estimates.write', 'cost_estimates.delete', { publish: 'cost_estimates.publish' }),
    'estimasi-biaya-draft': CRUD('cost_estimates.view', 'cost_estimates.write', 'cost_estimates.write', 'cost_estimates.delete'),
    'gambiran-resumes': CRUD('medical_records.view', 'medical_records.create', 'medical_records.edit', 'medical_records.delete', { finalize: 'medical_records.finalize', export: 'medical_records.export' }),
    'greeting-cards': CRUD('greeting_cards.view', 'greeting_cards.write', 'greeting_cards.write', 'greeting_cards.delete', { publish: 'greeting_cards.write' }),
    'guest-activity': CRUD('logs.view', 'logs.view', 'logs.view', 'logs.view'),
    'hospital-appointments': CRUD('hospital_appointments.view', 'hospital_appointments.create', 'hospital_appointments.edit', 'appointments.delete', { sync: 'appointments.sync' }),
    'import-config': CRUD('medical_import.use', 'medical_import.use', 'medical_import.use', 'medical_import.use'),
    'inventory-orders': CRUD('inventory.view', 'inventory.purchase', 'inventory.purchase', 'inventory.adjust', { finalize: 'inventory.purchase' }),
    inventory: CRUD('inventory.view', 'inventory.purchase', 'inventory.adjust', 'inventory.adjust', { export: 'inventory.view', reset: 'inventory.adjust' }),
    invoices: CRUD('billing.view', 'billing.create', 'billing.create', 'billing.reset', { payment: 'billing.process_payment', export: 'billing.export', finalize: 'billing.finalize' }),
    'lab-results': CRUD('lab_exam.view', 'lab_exam.create', 'lab_exam.edit', 'medical_records.delete', { export: 'medical_records.export', finalize: 'medical_records.finalize' }),
    logs: CRUD('logs.view', 'logs.view', 'logs.view', 'system.reset', { reset: 'system.reset', export: 'logs.view' }),
    'medical-exams': CRUD('physical_exam.view', 'physical_exam.create', 'physical_exam.edit', 'medical_records.delete', { finalize: 'medical_records.finalize' }),
    'medical-import': CRUD('medical_import.use', 'medical_import.use', 'medical_import.use', 'medical_import.use', { sync: 'medical_import.use' }),
    'medical-records': CRUD('medical_records.view', 'medical_records.create', 'medical_records.edit', 'medical_records.delete', { export: 'medical_records.export', reset: 'medical_records.reset_section', finalize: 'medical_records.finalize', merge: 'medical_records.merge', bulk_delete: 'medical_records.bulk_delete' }),
    'medify-batch': CRUD('integrations.view', 'integrations.sync', 'integrations.sync', 'integrations.reset', { sync: 'integrations.sync', reset: 'integrations.reset' }),
    'morbid-cases': CRUD('medical_records.view', 'medical_records.create', 'medical_records.edit', 'medical_records.delete', { finalize: 'medical_records.finalize' }),
    notifications: CRUD('notifications.view', 'notifications.write', 'notifications.write', 'notifications.delete'),
    'obat-sales': CRUD('medications.sales_view', 'medications.sales_write', 'medications.sales_write', 'medications.sales_delete', { payment: 'billing.process_payment', export: 'billing.export', finalize: 'billing.finalize' }),
    obat: CRUD('obat_alkes.view', 'obat_alkes.create', 'obat_alkes.edit', 'obat_alkes.delete', { export: 'obat_logs.export', reset: 'stock.update' }),
    'patient-access-blocklist': CRUD('patient_access.manage', 'patient_access.manage', 'patient_access.manage', 'patient_access.manage'),
    'patient-activity': CRUD('patient_activity.view', 'patient_activity.view', 'patient_activity.view', 'patient_activity.view'),
    'patient-billing': CRUD('billing.view', 'billing.create', 'billing.create', 'billing.reset', { payment: 'billing.process_payment', export: 'billing.export', finalize: 'billing.finalize' }),
    'patient-demo': CRUD('patient_demo.manage', 'patient_demo.manage', 'patient_demo.manage', 'patient_demo.manage', { reset: 'patient_demo.manage' }),
    'patient-documents': CRUD('patient_documents.view', 'patient_documents.create', 'patient_documents.create', 'r2_files.delete', { export: 'patient_documents.share' }),
    'patient-feedback': CRUD('patient_feedback.view', 'patient_feedback.write', 'patient_feedback.write', 'patient_feedback.delete', { finalize: 'patient_feedback.write' }),
    'patient-intake': CRUD('anamnesa.view', 'anamnesa.create', 'anamnesa.edit', 'medical_records.delete', { finalize: 'medical_records.finalize' }),
    'patient-questions': CRUD('patient_questions.view', 'patient_questions.write', 'patient_questions.write', 'patient_questions.delete', { finalize: 'patient_questions.finalize', payment: 'tanya_finance.view' }),
    'patient-records': CRUD('medical_records.view', 'medical_records.create', 'medical_records.edit', 'medical_records.delete', { export: 'medical_records.export', reset: 'medical_records.reset_section', finalize: 'medical_records.finalize', merge: 'medical_records.merge', bulk_delete: 'medical_records.bulk_delete' }),
    'patient-stories': CRUD('patient_stories.view', 'patient_stories.write', 'patient_stories.write', 'patient_stories.delete', { publish: 'patient_stories.publish' }),
    'patients-auth': CRUD('patients.view', 'patients.create', 'patients.edit', 'patients.delete', { reset: 'patients.reset', merge: 'patients.merge', bulk_delete: 'patients.bulk_delete' }),
    patients: CRUD('patients.view', 'patients.create', 'patients.edit', 'patients.delete', { export: 'patients.export', reset: 'patients.reset', merge: 'patients.merge', bulk_delete: 'patients.bulk_delete' }),
    pdf: CRUD('medical_records.export', 'medical_records.export', 'medical_records.export', 'medical_records.export', { export: 'medical_records.export' }),
    'pdf-queue': CRUD('system.monitor', 'system.write', 'system.write', 'system.reset', { reset: 'system.reset' }),
    polls: CRUD('polls.view', 'polls.write', 'polls.write', 'polls.delete', { publish: 'polls.publish' }),
    'practice-schedules': CRUD('practice_schedules.view', 'practice_schedules.write', 'practice_schedules.write', 'practice_schedules.delete'),
    'r2-proxy': CRUD('r2_files.view', 'r2_files.write', 'r2_files.write', 'r2_files.delete', { export: 'r2_files.view' }),
    'registration-codes': CRUD('registration_codes.view', 'registration_codes.create', 'registration_codes.create', 'registration_codes.delete'),
    roles: CRUD('access.manage', 'access.manage', 'access.manage', 'access.manage'),
    'role-visibility': CRUD('access.manage', 'access.manage', 'access.manage', 'access.manage'),
    slo: CRUD('system.monitor', 'system.write', 'system.write', 'system.reset', { reset: 'system.reset' }),
    'staff-announcements': CRUD('staff_announcements.view', 'staff_announcements.write', 'staff_announcements.write', 'staff_announcements.delete', { publish: 'staff_announcements.publish' }),
    'staff-briefing': CRUD('staff_briefing.view', 'staff_briefing.write', 'staff_briefing.write', 'staff_briefing.delete', { finalize: 'staff_briefing.finalize' }),
    'staff-payroll': CRUD('staff_payroll.view', 'staff_payroll.write', 'staff_payroll.write', 'staff_payroll.delete', { export: 'staff_payroll.export', finalize: 'staff_payroll.finalize', payment: 'staff_payroll.finalize' }),
    'staff-points': CRUD('staff_points.view', 'staff_points.write', 'staff_points.write', 'staff_points.reset', { reset: 'staff_points.reset' }),
    'staff-workdesk': CRUD('staff_workdesk.view', 'staff_workdesk.write', 'staff_workdesk.write', 'staff_workdesk.delete', { finalize: 'staff_workdesk.write' }),
    status: CRUD('system.monitor', 'system.monitor', 'system.monitor', 'system.reset'),
    'sunday-appointments': CRUD('online_queue.view', 'online_queue.write', 'online_queue.write', 'online_queue.delete', { sync: 'online_queue.sync', reset: 'online_queue.delete' }),
    'sunday-clinic': CRUD('sunday_clinic.view', 'sunday_clinic.create', 'sunday_clinic.edit', 'medical_records.delete', { export: 'medical_records.export', reset: 'medical_records.reset_section', finalize: 'medical_records.finalize' }),
    suppliers: CRUD('suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete'),
    'support-chat': CRUD('support_chat.view', 'support_chat.write', 'support_chat.write', 'support_chat.delete', { finalize: 'support_chat.write' }),
    surgery: CRUD('medical_records.view', 'medical_records.create', 'medical_records.edit', 'medical_records.delete', { finalize: 'medical_records.finalize', export: 'medical_records.export' }),
    system: CRUD('system.monitor', 'system.write', 'system.write', 'system.reset', { reset: 'system.reset', export: 'system.monitor' }),
    'tanya-stats': CRUD('tanya_finance.view', 'tanya_finance.view', 'tanya_finance.view', 'tanya_finance.view', { export: 'tanya_finance.export' }),
    'tanya-subscriptions': CRUD('tanya_finance.view', 'tanya_finance.view', 'tanya_finance.view', 'tanya_finance.view', { payment: 'tanya_finance.view', export: 'tanya_finance.export' }),
    'usg-bulk-upload': CRUD('usg_exam.view', 'usg_exam.create', 'usg_exam.edit', 'usg_exam.bulk_delete', { sync: 'usg_exam.sync', bulk_delete: 'usg_exam.bulk_delete' }),
    'usg-photos': CRUD('usg_exam.view', 'usg_exam.create', 'usg_exam.edit', 'usg_exam.delete', { export: 'medical_records.export' }),
    'usg-reader': CRUD('usg_reader.use', 'usg_reader.use', 'usg_reader.use', 'usg_reader.use'),
    'visit-invoices': CRUD('billing.view', 'billing.create', 'billing.create', 'billing.reset', { payment: 'billing.process_payment', export: 'billing.export', finalize: 'billing.finalize' }),
    visits: CRUD('visits.view', 'visits.create', 'visits.edit', 'visits.delete', { export: 'patients.export', merge: 'patients.merge' })
});

const PATIENT_DEFAULT_SOURCES = new Set([
    'contraction-timer', 'doctors', 'fertility-calendar', 'kick-counter',
    'patient-estimasi-biaya', 'patient-notifications', 'patient-workdesk',
    'patients-auth', 'subscriptions'
]);

const INTEGRATION_SOURCES = new Set([
    'ci-performance', 'clinic-monitor', 'comm-integration',
    'operation-data', 'operation-data-integration'
]);

// These routers are mounted below a verified private parent router. Their local
// declarations intentionally omit duplicate JWT middleware.
const INHERITED_PRIVATE_SOURCES = new Set([
    'assistant-daf', 'assistant-daf-ai', 'gambiran-resumes', 'morbid-cases', 'surgery'
]);

function isAuthenticated(route) {
    return /\bverify(?:Token|StaffToken|PatientToken)\b|\brequire(?:Permission|Role|Roles|Superadmin|MenuAccess)\b|\bauthenticate\b/.test(`${route.fileMiddleware} ${route.handlerPrefix}`);
}

function specialAction(routePath) {
    const value = routePath.toLowerCase();
    if (/bulk[^/]*(?:delete|remove)|(?:delete|remove)[^/]*bulk/.test(value)) return 'bulk_delete';
    if (/\bmerge\b/.test(value)) return 'merge';
    if (/publish|unpublish/.test(value)) return 'publish';
    if (/payment|payroll|paid|receipt/.test(value)) return 'payment';
    if (/export|download|pdf|excel|print/.test(value)) return 'export';
    if (/reset|clear|cleanup|purge|recover/.test(value)) return 'reset';
    if (/sync|import|reconcile|run-robot|refresh-source/.test(value)) return 'sync';
    if (/final|complete|close|archive|restore|approve|confirm/.test(value)) return 'finalize';
    return null;
}

function resolvePolicyPermission(route, policy) {
    const special = specialAction(route.routePath);
    if (special && policy.specials[special]) return policy.specials[special];
    if (route.method === 'GET') return policy.view;
    if (route.method === 'DELETE') return policy.delete || policy.write;
    if (route.method === 'POST') return policy.create || policy.write;
    return policy.write || policy.create;
}

function resolveAuthRoute(route) {
    const value = route.routePath;
    if (/^\/api\/auth\/(?:login|patient-login|forgot-password|reset-password|register|verify-email|resend-verification|set-password)$/.test(value)) {
        return { exemption: 'activation', ruleId: 'auth-activation' };
    }
    if (/^\/api\/auth\/(?:me|profile|set-initial-password|mark-profile-completed|change-password|staff-avatar\/)/.test(value)) {
        return { exemption: value.includes('profile') ? 'staff_profile' : 'staff_identity', ruleId: 'staff-self-service' };
    }
    if (value === '/api/staff/verify') return { exemption: 'staff_identity', ruleId: 'staff-identity' };
    if (/^\/api\/admin\/(?:clear-chat-logs|cleanup-email)/.test(value)) {
        return { exemption: 'emergency_recovery', ruleId: 'doctor-emergency-recovery' };
    }
    return null;
}

function resolveAccessControlRoute(route) {
    if (/^(?:\/api\/access-control)?\/invitations\/(?:validate|accept)$/.test(route.routePath)) {
        return { exemption: 'activation', ruleId: 'staff-access-activation' };
    }
    if (/^(?:\/api\/access-control)?\/me$/.test(route.routePath)) {
        return { exemption: 'staff_identity', ruleId: 'staff-access-identity' };
    }
    return { permission: 'access.manage', ruleId: 'staff-access-management' };
}

function resolveRouteAccess(route) {
    if (route.sourceFile === 'access-control') return resolveAccessControlRoute(route);
    if (route.sourceFile === 'account-access-self') return { exemption: 'staff_identity', ruleId: 'staff-access-identity' };
    if (route.sourceFile === 'chat') return { exemption: 'staff_chat', ruleId: 'staff-chat' };
    if (route.sourceFile === 'auth') {
        const authResolution = resolveAuthRoute(route);
        if (authResolution) return authResolution;
    }
    if (route.sourceFile === 'role-visibility') {
        return { exemption: 'legacy_access_adapter', ruleId: 'legacy-role-visibility' };
    }
    if (route.sourceFile === 'rum') return { exemption: 'telemetry', ruleId: 'browser-telemetry' };
    if (route.sourceFile === 'xendit-webhook') return { exemption: 'payment_webhook', ruleId: 'xendit-webhook' };
    if (route.sourceFile === 'ci-performance') return { exemption: 'ci_oidc', ruleId: 'ci-oidc' };
    if (INTEGRATION_SOURCES.has(route.sourceFile) && !/verifyStaffToken|verifyToken/.test(route.handlerPrefix)) {
        return { exemption: 'integration_api_key', ruleId: `integration-${route.sourceFile}` };
    }

    const patientMiddleware = /\bverifyPatientToken\b/.test(`${route.fileMiddleware} ${route.handlerPrefix}`);
    const explicitStaffMiddleware = /\bverifyStaffToken\b|\brequire(?:Permission|Role|Roles|Superadmin|MenuAccess)\b/.test(`${route.fileMiddleware} ${route.handlerPrefix}`);
    if (patientMiddleware || (PATIENT_DEFAULT_SOURCES.has(route.sourceFile) && !explicitStaffMiddleware)) {
        return { exemption: 'patient', ruleId: `patient-${route.sourceFile}` };
    }

    if (!isAuthenticated(route) && !INHERITED_PRIVATE_SOURCES.has(route.sourceFile)) {
        return { exemption: 'public', ruleId: `public-${route.sourceFile}` };
    }

    const policy = SOURCE_POLICIES[route.sourceFile];
    if (!policy) return null;
    const requiredPermission = resolvePolicyPermission(route, policy);
    if (!requiredPermission) return null;
    return {
        permission: requiredPermission,
        ruleId: `staff-${route.sourceFile}`
    };
}

module.exports = {
    MENU_PERMISSION_MAP,
    LEGACY_MENU_MODULE_MAP,
    NAMED_EXEMPTIONS,
    SOURCE_POLICIES,
    STAFF_NAVIGATION_MAP,
    resolveRouteAccess,
    specialAction
};
