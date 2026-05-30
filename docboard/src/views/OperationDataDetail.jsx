import { useEffect, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { LOCATIONS } from '../utils/constants';

function facilityLocation(facility) {
  if (facility === 'melinda') return LOCATIONS.rsia_melinda;
  if (facility === 'gambiran') return LOCATIONS.rsud_gambiran;
  if (facility === 'bhayangkara') return LOCATIONS.rs_bhayangkara;
  return null;
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
      return obj[key];
    }
  }
  return null;
}

function reportPayload(payload) {
  return payload?.report || payload?.operation_report || payload?.raw_report || payload?.operation || payload || {};
}

function Field({ label, value, pre = false }) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return (
    <div class="operation-detail-field">
      <div class="operation-detail-label">{label}</div>
      <div class={`operation-detail-value ${pre ? 'pre' : ''}`}>{String(value)}</div>
    </div>
  );
}

function Section({ title, children }) {
  const visible = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  if (!visible) return null;
  return (
    <div class="detail-card operation-detail-card">
      <div class="detail-label">{title}</div>
      <div class="operation-detail-fields">{children}</div>
    </div>
  );
}

export default function OperationDataDetail({ id }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDetail();
  }, [id]);

  async function loadDetail() {
    setLoading(true);
    try {
      const result = await api.getOperationDataDetail(id);
      setData(result);
    } catch (err) {
      console.error('Failed to load operation data detail:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div class="loading-state"><div class="spinner" /></div>;
  if (!data?.record) return <div class="empty-state"><p>Data operasi tidak ditemukan</p></div>;

  const record = data.record;
  const payload = data.payload || {};
  const report = reportPayload(payload);
  const loc = facilityLocation(record.facility);
  const date = record.operation_date ? new Date(record.operation_date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-';
  const time = record.operation_time ? String(record.operation_time).slice(0, 5) : '--:--';

  return (
    <div class="view-operation-detail">
      <div class="detail-header" style={{ borderBottomColor: loc?.color || '#3B82F6' }}>
        <button class="btn-back" onClick={() => route('/docboard/data')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
      </div>

      <div class="detail-card">
        <div class="detail-patient-header">
          <div>
            <h2 class="detail-patient-name">{record.patient_name}</h2>
            <span class="detail-patient-age">{record.mr_id ? `MR ${record.mr_id}` : 'Data Operasi'}</span>
          </div>
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-label">Jadwal dan Lokasi</div>
        <div class="detail-schedule">
          <div class="detail-schedule-date">{date}</div>
          <div class="detail-schedule-time">Jam {time}</div>
          <div class="detail-schedule-loc" style={{ color: loc?.color || '#64748B' }}>
            <span class="loc-dot" style={{ backgroundColor: loc?.color || '#94A3B8' }} />
            {loc?.name || record.facility}
          </div>
        </div>
      </div>

      <Section title="Tindakan">
        <Field label="Jenis/Tindakan Operasi" value={record.operation_name || pick(report, ['tindakanOperasi', 'operationName', 'namaOperasi'])} />
        <Field label="Status" value={record.status || pick(report, ['statusPasien', 'status'])} />
      </Section>

      <Section title="Diagnosis">
        <Field label="Diagnosis Awal" value={pick(report, ['diagnosaAwal', 'diagnosisPraOperasi', 'diag_awal']) || record.diagnosis} pre />
        <Field label="Diagnosis Akhir" value={pick(report, ['diagnosaAkhir', 'diagnosisPascaOperasi', 'diag_akhir'])} pre />
      </Section>

      <Section title="Anestesi dan Durasi">
        <Field label="Macam Anestesi" value={pick(report, ['macamAnestesi', 'anesthesia_type', 'jenisAnestesi'])} />
        <Field label="Waktu Mulai" value={pick(report, ['waktuMulai', 'waktu_mulai'])} />
        <Field label="Waktu Selesai" value={pick(report, ['waktuSelesai', 'waktu_selesai'])} />
        <Field label="Durasi Anestesi/Operasi" value={pick(report, ['durasiAnestesi', 'lamaOperasi', 'actual_duration_min'])} />
        <Field label="Perdarahan" value={pick(report, ['pendarahanCc', 'jumlahPerdarahan', 'estimated_blood_loss'])} />
      </Section>

      <Section title="Detail Operasi">
        <Field label="Persiapan" value={pick(report, ['persiapan'])} pre />
        <Field label="Posisi" value={pick(report, ['posisi'])} />
        <Field label="Disinfektan" value={pick(report, ['disinfektan'])} />
        <Field label="Insisi" value={pick(report, ['insisi'])} />
        <Field label="Temuan Operasi" value={pick(report, ['temuanOperasi', 'temuan'])} pre />
        <Field label="Narasi Operasi" value={pick(report, ['narasiOperasi', 'narasi'])} pre />
        <Field label="Tindakan Operasi" value={pick(report, ['tindakanOperasi', 'tindakan'])} pre />
      </Section>

      <Section title="Instruksi dan Pemeriksaan">
        <Field label="Advice" value={pick(report, ['advice'])} pre />
        <Field label="Instruksi Pasca Operasi" value={pick(report, ['instruksiPascaOperasi'])} pre />
        <Field label="Pemeriksaan PA" value={pick(report, ['pemeriksaanPa'])} />
      </Section>
    </div>
  );
}
