import { useState, useEffect } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { LOCATIONS, SURGERY_STATUS } from '../utils/constants';
import { today } from '../utils/date';
import ExportButton from '../components/ExportButton';

export default function SurgeryList() {
  const [surgeries, setSurgeries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadUpcoming(); }, []);

  async function loadUpcoming() {
    setLoading(true);
    try {
      const data = await api.getUpcomingSurgeries(14, 7);
      setSurgeries(data.surgeries || []);
    } catch (err) {
      console.error('Failed to load surgeries:', err);
    } finally {
      setLoading(false);
    }
  }

  // Group by date
  const grouped = {};
  for (const s of surgeries) {
    const d = new Date(s.surgery_date);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!grouped[dateStr]) grouped[dateStr] = [];
    grouped[dateStr].push(s);
  }

  const todayStr = today();

  return (
    <div class="view-surgery">
      <div class="view-header">
        <div>
          <h1>Jadwal Operasi</h1>
          <p class="view-subtitle">7 hari terakhir sampai 14 hari ke depan</p>
        </div>
        <div class="view-header-actions">
          <ExportButton />
          <button class="btn-icon-primary" onClick={() => route('/docboard/surgery/new')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div class="loading-state">
          <div class="spinner" />
        </div>
      ) : surgeries.length === 0 ? (
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M3 10h18" /><path d="M8 2v4" /><path d="M16 2v4" />
          </svg>
          <p>Belum ada jadwal operasi</p>
          <button class="btn-primary" onClick={() => route('/docboard/surgery/new')}>
            + Tambah Jadwal
          </button>
        </div>
      ) : (
        <div class="surgery-groups">
          {Object.entries(grouped).map(([date, items]) => {
            const isToday = date === todayStr;
            const dateObj = new Date(date + 'T00:00:00');
            const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
            const dateDisplay = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

            return (
              <div key={date} class="surgery-group">
                <div class={`surgery-date-header ${isToday ? 'today' : ''}`}>
                  <span class="surgery-date-day">{dayName}</span>
                  <span class="surgery-date-num">{dateDisplay}</span>
                  <span class="surgery-date-count">{items.length} operasi</span>
                </div>
                {items.map(s => (
                  <SurgeryCard key={s.id} surgery={s} onClick={() => route(`/docboard/surgery/${s.id}`)} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* FAB */}
      <button class="fab" onClick={() => route('/docboard/surgery/new')}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function SurgeryCard({ surgery: s, onClick }) {
  const loc = LOCATIONS[s.location];
  const status = SURGERY_STATUS[s.status] || SURGERY_STATUS.planned;
  const timeStr = s.surgery_time ? s.surgery_time.substring(0, 5) : '--:--';
  const operationDisplayName = s.op_display_name || s.operation_type_other || s.op_name_id || s.op_name;
  const locationName = loc?.name || s.location;
  const diagnosis = s.diagnosis && s.diagnosis.trim() ? s.diagnosis.trim() : '';

  return (
    <button class="surgery-row-card" type="button" onClick={onClick}>
      <div class="surgery-row-time">
        <span>{timeStr}</span>
        <small>WIB</small>
      </div>

      <div class="surgery-row-main">
        <div class="surgery-row-operation">{operationDisplayName || 'Operasi'}</div>
        <div class="surgery-row-patient">{s.patient_name}</div>

        <div class="surgery-row-meta">
          <span class="surgery-row-chip hospital" style={{ color: loc?.color || '#64748B', backgroundColor: loc?.colorLight || '#F1F5F9' }}>
            <span class="surgery-row-dot" style={{ backgroundColor: loc?.color || '#94A3B8' }} />
            {locationName}
          </span>
          {s.mr_id && <span class="surgery-row-chip">MR {s.mr_id}</span>}
          {s.patient_age && <span class="surgery-row-chip">{s.patient_age} th</span>}
        </div>

        {diagnosis && (
          <div class="surgery-row-diagnosis">
            {diagnosis.length > 96 ? diagnosis.substring(0, 96) + '...' : diagnosis}
          </div>
        )}
      </div>

      <div class="surgery-row-right">
        <span class="status-badge" style={{ color: status.color, backgroundColor: status.bg }}>
          {status.label}
        </span>
        <span class="surgery-row-chevron">›</span>
      </div>
    </button>
  );
}
