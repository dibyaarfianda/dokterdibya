import { useState } from 'preact/hooks';
import { LOCATIONS, SYNC_STATUS } from '../utils/constants';
import { formatTime, relativeTime } from '../utils/date';
import PatientCard from './PatientCard';

export default function LocationCard({ location, data }) {
  const [expanded, setExpanded] = useState(false);
  const loc = LOCATIONS[location] || {};
  const syncInfo = SYNC_STATUS[data.sync_status] || SYNC_STATUS.pending;

  return (
    <div class="location-card">
      <div class="location-card-header" onClick={() => setExpanded(!expanded)}>
        <div class="location-card-left">
          <span class="location-dot" style={{ backgroundColor: loc.color }} />
          <div>
            <div class="location-name">{loc.name}</div>
            <div class="location-meta">
              {data.start_time && (
                <span>{formatTime(data.start_time)} - {formatTime(data.end_time)}</span>
              )}
            </div>
          </div>
        </div>
        <div class="location-card-right">
          <div class="location-patient-count">
            <span class="count-number">{data.patient_count || 0}</span>
            <span class="count-label">pasien</span>
          </div>
          <span class={`sync-badge sync-${data.sync_status}`}>
            {syncInfo.label}
          </span>
          <svg
            class={`chevron ${expanded ? 'expanded' : ''}`}
            width="20" height="20" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div class="location-card-body">
          {data.patients && data.patients.length > 0 ? (
            data.patients.map((p, i) => (
              <PatientCard key={p.id || i} patient={p} index={i} locationColor={loc.color} />
            ))
          ) : (
            <div class="empty-state-small">Belum ada data pasien</div>
          )}
          {data.last_synced_at && (
            <div class="sync-info">
              Terakhir sync: {relativeTime(data.last_synced_at)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
