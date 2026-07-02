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
  });

  useEffect(() => {
    loadAudit(1);
  }, [filters.start, filters.end, filters.doctor, filters.repeat, filters.doctorSource, filters.sort]);

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
        </div>
        <div class="audit-filter-row">
          <select value={filters.doctor} onChange={event => setFilters({ ...filters, doctor: event.currentTarget.value })}>
            {DOCTORS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
          <select value={filters.repeat} onChange={event => setFilters({ ...filters, repeat: event.currentTarget.value })}>
            {REPEAT_OPTIONS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
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
          {rows.map(row => <AuditRow key={row.id} row={row} onOpenPathology={openPathology} />)}
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

function AuditRow({ row, onOpenPathology }) {
  const repeat = row.repeat_after;
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
        {repeat && (
          <div class="audit-repeat-detail">
            Operasi berikutnya: {formatDate(repeat.operation_date)} {formatTime(repeat.operation_time)} - {repeat.operation_name || 'Operasi'}
          </div>
        )}
      </div>
      <div class="audit-row-actions">
        <button type="button" class="audit-pa-button" onClick={() => onOpenPathology(row)}>PA</button>
      </div>
    </div>
  );
}

function PathologyPanel({ row, loading, error, data, onClose }) {
  const results = data?.results || [];
  const files = data?.files || [];
  const summary = data?.summary || {};

  function openFile(file) {
    if (!file.url) return;
    window.open(api.getGambiranAuditPathologyFileUrl(file.url), '_blank');
  }

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
                    {files.map(file => (
                      <button type="button" class="audit-pa-file" key={file.id || file.title} onClick={() => openFile(file)}>
                        <span>{file.title || file.name || 'File PA'}</span>
                        <strong>Buka</strong>
                      </button>
                    ))}
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
