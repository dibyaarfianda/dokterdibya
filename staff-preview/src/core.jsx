import { useState, useEffect, useRef } from "preact/hooks";
import { useDemo } from "./context.jsx";
import { screens, groups, byId } from "./catalog.js";
import {
  canAccess,
  canWrite,
  hasPermission,
  personas,
  locations,
  categories,
  money,
  today,
  displayDate,
  shiftDate,
} from "./domain.js";
import {
  Button,
  Badge,
  Title,
  Section,
  Empty,
  Notice,
  Search,
  Icon,
  Field,
  LinkRow,
  Identity,
  UploadBox,
  Modal,
} from "./ui.jsx";

export function Dashboard() {
  const { store, role, go, setVisit } = useDemo();
  const visits = store.list("visits").filter((v) => v.date === today());
  const current = visits.find((v) => v.status === "Menunggu") || visits[0];
  const patient = current && store.get("patients", current.patient_id);
  return (
    <>
      <div class="between" style={{ marginBottom: 20 }}>
        <div>
          <div class="eyebrow">RUANG KERJA ANDA</div>
          <h1>
            Selamat datang,
            <br />
            {role.name.split(" ·")[0]}.
          </h1>
        </div>
        <span class="avatar navy">{role.name.slice(0, 1)}</span>
      </div>
      <div class="hero">
        <Icon name="calendar" class="hero-deco" size={65} />
        <div class="hero-kicker">KLINIK PRIVAT</div>
        <h2>
          Hari yang baik
          <br />
          untuk mendampingi.
        </h2>
        <div class="hero-date">
          <Icon name="calendar" size={14} />
          {displayDate(today())} · Sesi sore
        </div>
        <div class="hero-line" />
        <div class="between">
          <small>16.00–19.30 WIB</small>
          <small>{visits.length} pasien terjadwal</small>
        </div>
        <Button icon="arrow" onClick={() => go("clinic")}>
          Lihat Janji Temu
        </Button>
      </div>
      <div class="stats">
        {[
          ["queue", "Antrean hari ini", visits.length, "Lihat antrean"],
          [
            "laboratory",
            "Hasil perlu ditinjau",
            store.list("laboratory").filter((l) => l.status !== "Terbit")
              .length,
            "Buka laboratorium",
          ],
          [
            "invoices",
            "Belum lunas",
            store.list("invoices").filter((x) => x.status !== "Lunas").length,
            "Periksa invoice",
          ],
        ].map(([id, label, value, tail]) => (
          <button class="stat" onClick={() => go(id)}>
            <span class="stat-label">{label}</span>
            <strong>{value}</strong>
            <small>{tail} →</small>
          </button>
        ))}
      </div>
      <div class="section-heading">
        <h2>Akses cepat</h2>
        <button class="text-btn" onClick={() => go("more")}>
          Lihat semua
        </button>
      </div>
      <div class="quick-grid">
        {[
          ["laboratory", "Laboratorium", "flask"],
          ["patients", "Pasien", "users"],
          ["team-chat", "Chat Tim", "message"],
          ["workdesk", "Kantor Saya", "grid"],
        ].map(([id, title, icon]) => (
          <button class="quick-item" onClick={() => go(id)}>
            <span class="icon-tile">
              <Icon name={icon} />
            </span>
            <span>{title}</span>
          </button>
        ))}
      </div>
      {current && (
        <div class="next-patient">
          <div class="between">
            <div class="eyebrow">PASIEN BERIKUTNYA</div>
            <Badge>{current.status}</Badge>
          </div>
          <div class="row">
            <span class="avatar">NA</span>
            <div class="row-content">
              <h3>{patient?.name}</h3>
              <small>
                {current.time} WIB · {current.mr_id}
              </small>
            </div>
          </div>
          <Button
            variant="quiet full"
            icon="file"
            onClick={() => {
              setVisit(current.id);
              go("drd/identitas");
            }}
          >
            Buka Rekam Medis
          </Button>
        </div>
      )}
      <Section
        title="Perlu diselesaikan"
        action={
          <button class="text-btn" onClick={() => go("workdesk")}>
            Kantor Saya
          </button>
        }
      >
        {[
          [
            "laboratory",
            "Periksa hasil Darah Lengkap",
            "Nadira Ayu · Draf belum diterbitkan",
          ],
          [
            "appointments",
            "Konfirmasi janji temu",
            "2 permintaan baru · Data dummy",
          ],
          ["briefing", "Baca briefing tim", "Persiapan klinik sore"],
        ].map(([id, title, subtitle]) => (
          <button class="link-row" onClick={() => go(id)}>
            <span class="check-circle">
              <Icon name="clock" size={18} />
            </span>
            <span class="row-content">
              <strong>{title}</strong>
              <small>{subtitle}</small>
            </span>
            <Icon name="arrow" size={15} />
          </button>
        ))}
      </Section>
      <p class="page-microfooter">
        dr. Dibya Private Clinic
        <br />
        Setiap langkah, terhubung dengan lebih baik.
      </p>
    </>
  );
}
export function Directory() {
  const { role, go, store, query } = useDemo();
  const [search, setSearch] = useState(
    query.group || store.view("more").search || "",
  );
  const filtered = screens.filter((s) =>
    `${s.title} ${s.group}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Title
        kicker="RUANG KERJA"
        description="Semua kebutuhan, dalam satu tempat."
      >
        Lainnya
      </Title>
      <Search
        value={search}
        onInput={(v) => {
          setSearch(v);
          store.view("more", { search: v });
        }}
        placeholder="Cari menu, layanan, atau halaman"
      />
      <button class="resource-card" onClick={() => go("profile")}>
        <div class="row">
          <span class="avatar">{role.name[0]}</span>
          <div class="row-content">
            <strong>{role.name}</strong>
            <small>{role.label} · Preset demo</small>
          </div>
          <Icon name="arrow" size={16} />
        </div>
      </button>
      {groups.map((group) => {
        const items = filtered.filter((s) => s.group === group);
        return (
          items.length > 0 && (
            <div key={group}>
              <div class="directory-label">{group}</div>
              <div class="directory-group">
                {items.map((s) => (
                  <div class={!canAccess(s, role) ? "locked" : ""}>
                    <LinkRow
                      icon={s.icon}
                      title={s.title}
                      subtitle={
                        !canAccess(s, role)
                          ? "Tidak tersedia pada preset peran ini"
                          : undefined
                      }
                      onClick={() => go(s.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        );
      })}
      {!filtered.length && (
        <Empty
          title="Menu tidak ditemukan"
          text="Coba nama modul atau layanan lainnya."
        />
      )}
      <div class="mobile-only-note">
        Prototipe mobile · Seluruh data fiktif.
        <br />
        Pengaturan peran dan skenario tersedia pada tombol Demo di atas.
      </div>
    </>
  );
}

export function Clinic() {
  const ctx = useDemo();
  const { store, go, setVisit, scenario } = ctx;
  const [date, setDate] = useState(store.view("clinic").date || today());
  const visits =
    scenario === "empty"
      ? []
      : store
          .list("visits")
          .filter((v) => v.date === date && v.location === "klinik_private");
  return (
    <>
      <Title
        kicker="KLINIK PRIVAT"
        description="Atur kunjungan. Dampingi setiap pasien."
      >
        Janji Temu
      </Title>
      <div class="chips">
        {[-1, 0, 1].map((d) => (
          <button
            class={`chip ${date === shiftDate(d) ? "active" : ""}`}
            onClick={() => {
              setDate(shiftDate(d));
              store.view("clinic", { date: shiftDate(d) });
            }}
          >
            {d === 0 ? "Hari ini" : d === 1 ? "Besok" : "Kemarin"} ·{" "}
            {displayDate(shiftDate(d)).split(" ").slice(0, 2).join(" ")}
          </button>
        ))}
        <button
          class="chip"
          onClick={() =>
            ctx.sheet({
              title: "Pilih tanggal",
              body: (
                <Field
                  field={{
                    key: "date",
                    label: "Tanggal janji temu",
                    type: "date",
                  }}
                  value={date}
                  onChange={(v) => {
                    setDate(v);
                    store.view("clinic", { date: v });
                    ctx.sheet(null);
                  }}
                />
              ),
            })
          }
        >
          <Icon name="calendar" size={13} /> Tanggal
        </button>
      </div>
      <div class="stats">
        {[
          ["Terjadwal", visits.length],
          ["Menunggu", visits.filter((v) => v.status === "Menunggu").length],
          ["Selesai", visits.filter((v) => v.status === "Selesai").length],
        ].map(([l, n]) => (
          <div class="stat">
            <span class="stat-label">{l}</span>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      <div class="between" style={{ marginBottom: 17 }}>
        <h2>
          Sesi sore <span class="page-count">16.00–19.30</span>
        </h2>
        <Button
          icon="plus"
          variant="primary small"
          onClick={() => go("appointments", { mode: "new" })}
        >
          Janji Baru
        </Button>
      </div>
      {visits.length ? (
        visits.map((v, i) => {
          const p = store.get("patients", v.patient_id);
          return (
            <button
              class="resource-card"
              onClick={() => {
                setVisit(v.id);
                go("drd/identitas");
              }}
            >
              <div class="row">
                <span class="queue-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div class="row-content">
                  <h3>{p?.name}</h3>
                  <small>
                    {v.time} WIB · {categories[v.category]}
                  </small>
                </div>
              </div>
              <div class="card-foot">
                <span>{v.mr_id}</span>
                <Badge>{v.status}</Badge>
                <Icon name="arrow" size={15} />
              </div>
            </button>
          );
        })
      ) : (
        <Empty
          title="Belum ada janji temu"
          text="Sesi untuk tanggal ini masih kosong."
          action={
            <Button
              variant="primary"
              onClick={() => go("appointments", { mode: "new" })}
            >
              Tambah Janji Temu
            </Button>
          }
        />
      )}
      <div class="spacer" />
      <Section title="Kelola klinik">
        {[
          ["queue", "Antrean online", "Pantau status pemeriksaan", "queue"],
          [
            "schedule",
            "Jadwal praktik",
            "Sesi, kuota, dan hari libur",
            "calendar",
          ],
          ["closing", "Closing Klinik", "Cocokkan penerimaan sesi", "wallet"],
        ].map(([id, title, subtitle, icon]) => (
          <LinkRow {...{ title, subtitle, icon }} onClick={() => go(id)} />
        ))}
      </Section>
      <Section title="Rumah sakit">
        {[
          ["melinda", "RSIA Melinda"],
          ["gambiran", "RSUD Gambiran"],
          ["bhayangkara", "RS Bhayangkara"],
        ].map(([id, title]) => (
          <LinkRow title={title} icon="hospital" onClick={() => go(id)} />
        ))}
      </Section>
    </>
  );
}

export function Patients() {
  const ctx = useDemo();
  const { store, go, query, scenario } = ctx;
  const [search, setSearch] = useState(store.view("patients").search || "");
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const patient = query.item && store.get("patients", query.item);
  const rows =
    scenario === "empty"
      ? []
      : store
          .list("patients")
          .filter((p) =>
            `${p.name} ${p.id} ${p.phone}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          );
  if (patient)
    return (
      <>
        <Title
          kicker="PROFIL PASIEN"
          description={`ID ${patient.id}`}
          action={
            <button
              class="icon-btn"
              aria-label="Edit identitas pasien"
              disabled={!hasPermission(ctx.role, "patients.edit")}
              onClick={() => setForm({ ...patient })}
            >
              <Icon name="edit" />
            </button>
          }
        >
          {patient.name}
        </Title>
        <div class="section">
          <div class="row">
            <span
              class="avatar navy"
              style={{ width: 58, height: 58, fontSize: 19 }}
            >
              {patient.name
                .split(" ")
                .slice(0, 2)
                .map((w) => w[0])
                .join("")}
            </span>
            <div>
              <Badge>{patient.status}</Badge>
              <p class="muted" style={{ marginTop: 6 }}>
                {displayDate(patient.birth_date)}
              </p>
            </div>
          </div>
          <div class="spacer" />
          <dl class="detail-list">
            <div>
              <dt>Telepon</dt>
              <dd>{patient.phone}</dd>
            </div>
            <div>
              <dt>Alamat</dt>
              <dd>{patient.address}</dd>
            </div>
            <div>
              <dt>Catatan</dt>
              <dd>{patient.notes || "Tidak dicantumkan"}</dd>
            </div>
          </dl>
        </div>
        <Section
          title="Kunjungan & rekam medis"
          action={
            <button
              class="text-btn"
              disabled={!hasPermission(ctx.role, "visits.create")}
              onClick={() =>
                ctx.sheet({
                  title: "Kunjungan baru",
                  body: (
                    <>
                      <Notice>DRD baru dibuat hanya di ruang demo ini.</Notice>
                      {Object.entries(locations).map(([location, label]) => (
                        <LinkRow
                          icon="hospital"
                          title={label}
                          onClick={() => {
                            const v = ctx.save("visits", {
                              name: "Kunjungan baru",
                              patient_id: patient.id,
                              mr_id: `DRD-DEMO-${Date.now().toString().slice(-5)}`,
                              category: patient.category || "obstetri",
                              location,
                              date: today(),
                              time: "18:00",
                              status: "Menunggu",
                            });
                            if (v) {
                              ctx.setVisit(v.id);
                              ctx.sheet(null);
                              go("drd/identitas");
                            }
                          }}
                        />
                      ))}
                    </>
                  ),
                })
              }
            >
              + Kunjungan
            </button>
          }
        >
          {store
            .list("visits")
            .filter((v) => v.patient_id === patient.id)
            .map((v) => (
              <LinkRow
                icon="file"
                title={v.mr_id}
                subtitle={`${displayDate(v.date)} · ${locations[v.location]}`}
                badge={v.status}
                onClick={() => {
                  ctx.setVisit(v.id);
                  go("drd/identitas");
                }}
              />
            ))}
        </Section>
        <Button
          icon="flask"
          variant="quiet full"
          onClick={() => go("laboratory")}
        >
          Lihat Hasil Laboratorium
        </Button>
        {form && (
          <PatientForm
            form={form}
            setForm={setForm}
            onClose={() => setForm(null)}
            error={error}
            setError={setError}
          />
        )}
      </>
    );
  return (
    <>
      <Title
        kicker="DATA PASIEN"
        description="Identitas, kunjungan, dan riwayat terhubung."
      >
        Pasien
      </Title>
      <Search
        value={search}
        placeholder="Cari nama, ID, atau telepon"
        onInput={(v) => {
          setSearch(v);
          store.view("patients", { search: v });
        }}
      />
      <div class="between" style={{ marginBottom: 17 }}>
        <span class="page-count">{rows.length} pasien demo</span>
        <Button
          variant="primary small"
          icon="userplus"
          disabled={!hasPermission(ctx.role, "patients.create")}
          onClick={() =>
            setForm({
              name: "",
              birth_date: "",
              phone: "",
              address: "",
              category: "obstetri",
              status: "Aktif",
            })
          }
        >
          Pasien Baru
        </Button>
      </div>
      {rows.length ? (
        rows.map((p) => (
          <button
            class="resource-card"
            onClick={() => go("patients", { item: p.id })}
          >
            <div class="row">
              <span class="avatar">
                {p.name
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")}
              </span>
              <div class="row-content">
                <h3>{p.name}</h3>
                <small>
                  {p.id} · {displayDate(p.birth_date)}
                </small>
              </div>
              <Icon name="arrow" size={16} />
            </div>
            <div class="card-foot">
              <span>{p.gestation || categories[p.category]}</span>
              <Badge>{p.status}</Badge>
            </div>
          </button>
        ))
      ) : (
        <Empty title="Pasien tidak ditemukan" />
      )}
      {form && (
        <PatientForm
          form={form}
          setForm={setForm}
          onClose={() => setForm(null)}
          error={error}
          setError={setError}
        />
      )}
    </>
  );
}
function PatientForm({ form, setForm, onClose, error, setError }) {
  const ctx = useDemo();
  const writable = hasPermission(
    ctx.role,
    form.id ? "patients.edit" : "patients.create",
  );
  return (
    <Modal
      title={form.id ? "Edit identitas" : "Pasien baru"}
      onClose={() =>
        ctx.confirm(
          "Tutup formulir",
          "Isian yang belum disimpan akan dibuang.",
          onClose,
        )
      }
      footer={
        <Button
          variant="primary full"
          disabled={!writable}
          onClick={() => {
            if (!form.name.trim()) {
              setError("Nama pasien wajib diisi.");
              return;
            }
            if (writable && ctx.save("patients", form, form.version)) {
              onClose();
              ctx.toast("Identitas pasien demo tersimpan.");
            }
          }}
        >
          Simpan Pasien Demo
        </Button>
      }
    >
      <Notice>Gunakan identitas fiktif untuk mencoba formulir.</Notice>
      {error && <Notice tone="danger">{error}</Notice>}
      {[
        ["name", "Nama lengkap"],
        ["birth_date", "Tanggal lahir", "date"],
        ["phone", "Telepon"],
        ["address", "Alamat", "textarea"],
      ].map(([key, label, type]) => (
        <Field
          field={{ key, label, type, required: key === "name" }}
          value={form[key]}
          disabled={!writable}
          onChange={(v) => setForm({ ...form, [key]: v })}
        />
      ))}
    </Modal>
  );
}

export function Workdesk() {
  const ctx = useDemo();
  const { store, go } = ctx;
  const [editing, setEditing] = useState(false);
  const widgets = store.preferences().widgets;
  const names = {
    queue: "Antrean hari ini",
    appointments: "Janji berikutnya",
    tasks: "Pekerjaan tertunda",
    messages: "Pesan tim",
  };
  const update = (v) => {
    store.preferences({ widgets: v });
    ctx.refresh();
  };
  return (
    <>
      <Title
        kicker="PERSONAL WORKSPACE"
        description="Susun ruang kerja sesuai kebutuhan Anda."
        action={
          <button
            class="icon-btn"
            aria-label="Atur widget"
            onClick={() => setEditing(true)}
          >
            <Icon name="sliders" />
          </button>
        }
      >
        Kantor Saya
      </Title>
      {widgets.map((id) => (
        <Section
          title={names[id]}
          action={
            <button
              class="text-btn"
              onClick={() =>
                go(
                  {
                    queue: "queue",
                    appointments: "clinic",
                    tasks: "laboratory",
                    messages: "team-chat",
                  }[id],
                )
              }
            >
              Buka →
            </button>
          }
        >
          {id === "queue" ? (
            <div class="between">
              <div class="catalog-total">
                {store.list("visits").filter((v) => v.date === today()).length}
              </div>
              <div class="muted">
                pasien terjadwal hari ini
                <br />
                Klinik Privat · Sesi sore
              </div>
            </div>
          ) : id === "appointments" ? (
            <p class="muted">
              16.30 WIB · Nadira Ayu Prameswari
              <br />
              Kontrol kehamilan · DRD-DEMO-001
            </p>
          ) : id === "tasks" ? (
            <div class="stack">
              <LinkRow
                icon="flask"
                title="Periksa hasil laboratorium"
                subtitle="Satu draf menunggu tinjauan"
                onClick={() => go("laboratory")}
              />
              <LinkRow
                icon="receipt"
                title="Invoice belum lunas"
                onClick={() => go("invoices")}
              />
            </div>
          ) : (
            <div class="row">
              <span class="avatar">TK</span>
              <div class="row-content">
                <strong>Tim Klinik Privat</strong>
                <small>Persiapan klinik sore sudah siap.</small>
              </div>
            </div>
          )}
        </Section>
      ))}
      <Section title="Tim & kontribusi">
        {[
          ["points", "Poin Staff", "star"],
          ["briefing", "Briefing", "clipboard"],
          ["payroll", "Gajian", "wallet"],
        ].map(([id, title, icon]) => (
          <LinkRow {...{ title, icon }} onClick={() => go(id)} />
        ))}
      </Section>
      {editing && (
        <Modal
          title="Atur widget"
          onClose={() => setEditing(false)}
          footer={
            <Button
              variant="primary full"
              onClick={() => {
                setEditing(false);
                ctx.toast("Susunan ruang kerja tersimpan.");
              }}
            >
              Selesai
            </Button>
          }
        >
          <p class="muted" style={{ marginBottom: 15 }}>
            Pilih widget dan ubah urutannya. Pilihan tersimpan di perangkat ini.
          </p>
          {Object.keys(names).map((id) => (
            <div class="widget-edit">
              <label>
                <input
                  type="checkbox"
                  checked={widgets.includes(id)}
                  onChange={(e) =>
                    update(
                      e.currentTarget.checked
                        ? [...widgets, id]
                        : widgets.filter((w) => w !== id),
                    )
                  }
                />
                {names[id]}
              </label>
              <button
                class="icon-btn"
                aria-label={`Pindahkan ${names[id]} ke atas`}
                disabled={widgets.indexOf(id) <= 0}
                onClick={() => {
                  const arr = [...widgets],
                    i = arr.indexOf(id);
                  [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                  update(arr);
                }}
              >
                <Icon
                  name="back"
                  size={16}
                  style={{ transform: "rotate(90deg)" }}
                />
              </button>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}

export function Analytics({ screen }) {
  const { go } = useDemo();
  const [range, setRange] = useState("7 hari");
  const finance = screen.id === "finance";
  const vals =
    range === "7 hari"
      ? [6, 9, 7, 12, 8, 15, 11]
      : [11, 18, 15, 22, 14, 27, 21];
  return (
    <>
      <Title
        kicker={screen.group}
        description="Ringkasan dari dataset fiktif ruang demo."
      >
        {screen.title}
      </Title>
      <div class="chips">
        {["7 hari", "30 hari"].map((r) => (
          <button
            class={`chip ${r === range ? "active" : ""}`}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>
      <div class="hero">
        <div class="hero-kicker">
          {finance ? "PENERIMAAN DEMO" : "AKTIVITAS DEMO"}
        </div>
        <h2>
          {finance
            ? money(vals.reduce((a, b) => a + b, 0) * 50000)
            : `${vals.reduce((a, b) => a + b, 0)} kegiatan`}
        </h2>
        <p>Periode {range} · Data simulasi</p>
      </div>
      <Section
        title={finance ? "Penerimaan per hari" : "Aktivitas terjadwal"}
        description={
          finance
            ? "Satuan: Rp50.000 · Dataset dummy"
            : "Jumlah kegiatan · Dataset dummy"
        }
      >
        <div
          class="chart-bars"
          role="img"
          aria-label={`Grafik ${range}: ${vals.join(", ")} kegiatan demo`}
        >
          {vals.map((n, i) => (
            <div
              class="chart-bar"
              style={{ height: `${(n / Math.max(...vals)) * 100}%` }}
            >
              <b>{n}</b>
              <span>
                {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][i]}
              </span>
            </div>
          ))}
        </div>
        <div class="metric-list">
          {(finance
            ? [
                ["Tunai", money(vals.reduce((a, b) => a + b, 0) * 12500)],
                ["Transfer", money(vals.reduce((a, b) => a + b, 0) * 30000)],
                ["QRIS", money(vals.reduce((a, b) => a + b, 0) * 7500)],
              ]
            : [
                ["Operasi terjadwal", "12"],
                ["Tindakan selesai", "9"],
                ["Dokumen perlu ditinjau", "3"],
              ]
          ).map(([l, v]) => (
            <div>
              <span>{l}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
      </Section>
      <Button
        variant="quiet full"
        icon="file"
        onClick={() => go(finance ? "invoices" : "docboard/surgery")}
      >
        Lihat Rincian
      </Button>
    </>
  );
}

export function Chat({ screen }) {
  const ctx = useDemo();
  const { store, go, query, scenario } = ctx;
  const writable = canWrite(screen, ctx.role);
  const threads = scenario === "empty" ? [] : store.list(screen.id);
  const row = threads.find((x) => x.id === query.item);
  const [message, setMessage] = useState(
    store.getDraft(screen.id, "composer")?.body || "",
  );
  const bottom = useRef();
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [row?.version]);
  useEffect(() => {
    setMessage(store.getDraft(screen.id, query.item || "composer")?.body || "");
  }, [query.item, screen.id]);
  if (!row)
    return (
      <>
        <Title
          kicker="PERCAKAPAN"
          description="Terhubung dengan pasien dan tim."
        >
          {screen.title}
        </Title>
        <div class="btns" style={{ marginBottom: 18 }}>
          <Button
            variant="primary"
            icon="plus"
            disabled={!writable}
            onClick={() =>
              ctx.sheet({
                title: "Percakapan baru",
                body: (
                  <>
                    {store.list("patients").map((p) => (
                      <LinkRow
                        icon="user"
                        title={p.name}
                        onClick={() => {
                          const result = ctx.save(screen.id, {
                            name: p.name,
                            status: "Aktif",
                            messages: [],
                          });
                          if (result) {
                            ctx.sheet(null);
                            go(screen.id, { item: result.id });
                          }
                        }}
                      />
                    ))}
                  </>
                ),
              })
            }
          >
            Percakapan Baru
          </Button>
        </div>
        {threads.length ? (
          threads.map((t) => (
            <button
              class="resource-card"
              onClick={() => go(screen.id, { item: t.id })}
            >
              <div class="row">
                <span class="avatar">
                  {t.name
                    .split(" ")
                    .slice(0, 2)
                    .map((x) => x[0])
                    .join("")}
                </span>
                <div class="row-content">
                  <strong>{t.name}</strong>
                  <small>
                    {t.messages.at(-1)?.body || "Mulai percakapan demo"}
                  </small>
                </div>
                <Icon name="arrow" size={15} />
              </div>
            </button>
          ))
        ) : (
          <Empty title="Belum ada percakapan" />
        )}
      </>
    );
  return (
    <>
      <div class="thread-head">
        <span class="avatar">
          {row.name
            .split(" ")
            .slice(0, 2)
            .map((x) => x[0])
            .join("")}
        </span>
        <div class="row-content">
          <strong>{row.name}</strong>
          <small>Ruang percakapan demo</small>
        </div>
        <Badge tone="neutral">Dummy</Badge>
      </div>
      <div class="thread-messages">
        {row.messages.map((m) => (
          <div class={`bubble ${m.mine ? "mine" : ""}`} key={m.id}>
            {m.body}
            <time>
              {m.time}
              {m.mine ? " · Tersimpan lokal" : ""}
            </time>
          </div>
        ))}
        <span ref={bottom} />
      </div>
      <form
        class="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!writable) return;
          if (!message.trim()) return;
          const result = ctx.save(
            screen.id,
            {
              ...row,
              messages: [
                ...row.messages,
                {
                  id: crypto.randomUUID(),
                  body: message.trim(),
                  mine: true,
                  time: new Date().toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                },
              ],
            },
            row.version,
          );
          if (result) {
            setMessage("");
            store.setDraft(screen.id, row.id, null);
            ctx.toast("Pesan demo tersimpan lokal.");
          }
        }}
      >
        <textarea
          disabled={!writable}
          rows="1"
          aria-label="Tulis pesan demo"
          placeholder="Tulis pesan..."
          value={message}
          onInput={(e) => {
            setMessage(e.currentTarget.value);
            store.setDraft(screen.id, row.id, { body: e.currentTarget.value });
          }}
        />
        <button
          type="submit"
          aria-label="Kirim pesan demo"
          disabled={!message.trim() || !writable}
        >
          <Icon name="send" size={21} />
        </button>
      </form>
      <p class="page-microfooter">Pesan hanya tersimpan di ruang demo ini.</p>
    </>
  );
}

export function Calendar() {
  const ctx = useDemo();
  const { go, store } = ctx;
  const now = new Date(`${today()}T12:00:00`);
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [chosen, setChosen] = useState(Number(today().slice(-2)));
  const [mode, setMode] = useState("Bulan");
  const days = new Date(year, month + 1, 0).getDate();
  const start = (new Date(year, month, 1).getDay() + 6) % 7;
  const selected = `${year}-${String(month + 1).padStart(2, "0")}-${String(chosen).padStart(2, "0")}`;
  const events = store
    .list("docboard/surgery")
    .filter((r) => r.date === selected);
  function offset(n) {
    const d = new Date(year, month + n, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setChosen(1);
  }
  return (
    <>
      <Title
        kicker="DOCBOARD"
        description="Satu pandangan untuk seluruh agenda."
        action={
          <button
            class="icon-btn"
            aria-label="Menu DocBoard"
            onClick={() => go("more", { group: "DocBoard" })}
          >
            <Icon name="menu" />
          </button>
        }
      >
        Jadwal
      </Title>
      <div class="chips">
        {["Bulan", "Minggu", "Hari"].map((m) => (
          <button
            class={`chip ${m === mode ? "active" : ""}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
        <button class="chip" onClick={() => go("docboard/alarms")}>
          <Icon name="bell" size={14} /> Alarm
        </button>
      </div>
      <Section title="">
        <div class="between">
          <button
            class="icon-btn"
            aria-label="Bulan sebelumnya"
            onClick={() => offset(-1)}
          >
            <Icon name="back" size={18} />
          </button>
          <span class="calendar-month">
            {new Date(year, month, 1).toLocaleDateString("id-ID", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <button
            class="icon-btn"
            aria-label="Bulan berikutnya"
            onClick={() => offset(1)}
          >
            <Icon name="arrow" size={18} />
          </button>
        </div>
        {mode === "Bulan" ? (
          <div class="calendar-grid">
            {["S", "S", "R", "K", "J", "S", "M"].map((d) => (
              <span class="weekday">{d}</span>
            ))}
            {Array.from({ length: start }, () => (
              <span />
            ))}
            {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
              <button
                class={`${d === now.getDate() && month === now.getMonth() && year === now.getFullYear() ? "today" : ""} ${d === chosen ? "chosen" : ""}`}
                aria-label={`Pilih ${d} ${month + 1} ${year}`}
                onClick={() => setChosen(d)}
              >
                {d}
                {d === now.getDate() && month === now.getMonth() && (
                  <span class="event-dot" />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div
            class="calendar-grid"
            style={{
              gridTemplateColumns:
                mode === "Hari" ? "1fr" : "repeat(7,minmax(0,1fr))",
            }}
          >
            {Array.from({ length: mode === "Hari" ? 1 : 7 }, (_, i) =>
              Math.min(days, chosen + i),
            ).map((d) => (
              <button
                class={chosen === d ? "chosen" : ""}
                onClick={() => setChosen(d)}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </Section>
      <div class="between" style={{ marginBottom: 12 }}>
        <div>
          <h2>{displayDate(selected)}</h2>
          <small class="muted">{events.length} agenda terjadwal</small>
        </div>
        <Button
          variant="primary small"
          icon="plus"
          onClick={() => go("docboard/surgery", { mode: "new" })}
        >
          Agenda
        </Button>
      </div>
      {events.length ? (
        <Section title="Agenda hari ini">
          {events.map((e) => (
            <div class="agenda-entry">
              <time>{e.time}</time>
              <div>
                <strong>{e.name}</strong>
                <p>{locations[e.location]}</p>
                <Badge>{e.status}</Badge>
                <button
                  class="text-btn"
                  style={{ display: "block" }}
                  onClick={() => go("docboard/surgery", { item: e.id })}
                >
                  Lihat Detail →
                </button>
              </div>
            </div>
          ))}
        </Section>
      ) : (
        <Empty
          title="Agenda masih kosong"
          text="Pilih tanggal lain atau tambahkan agenda demo."
        />
      )}
      <div class="quick-grid">
        {[
          ["docboard/surgery", "Operasi", "heart"],
          ["docboard/procedures", "Tindakan", "clipboard"],
          ["docboard/scientific", "Ilmiah", "book"],
          ["docboard/command", "Command", "grid"],
        ].map(([id, title, icon]) => (
          <button class="quick-item" onClick={() => go(id)}>
            <span class="icon-tile">
              <Icon name={icon} />
            </span>
            {title}
          </button>
        ))}
      </div>
      <Button
        variant="quiet full"
        onClick={() => go("docboard/day", { date: selected })}
      >
        Buka Agenda Harian
      </Button>
    </>
  );
}

export function Access({ screen }) {
  const ctx = useDemo();
  const { store, query, go, role } = ctx;
  const items = store.list(screen.id);
  const selected = items.find((x) => x.id === query.item);
  const [form, setForm] = useState(
    selected || {
      name: "",
      role: personas[1].id,
      permissions: [],
      status: "Aktif",
    },
  );
  useEffect(
    () =>
      setForm(
        selected || {
          name: "",
          role: personas[1].id,
          permissions: [],
          status: "Aktif",
        },
      ),
    [query.item, query.mode, screen.id],
  );
  const [q, setQ] = useState("");
  const permissions = [
    ...new Set([
      ...screens.map((s) => s.permission).filter(Boolean),
      "medical_records.create",
      "medical_records.edit",
      "medical_records.export",
      "medical_records.delete",
      "lab_exam.create",
      "lab_exam.edit",
      "patient_documents.create",
      "docboard.write",
      "docboard.delete",
      "billing.process_payment",
    ]),
  ];
  const writable = role.protected;
  if (query.item || query.mode === "new")
    return (
      <>
        <Title
          kicker={screen.title}
          description="Hak akun simulasi; tidak mengubah akses pengguna sebenarnya."
        >
          {selected ? "Edit Hak Akun" : "Tambah Akun Demo"}
        </Title>
        <Section title="Identitas akun">
          <Field
            field={{ label: "Nama staff" }}
            value={form.name}
            disabled={!writable}
            onChange={(v) => setForm({ ...form, name: v })}
          />
          <Field
            field={{
              label: "Preset jabatan",
              type: "select",
              options: personas.map((p) => p.label),
            }}
            value={personas.find((p) => p.id === form.role)?.label}
            disabled={!writable}
            onChange={(v) =>
              setForm({ ...form, role: personas.find((p) => p.label === v).id })
            }
          />
        </Section>
        <Section
          title="Izin per akun"
          description={`${form.permissions.length} izin dipilih`}
        >
          <Search value={q} onInput={setQ} placeholder="Cari kode izin" />
          {permissions
            .filter((p) => p.includes(q.toLowerCase()))
            .map((p) => (
              <label class="toggle-row">
                <span style={{ overflowWrap: "anywhere" }}>{p}</span>
                <input
                  type="checkbox"
                  checked={form.permissions.includes(p)}
                  disabled={!writable}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      permissions: e.currentTarget.checked
                        ? [...form.permissions, p]
                        : form.permissions.filter((x) => x !== p),
                    })
                  }
                />
              </label>
            ))}
        </Section>
        <div class="action-footer">
          <Button
            variant="primary full"
            disabled={!writable || !form.name.trim()}
            onClick={() => {
              if (ctx.save(screen.id, form, selected?.version)) {
                ctx.toast("Hak akun demo tersimpan.");
                go(screen.id);
              }
            }}
          >
            Simpan Hak Akun Demo
          </Button>
        </div>
      </>
    );
  return (
    <>
      <Title
        kicker="PENGATURAN AKSES"
        description="Akses mengikuti izin per akun, jabatan sebagai preset tampilan."
      >
        {screen.title}
      </Title>
      <Notice>
        Seluruh akun dan perubahan di halaman ini adalah simulasi.
      </Notice>
      <div class="btns" style={{ marginBottom: 17 }}>
        <Button
          icon="userplus"
          variant="primary"
          disabled={!writable}
          onClick={() => go(screen.id, { mode: "new" })}
        >
          Tambah Akun
        </Button>
      </div>
      {items.map((item) => (
        <LinkRow
          icon="user"
          title={item.name}
          subtitle={`${item.permissions.length} izin · ${personas.find((p) => p.id === item.role)?.label}`}
          onClick={() => go(screen.id, { item: item.id })}
        />
      ))}
    </>
  );
}

export function UploadScreen({ screen }) {
  const ctx = useDemo();
  const { store } = ctx;
  const scope = ctx.visit.id;
  const cached = store.getDraft(screen.id, scope);
  const [files, setFiles] = useState(cached?.files || []);
  const [result, setResult] = useState(cached?.result || false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const writable = canWrite(screen, ctx.role);
  useEffect(() => {
    ctx.setDirty(Boolean(cached));
    active.current = true;
    return () => {
      active.current = false;
      ctx.setDirty(false);
    };
  }, []);
  return (
    <>
      <Title
        kicker={screen.group}
        description={
          screen.id === "import"
            ? "Periksa pemetaan sebelum menerapkan hasil."
            : "Pilih pasien dan DRD sebelum menambahkan berkas."
        }
      >
        {screen.title}
      </Title>
      <Identity
        visit={ctx.visit}
        patient={ctx.patient}
        onChange={ctx.chooseVisit}
      />
      <Section title="Berkas sumber">
        {error && <Notice tone="danger">{error}</Notice>}
        <UploadBox
          disabled={!writable}
          onFiles={async (list) => {
            if (!writable) return;
            try {
              const sources = await ctx.addSources(list);
              store.setDraft(screen.id, scope, {
                files: sources,
                result: false,
              });
              if (active.current) {
                setFiles(sources);
                setResult(false);
                ctx.setDirty(true);
                setError("");
              }
            } catch (error) {
              if (active.current) setError(error.message);
            }
          }}
        />
        {files.map((f) => (
          <LinkRow
            icon="file"
            title={f.name}
            subtitle={`${Math.round(f.size / 1024)} KB`}
            onClick={() => ctx.openSource(f)}
          />
        ))}
      </Section>
      <Button
        variant="primary full"
        icon="scan"
        disabled={!files.length || !writable}
        onClick={() => {
          setResult(true);
          store.setDraft(screen.id, scope, { files, result: true });
          ctx.toast("Pratinjau demo siap diperiksa.");
        }}
      >
        Periksa Berkas Demo
      </Button>
      {result && (
        <Section
          title="Pratinjau hasil"
          description="Ekstraksi ini merupakan simulasi, bukan pembacaan dokumen sebenarnya."
        >
          <Notice>
            Pasien: {ctx.patient.name}
            <br />
            DRD: {ctx.visit.mr_id}
            <br />
            {files.length} berkas siap diterapkan.
          </Notice>
          <Button
            variant="teal full"
            disabled={!writable}
            onClick={() => {
              const result = ctx.save(screen.id, {
                name: files.map((f) => f.name).join(", "),
                patient_id: ctx.patient.id,
                visit_id: ctx.visit.id,
                status: "Tersimpan",
                date: today(),
                files,
              });
              if (result) {
                store.setDraft(screen.id, scope, null);
                ctx.setDirty(false);
                setFiles([]);
                setResult(false);
                ctx.toast("Sumber demo tersimpan dan dapat dibuka kembali.");
              }
            }}
          >
            Terapkan ke DRD Demo
          </Button>
        </Section>
      )}
      <div class="spacer" />
      <Section title="Riwayat unggahan">
        {store.list(screen.id).filter((row) => row.visit_id === scope)
          .length ? (
          store
            .list(screen.id)
            .filter((row) => row.visit_id === scope)
            .map((row) => (
              <LinkRow
                icon="file"
                title={row.name}
                subtitle={`${displayDate(row.date)} · ${row.files.length} sumber`}
                onClick={() =>
                  ctx.sheet({
                    title: "Berkas tersimpan",
                    body: (
                      <>
                        {row.files.map((f) => (
                          <LinkRow
                            icon="file"
                            title={f.name}
                            subtitle={`${Math.round(f.size / 1024)} KB`}
                            onClick={() => ctx.openSource(f)}
                          />
                        ))}
                        <Button
                          variant="danger full"
                          disabled={!writable}
                          onClick={() =>
                            ctx.confirm(
                              "Hapus unggahan demo",
                              "Metadata berkas akan disembunyikan dari daftar.",
                              () => {
                                ctx.remove(screen.id, row.id, row.version);
                                ctx.sheet(null);
                              },
                            )
                          }
                        >
                          Hapus
                        </Button>
                      </>
                    ),
                  })
                }
              />
            ))
        ) : (
          <p class="muted">Belum ada sumber demo yang disimpan.</p>
        )}
      </Section>
    </>
  );
}

export function Portal() {
  const ctx = useDemo();
  const labs = ctx.store
    .list("laboratory")
    .filter((l) => l.patient_id === ctx.patient.id && l.published);
  return (
    <>
      <Title
        kicker="PRATINJAU DARI STAFF"
        description="Contoh tampilan informasi yang telah diterbitkan."
      >
        Portal Pasien
      </Title>
      <Identity
        patient={ctx.patient}
        visit={ctx.visit}
        onChange={ctx.chooseVisit}
      />
      <div class="hero">
        <div class="hero-kicker">SELAMAT DATANG</div>
        <h2>
          {ctx.patient.name.split(" ")[0]},<br />
          ini ruang kesehatan Anda.
        </h2>
        <p>Seluruh isi pada pratinjau ini adalah data dummy.</p>
      </div>
      <Section title="Dokumen medis">
        {labs.length ? (
          labs.map((l) => (
            <LinkRow
              icon="flask"
              title={l.published.name}
              subtitle={displayDate(l.published.date)}
              badge="Terbit"
              onClick={() =>
                ctx.print(
                  "Hasil Laboratorium · DUMMY",
                  {
                    ...l.published,
                    name: ctx.patient.name,
                    mr_id: ctx.store.get("visits", l.published.visit_id)?.mr_id,
                  },
                  [],
                  l.published.parameters,
                )
              }
            />
          ))
        ) : (
          <p class="muted">
            Belum ada dokumen demo yang diterbitkan untuk pasien ini.
          </p>
        )}
      </Section>
      <Button variant="quiet full" onClick={() => ctx.go("laboratory")}>
        Kelola Hasil Laboratorium
      </Button>
    </>
  );
}

export function Catalog() {
  const ctx = useDemo();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState(ctx.query.group || "Semua");
  const list = screens.filter(
    (s) =>
      (group === "Semua" || s.group === group) &&
      `${s.title} ${s.aliases.join(" ")}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <>
      <Title
        kicker="DESIGN REVIEW"
        description="Pemetaan halaman sumber ke prototipe mobile."
      >
        Katalog Layar
      </Title>
      <div class="section between">
        <div>
          <div class="catalog-total">{screens.length}</div>
          <small class="muted">layar / modul yang bisa dibuka</small>
        </div>
        <Icon name="grid" size={38} />
      </div>
      <Search
        value={q}
        onInput={setQ}
        placeholder="Cari judul, halaman sumber, atau menu"
      />
      <Field
        field={{
          label: "Kelompok halaman",
          type: "select",
          options: ["Semua", ...groups],
        }}
        value={group}
        onChange={setGroup}
      />
      {list.map((s) => (
        <a
          href={`#/${s.id}`}
          class="resource-card"
          onClick={(e) => {
            e.preventDefault();
            ctx.go(s.id);
          }}
        >
          <div class="between">
            <strong>{s.title}</strong>
            <Icon name="arrow" size={16} />
          </div>
          <p>
            {s.group} · {s.kind}
          </p>
          <p style={{ fontSize: 10, overflowWrap: "anywhere" }}>
            {s.source}
            <br />
            {s.aliases.join(" · ") || "Layar pendukung prototipe"}
          </p>
        </a>
      ))}
      <Button
        variant="quiet full"
        icon="download"
        onClick={() =>
          ctx.download(
            "katalog-layar-dummy.json",
            JSON.stringify(screens, null, 2),
            "application/json",
          )
        }
      >
        Unduh Katalog
      </Button>
    </>
  );
}

export function InfoScreen({ screen }) {
  const ctx = useDemo();
  const [installable, setInstallable] = useState(!!window.__previewInstall);
  useEffect(() => {
    const update = () => setInstallable(true);
    window.addEventListener("preview:installable", update);
    return () => window.removeEventListener("preview:installable", update);
  }, []);
  return (
    <>
      <Title
        kicker="STAFF MOBILE"
        description="Prototipe pengalaman kerja klinik yang terhubung."
      >
        {screen.title}
      </Title>
      <Section title="dr. Dibya Private Clinic">
        <img
          src="/staff-preview/brand/dpc-lab-logo.png"
          alt="dr. Dibya Private Clinic"
          style={{ width: 250, margin: "6px 0 20px" }}
        />
        <p class="muted">
          Tema navy–teal mengikuti Laboratorium. Desain mobile disusun untuk
          pekerjaan staff dan DocBoard.
        </p>
        <div class="spacer" />
        <Badge tone="neutral">{__PREVIEW_VERSION__}</Badge>
      </Section>
      {screen.kind === "install" ? (
        <Section title="Pasang di layar utama">
          <p class="muted">
            Android: buka menu browser dan pilih “Install aplikasi” atau
            “Tambahkan ke layar utama”.
            <br />
            <br />
            iPhone: buka di Safari, ketuk Bagikan, lalu “Tambahkan ke Layar
            Utama”.
          </p>
          <div class="spacer" />
          <Button
            variant="primary full"
            icon="download"
            disabled={!installable}
            onClick={async () => {
              await window.__previewInstall?.prompt();
              window.__previewInstall = null;
              setInstallable(false);
            }}
          >
            Pasang Preview PWA
          </Button>
          <p class="muted" style={{ marginTop: 12 }}>
            Tombol aktif ketika browser menyediakan pemasangan. Identitas PWA
            preview terpisah dari Staff.
          </p>
        </Section>
      ) : (
        <Section title="Tentang ruang demo">
          <p class="muted">
            Seluruh pasien, rekam medis, transaksi, dan percakapan adalah data
            fiktif. Perubahan disimpan di perangkat Anda. Gunakan tombol Demo
            untuk mengatur peran, skenario, dan mengembalikan contoh awal.
          </p>
          <div class="spacer" />
          <Button
            variant="quiet full"
            icon="grid"
            onClick={() => ctx.go("catalog")}
          >
            Jelajahi Katalog Layar
          </Button>
        </Section>
      )}
      <Section title="Identitas mitra">
        <div class="between" style={{ justifyContent: "space-around" }}>
          <img
            src="/staff-preview/brand/sw-healthcare.png"
            alt="SisiWanita"
            style={{ width: 80, height: 80, objectFit: "contain" }}
          />
          <img
            src="/staff-preview/brand/melinda.png"
            alt="RSIA Melinda"
            style={{ width: 65, height: 65, objectFit: "contain" }}
          />
        </div>
      </Section>
    </>
  );
}
