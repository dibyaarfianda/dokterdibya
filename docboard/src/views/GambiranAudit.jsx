import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { today, formatDateShort } from '../utils/date';

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

function defaultStartDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  const [filters, setFilters] = useState({
    start: defaultStartDate(),
    end: today(),
    doctor: 'all',
    operation: '',
    repeat: 'all',
  });

  useEffect(() => {
    loadAudit(1);
  }, [filters.start, filters.end, filters.doctor, filters.repeat]);

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
        <input
          type="search"
          value={filters.operation}
          placeholder="Cari jenis operasi. Contoh: SVH, TAH"
          onInput={event => setFilters({ ...filters, operation: event.currentTarget.value })}
        />
        <div class="audit-filter-row">
          <select value={filters.doctor} onChange={event => setFilters({ ...filters, doctor: event.currentTarget.value })}>
            {DOCTORS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
          <select value={filters.repeat} onChange={event => setFilters({ ...filters, repeat: event.currentTarget.value })}>
            {REPEAT_OPTIONS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div class="operation-data-filter-row">
          <input type="date" value={filters.start} onInput={event => setFilters({ ...filters, start: event.currentTarget.value })} />
          <input type="date" value={filters.end} onInput={event => setFilters({ ...filters, end: event.currentTarget.value })} />
          <button type="submit" class="btn-primary">Cari</button>
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
          {rows.map(row => <AuditRow key={row.id} row={row} />)}
        </div>
      )}

      {pagination.has_more && (
        <button class="btn-secondary btn-full" disabled={loadingMore} onClick={() => loadAudit((pagination.page || 1) + 1, true)}>
          {loadingMore ? 'Memuat...' : 'Muat Lagi'}
        </button>
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

function AuditRow({ row }) {
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
          {row.mr_id && <span>MR {row.mr_id}</span>}
          {row.repeat_within_30d && <span class="audit-repeat-chip">Ulang 30 hari</span>}
        </div>
        {row.diagnosis && <div class="operation-data-diagnosis">{row.diagnosis}</div>}
        {repeat && (
          <div class="audit-repeat-detail">
            Operasi berikutnya: {formatDate(repeat.operation_date)} {formatTime(repeat.operation_time)} - {repeat.operation_name || 'Operasi'}
          </div>
        )}
      </div>
      <div class="operation-data-chevron">&gt;</div>
    </div>
  );
}
