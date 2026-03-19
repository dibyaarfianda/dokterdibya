export const LOCATIONS = {
  klinik_private: {
    name: 'Klinik Privat',
    shortName: 'Klinik',
    color: '#3B82F6',
    colorLight: '#DBEAFE',
    icon: 'clinic'
  },
  rsia_melinda: {
    name: 'RSIA Melinda',
    shortName: 'Melinda',
    color: '#EC4899',
    colorLight: '#FCE7F3',
    icon: 'hospital'
  },
  rsud_gambiran: {
    name: 'RSUD Gambiran',
    shortName: 'Gambiran',
    color: '#06B6D4',
    colorLight: '#CFFAFE',
    icon: 'hospital'
  },
  rs_bhayangkara: {
    name: 'RS Bhayangkara',
    shortName: 'Bhayangkara',
    color: '#22C55E',
    colorLight: '#DCFCE7',
    icon: 'hospital'
  }
};

export const LOCATION_KEYS = Object.keys(LOCATIONS);

export const SYNC_STATUS = {
  synced: { label: 'Synced', color: '#22C55E' },
  pending: { label: 'Pending', color: '#F59E0B' },
  failed: { label: 'Gagal', color: '#EF4444' },
  stale: { label: 'Kadaluarsa', color: '#94A3B8' }
};

export const VISIT_STATUS = {
  scheduled: { label: 'Terjadwal', color: '#3B82F6' },
  waiting: { label: 'Menunggu', color: '#F59E0B' },
  in_progress: { label: 'Periksa', color: '#8B5CF6' },
  completed: { label: 'Selesai', color: '#22C55E' },
  cancelled: { label: 'Batal', color: '#EF4444' },
  no_show: { label: 'Tidak Hadir', color: '#94A3B8' }
};

export const SURGERY_STATUS = {
  planned: { label: 'Rencana', color: '#F59E0B', bg: '#FEF3C7' },
  confirmed: { label: 'Konfirmasi', color: '#3B82F6', bg: '#DBEAFE' },
  in_progress: { label: 'Berlangsung', color: '#8B5CF6', bg: '#EDE9FE' },
  completed: { label: 'Selesai', color: '#22C55E', bg: '#DCFCE7' },
  cancelled: { label: 'Batal', color: '#EF4444', bg: '#FEE2E2' },
  postponed: { label: 'Ditunda', color: '#94A3B8', bg: '#F1F5F9' }
};

export const OP_CATEGORY = {
  obstetri: { label: 'Obstetri', color: '#EC4899' },
  ginekologi: { label: 'Ginekologi', color: '#3B82F6' },
  onkologi_ginekologi: { label: 'Onkologi', color: '#EF4444' }
};

// DocBoard role permissions
// dokter = full access, admin = secretary (scheduling), bidan = anesthesiologist view
export const ROLE_PERMISSIONS = {
  dokter: {
    canCreateSurgery: true, canEditSurgery: true, canDeleteSurgery: true,
    canChangeStatus: true, canEditClinical: true, canEditAnesthesia: true,
    canEditOutcome: true, canViewORBoard: true, canEditChecklist: true
  },
  admin: {
    canCreateSurgery: true, canEditSurgery: true, canDeleteSurgery: false,
    canChangeStatus: true, canEditClinical: false, canEditAnesthesia: false,
    canEditOutcome: false, canViewORBoard: true, canEditChecklist: true
  },
  bidan: {
    canCreateSurgery: false, canEditSurgery: false, canDeleteSurgery: false,
    canChangeStatus: false, canEditClinical: false, canEditAnesthesia: true,
    canEditOutcome: false, canViewORBoard: true, canEditChecklist: true
  }
};

export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.bidan;
}

// Outcome constants
export const COMPLICATION_GRADES = {
  none: { label: 'Tidak Ada', color: '#22C55E' },
  grade_1: { label: 'Grade I', color: '#F59E0B' },
  grade_2: { label: 'Grade II', color: '#F59E0B' },
  grade_3a: { label: 'Grade IIIa', color: '#EF4444' },
  grade_3b: { label: 'Grade IIIb', color: '#EF4444' },
  grade_4a: { label: 'Grade IVa', color: '#DC2626' },
  grade_4b: { label: 'Grade IVb', color: '#DC2626' },
  grade_5: { label: 'Grade V (Mortalitas)', color: '#7F1D1D' }
};

export const WOUND_CLASSES = {
  clean: 'Clean', clean_contaminated: 'Clean-Contaminated',
  contaminated: 'Contaminated', dirty: 'Dirty/Infected'
};

export const API_BASE = '/api/docboard';
