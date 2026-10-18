import { surgeryRefreshFailed, surgeryRefreshPending, surgeryScheduleRevision } from '../stores/schedule';

export default function SurgeryRefreshWarning() {
  if (!surgeryRefreshFailed.value) return null;
  return (
    <div class="form-error" role="status">
      Jadwal operasi belum diperbarui. Data sebelumnya masih ditampilkan.{' '}
      <button type="button" class="btn-text" disabled={surgeryRefreshPending.value} onClick={() => { surgeryScheduleRevision.value += 1; }}>
        {surgeryRefreshPending.value ? 'Memuat...' : 'Coba lagi'}
      </button>
    </div>
  );
}
