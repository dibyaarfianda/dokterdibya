import { useState, useEffect, useRef } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { LOCATIONS } from '../utils/constants';

const LOCATION_KEYS = Object.keys(LOCATIONS);

export default function SurgeryForm({ id }) {
  const isEdit = !!id;

  const [form, setForm] = useState({
    patient_name: '',
    patient_age: '',
    patient_id: '',
    mr_id: '',
    diagnosis: '',
    operation_type_id: '',
    operation_type_other: '',
    location: 'rsia_melinda',
    surgery_date: '',
    surgery_time: '',
    lab_results: '',
    radiology_results: '',
    usg_results: '',
    special_notes: '',
    team_members: []
  });

  const [opTypes, setOpTypes] = useState([]);
  const [externalStaff, setExternalStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', role: 'Asisten Operator', phone: '' });
  const [opSearch, setOpSearch] = useState('');

  // RM Lookup state
  const [rmInput, setRmInput] = useState('');
  const [rmLoading, setRmLoading] = useState(false);
  const [rmResult, setRmResult] = useState(null);
  const [rmError, setRmError] = useState('');

  // Patient search state
  const [patientSearch, setPatientSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchTimeout = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [typesData, staffData] = await Promise.all([
        api.getOperationTypes(),
        api.getExternalStaff()
      ]);
      setOpTypes(typesData.types || []);
      setExternalStaff(staffData.staff || []);

      if (isEdit) {
        const data = await api.getSurgery(id);
        if (data.surgery) {
          const s = data.surgery;
          const dateStr = new Date(s.surgery_date).toISOString().split('T')[0];
          setForm({
            patient_name: s.patient_name || '',
            patient_age: s.patient_age || '',
            patient_id: s.patient_id || '',
            mr_id: s.mr_id || '',
            diagnosis: s.diagnosis || '',
            operation_type_id: s.operation_type_id || '',
            operation_type_other: s.operation_type_other || '',
            location: s.location || 'rsia_melinda',
            surgery_date: dateStr,
            surgery_time: s.surgery_time ? s.surgery_time.substring(0, 5) : '',
            lab_results: s.lab_results || '',
            radiology_results: s.radiology_results || '',
            usg_results: s.usg_results || '',
            special_notes: s.special_notes || '',
            team_members: s.team_members || []
          });
          if (s.mr_id) setRmInput(s.mr_id);
        }
      }
    } catch (err) {
      console.error('Failed to load form data:', err);
    } finally {
      setLoading(false);
    }
  }

  function updateField(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  // =====================================================
  // RM LOOKUP
  // =====================================================

  async function handleRmLookup() {
    if (!rmInput.trim()) return;
    setRmLoading(true);
    setRmError('');
    setRmResult(null);

    try {
      const data = await api.lookupRM(rmInput.trim());
      setRmResult(data);
      // Auto-fill form fields
      setForm(f => ({
        ...f,
        patient_name: data.patient?.name || f.patient_name,
        patient_age: data.patient?.age || f.patient_age,
        patient_id: data.patient?.id || f.patient_id,
        mr_id: rmInput.trim(),
        diagnosis: data.clinical?.diagnosis || f.diagnosis,
        lab_results: data.clinical?.lab_results || f.lab_results,
        usg_results: data.clinical?.usg_results || f.usg_results,
        // Pre-select location from visit
        location: data.visit?.location || f.location
      }));

      // Add allergy to notes if exists
      if (data.patient?.allergy && data.patient.allergy !== '-') {
        setForm(f => ({
          ...f,
          special_notes: f.special_notes
            ? f.special_notes
            : `Alergi: ${data.patient.allergy}`
        }));
      }
    } catch (err) {
      setRmError(err.message || 'RM tidak ditemukan');
    } finally {
      setRmLoading(false);
    }
  }

  // =====================================================
  // PATIENT SEARCH
  // =====================================================

  function handlePatientSearchInput(value) {
    setPatientSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (value.length < 2) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }

    setShowSearch(true);
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const data = await api.searchPatient(value);
        setSearchResults(data.patients || []);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }

  function selectPatient(patient) {
    setPatientSearch('');
    setSearchResults([]);
    setShowSearch(false);

    // Set RM input and auto-lookup
    if (patient.latest_mr_id) {
      setRmInput(patient.latest_mr_id);
      // Auto-fill basic info first
      setForm(f => ({
        ...f,
        patient_name: patient.name || f.patient_name,
        patient_age: patient.age || f.patient_age,
        patient_id: patient.id || f.patient_id,
        mr_id: patient.latest_mr_id
      }));
      // Then do full RM lookup
      setTimeout(async () => {
        setRmLoading(true);
        try {
          const data = await api.lookupRM(patient.latest_mr_id);
          setRmResult(data);
          setForm(f => ({
            ...f,
            diagnosis: data.clinical?.diagnosis || f.diagnosis,
            lab_results: data.clinical?.lab_results || f.lab_results,
            usg_results: data.clinical?.usg_results || f.usg_results,
            location: data.visit?.location || f.location
          }));
          if (data.patient?.allergy && data.patient.allergy !== '-' && !f.special_notes) {
            setForm(f => ({ ...f, special_notes: `Alergi: ${data.patient.allergy}` }));
          }
        } catch {} finally {
          setRmLoading(false);
        }
      }, 0);
    } else {
      setForm(f => ({
        ...f,
        patient_name: patient.name || f.patient_name,
        patient_age: patient.age || f.patient_age,
        patient_id: patient.id || f.patient_id
      }));
    }
  }

  // =====================================================
  // RM HISTORY SELECT
  // =====================================================

  async function selectVisitHistory(mrId) {
    setRmInput(mrId);
    setRmLoading(true);
    setRmError('');
    try {
      const data = await api.lookupRM(mrId);
      setRmResult(data);
      setForm(f => ({
        ...f,
        mr_id: mrId,
        diagnosis: data.clinical?.diagnosis || f.diagnosis,
        lab_results: data.clinical?.lab_results || f.lab_results,
        usg_results: data.clinical?.usg_results || f.usg_results,
        location: data.visit?.location || f.location
      }));
    } catch (err) {
      setRmError(err.message);
    } finally {
      setRmLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.patient_name || !form.diagnosis || !form.operation_type_id || !form.surgery_date) {
      setError('Nama pasien, diagnosis, jenis operasi, dan tanggal wajib diisi');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        patient_age: form.patient_age ? parseInt(form.patient_age) : null,
        operation_type_id: parseInt(form.operation_type_id),
        surgery_time: form.surgery_time || null
      };

      if (isEdit) {
        await api.updateSurgery(id, payload);
      } else {
        await api.createSurgery(payload);
      }
      route('/docboard/surgery');
    } catch (err) {
      setError(err.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  function addTeamMember(member) {
    setForm(f => ({ ...f, team_members: [...f.team_members, member] }));
  }

  function removeTeamMember(index) {
    setForm(f => ({ ...f, team_members: f.team_members.filter((_, i) => i !== index) }));
  }

  async function handleAddExternalStaff(e) {
    e.preventDefault();
    if (!newStaff.name) return;
    try {
      const data = await api.addExternalStaff(newStaff);
      const created = data.staff;
      setExternalStaff(prev => [...prev, { id: created.id, name: created.name, role: created.role }]);
      addTeamMember({ id: created.id, name: created.name, role: created.role, is_external: true });
      setNewStaff({ name: '', role: 'Asisten Operator', phone: '' });
      setShowAddStaff(false);
    } catch (err) {
      console.error('Failed to add staff:', err);
    }
  }

  // Filter operation types by search
  const filteredOpTypes = opSearch
    ? opTypes.filter(t =>
        t.code?.toLowerCase().includes(opSearch.toLowerCase()) ||
        t.name.toLowerCase().includes(opSearch.toLowerCase()) ||
        t.name_id?.toLowerCase().includes(opSearch.toLowerCase())
      )
    : opTypes;

  const groupedOps = {};
  for (const t of filteredOpTypes) {
    if (!groupedOps[t.category]) groupedOps[t.category] = [];
    groupedOps[t.category].push(t);
  }

  const categoryLabels = {
    obstetri: 'Obstetri',
    ginekologi: 'Ginekologi',
    onkologi_ginekologi: 'Onkologi Ginekologi'
  };

  const locLabels = {
    klinik_private: 'Klinik', rsia_melinda: 'Melinda', rsud_gambiran: 'Gambiran', rs_bhayangkara: 'Bhayangkara'
  };

  if (loading) {
    return <div class="loading-state"><div class="spinner" /></div>;
  }

  return (
    <div class="view-surgery-form">
      <div class="view-header">
        <button class="btn-back" onClick={() => history.back()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <h1>{isEdit ? 'Edit Operasi' : 'Jadwal Operasi Baru'}</h1>
      </div>

      <form onSubmit={handleSubmit} class="surgery-form">
        {error && <div class="form-error">{error}</div>}

        {/* RM Lookup Section */}
        <div class="form-section rm-section">
          <div class="form-section-title">Cari Pasien</div>

          {/* Search by name */}
          <div class="form-group" style="position:relative">
            <label>Cari Nama</label>
            <input
              type="text"
              value={patientSearch}
              onInput={e => handlePatientSearchInput(e.target.value)}
              placeholder="Ketik nama pasien..."
            />
            {showSearch && (
              <div class="search-dropdown">
                {searchLoading ? (
                  <div class="search-loading">Mencari...</div>
                ) : searchResults.length === 0 ? (
                  <div class="search-empty">Tidak ditemukan</div>
                ) : (
                  searchResults.map(p => (
                    <button key={p.id} type="button" class="search-result" onClick={() => selectPatient(p)}>
                      <div class="search-result-name">{p.name}</div>
                      <div class="search-result-meta">
                        {p.age ? `${p.age} th` : ''} {p.latest_mr_id ? `• ${p.latest_mr_id}` : ''}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* OR: direct RM input */}
          <div class="rm-divider"><span>atau masukkan RM</span></div>

          <div class="rm-input-row">
            <input
              type="text"
              value={rmInput}
              onInput={e => setRmInput(e.target.value.toUpperCase())}
              placeholder="DRD0510"
              class="rm-input"
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleRmLookup())}
            />
            <button type="button" class="btn-rm-fetch" onClick={handleRmLookup} disabled={rmLoading}>
              {rmLoading ? '...' : 'Fetch'}
            </button>
          </div>

          {rmError && <div class="rm-error">{rmError}</div>}

          {/* Show fetched patient info */}
          {rmResult && (
            <div class="rm-result">
              <div class="rm-result-check">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="3">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
                Data ditemukan
              </div>
              <div class="rm-result-info">
                <strong>{rmResult.patient?.name}</strong>
                {rmResult.patient?.age && <span> ({rmResult.patient.age} th)</span>}
              </div>
              {rmResult.patient?.allergy && rmResult.patient.allergy !== '-' && (
                <div class="rm-result-allergy">Alergi: {rmResult.patient.allergy}</div>
              )}
              {rmResult.clinical?.diagnosis && (
                <div class="rm-result-diag">Dx: {rmResult.clinical.diagnosis}</div>
              )}

              {/* Visit history */}
              {rmResult.history && rmResult.history.length > 1 && (
                <div class="rm-history">
                  <div class="rm-history-label">Riwayat kunjungan:</div>
                  <div class="rm-history-list">
                    {rmResult.history.slice(0, 5).map(v => {
                      const d = new Date(v.date);
                      const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: '2-digit' });
                      const isActive = v.mr_id === rmInput;
                      return (
                        <button
                          key={v.mr_id}
                          type="button"
                          class={`rm-history-item ${isActive ? 'active' : ''}`}
                          onClick={() => !isActive && selectVisitHistory(v.mr_id)}
                        >
                          <span class="rm-history-id">{v.mr_id}</span>
                          <span class="rm-history-date">{dateStr}</span>
                          <span class="rm-history-loc">{locLabels[v.location] || v.location}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Patient Info */}
        <div class="form-section">
          <div class="form-section-title">Data Pasien</div>
          <div class="form-group">
            <label>Nama Pasien *</label>
            <input type="text" value={form.patient_name} onInput={e => updateField('patient_name', e.target.value)} required />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Umur</label>
              <input type="number" value={form.patient_age} onInput={e => updateField('patient_age', e.target.value)} placeholder="th" />
            </div>
            <div class="form-group" style="flex:2">
              <label>Diagnosis *</label>
              <input type="text" value={form.diagnosis} onInput={e => updateField('diagnosis', e.target.value)} required />
            </div>
          </div>
        </div>

        {/* Operation Type */}
        <div class="form-section">
          <div class="form-section-title">Jenis Operasi *</div>
          <input
            type="text"
            class="op-search"
            placeholder="Cari operasi... (SC, TAH, BSO, dll)"
            value={opSearch}
            onInput={e => setOpSearch(e.target.value)}
          />
          <div class="op-type-list">
            {Object.entries(groupedOps).map(([cat, types]) => (
              <div key={cat} class="op-category">
                <div class="op-category-label">{categoryLabels[cat] || cat}</div>
                <div class="op-type-chips">
                  {types.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      class={`op-chip ${form.operation_type_id == t.id ? 'selected' : ''}`}
                      onClick={() => updateField('operation_type_id', t.id)}
                    >
                      {t.code || t.name_id || t.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div class="form-section">
          <div class="form-section-title">Jadwal</div>
          <div class="form-group">
            <label>Rumah Sakit *</label>
            <div class="location-options">
              {LOCATION_KEYS.map(key => (
                <button
                  key={key}
                  type="button"
                  class={`location-option ${form.location === key ? 'selected' : ''}`}
                  style={form.location === key ? { borderColor: LOCATIONS[key].color, backgroundColor: LOCATIONS[key].colorLight } : {}}
                  onClick={() => updateField('location', key)}
                >
                  <span class="loc-dot" style={{ backgroundColor: LOCATIONS[key].color }} />
                  {LOCATIONS[key].shortName}
                </button>
              ))}
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Tanggal *</label>
              <input type="date" value={form.surgery_date} onInput={e => updateField('surgery_date', e.target.value)} required />
            </div>
            <div class="form-group">
              <label>Jam</label>
              <input type="time" value={form.surgery_time} onInput={e => updateField('surgery_time', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Clinical Info */}
        <div class="form-section">
          <div class="form-section-title">Data Klinis</div>
          <div class="form-group">
            <label>Hasil Lab</label>
            <textarea rows="2" value={form.lab_results} onInput={e => updateField('lab_results', e.target.value)} placeholder="Hb, Leukosit, Trombosit, dll..." />
          </div>
          <div class="form-group">
            <label>Hasil Radiologi</label>
            <textarea rows="2" value={form.radiology_results} onInput={e => updateField('radiology_results', e.target.value)} placeholder="Rontgen, CT-Scan, dll..." />
          </div>
          <div class="form-group">
            <label>Hasil USG</label>
            <textarea rows="2" value={form.usg_results} onInput={e => updateField('usg_results', e.target.value)} placeholder="Temuan USG..." />
          </div>
        </div>

        {/* Team */}
        <div class="form-section">
          <div class="form-section-title">Tim Operasi</div>
          {form.team_members.length > 0 && (
            <div class="team-list">
              {form.team_members.map((m, i) => (
                <div key={i} class="team-member">
                  <span class="team-name">{m.name}</span>
                  <span class="team-role">{m.role}</span>
                  <button type="button" class="team-remove" onClick={() => removeTeamMember(i)}>x</button>
                </div>
              ))}
            </div>
          )}

          <div class="team-add-section">
            {externalStaff.filter(s => !form.team_members.some(m => m.id === s.id && m.is_external)).length > 0 && (
              <div class="team-existing">
                <label>Pilih staff:</label>
                <div class="staff-chips">
                  {externalStaff
                    .filter(s => !form.team_members.some(m => m.id === s.id && m.is_external))
                    .map(s => (
                      <button key={s.id} type="button" class="staff-chip"
                        onClick={() => addTeamMember({ id: s.id, name: s.name, role: s.role, is_external: true })}>
                        + {s.name}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {!showAddStaff ? (
              <button type="button" class="btn-text" onClick={() => setShowAddStaff(true)}>+ Tambah Staff Baru</button>
            ) : (
              <div class="add-staff-form">
                <input type="text" placeholder="Nama" value={newStaff.name} onInput={e => setNewStaff(p => ({ ...p, name: e.target.value }))} />
                <select value={newStaff.role} onChange={e => setNewStaff(p => ({ ...p, role: e.target.value }))}>
                  <option>Operator</option>
                  <option>Asisten Operator</option>
                  <option>Dokter Anestesi</option>
                  <option>Perawat Instrumen</option>
                  <option>Perawat Sirkuler</option>
                  <option>Bidan</option>
                </select>
                <div class="add-staff-actions">
                  <button type="button" class="btn-small" onClick={handleAddExternalStaff}>Simpan</button>
                  <button type="button" class="btn-small btn-ghost" onClick={() => setShowAddStaff(false)}>Batal</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div class="form-section">
          <div class="form-section-title">Catatan Khusus</div>
          <div class="form-group">
            <textarea rows="3" value={form.special_notes} onInput={e => updateField('special_notes', e.target.value)} placeholder="Alergi, persiapan khusus, dll..." />
          </div>
        </div>

        {/* Submit */}
        <button type="submit" class="btn-primary btn-full btn-lg" disabled={saving}>
          {saving ? 'Menyimpan...' : (isEdit ? 'Update' : 'Simpan Jadwal')}
        </button>
      </form>
    </div>
  );
}
