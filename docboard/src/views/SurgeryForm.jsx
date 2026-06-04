import { useState, useEffect, useRef } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';
import { LOCATIONS } from '../utils/constants';
import DatePickerCalendar from '../components/DatePickerCalendar';
import { normalizeDateInput, formatDateShort } from '../utils/date';

const LOCATION_KEYS = Object.keys(LOCATIONS);

function defaultOperationDataStartDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 2);
  return normalizeDateInput(date);
}

function operationDataLocation(facility) {
  const key = String(facility || '').toLowerCase();
  if (key === 'melinda' || key === 'rsia_melinda') return 'rsia_melinda';
  if (key === 'gambiran' || key === 'rsud_gambiran') return 'rsud_gambiran';
  if (key === 'bhayangkara' || key === 'rs_bhayangkara') return 'rs_bhayangkara';
  return '';
}

export default function SurgeryForm({ id }) {
  const isEdit = !!id;

  const [form, setForm] = useState({
    patient_name: '',
    patient_age: '',
    patient_id: '',
    mr_id: '',
    diagnosis: '',
    operation_type_id: '',
    operation_type_ids: [],
    operation_type_other: '',
    location: 'rsia_melinda',
    surgery_date: '',
    surgery_time: '',
    lab_results: '',
    radiology_results: '',
    usg_results: '',
    anesthesia_type: '',
    asa_score: '',
    npo_status: '',
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
  const [templates, setTemplates] = useState([]);
  const [savingTemplate, setSavingTemplate] = useState(false);

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

  const [operationDataSearch, setOperationDataSearch] = useState('');
  const [operationDataResults, setOperationDataResults] = useState([]);
  const [operationDataLoading, setOperationDataLoading] = useState(false);
  const [showOperationDataSearch, setShowOperationDataSearch] = useState(false);
  const operationDataTimeout = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  function getOperationLabel(op) {
    return op?.code || op?.name_id || op?.name || '';
  }

  function parseOperationSelection(types, surgery) {
    const primaryId = surgery.operation_type_id ? Number(surgery.operation_type_id) : null;
    const selectedIds = primaryId ? [primaryId] : [];
    const combined = (surgery.operation_type_other || '').trim();

    if (!combined) {
      return {
        selectedIds,
        customText: ''
      };
    }

    const unmatched = [];
    combined.split('+').map(part => part.trim()).filter(Boolean).forEach(part => {
      const match = types.find(type => {
        const label = getOperationLabel(type);
        return label.toLowerCase() === part.toLowerCase()
          || String(type.code || '').toLowerCase() === part.toLowerCase()
          || String(type.name || '').toLowerCase() === part.toLowerCase();
      });

      if (match) {
        const matchId = Number(match.id);
        if (!selectedIds.includes(matchId)) {
          selectedIds.push(matchId);
        }
      } else {
        unmatched.push(part);
      }
    });

    return {
      selectedIds,
      customText: unmatched.join(' + ')
    };
  }

  async function loadData() {
    setLoading(true);
    try {
      const [typesData, staffData, tplData] = await Promise.all([
        api.getOperationTypes(),
        api.getExternalStaff(),
        api.getTemplates().catch(() => ({ templates: [] }))
      ]);
      setOpTypes(typesData.types || []);
      setExternalStaff(staffData.staff || []);
      setTemplates(tplData.templates || []);

      if (isEdit) {
        const data = await api.getSurgery(id);
        if (data.surgery) {
          const s = data.surgery;
          const dateStr = normalizeDateInput(s.surgery_date);
          const parsedOps = parseOperationSelection(typesData.types || [], s);
          setForm({
            patient_name: s.patient_name || '',
            patient_age: s.patient_age || '',
            patient_id: s.patient_id || '',
            mr_id: s.mr_id || '',
            diagnosis: s.diagnosis || '',
            operation_type_id: s.operation_type_id || '',
            operation_type_ids: parsedOps.selectedIds,
            operation_type_other: parsedOps.customText,
            location: s.location || 'rsia_melinda',
            surgery_date: dateStr,
            surgery_time: s.surgery_time ? s.surgery_time.substring(0, 5) : '',
            lab_results: s.lab_results || '',
            radiology_results: s.radiology_results || '',
            usg_results: s.usg_results || '',
            anesthesia_type: s.anesthesia_type || '',
            asa_score: s.asa_score || '',
            npo_status: s.npo_status || '',
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

  function toggleOperationType(typeId) {
    setForm(current => {
      const nextId = Number(typeId);
      const exists = current.operation_type_ids.includes(nextId);
      const nextIds = exists
        ? current.operation_type_ids.filter(id => id !== nextId)
        : [...current.operation_type_ids, nextId];

      return {
        ...current,
        operation_type_ids: nextIds,
        operation_type_id: nextIds[0] || ''
      };
    });
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

  function handleOperationDataSearchInput(value) {
    setOperationDataSearch(value);
    if (operationDataTimeout.current) clearTimeout(operationDataTimeout.current);

    if (value.length < 2) {
      setOperationDataResults([]);
      setShowOperationDataSearch(false);
      return;
    }

    setShowOperationDataSearch(true);
    operationDataTimeout.current = setTimeout(async () => {
      setOperationDataLoading(true);
      try {
        const data = await api.getOperationData({
          facility: 'all',
          start: defaultOperationDataStartDate(),
          end: normalizeDateInput(new Date()),
          q: value,
          limit: 10,
        });
        setOperationDataResults(data.data || []);
      } catch (err) {
        console.error('Operation data search error:', err);
      } finally {
        setOperationDataLoading(false);
      }
    }, 300);
  }

  function selectOperationData(record) {
    const parsedOps = parseOperationSelection(opTypes, {
      operation_type_id: null,
      operation_type_other: record.operation_name || ''
    });
    const location = operationDataLocation(record.facility);

    setOperationDataSearch('');
    setOperationDataResults([]);
    setShowOperationDataSearch(false);
    setForm(f => ({
      ...f,
      patient_name: record.patient_name || f.patient_name,
      mr_id: record.mr_id || f.mr_id,
      diagnosis: record.diagnosis || f.diagnosis,
      operation_type_id: parsedOps.selectedIds[0] || f.operation_type_id,
      operation_type_ids: parsedOps.selectedIds.length ? parsedOps.selectedIds : f.operation_type_ids,
      operation_type_other: parsedOps.customText || f.operation_type_other,
      location: location || f.location,
      surgery_date: normalizeDateInput(record.operation_date) || f.surgery_date,
      surgery_time: record.operation_time ? String(record.operation_time).substring(0, 5) : f.surgery_time,
      special_notes: f.special_notes || `Sumber data operasi: ${record.facility || 'RS'}${record.case_id ? ` / Case ${record.case_id}` : ''}`
    }));

    if (record.mr_id) setRmInput(record.mr_id);
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

  function applyTemplate(tpl) {
    const d = tpl.default_data || {};
    setForm(f => ({
      ...f,
      ...d,
      // Keep patient-specific fields if already filled
      patient_name: f.patient_name || d.patient_name || '',
      patient_age: f.patient_age || d.patient_age || '',
      patient_id: f.patient_id || d.patient_id || '',
      mr_id: f.mr_id || d.mr_id || '',
      diagnosis: f.diagnosis || d.diagnosis || '',
      team_members: d.team_members || f.team_members || []
    }));
  }

  async function handleSaveTemplate() {
    const name = prompt('Nama template:');
    if (!name) return;
    setSavingTemplate(true);
    try {
      const { patient_name, patient_age, patient_id, mr_id, diagnosis, ...templateData } = form;
      const res = await api.createTemplate(name, templateData);
      setTemplates(prev => [...prev, res.template]);
    } catch (err) {
      alert('Gagal menyimpan template: ' + err.message);
    }
    setSavingTemplate(false);
  }

  async function handleDeleteTemplate(id) {
    if (!confirm('Hapus template ini?')) return;
    try {
      await api.deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert('Gagal menghapus: ' + err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.patient_name || !form.diagnosis || (!form.operation_type_ids.length && !form.operation_type_other.trim()) || !form.surgery_date) {
      setError('Nama pasien, diagnosis, jenis operasi, dan tanggal wajib diisi');
      return;
    }

    setSaving(true);
    try {
      const selectedOps = opTypes.filter(type => form.operation_type_ids.includes(Number(type.id)));
      const selectedLabels = selectedOps.map(getOperationLabel).filter(Boolean);
      const customLabels = form.operation_type_other
        .split(/\r?\n|\+/)
        .map(item => item.trim())
        .filter(Boolean);
      const combinedLabels = [...selectedLabels, ...customLabels];
      const fallbackOperation = opTypes.find(type => String(type.code || '').toUpperCase() === 'OTHER-OP');
      const primaryOperationId = form.operation_type_ids[0] || form.operation_type_id || fallbackOperation?.id || null;

      const payload = {
        ...form,
        patient_age: form.patient_age ? parseInt(form.patient_age) : null,
        asa_score: form.asa_score ? parseInt(form.asa_score, 10) : null,
        operation_type_id: primaryOperationId ? parseInt(primaryOperationId, 10) : null,
        operation_type_ids: form.operation_type_ids.map(Number),
        operation_type_other: combinedLabels.length > 1 || customLabels.length > 0
          ? combinedLabels.join(' + ')
          : '',
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

        {/* Templates */}
        {!isEdit && templates.length > 0 && (
          <div class="form-section template-section">
            <div class="form-section-title">Template</div>
            <div class="template-chips">
              {templates.map(t => (
                <div key={t.id} class="template-chip-wrap">
                  <button type="button" class="template-chip" onClick={() => applyTemplate(t)}>
                    {t.name}
                  </button>
                  <button type="button" class="template-delete" onClick={() => handleDeleteTemplate(t.id)} title="Hapus">&times;</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RM Lookup Section */}
        <div class="form-section rm-section">
          <div class="form-section-title">Cari Pasien</div>

          <div class="form-group" style="position:relative">
            <label>Cari Data Operasi RS</label>
            <input
              type="text"
              value={operationDataSearch}
              onInput={e => handleOperationDataSearchInput(e.target.value)}
              placeholder="Cari dari Melinda, Gambiran, Bhayangkara..."
            />
            {showOperationDataSearch && (
              <div class="search-dropdown">
                {operationDataLoading ? (
                  <div class="search-loading">Mencari data operasi...</div>
                ) : operationDataResults.length === 0 ? (
                  <div class="search-empty">Tidak ditemukan</div>
                ) : (
                  operationDataResults.map(record => {
                    const locKey = operationDataLocation(record.facility);
                    const loc = LOCATIONS[locKey];
                    return (
                      <button key={record.id} type="button" class="search-result" onClick={() => selectOperationData(record)}>
                        <div class="search-result-name">{record.patient_name}</div>
                        <div class="search-result-meta">
                          {record.operation_name || 'Operasi'} · {normalizeDateInput(record.operation_date) || '-'} {record.operation_time ? String(record.operation_time).substring(0, 5) : ''}
                        </div>
                        <div class="search-result-meta">
                          {loc?.shortName || record.facility} {record.mr_id ? `· MR ${record.mr_id}` : ''}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

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
                      const dateStr = formatDateShort(v.date);
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
          <div class="form-helper-text">Bisa pilih lebih dari satu. Contoh hasil: SVH + BSO.</div>
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
                      class={`op-chip ${form.operation_type_ids.includes(Number(t.id)) ? 'selected' : ''}`}
                      onClick={() => toggleOperationType(t.id)}
                    >
                      {t.code || t.name_id || t.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div class="form-group" style="margin-top:12px;">
            <label>Operasi yang belum ada di list</label>
            <textarea
              rows="3"
              value={form.operation_type_other}
              onInput={e => updateField('operation_type_other', e.target.value)}
              placeholder="Contoh: Kuret&#10;Lepas Pasang IUD&#10;Operasi lain yang belum ada di list"
            />
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
              <DatePickerCalendar
                value={form.surgery_date}
                onSelect={val => updateField('surgery_date', val)}
                required
              />
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

        {/* Anesthesia */}
        <div class="form-section">
          <div class="form-section-title">Anestesi</div>
          <div class="form-group">
            <label>Jenis Anestesi</label>
            <select value={form.anesthesia_type} onChange={e => updateField('anesthesia_type', e.target.value)}>
              <option value="">-- Pilih --</option>
              <option value="GA">General Anesthesia (GA)</option>
              <option value="Spinal">Spinal</option>
              <option value="Epidural">Epidural</option>
              <option value="Combined Spinal-Epidural">Combined Spinal-Epidural</option>
              <option value="Local">Local Anesthesia</option>
              <option value="Sedation">Sedation</option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>ASA Score</label>
              <select value={form.asa_score} onChange={e => updateField('asa_score', e.target.value)}>
                <option value="">--</option>
                <option value="1">ASA I</option>
                <option value="2">ASA II</option>
                <option value="3">ASA III</option>
                <option value="4">ASA IV</option>
                <option value="5">ASA V</option>
              </select>
            </div>
            <div class="form-group" style="flex:2">
              <label>Status Puasa (NPO)</label>
              <input type="text" value={form.npo_status} onInput={e => updateField('npo_status', e.target.value)} placeholder="contoh: Puasa sejak jam 00:00" />
            </div>
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
        {!isEdit && (
          <button type="button" class="btn-text btn-full" onClick={handleSaveTemplate} disabled={savingTemplate} style="margin-top:8px">
            {savingTemplate ? 'Menyimpan...' : 'Simpan sebagai Template'}
          </button>
        )}
      </form>
    </div>
  );
}
