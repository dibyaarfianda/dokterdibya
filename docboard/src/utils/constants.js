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

export const API_BASE = '/api/docboard';
