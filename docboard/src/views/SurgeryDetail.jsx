import { useState, useEffect } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { LOCATIONS, SURGERY_STATUS, OP_CATEGORY, COMPLICATION_GRADES, WOUND_CLASSES, getRolePermissions } from '../utils/constants';
import { userRole } from '../stores/auth';
import PostOpNotesForm from '../components/PostOpNotesForm';

const ASA_LABELS = {
  1: 'ASA I - Sehat',
  2: 'ASA II - Penyakit sistemik ringan',
  3: 'ASA III - Penyakit sistemik berat',
  4: 'ASA IV - Mengancam jiwa',
  5: 'ASA V - Moribund'
};

const AUDIT_ACTION_LABELS = {
  created: 'Dibuat',
  updated: 'Diubah',
  status_changed: 'Status berubah'
};

export default function SurgeryDetail({ id }) {
  const [surgery, setSurgery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showActions, setShowActions] = useState(false);
  const [showPostOpForm, setShowPostOpForm] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [checklist, setChecklist] = useState(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [showOutcome, setShowOutcome] = useState(false);
  const [outcomeForm, setOutcomeForm] = useState(null);
  const [savingOutcome, setSavingOutcome] = useState(false);
  const perms = getRolePermissions(userRole.value);

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

  async function loadAuditLog() {
    try {
      const data = await api.getSurgeryAuditLog(id);
      setAuditLog(data.entries || []);
      setShowAudit(true);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    }
  }

  async function loadChecklist() {
    try {
      const data = await api.getChecklist(id);
      setChecklist(data.checklist);
      setShowChecklist(true);
    } catch (err) {
      console.error('Failed to load checklist:', err);
    }
  }

  async function toggleChecklistItem(key) {
    if (!checklist) return;
    const updated = checklist.items.map(item =>
      item.key === key ? { ...item, checked: !item.checked, checked_at: !item.checked ? new Date().toISOString() : null } : item
    );
    try {
      const data = await api.updateChecklist(id, updated);
      setChecklist(data.checklist);
    } catch (err) {
      console.error('Checklist update failed:', err);
    }
  }

  async function loadOutcome() {
    try {
      const data = await api.getOutcome(id);
      setOutcome(data.outcome);
      setOutcomeForm(data.outcome || {
        complication_grade: 'none', wound_class: '', estimated_blood_loss: '',
        actual_duration_min: '', disposition: '', readmission: false,
        readmission_reason: '', follow_up_date: '', follow_up_notes: '', notes: ''
      });
      setShowOutcome(true);
    } catch (err) {
      console.error('Failed to load outcome:', err);
    }
  }

  async function handleSaveOutcome(e) {
    e.preventDefault();
    setSavingOutcome(true);
    try {
      const data = await api.saveOutcome(id, outcomeForm);
      setOutcome(data.outcome);
      setOutcomeForm(data.outcome);
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message);
    }
    setSavingOutcome(false);
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
  const operationDisplayName = s.op_display_name || s.operation_type_other || s.op_name_id || s.op_name;
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
          {perms.canEditSurgery && (
            <button class="btn-icon" onClick={() => route(`/docboard/surgery/edit/${id}`)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
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
          {perms.canChangeStatus && s.status === 'planned' && <button onClick={() => updateStatus('confirmed')}>Konfirmasi</button>}
          {perms.canChangeStatus && (s.status === 'planned' || s.status === 'confirmed') && <button onClick={() => updateStatus('in_progress')}>Mulai Operasi</button>}
          {perms.canChangeStatus && s.status === 'in_progress' && <button onClick={() => updateStatus('completed')}>Selesai</button>}
          {perms.canChangeStatus && s.status !== 'cancelled' && s.status !== 'completed' && (
            <>
              <button onClick={() => updateStatus('postponed')}>Tunda</button>
              <button onClick={() => updateStatus('cancelled')} class="text-danger">Batalkan</button>
            </>
          )}
          {perms.canDeleteSurgery && <button onClick={handleDelete} class="text-danger">Hapus</button>}
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
          {operationDisplayName}
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

      {/* Anesthesia */}
      {(s.anesthesia_type || s.asa_score || s.npo_status) && (
        <div class="detail-card">
          <div class="detail-label">Anestesi</div>
          <div class="detail-anesthesia">
            {s.anesthesia_type && (
              <div class="anesthesia-item">
                <span class="anesthesia-key">Jenis:</span> {s.anesthesia_type}
              </div>
            )}
            {s.asa_score && (
              <div class="anesthesia-item">
                <span class="anesthesia-key">ASA:</span> {ASA_LABELS[s.asa_score] || `ASA ${s.asa_score}`}
              </div>
            )}
            {s.npo_status && (
              <div class="anesthesia-item">
                <span class="anesthesia-key">NPO:</span> {s.npo_status}
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Pre-op Checklist */}
      {s.status !== 'completed' && s.status !== 'cancelled' && (
        <div class="detail-card">
          {!showChecklist ? (
            <button class="btn-text" onClick={loadChecklist} style="width:100%;text-align:center;padding:8px 0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px">
                <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Checklist Pre-Op
            </button>
          ) : checklist ? (
            <>
              <div class="detail-label">Checklist Pre-Op</div>
              <div class="checklist-items">
                {checklist.items.map(item => (
                  <label key={item.key} class={`checklist-item ${item.checked ? 'checked' : ''}`}>
                    <input type="checkbox" checked={item.checked} onChange={() => toggleChecklistItem(item.key)} />
                    <span class="checklist-label">{item.label}</span>
                  </label>
                ))}
              </div>
              <div class="checklist-progress">
                {checklist.items.filter(i => i.checked).length}/{checklist.items.length} selesai
              </div>
            </>
          ) : null}
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

      {/* Post-Op Notes Section */}
      {(s.status === 'in_progress' || s.status === 'completed') && (
        showPostOpForm ? (
          <PostOpNotesForm
            surgeryId={id}
            existingNotes={s.post_op_notes}
            onSaved={() => {
              setShowPostOpForm(false);
              loadSurgery();
            }}
            onCancel={() => setShowPostOpForm(false)}
          />
        ) : s.post_op_notes ? (
          <div class="detail-card">
            <div class="postop-header">
              <div class="detail-label" style="margin-bottom:0">Catatan Post-Op</div>
              <button class="btn-postop-edit" onClick={() => setShowPostOpForm(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
              </button>
            </div>
            {renderPostOpNotes(s.post_op_notes)}
          </div>
        ) : (
          <div class="detail-card">
            <button class="btn-add-postop" onClick={() => setShowPostOpForm(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Tambah Catatan Post-Op
            </button>
          </div>
        )
      )}

      {/* Post-Op Outcome */}
      {s.status === 'completed' && (
        <div class="detail-card">
          {!showOutcome ? (
            <button class="btn-text" onClick={loadOutcome} style="width:100%;text-align:center;padding:8px 0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              Outcome Operasi
            </button>
          ) : outcomeForm ? (
            <>
              <div class="detail-label">Outcome Operasi</div>
              {perms.canEditOutcome ? (
                <form onSubmit={handleSaveOutcome} class="outcome-form">
                  <div class="form-group">
                    <label>Komplikasi (Clavien-Dindo)</label>
                    <select value={outcomeForm.complication_grade || 'none'} onChange={e => setOutcomeForm(f => ({ ...f, complication_grade: e.target.value }))}>
                      {Object.entries(COMPLICATION_GRADES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div class="form-row">
                    <div class="form-group">
                      <label>Wound Class</label>
                      <select value={outcomeForm.wound_class || ''} onChange={e => setOutcomeForm(f => ({ ...f, wound_class: e.target.value }))}>
                        <option value="">--</option>
                        {Object.entries(WOUND_CLASSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div class="form-group">
                      <label>Perdarahan (ml)</label>
                      <input type="number" value={outcomeForm.estimated_blood_loss || ''} onInput={e => setOutcomeForm(f => ({ ...f, estimated_blood_loss: e.target.value }))} />
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="form-group">
                      <label>Durasi Aktual (menit)</label>
                      <input type="number" value={outcomeForm.actual_duration_min || ''} onInput={e => setOutcomeForm(f => ({ ...f, actual_duration_min: e.target.value }))} />
                    </div>
                    <div class="form-group">
                      <label>Disposisi</label>
                      <select value={outcomeForm.disposition || ''} onChange={e => setOutcomeForm(f => ({ ...f, disposition: e.target.value }))}>
                        <option value="">--</option>
                        <option value="ward">Ruang Rawat</option>
                        <option value="icu">ICU</option>
                        <option value="discharge">Pulang</option>
                        <option value="transfer">Transfer</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Follow-up</label>
                    <input type="date" value={outcomeForm.follow_up_date || ''} onInput={e => setOutcomeForm(f => ({ ...f, follow_up_date: e.target.value }))} />
                  </div>
                  <div class="form-group">
                    <label>Catatan</label>
                    <textarea rows="2" value={outcomeForm.notes || ''} onInput={e => setOutcomeForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <button type="submit" class="btn-primary btn-full" disabled={savingOutcome}>
                    {savingOutcome ? 'Menyimpan...' : 'Simpan Outcome'}
                  </button>
                </form>
              ) : outcome ? (
                <div class="outcome-display">
                  <div class="outcome-row"><span class="outcome-key">Komplikasi:</span> <span style={{ color: (COMPLICATION_GRADES[outcome.complication_grade] || {}).color }}>{(COMPLICATION_GRADES[outcome.complication_grade] || {}).label || outcome.complication_grade}</span></div>
                  {outcome.wound_class && <div class="outcome-row"><span class="outcome-key">Wound Class:</span> {WOUND_CLASSES[outcome.wound_class] || outcome.wound_class}</div>}
                  {outcome.estimated_blood_loss && <div class="outcome-row"><span class="outcome-key">Perdarahan:</span> {outcome.estimated_blood_loss} ml</div>}
                  {outcome.actual_duration_min && <div class="outcome-row"><span class="outcome-key">Durasi:</span> {outcome.actual_duration_min} menit</div>}
                  {outcome.disposition && <div class="outcome-row"><span class="outcome-key">Disposisi:</span> {outcome.disposition}</div>}
                  {outcome.follow_up_date && <div class="outcome-row"><span class="outcome-key">Follow-up:</span> {outcome.follow_up_date}</div>}
                  {outcome.notes && <div class="outcome-row"><span class="outcome-key">Catatan:</span> {outcome.notes}</div>}
                </div>
              ) : (
                <div class="detail-text" style="color:var(--text-muted)">Belum ada data outcome</div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Audit Log */}
      <div class="detail-card">
        {!showAudit ? (
          <button class="btn-text" onClick={loadAuditLog} style="width:100%;text-align:center;padding:8px 0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px">
              <circle cx="12" cy="12" r="10" /><polyline points="12,6 12,12 16,14" />
            </svg>
            Riwayat Perubahan
          </button>
        ) : (
          <>
            <div class="detail-label">Riwayat Perubahan</div>
            {auditLog.length === 0 ? (
              <div class="detail-text" style="color:var(--text-muted)">Belum ada riwayat</div>
            ) : (
              <div class="audit-timeline">
                {auditLog.map(entry => {
                  const d = new Date(entry.created_at);
                  const timeStr = d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                  const changes = entry.changes || {};
                  let detail = '';
                  if (entry.action === 'status_changed' && changes.status) {
                    const st = SURGERY_STATUS[changes.status];
                    detail = st ? st.label : changes.status;
                    if (changes.reason) detail += ` — ${changes.reason}`;
                  } else if (entry.action === 'updated') {
                    detail = Object.keys(changes).join(', ');
                  }
                  return (
                    <div key={entry.id} class="audit-entry">
                      <div class="audit-dot" />
                      <div class="audit-content">
                        <div class="audit-action">{AUDIT_ACTION_LABELS[entry.action] || entry.action}</div>
                        {detail && <div class="audit-detail">{detail}</div>}
                        <div class="audit-meta">{timeStr}{entry.user_id ? ` • ${entry.user_id}` : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function renderPostOpNotes(notes) {
  let parsed = notes;
  if (typeof notes === 'string') {
    try { parsed = JSON.parse(notes); } catch { return <div class="detail-text">{notes}</div>; }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return <div class="detail-text">{String(notes)}</div>;
  }

  const komplikasiLabels = { tidak_ada: 'Tidak Ada', minor: 'Minor', mayor: 'Mayor' };

  return (
    <div class="postop-notes-display">
      {parsed.prosedur && (
        <div class="postop-field">
          <div class="postop-field-label">Prosedur</div>
          <div class="postop-field-value">{parsed.prosedur}</div>
        </div>
      )}
      {parsed.temuan && (
        <div class="postop-field">
          <div class="postop-field-label">Temuan Operasi</div>
          <div class="postop-field-value">{parsed.temuan}</div>
        </div>
      )}
      <div class="postop-field">
        <div class="postop-field-label">Komplikasi</div>
        <div class="postop-field-value">
          <span class={`komplikasi-badge komplikasi-${parsed.komplikasi || 'tidak_ada'}`}>
            {komplikasiLabels[parsed.komplikasi] || 'Tidak Ada'}
          </span>
          {parsed.komplikasi_detail && (
            <span class="komplikasi-detail"> - {parsed.komplikasi_detail}</span>
          )}
        </div>
      </div>
      {(parsed.estimasi_perdarahan || parsed.durasi_operasi) && (
        <div class="postop-metrics">
          {parsed.estimasi_perdarahan && (
            <div class="postop-metric">
              <div class="postop-metric-value">{parsed.estimasi_perdarahan}</div>
              <div class="postop-metric-label">ml perdarahan</div>
            </div>
          )}
          {parsed.durasi_operasi && (
            <div class="postop-metric">
              <div class="postop-metric-value">{parsed.durasi_operasi}</div>
              <div class="postop-metric-label">menit durasi</div>
            </div>
          )}
        </div>
      )}
      {parsed.catatan_tambahan && (
        <div class="postop-field">
          <div class="postop-field-label">Catatan Tambahan</div>
          <div class="postop-field-value postop-extra-notes">{parsed.catatan_tambahan}</div>
        </div>
      )}
    </div>
  );
}
