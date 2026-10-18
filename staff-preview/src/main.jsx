import { render } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { DemoContext, useDemo } from "./context.jsx";
import { createDemoStore } from "./store.js";
import { screens, byId, tabs, tabFor, sourceMap } from "./catalog.js";
import {
  personas,
  scenarios,
  canAccess,
  locations,
  displayDate,
} from "./domain.js";
import { definitions } from "./definitions.js";
import { addSources, sourceUrl, resetSources } from "./files.js";
import {
  Icon,
  Button,
  Modal,
  Notice,
  Field,
  Empty,
  Skeleton,
  LinkRow,
} from "./ui.jsx";
import { ResourceScreen } from "./resources.jsx";
import {
  Dashboard,
  Directory,
  Clinic,
  Patients,
  Workdesk,
  Analytics,
  Chat,
  Calendar,
  Access,
  UploadScreen,
  Portal,
  Catalog,
  InfoScreen,
} from "./core.jsx";
import { Clinical, Laboratory } from "./clinical.jsx";
import "./styles.css";

let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const store = createDemoStore(storage);
function getRoute() {
  const [raw, qs = ""] = (location.hash.slice(2) || "dashboard").split("?");
  const id = decodeURIComponent(raw);
  return {
    id: sourceMap[id] || id,
    query: Object.fromEntries(new URLSearchParams(qs)),
    key: location.hash || "#/dashboard",
  };
}
function App() {
  const [route, setRoute] = useState(getRoute);
  const [revision, bump] = useState(0);
  const [preferences, setPreferences] = useState(store.preferences());
  const [sheet, setSheet] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [notification, setNotification] = useState("");
  const [dirty, setDirty] = useState(false);
  const [printDoc, setPrintDoc] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const scroll = useRef();
  const scrollSaveTimer = useRef();
  const notificationTimer = useRef();
  const routeRef = useRef(route);
  routeRef.current = route;
  const role =
    personas.find((p) => p.id === Number(preferences.role)) || personas[0];
  const scenario = preferences.scenario || "normal";
  const screen = byId(route.id);
  const visit =
    store.get("visits", preferences.visit) || store.list("visits")[0];
  const patient = store.get("patients", visit.patient_id);
  const refresh = () => bump((v) => v + 1);
  const toast = (text) => {
    clearTimeout(notificationTimer.current);
    setNotification(text);
    notificationTimer.current = setTimeout(() => setNotification(""), 4000);
  };
  const prefs = (values) => {
    const next = store.preferences(values);
    setPreferences(next);
    refresh();
  };
  function confirm(title, text, action) {
    setConfirmation({ title, text, action });
  }
  function navigate(id, query = {}, force = false) {
    const action = () => {
      setDirty(false);
      const current = routeRef.current;
      store.view(current.key, { scroll: scroll.current?.scrollTop || 0 });
      const params = new URLSearchParams(query);
      const hash = `#/${id}${params.size ? `?${params}` : ""}`;
      if (location.hash === hash) {
        setRoute(getRoute());
        if (scroll.current) scroll.current.scrollTop = 0;
      } else location.hash = hash;
    };
    if (dirty && !force)
      confirm(
        "Draf belum disimpan",
        "Isian tetap tersimpan sebagai draf lokal. Pindah ke halaman yang dipilih?",
        action,
      );
    else action();
  }
  useEffect(() => {
    if (!location.hash) history.replaceState(null, "", "#/dashboard");
    const handle = () => {
      setDirty(false);
      setRoute(getRoute());
      setSheet(null);
    };
    window.addEventListener("hashchange", handle);
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      window.removeEventListener("hashchange", handle);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (scroll.current)
        scroll.current.scrollTop = store.view(route.key).scroll || 0;
    });
    return () => cancelAnimationFrame(raf);
  }, [route.key]);
  useEffect(() => {
    document.title = `${route.id === "more" ? "Lainnya" : screen?.title || "Staff Mobile"} · DUMMY dr. Dibya`;
  }, [route.id]);
  useEffect(() => setPrintDoc(null), [route.key, visit.id]);
  function run(action, onError) {
    if (scenario === "conflict") {
      const message =
        "Konflik versi simulasi. Isian Anda tetap tersimpan sebagai draf. Pilih skenario Normal untuk melanjutkan.";
      onError?.(message);
      toast(message);
      return null;
    }
    try {
      const result = action();
      refresh();
      return result;
    } catch (e) {
      onError?.(e.message);
      toast(e.message);
      return null;
    }
  }
  function chooseVisit(privateOnly = false) {
    const choose = () =>
      setSheet({
        title: privateOnly ? "Pilih DRD Klinik Privat" : "Pilih pasien & DRD",
        body: (
          <VisitPicker
            privateOnly={privateOnly}
            onChoose={(id) => {
              prefs({ visit: id });
              setDirty(false);
              setSheet(null);
            }}
          />
        ),
      });
    if (dirty)
      confirm(
        "Ganti pasien / DRD",
        "Draf kunjungan ini tetap tersimpan. Lanjutkan ke kunjungan lain?",
        choose,
      );
    else choose();
  }
  async function openSource(source) {
    try {
      const url = await sourceUrl(source);
      setSheet({
        title: source.name,
        full: true,
        body:
          source.type === "application/pdf" ? (
            <>
              <a class="btn full" href={url} target="_blank" rel="noopener">
                Buka PDF Sumber
              </a>
              <Notice>
                Pratinjau PDF mengikuti dukungan browser. Jika area di bawah
                kosong, pilih Buka PDF Sumber untuk membuka atau mengunduhnya.
              </Notice>
              <iframe
                title="Pratinjau sumber PDF"
                src={url}
                style={{ width: "100%", height: 450, border: 0, marginTop: 15 }}
              />
            </>
          ) : (
            <img
              src={url}
              alt={`Sumber ${source.name}`}
              style={{ width: "100%", height: "auto" }}
            />
          ),
      });
    } catch (e) {
      toast(e.message);
    }
  }
  function print(title, data, fields = [], parameters) {
    const doc = { title, data, fields, parameters };
    setPrintDoc(doc);
    setSheet({
      title: "Pratinjau Dokumen",
      full: true,
      body: <PrintDocument doc={doc} preview />,
      footer: (
        <Button
          variant="primary full"
          icon="print"
          onClick={() => window.print()}
        >
          Cetak / Simpan PDF DUMMY
        </Button>
      ),
    });
  }
  function download(name, content, type = "text/plain") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Berkas demo siap diunduh.");
  }
  const ctx = {
    store,
    role,
    scenario,
    visit,
    patient,
    screen,
    query: route.query,
    dirty,
    revision,
    refresh,
    go: navigate,
    setDirty,
    toast,
    sheet: setSheet,
    confirm,
    preferences,
    prefs,
    setVisit: (id) => prefs({ visit: id }),
    chooseVisit: () => chooseVisit(false),
    choosePrivateVisit: () => chooseVisit(true),
    save: (module, row, version, onError) =>
      run(() => store.save(module, row, version), onError),
    publish: (module, id, version) =>
      run(() => store.publish(module, id, version)),
    remove: (module, id, version) =>
      run(() => store.remove(module, id, version)),
    print,
    download,
    addSources,
    openSource,
  };
  function page() {
    if (route.id === "more") return <Directory />;
    if (!screen)
      return (
        <Empty
          title="Halaman tidak ditemukan"
          text="Gunakan direktori atau katalog untuk memilih halaman."
          action={
            <Button variant="primary" onClick={() => navigate("catalog")}>
              Buka Katalog Layar
            </Button>
          }
        />
      );
    if (!canAccess(screen, role) || scenario === "denied")
      return (
        <Empty
          title="Akses tidak tersedia"
          text={`Preset ${role.label} tidak memiliki akses pada contoh skenario ini. Ubah peran atau skenario melalui tombol Demo.`}
          action={
            <Button
              icon="sliders"
              onClick={() =>
                setSheet({ title: "Pengaturan Demo", body: <DemoControls /> })
              }
            >
              Atur Peran & Skenario
            </Button>
          }
        />
      );
    if (scenario === "loading")
      return (
        <>
          <Notice>
            Contoh keadaan memuat. Isian dan data sebelumnya tetap disimpan.
          </Notice>
          <Skeleton />
          <Button
            variant="quiet full"
            onClick={() => prefs({ scenario: "normal" })}
          >
            Selesaikan Pemuatan Demo
          </Button>
        </>
      );
    if (scenario === "error")
      return (
        <Empty
          title="Data belum berhasil dimuat"
          text="Contoh kegagalan pemuatan. Anda dapat mencoba kembali tanpa kehilangan draf lokal."
          action={
            <Button
              icon="refresh"
              variant="primary"
              onClick={() => prefs({ scenario: "normal" })}
            >
              Coba Lagi
            </Button>
          }
        />
      );
    const props = { screen };
    switch (screen.kind) {
      case "dashboard":
        return <Dashboard />;
      case "clinic":
        return <Clinic />;
      case "patients":
        return <Patients />;
      case "workdesk":
        return <Workdesk />;
      case "clinical":
        return <Clinical key={`${screen.id}:${visit.id}`} {...props} />;
      case "lab":
        return <Laboratory {...props} />;
      case "analytics":
        return <Analytics {...props} />;
      case "chat":
        return <Chat {...props} />;
      case "calendar":
        return <Calendar />;
      case "access":
        return <Access {...props} />;
      case "upload":
        return <UploadScreen key={`${screen.id}:${visit.id}`} {...props} />;
      case "portal":
        return <Portal />;
      case "catalog":
        return <Catalog />;
      case "session":
        return (
          <>
            <h1 style={{ marginBottom: 22 }}>Sesi Demo</h1>
            <DemoControls />
          </>
        );
      case "about":
      case "install":
        return <InfoScreen {...props} />;
      default:
        return <ResourceScreen {...props} />;
    }
  }
  const mainTab =
    [
      "dashboard",
      "clinic",
      "docboard/calendar",
      "patients",
      "questions",
      "more",
    ].includes(route.id) &&
    !route.query.item &&
    !route.query.mode;
  function back() {
    if (route.query.item || route.query.mode) {
      navigate(route.id);
      return;
    }
    if (route.id.startsWith("drd/")) {
      navigate("clinic");
      return;
    }
    if (history.length > 1) {
      if (dirty)
        confirm(
          "Kembali ke halaman sebelumnya",
          "Draf lokal tetap tersimpan. Lanjutkan?",
          () => history.back(),
        );
      else history.back();
    } else navigate("dashboard");
  }
  return (
    <DemoContext.Provider value={ctx}>
      <div class="stage">
        <aside class="stage-note">
          <img
            class="brand"
            src="/staff-preview/brand/dpc-lab-logo.png"
            alt="dr. Dibya Private Clinic"
          />
          <div class="stage-rule" />
          <div class="eyebrow">MOBILE EXPERIENCE</div>
          <h2>
            Lebih tenang.
            <br />
            Lebih terhubung.
          </h2>
          <p>Ruang kerja Staff dan DocBoard, dirancang mulai dari genggaman.</p>
          <div class="stage-chips">
            <BadgeSmall>Interaktif</BadgeSmall>
            <BadgeSmall>Data dummy</BadgeSmall>
          </div>
          <Button icon="grid" onClick={() => navigate("catalog")}>
            Jelajahi {screens.length} Layar
          </Button>
          <footer>
            Pratinjau mobile dalam bingkai ponsel.
            <br />
            Desain web menyusul pada tahap berikutnya.
            <br />
            {__PREVIEW_VERSION__}
          </footer>
        </aside>
        <div class="phone" data-preview-version={__PREVIEW_VERSION__}>
          <div class="demo-strip">
            <span>PREVIEW · DATA DUMMY</span>
            <button
              onClick={() =>
                setSheet({ title: "Pengaturan Demo", body: <DemoControls /> })
              }
            >
              <Icon name="sliders" size={12} />
              {role.label} · Demo
            </button>
          </div>
          <header class="app-header">
            {!mainTab && (
              <button class="icon-btn" aria-label="Kembali" onClick={back}>
                <Icon name="back" size={21} />
              </button>
            )}
            {route.id === "dashboard" ? (
              <img
                class="header-brand"
                src="/staff-preview/brand/dpc-lab-logo.png"
                alt="dr. Dibya Private Clinic"
              />
            ) : (
              <span class="header-title">
                {route.id === "more"
                  ? "Ruang Kerja"
                  : screen?.group || "Staff Mobile"}
              </span>
            )}
            <div class="header-actions">
              <button
                class="icon-btn"
                aria-label="Buka chat tim"
                onClick={() => navigate("team-chat")}
              >
                <Icon name="message" size={20} />
              </button>
              <button
                class="icon-btn"
                aria-label="Buka notifikasi"
                onClick={() => navigate("notifications")}
              >
                <Icon name="bell" size={20} />
                <span class="notification-dot" />
              </button>
            </div>
          </header>
          <main
            ref={scroll}
            class="page-scroll"
            id="preview-main"
            onScroll={() => {
              clearTimeout(scrollSaveTimer.current);
              const key = route.key;
              const position = scroll.current?.scrollTop || 0;
              scrollSaveTimer.current = setTimeout(
                () => store.view(key, { scroll: position }),
                180,
              );
            }}
          >
            <div class="page" key={route.id}>
              {(!online || scenario === "offline") && (
                <Notice tone="warning" icon="info">
                  Mode offline demo. Perubahan lokal tetap dapat disimpan.
                </Notice>
              )}
              {!store.persistent && (
                <Notice tone="warning">
                  Penyimpanan browser tidak tersedia. Perubahan bertahan selama
                  sesi ini.
                </Notice>
              )}
              {page()}
            </div>
          </main>
          <nav class="bottom-nav" aria-label="Navigasi utama">
            {tabs.map(([id, label, icon]) => (
              <a
                href={`#/${id}`}
                class={tabFor(route.id) === id ? "active" : ""}
                aria-current={tabFor(route.id) === id ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(id);
                }}
              >
                <span class="nav-icon">
                  <Icon name={icon} />
                </span>
                <span>{label}</span>
              </a>
            ))}
          </nav>
          {sheet && (
            <Modal
              title={sheet.title}
              onClose={() => setSheet(null)}
              footer={sheet.footer}
              full={sheet.full}
            >
              {sheet.body}
            </Modal>
          )}
          {confirmation && (
            <Modal
              title={confirmation.title}
              onClose={() => setConfirmation(null)}
              footer={
                <div class="btns">
                  <Button onClick={() => setConfirmation(null)}>Batal</Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      const action = confirmation.action;
                      setConfirmation(null);
                      action();
                    }}
                  >
                    Lanjutkan
                  </Button>
                </div>
              }
            >
              <p class="muted">{confirmation.text}</p>
            </Modal>
          )}
          {notification && (
            <div class="toast" role="status">
              <Icon name="check" size={18} />
              <span>{notification}</span>
            </div>
          )}
        </div>
      </div>
      {printDoc && <PrintDocument doc={printDoc} />}
    </DemoContext.Provider>
  );
}
function BadgeSmall({ children }) {
  return <span class="badge neutral">{children}</span>;
}
function VisitPicker({ privateOnly, onChoose }) {
  const ctx = useDemo();
  const [search, setSearch] = useState("");
  const visits = ctx.store
    .list("visits")
    .filter(
      (v) =>
        (!privateOnly || v.location === "klinik_private") &&
        `${ctx.store.get("patients", v.patient_id)?.name} ${v.mr_id} ${locations[v.location]}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  return (
    <>
      <Field
        field={{ label: "Cari pasien atau DRD", type: "search" }}
        value={search}
        onChange={setSearch}
      />
      {visits.map((v) => (
        <LinkRow
          icon="file"
          title={ctx.store.get("patients", v.patient_id)?.name}
          subtitle={`${v.mr_id} · ${locations[v.location]}`}
          onClick={() => onChoose(v.id)}
        />
      ))}
      {!visits.length && <Empty title="DRD tidak ditemukan" />}
    </>
  );
}
function DemoControls() {
  const ctx = useDemo();
  return (
    <>
      <Notice>
        Semua isi dan aksi memakai data fiktif. Pemilihan peran adalah preset
        simulasi; hak akses produksi tetap mengikuti izin per akun.
      </Notice>
      <Field
        field={{
          label: "Peran simulasi",
          type: "select",
          options: personas.map((p) => p.label),
        }}
        value={ctx.role.label}
        onChange={(v) =>
          ctx.prefs({ role: personas.find((p) => p.label === v).id })
        }
      />
      <Field
        field={{
          label: "Skenario tampilan",
          type: "select",
          options: scenarios.map((s) => s[1]),
        }}
        value={scenarios.find((s) => s[0] === ctx.scenario)?.[1]}
        onChange={(v) =>
          ctx.prefs({ scenario: scenarios.find((s) => s[1] === v)[0] })
        }
      />
      <div class="spacer" />
      <Button
        variant="quiet full"
        icon="grid"
        onClick={() => {
          ctx.sheet(null);
          ctx.go("catalog");
        }}
      >
        Katalog Seluruh Layar
      </Button>
      <div class="spacer" />
      <Button
        variant="danger full"
        icon="refresh"
        onClick={() =>
          ctx.confirm(
            "Reset Data Demo",
            "Kembalikan seluruh data contoh, draf, sumber berkas, dan pengaturan preview. Penyimpanan aplikasi operasional tidak disentuh.",
            async () => {
              try {
                await resetSources();
                store.reset();
                ctx.setDirty(false);
                ctx.prefs(store.preferences());
                ctx.sheet(null);
                ctx.go("dashboard", {}, true);
                ctx.toast("Data demo kembali ke keadaan awal.");
              } catch (e) {
                ctx.toast(e.message);
              }
            },
          )
        }
      >
        Reset Data Demo
      </Button>
      <p class="page-microfooter">
        {__PREVIEW_VERSION__}
        <br />
        Preact · Mobile prototype · {screens.length} layar
      </p>
    </>
  );
}
function PrintDocument({ doc, preview = false }) {
  const { data, fields, parameters } = doc;
  return (
    <article class={preview ? "print-preview" : "print-sheet"}>
      <header>
        <img
          src="/staff-preview/brand/dpc-lab-logo.png"
          alt="dr. Dibya Private Clinic"
        />
        <img src="/staff-preview/brand/sw-healthcare.png" alt="SisiWanita" />
        <img src="/staff-preview/brand/melinda.png" alt="RSIA Melinda" />
      </header>
      <div class="dummy-stamp">DUMMY · BUKAN DOKUMEN KLINIS</div>
      <h1>{doc.title}</h1>
      <dl>
        {[
          "name",
          "mr_id",
          "lab_number",
          "date",
          "previous_date",
          "technician",
          "license",
          "notes",
        ]
          .filter((key) => data[key] !== undefined)
          .map((key) => [key, data[key]])
          .map(([key, value]) => (
            <div>
              <dt>
                {
                  {
                    name: "Nama",
                    mr_id: "DRD",
                    lab_number: "Nomor lab",
                    date: "Tanggal pemeriksaan",
                    previous_date: "Tanggal pembanding",
                    technician: "Petugas",
                    license: "SIP / izin",
                    notes: "Catatan",
                  }[key]
                }
              </dt>
              <dd>{value || "Tidak dicantumkan"}</dd>
            </div>
          ))}
        {fields
          .filter((f) => !["name", "date", "notes"].includes(f.key))
          .map((f) => (
            <div>
              <dt>{f.label}</dt>
              <dd>
                {locations[data[f.key]] ||
                  String(data[f.key] ?? "Tidak dicantumkan")}
              </dd>
            </div>
          ))}
      </dl>
      {parameters && (
        <table>
          <thead>
            <tr>
              <th>Pemeriksaan</th>
              {parameters[0]?.previous !== undefined && <th>Sebelumnya</th>}
              <th>Hasil</th>
              <th>Satuan</th>
              <th>
                {parameters[0]?.previous !== undefined ? "Selisih" : "Rujukan"}
              </th>
            </tr>
          </thead>
          <tbody>
            {parameters.map((p) => (
              <tr>
                <td>{p.name}</td>
                {p.previous !== undefined && (
                  <td>
                    {p.previous ? `${p.previous.raw} ${p.previous.unit}` : "—"}
                  </td>
                )}
                <td>{p.raw}</td>
                <td>{p.unit || "—"}</td>
                <td>
                  {p.previous !== undefined
                    ? (p.delta ?? "—")
                    : p.reference || "Tidak dicantumkan"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div class="signoff">
        Area pengesahan
        <br />
        <br />
        <br />
        {data.technician || "Petugas Demo"}
      </div>
      <footer>
        Dihasilkan oleh prototipe Staff Mobile · Seluruh informasi adalah data
        fiktif.
      </footer>
    </article>
  );
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.__previewInstall = event;
  window.dispatchEvent(new Event("preview:installable"));
});
render(<App />, document.getElementById("app"));
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker
      .register("/staff-preview/sw.js", { scope: "/staff-preview/" })
      .catch((error) =>
        console.warn("Preview offline belum tersedia:", error.message),
      ),
  );
