import { useEffect, useMemo, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';

const TABS = [
  ['analysis', 'Analisis AI'],
  ['timeline', 'Timeline'],
  ['cppt', 'CPPT'],
  ['penunjang', 'Penunjang'],
  ['operasi', 'Operasi'],
  ['resume', 'Resume'],
  ['resep', 'Resep'],
];

const ANALYSIS_STATUS_LABELS = {
  not_analyzed: 'Belum dianalisis',
  analyzing: 'Sedang dianalisis',
  ready: 'Analisis siap',
  stale: 'Perlu dianalisis ulang',
  failed: 'Analisis gagal',
};

const CATEGORY_LABELS = {
  recognition: 'Pengenalan', diagnosis: 'Diagnosis', treatment: 'Tatalaksana', monitoring: 'Monitoring',
  handoff: 'Handover', safety: 'Keselamatan', documentation: 'Dokumentasi', outcome: 'Luaran',
};

const DIRECTION_LABELS = {
  membantu: 'Membantu luaran', merugikan: 'Meningkatkan risiko', netral: 'Netral', tidak_pasti: 'Belum pasti',
};

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
  const [analyzing, setAnalyzing] = useState(false);
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

  useEffect(() => {
    if (data?.morbid_case?.analysis_status !== 'analyzing' || analyzing) return undefined;
    const timer = window.setInterval(async () => {
      try { setData(await api.getMorbidCase(id)); } catch { /* keep the current report while polling */ }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [id, data?.morbid_case?.analysis_status, analyzing]);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try { setData(await api.refreshMorbidCase(id)); }
    catch (err) { setError(err.message || 'Gagal memperbarui Morbid Case'); }
    finally { setRefreshing(false); }
  }

  async function analyze() {
    setAnalyzing(true);
    setActiveTab('analysis');
    setError('');
    try { setData(await api.analyzeMorbidCase(id)); }
    catch (err) { setError(err.message || 'Gagal membuat analisis AI'); }
    finally { setAnalyzing(false); }
  }

  function printAnalysis() {
    setActiveTab('analysis');
    window.setTimeout(() => {
      document.body.classList.add('morbid-ai-print');
      const cleanup = () => document.body.classList.remove('morbid-ai-print');
      window.addEventListener('afterprint', cleanup, { once: true });
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 80);
  }

  const snapshot = data?.snapshot;
  const record = data?.morbid_case;
  const analysis = data?.analysis;
  const analysisStatus = record?.analysis_status || 'not_analyzed';
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

      {snapshot && (
        <section class="morbid-ai-action-bar morbid-no-print">
          <div>
            <span class={`morbid-ai-status ${analysisStatus}`}>{ANALYSIS_STATUS_LABELS[analysisStatus] || analysisStatus}</span>
            <strong>Analisis mendetail dengan GPT-5.6 Sol · High</strong>
            <p>Critical point tetap dinilai berdasarkan perjalanan klinis dan mutu layanan, terlepas dari apakah pasien meninggal atau tidak.</p>
          </div>
          <div class="morbid-ai-actions">
            {analysis && <button type="button" class="secondary" onClick={() => setActiveTab('analysis')}>Buka Analisis</button>}
            {analysis && <button type="button" class="secondary" onClick={printAnalysis}>Cetak PDF</button>}
            <button type="button" class="primary" disabled={analyzing || analysisStatus === 'analyzing'} onClick={analyze}>
              {analyzing || analysisStatus === 'analyzing' ? 'Menganalisis...' : analysis ? 'Analisis Ulang' : 'Mulai Analisis AI'}
            </button>
          </div>
        </section>
      )}

      {!snapshot ? (
        <div class="monitor-state"><strong>{record.status === 'error' ? 'Pengambilan data gagal' : 'Data sedang dikumpulkan'}</strong><p>{record.last_error || 'Silakan perbarui kembali.'}</p></div>
      ) : (
        <>
          <nav class="morbid-tabs" aria-label="Bagian Morbid Case">
            {TABS.map(([key, label]) => <button type="button" class={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)} key={key}>{label}</button>)}
          </nav>

          <main class="morbid-tab-content">
            {activeTab === 'analysis' && <AnalysisTab analysis={analysis} record={record} status={analysisStatus} analyzing={analyzing} progress={data?.analysis_progress} error={record.analysis_last_error || data?.analysis_load_error} onAnalyze={analyze} onPrint={printAnalysis} />}
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

function formatElapsed(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remainder = Math.floor(value % 60);
  return minutes ? `${minutes} menit ${String(remainder).padStart(2, '0')} detik` : `${remainder} detik`;
}

function AnalysisProgress({ progress }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [progress?.started_at]);

  const stages = [
    ['preparing', 'Menyiapkan data'],
    ['model_reasoning', 'Analisis klinis AI'],
    ['saving', 'Menyimpan laporan'],
  ];
  const currentStage = progress?.stage || 'preparing';
  const activeIndex = currentStage === 'waiting'
    ? 1
    : Math.max(0, stages.findIndex(([key]) => key === currentStage));
  const startedAt = Date.parse(progress?.started_at || '');
  const liveElapsed = Number.isFinite(startedAt) ? Math.floor((now - startedAt) / 1000) : 0;
  const elapsed = Math.max(Number(progress?.elapsed_seconds) || 0, liveElapsed);

  return (
    <section class="morbid-ai-progress-panel morbid-no-print" aria-live="polite">
      <div class="morbid-ai-progress-heading">
        <div><span>Progres aktual proses</span><strong>{progress?.label || 'Menyiapkan analisis klinis'}</strong></div>
        <time>{formatElapsed(elapsed)}</time>
      </div>
      <div class="morbid-ai-progress-track" role="progressbar" aria-label="Analisis AI sedang berjalan" aria-valuetext={progress?.label || 'Menyiapkan analisis'}><i /></div>
      <ol class="morbid-ai-progress-stages">
        {stages.map(([key, label], index) => <li class={index < activeIndex ? 'done' : index === activeIndex ? 'active' : ''} key={key}><i>{index < activeIndex ? '✓' : index + 1}</i><span>{label}</span></li>)}
      </ol>
      <p>Waktu dan tahap di atas berasal dari proses backend. Model tidak mengirim persentase penyelesaian reasoning, sehingga bar bergerak tanpa menampilkan angka estimasi palsu.</p>
    </section>
  );
}

function AnalysisTab({ analysis, record, status, analyzing, progress, error, onAnalyze, onPrint }) {
  if (!analysis) {
    return (
      <div class="morbid-ai-empty">
        <div class="morbid-ai-orb">AI</div>
        <h2>{analyzing || status === 'analyzing' ? 'Analisis klinis sedang dibuat' : 'Analisis AI belum tersedia'}</h2>
        <p>{analyzing || status === 'analyzing'
          ? 'GPT-5.6 Sol High sedang menelaah seluruh timeline, CPPT, penunjang, operasi, resume, dan resep. Proses dapat memerlukan beberapa menit.'
          : 'Jalankan analisis saat dibutuhkan. Data identitas langsung dihapus sebelum data klinis dikirim ke model.'}</p>
        {error && <div class="morbid-alert error">{error}</div>}
        {!analyzing && status !== 'analyzing' && <button type="button" class="morbid-ai-start" onClick={onAnalyze}>{status === 'failed' ? 'Coba Analisis Lagi' : 'Mulai Analisis AI'}</button>}
        {(analyzing || status === 'analyzing') && <AnalysisProgress progress={progress} />}
      </div>
    );
  }

  const overview = analysis.case_overview || {};
  const executive = analysis.executive_analysis || {};
  const conclusion = analysis.conclusion || {};
  const criticalPoints = analysis.critical_points || [];

  return (
    <article class="morbid-ai-report">
      <header class="morbid-ai-print-header">
        <div><span>Laporan Analisis Morbid Case</span><h1>{record.patient_name}</h1><p>MR {record.mr_id || '-'} · {record.case_id}</p></div>
        <div><strong>DocBoard</strong><span>{formatDateTime(analysis.generated_at)}</span></div>
      </header>

      {(analyzing || status === 'analyzing') && <AnalysisProgress progress={progress} />}

      {(status === 'stale' || status === 'failed' || error) && <div class={`morbid-alert ${status === 'failed' ? 'error' : 'warning'} morbid-no-print`}>{status === 'stale' ? 'Snapshot klinis telah diperbarui. Analisis ini masih dapat dibaca, tetapi sebaiknya dianalisis ulang.' : error || 'Analisis ulang terakhir gagal; laporan tersimpan sebelumnya tetap ditampilkan.'}</div>}

      <section class="morbid-ai-hero">
        <div>
          <span class={`morbid-ai-severity ${overview.severity_level || 'unknown'}`}>{overview.severity_level ? `Severity ${overview.severity_level}` : 'Severity belum dinilai'}</span>
          <h2>{overview.headline || 'Analisis Morbid Case'}</h2>
          <p>{overview.clinical_summary}</p>
        </div>
        <dl>
          <div><dt>Luaran</dt><dd>{humanize(overview.outcome || '-')}</dd></div>
          <div><dt>Confidence</dt><dd>{humanize(overview.confidence || '-')}</dd></div>
          <div><dt>Critical Point</dt><dd>{criticalPoints.length}</dd></div>
          <div><dt>Model</dt><dd>{analysis.model || 'gpt-5.6-sol'} · {humanize(analysis.reasoning_effort || 'high')}</dd></div>
        </dl>
      </section>

      <section class="morbid-ai-outcome-note">
        <strong>Luaran bukan syarat Morbid Case</strong>
        <p>{overview.outcome_context || conclusion.mortality_independent_note}</p>
      </section>

      <section class="morbid-ai-section">
        <header><span>01</span><div><h2>Analisis Eksekutif</h2><p>Representasi masalah, perjalanan penyakit, dan appraisal tatalaksana</p></div></header>
        <div class="morbid-ai-narrative-grid">
          <NarrativeCard title="Problem representation" value={executive.problem_representation} />
          <NarrativeCard title="Perjalanan penyakit" value={executive.disease_course} />
          <NarrativeCard title="Appraisal tatalaksana" value={executive.management_appraisal} />
          <NarrativeCard title="Penilaian menyeluruh" value={executive.overall_judgement} />
        </div>
      </section>

      <section class="morbid-ai-section">
        <header><span>02</span><div><h2>Critical Point</h2><p>Keputusan dan kejadian yang mengubah risiko atau arah perawatan</p></div></header>
        <CriticalPointDiagram points={criticalPoints} />
        <div class="morbid-critical-list">
          {criticalPoints.map((point, index) => <CriticalPointCard point={point} index={index} key={`${point.sequence}-${point.title}`} />)}
        </div>
      </section>

      <section class="morbid-ai-section morbid-ai-visual-grid">
        <div>
          <header><span>03</span><div><h2>Grafik Perjalanan Klinis</h2><p>Severity 0 (stabil) sampai 5 (kritis)</p></div></header>
          <SeverityChart timeline={analysis.clinical_timeline || []} />
        </div>
        <div>
          <header><span>04</span><div><h2>Profil Mutu Perawatan</h2><p>Skor refleksi internal, bukan penilaian legal</p></div></header>
          <QualityChart quality={analysis.care_quality || {}} />
        </div>
      </section>

      <section class="morbid-ai-section">
        <header><span>05</span><div><h2>Diagram Faktor Kontribusi</h2><p>Faktor risiko, proses, sistem, dan faktor protektif</p></div></header>
        <CausalDiagram causal={analysis.causal_analysis || {}} />
      </section>

      <section class="morbid-ai-section morbid-ai-two-column">
        <div>
          <header><span>06</span><div><h2>Yang Berjalan Baik</h2><p>Praktik dan respons yang membantu luaran</p></div></header>
          <div class="morbid-ai-list-cards positive">{(analysis.what_went_well || []).map((item, index) => <section key={index}><strong>{item.title}</strong><p>{item.evidence}</p><span>{item.impact}</span></section>)}</div>
        </div>
        <div>
          <header><span>07</span><div><h2>Peluang Perbaikan</h2><p>Prioritas yang dapat ditindaklanjuti</p></div></header>
          <div class="morbid-ai-list-cards opportunity">{(analysis.improvement_opportunities || []).map((item, index) => <section key={index}><span class={`priority ${item.priority}`}>{item.priority}</span><strong>{item.issue}</strong><p>{item.evidence}</p><b>{item.recommendation}</b><small>Ukuran sukses: {item.success_metric}</small></section>)}</div>
        </div>
      </section>

      <section class="morbid-ai-section">
        <header><span>08</span><div><h2>Rencana Tindak Lanjut</h2><p>Dari aksi segera sampai perbaikan sistem</p></div></header>
        <div class="morbid-action-plan">
          <ActionColumn title="Segera" items={analysis.action_plan?.immediate} />
          <ActionColumn title="Jangka pendek" items={analysis.action_plan?.short_term} />
          <ActionColumn title="Level sistem" items={analysis.action_plan?.system_level} />
        </div>
      </section>

      <section class="morbid-ai-conclusion">
        <span>Kesimpulan</span>
        <h2>{conclusion.overall_assessment}</h2>
        <blockquote>{conclusion.key_learning}</blockquote>
        <div class="morbid-ai-conclusion-grid">
          <ListBlock title="Keterbatasan data" items={conclusion.limitations} />
          <ListBlock title="Pertanyaan yang belum terjawab" items={conclusion.unanswered_questions} />
        </div>
      </section>

      <footer class="morbid-ai-footer">
        <p>Analisis AI adalah alat bantu refleksi klinis dan peningkatan mutu. Hasil harus divalidasi oleh dokter yang memahami konteks kasus dan tidak menggantikan keputusan klinis, audit formal, atau penilaian medikolegal.</p>
        <button type="button" class="morbid-ai-print-button morbid-no-print" onClick={onPrint}>Cetak / Simpan sebagai PDF</button>
      </footer>
    </article>
  );
}

function NarrativeCard({ title, value }) {
  return <section><span>{title}</span><p>{value || '-'}</p></section>;
}

function CriticalPointDiagram({ points }) {
  return <div class="morbid-critical-flow">{points.map((point, index) => <div class={`morbid-critical-node ${point.direction}`} key={index}><span>{String(index + 1).padStart(2, '0')}</span><div><small>{point.occurred_at || point.phase}</small><strong>{point.title}</strong><em>Severity {point.severity}/5</em></div></div>)}</div>;
}

function CriticalPointCard({ point, index }) {
  return (
    <section class={`morbid-critical-card ${point.direction}`}>
      <header><div><span>Critical Point {String(index + 1).padStart(2, '0')}</span><h3>{point.title}</h3></div><div><b>{CATEGORY_LABELS[point.category] || humanize(point.category)}</b><em>{DIRECTION_LABELS[point.direction] || humanize(point.direction)}</em></div></header>
      <div class="morbid-critical-meta"><span>{point.occurred_at || 'Waktu tidak diketahui'}</span><span>{point.phase}</span><span>Severity {point.severity}/5</span><span>Confidence {point.confidence}</span></div>
      <dl>
        <div><dt>Bukti klinis</dt><dd>{point.evidence}</dd></div>
        <div><dt>Makna klinis</dt><dd>{point.clinical_significance}</dd></div>
        <div><dt>Tindakan yang dilakukan</dt><dd>{point.action_taken}</dd></div>
        <div><dt>Alternatif / pembelajaran</dt><dd>{point.alternative_or_learning}</dd></div>
      </dl>
      <footer>Preventability: <strong>{humanize(point.preventability)}</strong></footer>
    </section>
  );
}

function SeverityChart({ timeline }) {
  if (!timeline.length) return <div class="morbid-empty">Timeline untuk grafik belum tersedia.</div>;
  const width = 720;
  const height = 230;
  const left = 46;
  const right = 22;
  const top = 24;
  const bottom = 46;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const points = timeline.map((item, index) => ({
    x: left + (timeline.length === 1 ? chartWidth / 2 : (index / (timeline.length - 1)) * chartWidth),
    y: top + ((5 - Math.max(0, Math.min(5, Number(item.severity) || 0))) / 5) * chartHeight,
    item,
  }));
  return (
    <div class="morbid-severity-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik severity perjalanan klinis">
        {[0, 1, 2, 3, 4, 5].map(level => { const y = top + ((5 - level) / 5) * chartHeight; return <g key={level}><line x1={left} y1={y} x2={width - right} y2={y} /><text x={left - 13} y={y + 4}>{level}</text></g>; })}
        <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} />
        {points.map((point, index) => <g class="data-point" key={index}><circle cx={point.x} cy={point.y} r="6" /><text class="value" x={point.x} y={point.y - 11}>{point.item.severity}</text></g>)}
      </svg>
      <div class="morbid-chart-legend">{timeline.map((item, index) => <div key={index}><span style={{ background: `hsl(${12 + (Number(item.severity) || 0) * 2} 78% ${52 - (Number(item.severity) || 0) * 2}%)` }}>{item.severity}</span><div><strong>{item.label}</strong><small>{item.occurred_at || item.phase}</small><p>{item.clinical_state}</p></div></div>)}</div>
    </div>
  );
}

function QualityChart({ quality }) {
  const dimensions = quality.dimensions || [];
  return <div class="morbid-quality-chart"><div class="morbid-quality-score"><strong>{quality.overall_score ?? '-'}</strong><span>/100</span><p>{quality.interpretation}</p></div>{dimensions.map((item, index) => <div class="morbid-quality-row" key={index}><div><strong>{item.dimension}</strong><span>{item.score}</span></div><div class="bar"><i style={{ width: `${Math.max(0, Math.min(100, Number(item.score) || 0))}%` }} /></div><p>{item.rationale}</p></div>)}</div>;
}

function CausalDiagram({ causal }) {
  const groups = [
    ['Faktor pasien', causal.patient_factors], ['Faktor penyakit', causal.disease_factors],
    ['Tugas & proses', causal.task_process_factors], ['Tim', causal.team_factors],
    ['Lingkungan & sistem', causal.environment_system_factors], ['Faktor protektif', causal.protective_factors],
  ];
  return <div class="morbid-causal"><div class="morbid-causal-core"><span>Sintesis</span><p>{causal.synthesis}</p></div><div class="morbid-causal-grid">{groups.map(([title, items], index) => <section class={index === 5 ? 'protective' : ''} key={title}><strong>{title}</strong><ul>{(items || []).length ? items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>) : <li>Tidak teridentifikasi dari data</li>}</ul></section>)}</div></div>;
}

function ActionColumn({ title, items = [] }) {
  return <section><strong>{title}</strong><ol>{items.length ? items.map((item, index) => <li key={index}>{item}</li>) : <li>Belum ada rekomendasi.</li>}</ol></section>;
}

function ListBlock({ title, items = [] }) {
  return <section><strong>{title}</strong><ul>{items.length ? items.map((item, index) => <li key={index}>{item}</li>) : <li>Tidak ada.</li>}</ul></section>;
}
