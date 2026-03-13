import { useEffect, useState } from 'preact/hooks';
import PatientCard from '../components/PatientCard';
import { SkeletonList } from '../components/SkeletonLoader';
import { api } from '../services/api';
import { LOCATIONS } from '../utils/constants';
import { formatDateDisplay, today } from '../utils/date';

export default function Patients() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadToday();
  }, []);

  async function loadToday() {
    if (!loading) setRefreshing(true);
    try {
      const result = await api.getToday();
      setData(result);
    } catch (err) {
      console.error('Failed to load today:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const totalPatients = data?.locations?.reduce((sum, l) => sum + (l.patients?.length || 0), 0) || 0;

  return (
    <div class="view-patients">
      <div class="page-header">
        <div>
          <h1 class="page-title">Pasien Hari Ini</h1>
          <p class="page-subtitle">{formatDateDisplay(today())}</p>
        </div>
        <div class="patient-total">
          <span class="total-number">{totalPatients}</span>
          <span class="total-label">total</span>
        </div>
      </div>

      {/* Pull to refresh button */}
      <button
        class={`refresh-btn ${refreshing ? 'refreshing' : ''}`}
        onClick={loadToday}
        disabled={refreshing}
      >
        <svg
          class={refreshing ? 'spinning' : ''}
          width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2"
        >
          <polyline points="23,4 23,10 17,10" />
          <polyline points="1,20 1,14 7,14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        {refreshing ? 'Memperbarui...' : 'Refresh'}
      </button>

      {loading ? (
        <SkeletonList count={5} />
      ) : data?.locations?.length > 0 ? (
        data.locations.map(loc => {
          const locInfo = LOCATIONS[loc.location] || {};
          if (!loc.patients || loc.patients.length === 0) return null;
          return (
            <div key={loc.location} class="patient-group">
              <div class="patient-group-header">
                <span class="location-dot" style={{ backgroundColor: locInfo.color }} />
                <span class="patient-group-name">{locInfo.name}</span>
                <span class="patient-group-count">{loc.patients.length}</span>
              </div>
              {loc.patients.map((p, i) => (
                <PatientCard
                  key={p.id || i}
                  patient={p}
                  index={i}
                  locationColor={locInfo.color}
                />
              ))}
            </div>
          );
        })
      ) : (
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          <p>Belum ada pasien hari ini</p>
        </div>
      )}
    </div>
  );
}
