import { useState, useEffect } from 'preact/hooks';
import { api } from '../services/api';
import { LOCATIONS, SURGERY_STATUS } from '../utils/constants';
import { formatDateDisplay, today } from '../utils/date';

export default function ORBoard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(today());

  useEffect(() => { loadBoard(); }, [date]);

  async function loadBoard() {
    setLoading(true);
    try {
      const res = await api.getORBoard(date);
      setData(res);
    } catch (err) {
      console.error('OR Board load failed:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div class="loading-state"><div class="spinner" /></div>;

  const locations = data?.byLocation || {};
  const locationKeys = Object.keys(locations);

  return (
    <div class="view-or-board">
      <div class="view-header">
        <h1>OR Board</h1>
        <div class="or-board-meta">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} class="or-date-input" />
          <button class="btn-icon" onClick={loadBoard} title="Refresh">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23,4 23,10 17,10" /><path d="M20.49 15A9 9 0 1 1 21 12" />
            </svg>
          </button>
        </div>
      </div>

      <div class="or-board-date">{formatDateDisplay(date)}</div>
      <div class="or-board-total">{data?.total || 0} operasi terjadwal</div>

      {data?.last_updated && (
        <div class="or-board-updated">Update: {new Date(data.last_updated).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
      )}

      {locationKeys.length === 0 ? (
        <div class="empty-state"><p>Tidak ada operasi hari ini</p></div>
      ) : (
        <div class="or-board-locations">
          {locationKeys.map(locKey => {
            const loc = LOCATIONS[locKey] || {};
            const surgeries = locations[locKey] || [];
            return (
              <div key={locKey} class="or-location-card">
                <div class="or-location-header" style={{ borderLeftColor: loc.color || '#94A3B8' }}>
                  <span class="or-location-name">{loc.name || locKey}</span>
                  <span class="or-location-count">{surgeries.length}</span>
                </div>
                <div class="or-surgery-list">
                  {surgeries.map(s => {
                    const st = SURGERY_STATUS[s.status] || {};
                    const timeStr = s.surgery_time ? s.surgery_time.substring(0, 5) : '--:--';
                    return (
                      <a key={s.id} href={`/docboard/surgery/${s.id}`} class="or-surgery-item">
                        <div class="or-surgery-time">{timeStr}</div>
                        <div class="or-surgery-info">
                          <div class="or-surgery-patient">{s.patient_name}</div>
                          <div class="or-surgery-op">{s.op_code ? s.op_code + ' - ' : ''}{s.op_name_id || s.op_name}</div>
                          {s.anesthesia_type && <div class="or-surgery-anest">{s.anesthesia_type}{s.asa_score ? ` (ASA ${s.asa_score})` : ''}</div>}
                        </div>
                        <div class="or-surgery-status">
                          <span class="status-dot" style={{ backgroundColor: st.color || '#94A3B8' }} />
                          <span style={{ color: st.color || '#94A3B8', fontSize: '11px' }}>{st.label || s.status}</span>
                        </div>
                        {s.estimated_duration_min && <div class="or-surgery-dur">{s.estimated_duration_min}m</div>}
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
