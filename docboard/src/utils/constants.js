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

export const API_BASE = '/api/docboard';
