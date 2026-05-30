import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { LOCATIONS } from '../utils/constants';
import { today } from '../utils/date';

const FACILITY_OPTIONS = [
  { value: 'all', label: 'Semua RS' },
  { value: 'melinda', label: 'Melinda' },
  { value: 'gambiran', label: 'Gambiran' },
  { value: 'bhayangkara', label: 'Bhayangkara' },
];

function defaultStartDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function facilityLocation(facility) {
  if (facility === 'melinda') return LOCATIONS.rsia_melinda;
  if (facility === 'gambiran') return LOCATIONS.rsud_gambiran;
  if (facility === 'bhayangkara') return LOCATIONS.rs_bhayangkara;
  return null;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '--:--';
}

export default function OperationDataList() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, has_more: false });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState({
    facility: 'all',
    start: defaultStartDate(),
    end: today(),
    q: '',
  });

  useEffect(() => {
    loadData(1);
  }, [filters.facility, filters.start, filters.end]);

  async function loadData(page = 1, append = false) {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const result = await api.getOperationData({
        ...filters,
        page,
        limit: 50,
      });
      setRows(append ? [...rows, ...(result.data || [])] : (result.data || []));
      setPagination(result.pagination || { page, limit: 50, total: 0, has_more: false });
    } catch (err) {
      console.error('Failed to load operation data:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function submitSearch(e) {
    e.preventDefault();
    loadData(1);
  }

  return (
    <div class="view-operation-data">
      <div class="view-header">
        <div>
          <h1>Data Operasi</h1>
          <p class="view-subtitle">Arsip hasil operasi dr. Dibya</p>
        </div>
      </div>

      <form class="operation-data-filters" onSubmit={submitSearch}>
        <input
          type="search"
          value={filters.q}
          placeholder="Cari pasien, MR, tindakan, diagnosis"
          onInput={e => setFilters({ ...filters, q: e.currentTarget.value })}
        />
        <div class="operation-data-filter-row">
          <select value={filters.facility} onChange={e => setFilters({ ...filters, facility: e.currentTarget.value })}>
            {FACILITY_OPTIONS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
          <input type="date" value={filters.start} onInput={e => setFilters({ ...filters, start: e.currentTarget.value })} />
          <input type="date" value={filters.end} onInput={e => setFilters({ ...filters, end: e.currentTarget.value })} />
        </div>
        <button type="submit" class="btn-primary btn-full">Cari Data</button>
      </form>

      <div class="operation-data-summary">
        <span>{pagination.total || rows.length} data operasi</span>
        <span>{filters.start} - {filters.end}</span>
      </div>

      {loading ? (
        <div class="loading-state"><div class="spinner" /></div>
      ) : rows.length === 0 ? (
        <div class="empty-state">
          <p>Belum ada data operasi pada filter ini</p>
        </div>
      ) : (
        <div class="operation-data-list">
          {rows.map(row => {
            const loc = facilityLocation(row.facility);
            return (
              <button class="operation-data-row" type="button" key={row.id} onClick={() => route(`/docboard/data/${row.id}`)}>
                <div class="operation-data-date">
                  <strong>{formatDate(row.operation_date)}</strong>
                  <span>{formatTime(row.operation_time)}</span>
                </div>
                <div class="operation-data-main">
                  <div class="operation-data-title">{row.operation_name || 'Operasi'}</div>
                  <div class="operation-data-patient">{row.patient_name}</div>
                  <div class="operation-data-meta">
                    <span style={{ backgroundColor: loc?.colorLight || '#F1F5F9', color: loc?.color || '#64748B' }}>
                      {loc?.name || row.facility}
                    </span>
                    {row.mr_id && <span>MR {row.mr_id}</span>}
                    {row.status && <span>{row.status}</span>}
                  </div>
                  {row.diagnosis && <div class="operation-data-diagnosis">{row.diagnosis}</div>}
                </div>
                <div class="operation-data-chevron">›</div>
              </button>
            );
          })}
        </div>
      )}

      {pagination.has_more && (
        <button class="btn-secondary btn-full" disabled={loadingMore} onClick={() => loadData((pagination.page || 1) + 1, true)}>
          {loadingMore ? 'Memuat...' : 'Muat Lagi'}
        </button>
      )}
    </div>
  );
}
