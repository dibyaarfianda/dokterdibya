import { useEffect, useRef } from "preact/hooks";
import { locations, categories } from "./domain.js";
import { useDemo } from "./context.jsx";
const paths = {
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  calendar:
    "M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2-2v4m10-4v4M3 10h18m-14 4h2m4 0h2m-8 4h2",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7a4 4 0 0 1 0 8",
  user: "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2m8-12a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  message: "M21 11a8 8 0 0 1-8 8H7l-5 3 1-7a8 8 0 1 1 18-4ZM7 10h10M7 14h6",
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "m21 21-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9Zm-8 12a2 2 0 0 0 4 0",
  arrow: "m9 5 7 7-7 7",
  back: "m15 5-7 7 7 7M8 12h13",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  check: "m4 12 5 5L20 6",
  sliders: "M4 6h8m4 0h4M4 12h2m4 0h10M4 18h11m4 0h1M12 3v6M6 9v6m9 0v6",
  flask: "M9 3h6m-5 0v7l-6 9a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  file: "M14 2H5v20h14V7Zm0 0v6h5M8 12h8m-8 4h8",
  clipboard: "M9 3H5v19h14V3h-4M9 2h6v4H9zm-1 9h8m-8 4h8",
  grid: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  wallet: "M3 6h18v15H3zm0 0V3h15v3m3 6h-6v5h6m-3-2h.01",
  shield: "m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6",
  activity: "M2 12h4l3-8 6 16 3-8h4",
  chart: "M3 3v18h18M7 16v-4m5 4V7m5 9V4",
  upload: "M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5",
  download: "M12 3v13m-5-5 5 5 5-5M3 17v4h18v-4",
  pill: "m8 3-5 5a5.7 5.7 0 0 0 8 8l5-5a5.7 5.7 0 0 0-8-8Zm-3 3 8 8",
  book: "M12 5C8 2 3 3 3 3v17s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Zm0 0v17",
  star: "m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  refresh: "M20 7V2l-4 4M4 17v5l4-4M20 7a9 9 0 0 0-16 1m0 9a9 9 0 0 0 16-1",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l4 2",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 7v7m0-10h.01",
  phone: "M7 2h10a1 1 0 0 1 1 1v18H6V3a1 1 0 0 1 1-1Zm3 16h4",
  box: "m12 2 9 5v10l-9 5-9-5V7zm0 10 9-5M3 7l9 5v10M8 4l9 5",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-3-5 1 2h4l1-2 3 2v3l3 2v4l-3 2v3l-3 2-1-2h-4l-1 2-3-2v-3l-3-2v-4l3-2V5z",
  hospital: "M4 22V5h16v17M9 22v-6h6v6M12 7v6m-3-3h6",
  scan: "M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5M7 12h10",
  send: "m22 2-7 20-4-9-9-4Zm0 0L11 13",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 16h12l1-16M10 10v8m4-8v8",
  edit: "m15 3 6 6-12 12H3v-6Zm-2 2 6 6",
  filter: "M3 4h18l-7 8v7l-4 2v-9z",
  print: "M6 8V2h12v6M6 17H3V8h18v9h-3M6 14h12v8H6z",
  headphones: "M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3zm14 0h4v8h-4z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  logout: "M9 3H3v18h6m5-14 5 5-5 5m-7-5h14",
  baby: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-3 7h.01m6 0h.01m-6 4s3 3 6 0M12 4c-2-4 3-4 3-1",
  megaphone: "m3 9 15-6v18L3 15Zm3 7 2 6h4l-2-5M21 9v6",
  gift: "M3 8h18v5H3zm2 5v9h14v-9M12 8v14m0-14C2 8 4-1 9 3l3 5c10 0 8-9 3-5z",
  truck:
    "M2 5h13v13H2zm13 5h4l3 5v3h-7M6 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  bag: "M4 7h16l1 15H3Zm4 0V5a4 4 0 0 1 8 0v2",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
};
paths.history = paths.clock;
paths.userplus = paths.user;
paths.receipt = paths.file;
paths.calculator = paths.grid;
paths.queue = paths.users;
export function Icon({ name = "grid", size = 22, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}
export function Button({
  children,
  icon,
  variant = "",
  class: className = "",
  ...props
}) {
  return (
    <button type="button" class={`btn ${variant} ${className}`} {...props}>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  );
}
export function Badge({ children, tone }) {
  const text = String(children || "Draf");
  const good =
    /Terbit|Selesai|Lunas|Aktif|Lengkap|Disetujui|Terverifikasi|Terkonfirmasi/.test(
      text,
    ) && !text.includes("Belum");
  const bad = /Gagal|Dibatalkan|Dibatasi|Nonaktif|Konflik/.test(text);
  return (
    <span class={`badge ${tone || (bad ? "danger" : good ? "good" : "amber")}`}>
      <span class="status-dot" />
      {text}
    </span>
  );
}
export function Title({ kicker, children, description, action }) {
  return (
    <div class="page-title">
      <div>
        {kicker && <div class="eyebrow">{kicker}</div>}
        <h1>{children}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Section({
  title,
  description,
  action,
  children,
  class: className = "",
}) {
  return (
    <section class={`section ${className}`}>
      {(title || description || action) && (
        <div class="section-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Empty({
  title = "Belum ada data",
  text = "Tambahkan data demo pertama untuk mencoba alur ini.",
  action,
}) {
  return (
    <div class="empty">
      <div class="empty-icon">
        <Icon name="file" size={30} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Notice({ children, tone = "info", icon = "info" }) {
  return (
    <div class={`notice ${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={icon} size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Search({
  value,
  onInput,
  placeholder = "Cari...",
  onFilter,
  filterActive = false,
}) {
  return (
    <div class="search-row">
      <label class="search">
        <Icon name="search" size={19} />
        <input
          aria-label={placeholder}
          type="search"
          value={value}
          placeholder={placeholder}
          onInput={(e) => onInput(e.currentTarget.value)}
        />
      </label>
      {onFilter && (
        <button
          class={`icon-btn filter ${filterActive ? "selected" : ""}`}
          aria-label="Filter daftar"
          onClick={onFilter}
        >
          <Icon name="filter" size={20} />
        </button>
      )}
    </div>
  );
}
export function LinkRow({ icon, title, subtitle, onClick, badge, tail }) {
  return (
    <button class="link-row" onClick={onClick}>
      <span class="icon-tile">
        <Icon name={icon} />
      </span>
      <span class="row-content">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
      {badge && <Badge>{badge}</Badge>}
      {tail || <Icon name="arrow" size={17} />}
    </button>
  );
}
export function Identity({ visit, patient, onChange }) {
  return (
    <div class="identity">
      <div class="avatar">
        {patient?.name
          ?.split(" ")
          .slice(0, 2)
          .map((w) => w[0])
          .join("") || "P"}
      </div>
      <div class="row-content">
        <strong>{patient?.name || "Pilih pasien"}</strong>
        <small>
          {visit?.mr_id || "DRD belum dipilih"}
          {visit?.category ? ` · ${categories[visit.category]}` : ""}
        </small>
        <small>{locations[visit?.location]}</small>
      </div>
      {onChange && (
        <button class="text-btn" onClick={onChange}>
          Ganti
        </button>
      )}
    </div>
  );
}
export function Field({ field, value, onChange, error, disabled = false }) {
  const { store } = useDemo();
  const options =
    field.type === "patient"
      ? store.list("patients").map((p) => [p.id, p.name])
      : (field.options || []).map((x) => [
          x,
          locations[x] || categories[x] || x,
        ]);
  return (
    <label class="field">
      <span>
        {field.label}
        {field.required && <b> *</b>}
      </span>
      {field.type === "textarea" ? (
        <textarea
          value={value ?? ""}
          disabled={disabled}
          rows="3"
          onInput={(e) => onChange(e.currentTarget.value)}
        />
      ) : field.type === "select" || field.type === "patient" ? (
        <select
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.currentTarget.value)}
        >
          <option value="">Pilih {field.label.toLowerCase()}</option>
          {options.map(([v, l]) => (
            <option value={v} key={v}>
              {l}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type || "text"}
          step={field.type === "number" ? "any" : undefined}
          inputMode={field.type === "number" ? "decimal" : undefined}
          value={value ?? ""}
          disabled={disabled}
          onInput={(e) => onChange(e.currentTarget.value)}
        />
      )}{" "}
      {error && <small class="field-error">{error}</small>}
    </label>
  );
}
export function Modal({ title, children, onClose, footer, full = false }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    node?.querySelector("button,input,select,textarea")?.focus();
    const listener = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = [
          ...node.querySelectorAll("button,input,select,textarea,a[href]"),
        ].filter((x) => !x.disabled);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      previous?.focus?.();
    };
  }, []);
  return (
    <div class="modal-wrap">
      <button class="modal-scrim" aria-label="Tutup panel" onClick={onClose} />
      <div
        class={`sheet ${full ? "sheet-full" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div class="sheet-handle" />
        <header>
          <h2>{title}</h2>
          <button class="icon-btn" aria-label="Tutup" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div class="sheet-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}
export function UploadBox({
  onFiles,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  multiple = true,
  disabled = false,
}) {
  return (
    <>
      <label
        class="btn quiet full"
        style={{
          position: "relative",
          overflow: "hidden",
          marginBottom: 10,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Icon name="scan" size={19} /> Ambil Foto Kamera
        <input
          aria-label="Ambil foto kamera"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={disabled}
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            width: "100%",
            height: "100%",
          }}
          onChange={(e) => {
            onFiles([...e.currentTarget.files]);
            e.currentTarget.value = "";
          }}
        />
      </label>
      <label class="upload-box">
        <Icon name="upload" size={28} />
        <strong>Pilih dari galeri atau PDF</strong>
        <span>JPG, PNG, WebP, atau PDF · disimpan sebagai sumber demo</span>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            onFiles([...e.currentTarget.files]);
            e.currentTarget.value = "";
          }}
        />
      </label>
    </>
  );
}
export function Skeleton() {
  return (
    <div aria-label="Memuat data" role="status" class="skeletons">
      {[1, 2, 3, 4].map((x) => (
        <div class="skeleton" key={x}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
