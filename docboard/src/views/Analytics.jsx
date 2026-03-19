import { useState, useEffect } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { LOCATIONS, SURGERY_STATUS } from '../utils/constants';
import { getMonthName } from '../utils/date';

const PERIODS = [
  { key: '30d', label: '30 Hari' },
  { key: '3m', label: '3 Bulan' },
  { key: '6m', label: '6 Bulan' },
  { key: '1y', label: '1 Tahun' }
];

export default function Analytics() {
  const [period, setPeriod] = useState('3m');
  const [tab, setTab] = useState('surgery');
  const [data, setData] = useState(null);
  const [clinicData, setClinicData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { loadAnalytics(); }, [period, tab]);

  async function loadAnalytics() {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'surgery') {
        const res = await api.getSurgeryAnalytics({ period });
        setData(res.analytics);
      } else {
        const res = await api.getClinicAnalytics({ period });
        setClinicData(res.analytics);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="view-analytics">
      <div class="view-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button class="btn-back" onClick={() => route('/docboard/settings')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </button>
          <h1>Statistik</h1>
        </div>
      </div>

      {/* Tab toggle */}
      <div class="analytics-tabs">
        <button class={`analytics-tab ${tab === 'surgery' ? 'active' : ''}`} onClick={() => setTab('surgery')}>Operasi</button>
        <button class={`analytics-tab ${tab === 'clinic' ? 'active' : ''}`} onClick={() => setTab('clinic')}>Klinik</button>
      </div>

      {/* Period selector */}
      <div class="analytics-periods">
        {PERIODS.map(p => (
          <button
            key={p.key}
            class={`period-btn ${period === p.key ? 'active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div class="loading-state">
          <div class="spinner" />
        </div>
      ) : error ? (
        <div class="error-state">
          <p>{error}</p>
          <button class="btn-secondary" onClick={loadAnalytics}>Coba Lagi</button>
        </div>
      ) : tab === 'surgery' && data ? (
        <div class="analytics-content">
          {/* Summary Cards */}
          <div class="analytics-summary">
            <SummaryCard
              label="Total Operasi"
              value={data.total}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M3 10h18" /><path d="M8 2v4" /><path d="M16 2v4" />
                </svg>
              }
            />
            <SummaryCard
              label="Tingkat Selesai"
              value={`${data.completionRate}%`}
              color="#22C55E"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22,4 12,14.01 9,11.01" />
                </svg>
              }
            />
            <SummaryCard
              label="Terbanyak"
              value={data.topOperation}
              small
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2">
                  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                </svg>
              }
            />
            <SummaryCard
              label="Rata-rata/Bulan"
              value={data.avgPerMonth}
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              }
            />
          </div>

          {/* Monthly Bar Chart */}
          {data.byMonth.length > 0 && (
            <div class="analytics-card">
              <h3 class="analytics-card-title">Operasi per Bulan</h3>
              <MonthlyChart data={data.byMonth} />
            </div>
          )}

          {/* Operation Type Breakdown */}
          {data.byOperationType.length > 0 && (
            <div class="analytics-card">
              <h3 class="analytics-card-title">Jenis Operasi</h3>
              <HorizontalBars
                items={data.byOperationType.map(item => ({
                  label: item.name,
                  value: item.count,
                  color: '#3B82F6'
                }))}
              />
            </div>
          )}

          {/* Location Distribution */}
          {data.byLocation.length > 0 && (
            <div class="analytics-card">
              <h3 class="analytics-card-title">Distribusi Lokasi</h3>
              <HorizontalBars
                items={data.byLocation.map(item => {
                  const loc = LOCATIONS[item.location];
                  return {
                    label: loc ? loc.name : item.location,
                    value: item.count,
                    color: loc ? loc.color : '#94A3B8'
                  };
                })}
              />
            </div>
          )}

          {/* Status Breakdown */}
          {data.byStatus.length > 0 && (
            <div class="analytics-card">
              <h3 class="analytics-card-title">Status Operasi</h3>
              <HorizontalBars
                items={data.byStatus.map(item => {
                  const st = SURGERY_STATUS[item.status];
                  return {
                    label: st ? st.label : item.status,
                    value: item.count,
                    color: st ? st.color : '#94A3B8'
                  };
                })}
              />
            </div>
          )}

          {/* Rate cards */}
          <div class="analytics-rates">
            <RateCard label="Selesai" value={data.completionRate} color="#22C55E" />
            <RateCard label="Batal" value={data.cancelRate} color="#EF4444" />
            <RateCard label="Ditunda" value={data.postponeRate} color="#94A3B8" />
          </div>
        </div>
      ) : tab === 'clinic' && clinicData ? (
        <div class="analytics-content">
          <div class="analytics-summary">
            <SummaryCard label="Total Pasien" value={clinicData.totalPatients}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
            />
            <SummaryCard label="Selesai" value={`${clinicData.completionRate}%`} color="#22C55E"
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22,4 12,14.01 9,11.01" /></svg>}
            />
            <SummaryCard label="Rata-rata/Hari" value={clinicData.avgPerDay}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>}
            />
            <SummaryCard label="Hari Aktif" value={clinicData.activeDays}
              icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /><path d="M8 2v4" /><path d="M16 2v4" /></svg>}
            />
          </div>

          {clinicData.byMonth.length > 0 && (
            <div class="analytics-card">
              <h3 class="analytics-card-title">Pasien per Bulan</h3>
              <MonthlyChart data={clinicData.byMonth} />
            </div>
          )}

          {clinicData.byLocation.length > 0 && (
            <div class="analytics-card">
              <h3 class="analytics-card-title">Distribusi Lokasi</h3>
              <HorizontalBars
                items={clinicData.byLocation.map(item => {
                  const loc = LOCATIONS[item.location];
                  return { label: loc ? loc.name : item.location, value: item.count, color: loc ? loc.color : '#94A3B8' };
                })}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value, color, icon, small }) {
  return (
    <div class="summary-card">
      <div class="summary-card-icon">{icon}</div>
      <div class="summary-card-body">
        <div class="summary-card-label">{label}</div>
        <div
          class={`summary-card-value ${small ? 'small' : ''}`}
          style={color ? { color } : {}}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function MonthlyChart({ data }) {
  if (!data || data.length === 0) return null;

  const maxCount = Math.max(...data.map(d => d.count), 1);
  const barColors = ['#3B82F6', '#06B6D4', '#8B5CF6', '#EC4899', '#22C55E', '#F59E0B',
    '#3B82F6', '#06B6D4', '#8B5CF6', '#EC4899', '#22C55E', '#F59E0B'];

  const chartHeight = 140;
  const barWidth = Math.min(32, Math.floor(260 / data.length));
  const gap = Math.min(8, Math.floor(40 / data.length));
  const totalWidth = data.length * (barWidth + gap) - gap;

  return (
    <div class="monthly-chart">
      <svg
        width="100%"
        viewBox={`0 0 ${totalWidth + 20} ${chartHeight + 30}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {data.map((item, i) => {
          const barHeight = Math.max(4, (item.count / maxCount) * chartHeight);
          const x = 10 + i * (barWidth + gap);
          const y = chartHeight - barHeight;
          const colorIdx = (item.month - 1) % 12;
          const monthLabel = getMonthName(item.month - 1, false);

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="4"
                fill={barColors[colorIdx]}
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                text-anchor="middle"
                fill="var(--text-secondary)"
                font-size="11"
                font-weight="600"
              >
                {item.count}
              </text>
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                text-anchor="middle"
                fill="var(--text-tertiary)"
                font-size="10"
              >
                {monthLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HorizontalBars({ items }) {
  if (!items || items.length === 0) return null;

  const maxVal = Math.max(...items.map(i => i.value), 1);

  return (
    <div class="h-bars">
      {items.map((item, i) => {
        const pct = Math.max(4, (item.value / maxVal) * 100);
        return (
          <div key={i} class="h-bar-row">
            <div class="h-bar-label">{item.label}</div>
            <div class="h-bar-track">
              <div
                class="h-bar-fill"
                style={{ width: `${pct}%`, backgroundColor: item.color }}
              />
            </div>
            <div class="h-bar-value">{item.value}</div>
          </div>
        );
      })}
    </div>
  );
}

function RateCard({ label, value, color }) {
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div class="rate-card">
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle
          cx="34" cy="34" r="28"
          fill="none"
          stroke="var(--border)"
          stroke-width="5"
        />
        <circle
          cx="34" cy="34" r="28"
          fill="none"
          stroke={color}
          stroke-width="5"
          stroke-linecap="round"
          stroke-dasharray={circumference}
          stroke-dashoffset={offset}
          transform="rotate(-90 34 34)"
        />
        <text
          x="34" y="37"
          text-anchor="middle"
          fill="var(--text-primary)"
          font-size="14"
          font-weight="700"
        >
          {value}%
        </text>
      </svg>
      <div class="rate-label">{label}</div>
    </div>
  );
}
