import { useEffect, useMemo, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';

const TABS = [
  ['timeline', 'Timeline'],
  ['cppt', 'CPPT'],
  ['penunjang', 'Penunjang'],
  ['operasi', 'Operasi'],
  ['resume', 'Resume'],
  ['resep', 'Resep'],
];

function formatDateTime(value) {
  if (!value) return '-';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? `${value.replace(' ', 'T')}+07:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDay(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function dayKey(value) {
  if (!value) return 'Tanpa tanggal';
  return String(value).slice(0, 10);
}

function lengthOfStay(admission, discharge) {
  const start = Date.parse(admission || '');
  const end = Date.parse(discharge || '');
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '-';
  return `${Math.max(1, Math.ceil((end - start) / 86400000))} hari`;
}

function humanize(value) {
  return String(value || '').replace(/\[\d+\]/g, '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function contentText(entry) {
  return [entry.subjective, entry.objective, entry.assessment, entry.plan, entry.instruksiDokter, entry.situation, entry.background, entry.recommendation]
    .filter(Boolean).join(' ');
}

function buildTimeline(snapshot) {
  const events = [];
  const overview = snapshot?.overview || {};
  if (overview.admission_at) events.push({ at: overview.admission_at, type: 'admission', title: 'Masuk rawat inap', subtitle: overview.location || 'Gambiran' });
  for (const entry of snapshot?.cppt || []) {
    events.push({ at: entry.created_at, type: 'cppt', title: entry.author || 'CPPT', subtitle: entry.assessment || entry.subjective || entry.situation || entry.type || 'Catatan perkembangan', entry });
  }
  for (const item of snapshot?.penunjang?.results || []) {
    const at = item.date ? (/^\d{4}-\d{2}-\d{2} /.test(item.date) ? `${item.date.replace(' ', 'T')}+07:00` : item.date) : null;
    events.push({ at, type: 'penunjang', title: item.name || 'Pemeriksaan penunjang', subtitle: item.value || (item.isDone ? 'Selesai' : 'Pending'), entry: item });
  }
  for (const item of snapshot?.operations || []) {
    const report = item.report || {};
    const dateMatch = String(report.tanggalOperasi || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const at = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T${report.waktuMulai || '00:00'}:00+07:00` : null;
    events.push({ at, type: 'operation', title: report.tindakanOperasi || snapshot?.selected_operation?.operation_name || 'Tindakan operasi', subtitle: report.diagnosaAkhir || report.temuanOperasi || `Operasi ${item.operation_id}`, entry: item });
  }
  if (overview.discharge_at) events.push({ at: overview.discharge_at, type: 'discharge', title: 'Keluar rumah sakit', subtitle: 'Episode rawat selesai' });
  return events.sort((left, right) => String(left.at || '9999').localeCompare(String(right.at || '9999')));
}

function ClinicalFields({ entry }) {
  const fields = [
    ['Subjective', entry.subjective], ['Objective', entry.objective], ['Assessment', entry.assessment],
    ['Plan', entry.plan], ['Instruksi Dokter', entry.instruksiDokter], ['Situation', entry.situation],
    ['Background', entry.background], ['Recommendation', entry.recommendation],
  ].filter(([, value]) => value);
  return <div class="morbid-clinical-fields">{fields.map(([label, value]) => <div key={label}><span>{label}</span><p>{value}</p></div>)}</div>;
}

function FieldList({ fields }) {
  const rows = Object.entries(fields || {}).filter(([, value]) => value !== null && value !== undefined && String(value).trim());
  if (!rows.length) return <div class="morbid-empty">Data belum tersedia.</div>;
  return <div class="morbid-field-list">{rows.map(([key, value]) => <div key={key}><span>{humanize(key)}</span><p>{Array.isArray(value) ? value.join(', ') : String(value)}</p></div>)}</div>;
}

export default function MorbidCaseDetail({ id }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('timeline');
  const [cpptRole, setCpptRole] = useState('all');
  const [cpptAuthor, setCpptAuthor] = useState('all');
  const [cpptSearch, setCpptSearch] = useState('');
  const [cpptDate, setCpptDate] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try { setData(await api.getMorbidCase(id)); }
    catch (err) { setError(err.message || 'Gagal memuat Morbid Case'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try { setData(await api.refreshMorbidCase(id)); }
    catch (err) { setError(err.message || 'Gagal memperbarui Morbid Case'); }
    finally { setRefreshing(false); }
  }

  const snapshot = data?.snapshot;
  const record = data?.morbid_case;
  const overview = snapshot?.overview || {};
  const timeline = useMemo(() => buildTimeline(snapshot), [snapshot]);
  const cpptEntries = snapshot?.cppt || [];
  const cpptAuthors = useMemo(() => [...new Set(cpptEntries.map(entry => entry.author).filter(Boolean))].sort((left, right) => left.localeCompare(right)), [snapshot]);
  const latestCppt = cpptEntries.length ? cpptEntries[cpptEntries.length - 1] : null;
  const filteredCppt = useMemo(() => (snapshot?.cppt || []).filter(entry => {
    if (cpptRole !== 'all' && entry.author_role !== cpptRole) return false;
    if (cpptAuthor !== 'all' && entry.author !== cpptAuthor) return false;
    if (cpptDate && String(entry.created_at || '').slice(0, 10) !== cpptDate) return false;
    if (cpptSearch && !`${entry.author || ''} ${contentText(entry)}`.toLowerCase().includes(cpptSearch.toLowerCase())) return false;
    return true;
  }), [snapshot, cpptRole, cpptAuthor, cpptDate, cpptSearch]);

  if (loading) return <div class="loading-state"><div class="spinner" /></div>;
  if (!record) return <div class="monitor-state"><strong>Morbid Case tidak ditemukan</strong><p>{error}</p></div>;

  return (
    <div class="view-morbid-detail">
      <header class="morbid-detail-header">
        <button class="btn-back" onClick={() => route('/docboard/morbid-cases')} aria-label="Kembali">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6" /></svg>
        </button>
        <div class="morbid-detail-title"><span>Morbid Case</span><h1>{record.patient_name}</h1><p>MR {record.mr_id || '-'} · {record.case_id}</p></div>
        <button class="morbid-refresh" type="button" disabled={refreshing} onClick={refresh} title="Perbarui data" aria-label="Perbarui data">
          <svg class={refreshing ? 'spinning' : ''} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 1 0 2 5" /><polyline points="20,4 20,11 13,11" /></svg>
        </button>
      </header>

      {error && <div class="morbid-alert error">{error}</div>}
      {(snapshot?.warnings || []).length > 0 && <div class="morbid-alert warning">{snapshot.warnings.join(' · ')}</div>}

      <section class="morbid-overview">
        <div class="morbid-overview-primary"><span>Diagnosis</span><strong>{record.diagnosis || snapshot?.selected_operation?.diagnosis || '-'}</strong></div>
        <div><span>DPJP</span><strong>{overview.dpjp_name || record.doctor_name || '-'}</strong></div>
        <div><span>Ruangan</span><strong>{overview.location || '-'}</strong></div>
        <div><span>MRS</span><strong>{formatDateTime(overview.admission_at)}</strong></div>
        <div><span>KRS</span><strong>{formatDateTime(overview.discharge_at)}</strong></div>
        <div><span>Lama Rawat</span><strong>{lengthOfStay(overview.admission_at, overview.discharge_at)}</strong></div>
        <div><span>CPPT Terakhir</span><strong>{formatDateTime(overview.last_cppt_at)}</strong></div>
        <div><span>Snapshot</span><strong>{formatDateTime(snapshot?.generated_at || record.collected_at)}</strong></div>
      </section>

      {!snapshot ? (
        <div class="monitor-state"><strong>{record.status === 'error' ? 'Pengambilan data gagal' : 'Data sedang dikumpulkan'}</strong><p>{record.last_error || 'Silakan perbarui kembali.'}</p></div>
      ) : (
        <>
          <nav class="morbid-tabs" aria-label="Bagian Morbid Case">
            {TABS.map(([key, label]) => <button type="button" class={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)} key={key}>{label}</button>)}
          </nav>

          <main class="morbid-tab-content">
            {activeTab === 'timeline' && <TimelineTab events={timeline} />}
            {activeTab === 'cppt' && <CpptTab entries={filteredCppt} total={cpptEntries.length} latestEntry={latestCppt} authors={cpptAuthors} author={cpptAuthor} setAuthor={setCpptAuthor} role={cpptRole} setRole={setCpptRole} search={cpptSearch} setSearch={setCpptSearch} date={cpptDate} setDate={setCpptDate} />}
            {activeTab === 'penunjang' && <PenunjangTab data={snapshot.penunjang} />}
            {activeTab === 'operasi' && <OperationTab operations={snapshot.operations || []} />}
            {activeTab === 'resume' && <ResumeTab snapshot={snapshot} />}
            {activeTab === 'resep' && <PrescriptionTab items={snapshot.prescriptions || []} />}
          </main>
        </>
      )}
    </div>
  );
}

function TimelineTab({ events }) {
  const groups = [];
  for (const event of events) {
    const key = dayKey(event.at);
    let group = groups.find(item => item.key === key);
    if (!group) { group = { key, events: [] }; groups.push(group); }
    group.events.push(event);
  }
  return <div class="morbid-timeline">{groups.map(group => <section key={group.key}><h2>{formatDay(`${group.key}T00:00:00+07:00`)}</h2>{group.events.map((event, index) => <details class={`morbid-event ${event.type}`} key={`${event.type}-${event.at}-${index}`} open={event.type === 'admission' || event.type === 'operation' || event.type === 'discharge'}><summary><span>{event.at ? formatDateTime(event.at).split(', ').pop() : '-'}</span><div><strong>{event.title}</strong><p>{event.subtitle}</p></div></summary>{event.type === 'cppt' && <ClinicalFields entry={event.entry} />}{event.type === 'operation' && <FieldList fields={event.entry?.report} />}</details>)}</section>)}</div>;
}

function CpptTab({ entries, total, latestEntry, authors, author, setAuthor, role, setRole, search, setSearch, date, setDate }) {
  return <div><div class="morbid-tab-toolbar"><select value={role} onInput={event => setRole(event.currentTarget.value)}><option value="all">Semua profesi</option><option value="dokter">Dokter</option><option value="perawat">Perawat</option><option value="bidan">Bidan</option><option value="farmasi">Farmasi</option><option value="gizi">Gizi</option><option value="lainnya">Lainnya</option></select><select value={author} onInput={event => setAuthor(event.currentTarget.value)}><option value="all">Semua petugas</option>{authors.map(name => <option value={name} key={name}>{name}</option>)}</select><input type="date" value={date} onInput={event => setDate(event.currentTarget.value)} /><input value={search} onInput={event => setSearch(event.currentTarget.value)} placeholder="Cari isi CPPT" /></div><div class="morbid-section-count">{entries.length} dari {total} CPPT</div><div class="morbid-cppt-list">{entries.map((entry, index) => <details class={`morbid-cppt ${entry === latestEntry ? 'latest' : ''}`} key={entry.id || `${entry.created_at}-${index}`}><summary><div><strong>{entry.author || 'Tanpa nama'}</strong><span class={`morbid-role ${entry.author_role}`}>{entry.author_role}</span>{entry === latestEntry && <span class="morbid-latest-label">Terakhir</span>}</div><span>{formatDateTime(entry.created_at)}</span></summary><ClinicalFields entry={entry} /></details>)}</div></div>;
}

function PenunjangTab({ data = {} }) {
  const files = (data.files || []).filter(file => file.url);
  if (!files.length) return <div class="morbid-empty">Dokumen penunjang PDF belum tersedia.</div>;
  return <div class="morbid-penunjang"><div class="morbid-section-count">{files.length} dokumen PDF</div><section class="morbid-document-section">{files.map(file => <a class="morbid-document" href={api.getMorbidCaseFileUrl(file.url)} target="_blank" rel="noopener noreferrer" key={file.id}><div><strong>{file.title || `Dokumen ${file.id}`}</strong><span>{file.type || file.fileType || 'PDF'} · {formatDateTime(file.date)}</span></div><span>Buka PDF</span></a>)}</section></div>;
}

function OperationTab({ operations }) {
  if (!operations.length) return <div class="morbid-empty">Laporan operasi belum tersedia.</div>;
  return <div class="morbid-operation-list">{operations.map((item, index) => <section key={item.operation_id || index}><header><div><span>Laporan Operasi</span><h2>{item.report?.tindakanOperasi || `Operasi ${item.operation_id}`}</h2></div><strong>{item.report?.tanggalOperasi || '-'}</strong></header>{item.error ? <div class="morbid-alert error">{item.error}</div> : <FieldList fields={item.report} />}</section>)}</div>;
}

function ResumeTab({ snapshot }) {
  return <div class="morbid-resume"><section><h2>Ringkasan Pulang</h2>{snapshot.resume?.exists ? <FieldList fields={snapshot.resume.fields} /> : <div class="morbid-empty">Resume pulang belum tersedia.</div>}</section><section><h2>Asesmen Awal</h2><FieldList fields={snapshot.initial_assessment?.fields} /></section><section><h2>Data Medis</h2><FieldList fields={snapshot.initial_assessment?.datamedis} /></section></div>;
}

function PrescriptionTab({ items }) {
  if (!items.length) return <div class="morbid-empty">Resep belum tersedia.</div>;
  return <div class="morbid-prescription-list">{items.map((item, index) => <section key={item.resepId || item.id || index}><header><strong>Resep {item.resepId || item.id || items.length - index}</strong><span>{formatDateTime(item.date || item.tanggal || item.createdAt || item.created_at)}</span></header>{(item.medications || []).length ? <div>{item.medications.map((med, medIndex) => <div class="morbid-medication" key={`${med.namaObat || med.name}-${medIndex}`}><strong>{med.namaObat || med.nama || med.name || 'Obat'}</strong><span>{[med.jumlah, med.satuan, med.signa, med.keterangan].filter(Boolean).join(' · ')}</span></div>)}</div> : <FieldList fields={item} />}</section>)}</div>;
}
