import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const registry = require("../../staff/backend/config/accessControlRegistry.js");

test("all Staff containers, navigation grants and DocBoard routes have a usable preview destination", async () => {
  assert.ok(
    existsSync(new URL("../src/catalog.js", import.meta.url)),
    "The complete screen catalogue is required",
  );
  const { screens, sourceMap } = await import("../src/catalog.js");
  const html = read("../../staff/public/index-adminlte.html");
  const pages = [...html.matchAll(/<div id="([^"]+-page)"/g)].map((m) => m[1]);
  const navs = Object.keys(registry.STAFF_NAVIGATION_MAP);
  const docRoutes = [
    ...read("../../docboard/src/app.jsx").matchAll(
      /path="(\/docboard\/[^"\s]*)"/g,
    ),
  ].map((m) => m[1]);
  for (const source of [...pages, ...navs, ...docRoutes]) {
    assert.ok(sourceMap[source], `Unmapped source: ${source}`);
    assert.ok(
      screens.find((s) => s.id === sourceMap[source]),
      `No destination: ${source}`,
    );
  }
  assert.equal(new Set(screens.map((s) => s.id)).size, screens.length);
  for (const screen of screens) {
    assert.ok(
      screen.title && screen.group && screen.icon && screen.kind,
      screen.id,
    );
    assert.ok(screen.source, `Missing source reference: ${screen.id}`);
  }
});

test("local edits reopen, keep deliberate clearing and isolate records and drafts by patient/DRD", async () => {
  const { createDemoStore } = await import("../src/store.js");
  const memory = new Map([["real-staff-key", "keep"]]);
  const storage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
  let store = createDemoStore(storage);
  const first = store.list("patients")[0];
  store.save(
    "patients",
    { ...first, name: "Nama panjang untuk uji", notes: "" },
    first.version,
  );
  store.setDraft("drd/planning", "visit-1", { notes: "Isian dokter" });
  store.setDraft("drd/planning", "visit-2", { notes: "" });
  store = createDemoStore(storage);
  assert.equal(store.get("patients", first.id).notes, "");
  assert.equal(store.get("patients", first.id).name, "Nama panjang untuk uji");
  assert.equal(store.getDraft("drd/planning", "visit-1").notes, "Isian dokter");
  assert.equal(store.getDraft("drd/planning", "visit-2").notes, "");
  store.reset();
  assert.equal(memory.get("real-staff-key"), "keep");
  assert.equal(store.getDraft("drd/planning", "visit-1"), null);
});

test("version conflict rejects stale writes, published corrections preserve last visible revision, delete is local", async () => {
  const { createDemoStore } = await import("../src/store.js");
  const store = createDemoStore(null);
  let row = store.list("laboratory")[0];
  row = store.publish("laboratory", row.id, row.version);
  const original = structuredClone(row.published);
  const edit = store.save(
    "laboratory",
    { ...row, notes: "Koreksi manual" },
    row.version,
  );
  assert.deepEqual(edit.published, original);
  assert.equal(edit.status, "Ada koreksi");
  assert.throws(
    () => store.save("laboratory", { ...row, notes: "Stale" }, row.version),
    /versi/i,
  );
  const published = store.publish("laboratory", edit.id, edit.version);
  const repeat = store.publish("laboratory", published.id, published.version);
  assert.equal(repeat.version, published.version);
  assert.equal(repeat.published.notes, "Koreksi manual");
  store.remove("laboratory", repeat.id, repeat.version);
  assert.equal(
    store.list("laboratory").some((x) => x.id === repeat.id),
    false,
  );
});

test("lab numeric ambiguity stays explicit and BUN is never merged into urea", async () => {
  const { compareParameters, parseNumeric } = await import("../src/domain.js");
  assert.equal(parseNumeric("9.370"), null);
  assert.equal(parseNumeric("9,37"), 9.37);
  const rows = compareParameters(
    [
      { code: "bun", raw: "11", unit: "mg/dL" },
      { code: "hb", raw: "12.5", unit: "g/dL" },
    ],
    [
      { code: "urea", raw: "11", unit: "mg/dL" },
      { code: "hb", raw: "11.5", unit: "g/dL" },
    ],
  );
  assert.equal(rows.find((x) => x.code === "bun").previous, null);
  assert.equal(rows.find((x) => x.code === "hb").delta, 1);
  assert.equal(
    compareParameters(
      [{ code: "hb", raw: "12", unit: "g/dL" }],
      [{ code: "hb", raw: "120", unit: "g/L" }],
    )[0].delta,
    null,
  );
});

test("billing is only available on private clinic visits; simulated grants use project permission keys", async () => {
  const { canBill, canAccess, personas } = await import("../src/domain.js");
  const { screens } = await import("../src/catalog.js");
  assert.equal(canBill({ location: "klinik_private" }), true);
  assert.equal(canBill({ location: "rsia_melinda" }), false);
  assert.equal(personas.length, 5);
  const doctor = personas.find((p) => p.protected);
  assert.ok(screens.every((s) => canAccess(s, doctor)));
  assert.equal(
    canAccess(
      screens.find((s) => s.id === "access"),
      { permissions: [] },
    ),
    false,
  );
  assert.equal(
    canAccess(
      screens.find((s) => s.id === "access"),
      { permissions: ["access.manage"] },
    ),
    true,
  );
});

test("publication rejects ambiguous OCR numbers, missing review and unresolved source identities", async () => {
  const { validateLabForPublish } = await import("../src/domain.js");
  assert.equal(
    typeof validateLabForPublish,
    "function",
    "Publication needs a complete review contract",
  );
  const lab = {
    name: "Hasil demo",
    reviewed: true,
    identity_resolved: true,
    sources: [],
    parameters: [
      { name: "Leukosit", raw: "9.370", reviewed: true, numeric_value: null },
    ],
  };
  assert.match(validateLabForPublish(lab), /ambigu/i);
  lab.parameters[0].numeric_value = 9370;
  assert.equal(validateLabForPublish(lab), "");
  lab.sources = [{ id: "sample" }];
  lab.identity_resolved = false;
  assert.match(validateLabForPublish(lab), /identitas/i);
  lab.identity_resolved = true;
  lab.parameters[0].reviewed = false;
  assert.match(validateLabForPublish(lab), /periksa/i);
});

test("every resource page has meaningful form fields and synthetic records; inaccessible storage stays usable", async () => {
  const { screens } = await import("../src/catalog.js");
  const { definitions } = await import("../src/definitions.js");
  const { createDemoStore } = await import("../src/store.js");
  const store = createDemoStore(null);
  for (const screen of screens.filter((s) => s.kind === "resource")) {
    const def = definitions[screen.id];
    assert.ok(def, screen.id);
    assert.ok(def.description && def.fields.length > 1, screen.id);
    assert.ok(store.list(screen.id).length, screen.id);
    assert.equal(
      new Set(def.fields.map((f) => f.key)).size,
      def.fields.length,
      screen.id,
    );
  }
  assert.equal(store.persistent, false);
  const blocked = createDemoStore({
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  });
  assert.ok(blocked.save("patients", { name: "Pasien Fiktif" }));
  assert.equal(blocked.persistent, false);
});

test("quota failures preserve session edits even when old localStorage is still readable", async () => {
  const { createDemoStore, STORAGE_KEY } = await import("../src/store.js");
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
  const initialized = createDemoStore(storage);
  initialized.preferences({ scenario: "normal" });
  storage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  const store = createDemoStore(storage);
  const patient = store.list("patients")[0];
  store.save(
    "patients",
    { ...patient, name: "Session value survives" },
    patient.version,
  );
  assert.equal(
    store.get("patients", patient.id).name,
    "Session value survives",
  );
  assert.equal(store.persistent, false);
  assert.ok(data.get(STORAGE_KEY));
});

test("delete returns a success result so detail workflows can navigate back", async () => {
  const { createDemoStore } = await import("../src/store.js");
  const store = createDemoStore(null);
  const item = store.list("medications")[0];
  assert.ok(store.remove("medications", item.id, item.version));
  assert.equal(store.get("medications", item.id), null);
});

test("navigation grants never imply write permission and daily agendas respect their selected date", async () => {
  const { canWrite, filterResources } = await import("../src/domain.js");
  const { byId } = await import("../src/catalog.js");
  assert.equal(
    canWrite(byId("patients"), { permissions: ["navigation.kelola_pasien"] }),
    false,
  );
  assert.equal(
    canWrite(byId("patients"), { permissions: ["patients.edit"] }),
    true,
  );
  assert.equal(typeof filterResources, "function");
  assert.equal(
    filterResources([{ name: "Agenda", date: "2026-10-18", status: "Aktif" }], {
      date: "2026-10-19",
    }).length,
    0,
  );
});
