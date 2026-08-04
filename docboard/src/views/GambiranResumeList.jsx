import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';

const STATUS_LABELS = {
  queued: 'Dalam antrean',
  collecting: 'Mengumpulkan Medify',
  rendering: 'Menyusun arsip',
  ready: 'Siap',
  ready_with_warnings: 'Siap dengan peringatan',
  failed: 'Gagal',
};

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function isActive(status) {
  return ['queued', 'collecting', 'rendering'].includes(status);
}

export default function GambiranResumeList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [medicalRecordNumber, setMedicalRecordNumber] = useState('');
  const [error, setError] = useState('');

  async function load(query = search, quiet = false) {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const result = await api.getGambiranResumes({ search: query, limit: 50 });
      setRows(result.data || []);
    } catch (err) {
      setError(err.message || 'Gagal memuat resume Gambiran');
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => { load(''); }, []);
  useEffect(() => {
    if (!rows.some(row => isActive(row.status))) return undefined;
    const timer = window.setInterval(() => load(search, true), 5000);
    return () => window.clearInterval(timer);
  }, [rows, search]);

  async function createResume(event) {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      const result = await api.createGambiranResume(medicalRecordNumber);
      route(`/docboard/gambiran-resumes/${result.id}`);
    } catch (err) {
      setError(err.message || 'Gagal memulai pembuatan resume');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div class="view-gambiran-resume-list">
      <header class="resume-page-header">
        <button class="btn-back" onClick={() => route('/docboard/settings')} aria-label="Kembali">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6" /></svg>
        </button>
        <div><span>Medify RS Gambiran</span><h1>Resume Pasien</h1><p>Arsip longitudinal berdasarkan Nomor RM</p></div>
      </header>

      <section class="resume-create-card">
        <div><span>Resume baru</span><h2>Cari pasien hanya dengan Nomor RM</h2><p>Contoh format: 00-00-12-34-56. Nama pasien tidak diterima sebagai kata pencarian.</p></div>
        <form onSubmit={createResume}>
          <input
            value={medicalRecordNumber}
            onInput={event => setMedicalRecordNumber(event.currentTarget.value)}
            inputMode="numeric"
            placeholder="00-00-00-00-00"
            aria-label="Nomor RM pasien"
            required
          />
          <button type="submit" disabled={creating}>{creating ? 'Memulai...' : 'Buat Resume'}</button>
        </form>
      </section>

      <form class="resume-list-search" onSubmit={event => { event.preventDefault(); load(search); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input value={search} onInput={event => setSearch(event.currentTarget.value)} placeholder="Filter daftar dengan Nomor RM" inputMode="numeric" />
        <button type="submit">Cari</button>
      </form>

      {error && <div class="resume-alert error">{error}</div>}
      {loading ? <div class="monitor-state"><div class="spinner" /><p>Memuat arsip...</p></div> : (
        <section class="resume-saved-section">
          <header><div><span>Folder khusus R2</span><h2>Resume tersimpan</h2></div><strong>{rows.length}</strong></header>
          {!rows.length ? <div class="monitor-state"><strong>Belum ada resume pasien</strong><p>Masukkan Nomor RM untuk membuat arsip pertama.</p></div> : (
            <div class="resume-archive-list">
              {rows.map(row => (
                <button type="button" class="resume-archive-row" key={row.id} onClick={() => route(`/docboard/gambiran-resumes/${row.id}`)}>
                  <div class="resume-archive-main">
                    <div class="resume-archive-title"><strong>{row.patient_name || `RM ${row.mr_display}`}</strong><span class={`resume-status ${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span></div>
                    <div class="resume-archive-meta"><span>RM {row.mr_display}</span><span>Versi {row.archive_version}</span><span>{formatDateTime(row.created_at)}</span></div>
                    <div class="resume-archive-counts"><span>{row.case_count} kunjungan</span><span>{row.event_count} entri</span><span>{row.file_count} berkas</span><span>{row.jpg_count} JPG</span></div>
                    {row.last_error && <p class="resume-row-error">{row.last_error}</p>}
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6" /></svg>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
