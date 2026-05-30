import { useState, useEffect } from 'preact/hooks';
import { api } from '../services/api';
import { briefingData, briefingLoading } from '../stores/schedule';
import { today } from '../utils/date';
import { LOCATIONS } from '../utils/constants';

export default function MorningBriefing() {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!briefingData.value) {
      loadBriefing();
    }
  }, []);

  async function loadBriefing(refresh = false) {
    briefingLoading.value = true;
    setError(null);
    try {
      const data = await api.getBriefing(today(), refresh);
      briefingData.value = data.briefing?.content || data.briefing;
    } catch (err) {
      console.error('Failed to load briefing:', err);
      setError(err.message);
    } finally {
      briefingLoading.value = false;
    }
  }

  function handleRefresh(e) {
    e.stopPropagation();
    loadBriefing(true);
  }

  // Loading state (shimmer)
  if (briefingLoading.value && !briefingData.value) {
    return (
      <div class="briefing-card">
        <div class="briefing-header">
          <div class="briefing-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
            </svg>
          </div>
          <span class="briefing-title">Morning Briefing</span>
        </div>
        <div class="briefing-shimmer">
          <div class="shimmer-line shimmer-line-long" />
          <div class="shimmer-line shimmer-line-medium" />
          <div class="shimmer-line shimmer-line-short" />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !briefingData.value) {
    return (
      <div class="briefing-card briefing-error" onClick={() => loadBriefing()}>
        <div class="briefing-header">
          <div class="briefing-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
            </svg>
          </div>
          <span class="briefing-title">Morning Briefing</span>
        </div>
        <div class="briefing-error-msg">
          Gagal memuat. Ketuk untuk coba lagi.
        </div>
      </div>
    );
  }

  const briefing = briefingData.value;
  if (!briefing) return null;

  const hasSurgeries = briefing.surgeries && briefing.surgeries.length > 0;
  const hasPatients = briefing.patient_overview && briefing.patient_overview.length > 0;
  const hasReminders = briefing.reminders && briefing.reminders.length > 0;
  const hasScheduleNotes = briefing.schedule_notes && briefing.schedule_notes.length > 0;

  return (
    <div class={`briefing-card${expanded ? ' expanded' : ''}`}>
      {/* Header - always visible, acts as toggle */}
      <div class="briefing-header" onClick={() => setExpanded(!expanded)}>
        <div class="briefing-header-left">
          <div class="briefing-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
            </svg>
          </div>
          <span class="briefing-title">Morning Briefing</span>
          {briefing.ai_generated && <span class="briefing-ai-badge">AI</span>}
        </div>
        <div class="briefing-header-right">
          <button
            class={`briefing-refresh-btn${briefingLoading.value ? ' spinning' : ''}`}
            onClick={handleRefresh}
            title="Refresh briefing"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23,4 23,10 17,10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          <svg
            class={`briefing-chevron${expanded ? ' rotated' : ''}`}
            width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </div>
      </div>

      {/* Summary - always visible */}
      <div class="briefing-summary">
        {briefing.summary || 'Tidak ada data untuk hari ini.'}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div class="briefing-details">
          {/* Patient overview */}
          {hasPatients && (
            <div class="briefing-section">
              <div class="briefing-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Pasien ({briefing.total_patients || 0})
              </div>
              <div class="briefing-patients">
                {briefing.patient_overview.map((p, i) => {
                  const locKey = p.location_key || Object.keys(LOCATIONS).find(
                    k => LOCATIONS[k].name === p.location || LOCATIONS[k].shortName === p.location || k === p.location
                  );
                  const locInfo = locKey ? LOCATIONS[locKey] : null;
                  return (
                    <div key={i} class="briefing-patient-row">
                      <span
                        class="briefing-loc-dot"
                        style={{ backgroundColor: locInfo?.color || '#94A3B8' }}
                      />
                      <span class="briefing-loc-name">{p.location}</span>
                      <span class="briefing-loc-count">
                        {p.count}
                        {p.completed > 0 && (
                          <span class="briefing-completed"> ({p.completed} selesai)</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Surgeries */}
          {hasSurgeries && (
            <div class="briefing-section">
              <div class="briefing-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                Operasi ({briefing.surgeries.length})
              </div>
              <div class="briefing-surgeries">
                {briefing.surgeries.map((s, i) => (
                  <div key={i} class="briefing-surgery-row">
                    <div class="briefing-surgery-time">{s.time || '-'}</div>
                    <div class="briefing-surgery-info">
                      <div class="briefing-surgery-op">{s.operation}</div>
                      <div class="briefing-surgery-patient">
                        {s.patient_name} &middot; {s.location}
                      </div>
                    </div>
                    <span class={`briefing-surgery-status status-${s.status}`}>
                      {s.status === 'planned' ? 'Rencana' :
                       s.status === 'confirmed' ? 'OK' :
                       s.status === 'in_progress' ? 'Selesai' :
                       s.status === 'completed' ? 'Selesai' : s.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schedule notes */}
          {hasScheduleNotes && (
            <div class="briefing-section">
              <div class="briefing-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12,6 12,12 16,14" />
                </svg>
                Jadwal Praktek
              </div>
              <div class="briefing-notes-list">
                {briefing.schedule_notes.map((note, i) => (
                  <div key={i} class="briefing-note-item">{note}</div>
                ))}
              </div>
            </div>
          )}

          {/* Reminders */}
          {hasReminders && (
            <div class="briefing-section">
              <div class="briefing-section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                Pengingat
              </div>
              <div class="briefing-reminders">
                {briefing.reminders.map((r, i) => (
                  <div key={i} class="briefing-reminder-item">
                    <span class="briefing-reminder-bullet" />
                    {r}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
