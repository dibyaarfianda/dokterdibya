import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(status) {
  if (status === 'ready') return 'Lengkap';
  if (status === 'ready_with_warnings') return 'Perlu diperiksa';
  if (status === 'collecting') return 'Mengumpulkan';
  return 'Gagal';
}

export default function MorbidCaseList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);

  async function loadCases(query = search) {
    setLoading(true);
    setError('');
    try {
      const result = await api.getMorbidCases({ search: query, limit: 50 });
      setRows(result.data || []);
    } catch (err) {
      setError(err.message || 'Gagal memuat Morbid Case');
    } finally {
      setLoading(false);
    }
  }

  async function loadCandidates(query = candidateSearch) {
    setCandidateLoading(true);
    try {
      const result = await api.getMorbidCaseCandidates({ search: query, limit: 30 });
      setCandidates(result.data || []);
    } catch (err) {
      setError(err.message || 'Gagal mencari kandidat');
    } finally {
      setCandidateLoading(false);
    }
  }

  useEffect(() => { loadCases(''); }, []);
  useEffect(() => { if (pickerOpen) loadCandidates(candidateSearch); }, [pickerOpen]);

  async function addCase(candidate) {
    if (candidate.morbid_case_id) {
      route(`/docboard/morbid-cases/${candidate.morbid_case_id}`);
      return;
    }
    setAddingId(candidate.id);
    try {
      const result = await api.createMorbidCase(candidate.id);
      route(`/docboard/morbid-cases/${result.morbid_case.id}`);
    } catch (err) {
      setError(err.message || 'Gagal menambahkan Morbid Case');
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div class="view-morbid-list">
      <header class="morbid-page-header">
        <button class="btn-back" onClick={() => route('/docboard/settings')} aria-label="Kembali">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6" /></svg>
        </button>
        <div>
          <h1>Morbid Case</h1>
          <p>{rows.length} kasus tersimpan</p>
        </div>
        <button class="morbid-add-button" type="button" onClick={() => setPickerOpen(true)} title="Tambah kasus" aria-label="Tambah kasus">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </header>

      <form class="morbid-search" onSubmit={(event) => { event.preventDefault(); loadCases(search); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input value={search} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="Cari nama, MR, case ID, diagnosis" />
        <button type="submit">Cari</button>
      </form>

      {error && <div class="morbid-alert error">{error}</div>}
      {loading ? (
        <div class="monitor-state"><div class="spinner" /><p>Memuat kasus...</p></div>
      ) : rows.length === 0 ? (
        <div class="monitor-state"><strong>Belum ada Morbid Case</strong></div>
      ) : (
        <div class="morbid-case-list">
          {rows.map(row => (
            <button class="morbid-case-row" type="button" key={row.id} onClick={() => route(`/docboard/morbid-cases/${row.id}`)}>
              <div class="morbid-case-row-main">
                <div class="morbid-case-row-title">
                  <strong>{row.patient_name}</strong>
                  <span class={`morbid-status ${row.status}`}>{statusLabel(row.status)}</span>
                </div>
                <div class="morbid-case-meta">
                  <span>MR {row.mr_id || '-'}</span>
                  <span>{row.case_id}</span>
                  <span>{formatDate(row.operation_date)}</span>
                </div>
                <p>{row.diagnosis || row.operation_name || 'Kasus rawat inap'}</p>
                <div class="morbid-counts">
                  <span>{row.cppt_count} CPPT</span>
                  <span>{row.penunjang_result_count} penunjang</span>
                  <span>{row.penunjang_file_count} dokumen</span>
                  <span>{row.prescription_count} resep</span>
                </div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,18 15,12 9,6" /></svg>
            </button>
          ))}
        </div>
      )}

      {pickerOpen && (
        <div class="morbid-picker-overlay" role="dialog" aria-modal="true">
          <div class="morbid-picker">
            <header>
              <div><h2>Pilih Kasus</h2><p>Operasi Gambiran dokter target</p></div>
              <button type="button" onClick={() => setPickerOpen(false)} aria-label="Tutup">&times;</button>
            </header>
            <form class="morbid-search" onSubmit={(event) => { event.preventDefault(); loadCandidates(candidateSearch); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input autoFocus value={candidateSearch} onInput={(event) => setCandidateSearch(event.currentTarget.value)} placeholder="Nama, MR, diagnosis" />
              <button type="submit">Cari</button>
            </form>
            <div class="morbid-candidate-list">
              {candidateLoading ? <div class="audit-pa-state">Mencari kasus...</div> : candidates.map(candidate => (
                <div class="morbid-candidate" key={candidate.id}>
                  <div>
                    <strong>{candidate.patient_name}</strong>
                    <span>MR {candidate.mr_id || '-'} · {formatDate(candidate.operation_date)}</span>
                    <p>{candidate.diagnosis || candidate.operation_name}</p>
                  </div>
                  <button type="button" disabled={addingId === candidate.id} onClick={() => addCase(candidate)}>
                    {candidate.morbid_case_id ? 'Buka' : addingId === candidate.id ? 'Mengambil...' : 'Tambah'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
