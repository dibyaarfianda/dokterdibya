import { useState, useEffect } from 'preact/hooks';
import { api } from '../services/api';
import { LOCATIONS, SURGERY_STATUS } from '../utils/constants';
import { userRole } from '../stores/auth';

export default function CommandDashboard() {
  const [data, setData] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [flags, setFlags] = useState({});
  const [metricsTrend, setMetricsTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(function() { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      var flagRes = await api.getFeatureFlags();
      setFlags(flagRes.flags || {});
      if (flagRes.flags && flagRes.flags.phase5_dashboard) {
        var dashRes = await api.getDashboard();
        setData(dashRes);
        // Load metrics trend (non-blocking)
        api.getMetricsTrend(7).then(function(r) { setMetricsTrend(r.trend || []); }).catch(function() {});
      }
      if (flagRes.flags && flagRes.flags.phase5_conflict_detection) {
        var confRes = await api.getConflicts();
        setConflicts(confRes);
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  if (loading) return (<div class="loading-state"><div class="spinner" /></div>);
  if (error) return (<div class="empty-state"><p>{error}</p></div>);

  var isDokter = userRole.value === 'dokter';

  return (
    <div class="view-command-dashboard">
      <div class="page-header"><h1 class="page-title">Command Center</h1></div>

      {!flags.phase5_dashboard ? (
        <div class="detail-card" style="text-align:center;padding:24px">
          <p style="color:var(--text-muted)">Dashboard belum diaktifkan</p>
          {isDokter && (<button class="btn-primary" onClick={async function() { await api.setFeatureFlag('phase5_dashboard', true); load(); }}>Aktifkan Dashboard</button>)}
        </div>
      ) : data ? (
        <>
          <div class="analytics-summary" style="padding:0 16px">
            <div class="summary-card"><div class="summary-card-body"><div class="summary-card-label">Operasi Hari Ini</div><div class="summary-card-value">{data.today.totalSurgeries}</div></div></div>
            <div class="summary-card"><div class="summary-card-body"><div class="summary-card-label">Pasien Hari Ini</div><div class="summary-card-value">{data.today.totalPatients}</div></div></div>
            <div class="summary-card"><div class="summary-card-body"><div class="summary-card-label">Completion 30d</div><div class="summary-card-value" style="color:#22C55E">{data.metrics.completionRate30d}%</div></div></div>
            <div class="summary-card"><div class="summary-card-body"><div class="summary-card-label">Total 30d</div><div class="summary-card-value">{data.metrics.totalOps30d}</div></div></div>
          </div>

          <div style="padding:0 16px">
            <div class="detail-card">
              <div class="detail-label">Operasi per Lokasi Hari Ini</div>
              {data.today.surgeries.map(function(s, i) {
                var loc = LOCATIONS[s.location] || {};
                var st = SURGERY_STATUS[s.status] || {};
                return (<div key={i} style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:var(--text-primary)"><span class="loc-dot" style={{backgroundColor:loc.color||'#94A3B8'}} /> {loc.shortName||s.location}</span><span style={{color:st.color||'#94A3B8'}}>{st.label||s.status} ({s.count})</span></div>);
              })}
            </div>

            <div class="detail-card">
              <div class="detail-label">Sync Status</div>
              {data.today.patients.map(function(p, i) {
                var loc = LOCATIONS[p.location] || {};
                return (<div key={i} style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span><span class="loc-dot" style={{backgroundColor:loc.color||'#94A3B8'}} /> {loc.shortName||p.location}</span><span style="color:var(--text-muted)">{p.patient_count} pasien | {p.sync_status}</span></div>);
              })}
            </div>
          </div>

          {/* Metrics Trend (read-only) */}
          {metricsTrend.length > 0 && (
            <div style="padding:0 16px">
              <div class="detail-card">
                <div class="detail-label">Tren 7 Hari Terakhir</div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  {metricsTrend.slice(0, 7).map(function(m, i) {
                    var d = typeof m.metric_date === 'string' ? m.metric_date : new Date(m.metric_date).toISOString().slice(0,10);
                    return (
                      <div key={i} style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--border)">
                        <span style="color:var(--text-secondary)">{d}</span>
                        <span>{m.total_requests || 0} req</span>
                        <span style="color:var(--text-muted)">{m.slow_requests || 0} slow</span>
                        <span style="color:var(--text-muted)">{m.compliance_requests || 0} comp</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div style="padding:0 16px;font-size:11px;color:var(--text-muted);margin-bottom:12px">
            Update: {new Date(data.last_updated).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'})}
          </div>
        </>
      ) : null}

      {conflicts && conflicts.total > 0 && (
        <div style="padding:0 16px">
          <div class="detail-card" style="border-left:3px solid #EF4444">
            <div class="detail-label">Konflik Jadwal ({conflicts.total})</div>
            {conflicts.conflicts.map(function(c, i) {
              return (<div key={i} style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px"><div style="font-weight:600;color:var(--text-primary)">{c.type === 'time_overlap' ? 'Tumpang tindih' : 'Kepadatan tinggi'}</div><div style="color:var(--text-secondary);margin-top:2px">{c.recommendation}</div></div>);
            })}
          </div>
        </div>
      )}

      {isDokter && (
        <div style="padding:0 16px;margin-top:8px">
          <div class="detail-card">
            <div class="detail-label">Feature Flags</div>
            {Object.entries(flags).map(function(entry) {
              var k = entry[0]; var v = entry[1];
              return (<div key={k} class="pref-toggle-row"><div class="pref-toggle-info"><div class="pref-toggle-label">{k}</div></div><label class="toggle-switch"><input type="checkbox" checked={v} onChange={async function() { await api.setFeatureFlag(k, !v); load(); }} /><span class="toggle-slider" /></label></div>);
            })}
          </div>
        </div>
      )}
    </div>
  );
}
