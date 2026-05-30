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

  return (
    <div class="surgery-card" onClick={onClick}>
      <div class="surgery-card-left">
        <span class="surgery-time">{timeStr}</span>
        <span class="surgery-loc-dot" style={{ backgroundColor: loc?.color || '#94A3B8' }} />
      </div>
      <div class="surgery-card-body">
        <div class="surgery-card-name">{s.patient_name}</div>
        <div class="surgery-card-meta">
          <span class="surgery-op-badge">{operationDisplayName}</span>
          <span class="surgery-loc-name">{loc?.shortName || s.location}</span>
        </div>
        {s.diagnosis && (
          <div class="surgery-card-diag">{s.diagnosis.length > 60 ? s.diagnosis.substring(0, 60) + '...' : s.diagnosis}</div>
        )}
      </div>
      <div class="surgery-card-right">
        <span class="status-badge" style={{ color: status.color, backgroundColor: status.bg }}>
          {status.label}
        </span>
      </div>
    </div>
  );
}
