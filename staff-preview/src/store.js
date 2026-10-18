import { seed } from "./fixtures.js";
import { ROLE_IDS } from "./domain.js";
export const STORAGE_KEY = "dibya-staff-preview:v1";
export function createDemoStore(storage) {
  let state;
  let persistent = Boolean(storage);
  const initial = () => ({
    records: seed(),
    drafts: {},
    preferences: {
      role: ROLE_IDS.DOKTER,
      scenario: "normal",
      visit: "visit-1",
      widgets: ["queue", "appointments", "tasks", "messages"],
    },
    views: {},
    audit: [],
  });
  function read() {
    try {
      const data = persistent
        ? JSON.parse(storage?.getItem(STORAGE_KEY) || "null")
        : null;
      if (data?.records && data?.drafts && data?.preferences) state = data;
    } catch {
      persistent = false;
    }
    state ||= initial();
    return state;
  }
  function write() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      persistent = false;
    }
    return state;
  }
  const copy = (x) => (x == null ? null : structuredClone(x));
  const conflict = () => {
    throw new Error(
      "Konflik versi. Data demo telah berubah. Muat ulang sebelum menyimpan.",
    );
  };
  read();
  function save(module, row, expected) {
    read();
    const list = (state.records[module] ||= []);
    const i = list.findIndex((x) => x.id === row.id);
    const old = list[i];
    if (old && old.version !== expected) conflict();
    const next = {
      ...copy(row),
      id: old?.id || `demo-${crypto.randomUUID()}`,
      version: (old?.version || 0) + 1,
      updated: Date.now(),
    };
    if (old?.published) {
      next.published = old.published;
      next.status = "Ada koreksi";
    } else next.status ||= "Draf";
    if (i < 0) list.unshift(next);
    else list[i] = next;
    state.audit.unshift({
      name: `${old ? "Mengubah" : "Membuat"} ${module}`,
      detail: next.name || next.id,
      at: Date.now(),
    });
    write();
    return copy(next);
  }
  return {
    list(module) {
      read();
      return copy((state.records[module] || []).filter((x) => !x.deleted));
    },
    get(module, id) {
      read();
      return copy(
        (state.records[module] || []).find((x) => x.id === id && !x.deleted),
      );
    },
    save,
    publish(module, id, version) {
      read();
      const row = (state.records[module] || []).find(
        (x) => x.id === id && !x.deleted,
      );
      if (!row || row.version !== version) conflict();
      if (row.status === "Terbit") return copy(row);
      if (module === "laboratory")
        row.lab_number ||= `LAB-DEMO-${String(row.date).replaceAll("-", "")}-${String((state.records.laboratory || []).filter((l) => l.lab_number).length + 1).padStart(4, "0")}`;
      row.status = "Terbit";
      row.version++;
      row.published = copy({ ...row, published: undefined });
      row.publishedAt = Date.now();
      state.audit.unshift({
        name: `Menerbitkan ${module}`,
        detail: row.name || row.id,
        at: Date.now(),
      });
      write();
      return copy(row);
    },
    remove(module, id, version) {
      read();
      const row = (state.records[module] || []).find((x) => x.id === id);
      if (!row || row.version !== version) conflict();
      row.deleted = true;
      row.version++;
      state.audit.unshift({
        name: `Menghapus ${module}`,
        detail: row.name || row.id,
        at: Date.now(),
      });
      write();
      return copy(row);
    },
    getDraft(module, scope) {
      read();
      return copy(state.drafts[`${module}:${scope}`]);
    },
    setDraft(module, scope, value) {
      read();
      if (value === null) delete state.drafts[`${module}:${scope}`];
      else state.drafts[`${module}:${scope}`] = copy(value);
      write();
    },
    preferences(value) {
      read();
      if (value) {
        Object.assign(state.preferences, value);
        write();
      }
      return copy(state.preferences);
    },
    view(key, value) {
      read();
      if (value) {
        state.views[key] = { ...state.views[key], ...value };
        write();
      }
      return copy(state.views[key] || {});
    },
    audit() {
      read();
      return copy(state.audit);
    },
    get persistent() {
      return persistent;
    },
    reset() {
      state = initial();
      write();
    },
  };
}
