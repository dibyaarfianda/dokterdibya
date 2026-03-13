import { VISIT_STATUS } from '../utils/constants';
import { formatTime } from '../utils/date';

export default function PatientCard({ patient, index, locationColor }) {
  const status = VISIT_STATUS[patient.visit_status] || VISIT_STATUS.scheduled;

  return (
    <div class="patient-card">
      <div class="patient-number" style={{ backgroundColor: locationColor || '#3B82F6' }}>
        {index + 1}
      </div>
      <div class="patient-info">
        <div class="patient-name">{patient.patient_name}</div>
        <div class="patient-meta">
          {patient.slot_time && <span>{formatTime(patient.slot_time)}</span>}
          {patient.chief_complaint && (
            <>
              <span class="meta-dot" />
              <span class="patient-complaint">{patient.chief_complaint}</span>
            </>
          )}
        </div>
      </div>
      <div class="patient-status" style={{ color: status.color }}>
        {patient.visit_status === 'completed' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20,6 9,17 4,12" />
          </svg>
        ) : (
          <span class="status-dot" style={{ backgroundColor: status.color }} />
        )}
      </div>
    </div>
  );
}
