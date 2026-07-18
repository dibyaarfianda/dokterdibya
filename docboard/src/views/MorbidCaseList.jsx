import { useEffect, useRef, useState } from 'preact/hooks';
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

const MORBID_DOCTORS = [
  ['dibya', 'dr. Dibya'],
  ['tri_aji', 'dr. Tri Aji'],
  ['latifa', 'dr. Latifa'],
];

function CandidateCard({ candidate, addingId, onAdd }) {
  return (
    <div class="morbid-candidate" key={candidate.id}>
      <div>
        <span class="morbid-doctor-badge">{candidate.doctor_name || candidate.doctor_key}</span>
        <strong>{candidate.patient_name}</strong>
        <span>MR {candidate.mr_id || '-'} · {formatDate(candidate.operation_date)}</span>
        <p>{candidate.diagnosis || candidate.operation_name}</p>
      </div>
      <button type="button" disabled={addingId === candidate.id} onClick={() => onAdd(candidate)}>
        {candidate.morbid_case_id ? 'Buka' : addingId === candidate.id ? 'Mengambil...' : 'Tambah'}
      </button>
    </div>
  );
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
  const [recentByDoctor, setRecentByDoctor] = useState({});
  const [addingId, setAddingId] = useState(null);
  const candidateRequestId = useRef(0);

  async function loadCases(query = search) {
    setLoading(true);
    setError('');
    try {
      const [savedResult, ...doctorResults] = await Promise.all([
        api.getMorbidCases({ search: query, limit: 50 }),
        ...MORBID_DOCTORS.map(([doctor]) => api.getMorbidCaseCandidates({ doctor, limit: 8 })),
      ]);
      setRows(savedResult.data || []);
      setRecentByDoctor(Object.fromEntries(MORBID_DOCTORS.map(([doctor], index) => [doctor, doctorResults[index]?.data || []])));
    } catch (err) {
      setError(err.message || 'Gagal memuat Morbid Case');
    } finally {
      setLoading(false);
    }
  }

  async function loadCandidates(query = candidateSearch) {
    const requestId = ++candidateRequestId.current;
    setCandidateLoading(true);
    try {
      const result = await api.getMorbidCaseCandidates({ search: query, limit: 30 });
      if (requestId !== candidateRequestId.current) return;
      setCandidates(result.data || []);
    } catch (err) {
      if (requestId !== candidateRequestId.current) return;
      setError(err.message || 'Gagal mencari kandidat');
    } finally {
      if (requestId === candidateRequestId.current) setCandidateLoading(false);
    }
  }

  useEffect(() => { loadCases(''); }, []);
  useEffect(() => {
    if (!pickerOpen) {
      candidateRequestId.current += 1;
      return undefined;
    }
    const timer = setTimeout(() => loadCandidates(candidateSearch), candidateSearch.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [pickerOpen, candidateSearch]);

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
          <p>{rows.length} kasus tersimpan · kandidat terbaru 3 dokter</p>
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
      ) : (
        <>
          <section class="morbid-saved-section">
            <header class="morbid-list-section-header"><div><span>Sudah dipilih</span><h2>Kasus tersimpan</h2></div><strong>{rows.length}</strong></header>
            {rows.length === 0 ? <div class="monitor-state"><strong>Belum ada Morbid Case tersimpan</strong></div> : (
              <div class="morbid-case-list">
                {rows.map(row => (
                  <button class="morbid-case-row" type="button" key={row.id} onClick={() => route(`/docboard/morbid-cases/${row.id}`)}>
                    <div class="morbid-case-row-main">
                      <div class="morbid-case-row-title">
                        <strong>{row.patient_name}</strong>
                        <span class={`morbid-status ${row.status}`}>{statusLabel(row.status)}</span>
                      </div>
                      <div class="morbid-case-meta">
                        <span>{row.doctor_name || 'Dokter tidak tercatat'}</span>
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
          </section>

          <section class="morbid-recent-section">
            <header class="morbid-list-section-header"><div><span>Belum dan sudah tersimpan</span><h2>Kandidat terbaru per dokter</h2></div></header>
            <div class="morbid-doctor-groups">
              {MORBID_DOCTORS.map(([doctor, label]) => (
                <section class="morbid-doctor-group" key={doctor}>
                  <header><div><span>Dokter operator</span><h3>{label}</h3></div><strong>{(recentByDoctor[doctor] || []).length}</strong></header>
                  <div>
                    {(recentByDoctor[doctor] || []).length
                      ? (recentByDoctor[doctor] || []).map(candidate => <CandidateCard candidate={candidate} addingId={addingId} onAdd={addCase} key={candidate.id} />)
                      : <div class="audit-pa-state">Kandidat belum tersedia.</div>}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </>
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
              {candidateLoading ? <div class="audit-pa-state">Mencari kasus...</div> : candidates.length === 0 ? <div class="audit-pa-state">Kasus tidak ditemukan.</div> : candidates.map(candidate => <CandidateCard candidate={candidate} addingId={addingId} onAdd={addCase} key={candidate.id} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
