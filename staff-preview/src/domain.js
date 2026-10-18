import {
  ROLE_IDS,
  ROLE_NAMES,
} from "../../staff/public/scripts/role-constants.js";
export { ROLE_IDS, ROLE_NAMES };
const base = [
  "navigation.dashboard",
  "navigation.kantor_saya",
  "navigation.klinik_privat",
  "navigation.kelola_pasien",
  "docboard.view",
  "announcements.view",
  "online_queue.view",
  "appointments.view",
  "patients.view",
  "medical_records.view",
  "staff_points.view",
];
const clinical = [
  "lab_exam.view",
  "lab_exam.create",
  "lab_exam.edit",
  "medical_records.create",
  "medical_records.edit",
  "medical_records.export",
  "patient_documents.create",
  "usg_exam.create",
  "navigation.bulk_upload_usg",
  "docboard.write",
];
const admin = [
  "patients.create",
  "patients.edit",
  "visits.create",
  "visits.edit",
  "appointments.create",
  "appointments.edit",
  "online_queue.write",
  "navigation.pasien_baru",
  "navigation.obat_alkes",
  "obat_alkes.create",
  "obat_alkes.edit",
  "suppliers.view",
  "navigation.penjualan_obat",
  "navigation.keuangan",
  "billing.view",
  "billing.create",
  "billing.process_payment",
  "medications.view",
  "stock.view",
];
export const personas = [
  {
    id: ROLE_IDS.DOKTER,
    key: ROLE_NAMES.DOKTER,
    label: "Dokter",
    name: "Dokter Demo",
    protected: true,
    permissions: [],
  },
  {
    id: ROLE_IDS.ADMIN,
    key: ROLE_NAMES.ADMIN,
    label: "Administrasi",
    name: "Alya · Demo",
    permissions: [
      ...base,
      ...admin,
      ...clinical,
      "billing.finalize",
      "navigation.staff_briefing",
      "logs.view",
    ],
  },
  {
    id: ROLE_IDS.BIDAN,
    key: ROLE_NAMES.BIDAN,
    label: "Bidan",
    name: "Nadia · Demo",
    permissions: [...base, ...clinical, "medications.view"],
  },
  {
    id: ROLE_IDS.FRONT_OFFICE,
    key: ROLE_NAMES.FRONT_OFFICE,
    label: "Front Office",
    name: "Rara · Demo",
    permissions: [
      ...base,
      ...admin,
      "support_chat.view",
      "patient_questions.view",
    ],
  },
  {
    id: ROLE_IDS.MANAGERIAL,
    key: ROLE_NAMES.MANAGERIAL,
    label: "Managerial",
    name: "Maya · Demo",
    permissions: [
      ...base,
      ...admin,
      "finance_analysis.view",
      "analytics.view",
      "navigation.staff_briefing",
      "navigation.staff_payroll",
      "logs.view",
    ],
  },
];
export const scenarios = [
  ["normal", "Normal"],
  ["empty", "Kosong"],
  ["loading", "Memuat"],
  ["error", "Gagal"],
  ["offline", "Offline"],
  ["denied", "Tanpa akses"],
  ["conflict", "Konflik versi"],
];
export const locations = {
  klinik_private: "Klinik Privat",
  rsia_melinda: "RSIA Melinda",
  rsud_gambiran: "RSUD Gambiran",
  rs_bhayangkara: "RS Bhayangkara",
};
export const categories = {
  obstetri: "Obstetri",
  gyn_repro: "Ginekologi Reproduksi",
  gyn_special: "Ginekologi Khusus",
};
export const canBill = (visit) => visit?.location === "klinik_private";
export const canAccess = (screen, persona) =>
  !!screen &&
  (!screen.permission ||
    persona?.protected ||
    (!screen.restricted && persona?.permissions?.includes(screen.permission)));
export const hasPermission = (persona, permission) =>
  Boolean(persona?.protected || persona?.permissions?.includes(permission));
const writePermissions = {
  patients: "patients.edit",
  "new-patients": "patients.create",
  queue: "online_queue.write",
  melinda: "hospital_appointments.edit",
  gambiran: "hospital_appointments.edit",
  bhayangkara: "hospital_appointments.edit",
  schedule: "appointments.edit",
  appointments: "appointments.edit",
  booking: "booking.manage",
  attention: "patient_access.manage",
  blocklist: "patient_access.manage",
  medications: "obat_alkes.edit",
  stock: "stock.update",
  suppliers: "suppliers.edit",
  services: "settings.services_manage",
  prescriptions: "medications.select",
  sales: "medications.sales_write",
  estimate: "cost_estimates.write",
  invoices: "billing.create",
  payment: "billing.process_payment",
  closing: "billing.finalize",
  briefing: "staff_briefing.write",
  points: "staff_points.write",
  payroll: "staff_payroll.write",
  announcements: "announcements.edit",
  voting: "polls.write",
  classes: "birth_classes.write",
  greetings: "greeting_cards.write",
  testimonials: "greeting_cards.write",
  articles: "articles.write",
  stories: "community_chat.moderate",
  access: "access.manage",
  settings: "settings.system",
  sync: "integrations.sync",
  import: "medical_import.use",
  "bulk-usg": "usg_exam.create",
  questions: "patient_questions.write",
  support: "support_chat.write",
  community: "community_chat.write",
};
export const canWrite = (screen, persona) =>
  Boolean(
    screen &&
      (persona?.protected ||
        ["profile", "team-chat"].includes(screen.id) ||
        ["docboard/settings", "docboard/preferences"].includes(screen.id) ||
        hasPermission(persona, writePermissions[screen.id]) ||
        (screen.kind === "clinical" &&
          hasPermission(
            persona,
            screen.id === "drd/tagihan"
              ? "billing.create"
              : "medical_records.edit",
          )) ||
        (screen.kind === "lab" &&
          (hasPermission(persona, "lab_exam.create") ||
            hasPermission(persona, "lab_exam.edit"))) ||
        (screen.id.startsWith("docboard/") &&
          hasPermission(persona, "docboard.write"))),
  );
export function filterResources(
  rows,
  { date, search = "", status = "Semua" } = {},
) {
  return rows.filter(
    (row) =>
      (!date || row.date === date) &&
      (status === "Semua" || row.status === status) &&
      `${row.name} ${row.mr_id || ""} ${row.notes || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
}
export function parseNumeric(raw) {
  const text = String(raw ?? "").trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(text) || /^-?\d{1,3}[.,]\d{3}$/.test(text))
    return null;
  return Number(text.replace(",", "."));
}
export function validateLabForPublish(lab) {
  if (
    !lab.reviewed ||
    !lab.parameters?.length ||
    lab.parameters.some((p) => !String(p.raw || "").trim() || !p.reviewed)
  )
    return "Periksa seluruh nilai dan tandai semua baris sebelum menerbitkan.";
  if (
    lab.parameters.some(
      (p) =>
        /^-?\d{1,3}[.,]\d{3}$/.test(p.raw) &&
        (p.numeric_value === null ||
          p.numeric_value === undefined ||
          p.numeric_value === "" ||
          !Number.isFinite(Number(p.numeric_value))),
    )
  )
    return "Pemisah angka ambigu. Konfirmasikan nilai numerik terlebih dahulu.";
  if (lab.sources?.length && !lab.identity_resolved)
    return "Cocokkan identitas pasien dan tanggal pada sumber sebelum menerbitkan.";
  return "";
}
export function compareParameters(current, previous) {
  return current.map((p) => {
    const old = previous.find((x) => x.code === p.code) || null;
    const a = parseNumeric(p.raw),
      b = old ? parseNumeric(old.raw) : null;
    return {
      ...p,
      previous: old,
      delta:
        old && p.unit === old.unit && a !== null && b !== null
          ? Math.round((a - b) * 1000) / 1000
          : null,
    };
  });
}
export const money = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
export const displayDate = (value) =>
  value
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`))
    : "Tidak dicantumkan";
export function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );
}
export function shiftDate(offset) {
  const date = new Date(`${today()}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + offset);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(
    date,
  );
}
