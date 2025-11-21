const form = document.getElementById('intake-form');
const steps = Array.from(document.querySelectorAll('.intake-step'));
const stepIndicator = Array.from(document.querySelectorAll('#stepper span'));
const prevBtn = document.getElementById('btn-prev');
const nextBtn = document.getElementById('btn-next');
const submitBtn = document.getElementById('btn-submit');
const toast = document.getElementById('toast');
const statusMessage = document.getElementById('status-message');
const STORAGE_KEY = 'dibya-intake-draft-v1';
const BMI_SUMMARY = document.getElementById('bmi-summary');
const maritalStatusField = document.getElementById('marital_status');
const husbandNameField = document.getElementById('husband_name');
const husbandAgeField = document.getElementById('husband_age');
const husbandJobField = document.getElementById('husband_job');
const riskAlert = document.getElementById('risk-alert');
const riskList = document.getElementById('risk-list');
const lmpField = document.getElementById('lmp');
const eddField = document.getElementById('edd');
const eddDateIntakeField = document.getElementById('edd_date_intake');
const pregnancyCountField = document.getElementById('pregnancy_count');
const miscarriageCountField = document.getElementById('miscarriage_count');
const livingCountField = document.getElementById('living_count');
const csectionCountField = document.getElementById('csection_count');
const csectionYearsField = document.getElementById('csection_years');
const gpalSummaryField = document.getElementById('gpal_summary');
const bscSummaryField = document.getElementById('bsc_summary');
const gravidaField = document.getElementById('gravida');
const paraField = document.getElementById('para');
const abortusField = document.getElementById('abortus');
const livingChildrenField = document.getElementById('living_children');
const pregnanciesTable = document.querySelector('table[data-collection="pregnancies"]');
// Prenatal table removed from form
// const prenatalTable = document.querySelector('table[data-collection="prenatal"]');
const labTable = document.querySelector('table[data-collection="labs"]');
// const addPrenatalRowBtn = document.getElementById('add-prenatal-row');
const addLabRowBtn = document.getElementById('add-lab-row');
const patientSignatureField = document.getElementById('patient_signature');
let currentStep = 0;
let saveTimer;
let currentRiskFlags = [];
let currentBMICategory = null;
let currentObstetricTotals = { gravida: 0, para: 0, abortus: 0, living: 0 };
let lastAutoEdd = null;

const riskFactorLabels = {
    age_extremes: 'Usia ibu di bawah 18 tahun atau di atas 35 tahun',
    previous_complication: 'Riwayat komplikasi kehamilan sebelumnya',
    multiple_pregnancy: 'Kemungkinan kehamilan kembar',
    medical_conditions: 'Memiliki penyakit medis yang berisiko',
    family_history: 'Riwayat keluarga dengan kelainan genetik',
    substance: 'Paparan rokok/alkohol/narkoba',
};

const pastConditionLabels = {
    hipertensi: 'Hipertensi',
    diabetes: 'Diabetes',
    heart: 'Penyakit jantung',
    kidney: 'Gangguan ginjal',
    thyroid: 'Gangguan tiroid',
    autoimmune: 'Penyakit autoimun',
    mental: 'Kondisi kesehatan mental',
    surgery: 'Riwayat operasi mayor',
    blood: 'Kelainan darah',
};

const totalFields = [gravidaField, paraField, abortusField, livingChildrenField];

function escapeName(name) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(name);
    }
    return name.replace(/([\.\[\]])/g, '\\$1');
}

function getTableBody(table) {
    return table ? table.querySelector('tbody') : null;
}

function getTableNextIndex(table) {
    if (!table) {
        return 1;
    }
    const fromDataset = Number(table.dataset.nextIndex);
    if (Number.isFinite(fromDataset) && fromDataset > 0) {
        return fromDataset;
    }
    const body = getTableBody(table);
    const rowCount = body ? body.querySelectorAll('tr').length : 0;
    return rowCount + 1;
}

function setTableNextIndex(table, nextIndex) {
    if (table && Number.isFinite(nextIndex)) {
        table.dataset.nextIndex = String(nextIndex);
    }
}

// Prenatal row function removed - section deleted from form
// function createPrenatalRow(index) {
//     const tr = document.createElement('tr');
//     tr.dataset.index = String(index);
//     tr.innerHTML = `
//         <td class="row-number">${index}</td>
//         <td><input type="date" name="visit_date_${index}"></td>
//         <td><input type="number" name="visit_ga_${index}" min="0" max="45"></td>
//         <td><input type="number" name="visit_weight_${index}" step="0.1"></td>
//         <td><input type="text" name="visit_bp_${index}" placeholder="120/80"></td>
//         <td><input type="number" name="visit_fhr_${index}" min="60" max="220"></td>
//         <td><textarea name="visit_note_${index}" rows="1" placeholder="opsional"></textarea></td>
//     `;
//     return tr;
// }

function createLabRow(index) {
    const tr = document.createElement('tr');
    tr.dataset.index = String(index);
    tr.innerHTML = `
        <td><input type="text" name="lab_test_${index}" placeholder="Nama tes"></td>
        <td><input type="text" name="lab_recommend_${index}" placeholder="Waktu rekomendasi"></td>
        <td><input type="date" name="lab_date_${index}"></td>
        <td><textarea name="lab_result_${index}" rows="1" placeholder="hasil"></textarea></td>
        <td><textarea name="lab_follow_${index}" rows="1" placeholder="tindak lanjut"></textarea></td>
    `;
    return tr;
}

function ensureTableRow(table, createRow, targetIndex) {
    if (!table) {
        return;
    }
    const body = getTableBody(table);
    if (!body) {
        return;
    }
    let currentRows = body.querySelectorAll('tr').length;
    while (currentRows < targetIndex) {
        const nextIndex = currentRows + 1;
        const row = createRow(nextIndex);
        body.appendChild(row);
        currentRows += 1;
    }
    const nextIndex = Math.max(getTableNextIndex(table), targetIndex + 1);
    setTableNextIndex(table, nextIndex);
}

function ensureDynamicField(name) {
    const match = name.match(/^(visit|lab)_[a-z_]+_([0-9]+)$/);
    if (!match) {
        return;
    }
    const [, group, indexStr] = match;
    const index = Number(indexStr);
    if (!Number.isFinite(index)) {
        return;
    }
    if (group === 'visit') {
        ensureTableRow(prenatalTable, createPrenatalRow, index);
    } else if (group === 'lab') {
        ensureTableRow(labTable, createLabRow, index);
    }
}

function addDynamicRow(table, createRow) {
    if (!table) {
        return;
    }
    const body = getTableBody(table);
    if (!body) {
        return;
    }
    const nextIndex = getTableNextIndex(table);
    const row = createRow(nextIndex);
    body.appendChild(row);
    setTableNextIndex(table, nextIndex + 1);
    scheduleSave();
}

function updateStep(target) {
    if (target < 0 || target >= steps.length) {
        return;
    }
    steps[currentStep].classList.remove('active');
    stepIndicator[currentStep].classList.remove('active');
    currentStep = target;
    steps[currentStep].classList.add('active');
    stepIndicator[currentStep].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    refreshButtons();
    scheduleSave();
}

function refreshButtons() {
    prevBtn.disabled = currentStep === 0;
    if (currentStep === steps.length - 1) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'block';
    } else {
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
    }
}

function validateStep(stepIndex) {
    const section = steps[stepIndex];
    const fields = Array.from(section.querySelectorAll('input, select, textarea'));
    for (const field of fields) {
        if (!field.checkValidity()) {
            field.reportValidity();
            return false;
        }
    }
    return true;
}

function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.style.borderColor = type === 'error' ? '#fecaca' : '#bfdbfe';
    toast.style.background = type === 'error' ? '#fef2f2' : '#eff6ff';
    toast.style.color = type === 'error' ? '#991b1b' : '#1d4ed8';
    toast.classList.add('show');
    window.clearTimeout(toast.dataset.timer);
    const timer = window.setTimeout(() => {
        toast.classList.remove('show');
    }, 3200);
    toast.dataset.timer = timer;
}

function serializeFields() {
    const data = {};
    form.querySelectorAll('input, select, textarea').forEach((field) => {
        if (!field.name) {
            return;
        }
        if (field.disabled) {
            return;
        }
        if (field.type === 'checkbox') {
            if (field.name === 'consent') {
                data.consent = field.checked;
                return;
            }
            if (!Array.isArray(data[field.name])) {
                data[field.name] = [];
            }
            if (field.checked) {
                data[field.name].push(field.value);
            }
            return;
        }
        if (field.type === 'radio') {
            if (field.checked) {
                data[field.name] = field.value;
            } else if (!Object.prototype.hasOwnProperty.call(data, field.name)) {
                data[field.name] = '';
            }
            return;
        }
        data[field.name] = field.value ?? '';
    });
    return data;
}

function restoreDraft() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            return;
        }
        const draft = JSON.parse(stored);
        if (!draft || !draft.fields) {
            return;
        }
        const { fields, step = 0 } = draft;
        Object.entries(fields).forEach(([name, value]) => {
            ensureDynamicField(name);
            const controls = form.querySelectorAll(`[name="${escapeName(name)}"]`);
            if (!controls.length) {
                return;
            }
            controls.forEach((control) => {
                if (control.type === 'checkbox') {
                    if (name === 'consent') {
                        control.checked = Boolean(value);
                    } else if (Array.isArray(value)) {
                        control.checked = value.includes(control.value);
                    } else {
                        control.checked = false;
                    }
                    return;
                }
                if (control.type === 'radio') {
                    control.checked = value === control.value;
                    return;
                }
                if (Array.isArray(value)) {
                    control.value = value[0] ?? '';
                    return;
                }
                control.value = value;
                if (['gravida', 'para', 'abortus', 'living_children'].includes(control.name) && value) {
                    control.dataset.userEdited = 'true';
                }
                if (control.id === 'edd' && value) {
                    control.dataset.userEdited = 'true';
                }
            });
        });
        if (typeof step === 'number' && step >= 0 && step < steps.length) {
            updateStep(step);
        }
        updateDerived();
        syncMaritalFields();
        statusMessage.hidden = false;
        statusMessage.textContent = 'Draft terakhir dipulihkan dari perangkat ini.';
        showToast('Draft intake dipulihkan.', 'info');
    } catch (error) {
        console.error('Gagal memuat draft', error);
        showToast('Draft tidak bisa dibuka. Menggunakan form kosong.', 'error');
    }
}

function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraft, 400);
}

function saveDraft() {
    try {
        const fields = serializeFields();
        const payload = {
            version: 1,
            updatedAt: new Date().toISOString(),
            step: currentStep,
            fields,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        statusMessage.hidden = false;
        statusMessage.textContent = 'Draft otomatis tersimpan di perangkat ini.';
    } catch (error) {
        console.error('Gagal menyimpan draft', error);
    }
}

function collectPrefixed(formData, prefix) {
    const rows = {};
    formData.forEach((value, key) => {
        if (!key.startsWith(prefix) || value === '') {
            return;
        }
        const match = key.match(new RegExp(`^${prefix}([a-z_]+)_([0-9]+)$`));
        if (!match) {
            return;
        }
        const field = match[1];
        const rowIndex = match[2];
        if (!rows[rowIndex]) {
            rows[rowIndex] = {};
        }
        rows[rowIndex][field] = value;
    });
    return Object.keys(rows)
        .sort((a, b) => Number(a) - Number(b))
        .map((index) => ({ index: Number(index), ...rows[index] }));
}

function buildPayload() {
    const formData = new FormData(form);
    const payload = {};
    formData.forEach((value, key) => {
        if (value === '') {
            return;
        }
        if (key === 'risk_factors' || key === 'past_conditions') {
            if (!payload[key]) {
                payload[key] = [];
            }
            payload[key].push(value);
            return;
        }
        if (key === 'family_history') {
            if (!payload.family_history) {
                payload.family_history = [];
            }
            payload.family_history.push(value);
            return;
        }
        if (key === 'payment_method') {
            if (!payload.payment_method) {
                payload.payment_method = [];
            }
            const normalized = value.toString().trim().toLowerCase();
            if (normalized && !payload.payment_method.includes(normalized)) {
                payload.payment_method.push(normalized);
            }
            return;
        }
        if (key.startsWith('med_') || key.startsWith('visit_') || key.startsWith('preg_') || key.startsWith('lab_')) {
            return;
        }
        if (key === 'consent') {
            payload.consent = true;
            return;
        }
        if (key === 'final_ack') {
            payload.final_ack = true;
            return;
        }
        payload[key] = value;
    });
    payload.consent = document.getElementById('consent').checked;
    payload.final_ack = document.getElementById('final_ack')?.checked || false;
    payload.medications = collectPrefixed(formData, 'med_');
    payload.previousPregnancies = collectPrefixed(formData, 'preg_');
    payload.prenatalVisits = collectPrefixed(formData, 'visit_');
    payload.labResults = collectPrefixed(formData, 'lab_');
    const bmiValue = document.getElementById('bmi')?.value || null;
    const eddValue = eddField ? eddField.value || null : null;
    const lmpValue = lmpField ? lmpField.value || null : null;
    const eddSource = lmpValue
        ? (eddField?.dataset.userEdited === 'true' ? 'manual-override' : 'derived-from-lmp')
        : (eddField?.dataset.userEdited === 'true' ? 'manual-entry' : 'user-entered');
    payload.metadata = {
        currentStep: currentStep + 1,
        deviceTimestamp: new Date().toISOString(),
        bmiValue,
        bmiCategory: currentBMICategory,
        edd: {
            value: eddValue,
            source: eddSource,
            autoValue: lastAutoEdd,
            lmpReference: lmpValue,
        },
        obstetricTotals: currentObstetricTotals,
        riskFlags: currentRiskFlags,
        highRisk: currentRiskFlags.length > 0,
        stage: 'patient_reported',
        autoSaveKey: STORAGE_KEY,
    };
    payload.review = {
        status: 'patient_reported',
        verifiedBy: null,
        verifiedAt: null,
        sections: {},
    };
    payload.flags = {
        highRisk: currentRiskFlags.length > 0,
        consentSigned: Boolean(payload.consent),
        finalAcknowledged: Boolean(payload.final_ack),
    };
    payload.signature = {
        type: 'digital_name',
        value: patientSignatureField ? patientSignatureField.value : '',
    };

    const aliasTargets = {
        patient_name: 'full_name',
        patient_dob: 'dob',
        patient_phone: 'phone',
        patient_address: 'address',
        patient_marital_status: 'marital_status',
        patient_occupation: 'occupation',
        patient_education: 'education',
        patient_husband_name: 'husband_name',
        patient_insurance: 'insurance',
    };
    Object.entries(aliasTargets).forEach(([source, target]) => {
        if (payload[source] && !payload[target]) {
            payload[target] = payload[source];
        }
    });

    if (payload.payment_method && payload.payment_method.length) {
        payload.payment_method = Array.from(
            new Set(
                payload.payment_method
                    .map((value) => value.toString().trim().toLowerCase())
                    .filter(Boolean)
            )
        );
    }

    const normalizeYesNo = (value) => {
        if (!value) {
            return value;
        }
        const lowered = value.toString().trim().toLowerCase();
        if (['ya', 'yes', 'true'].includes(lowered)) {
            return 'Ya';
        }
        if (['tidak', 'no', 'false'].includes(lowered)) {
            return 'Tidak';
        }
        return value;
    };

    const mapValueLabel = (value, dictionary) => {
        if (!value) {
            return value;
        }
        const key = value.toString().trim().toLowerCase();
        return dictionary[key] || value;
    };

    const arrayify = (maybeArray) => {
        if (Array.isArray(maybeArray)) {
            return maybeArray.filter(Boolean);
        }
        if (maybeArray) {
            return [maybeArray];
        }
        return [];
    };

    const joinValues = (items) => {
        const normalized = (items || []).filter(Boolean);
        return normalized.length ? normalized.join('; ') : '';
    };

    if (payload.marital_status) {
        payload.marital_status = mapValueLabel(payload.marital_status, {
            single: 'Belum Menikah',
            menikah: 'Menikah',
            cerai: 'Cerai',
        });
    }

    if (payload.previous_contraception) {
        payload.previous_contraception = mapValueLabel(payload.previous_contraception, {
            pil: 'Pil',
            suntik_3_bulan: 'Suntik 3 bulan',
            implan: 'Implan',
            iud: 'IUD',
            steril: 'Steril',
            kondom: 'Kondom',
            kb_kalender: 'KB Kalender',
            senggama_terputus: 'Senggama terputus',
            vasektomi: 'Vasektomi',
            tidak_pernah: 'Tidak pernah',
        });
    }

    if (payload.kb_failure || payload.contraception_failure) {
        payload.contraception_failure = normalizeYesNo(payload.kb_failure || payload.contraception_failure);
    }

    if (payload.cycle_regular) {
        payload.cycle_regular = normalizeYesNo(payload.cycle_regular);
    }

    if (payload.current_contraception && !payload.failed_contraception_type) {
        payload.failed_contraception_type = payload.current_contraception;
    }

    if (payload.preg_test_date) {
        payload.pregnancy_test_date = payload.preg_test_date;
    }

    if (payload.lmp) {
        payload.lmp_date = payload.lmp;
    }

    if (payload.gravida) {
        payload.gravida_count = payload.gravida;
    }
    if (payload.para) {
        payload.para_count = payload.para;
    }
    if (payload.abortus) {
        payload.abortus_count = payload.abortus;
    }
    if (payload.living_children) {
        payload.living_children_count = payload.living_children;
    }

    if (payload.previousPregnancies && payload.previousPregnancies.length) {
        payload.previous_pregnancies = payload.previousPregnancies;
        payload.pregnancy_history = payload.previousPregnancies;
    }

    if (payload.prenatalVisits && payload.prenatalVisits.length) {
        payload.prenatal_care = payload.prenatalVisits;
    }

    if (payload.rhesus && !payload.rhesus_factor) {
        payload.rhesus_factor = mapValueLabel(payload.rhesus, {
            positive: 'Positif',
            negative: 'Negatif',
            unknown: 'Tidak tahu',
        });
    }

    payload.drug_allergies = payload.drug_allergies || payload.allergy_drugs || '';
    payload.food_allergies = payload.food_allergies || payload.allergy_food || '';
    payload.other_allergies = payload.other_allergies || payload.allergy_env || '';

    const pastConditions = arrayify(payload.past_conditions);
    payload.medical_conditions = pastConditions;
    const pastDetails = (payload.past_conditions_detail || '').trim();
    if (pastDetails) {
        payload.other_conditions = payload.other_conditions || pastDetails;
    }
    const pastHistorySummary = joinValues([...pastConditions, pastDetails]);
    if (pastHistorySummary) {
        payload.past_medical_history = payload.past_medical_history || pastHistorySummary;
    }

    const familyHistory = arrayify(payload.family_history);
    const familyDetails = (payload.family_history_detail || '').trim();
    const familySummary = joinValues([...familyHistory, familyDetails]);
    if (familySummary) {
        payload.family_medical_history = payload.family_medical_history || familySummary;
    }

    if (Array.isArray(payload.medications) && payload.medications.length) {
        const medications = payload.medications
            .map((med) => {
                const parts = [];
                if (med.name) parts.push(med.name);
                if (med.dose) parts.push(med.dose);
                if (med.freq) parts.push(med.freq);
                return parts.join(' ').trim();
            })
            .filter(Boolean);
        if (medications.length) {
            payload.current_medications = payload.current_medications || medications.join('; ');
        }
    }
    return payload;
}

function clearDraft() {
    localStorage.removeItem(STORAGE_KEY);
    statusMessage.hidden = true;
}

function updateDerived() {
    updateAge();
    updateBMI();
    updateEDDFromLMP();
    computeObstetricTotals();
    updateRiskFlags();
    updateGPALSummary();
    updateBSCSummary();
}

function updateAge() {
    const dob = document.getElementById('dob');
    const ageField = document.getElementById('age');
    if (!dob || !ageField || !dob.value) {
        updateRiskFlags();
        return;
    }
    const birth = new Date(dob.value);
    if (Number.isNaN(birth.valueOf())) {
        updateRiskFlags();
        return;
    }
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        years -= 1;
    }
    ageField.value = years >= 0 ? String(years) : '';
    updateRiskFlags();
}

function updateBMI() {
    const heightField = document.getElementById('height');
    const weightField = document.getElementById('weight');
    const bmiField = document.getElementById('bmi');
    if (!heightField || !weightField || !bmiField) {
        currentBMICategory = null;
        return;
    }
    const height = Number(heightField.value);
    const weight = Number(weightField.value);
    if (!height || !weight) {
        bmiField.value = '';
        BMI_SUMMARY.textContent = 'Kategori BMI akan muncul otomatis setelah menulis tinggi dan berat badan.';
        currentBMICategory = null;
        return;
    }
    const bmi = weight / ((height / 100) ** 2);
    const rounded = Math.round(bmi * 10) / 10;
    bmiField.value = rounded.toFixed(1);
    let category = 'Normal';
    if (rounded < 18.5) {
        category = 'Underweight';
    } else if (rounded >= 25 && rounded < 30) {
        category = 'Overweight';
    } else if (rounded >= 30) {
        category = 'Obesitas';
    }
    BMI_SUMMARY.textContent = `BMI Anda ${rounded.toFixed(1)} (${category}).`;
    currentBMICategory = category;
}

function updateEDDFromLMP() {
    if (!lmpField || !eddField) {
        return;
    }
    if (!lmpField.value) {
        lastAutoEdd = null;
        if (eddDateIntakeField) {
            eddDateIntakeField.value = '';
        }
        return;
    }
    const lmpDate = new Date(lmpField.value);
    if (Number.isNaN(lmpDate.valueOf())) {
        return;
    }
    const computed = new Date(lmpDate.getTime());
    computed.setDate(computed.getDate() + 280);
    const formatted = computed.toISOString().slice(0, 10);
    lastAutoEdd = formatted;

    // Update the new EDD intake field with formatted date
    if (eddDateIntakeField) {
        const eddDate = new Date(formatted);
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        const formattedDisplay = eddDate.toLocaleDateString('id-ID', options);
        eddDateIntakeField.value = formattedDisplay;
    }

    if (eddField.dataset.userEdited === 'true' && eddField.value) {
        return;
    }
    eddField.value = formatted;
}

function setTotalField(field, value) {
    if (!field) {
        return;
    }
    if (field.dataset.userEdited === 'true' && field.value !== '') {
        return;
    }
    field.value = value > 0 ? String(value) : '';
}

function computeObstetricTotals() {
    if (!pregnanciesTable) {
        return;
    }
    const rows = pregnanciesTable.querySelectorAll('tbody tr');
    let gravida = 0;
    let para = 0;
    let abortus = 0;
    let living = 0;
    rows.forEach((row) => {
        const inputs = Array.from(row.querySelectorAll('input, select'));
        const hasData = inputs.some((input) => input.value && input.value !== '');
        if (!hasData) {
            return;
        }
        gravida += 1;
        const aliveSelect = row.querySelector('select[name^="preg_alive_"]');
        const aliveValue = aliveSelect ? aliveSelect.value : '';
        if (aliveValue === 'ya') {
            para += 1;
            living += 1;
        } else if (aliveValue === 'tidak') {
            abortus += 1;
        }
    });
    currentObstetricTotals = { gravida, para, abortus, living };
    setTotalField(gravidaField, gravida);
    setTotalField(paraField, para);
    setTotalField(abortusField, abortus);
    setTotalField(livingChildrenField, living);
}

function addReason(list, reason) {
    if (!reason) {
        return;
    }
    if (!list.includes(reason)) {
        list.push(reason);
    }
}

function updateRiskFlags() {
    const reasons = [];
    const ageField = document.getElementById('age');
    const ageValue = Number(ageField?.value);
    if (ageValue && (ageValue < 18 || ageValue > 35)) {
        addReason(reasons, riskFactorLabels.age_extremes);
    }
    const riskChecked = Array.from(document.querySelectorAll('input[name="risk_factors"]:checked'));
    riskChecked.forEach((checkbox) => {
        addReason(reasons, riskFactorLabels[checkbox.value] || checkbox.value);
    });
    const pastChecked = Array.from(document.querySelectorAll('input[name="past_conditions"]:checked'));
    pastChecked.forEach((checkbox) => {
        const label = pastConditionLabels[checkbox.value];
        if (label) {
            addReason(reasons, `Riwayat: ${label}`);
        }
    });
    const complicationInputs = pregnanciesTable ? pregnanciesTable.querySelectorAll('input[name^="preg_complication_"]') : [];
    let hasComplication = false;
    complicationInputs.forEach((input) => {
        if (input.value && input.value.trim().length > 0) {
            hasComplication = true;
        }
    });
    if (hasComplication) {
        addReason(reasons, 'Terdapat catatan komplikasi pada kehamilan/persalinan sebelumnya.');
    }
    currentRiskFlags = reasons;
    if (riskAlert && riskList) {
        if (reasons.length) {
            riskAlert.hidden = false;
            riskList.innerHTML = reasons.map((reason) => `<div>• ${reason}</div>`).join('');
        } else {
            riskAlert.hidden = true;
            riskList.innerHTML = '';
        }
    }
}

function updateGPALSummary() {
    if (!gpalSummaryField) {
        return;
    }

    const gravida = pregnancyCountField ? parseInt(pregnancyCountField.value) || 0 : 0;
    const abortus = miscarriageCountField ? parseInt(miscarriageCountField.value) || 0 : 0;
    const living = livingCountField ? parseInt(livingCountField.value) || 0 : 0;
    const para = living > 0 ? living : 0;

    if (gravida === 0 && abortus === 0 && living === 0) {
        gpalSummaryField.value = '';
        return;
    }

    gpalSummaryField.value = `G${gravida} P${para} A${abortus} L${living}`;
}

function updateBSCSummary() {
    if (!bscSummaryField) {
        return;
    }

    const hasCsection = document.querySelector('input[name="has_csection"]:checked');

    if (!hasCsection || hasCsection.value === 'tidak') {
        bscSummaryField.value = '';
        return;
    }

    const lastYearsRadio = document.querySelector('input[name="last_csection_years"]:checked');

    if (!lastYearsRadio) {
        bscSummaryField.value = '';
        return;
    }

    if (lastYearsRadio.value === '<2') {
        bscSummaryField.value = 'BSC <2 tahun';
    } else if (lastYearsRadio.value === 'custom' && csectionYearsField) {
        const years = csectionYearsField.value;
        if (years) {
            bscSummaryField.value = `BSC ${years} tahun`;
        } else {
            bscSummaryField.value = '';
        }
    } else {
        bscSummaryField.value = '';
    }
}

function resetDerivedFlags() {
    if (eddField) {
        delete eddField.dataset.userEdited;
    }
    totalFields.forEach((field) => {
        if (field) {
            delete field.dataset.userEdited;
        }
    });
    lastAutoEdd = null;
}

function toggleFieldAvailability(field, shouldDisable) {
    if (!field) {
        return;
    }
    const container = field.closest('.field');
    field.disabled = shouldDisable;
    if (shouldDisable) {
        field.value = '';
    }
    if (container) {
        container.style.display = shouldDisable ? 'none' : '';
    }
}

function syncMaritalFields() {
    const status = maritalStatusField ? maritalStatusField.value : '';
    const disableSpouseFields = status === 'cerai';
    toggleFieldAvailability(husbandNameField, disableSpouseFields);
    toggleFieldAvailability(husbandAgeField, disableSpouseFields);
    toggleFieldAvailability(husbandJobField, disableSpouseFields);
}

function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';

    // Remove all spaces, dashes, and parentheses
    let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');

    // Handle different formats:
    // +628xxx -> 628xxx
    if (cleaned.startsWith('+62')) {
        cleaned = cleaned.substring(1);
    }
    // 08xxx -> 628xxx
    else if (cleaned.startsWith('08')) {
        cleaned = '62' + cleaned.substring(1);
    }
    // 8xxx -> 628xxx (missing leading 0)
    else if (cleaned.startsWith('8') && !cleaned.startsWith('62')) {
        cleaned = '62' + cleaned;
    }
    // 628xxx -> keep as is
    // Already in correct format

    return cleaned;
}

function applyPhoneFormatting(inputElement) {
    if (!inputElement) return;

    inputElement.addEventListener('blur', function() {
        const formatted = formatPhoneNumber(this.value);
        if (formatted && formatted !== this.value) {
            this.value = formatted;
            scheduleSave();
        }
    });

    // Also format on paste
    inputElement.addEventListener('paste', function(e) {
        setTimeout(() => {
            const formatted = formatPhoneNumber(this.value);
            if (formatted && formatted !== this.value) {
                this.value = formatted;
                scheduleSave();
            }
        }, 10);
    });
}

async function autoFillFromProfile() {
    try {
        // Import auth from vps-auth-v2.js
        const { auth } = await import('./vps-auth-v2.js');
        const user = auth.currentUser;

        if (!user) {
            console.log('No user logged in, skipping auto-fill');
            return;
        }

        // Check if form already has data (from draft restoration)
        const fullNameField = document.getElementById('full_name');
        const dobField = document.getElementById('dob');
        const phoneField = document.getElementById('phone');

        // Only auto-fill if fields are empty
        if (fullNameField && !fullNameField.value && user.name) {
            fullNameField.value = user.name;
        }

        if (dobField && !dobField.value && user.dob) {
            dobField.value = user.dob;
            updateAge(); // Trigger age calculation
        }

        if (phoneField && !phoneField.value && user.phone) {
            phoneField.value = formatPhoneNumber(user.phone);
        }

        scheduleSave();
    } catch (error) {
        console.error('Error auto-filling profile data:', error);
    }
}

// Prenatal row button removed - section deleted from form
// if (addPrenatalRowBtn) {
//     addPrenatalRowBtn.addEventListener('click', () => {
//         addDynamicRow(prenatalTable, createPrenatalRow);
//         computeObstetricTotals();
//     });
// }

if (addLabRowBtn) {
    addLabRowBtn.addEventListener('click', () => addDynamicRow(labTable, createLabRow));
}

totalFields.forEach((field) => {
    if (!field) {
        return;
    }
    field.addEventListener('input', () => {
        if (field.value === '') {
            delete field.dataset.userEdited;
        } else {
            field.dataset.userEdited = 'true';
        }
    });
});

if (eddField) {
    eddField.addEventListener('input', () => {
        if (eddField.value === '') {
            delete eddField.dataset.userEdited;
        } else {
            eddField.dataset.userEdited = 'true';
        }
    });
}

if (lmpField) {
    lmpField.addEventListener('change', () => {
        updateEDDFromLMP();
        scheduleSave();
    });
}

if (pregnanciesTable) {
    pregnanciesTable.addEventListener('input', () => {
        computeObstetricTotals();
        updateRiskFlags();
    });
}

document.querySelectorAll('input[name="risk_factors"], input[name="past_conditions"]').forEach((input) => {
    input.addEventListener('change', () => {
        updateRiskFlags();
        scheduleSave();
    });
});

// Event listeners for pregnancy history fields
if (pregnancyCountField) {
    pregnancyCountField.addEventListener('change', () => {
        updateGPALSummary();
        scheduleSave();
    });
}

if (miscarriageCountField) {
    miscarriageCountField.addEventListener('change', () => {
        updateGPALSummary();
        scheduleSave();
    });
}

if (livingCountField) {
    livingCountField.addEventListener('change', () => {
        updateGPALSummary();
        scheduleSave();
    });
}

// Event listeners for miscarriage radio buttons
document.querySelectorAll('input[name="has_miscarriage"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
        if (miscarriageCountField) {
            miscarriageCountField.disabled = e.target.value === 'tidak';
            if (e.target.value === 'tidak') {
                miscarriageCountField.value = '';
                updateGPALSummary();
            }
        }
        scheduleSave();
    });
});

// Event listeners for C-section fields
document.querySelectorAll('input[name="has_csection"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
        const hasCsection = e.target.value === 'pernah';

        if (csectionCountField) {
            csectionCountField.disabled = !hasCsection;
            if (!hasCsection) {
                csectionCountField.value = '';
            }
        }

        // Disable/enable last C-section year fields
        document.querySelectorAll('input[name="last_csection_years"]').forEach((yearRadio) => {
            yearRadio.disabled = !hasCsection;
            if (!hasCsection) {
                yearRadio.checked = false;
            }
        });

        if (csectionYearsField) {
            csectionYearsField.disabled = true;
            csectionYearsField.value = '';
        }

        updateBSCSummary();
        scheduleSave();
    });
});

// Event listeners for C-section count
if (csectionCountField) {
    csectionCountField.addEventListener('change', () => {
        scheduleSave();
    });
}

// Event listeners for last C-section years
document.querySelectorAll('input[name="last_csection_years"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
        if (csectionYearsField) {
            csectionYearsField.disabled = e.target.value !== 'custom';
            if (e.target.value !== 'custom') {
                csectionYearsField.value = '';
            }
        }
        updateBSCSummary();
        scheduleSave();
    });
});

// Event listener for C-section years dropdown
if (csectionYearsField) {
    csectionYearsField.addEventListener('change', () => {
        updateBSCSummary();
        scheduleSave();
    });
}

prevBtn.addEventListener('click', () => {
    updateStep(currentStep - 1);
});

nextBtn.addEventListener('click', () => {
    if (!validateStep(currentStep)) {
        return;
    }
    updateStep(currentStep + 1);
});

submitBtn.addEventListener('click', () => {
    form.requestSubmit();
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const isValid = form.checkValidity();
    if (!isValid) {
        form.reportValidity();
        return;
    }
    const payload = buildPayload();
    try {
        const response = await fetch('/api/patient-intake', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const result = await response.json().catch(() => null);
        const submissionId = result && typeof result === 'object' ? result.submissionId : undefined;
        clearDraft();
        showToast('Data berhasil dikirim. Terima kasih!', 'info');
        form.reset();
        resetDerivedFlags();
        updateDerived();
        updateStep(0);
        syncMaritalFields();
        statusMessage.hidden = false;
        statusMessage.textContent = submissionId
            ? `Data berhasil dikirim. Mohon simpan kode referensi ini: ${submissionId}.`
            : 'Data berhasil dikirim. Mohon tunjukkan bukti ini saat tiba di klinik.';
    } catch (error) {
        console.error('Submit intake gagal', error);
        showToast('Gagal mengirim data. Coba lagi atau simpan screenshot.', 'error');
    }
});

form.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        if (event.target.id === 'dob') {
            updateAge();
        }
        if (event.target.id === 'height' || event.target.id === 'weight') {
            updateBMI();
        }
        if (event.target.id === 'marital_status') {
            syncMaritalFields();
        }
        if (event.target.name && event.target.name.startsWith('preg_')) {
            computeObstetricTotals();
        }
        if (event.target.name === 'risk_factors' || event.target.name === 'past_conditions') {
            updateRiskFlags();
        }
        scheduleSave();
    }
});

prevBtn.disabled = true;
resetDerivedFlags();
restoreDraft();
refreshButtons();
updateDerived();
syncMaritalFields();

// Apply phone number formatting to phone and emergency contact fields
applyPhoneFormatting(document.getElementById('phone'));
applyPhoneFormatting(document.getElementById('emergency_contact'));

// Auto-fill from profile (only if fields are empty after draft restoration)
autoFillFromProfile();

// Check verification status on load
checkVerificationStatus();

// Verification Status Functions
async function checkVerificationStatus() {
    try {
        // Get phone number from form if filled or from localStorage
        const phoneField = document.getElementById('phone');
        const phone = phoneField ? phoneField.value : '';
        
        if (!phone) {
            // Try to get from saved draft
            const draft = getDraft();
            if (draft && draft.phone) {
                await checkVerificationByPhone(draft.phone);
            }
            return;
        }
        
        await checkVerificationByPhone(phone);
    } catch (error) {
        console.error('Error checking verification status:', error);
    }
}

async function checkVerificationByPhone(phone) {
    try {
        const response = await fetch(`/api/patient-intake/status?phone=${encodeURIComponent(phone)}`);
        if (!response.ok) return;
        
        const result = await response.json();
        if (result.success && result.data && result.data.status === 'verified' && result.data.reviewed_by) {
            showVerificationStatus(result.data);
        }
    } catch (error) {
        console.error('Error checking verification status:', error);
    }
}

function showVerificationStatus(verificationData) {
    const verificationSection = document.getElementById('verification-status');
    const verificationDetails = document.getElementById('verification-details');
    const reviewerStamp = document.getElementById('reviewer-stamp');
    
    if (verificationSection && verificationDetails && reviewerStamp) {
        const reviewDate = new Date(verificationData.reviewed_at);
        const formattedDate = reviewDate.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        verificationDetails.textContent = `Form rekam medis Anda telah diverifikasi pada ${formattedDate}`;
        reviewerStamp.textContent = `Review oleh ${verificationData.reviewed_by}`;
        
        // Hide form and show verification status
        const form = document.getElementById('intake-form');
        const buttons = document.querySelector('.buttons');
        if (form) form.style.display = 'none';
        if (buttons) buttons.style.display = 'none';
        verificationSection.style.display = 'block';
    }
}

// Add phone field change listener to check verification when phone is entered
if (document.getElementById('phone')) {
    document.getElementById('phone').addEventListener('blur', (event) => {
        if (event.target.value) {
            checkVerificationByPhone(event.target.value);
        }
    });
}
