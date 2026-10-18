import { useEffect, useState, useRef } from "preact/hooks";
import { useDemo } from "./context.jsx";
import { clinicalSections } from "./catalog.js";
import { clinicalFields } from "./definitions.js";
import { labPanels, panelParameters } from "./fixtures.js";
import {
  canWrite,
  hasPermission,
  canBill,
  compareParameters,
  validateLabForPublish,
  today,
  displayDate,
  money,
} from "./domain.js";
import {
  Button,
  Badge,
  Title,
  Section,
  Empty,
  Notice,
  Field,
  Identity,
  Modal,
  UploadBox,
  Icon,
  Search,
} from "./ui.jsx";

export function Clinical({ screen }) {
  const ctx = useDemo();
  const { store, visit, patient, go } = ctx;
  const section = screen.id.split("/")[1];
  const record = store.list(screen.id).find((r) => r.visit_id === visit.id);
  const [form, setForm] = useState(
    () => store.getDraft(screen.id, visit.id) || record || defaults(),
  );
  const [error, setError] = useState("");
  const active = useRef(true);
  const writable =
    canWrite(screen, ctx.role) &&
    (section !== "identitas" || hasPermission(ctx.role, "patients.edit"));
  function defaults() {
    return section === "identitas"
      ? {
          ...patient,
          id: undefined,
          version: undefined,
          date: visit.date,
          category: visit.category,
          _patientVersion: patient.version,
          _visitVersion: visit.version,
        }
      : section === "tagihan"
        ? {
            consultation: 200000,
            usg: 200000,
            lab: 50000,
            medication: 0,
            discount: 0,
            notes: "",
          }
        : {
            date: today(),
            ...(section === "anamnesa"
              ? {
                  complaint: "Contoh keluhan untuk meninjau formulir.",
                  gravida: 1,
                  para: 0,
                  abortus: 0,
                  anak_hidup: 0,
                }
              : section === "planning"
                ? {
                    treatment: "Contoh rencana tatalaksana fiktif.",
                    medications: "",
                    followup: "",
                    education: "",
                  }
                : {}),
          };
  }
  useEffect(() => {
    setForm(
      store.getDraft(screen.id, visit.id) ||
        store.list(screen.id).find((r) => r.visit_id === visit.id) ||
        defaults(),
    );
    setError("");
    ctx.setDirty(Boolean(store.getDraft(screen.id, visit.id)));
    active.current = true;
    return () => {
      active.current = false;
      ctx.setDirty(false);
    };
  }, [screen.id, visit.id]);
  const set = (key, value) => {
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      store.setDraft(screen.id, visit.id, next);
      return next;
    });
    ctx.setDirty(true);
  };
  function save() {
    if (!writable) return;
    if (section === "identitas" && !form.name?.trim()) {
      setError("Nama pasien wajib diisi.");
      return;
    }
    if (
      section === "identitas" &&
      (store.get("patients", patient.id)?.version !== form._patientVersion ||
        store.get("visits", visit.id)?.version !== form._visitVersion)
    ) {
      setError(
        "Konflik versi identitas atau kunjungan. Muat ulang versi tersimpan sebelum menyimpan.",
      );
      return;
    }
    const next = ctx.save(
      screen.id,
      {
        ...form,
        id: record?.id,
        name: section === "identitas" ? form.name : screen.title,
        ...(section === "identitas"
          ? {
              _patientVersion: form._patientVersion + 1,
              _visitVersion: form._visitVersion + 1,
            }
          : {}),
        visit_id: visit.id,
        patient_id: patient.id,
        status: "Draf",
      },
      form.version,
      (e) => setError(e),
    );
    if (next) {
      if (section === "identitas") {
        ctx.save(
          "patients",
          {
            ...patient,
            name: form.name,
            birth_date: form.birth_date,
            phone: form.phone,
            address: form.address,
          },
          form._patientVersion,
        );
        ctx.save(
          "visits",
          { ...visit, category: form.category },
          form._visitVersion,
        );
      }
      store.setDraft(screen.id, visit.id, null);
      setForm(next);
      ctx.setDirty(false);
      ctx.toast(`${screen.title} tersimpan untuk ${visit.mr_id}.`);
    }
  }
  const eligible = clinicalSections.filter(([id]) =>
    id === "pemeriksaan-obstetri"
      ? visit.category === "obstetri"
      : id === "pemeriksaan-ginekologi"
        ? visit.category !== "obstetri"
        : id === "tagihan"
          ? canBill(visit)
          : true,
  );
  const total =
    ["consultation", "usg", "lab", "medication"].reduce(
      (n, key) => n + (Number(form[key]) || 0),
      0,
    ) - (Number(form.discount) || 0);
  return (
    <>
      <Identity visit={visit} patient={patient} onChange={ctx.chooseVisit} />
      <div class="clinical-nav">
        {eligible.map(([id, label]) => (
          <button
            class={`chip ${id === section ? "active" : ""}`}
            onClick={() => go(`drd/${id}`)}
          >
            {label}
          </button>
        ))}
      </div>
      <Title
        kicker={`${visit.mr_id} · REKAM MEDIS`}
        description="Isian demo tersimpan sesuai kunjungan."
      >
        {screen.title}
      </Title>
      {section === "tagihan" && !canBill(visit) ? (
        <Empty
          title="Tagihan tidak tersedia"
          text="Sistem tagihan digunakan untuk kunjungan Klinik Privat."
          action={
            <Button onClick={ctx.chooseVisit}>Pilih DRD Klinik Privat</Button>
          }
        />
      ) : (
        <>
          {error && (
            <Notice tone="danger">
              {error}
              <br />
              <button
                type="button"
                class="text-btn"
                onClick={() =>
                  ctx.confirm(
                    "Muat versi tersimpan",
                    "Ganti isian lokal dengan identitas dan bagian rekam medis yang tersimpan saat ini?",
                    () => {
                      const latest = store
                        .list(screen.id)
                        .find((row) => row.visit_id === visit.id);
                      const currentPatient = store.get("patients", patient.id);
                      const currentVisit = store.get("visits", visit.id);
                      setForm(
                        section === "identitas"
                          ? {
                              ...latest,
                              ...currentPatient,
                              id: latest?.id,
                              version: latest?.version,
                              date: currentVisit.date,
                              category: currentVisit.category,
                              _patientVersion: currentPatient.version,
                              _visitVersion: currentVisit.version,
                            }
                          : latest || defaults(),
                      );
                      store.setDraft(screen.id, visit.id, null);
                      ctx.setDirty(false);
                      setError("");
                    },
                  )
                }
              >
                Muat Versi Tersimpan
              </button>
            </Notice>
          )}
          {!writable && (
            <Notice tone="warning">
              Preset peran ini memiliki akses baca. Beralih peran melalui
              pengaturan Demo untuk mencoba pengisian.
            </Notice>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Section
              title={
                section === "identitas"
                  ? "Identitas & kunjungan"
                  : section === "tagihan"
                    ? "Rincian layanan"
                    : "Hasil & catatan"
              }
            >
              {clinicalFields[section].map((f) => (
                <Field
                  key={f.key}
                  field={f}
                  value={form[f.key]}
                  onChange={(v) => set(f.key, v)}
                  disabled={!writable}
                />
              ))}
            </Section>
            {["usg", "penunjang"].includes(section) && (
              <Section title="Lampiran sumber">
                <UploadBox
                  disabled={!writable}
                  onFiles={async (list) => {
                    if (!writable) return;
                    try {
                      const sources = await ctx.addSources(list);
                      const previous =
                        store.getDraft(screen.id, visit.id) || form;
                      const next = {
                        ...previous,
                        sources: [...(previous.sources || []), ...sources],
                      };
                      store.setDraft(screen.id, visit.id, next);
                      if (active.current) {
                        setForm(next);
                        ctx.setDirty(true);
                      }
                    } catch (error) {
                      setError(error.message);
                    }
                  }}
                />
                <Sources
                  sources={form.sources || []}
                  remove={
                    writable
                      ? (i) =>
                          set(
                            "sources",
                            form.sources.filter((_, n) => n !== i),
                          )
                      : null
                  }
                />
                {section === "penunjang" && (
                  <Button
                    variant="quiet full"
                    icon="flask"
                    onClick={() => go("laboratory")}
                  >
                    Buka Laboratorium Terstruktur
                  </Button>
                )}
              </Section>
            )}
            {section === "tagihan" && (
              <Section title="Ringkasan tagihan">
                <div class="between">
                  <span class="muted">Total layanan demo</span>
                  <strong>{money(total)}</strong>
                </div>
                <div class="spacer" />
                <Button
                  variant="quiet full"
                  icon="wallet"
                  onClick={() => go("payment", { mode: "new" })}
                >
                  Catat Pembayaran
                </Button>
              </Section>
            )}
            {section === "planning" && (
              <Section title="Rencana sebelumnya">
                <p class="muted">
                  Draf Anda tetap terpisah dari riwayat. Tekan tombol untuk
                  melihat contoh sebelumnya.
                </p>
                <Button
                  variant="quiet full"
                  onClick={() =>
                    ctx.sheet({
                      title: "Planning kunjungan sebelumnya",
                      body: (
                        <>
                          <Notice>Riwayat fiktif · {patient.name}</Notice>
                          <p class="muted">
                            Tidak ada resep atau instruksi yang diterapkan
                            otomatis.
                          </p>
                          <div class="spacer" />
                          <Button
                            onClick={() => {
                              ctx.sheet(null);
                              go("history");
                            }}
                          >
                            Buka Riwayat Kunjungan
                          </Button>
                        </>
                      ),
                    })
                  }
                >
                  Lihat Planning Sebelumnya
                </Button>
              </Section>
            )}
            {section === "resume-medis" && (
              <Button
                variant="quiet full"
                icon="print"
                onClick={() =>
                  ctx.print(
                    "Resume Medis · DUMMY",
                    { ...form, name: patient.name, mr_id: visit.mr_id },
                    clinicalFields[section],
                  )
                }
              >
                Cetak / Simpan PDF DUMMY
              </Button>
            )}
            <div class="action-footer">
              <Button
                icon="check"
                variant="primary full"
                onClick={save}
                disabled={!writable}
              >
                Simpan {screen.title}
              </Button>
              <div class="between">
                <small class="muted">Draf lokal · {visit.mr_id}</small>
                <button
                  type="button"
                  class="text-btn danger"
                  onClick={() =>
                    ctx.confirm(
                      "Buang draf bagian ini",
                      "Isian yang belum disimpan pada kunjungan ini akan dibuang.",
                      () => {
                        store.setDraft(screen.id, visit.id, null);
                        setForm(record || defaults());
                        ctx.setDirty(false);
                      },
                    )
                  }
                >
                  Buang Draf
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </>
  );
}

export function Sources({ sources, remove }) {
  const ctx = useDemo();
  return (
    sources.length > 0 && (
      <div class="source-list">
        {sources.map((source, i) => (
          <div class="source-item" key={source.id || i}>
            <button
              type="button"
              class="text-btn"
              onClick={() => ctx.openSource(source)}
            >
              <Icon name="file" size={26} />
              <br />
              {source.name}
            </button>
            <span class="muted" style={{ fontSize: 9 }}>
              {Math.round(source.size / 1024)} KB
            </span>
            {remove && (
              <button
                type="button"
                class="text-btn danger"
                onClick={() => remove(i)}
              >
                Lepas
              </button>
            )}
          </div>
        ))}
      </div>
    )
  );
}

export function Laboratory({ screen }) {
  const ctx = useDemo();
  const { store, query, go, scenario } = ctx;
  const [search, setSearch] = useState(store.view("laboratory").search || "");
  const [filter, setFilter] = useState("Semua");
  const report = query.item && store.get("laboratory", query.item);
  if (query.mode === "new" || report)
    return (
      <LabEditor
        key={report?.id || `new:${ctx.visit.id}`}
        screen={screen}
        report={report}
      />
    );
  const reports =
    scenario === "empty"
      ? []
      : store
          .list("laboratory")
          .filter(
            (r) =>
              `${r.name} ${store.get("patients", r.patient_id)?.name} ${r.lab_number || ""}`
                .toLowerCase()
                .includes(search.toLowerCase()) &&
              (filter === "Semua" || r.status === filter),
          );
  return (
    <>
      <Title
        kicker="KLINIK PRIVAT"
        description="Hasil pemeriksaan yang rapi dan terhubung."
      >
        Laboratorium
      </Title>
      <Search
        value={search}
        onInput={(v) => {
          setSearch(v);
          store.view("laboratory", { search: v });
        }}
        placeholder="Cari pasien, DRD, atau nomor lab"
      />
      <Button
        variant="primary full"
        icon="plus"
        disabled={!canWrite(screen, ctx.role)}
        onClick={() => go("laboratory", { mode: "new" })}
      >
        Tambah Hasil
      </Button>
      <div class="spacer" />
      <div class="chips">
        {["Semua", "Draf", "Terbit", "Ada koreksi"].map((s) => (
          <button
            class={`chip ${filter === s ? "active" : ""}`}
            onClick={() => setFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {reports.length ? (
        reports.map((row) => (
          <button
            class="resource-card"
            onClick={() => {
              ctx.setVisit(row.visit_id);
              go("laboratory", { item: row.id });
            }}
          >
            <div class="card-line">
              <div class="row-content">
                <h3>{store.get("patients", row.patient_id)?.name}</h3>
                <p>{row.name}</p>
                <small>{row.lab_number || "Nomor diberikan saat terbit"}</small>
              </div>
              <Badge>{row.status}</Badge>
            </div>
            <div class="card-foot">
              <Icon name="flask" size={13} />
              <span>
                {displayDate(row.date)} ·{" "}
                {store.get("visits", row.visit_id)?.mr_id}
              </span>
              <Icon name="arrow" size={15} />
            </div>
          </button>
        ))
      ) : (
        <Empty
          title="Belum ada hasil lab"
          text="Mulai dari foto sumber atau isian manual."
        />
      )}
    </>
  );
}
function LabEditor({ screen, report }) {
  const ctx = useDemo();
  const { store, go } = ctx;
  const visit = report ? store.get("visits", report.visit_id) : ctx.visit;
  const patient = store.get("patients", visit.patient_id);
  const scope = report?.id || `new:${visit.id}`;
  const cached = store.getDraft("laboratory", scope);
  const initial = () =>
    cached ||
    structuredClone(report) || {
      name: "Hasil Pemeriksaan Laboratorium",
      date: today(),
      parameters: [],
      sources: [],
      notes: "",
      technician: "ACHMAD SHOLEH, A.MD.",
      license: "503/0126/SIP-SIK/419.104/2024",
      reviewed: false,
      identity_resolved: false,
    };
  const [form, setForm] = useState(initial);
  const [candidate, setCandidate] = useState(null);
  const [panel, setPanel] = useState("Darah Lengkap");
  const [error, setError] = useState("");
  const active = useRef(true);
  const [comparing, setComparing] = useState(false);
  const writable = canWrite(screen, ctx.role) && canBill(visit);
  useEffect(() => {
    if (report && report.visit_id !== visit.id) ctx.setVisit(report.visit_id);
    ctx.setDirty(Boolean(cached));
    active.current = true;
    return () => {
      active.current = false;
      ctx.setDirty(false);
    };
  }, []);
  useEffect(() => {
    if (!report) {
      setForm(
        store.getDraft("laboratory", `new:${visit.id}`) || {
          ...initial(),
          parameters: [],
          sources: [],
        },
      );
      setCandidate(null);
      ctx.setDirty(Boolean(store.getDraft("laboratory", `new:${visit.id}`)));
    }
  }, [visit.id]);
  const set = (key, value) => {
    setForm((previous) => {
      const next = {
        ...previous,
        [key]: value,
        reviewed: key === "reviewed" ? value : false,
      };
      store.setDraft("laboratory", scope, next);
      return next;
    });
    ctx.setDirty(true);
  };
  const updateParam = (i, key, value) => {
    const arr = structuredClone(form.parameters);
    arr[i][key] = value;
    if (key !== "reviewed") arr[i].reviewed = false;
    set("parameters", arr);
  };
  function save() {
    if (!canBill(visit)) {
      setError("Pilih pasien dan DRD Klinik Privat.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama pemeriksaan wajib diisi.");
      return;
    }
    const next = ctx.save(
      "laboratory",
      { ...form, id: report?.id, patient_id: patient.id, visit_id: visit.id },
      form.version,
      (error) => setError(error),
    );
    if (next) {
      store.setDraft("laboratory", scope, null);
      setForm(next);
      ctx.setDirty(false);
      ctx.toast("Draf hasil laboratorium tersimpan.");
      go("laboratory", { item: next.id }, true);
    }
  }
  function publish() {
    if (ctx.dirty || store.getDraft("laboratory", scope)) {
      setError("Simpan perubahan draf sebelum menerbitkan.");
      return;
    }
    const validation = validateLabForPublish(form);
    if (validation) {
      setError(validation);
      return;
    }
    const published = ctx.publish("laboratory", report.id, form.version);
    if (published) {
      setForm(published);
      ctx.toast("Hasil terbit ke portal pasien demo.");
      ctx.refresh();
    }
  }
  function apply(replace = false) {
    const incoming = candidate.parameters.map((p) => ({
      ...p,
      reviewed: false,
    }));
    if (replace) set("parameters", incoming);
    else {
      const result = structuredClone(form.parameters);
      for (const p of incoming) {
        const old = result.find((x) => x.code === p.code);
        if (!old) result.push(p);
        else if (!String(old.raw || "").trim()) Object.assign(old, p);
      }
      set("parameters", result);
    }
    setCandidate(null);
    ctx.toast("Kandidat OCR diterapkan. Periksa hasil sebelum menerbitkan.");
  }
  return (
    <>
      <button class="text-btn" onClick={() => go("laboratory")}>
        ← Daftar hasil
      </button>
      <Identity
        visit={visit}
        patient={patient}
        onChange={!report ? ctx.choosePrivateVisit : undefined}
      />
      <Title
        kicker="LABORATORIUM"
        action={report && <Badge>{report.status}</Badge>}
      >
        {report ? "Periksa Hasil" : "Tambah Hasil"}
      </Title>
      {!canBill(visit) && (
        <Notice tone="warning">
          Hasil lab harus ditujukan ke DRD Klinik Privat.{" "}
          <button class="text-btn" onClick={ctx.choosePrivateVisit}>
            Pilih DRD
          </button>
        </Notice>
      )}
      {report?.status === "Ada koreksi" && (
        <Notice>
          Pasien demo tetap melihat versi terbit terakhir sampai koreksi
          diterbitkan.
        </Notice>
      )}
      {error && (
        <Notice tone="danger">
          {error}
          {report && (
            <>
              <br />
              <button
                type="button"
                class="text-btn"
                onClick={() =>
                  ctx.confirm(
                    "Muat laporan tersimpan",
                    "Isian lokal akan diganti oleh laporan tersimpan. Lanjutkan?",
                    () => {
                      const latest = store.get("laboratory", report.id);
                      if (latest) {
                        setForm(latest);
                        store.setDraft("laboratory", scope, null);
                        ctx.setDirty(false);
                        setError("");
                      }
                    },
                  )
                }
              >
                Muat Versi Tersimpan
              </button>
            </>
          )}
        </Notice>
      )}
      <Section title="Pemeriksaan">
        <Field
          field={{ label: "Nama pemeriksaan" }}
          value={form.name}
          disabled={!writable}
          onChange={(v) => set("name", v)}
        />
        <Field
          field={{ label: "Tanggal pemeriksaan", type: "date" }}
          value={form.date}
          disabled={!writable}
          onChange={(v) => set("date", v)}
        />
      </Section>
      <Section
        title="Foto / sumber hasil"
        description="OCR di sini adalah simulasi dengan data fiktif."
      >
        <UploadBox
          disabled={!writable}
          onFiles={async (files) => {
            if (!writable) return;
            try {
              const sources = await ctx.addSources(files);
              const previous = store.getDraft("laboratory", scope) || form;
              const next = {
                ...previous,
                sources: [...previous.sources, ...sources],
                reviewed: false,
                identity_resolved: false,
              };
              store.setDraft("laboratory", scope, next);
              if (active.current) {
                setForm(next);
                ctx.setDirty(true);
              }
            } catch (e) {
              setError(e.message);
            }
          }}
        />
        <Sources
          sources={form.sources}
          remove={
            writable
              ? (i) =>
                  set(
                    "sources",
                    form.sources.filter((_, n) => i !== n),
                  )
              : null
          }
        />
        <div class="spacer" />
        <Button
          variant="quiet full"
          icon="scan"
          disabled={!writable || !form.sources.length}
          onClick={() => {
            setCandidate({
              parameters: Object.keys(labPanels).flatMap((p) =>
                panelParameters(p).map((row) => ({
                  ...row,
                  origin: "ocr",
                  numeric_value: null,
                })),
              ),
              warnings: [
                "Kandidat ini adalah contoh OCR, bukan hasil pembacaan berkas yang Anda pilih.",
                "Pastikan pasien, tanggal, satuan, dan rujukan sesuai sumber.",
              ],
            });
            ctx.toast(
              "Pratinjau OCR simulasi siap. Isian manual belum berubah.",
            );
          }}
        >
          Simulasikan OCR
        </Button>
        {candidate && (
          <div
            class="section"
            style={{ margin: "15px 0 0", background: "#f0f8f4" }}
          >
            <h3>Pratinjau OCR · {candidate.parameters.length} parameter</h3>
            <p class="muted" style={{ marginTop: 8 }}>
              Isian manual tetap dipertahankan sampai Anda memilih menerapkan.
            </p>
            {candidate.warnings.map((w) => (
              <p class="muted" style={{ margin: "10px 0" }}>
                {w}
              </p>
            ))}
            <div style={{ maxHeight: 200, overflow: "auto" }}>
              {candidate.parameters.map((p) => (
                <div
                  class="between"
                  style={{
                    fontSize: 12,
                    padding: "8px 0",
                    borderBottom: "1px solid #d8e8df",
                  }}
                >
                  <span>{p.name}</span>
                  <strong>
                    {p.raw} {p.unit}
                  </strong>
                </div>
              ))}
            </div>
            <div class="spacer" />
            <Button variant="primary full" onClick={() => apply()}>
              Isi Baris Kosong & Tambahkan
            </Button>
            <button
              class="text-btn"
              onClick={() =>
                ctx.confirm(
                  "Ganti seluruh daftar hasil",
                  "Nilai manual di daftar saat ini akan diganti oleh kandidat OCR simulasi.",
                  () => apply(true),
                )
              }
            >
              Ganti Seluruh Daftar
            </button>
          </div>
        )}
      </Section>
      <Section
        title="Parameter & hasil"
        description="Satuan dan rujukan mengikuti isian yang diperiksa."
      >
        <Field
          field={{
            label: "Panel pemeriksaan",
            type: "select",
            options: Object.keys(labPanels),
          }}
          value={panel}
          onChange={setPanel}
        />
        <div class="btns">
          <Button
            variant="quiet"
            icon="plus"
            disabled={!writable}
            onClick={() => {
              const params = panelParameters(panel)
                .filter((p) => !form.parameters.some((x) => x.code === p.code))
                .map((p) => ({ ...p, raw: "", numeric_value: null }));
              set("parameters", [...form.parameters, ...params]);
            }}
          >
            Tambah Panel
          </Button>
          <Button
            icon="plus"
            disabled={!writable}
            onClick={() =>
              set("parameters", [
                ...form.parameters,
                {
                  code: `manual-${crypto.randomUUID()}`,
                  name: "Parameter baru",
                  raw: "",
                  unit: "",
                  reference: "",
                  panel: "Manual",
                  origin: "manual",
                  reviewed: false,
                  numeric_value: null,
                },
              ])
            }
          >
            Baris
          </Button>
        </div>
        {!form.parameters.length && (
          <p class="muted" style={{ padding: "25px 0" }}>
            Tambahkan panel atau terapkan kandidat OCR untuk mulai mengisi.
          </p>
        )}
        {form.parameters.map((p, i) => (
          <div key={`${p.code}:${i}`}>
            <div class="lab-panel-title">
              {i === 0 || form.parameters[i - 1].panel !== p.panel
                ? p.panel
                : ""}
            </div>
            <article class="lab-param">
              <header>
                <strong>{p.name}</strong>
                <button
                  class="icon-btn"
                  aria-label={`Hapus ${p.name}`}
                  disabled={!writable}
                  onClick={() =>
                    set(
                      "parameters",
                      form.parameters.filter((_, n) => n !== i),
                    )
                  }
                >
                  <Icon name="trash" size={16} />
                </button>
              </header>
              <Field
                field={{ label: "Nama parameter" }}
                value={p.name}
                disabled={!writable}
                onChange={(v) => updateParam(i, "name", v)}
              />
              <div class="field-grid">
                <Field
                  field={{ label: "Hasil" }}
                  value={p.raw}
                  disabled={!writable}
                  onChange={(v) => updateParam(i, "raw", v)}
                />
                <Field
                  field={{ label: "Satuan" }}
                  value={p.unit}
                  disabled={!writable}
                  onChange={(v) => updateParam(i, "unit", v)}
                />
              </div>
              <Field
                field={{ label: "Nilai rujukan" }}
                value={p.reference}
                disabled={!writable}
                onChange={(v) => updateParam(i, "reference", v)}
              />
              {/^\d{1,3}[.,]\d{3}$/.test(p.raw) && (
                <Notice tone="warning">
                  Pemisah angka ambigu.
                  <Field
                    field={{
                      label: "Nilai numerik yang dikonfirmasi",
                      type: "number",
                    }}
                    value={p.numeric_value ?? ""}
                    disabled={!writable}
                    onChange={(v) => updateParam(i, "numeric_value", v)}
                  />
                </Notice>
              )}
              <Field
                field={{ label: "Keterangan" }}
                value={p.note}
                disabled={!writable}
                onChange={(v) => updateParam(i, "note", v)}
              />
              <label class="check-label">
                <input
                  type="checkbox"
                  checked={p.reviewed}
                  disabled={!writable}
                  onChange={(e) =>
                    updateParam(i, "reviewed", e.currentTarget.checked)
                  }
                />
                {p.reviewed ? "Sudah diperiksa" : "Perlu diperiksa"} ·{" "}
                {p.origin === "ocr" ? "OCR simulasi" : "Manual"}
              </label>
            </article>
          </div>
        ))}
        <label class="check-label">
          <input
            type="checkbox"
            checked={form.identity_resolved}
            disabled={!writable}
            onChange={(e) => set("identity_resolved", e.currentTarget.checked)}
          />
          Saya telah mencocokkan pasien, DRD, tanggal, dan sumber.
        </label>
        <label class="check-label">
          <input
            type="checkbox"
            checked={form.reviewed}
            disabled={!writable}
            onChange={(e) => set("reviewed", e.currentTarget.checked)}
          />
          Saya telah memeriksa seluruh hasil, satuan, dan rujukan.
        </label>
      </Section>
      <Section title="Petugas & catatan">
        {[
          ["technician", "Petugas laboratorium"],
          ["license", "Nomor SIP / izin"],
          ["notes", "Catatan", "textarea"],
        ].map(([key, label, type]) => (
          <Field
            field={{ label, type }}
            value={form[key]}
            disabled={!writable}
            onChange={(v) => set(key, v)}
          />
        ))}
      </Section>
      <div class="action-footer">
        <div class="btns">
          <Button
            variant="primary"
            icon="check"
            disabled={!writable}
            onClick={save}
          >
            Simpan Draf
          </Button>
          {report && (
            <Button variant="teal" disabled={!writable} onClick={publish}>
              Terbitkan
            </Button>
          )}
        </div>
        {report && (
          <div class="btns" style={{ marginTop: 10 }}>
            <Button
              icon="print"
              onClick={() =>
                ctx.print(
                  `Hasil Laboratorium · ${report.status === "Terbit" ? "Terbit" : "DRAF"}`,
                  {
                    ...form,
                    name: patient.name,
                    mr_id: visit.mr_id,
                    lab_number: report.lab_number,
                  },
                  [],
                  form.parameters,
                )
              }
            >
              PDF Hasil
            </Button>
            <Button icon="history" onClick={() => setComparing(true)}>
              Komparasi
            </Button>
          </div>
        )}
      </div>
      {report && writable && (
        <button
          class="text-btn danger"
          onClick={() =>
            ctx.confirm(
              "Hapus laporan demo",
              "Laporan disembunyikan dari daftar dan portal pasien demo.",
              () => {
                if (ctx.remove("laboratory", report.id, report.version)) {
                  ctx.setDirty(false);
                  go("laboratory", {}, true);
                }
              },
            )
          }
        >
          Hapus Laporan
        </button>
      )}
      {comparing && (
        <Comparison
          report={{ ...report, ...form }}
          onClose={() => setComparing(false)}
        />
      )}
    </>
  );
}
function Comparison({ report, onClose }) {
  const ctx = useDemo();
  const options = ctx.store
    .list("laboratory")
    .filter(
      (r) =>
        r.id !== report.id && r.patient_id === report.patient_id && r.published,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const [id, setId] = useState(
    options.find((r) => r.date < report.date)?.id || options[0]?.id || "",
  );
  const previous = options.find((r) => r.id === id)?.published;
  const rows = compareParameters(report.parameters, previous?.parameters || []);
  return (
    <Modal
      title="Komparasi hasil lab"
      onClose={onClose}
      full
      footer={
        <Button
          icon="print"
          variant="primary full"
          disabled={!previous}
          onClick={() =>
            ctx.print(
              "Komparasi Laboratorium · DUMMY",
              {
                name: ctx.patient.name,
                date: report.date,
                previous_date: previous.date,
              },
              [],
              rows,
            )
          }
        >
          Cetak Komparasi
        </Button>
      }
    >
      <p class="muted">Tanggal sekarang: {displayDate(report.date)}</p>
      <label class="field">
        <span>Laporan pembanding</span>
        <select value={id} onChange={(e) => setId(e.currentTarget.value)}>
          <option value="">Pilih laporan terbit</option>
          {options.map((r) => (
            <option value={r.id}>
              {displayDate(r.date)} · {r.name}
            </option>
          ))}
        </select>
      </label>
      {previous ? (
        <>
          <Notice>
            Satuan berbeda ditampilkan tanpa menghitung selisih. BUN dan ureum
            adalah parameter berbeda.
          </Notice>
          <div class="comparison-scroll">
            <table class="comparison">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Sebelumnya</th>
                  <th>Sekarang</th>
                  <th>Selisih</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr>
                    <td>{p.name}</td>
                    <td>
                      {p.previous
                        ? `${p.previous.raw} ${p.previous.unit}`
                        : "—"}
                    </td>
                    <td>
                      {p.raw} {p.unit}
                    </td>
                    <td>
                      {p.delta === null
                        ? "—"
                        : p.delta > 0
                          ? `+${p.delta}`
                          : p.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Empty
          title="Belum ada pembanding"
          text="Komparasi memakai laporan terbit terstruktur untuk pasien yang sama."
        />
      )}
    </Modal>
  );
}
