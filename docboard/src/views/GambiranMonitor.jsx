import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';

const DEFAULT_ROOMS = ['Kirana', 'Joyoboyo', 'Tegowangi'];

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function cpptSummary(cppt) {
  if (!cppt) return null;
  return `${cppt.doctor_name || 'Dokter'} - ${formatDateTime(cppt.created_at)}`;
}

function OperationBlock({ operation }) {
  if (!operation) {
    return (
      <div class="monitor-operation monitor-operation-empty">
        <span>Operasi</span>
        <strong>Belum ada tindakan terkait</strong>
      </div>
    );
  }

  const dateText = [
    formatDate(operation.operation_date || operation.surgery_date || operation.date),
    operation.operation_time || operation.surgery_time || operation.time,
  ].filter(Boolean).join(' ');

  return (
    <div class="monitor-operation">
      <span>Operasi</span>
      <strong>{operation.operation_name || operation.procedure_name || operation.name || 'Tindakan operasi'}</strong>
      <small>{dateText || '-'}{operation.status ? `, ${operation.status}` : ''}</small>
    </div>
  );
}

function PatientCard({ patient }) {
  const cppt = patient.cppt || {};

  return (
    <article class="monitor-patient-card">
      <div class="monitor-patient-head">
        <div>
          <h2>{patient.patient_name || '-'}</h2>
          <div class="monitor-patient-meta">
            <span>MR {patient.mr_id || '-'}</span>
            <span>{patient.case_id || '-'}</span>
          </div>
        </div>
        <div class="monitor-room-chip">
          <strong>{patient.room || '-'}</strong>
          <span>{patient.bed || '-'}</span>
        </div>
      </div>

      <div class="monitor-time-row">
        <span>MRS</span>
        <strong>{formatDateTime(patient.admission_at)}</strong>
      </div>

      <div class="monitor-cppt-grid">
        <section>
          <div class="monitor-section-title">Diagnosis</div>
          <p>{cppt.diagnosis || '-'}</p>
        </section>
        <section>
          <div class="monitor-section-title">Planning</div>
          <p>{cppt.planning || '-'}</p>
        </section>
      </div>

      <div class="monitor-foot">
        <div class="monitor-cppt-author">
          <span>CPPT dokter</span>
          <strong>{cpptSummary(cppt) || '-'}</strong>
        </div>
        <OperationBlock operation={patient.operation} />
      </div>
    </article>
  );
}

export default function GambiranMonitor() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadMonitor() {
    setLoading(true);
    setError('');
    try {
      const result = await api.getGambiranMonitor({
        windowHours: 24,
        rooms: DEFAULT_ROOMS.join(','),
      });
      setData(result);
    } catch (err) {
      setError(err.message || 'Gagal memuat monitor pasien');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMonitor();
  }, []);

  const patients = data?.patients || [];
  const rooms = data?.rooms || DEFAULT_ROOMS;
  const warnings = data?.warnings || [];

  return (
    <div class="view-gambiran-monitor">
      <div class="monitor-header">
        <button class="btn-back" onClick={() => route('/docboard/settings')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <div>
          <h1>Monitor Pasien</h1>
          <p>Admission 24 jam, {rooms.join(', ')}</p>
        </div>
        <button class="monitor-refresh-btn" onClick={loadMonitor} disabled={loading} title="Refresh">
          <svg class={loading ? 'spinning' : ''} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23,4 23,10 17,10" />
            <polyline points="1,20 1,14 7,14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      <div class="monitor-summary-row">
        <div>
          <span>Pasien baru</span>
          <strong>{patients.length}</strong>
        </div>
        <div>
          <span>Window</span>
          <strong>{data?.window_hours || 24} jam</strong>
        </div>
        <div>
          <span>Cache</span>
          <strong>{formatDateTime(data?.cached_at)}</strong>
        </div>
      </div>

      {warnings.length > 0 && (
        <div class="monitor-warning">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}

      {error && (
        <div class="monitor-state">
          <strong>Gagal memuat data</strong>
          <p>{error}</p>
          <button class="btn-secondary" onClick={loadMonitor}>Coba Lagi</button>
        </div>
      )}

      {!error && loading && (
        <div class="monitor-state">
          <div class="spinner" />
          <p>Memuat cache pasien Gambiran...</p>
        </div>
      )}

      {!error && !loading && patients.length === 0 && (
        <div class="monitor-state">
          <strong>Tidak ada pasien baru</strong>
          <p>Belum ada admission 24 jam terakhir di ruangan target.</p>
        </div>
      )}

      {!error && !loading && patients.length > 0 && (
        <div class="monitor-patient-list">
          {patients.map((patient) => (
            <PatientCard key={patient.case_id || `${patient.mr_id}-${patient.admission_at}`} patient={patient} />
          ))}
        </div>
      )}
    </div>
  );
}
