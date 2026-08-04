import { useEffect, useMemo, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';

const ACTIVE_STATUSES = ['queued', 'collecting', 'rendering'];
const STATUS_LABELS = {
  queued: 'Dalam antrean', collecting: 'Mengumpulkan data Medify', rendering: 'Menyusun dokumen dan JPG',
  ready: 'Arsip siap', ready_with_warnings: 'Arsip siap dengan peringatan', failed: 'Pembuatan gagal',
};

function formatDateTime(value) {
  if (!value) return '-';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? `${value.replace(' ', 'T')}+07:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function humanize(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function readableValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  return JSON.stringify(value, null, 2);
}

function FieldList({ value }) {
  const entries = Object.entries(value || {}).filter(([, child]) => child !== null && child !== undefined && child !== '');
  if (!entries.length) return <div class="resume-empty">Data belum tersedia.</div>;
  return <div class="resume-field-list">{entries.map(([key, child]) => <div key={key}><span>{humanize(key)}</span><pre>{readableValue(child)}</pre></div>)}</div>;
}

export default function GambiranResumeDetail({ id }) {
  const [data, setData] = useState(null);
  const [files, setFiles] = useState([]);
  const [filePage, setFilePage] = useState(1);
  const [fileHasMore, setFileHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const result = await api.getGambiranResume(id);
      setData(result);
      if (['ready', 'ready_with_warnings'].includes(result.resume?.status) && files.length === 0) await loadFiles(1, false);
    } catch (err) {
      setError(err.message || 'Gagal memuat resume pasien');
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  async function loadFiles(page = 1, append = true) {
    setLoadingFiles(true);
    try {
      const result = await api.getGambiranResumeFiles(id, { page, limit: 40 });
      setFiles(current => append ? [...current, ...(result.data || [])] : (result.data || []));
      setFilePage(page);
      setFileHasMore(Boolean(result.pagination?.has_more));
    } catch (err) {
      setError(err.message || 'Gagal memuat daftar lampiran');
    } finally {
      setLoadingFiles(false);
    }
  }

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (!ACTIVE_STATUSES.includes(data?.resume?.status)) return undefined;
    const timer = window.setInterval(() => load(true), 4000);
    return () => window.clearInterval(timer);
  }, [id, data?.resume?.status]);

  async function openDownload(key, loader) {
    setDownloading(key);
    setError('');
    try {
      const result = await loader();
      window.open(result.download_url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.message || 'Gagal membuat tautan unduhan');
    } finally {
      setDownloading('');
    }
  }

  async function createNewVersion() {
    setCreating(true);
    setError('');
    try {
      const result = await api.createGambiranResume(data.resume.mr_display);
      route(`/docboard/gambiran-resumes/${result.id}`);
    } catch (err) {
      setError(err.message || 'Gagal membuat versi baru');
    } finally {
      setCreating(false);
    }
  }

  const record = data?.resume;
  const snapshot = data?.snapshot;
  const identity = snapshot?.patient || snapshot?.identity || {};
  const encounters = snapshot?.encounters || snapshot?.cases || [];
  const timeline = snapshot?.normalized_timeline || [];
  const groupedTimeline = useMemo(() => {
    const groups = [];
    for (const event of timeline) {
      const key = event.occurred_at ? String(event.occurred_at).slice(0, 10) : 'undated';
      let group = groups.find(item => item.key === key);
      if (!group) { group = { key, events: [] }; groups.push(group); }
      group.events.push(event);
    }
    return groups;
  }, [timeline]);

  if (loading) return <div class="loading-state"><div class="spinner" /></div>;
  if (!record) return <div class="monitor-state"><strong>Resume tidak ditemukan</strong><p>{error}</p></div>;
  const ready = ['ready', 'ready_with_warnings'].includes(record.status);

  return (
    <div class="view-gambiran-resume-detail">
      <header class="resume-detail-header">
        <button class="btn-back" onClick={() => route('/docboard/gambiran-resumes')} aria-label="Kembali">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6" /></svg>
        </button>
        <div><span>Resume Medis Longitudinal</span><h1>{record.patient_name || `RM ${record.mr_display}`}</h1><p>RM {record.mr_display} · Versi {record.archive_version}</p></div>
        {ready && <button class="resume-version-button" type="button" disabled={creating} onClick={createNewVersion}>{creating ? 'Memulai...' : 'Versi Baru'}</button>}
      </header>

      {error && <div class="resume-alert error">{error}</div>}
      {(record.warnings || []).length > 0 && <div class="resume-alert warning"><strong>Data perlu diperiksa</strong>{record.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}

      <section class="resume-status-panel">
        <div><span class={`resume-status ${record.status}`}>{STATUS_LABELS[record.status] || record.status}</span><strong>{ACTIVE_STATUSES.includes(record.status) ? 'Proses berjalan di backend' : `Dibuat ${formatDateTime(record.completed_at || record.created_at)}`}</strong><p>{record.last_error || (ACTIVE_STATUSES.includes(record.status) ? 'Halaman diperbarui otomatis tanpa perlu ditutup.' : 'Sumber: Medify RS Gambiran')}</p></div>
        <div class="resume-status-counts"><span><strong>{record.case_count}</strong>Kunjungan</span><span><strong>{record.event_count}</strong>Entri</span><span><strong>{record.file_count}</strong>Berkas</span><span><strong>{record.jpg_count}</strong>JPG</span></div>
      </section>

      {ready && <section class="resume-artifact-bar">
        <div><span>Paket arsip</span><strong>TXT, DOCX, snapshot dan manifest</strong></div>
        <div>{[
          ['txt', 'Resume TXT'], ['docx', 'Resume DOCX'], ['snapshot', 'Snapshot JSON'], ['manifest', 'Manifest JSON'],
        ].map(([kind, label]) => <button type="button" disabled={downloading === `artifact-${kind}`} onClick={() => openDownload(`artifact-${kind}`, () => api.getGambiranResumeArtifactDownload(id, kind))} key={kind}>{downloading === `artifact-${kind}` ? 'Menyiapkan...' : label}</button>)}</div>
      </section>}

      {!ready ? <div class="monitor-state"><div class={ACTIVE_STATUSES.includes(record.status) ? 'spinner' : ''} /><strong>{STATUS_LABELS[record.status]}</strong><p>{record.last_error || 'Pengumpulan dapat memerlukan beberapa menit untuk riwayat panjang.'}</p></div> : <>
        <nav class="resume-tabs" aria-label="Bagian resume">
          {[['overview', 'Ikhtisar'], ['timeline', 'Timeline'], ['files', `Lampiran (${record.file_count})`]].map(([key, label]) => <button type="button" class={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)} key={key}>{label}</button>)}
        </nav>

        <main class="resume-tab-content">
          {activeTab === 'overview' && <div class="resume-overview-grid">
            <section><h2>Identitas Pasien</h2><FieldList value={{ ...identity, medical_record_number: record.mr_display }} /></section>
            <section><h2>Riwayat Kunjungan</h2>{encounters.length ? <div class="resume-encounter-list">{encounters.map((encounter, index) => <article key={encounter.case_id || index}><header><span>Kunjungan {index + 1}</span><strong>{encounter.case_id || encounter.id || '-'}</strong></header><FieldList value={encounter} /></article>)}</div> : <div class="resume-empty">Riwayat kunjungan tidak tersedia.</div>}</section>
          </div>}

          {activeTab === 'timeline' && <div class="resume-timeline">{groupedTimeline.length ? groupedTimeline.map(group => <section key={group.key}><h2>{group.key === 'undated' ? 'Waktu tidak tersedia' : formatDateTime(`${group.key}T00:00:00+07:00`).split(',')[0]}</h2>{group.events.map((event, index) => <details class={`resume-event ${event.category || 'other'}`} key={event.id || `${group.key}-${index}`}><summary><time>{event.occurred_at ? formatDateTime(event.occurred_at) : '-'}</time><div><strong>{event.title || humanize(event.category)}</strong><span>{humanize(event.category)}{event.case_id ? ` · ${event.case_id}` : ''}</span></div></summary><FieldList value={event.data} /></details>)}</section>) : <div class="resume-empty">Timeline belum tersedia.</div>}</div>}

          {activeTab === 'files' && <div class="resume-files-grid">{files.map(file => <article class="resume-file-card" key={file.id}><div class="resume-file-preview"><span>{file.jpg_keys?.length ? `${file.jpg_keys.length} JPG` : humanize(file.mime_type?.split('/')[1] || 'FILE')}</span></div><div class="resume-file-body"><span>{humanize(file.category)}</span><strong>{file.filename}</strong><p>{file.case_id || 'Dokumen pasien'} · {formatDateTime(file.occurred_at)}</p><div><button type="button" disabled={downloading === `file-${file.id}`} onClick={() => openDownload(`file-${file.id}`, () => api.getGambiranResumeFileDownload(id, file.id))}>Berkas Asli</button>{(file.jpg_keys || []).map((key, index) => <button type="button" class="secondary" disabled={downloading === `jpg-${file.id}-${index}`} onClick={() => openDownload(`jpg-${file.id}-${index}`, () => api.getGambiranResumeFileDownload(id, file.id, { variant: 'jpg', page: index + 1 }))} key={key}>JPG {index + 1}</button>)}</div></div></article>)}{!files.length && !loadingFiles && <div class="resume-empty">Tidak ada lampiran yang berhasil diarsipkan.</div>}{loadingFiles && <div class="monitor-state"><div class="spinner" /><p>Memuat lampiran...</p></div>}{fileHasMore && !loadingFiles && <button type="button" class="resume-load-more" onClick={() => loadFiles(filePage + 1, true)}>Muat Lampiran Berikutnya</button>}</div>}
        </main>
      </>}
    </div>
  );
}
