export const groups = [
  "Ruang kerja",
  "Klinik & pasien",
  "Rekam medis",
  "Obat & layanan",
  "Keuangan & tim",
  "Percakapan",
  "Konten pasien",
  "Monitoring & sistem",
  "DocBoard",
];
const all = [];
function screen(
  id,
  title,
  group,
  icon,
  kind,
  permission,
  aliases = [],
  extra = {},
) {
  const doc = group === "DocBoard";
  all.push({
    id,
    title,
    group,
    icon,
    kind,
    permission,
    aliases,
    source: doc ? "docboard/src/app.jsx" : "staff/public/index-adminlte.html",
    ...extra,
  });
}
screen(
  "dashboard",
  "Dashboard",
  groups[0],
  "home",
  "dashboard",
  "navigation.dashboard",
  ["dashboard-page", "nav-dashboard"],
);
screen(
  "workdesk",
  "Kantor Saya",
  groups[0],
  "grid",
  "workdesk",
  "navigation.kantor_saya",
  ["nav-kantor-saya", "content-kantor-saya", "kantor-saya.html"],
);
screen("profile", "Profil Saya", groups[0], "user", "resource", null, [
  "profile-settings-page",
  "profile-settings.html",
]);
screen("notifications", "Notifikasi", groups[0], "bell", "resource", null, [
  "notifications-page",
]);
screen("about", "Tentang Aplikasi", groups[0], "info", "about", null);
screen("install", "Pasang PWA", groups[0], "download", "install", null, [
  "install.html",
]);
screen("session", "Sesi Demo", groups[0], "spark", "session", null, [
  "login.html",
  "offline.html",
  "content-no-access-page",
]);
screen(
  "clinic",
  "Janji Temu",
  groups[1],
  "calendar",
  "clinic",
  "navigation.klinik_privat",
  ["klinik-private-page", "nav-klinik-private"],
);
screen(
  "queue",
  "Antrean Online",
  groups[1],
  "queue",
  "resource",
  "online_queue.view",
  ["antrian-online-page", "nav-antrian-online"],
);
screen(
  "melinda",
  "RSIA Melinda",
  groups[1],
  "hospital",
  "resource",
  "navigation.rsia_melinda",
  ["nav-rsia-melinda", "hospital-appointments-page"],
  { location: "rsia_melinda" },
);
screen(
  "gambiran",
  "RSUD Gambiran",
  groups[1],
  "hospital",
  "resource",
  "navigation.rsud_gambiran",
  ["nav-rsud-gambiran"],
  { location: "rsud_gambiran" },
);
screen(
  "bhayangkara",
  "RS Bhayangkara",
  groups[1],
  "hospital",
  "resource",
  "navigation.rs_bhayangkara",
  ["nav-rs-bhayangkara"],
  { location: "rs_bhayangkara" },
);
screen(
  "schedule",
  "Jadwal Praktik",
  groups[1],
  "calendar",
  "resource",
  "appointments.view",
  ["kelola-jadwal-page", "nav-jadwal-booking"],
);
screen(
  "appointments",
  "Kelola Janji Temu",
  groups[1],
  "calendar",
  "resource",
  "appointments.view",
  ["kelola-appointment-page", "appointments-page"],
);
screen(
  "booking",
  "Booking Settings",
  groups[1],
  "sliders",
  "resource",
  "booking.manage",
  ["booking-settings-page", "nav-booking-settings"],
);
screen(
  "patients",
  "Pasien",
  groups[1],
  "users",
  "patients",
  "navigation.kelola_pasien",
  [
    "patient-page",
    "kelola-pasien-page",
    "manage-patients-page",
    "nav-kelola-pasien",
    "hospital-patients-page",
  ],
);
screen(
  "new-patients",
  "Pasien Baru",
  groups[1],
  "userplus",
  "resource",
  "navigation.pasien_baru",
  ["nav-pasien-baru"],
);
screen(
  "history",
  "Riwayat Kunjungan",
  groups[1],
  "history",
  "resource",
  "navigation.kelola_pasien",
  ["nav-record-history"],
);
screen(
  "attention",
  "Perhatian Khusus",
  groups[1],
  "shield",
  "resource",
  "patient_access.manage",
  ["perhatian-khusus-page", "nav-perhatian-khusus"],
);
screen(
  "blocklist",
  "Block List",
  groups[1],
  "shield",
  "resource",
  "patient_access.manage",
  ["patient-block-list-page", "management-nav-block-list"],
);
export const clinicalSections = [
  ["identitas", "Identitas", "user"],
  ["anamnesa", "Anamnesa", "clipboard"],
  ["pemeriksaan", "Pemeriksaan Fisik", "heart"],
  ["pemeriksaan-obstetri", "Pemeriksaan Obstetri", "baby"],
  ["pemeriksaan-ginekologi", "Pemeriksaan Ginekologi", "heart"],
  ["usg", "USG", "scan"],
  ["penunjang", "Penunjang", "flask"],
  ["diagnosis", "Diagnosis", "clipboard"],
  ["planning", "Planning", "check"],
  ["resume-medis", "Resume Medis", "file"],
  ["tagihan", "Tagihan", "wallet"],
];
const clinicalAliases = {
  identitas: ["sunday-clinic-page"],
  anamnesa: ["anamnesa-page"],
  pemeriksaan: ["physical-exam-page"],
  usg: ["usg-exam-page"],
  tagihan: ["cashier-page"],
};
clinicalSections.forEach(([id, title, icon]) =>
  screen(
    `drd/${id}`,
    title,
    groups[2],
    icon,
    "clinical",
    id === "tagihan" ? "billing.view" : "medical_records.view",
    clinicalAliases[id] || [],
    { source: "staff/public/fragments/pages/sunday-clinic-page.html" },
  ),
);
screen(
  "laboratory",
  "Laboratorium",
  groups[2],
  "flask",
  "lab",
  "lab_exam.view",
  ["laboratorium-page", "lab-exam-page", "nav-laboratorium"],
);
screen(
  "payment",
  "Pembayaran",
  groups[4],
  "wallet",
  "resource",
  "billing.process_payment",
);
screen(
  "closing",
  "Closing Klinik",
  groups[4],
  "check",
  "resource",
  "billing.finalize",
);
screen(
  "medications",
  "Obat & Alkes",
  groups[3],
  "pill",
  "resource",
  "navigation.obat_alkes",
  [
    "obat-page",
    "kelola-obat-page",
    "kelola-obat-management-page",
    "management-nav-kelola-obat",
  ],
);
screen(
  "stock",
  "Stok & Stok Opname",
  groups[3],
  "box",
  "resource",
  "stock.view",
);
screen(
  "suppliers",
  "Supplier",
  groups[3],
  "truck",
  "resource",
  "suppliers.view",
  ["kelola-supplier-page", "management-nav-kelola-supplier"],
);
screen(
  "services",
  "Tindakan & Layanan",
  groups[3],
  "heart",
  "resource",
  "navigation.obat_alkes",
  ["tindakan-page", "kelola-tindakan-page", "management-nav-kelola-tindakan"],
);
screen(
  "prescriptions",
  "Template Resep",
  groups[3],
  "clipboard",
  "resource",
  "medications.view",
  ["template-resep-page", "nav-template-resep"],
);
screen(
  "sales",
  "Penjualan Obat",
  groups[3],
  "bag",
  "resource",
  "navigation.penjualan_obat",
  ["penjualan-obat-page", "nav-penjualan-obat"],
);
screen(
  "estimate",
  "Estimasi Biaya",
  groups[4],
  "calculator",
  "resource",
  "navigation.penjualan_obat",
  ["estimasi-biaya-page", "nav-estimasi-biaya"],
);
screen(
  "invoices",
  "Invoice & Keuangan",
  groups[4],
  "receipt",
  "resource",
  "navigation.keuangan",
  ["invoice-history-page", "nav-invoice-history"],
);
screen(
  "finance",
  "Analisa Keuangan",
  groups[4],
  "chart",
  "analytics",
  "finance_analysis.view",
  ["finance-page", "finance-analysis-page", "nav-finance-analysis"],
);
screen(
  "briefing",
  "Briefing Tim",
  groups[4],
  "clipboard",
  "resource",
  "navigation.staff_briefing",
  ["content-staff-briefing", "nav-staff-briefing"],
);
screen(
  "points",
  "Poin Staff",
  groups[4],
  "star",
  "resource",
  "staff_points.view",
  ["content-staff-points"],
);
screen(
  "payroll",
  "Gajian",
  groups[4],
  "wallet",
  "resource",
  "navigation.staff_payroll",
  ["content-staff-payroll", "nav-staff-payroll", "nav-private"],
);
screen(
  "questions",
  "Tanya Dokter",
  groups[5],
  "message",
  "chat",
  "patient_questions.view",
  ["tanya-dokter-page", "nav-tanya-dokter"],
);
screen("team-chat", "Chat Tim", groups[5], "message", "chat", null, [
  "chat-popup.js",
]);
screen(
  "support",
  "Chat Bantuan",
  groups[5],
  "headphones",
  "chat",
  "support_chat.view",
  ["content-support-chat-page", "nav-support-chat"],
);
screen(
  "community",
  "Chat Komunitas",
  groups[5],
  "users",
  "chat",
  "community_chat.view",
  ["community-chat-page", "nav-community-chat"],
);
screen(
  "announcements",
  "Pengumuman",
  groups[6],
  "megaphone",
  "resource",
  "announcements.view",
  ["kelola-pengumuman-page", "nav-pengumuman"],
);
screen(
  "voting",
  "Voting Pasien",
  groups[6],
  "check",
  "resource",
  "navigation.klinik_privat",
  ["voting-page", "nav-voting"],
);
screen(
  "classes",
  "Kelas Dr. Dibya",
  groups[6],
  "baby",
  "resource",
  "navigation.klinik_privat",
  ["birth-class-page", "nav-birth-class"],
);
screen(
  "greetings",
  "Ucapan Kelahiran",
  groups[6],
  "gift",
  "resource",
  "navigation.ucapan_kelahiran",
  ["birth-congrats-page", "nav-birth-congrats"],
);
screen(
  "testimonials",
  "Testimoni Pasien",
  groups[6],
  "star",
  "resource",
  "navigation.ucapan_kelahiran",
  ["birth-testimonials-page", "nav-birth-testimonials"],
);
screen(
  "articles",
  "Artikel Kesehatan",
  groups[6],
  "book",
  "resource",
  "articles.view",
  ["artikel-kesehatan-page", "nav-artikel-kesehatan"],
);
screen(
  "stories",
  "Ruang Cerita",
  groups[6],
  "book",
  "resource",
  "navigation.ruang_cerita",
  ["ruang-cerita-page", "nav-ruang-cerita"],
);
screen(
  "bulk-usg",
  "Upload USG",
  groups[6],
  "upload",
  "upload",
  "navigation.bulk_upload_usg",
  ["bulk-upload-usg-page", "nav-bulk-upload-usg"],
);
screen(
  "access",
  "Kelola Akses",
  groups[7],
  "shield",
  "access",
  "access.manage",
  ["admin-page", "kelola-roles-page", "management-nav-kelola-roles"],
);
screen(
  "settings",
  "Pengaturan",
  groups[7],
  "settings",
  "resource",
  "settings.system",
  ["pengaturan-page", "nav-pengaturan"],
);
screen(
  "staff-activity",
  "Aktivitas Staff",
  groups[7],
  "activity",
  "resource",
  "logs.view",
  ["staff-activity-page", "nav-staff-activity"],
);
screen(
  "patient-activity",
  "Aktivitas Pasien",
  groups[7],
  "activity",
  "resource",
  "patient_activity.view",
  ["patient-activity-page", "nav-patient-activity"],
);
screen(
  "demo-activity",
  "Aktivitas Demo",
  groups[7],
  "activity",
  "resource",
  "logs.view",
  ["guest-activity-page", "nav-guest-activity"],
);
screen("logs", "Log Aktivitas", groups[7], "history", "resource", "logs.view", [
  "log-page",
  "activity-log-page",
]);
screen(
  "troubleshooting",
  "Bantuan & Diagnostik",
  groups[7],
  "headphones",
  "resource",
  "system.monitor",
  ["troubleshooting-page", "nav-troubleshooting"],
);
screen(
  "import",
  "Import Rekam Medis",
  groups[7],
  "upload",
  "upload",
  "medical_import.use",
  ["import-fields-page", "nav-import-fields"],
);
screen(
  "sync",
  "MEDIFY Sync",
  groups[7],
  "refresh",
  "resource",
  "integrations.view",
  ["medify-sync-page", "nav-medify-sync"],
);
screen(
  "portal",
  "Pratinjau Portal Pasien",
  groups[7],
  "phone",
  "portal",
  "patient_demo.manage",
  ["patient-demo-page", "nav-patient-demo"],
);
screen(
  "analytics",
  "Analitik Aktivitas",
  groups[7],
  "chart",
  "analytics",
  "analytics.view",
  ["analytics-page"],
);
screen("catalog", "Katalog Layar", groups[7], "grid", "catalog", null);
const d = (id, title, icon, kind, paths, extra = {}) =>
  screen(
    `docboard/${id}`,
    title,
    groups[8],
    icon,
    kind,
    "docboard.view",
    paths,
    { ...extra },
  );
d("calendar", "Jadwal DocBoard", "calendar", "calendar", [
  "docboard-frame-page",
  "nav-docboard",
  "/docboard/",
]);
d("day", "Agenda Harian", "calendar", "resource", ["/docboard/day/:date"]);
d("surgery", "Operasi", "heart", "resource", [
  "/docboard/surgery",
  "/docboard/surgery/new",
  "/docboard/surgery/edit/:id",
  "/docboard/surgery/:id",
]);
d("postop", "Catatan Pascaoperasi", "clipboard", "resource", [
  "docboard/src/components/PostOpNotesForm.jsx",
]);
d(
  "data",
  "Data Operasi",
  "box",
  "resource",
  ["/docboard/data", "/docboard/data/:id"],
  { restricted: true },
);
d(
  "monitor",
  "Monitor Gambiran",
  "activity",
  "resource",
  ["/docboard/monitor"],
  { restricted: true },
);
d("audit", "Audit Gambiran", "shield", "resource", ["/docboard/audit"], {
  restricted: true,
});
d(
  "morbid",
  "Kasus Morbid",
  "clipboard",
  "resource",
  ["/docboard/morbid-cases", "/docboard/morbid-cases/:id"],
  { restricted: true },
);
d(
  "resume",
  "Resume Gambiran",
  "file",
  "resource",
  ["/docboard/gambiran-resumes", "/docboard/gambiran-resumes/:id"],
  { restricted: true },
);
d("notifications", "Notifikasi DocBoard", "bell", "resource", [
  "/docboard/notifications",
]);
d("alarms", "Alarm Hari Ini", "bell", "resource", ["/docboard/alarms"]);
d("command", "Command Dashboard", "grid", "analytics", ["/docboard/command"]);
d("scientific", "Jadwal Ilmiah", "book", "resource", ["/docboard/scientific"], {
  restricted: true,
});
d("procedures", "Jadwal Tindakan", "heart", "resource", [
  "/docboard/procedures",
]);
d("personal", "Jadwal Pribadi", "user", "resource", ["/docboard/personal"], {
  restricted: true,
});
d("analytics", "Analitik DocBoard", "chart", "analytics", [
  "/docboard/analytics",
]);
d("users", "Pengguna DocBoard", "users", "access", ["/docboard/users"]);
d("settings", "Pengaturan DocBoard", "settings", "resource", [
  "/docboard/settings",
]);
d("preferences", "Preferensi DocBoard", "sliders", "resource", [
  "/docboard/settings/preferences",
]);
export const screens = Object.freeze(all);
export const sourceMap = Object.fromEntries(
  screens.flatMap((s) => s.aliases.map((a) => [a, s.id])),
);
export const byId = (id) => screens.find((s) => s.id === id);
export const tabs = [
  ["dashboard", "Dashboard", "home"],
  ["clinic", "Janji Temu", "calendar"],
  ["docboard/calendar", "DocBoard", "grid"],
  ["patients", "Pasien", "users"],
  ["questions", "Tanya Dokter", "message"],
  ["more", "Lainnya", "menu"],
];
export function tabFor(id) {
  if (id.startsWith("docboard/")) return "docboard/calendar";
  if (
    [
      "clinic",
      "queue",
      "appointments",
      "schedule",
      "booking",
      "melinda",
      "gambiran",
      "bhayangkara",
    ].includes(id) ||
    id.startsWith("drd/")
  )
    return "clinic";
  if (
    ["patients", "history", "new-patients", "attention", "blocklist"].includes(
      id,
    )
  )
    return "patients";
  if (["questions", "team-chat", "support", "community"].includes(id))
    return "questions";
  return id === "dashboard" ? "dashboard" : "more";
}
