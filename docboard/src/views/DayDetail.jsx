import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import LocationCard from '../components/LocationCard';
import { SkeletonList } from '../components/SkeletonLoader';
import { api } from '../services/api';
import { formatDateDisplay, getDayName, formatTime } from '../utils/date';
import { LOCATIONS } from '../utils/constants';

export default function DayDetail({ date }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [surgeries, setSurgeries] = useState([]);
  const [surgLoading, setSurgLoading] = useState(true);

  useEffect(() => {
    loadDay();
    loadSurgeries();
  }, [date]);

  async function loadDay() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDay(date);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSurgeries() {
    setSurgLoading(true);
    try {
      const result = await api.getDaySurgeries(date);
      setSurgeries(result.surgeries || []);
    } catch (err) {
      console.error('Failed to load surgeries:', err);
    } finally {
      setSurgLoading(false);
    }
  }

  const totalPatients = data?.locations?.reduce((sum, l) => sum + (l.patient_count || 0), 0) || 0;

  return (
    <div class="view-day-detail">
      {/* Header */}
      <div class="day-header">
        <button class="back-btn" onClick={() => route('/docboard/')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <div class="day-header-info">
          <h2 class="day-header-date">{formatDateDisplay(date)}</h2>
          <span class="day-header-day">{getDayName(date, true)}</span>
        </div>
        <div class="day-header-count">
          <span class="count-number">{totalPatients}</span>
          <span class="count-label">pasien</span>
        </div>
      </div>

      {/* Location cards */}
      <div class="day-locations">
        {loading ? (
          <SkeletonList count={3} />
        ) : error ? (
          <div class="error-state">
            <p>{error}</p>
            <button class="btn-secondary" onClick={loadDay}>Coba lagi</button>
          </div>
        ) : data?.locations?.length > 0 ? (
          data.locations.map(loc => (
            <LocationCard
              key={loc.location}
              location={loc.location}
              data={loc}
            />
          ))
        ) : (
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <p>Tidak ada jadwal untuk tanggal ini</p>
          </div>
        )}
      </div>

      {/* Surgery section */}
      {surgLoading ? (
        <div class="day-surgery-section">
          <div class="day-section-title">Jadwal Operasi</div>
          <SkeletonList count={2} />
        </div>
      ) : surgeries.length > 0 && (
        <div class="day-surgery-section">
          <div class="day-section-title">
            Jadwal Operasi
            <span class="day-section-count">{surgeries.length}</span>
          </div>
          {surgeries.map(s => {
            const loc = LOCATIONS[s.location] || {};
            const opName = s.op_display_name || s.operation_type_other || s.op_name_id || s.op_name || '-';
            return (
              <div
                key={s.id}
                class="day-surgery-card"
                onClick={() => route(`/docboard/surgery/${s.id}`)}
              >
                <div class="day-surgery-time">
                  {s.surgery_time ? formatTime(s.surgery_time) : '--:--'}
                </div>
                <div class="day-surgery-info">
                  <div class="day-surgery-patient">{s.patient_name}</div>
                  <div class="day-surgery-op">{opName}</div>
                  <div class="day-surgery-meta">
                    <span class="day-surgery-loc" style={{ color: loc.color }}>
                      {loc.shortName || s.location}
                    </span>
                    {s.diagnosis && <span class="day-surgery-diag">• {s.diagnosis}</span>}
                  </div>
                </div>
                <div class={`day-surgery-status status-${s.status}`}>
                  {s.status === 'scheduled' ? '📋' : (s.status === 'completed' || s.status === 'in_progress') ? '✅' : '⬚'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
