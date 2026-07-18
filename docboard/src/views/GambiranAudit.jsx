import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { today, formatDateShort } from '../utils/date';
import { AUDIT_GAMBIRAN_DEFAULT_START } from '../utils/gambiranAudit';

const DOCTORS = [
  { value: 'all', label: 'Semua Dokter' },
  { value: 'dibya', label: 'dr. Dibya' },
  { value: 'tri_aji', label: 'dr. Tri Aji' },
  { value: 'latifa', label: 'dr. Latifa' },
];

const REPEAT_OPTIONS = [
  { value: 'all', label: 'Semua' },
  { value: 'yes', label: 'Operasi ulang' },
  { value: 'no', label: 'Tanpa ulang' },
];

const TRANSFER_OPTIONS = [
  { value: 'all', label: 'Semua Alur Dokter' },
  { value: 'yes', label: 'Pindah dokter' },
  { value: 'no', label: 'Tidak pindah' },
  { value: 'unknown', label: 'Belum pasti' },
];

const DOCTOR_SOURCE_OPTIONS = [
  { value: 'all', label: 'Semua Sumber Dokter' },
  { value: 'operator', label: 'Operator' },
  { value: 'dpjp', label: 'DPJP' },
  { value: 'doctor', label: 'Dokter' },
];

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Tanggal terbaru' },
  { value: 'date_asc', label: 'Tanggal terlama' },
  { value: 'patient_asc', label: 'Nama pasien A-Z' },
  { value: 'doctor_asc', label: 'Dokter A-Z' },
  { value: 'operation_asc', label: 'Jenis operasi A-Z' },
  { value: 'repeat_desc', label: 'Ulang dulu' },
];

function defaultStartDate() {
  return AUDIT_GAMBIRAN_DEFAULT_START;
}

function formatDate(value) {
  return value ? formatDateShort(value) : '-';
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '--:--';
}

function doctorLabel(value) {
  const item = DOCTORS.find(doctor => doctor.value === value);
  return item ? item.label : (value || '-');
}

export default function GambiranAudit() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, repeat_count: 0, by_doctor: [], by_operation: [] });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, has_more: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [pathologyPanel, setPathologyPanel] = useState({ open: false, row: null, loading: false, error: null, data: null });
  const [journeyPanel, setJourneyPanel] = useState({ open: false, row: null, loading: false, refreshing: false, error: null, data: null });
  const [morbidAddingId, setMorbidAddingId] = useState(null);
  const [filters, setFilters] = useState({
    start: defaultStartDate(),
    end: today(),
    doctor: 'all',
    operation: '',
    patient: '',
    mr: '',
    diagnosis: '',
    status: '',
    doctorSource: 'all',
    ageMin: '',
    ageMax: '',
    sort: 'date_desc',
    repeat: 'all',
    transfer: 'all',
    procedureDoctor: '',
    finalDoctor: '',
  });

  useEffect(() => {
    loadAudit(1);
  }, [filters.start, filters.end, filters.doctor, filters.repeat, filters.transfer, filters.doctorSource, filters.sort]);

  useEffect(() => {
    if (!pathologyPanel.open && !journeyPanel.open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return;
      if (journeyPanel.open) closeJourney();
      else closePathology();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pathologyPanel.open, journeyPanel.open]);

  async function loadAudit(page = 1, append = false) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const result = await api.getGambiranAudit({
        ...filters,
        page,
        limit: 50,
      });
      setRows(append ? [...rows, ...(result.data || [])] : (result.data || []));
      setSummary(result.summary || { total: 0, repeat_count: 0, by_doctor: [], by_operation: [] });
      setPagination(result.pagination || { page, limit: 50, total: 0, has_more: false });
    } catch (err) {
      console.error('Failed to load Gambiran audit:', err);
      setError(err.message || 'Gagal memuat audit');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    loadAudit(1);
  }

  function clearFilters() {
    setFilters({
      start: defaultStartDate(),
      end: today(),
      doctor: 'all',
      operation: '',
      patient: '',
      mr: '',
      diagnosis: '',
      status: '',
      doctorSource: 'all',
      ageMin: '',
      ageMax: '',
      sort: 'date_desc',
      repeat: 'all',
      transfer: 'all',
      procedureDoctor: '',
      finalDoctor: '',
    });
  }

  function exportXls() {
    window.open(api.getGambiranAuditXlsUrl(filters), '_blank');
  }

  async function openPathology(row) {
    setPathologyPanel({ open: true, row, loading: true, error: null, data: null });
    try {
      const result = await api.getGambiranAuditPathology(row.id);
      setPathologyPanel({ open: true, row, loading: false, error: null, data: result });
    } catch (err) {
      console.error('Failed to load Gambiran PA:', err);
      setPathologyPanel({ open: true, row, loading: false, error: err.message || 'Gagal memuat Patologi Anatomi', data: null });
    }
  }

  function closePathology() {
    setPathologyPanel({ open: false, row: null, loading: false, error: null, data: null });
  }

  async function openJourney(row) {
    setJourneyPanel({ open: true, row, loading: true, refreshing: false, error: null, data: null });
    try {
      const result = await api.getGambiranAuditDoctorJourney(row.id);
      setJourneyPanel({ open: true, row, loading: false, refreshing: false, error: null, data: result });
    } catch (err) {
      console.error('Failed to load Gambiran doctor journey:', err);
      setJourneyPanel({ open: true, row, loading: false, refreshing: false, error: err.message || 'Gagal memuat alur dokter', data: null });
    }
  }

  async function refreshJourney() {
    const row = journeyPanel.row;
    if (!row) return;
    setJourneyPanel(current => ({ ...current, refreshing: true, error: null }));
    try {
      const result = await api.refreshGambiranAuditDoctorJourney(row.id);
      setJourneyPanel({ open: true, row, loading: false, refreshing: false, error: null, data: result });
      setRows(current => current.map(item => item.id === row.id
        ? { ...item, doctor_journey: result.doctor_journey, doctor_journey_status: result.analysis_status }
        : item));
    } catch (err) {
      console.error('Failed to refresh Gambiran doctor journey:', err);
      setJourneyPanel(current => ({ ...current, loading: false, refreshing: false, error: err.message || 'Pemeriksaan ulang alur dokter gagal' }));
    }
  }

  function closeJourney() {
    setJourneyPanel({ open: false, row: null, loading: false, refreshing: false, error: null, data: null });
  }

  async function addMorbidCase(row) {
    setMorbidAddingId(row.id);
    try {
      const result = await api.createMorbidCase(row.id);
      route(`/docboard/morbid-cases/${result.morbid_case.id}`);
    } catch (err) {
      alert(err.message || 'Gagal menambahkan Morbid Case');
    } finally {
      setMorbidAddingId(null);
    }
  }

  const topOperation = summary.by_operation?.[0]?.operation_name || '-';

  return (
    <div class="view-operation-data view-gambiran-audit">
      <div class="view-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button class="btn-back" onClick={() => route('/docboard/settings')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </button>
          <div>
            <h1>Audit</h1>
            <p class="view-subtitle">Operasi Gambiran</p>
          </div>
        </div>
      </div>

      <form class="operation-data-filters" onSubmit={submitSearch}>
        <div class="audit-filter-grid">
          <input
            type="search"
            value={filters.operation}
            placeholder="Jenis operasi. Contoh: SVH, TAH"
            onInput={event => setFilters({ ...filters, operation: event.currentTarget.value })}
          />
          <input
            type="search"
            value={filters.patient}
            placeholder="Nama pasien"
            onInput={event => setFilters({ ...filters, patient: event.currentTarget.value })}
          />
          <input
            type="search"
            value={filters.mr}
            placeholder="No. rekam medis"
            onInput={event => setFilters({ ...filters, mr: event.currentTarget.value })}
          />
          <input
            type="search"
            value={filters.diagnosis}
            placeholder="Diagnosis"
            onInput={event => setFilters({ ...filters, diagnosis: event.currentTarget.value })}
          />
          <input
            type="search"
            value={filters.status}
            placeholder="Status"
            onInput={event => setFilters({ ...filters, status: event.currentTarget.value })}
          />
          <input
            type="number"
            min="0"
            value={filters.ageMin}
            placeholder="Umur min"
            onInput={event => setFilters({ ...filters, ageMin: event.currentTarget.value })}
          />
          <input
            type="number"
            min="0"
            value={filters.ageMax}
            placeholder="Umur maks"
            onInput={event => setFilters({ ...filters, ageMax: event.currentTarget.value })}
          />
          <input
            type="search"
            value={filters.procedureDoctor}
            placeholder="Operator tindakan"
            onInput={event => setFilters({ ...filters, procedureDoctor: event.currentTarget.value })}
          />
          <input
            type="search"
            value={filters.finalDoctor}
            placeholder="Dokter akhir"
            onInput={event => setFilters({ ...filters, finalDoctor: event.currentTarget.value })}
          />
        </div>
        <div class="audit-filter-row">
          <select value={filters.doctor} onChange={event => setFilters({ ...filters, doctor: event.currentTarget.value })}>
            {DOCTORS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
          <select value={filters.repeat} onChange={event => setFilters({ ...filters, repeat: event.currentTarget.value })}>
            {REPEAT_OPTIONS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
          <select value={filters.transfer} onChange={event => setFilters({ ...filters, transfer: event.currentTarget.value })}>
            {TRANSFER_OPTIONS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
          <select value={filters.doctorSource} onChange={event => setFilters({ ...filters, doctorSource: event.currentTarget.value })}>
            {DOCTOR_SOURCE_OPTIONS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
          <select value={filters.sort} onChange={event => setFilters({ ...filters, sort: event.currentTarget.value })}>
            {SORT_OPTIONS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div class="operation-data-filter-row">
          <input type="date" value={filters.start} onInput={event => setFilters({ ...filters, start: event.currentTarget.value })} />
          <input type="date" value={filters.end} onInput={event => setFilters({ ...filters, end: event.currentTarget.value })} />
          <button type="submit" class="btn-primary">Cari</button>
          <button type="button" class="btn-secondary" onClick={clearFilters}>Reset</button>
          <button type="button" class="btn-secondary" onClick={exportXls}>Cetak XLS</button>
        </div>
      </form>

      <div class="audit-summary-grid">
        <SummaryCard label="Total" value={summary.total || 0} />
        <SummaryCard label="Pindah Dokter" value={summary.transfer_count || 0} tone="transfer" />
        <SummaryCard label="Ulang 30 Hari" value={summary.repeat_count || 0} tone="warn" />
        <SummaryCard label="Terbanyak" value={topOperation} small />
      </div>

      <div class="operation-data-summary">
        <span>{pagination.total || rows.length} data audit</span>
        <span>{filters.start} - {filters.end}</span>
      </div>

      {error ? (
        <div class="error-state">
          <p>{error}</p>
          <button class="btn-secondary" onClick={() => loadAudit(1)}>Coba Lagi</button>
        </div>
      ) : loading ? (
        <div class="loading-state"><div class="spinner" /></div>
      ) : rows.length === 0 ? (
        <div class="empty-state">
          <p>Tidak ada data audit pada filter ini</p>
        </div>
      ) : (
        <div class="operation-data-list">
          {rows.map(row => <AuditRow key={row.id} row={row} onOpenPathology={openPathology} onOpenJourney={openJourney} onAddMorbid={addMorbidCase} morbidAdding={morbidAddingId === row.id} />)}
        </div>
      )}

      {pagination.has_more && (
        <button class="btn-secondary btn-full" disabled={loadingMore} onClick={() => loadAudit((pagination.page || 1) + 1, true)}>
          {loadingMore ? 'Memuat...' : 'Muat Lagi'}
        </button>
      )}

      {pathologyPanel.open && (
        <PathologyPanel
          row={pathologyPanel.row}
          loading={pathologyPanel.loading}
          error={pathologyPanel.error}
          data={pathologyPanel.data}
          onClose={closePathology}
        />
      )}

      {journeyPanel.open && (
        <DoctorJourneyPanel
          row={journeyPanel.row}
          loading={journeyPanel.loading}
          refreshing={journeyPanel.refreshing}
          error={journeyPanel.error}
          data={journeyPanel.data}
          onRefresh={refreshJourney}
          onClose={closeJourney}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone, small }) {
  return (
    <div class={`audit-summary-card ${tone || ''}`}>
      <div class="audit-summary-label">{label}</div>
      <div class={`audit-summary-value ${small ? 'small' : ''}`}>{value}</div>
    </div>
  );
}

function AuditRow({ row, onOpenPathology, onOpenJourney, onAddMorbid, morbidAdding }) {
  const repeat = row.repeat_after;
  const journey = row.doctor_journey;
  const origin = journey?.origin_doctor?.name;
  const finalDoctor = journey?.final_doctor?.name;
  return (
    <div class={`operation-data-row audit-row ${row.repeat_within_30d ? 'has-repeat' : ''}`}>
      <div class="operation-data-date">
        <strong>{formatDate(row.operation_date)}</strong>
        <span>{formatTime(row.operation_time)}</span>
      </div>
      <div class="operation-data-main">
        <div class="operation-data-title">{row.operation_name || 'Operasi'}</div>
        <div class="operation-data-patient">{row.patient_name}</div>
        <div class="operation-data-meta">
          <span>{doctorLabel(row.doctor_key)}</span>
          {row.mr_id && <span>RM {row.mr_id}</span>}
          {row.patient_age && <span>Umur {row.patient_age}</span>}
          {row.repeat_within_30d && <span class="audit-repeat-chip">Ulang 30 hari</span>}
        </div>
        {row.diagnosis && <div class="operation-data-diagnosis">{row.diagnosis}</div>}
        <div class={`audit-doctor-flow ${journey?.transfer_status || 'unknown'}`}>
          <div class="audit-doctor-flow-main">
            <span>{origin || 'Dokter awal belum diketahui'}</span>
            <strong aria-hidden="true">&rarr;</strong>
            <span>{finalDoctor || 'Dokter akhir belum diketahui'}</span>
          </div>
          <div class="audit-doctor-evidence">
            <span>Kunjungan terakhir: {journey?.last_visit_doctor?.name || '-'}</span>
            <span>Tindakan: {journey?.procedure_doctor?.name || '-'}</span>
          </div>
        </div>
        {repeat && (
          <div class="audit-repeat-detail">
            Operasi berikutnya: {formatDate(repeat.operation_date)} {formatTime(repeat.operation_time)} - {repeat.operation_name || 'Operasi'}
          </div>
        )}
      </div>
      <div class="audit-row-actions">
        <button type="button" class="audit-morbid-button" disabled={morbidAdding} onClick={() => onAddMorbid(row)}>{morbidAdding ? 'Mengambil...' : 'Morbid'}</button>
        <button type="button" class="audit-journey-button" onClick={() => onOpenJourney(row)}>Riwayat</button>
        <button type="button" class="audit-pa-button" onClick={() => onOpenPathology(row)}>PA</button>
      </div>
    </div>
  );
}

function transferLabel(status) {
  if (status === 'yes') return 'Pindah dokter';
  if (status === 'no') return 'Tidak pindah';
  return 'Belum pasti';
}

function confidenceLabel(value) {
  if (value === 'verified') return 'Terverifikasi';
  if (value === 'supported') return 'Didukung bukti';
  return 'Belum pasti';
}

function evidenceLabel(value) {
  const labels = {
    cppt_author: 'Penulis CPPT dokter',
    cppt_advice: 'Advis/kolaborasi CPPT',
    cppt_author_fallback: 'Dokter dari CPPT kunjungan',
    cppt_advice_fallback: 'Dokter dari advis kunjungan',
    visit_record: 'Dokter tercatat pada kunjungan',
    operation_operator: 'Operator tindakan',
    operation_registration: 'Pendaftaran operasi',
    last_relevant_cppt: 'CPPT relevan terakhir',
    last_relevant_visit: 'Dokter kunjungan terakhir',
    dpjp_support: 'DPJP pendukung',
    consultant_cppt: 'Konsultan CPPT',
    consultant_advice: 'Advis konsultan',
  };
  return labels[value] || value || 'Bukti klinis';
}

function DoctorJourneyPanel({ row, loading, refreshing, error, data, onRefresh, onClose }) {
  const journey = data?.doctor_journey;
  const analysisStatus = data?.analysis_status || (journey ? journey.analysis_status : 'not_analyzed');
  const timeline = journey?.visits || journey?.timeline || [];
  const failed = analysisStatus === 'failed' || Boolean(journey?.error_message);
  const notAnalyzed = analysisStatus === 'not_analyzed' && !journey;
  const ambiguous = journey?.transfer_status === 'unknown';

  return (
    <div class="audit-pa-overlay audit-journey-overlay" role="dialog" aria-modal="true" aria-labelledby="doctor-journey-title">
      <div class="audit-pa-panel audit-journey-panel">
        <div class="audit-pa-header">
          <div>
            <h2 id="doctor-journey-title">Riwayat Kunjungan</h2>
            <p>{row?.patient_name || '-'} {row?.mr_id ? `- RM ${row.mr_id}` : ''}</p>
          </div>
          <button type="button" class="audit-pa-close" onClick={onClose} aria-label="Tutup">&times;</button>
        </div>

        {loading ? (
          <div class="audit-pa-state">Memuat riwayat kunjungan...</div>
        ) : error && !journey ? (
          <div class="audit-journey-empty">
            <div class="audit-pa-state error">{error}</div>
            <button type="button" class="btn-primary" disabled={refreshing} onClick={onRefresh}>
              {refreshing ? 'Menganalisis...' : 'Coba lagi'}
            </button>
          </div>
        ) : notAnalyzed ? (
          <div class="audit-journey-empty">
            <div class="audit-pa-state">Riwayat kunjungan belum dianalisis.</div>
            <button type="button" class="btn-primary" disabled={refreshing} onClick={onRefresh}>
              {refreshing ? 'Menganalisis...' : 'Analisis sekarang'}
            </button>
          </div>
        ) : (
          <>
            <div class="audit-journey-summary">
              <div>
                <span>Status</span>
                <strong class={`journey-status ${journey?.transfer_status || 'unknown'}`}>{transferLabel(journey?.transfer_status)}</strong>
              </div>
              <div>
                <span>Keyakinan</span>
                <strong>{confidenceLabel(journey?.confidence)}</strong>
              </div>
              <div>
                <span>Kunjungan</span>
                <strong>{journey?.visit_count || timeline.length || 0}</strong>
              </div>
              <div>
                <span>Transisi</span>
                <strong>{journey?.transition_count || 0}</strong>
              </div>
            </div>

            {error && <div class="audit-pa-state error">{error}</div>}
            {failed && !error && <div class="audit-pa-state error">{journey?.error_message || 'Analisis terakhir gagal.'}</div>}
            {ambiguous && !failed && (
              <div class="audit-pa-state">Bukti belum cukup untuk menyatakan pasien pindah atau tidak pindah dokter.</div>
            )}

            <div class="audit-journey-doctors">
              <JourneyDoctor label="Dokter kontrol awal" doctor={journey?.origin_doctor} />
              <JourneyDoctor label="Kunjungan terakhir" doctor={journey?.last_visit_doctor} />
              <JourneyDoctor label="Operator tindakan" doctor={journey?.procedure_doctor} />
              <JourneyDoctor label="Dokter akhir" doctor={journey?.final_doctor} />
            </div>

            <div class="audit-journey-content">
              <div class="audit-journey-title-row">
                <h3>Riwayat Kunjungan Obgyn</h3>
                <button type="button" class="btn-secondary" disabled={refreshing} onClick={onRefresh}>
                  {refreshing ? 'Memeriksa...' : 'Periksa ulang'}
                </button>
              </div>
              {timeline.length === 0 ? (
                <div class="audit-pa-state">Belum ada kunjungan Obgyn yang dapat dipakai.</div>
              ) : (
                <div class="audit-journey-timeline">
                  {timeline.map((item, index) => (
                    <div class={`audit-journey-event visit ${item.resolution_status || 'unknown'} ${item.is_operation_visit ? 'operation' : ''}`} key={item.case_id || index}>
                      <div class="audit-journey-event-time">
                        <strong>{formatDate(item.date)}</strong>
                        <span>{formatTime(item.time)}</span>
                      </div>
                      <div class="audit-journey-event-body">
                        <strong>{item.diagnosis || 'Kunjungan Obgyn'}</strong>
                        <span>{item.location || 'Lokasi tidak tersedia'}</span>
                        <div class="audit-journey-visit-doctor">
                          <span>Dokter kunjungan</span>
                          <strong>{item.doctor_name || 'Belum diketahui'}</strong>
                        </div>
                        <div class="audit-journey-event-meta">
                          {item.visit_type && <span>{item.visit_type}</span>}
                          <span>{evidenceLabel(item.doctor_source)}</span>
                          <span>{confidenceLabel(item.confidence)}</span>
                        </div>
                        {item.is_operation_visit && item.procedure_doctor && (
                          <div class="audit-journey-procedure">
                            <span>Tindakan</span>
                            <strong>{item.procedure_doctor.name}</strong>
                          </div>
                        )}
                        {item.resolution_status === 'ambiguous' && item.doctor_candidates?.length > 0 && (
                          <p>Kandidat dokter: {item.doctor_candidates.map(candidate => candidate.name).join(', ')}</p>
                        )}
                        {item.note && <p>{item.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function JourneyDoctor({ label, doctor }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{doctor?.name || '-'}</strong>
      <small>{doctor?.source ? evidenceLabel(doctor.source) : ''}</small>
    </div>
  );
}

function PathologyPanel({ row, loading, error, data, onClose }) {
  const results = data?.results || [];
  const files = data?.files || [];
  const summary = data?.summary || {};

  return (
    <div class="audit-pa-overlay" role="dialog" aria-modal="true">
      <div class="audit-pa-panel">
        <div class="audit-pa-header">
          <div>
            <h2>Patologi Anatomi</h2>
            <p>{row?.patient_name || '-'} {row?.mr_id ? `- RM ${row.mr_id}` : ''}</p>
          </div>
          <button type="button" class="audit-pa-close" onClick={onClose} aria-label="Tutup">&times;</button>
        </div>

        {loading ? (
          <div class="audit-pa-state">Memuat pemeriksaan penunjang...</div>
        ) : error ? (
          <div class="audit-pa-state error">{error}</div>
        ) : (
          <>
            <div class="audit-pa-summary">
              <span>{summary.total || 0} item PA</span>
              <span>{summary.done || 0} selesai</span>
              <span>{summary.files || 0} file</span>
            </div>

            {data?.message && <div class="audit-pa-state">{data.message}</div>}

            {results.length === 0 && files.length === 0 && !data?.message ? (
              <div class="audit-pa-state">Belum ada hasil Patologi Anatomi pada pemeriksaan penunjang.</div>
            ) : (
              <div class="audit-pa-content">
                {results.length > 0 && (
                  <div class="audit-pa-section">
                    <h3>Hasil Penunjang</h3>
                    {results.map(item => (
                      <div class="audit-pa-result" key={`${item.detailId || item.name}-${item.date || ''}`}>
                        <div>
                          <strong>{item.name || item.title || 'Patologi Anatomi'}</strong>
                          <span>{item.date || item.createdAt || ''}</span>
                        </div>
                        <span class={item.isDone || /selesai/i.test(item.value || '') ? 'audit-pa-status done' : 'audit-pa-status'}>
                          {item.value || (item.isDone ? 'Selesai' : 'Belum selesai')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {files.length > 0 && (
                  <div class="audit-pa-section">
                    <h3>Dokumen</h3>
                    {files.map(file => {
                      const href = file.url ? api.getGambiranAuditPathologyFileUrl(file.url) : null;
                      return href ? (
                        <a class="audit-pa-file" key={file.id || file.title} href={href} target="_blank" rel="noopener noreferrer">
                          <span>{file.title || file.name || 'File PA'}</span>
                          <strong>Buka PDF</strong>
                        </a>
                      ) : (
                        <div class="audit-pa-file disabled" key={file.id || file.title}>
                          <span>{file.title || file.name || 'File PA'}</span>
                          <strong>Tidak tersedia</strong>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
