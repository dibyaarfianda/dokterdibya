import { useState, useEffect } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { LOCATIONS, SURGERY_STATUS, OP_CATEGORY } from '../utils/constants';

export default function SurgeryDetail({ id }) {
  const [surgery, setSurgery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showActions, setShowActions] = useState(false);

  useEffect(() => { loadSurgery(); }, [id]);

  async function loadSurgery() {
    setLoading(true);
    try {
      const data = await api.getSurgery(id);
      setSurgery(data.surgery);
    } catch (err) {
      console.error('Failed to load surgery:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus) {
    let reason = null;
    if (newStatus === 'cancelled' || newStatus === 'postponed') {
      reason = prompt(newStatus === 'cancelled' ? 'Alasan batal:' : 'Alasan ditunda:');
      if (reason === null) return;
    }
    try {
      await api.updateSurgeryStatus(id, newStatus, reason);
      await loadSurgery();
      setShowActions(false);
    } catch (err) {
      alert('Gagal update status: ' + err.message);
    }
  }

  async function handleDelete() {
    if (!confirm('Hapus jadwal operasi ini?')) return;
    try {
      await api.deleteSurgery(id);
      route('/docboard/surgery');
    } catch (err) {
      alert('Gagal hapus: ' + err.message);
    }
  }

  if (loading) return <div class="loading-state"><div class="spinner" /></div>;
  if (!surgery) return <div class="empty-state"><p>Tidak ditemukan</p></div>;

  const s = surgery;
  const loc = LOCATIONS[s.location] || {};
  const status = SURGERY_STATUS[s.status] || SURGERY_STATUS.planned;
  const opCat = OP_CATEGORY[s.op_category] || {};
  const dateObj = new Date(s.surgery_date);
  const dateStr = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = s.surgery_time ? s.surgery_time.substring(0, 5) : null;
  const team = s.team_members || [];

  return (
    <div class="view-surgery-detail">
      {/* Header */}
      <div class="detail-header" style={{ borderBottomColor: loc.color || '#3B82F6' }}>
        <button class="btn-back" onClick={() => history.back()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <div class="detail-header-actions">
          <button class="btn-icon" onClick={() => route(`/docboard/surgery/edit/${id}`)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button class="btn-icon" onClick={() => setShowActions(!showActions)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Actions dropdown */}
      {showActions && (
        <div class="actions-dropdown">
          {s.status === 'planned' && <button onClick={() => updateStatus('confirmed')}>Konfirmasi</button>}
          {(s.status === 'planned' || s.status === 'confirmed') && <button onClick={() => updateStatus('in_progress')}>Mulai Operasi</button>}
          {s.status === 'in_progress' && <button onClick={() => updateStatus('completed')}>Selesai</button>}
          {s.status !== 'cancelled' && s.status !== 'completed' && (
            <>
              <button onClick={() => updateStatus('postponed')}>Tunda</button>
              <button onClick={() => updateStatus('cancelled')} class="text-danger">Batalkan</button>
            </>
          )}
          <button onClick={handleDelete} class="text-danger">Hapus</button>
        </div>
      )}

      {/* Patient & Status */}
      <div class="detail-card">
        <div class="detail-patient-header">
          <div>
            <h2 class="detail-patient-name">{s.patient_name}</h2>
            {s.patient_age && <span class="detail-patient-age">{s.patient_age} tahun</span>}
          </div>
          <span class="status-badge status-lg" style={{ color: status.color, backgroundColor: status.bg }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Operation Info */}
      <div class="detail-card">
        <div class="detail-label">Jenis Operasi</div>
        <div class="detail-op-name">
          {s.op_code && <span class="op-code-badge">{s.op_code}</span>}
          {s.op_name_id || s.op_name}
        </div>
        {opCat.label && (
          <span class="op-cat-badge" style={{ color: opCat.color }}>{opCat.label}</span>
        )}
      </div>

      {/* Schedule */}
      <div class="detail-card">
        <div class="detail-label">Jadwal</div>
        <div class="detail-schedule">
          <div class="detail-schedule-date">{dateStr}</div>
          {timeStr && <div class="detail-schedule-time">Jam {timeStr}</div>}
          <div class="detail-schedule-loc" style={{ color: loc.color }}>
            <span class="loc-dot" style={{ backgroundColor: loc.color }} />
            {loc.name || s.location}
          </div>
        </div>
      </div>

      {/* Diagnosis */}
      <div class="detail-card">
        <div class="detail-label">Diagnosis</div>
        <div class="detail-text">{s.diagnosis}</div>
      </div>

      {/* Clinical Results */}
      {(s.lab_results || s.radiology_results || s.usg_results) && (
        <div class="detail-card">
          {s.lab_results && (
            <>
              <div class="detail-label">Hasil Lab</div>
              <div class="detail-text">{s.lab_results}</div>
            </>
          )}
          {s.radiology_results && (
            <>
              <div class="detail-label" style="margin-top:12px">Hasil Radiologi</div>
              <div class="detail-text">{s.radiology_results}</div>
            </>
          )}
          {s.usg_results && (
            <>
              <div class="detail-label" style="margin-top:12px">Hasil USG</div>
              <div class="detail-text">{s.usg_results}</div>
            </>
          )}
        </div>
      )}

      {/* Team */}
      {team.length > 0 && (
        <div class="detail-card">
          <div class="detail-label">Tim Operasi</div>
          <div class="detail-team">
            {team.map((m, i) => (
              <div key={i} class="detail-team-member">
                <span class="team-avatar">{m.name.charAt(0)}</span>
                <div>
                  <div class="team-name">{m.name}</div>
                  <div class="team-role">{m.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {s.special_notes && (
        <div class="detail-card">
          <div class="detail-label">Catatan Khusus</div>
          <div class="detail-text detail-notes">{s.special_notes}</div>
        </div>
      )}

      {s.cancellation_reason && (
        <div class="detail-card" style="border-left: 3px solid var(--danger)">
          <div class="detail-label">Alasan {s.status === 'cancelled' ? 'Batal' : 'Ditunda'}</div>
          <div class="detail-text">{s.cancellation_reason}</div>
        </div>
      )}

      {s.post_op_notes && (
        <div class="detail-card">
          <div class="detail-label">Catatan Post-Op</div>
          <div class="detail-text">{s.post_op_notes}</div>
        </div>
      )}
    </div>
  );
}
