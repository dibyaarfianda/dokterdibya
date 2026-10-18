import { useState, useEffect } from "preact/hooks";
import { definitions, field } from "./definitions.js";
import { useDemo } from "./context.jsx";
import {
  canWrite,
  filterResources,
  locations,
  categories,
  displayDate,
  money,
  today,
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
  Modal,
  Identity,
} from "./ui.jsx";

export function ResourceScreen({ screen }) {
  const ctx = useDemo();
  const { store, go, query, scenario, role } = ctx;
  const definition = definitions[screen.id];
  if (!definition)
    return (
      <Empty
        title="Halaman tidak ditemukan"
        text="Buka katalog untuk memilih halaman."
      />
    );
  const view = store.view(screen.id);
  const [search, setSearch] = useState(view.search || "");
  const [filter, setFilter] = useState(view.filter || "Semua");
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => {
    setSearch(store.view(screen.id).search || "");
    setFilter(store.view(screen.id).filter || "Semua");
  }, [screen.id]);
  const rows =
    screen.id === "logs"
      ? [
          ...store.audit().map((x, i) => ({
            ...x,
            id: `audit-${i}`,
            version: 1,
            date: today(),
            status: "Tercatat",
          })),
          ...store.list(screen.id),
        ]
      : store.list(screen.id);
  const item = query.item ? rows.find((x) => x.id === query.item) : null;
  const writable = !definition.readOnly && canWrite(screen, role);
  const updateSearch = (value) => {
    setSearch(value);
    store.view(screen.id, { search: value });
  };
  const updateFilter = (value) => {
    setFilter(value);
    store.view(screen.id, { filter: value });
    setFilterOpen(false);
  };
  if (query.mode === "new" || query.mode === "edit")
    return (
      <ResourceEditor
        key={`${screen.id}:${query.item || "new"}`}
        screen={screen}
        definition={definition}
        item={item}
        writable={writable}
      />
    );
  if (query.item && item)
    return (
      <ResourceDetail
        screen={screen}
        definition={definition}
        item={item}
        writable={writable}
      />
    );
  if (query.item && !item)
    return (
      <Empty
        title="Data tidak ditemukan"
        text="Item ini mungkin telah dihapus dari ruang demo."
        action={
          <Button onClick={() => go(screen.id)}>Kembali ke daftar</Button>
        }
      />
    );
  const list =
    scenario === "empty"
      ? []
      : filterResources(rows, { date: query.date, search, status: filter });
  return (
    <>
      <Title kicker={screen.group} description={definition.description}>
        {screen.title}
      </Title>
      {definition.disclaimer && <Notice>{definition.disclaimer}</Notice>}
      <Search
        value={search}
        onInput={updateSearch}
        placeholder={`Cari ${screen.title.toLowerCase()}`}
        onFilter={() => setFilterOpen(true)}
        filterActive={filter !== "Semua"}
      />
      <div class="between" style={{ marginBottom: 16 }}>
        <span class="page-count">
          {list.length} {definition.readOnly ? "catatan" : "item"}
          {filter !== "Semua" ? ` · ${filter}` : ""}
        </span>
        {writable && (
          <Button
            icon="plus"
            variant="primary small"
            onClick={() => go(screen.id, { mode: "new" })}
          >
            Tambah
          </Button>
        )}
      </div>
      {definition.diagnostic && (
        <Button
          variant="quiet full"
          icon="refresh"
          onClick={() =>
            ctx.toast(
              "Pemeriksaan demo selesai. Penyimpanan lokal dan antarmuka siap.",
            )
          }
        >
          Jalankan Pemeriksaan
        </Button>
      )}
      {definition.sync && (
        <Notice icon="refresh">
          Sinkronisasi di halaman ini disimulasikan. Riwayat pekerjaan dapat
          diperiksa tanpa menghubungi sistem rumah sakit.
        </Notice>
      )}
      {list.length ? (
        list.map((row) => (
          <button
            class="resource-card"
            key={row.id}
            onClick={() => go(screen.id, { item: row.id })}
          >
            <div class="card-line">
              {definition.queue && (
                <span class="queue-number">{row.queue}</span>
              )}
              <div class="row-content">
                <h3>{row.name}</h3>
                <p>
                  {definition.stock
                    ? `Stok sistem ${row.stock} · Fisik ${row.physical}`
                    : definition.receipt
                      ? `${row.quantity} item · ${money(Number(row.price) * Number(row.quantity))}`
                      : definition.print && row.amount
                        ? money(row.amount)
                        : definition.fields.some((f) => f.key === "price")
                          ? `${row.stock !== undefined ? `${row.stock} ${row.unit || "item"} · ` : ""}${money(row.price)}`
                          : definition.fields.some(
                                (f) => f.key === "location",
                              ) && row.location
                            ? locations[row.location]
                            : row.content?.slice(0, 85) ||
                              row.detail ||
                              row.notes}
                </p>
              </div>
              <Badge>{row.status}</Badge>
            </div>
            <div class="card-foot">
              <Icon name={definition.queue ? "clock" : screen.icon} size={13} />
              <span>
                {displayDate(row.date || today())}
                {row.time ? ` · ${row.time}` : ""}
              </span>
              <Icon name="arrow" size={16} />
            </div>
          </button>
        ))
      ) : (
        <Empty
          title={search ? "Tidak ada hasil pencarian" : "Belum ada data"}
          action={
            writable && (
              <Button
                icon="plus"
                variant="primary"
                onClick={() => go(screen.id, { mode: "new" })}
              >
                Tambah Data
              </Button>
            )
          }
        />
      )}
      {filterOpen && (
        <Modal title="Filter daftar" onClose={() => setFilterOpen(false)}>
          {["Semua", ...new Set(rows.map((r) => r.status))].map((status) => (
            <label class="review-option">
              <input
                type="radio"
                checked={filter === status}
                name="status"
                onChange={() => updateFilter(status)}
              />
              <span>{status}</span>
            </label>
          ))}
        </Modal>
      )}
    </>
  );
}
function ResourceDetail({ screen, definition, item, writable }) {
  const ctx = useDemo();
  const { go, store } = ctx;
  const patient = definition.fields.some((f) => f.type === "patient")
    ? store.get("patients", item.patient_id)
    : null;
  function change(values) {
    const result = ctx.save(screen.id, { ...item, ...values }, item.version);
    if (result) ctx.toast("Perubahan demo tersimpan.");
  }
  return (
    <>
      <Title
        kicker={screen.title}
        description={`ID ${item.id}`}
        action={<Badge>{item.status}</Badge>}
      >
        {item.name}
      </Title>
      {patient && (
        <Identity
          patient={patient}
          visit={store
            .list("visits")
            .find(
              (v) =>
                v.patient_id === patient.id &&
                (!item.location || v.location === item.location),
            )}
        />
      )}
      <Section title="Rincian">
        <dl class="detail-list">
          {definition.fields.map((f) => (
            <div key={f.key}>
              <dt>{f.label}</dt>
              <dd>
                {f.type === "patient"
                  ? patient?.name || "Belum dipilih"
                  : f.type === "date"
                    ? displayDate(item[f.key])
                    : locations[item[f.key]] ||
                      categories[item[f.key]] ||
                      String(item[f.key] ?? "Tidak dicantumkan")}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
      {definition.stock && (
        <Section title="Hasil perhitungan">
          <div class="between">
            <span class="muted">Selisih fisik terhadap sistem</span>
            <strong>
              {Number(item.physical) - Number(item.stock)} {item.unit}
            </strong>
          </div>
        </Section>
      )}
      {definition.surgery && (
        <Section title="Perjalanan operasi">
          <div class="chips">
            {["Terjadwal", "Persiapan", "Berlangsung", "Selesai"].map((s) => (
              <button
                class={`chip ${item.status === s ? "active" : ""}`}
                disabled={!writable}
                onClick={() => change({ status: s })}
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            icon="clipboard"
            variant="quiet full"
            onClick={() => go("docboard/postop")}
          >
            Catatan Pascaoperasi
          </Button>
          <div class="spacer" />
          <label class="check-label">
            <input
              type="checkbox"
              checked={!!item.checklist}
              disabled={!writable}
              onChange={(e) => change({ checklist: e.currentTarget.checked })}
            />
            Checklist persiapan telah diperiksa
          </label>
          <Button
            variant="full"
            onClick={() =>
              ctx.sheet({
                title: "Hasil & audit operasi",
                body: (
                  <>
                    <Notice>
                      Ringkasan dummy untuk memeriksa alur dokumentasi.
                    </Notice>
                    <p class="muted">
                      Status: {item.status}
                      <br />
                      Versi tersimpan: {item.version}
                      <br />
                      Catatan: {item.notes}
                    </p>
                    <Button
                      variant="quiet full"
                      onClick={() => {
                        ctx.sheet(null);
                        go("docboard/postop");
                      }}
                    >
                      Isi Catatan Hasil Operasi
                    </Button>
                  </>
                ),
              })
            }
          >
            Hasil & Audit
          </Button>
        </Section>
      )}
      <div class="btns">
        {writable && (
          <Button
            icon="edit"
            variant="primary"
            onClick={() => go(screen.id, { item: item.id, mode: "edit" })}
          >
            Edit
          </Button>
        )}
        {(definition.print || definition.receipt) && (
          <Button
            icon="print"
            onClick={() => ctx.print(screen.title, item, definition.fields)}
          >
            Cetak / PDF
          </Button>
        )}
      </div>
      <div class="spacer" />
      {definition.publish && writable && (
        <Button
          variant="teal full"
          icon="check"
          onClick={() => {
            if (ctx.publish(screen.id, item.id, item.version))
              ctx.toast("Terbit di portal pasien demo.");
          }}
        >
          Terbitkan
        </Button>
      )}
      {definition.payment && writable && item.status !== "Lunas" && (
        <Button
          variant="teal full"
          icon="wallet"
          onClick={() =>
            ctx.confirm(
              "Konfirmasi pembayaran demo",
              "Catat pelunasan invoice ini pada ruang demo?",
              () => change({ status: "Lunas", paid: item.amount }),
            )
          }
        >
          Catat Pelunasan
        </Button>
      )}
      {definition.vote && (
        <Button
          variant="quiet full"
          icon="check"
          onClick={() => change({ votes: (item.votes || 0) + 1 })}
        >
          Simulasikan Suara · {item.votes || 0} suara
        </Button>
      )}
      {definition.enroll && (
        <Button
          variant="quiet full"
          icon="userplus"
          onClick={() => change({ enrolled: (item.enrolled || 0) + 1 })}
        >
          Daftarkan Peserta Demo · {item.enrolled || 0}/{item.quota || 12}
        </Button>
      )}
      {definition.markRead && (
        <Button
          variant="quiet full"
          icon="check"
          onClick={() => change({ read: true, status: "Dibaca" })}
        >
          {item.read ? "Sudah dibaca" : "Tandai Dibaca"}
        </Button>
      )}
      {definition.sync && (
        <Button
          variant="quiet full"
          icon="refresh"
          onClick={() =>
            change({
              status: "Selesai",
              detail:
                "Sinkronisasi demo selesai. Tidak ada permintaan ke sistem rumah sakit.",
            })
          }
        >
          Jalankan Sinkronisasi Demo
        </Button>
      )}
      {definition.queue && writable && (
        <div class="btns">
          {["Menunggu", "Diperiksa", "Selesai"].map((status) => (
            <Button
              variant={item.status === status ? "quiet small" : "small"}
              onClick={() => change({ status })}
            >
              {status}
            </Button>
          ))}
        </div>
      )}
      {definition.visit && (
        <Button
          variant="quiet full"
          icon="file"
          onClick={() => {
            ctx.setVisit(
              store.list("visits").find((v) => v.patient_id === item.patient_id)
                ?.id,
            );
            go("drd/identitas");
          }}
        >
          Buka Rekam Medis
        </Button>
      )}
      {writable && (
        <button
          class="text-btn danger"
          onClick={() =>
            ctx.confirm(
              "Hapus item demo",
              "Item disembunyikan dari daftar. Reset Data Demo dapat mengembalikan data awal.",
              () => {
                if (ctx.remove(screen.id, item.id, item.version)) go(screen.id);
              },
            )
          }
        >
          <Icon name="trash" size={16} /> Hapus dari daftar
        </button>
      )}
    </>
  );
}
function ResourceEditor({ screen, definition, item, writable }) {
  const ctx = useDemo();
  const { store, go } = ctx;
  const scope = item?.id || "new";
  const cached = store.getDraft(screen.id, scope);
  const [form, setForm] = useState(
    () =>
      cached || {
        ...item,
        date: item?.date || today(),
        status: item?.status || "Draf",
        name: item?.name || "",
      },
  );
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  useEffect(() => {
    ctx.setDirty(Boolean(cached));
    return () => ctx.setDirty(false);
  }, []);
  const set = (key, value) => {
    const next = { ...form, [key]: value };
    setForm(next);
    store.setDraft(screen.id, scope, next);
    ctx.setDirty(true);
  };
  function save() {
    if (!writable) return;
    const fields = definition.fields;
    const required =
      fields.find((f) => f.key === "name") ||
      fields.find((f) => f.type === "patient");
    if (required && !String(form[required.key] || "").trim()) {
      setErrors({ [required.key]: "Wajib diisi untuk menyimpan." });
      return;
    }
    const record = {
      ...form,
      name:
        String(form.name || "").trim() ||
        store.get("patients", form.patient_id)?.name ||
        screen.title,
    };
    const result = ctx.save(screen.id, record, form.version, (error) =>
      setError(error),
    );
    if (result) {
      store.setDraft(screen.id, scope, null);
      ctx.setDirty(false);
      ctx.toast("Data demo tersimpan.");
      go(screen.id, { item: result.id }, true);
    }
  }
  return (
    <>
      <Title
        kicker={screen.title}
        description={
          cached
            ? "Draf lokal dipulihkan."
            : "Perubahan hanya berlaku di ruang demo."
        }
      >
        {item ? "Edit" : "Tambah"} {screen.title}
      </Title>
      {!writable && (
        <Notice tone="warning">
          Preset peran ini hanya memiliki akses baca.
        </Notice>
      )}
      {error && (
        <Notice tone="danger">
          {error}
          <br />
          <button
            class="text-btn"
            onClick={() =>
              ctx.confirm(
                "Muat versi tersimpan",
                "Isian lokal akan diganti dengan versi tersimpan.",
                () => {
                  store.setDraft(screen.id, scope, null);
                  setForm(store.get(screen.id, scope) || {});
                  setError("");
                  ctx.setDirty(false);
                },
              )
            }
          >
            Muat Versi Tersimpan
          </button>
        </Notice>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Section title="Informasi utama">
          {definition.fields.map((f) => (
            <Field
              key={f.key}
              field={{ ...f, required: f.key === "name" }}
              value={form[f.key]}
              error={errors[f.key]}
              disabled={!writable}
              onChange={(v) => set(f.key, v)}
            />
          ))}
        </Section>
        <div class="action-footer">
          <Button
            variant="primary full"
            icon="check"
            disabled={!writable}
            onClick={save}
          >
            Simpan Data Demo
          </Button>
        </div>
      </form>
      <button
        class="text-btn danger"
        onClick={() =>
          ctx.confirm(
            "Buang draf",
            "Isian yang belum disimpan akan dihapus dari perangkat ini.",
            () => {
              store.setDraft(screen.id, scope, null);
              ctx.setDirty(false);
              go(screen.id, {}, true);
            },
          )
        }
      >
        Buang Draf
      </button>
    </>
  );
}
