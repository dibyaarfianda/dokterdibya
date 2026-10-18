import { definitions } from "./definitions.js";
import { today, shiftDate, ROLE_IDS } from "./domain.js";
export const patientFixtures = [
  {
    id: "patient-1",
    name: "Nadira Ayu Prameswari",
    birth_date: "1998-05-12",
    phone: "0800-0000-0001",
    address: "Jalan Contoh No. 1 · Kota Demo",
    category: "obstetri",
    gestation: "28 minggu 4 hari",
    status: "Aktif",
    notes: "Seluruh identitas merupakan data fiktif.",
    version: 1,
  },
  {
    id: "patient-2",
    name: "Amelia Safitri",
    birth_date: "1994-09-20",
    phone: "0800-0000-0002",
    address: "Jalan Contoh No. 2 · Kota Demo",
    category: "gyn_repro",
    gestation: "Ginekologi Reproduksi",
    status: "Aktif",
    notes: "Data fiktif untuk pengujian antarmuka.",
    version: 1,
  },
  {
    id: "patient-3",
    name: "Laras Puspita Anggraini",
    birth_date: "1987-02-09",
    phone: "0800-0000-0003",
    address: "Jalan Contoh No. 3 · Kota Demo",
    category: "gyn_special",
    gestation: "Ginekologi Khusus",
    status: "Aktif",
    notes: "Data fiktif untuk pengujian antarmuka.",
    version: 1,
  },
];
export const labPanels = {
  "Darah Lengkap": [
    ["hb", "Hemoglobin", "12.4", "g/dL", "12.0–15.5"],
    ["wbc", "Leukosit", "8.2", "10³/µL", "4.0–11.0"],
    ["rbc", "Eritrosit", "4.3", "10⁶/µL", "3.8–5.2"],
    ["hct", "Hematokrit", "37", "%", "35–47"],
    ["plt", "Trombosit", "248", "10³/µL", "150–400"],
    ["mcv", "MCV", "86", "fL", "80–100"],
    ["mch", "MCH", "28.8", "pg", "27–33"],
    ["mchc", "MCHC", "33.5", "g/dL", "32–36"],
  ],
  "SGOT / SGPT": [
    ["sgot", "SGOT / AST", "22", "U/L", "Tidak dicantumkan"],
    ["sgpt", "SGPT / ALT", "19", "U/L", "Tidak dicantumkan"],
  ],
  "BUN / Kreatinin": [
    ["bun", "BUN", "11", "mg/dL", "Tidak dicantumkan"],
    ["creatinine", "Kreatinin serum", "0.7", "mg/dL", "Tidak dicantumkan"],
  ],
  "Gula & Golongan Darah": [
    ["gda", "Gula darah acak", "104", "mg/dL", "Tidak dicantumkan"],
    ["abo", "Golongan darah", "O", "", ""],
    ["rhesus", "Rhesus", "Positif", "", ""],
  ],
  Serologi: [
    ["hbsag", "HBsAg", "Nonreaktif", "", "Nonreaktif"],
    ["hiv", "HIV", "Nonreaktif", "", "Nonreaktif"],
    ["syphilis", "Sifilis", "Nonreaktif", "", "Nonreaktif"],
  ],
};
export const panelParameters = (panel) =>
  (labPanels[panel] || []).map(([code, name, raw, unit, reference]) => ({
    code,
    name,
    raw,
    unit,
    reference,
    panel,
    origin: "manual",
    reviewed: false,
  }));
export function seed() {
  const records = {
    patients: structuredClone(patientFixtures),
    visits: [
      {
        id: "visit-1",
        name: "Kontrol kehamilan",
        patient_id: "patient-1",
        mr_id: "DRD-DEMO-001",
        category: "obstetri",
        location: "klinik_private",
        date: today(),
        time: "16:30",
        status: "Menunggu",
        version: 1,
      },
      {
        id: "visit-2",
        name: "Konsultasi reproduksi",
        patient_id: "patient-2",
        mr_id: "DRD-DEMO-002",
        category: "gyn_repro",
        location: "klinik_private",
        date: today(),
        time: "17:00",
        status: "Diperiksa",
        version: 1,
      },
      {
        id: "visit-3",
        name: "Konsultasi ginekologi",
        patient_id: "patient-3",
        mr_id: "DRD-DEMO-003",
        category: "gyn_special",
        location: "klinik_private",
        date: today(),
        time: "17:30",
        status: "Selesai",
        version: 1,
      },
      {
        id: "visit-4",
        name: "Kontrol rumah sakit",
        patient_id: "patient-1",
        mr_id: "DRD-DEMO-004",
        category: "obstetri",
        location: "rsia_melinda",
        date: shiftDate(-14),
        time: "09:00",
        status: "Selesai",
        version: 1,
      },
    ],
  };
  for (const [id, definition] of Object.entries(definitions))
    records[id] = definition.names.map((name, i) => ({
      id: `${id.replaceAll("/", "-")}-${i + 1}`,
      name,
      version: 1,
      status: definition.publish
        ? i === 0
          ? "Terbit"
          : "Draf"
        : id === "queue"
          ? ["Menunggu", "Diperiksa", "Selesai"][i]
          : id === "invoices"
            ? i
              ? "Lunas"
              : "Belum lunas"
            : "Aktif",
      patient_id: patientFixtures[i % 3].id,
      date: today(),
      time: ["16:30", "17:00", "17:30"][i % 3],
      location:
        id === "melinda"
          ? "rsia_melinda"
          : id === "gambiran"
            ? "rsud_gambiran"
            : id === "bhayangkara"
              ? "rs_bhayangkara"
              : "klinik_private",
      amount: 450000 + i * 100000,
      paid: i ? 550000 : 0,
      price: 25000 + i * 10000,
      quantity: 1,
      stock: 120 - i * 45,
      physical: 119 - i * 44,
      minimum: 30,
      unit: "Tablet",
      code: `DEMO-00${i + 1}`,
      quota: 12,
      day: "Minggu",
      end: "19:30",
      queue: i + 1,
      period: "Oktober 2026",
      points: 80 - i * 8,
      base: 2500000,
      incentive: 250000,
      deduction: 0,
      contact: "Kontak supplier demo",
      phone: "0800-0000-0099",
      content:
        "Contoh isi untuk meninjau tata letak. Dapat diedit dan disimpan di perangkat ini.",
      notes: "Data fiktif untuk demonstrasi.",
      detail: "Perubahan demo tersimpan di perangkat ini.",
      method: "Transfer",
      mr_id: `DRD-DEMO-00${i + 1}`,
      summary: "Ringkasan kasus fiktif untuk meninjau antarmuka.",
      operation: i ? "Laparoskopi" : "Seksio sesarea",
      diagnosis: "Isian diagnosis fiktif untuk demo.",
      anesthesia: "Spinal",
      asa: "II",
      npo: "Tercatat di asesmen demo",
      team: "Dokter Demo · Bidan Demo",
      email: "contoh@example.invalid",
      job: "Staff Demo",
      value: "Aktif",
      enabled: "Aktif",
      confirmation: "Menunggu konfirmasi",
      open: "Dibuka",
      cutoff: 2,
      reason: "Catatan operasional fiktif.",
      author: "Pasien Demo",
      rating: "5",
      options: "Persiapan persalinan\nPerawatan bayi\nKesehatan wanita",
      venue: "Ruang Kelas Demo",
      result: "Siap",
      solution: "Gunakan Reset Data Demo untuk mengembalikan contoh awal.",
      cash: 450000,
      transfer: 900000,
      qris: 250000,
      difference: 0,
      votes: 18 + i * 5,
      enrolled: 6 + i * 2,
      read: false,
    }));
  records.laboratory = [
    {
      id: "lab-1",
      name: "Hasil Darah Lengkap",
      patient_id: "patient-1",
      visit_id: "visit-1",
      date: today(),
      status: "Draf",
      version: 1,
      notes: "Contoh hasil pemeriksaan fiktif.",
      technician: "ACHMAD SHOLEH, A.MD.",
      license: "503/0126/SIP-SIK/419.104/2024",
      parameters: panelParameters("Darah Lengkap"),
      reviewed: false,
      sources: [],
    },
    {
      id: "lab-2",
      name: "Hasil Darah Lengkap sebelumnya",
      patient_id: "patient-1",
      visit_id: "visit-1",
      date: shiftDate(-28),
      status: "Terbit",
      version: 1,
      notes: "Contoh laporan pembanding.",
      parameters: panelParameters("Darah Lengkap").map((p) => ({
        ...p,
        raw: p.code === "hb" ? "11.8" : p.raw,
        reviewed: true,
      })),
      reviewed: true,
      sources: [],
    },
  ];
  records.laboratory[1].published = structuredClone(records.laboratory[1]);
  ["questions", "team-chat", "support", "community"].forEach(
    (id) =>
      (records[id] = [
        {
          id: `${id}-thread`,
          name:
            id === "team-chat"
              ? "Tim Klinik Privat"
              : id === "support"
                ? "Bantuan Staff"
                : id === "community"
                  ? "Komunitas Ibu"
                  : "Nadira Ayu",
          version: 1,
          status: "Aktif",
          messages: [
            {
              id: "msg-1",
              body:
                id === "team-chat"
                  ? "Persiapan klinik sore sudah siap. Mohon periksa antrean hari ini."
                  : "Selamat sore, saya ingin memastikan jadwal kontrol berikutnya.",
              mine: false,
              time: "15:42",
            },
            {
              id: "msg-2",
              body:
                id === "team-chat"
                  ? "Baik, daftar pasien sudah saya periksa."
                  : "Selamat sore. Jadwal demo Anda tercatat hari ini pukul 16.30.",
              mine: true,
              time: "15:44",
            },
          ],
        },
      ]),
  );
  records.access = [
    {
      id: "access-1",
      name: "Alya · Administrasi",
      role: ROLE_IDS.ADMIN,
      permissions: [
        "navigation.dashboard",
        "navigation.klinik_privat",
        "navigation.kelola_pasien",
      ],
      version: 1,
      status: "Aktif",
    },
    {
      id: "access-2",
      name: "Nadia · Bidan",
      role: ROLE_IDS.BIDAN,
      permissions: ["medical_records.view", "lab_exam.view", "docboard.view"],
      version: 1,
      status: "Aktif",
    },
  ];
  records["docboard/users"] = structuredClone(records.access);
  return records;
}
