const form = document.getElementById('intake-form');
const stepper = document.getElementById('stepper');
const allStepSections = Array.from(document.querySelectorAll('.intake-step'));
let steps = [];
let stepIndicator = [];
const prevBtn = document.getElementById('btn-prev');
const nextBtn = document.getElementById('btn-next');
const submitBtn = document.getElementById('btn-submit');
const toast = document.getElementById('toast');
const statusMessage = document.getElementById('status-message');
const STORAGE_KEY = 'dibya-intake-draft-v1';
const BMI_SUMMARY = document.getElementById('bmi-summary');
const heightField = document.getElementById('height');
const heightUnknownCheckbox = document.getElementById('height_unknown');
const maritalStatusField = document.getElementById('marital_status');
const husbandNameField = document.getElementById('husband_name');
const husbandAgeField = document.getElementById('husband_age');
const husbandJobField = document.getElementById('husband_job');
const riskAlert = document.getElementById('risk-alert');
const riskList = document.getElementById('risk-list');
const lmpField = document.getElementById('lmp');
const eddField = document.getElementById('edd');
const gravidaField = document.getElementById('gravida');
const paraField = document.getElementById('para');
const abortusField = document.getElementById('abortus');
const livingChildrenField = document.getElementById('living_children');
const pregnanciesTable = document.querySelector('table[data-collection="pregnancies"]');
const previousPregnancySection = document.getElementById('previous-pregnancy-section');
// Prenatal and Lab sections removed - will be filled by staff
// const prenatalTable = document.querySelector('table[data-collection="prenatal"]');
// const labTable = document.querySelector('table[data-collection="labs"]');
// const addPrenatalRowBtn = document.getElementById('add-prenatal-row');
// const addLabRowBtn = document.getElementById('add-lab-row');
const patientSignatureField = document.getElementById('patient_signature');
const categoryField = document.getElementById('intake_category');
const lmpDateIntake = document.getElementById('lmp_date_intake');
const eddDateIntake = document.getElementById('edd_date_intake');
const gaWeeksIntake = document.getElementById('ga_weeks_intake');
const gaDaysIntake = document.getElementById('ga_days_intake');
const positiveTestDate = document.getElementById('positive_test_date');
const categorySummary = null; // Removed from UI but referenced in code
const categoryTag = null; // Removed from UI but referenced in code
const categoryDescription = null; // Removed from UI but referenced in code
const categorySpecificBlocks = Array.from(document.querySelectorAll('[data-category-visible]'));
const fertilityProgramSelect = document.getElementById('fertility_program_interest');
const fertilityHistorySection = document.getElementById('fertility-history-section');
let currentStep = 0;
let activeCategory = normalizeCategory(categoryField && categoryField.value ? categoryField.value : null);

// Generate ISO timestamp in GMT+7 (Jakarta/Indonesian time)
function getGMT7Timestamp() {
    const now = new Date();
    // Get time in GMT+7 by adding 7 hours offset
    const gmt7Time = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    // Return ISO string but replace Z with +07:00
    return gmt7Time.toISOString().replace('Z', '+07:00');
}
let saveTimer;
let currentRiskFlags = [];
let currentBMICategory = null;
let currentObstetricTotals = { gravida: 0, para: 0, abortus: 0, living: 0 };
let lastAutoEdd = null;

const riskFactorLabels = {
    age_extremes: 'Usia ibu di bawah 18 tahun atau di atas 35 tahun',
    hypertension: 'Tekanan Darah Tinggi',
    diabetes: 'Gula Darah Tinggi',
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
    cyst_myoma: 'Kista/Myoma',
    asthma: 'Asma',
    autoimmune: 'Penyakit autoimun',
    mental: 'Kondisi kesehatan mental',
    surgery: 'Riwayat operasi mayor',
    blood: 'Kelainan darah',
};

const totalFields = [gravidaField, paraField, abortusField, livingChildrenField];

const CATEGORY_SUMMARY_COPY = {
    obstetri: {
        label: 'Pasien Obstetri',
        description: 'Formulir fokus pada riwayat antenatal dan kehamilan yang sedang berlangsung.'
    },
    gyn_repro: {
        label: 'Pasien Ginekologi Reproduktif',
        description: 'Formulir untuk konsultasi promil, kontrasepsi, dan perencanaan reproduksi.'
    },
    gyn_special: {
        label: 'Pasien Ginekologi Khusus',
        description: 'Formulir untuk keluhan ginekologi spesifik seperti gangguan haid atau nyeri.'
    },
    admin_followup: {
        label: 'Butuh Tindak Lanjut Admin',
        description: 'Tim admin akan menghubungi Anda terlebih dahulu sebelum menjadwalkan konsultasi.'
    }
};

function normalizeCategory(value) {
    if (!value) {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
}

function getSelectedValue(inputs) {
    return inputs.find((input) => input.checked)?.value || null;
}

function setRadioRequired(inputs, required) {
    inputs.forEach((input, index) => {
        if (index === 0) {
            input.required = required;
        } else {
            input.required = false;
        }
    });
}


function applyHeightUnknownState() {
    if (!heightField) {
        return;
    }
    const unknown = Boolean(heightUnknownCheckbox?.checked);
    if (unknown) {
        heightField.value = '';
        heightField.disabled = true;
        heightField.placeholder = 'Tidak diketahui';
    } else {
        heightField.disabled = false;
        heightField.placeholder = 'Contoh: 160';
    }
    updateBMI();
}

function updateCategorySummary() {
    if (!categorySummary || !categoryTag || !categoryDescription) {
        return;
    }
    if (!activeCategory) {
        categorySummary.hidden = true;
        categoryTag.textContent = '';
        categoryDescription.textContent = '';
        return;
    }
    const copy = CATEGORY_SUMMARY_COPY[activeCategory] || null;
    if (!copy) {
        categorySummary.hidden = true;
        categoryTag.textContent = '';
        categoryDescription.textContent = '';
        return;
    }
    categoryTag.textContent = copy.label;
    categoryDescription.textContent = copy.description;
    categorySummary.hidden = false;
}

function toggleCategoryBlockInputs(element, shouldEnable) {
    if (!element) {
        return;
    }
    const controls = element.querySelectorAll('input, select, textarea');
    controls.forEach((control) => {
        if (!control.dataset.categoryOriginalDisabled) {
            control.dataset.categoryOriginalDisabled = control.disabled ? 'true' : 'false';
        }
        if (shouldEnable) {
            const wasDisabled = control.dataset.categoryOriginalDisabled === 'true';
            control.disabled = wasDisabled;
        } else {
            control.disabled = true;
        }
    });
}

function clearSectionValues(section) {
    if (!section) {
        return;
    }
    const controls = section.querySelectorAll('input, select, textarea');
    controls.forEach((control) => {
        if (control.type === 'checkbox' || control.type === 'radio') {
            control.checked = false;
        } else {
            control.value = '';
        }
    });
}

function updateCategorySpecificBlocks() {
    if (!categorySpecificBlocks || categorySpecificBlocks.length === 0) {
        return;
    }
    categorySpecificBlocks.forEach((element) => {
        const categoriesAttr = element.dataset.categoryVisible || '';
        const categories = categoriesAttr.split(',').map((value) => value.trim()).filter(Boolean);
        let shouldShow = true;
        if (categories.length) {
            if (categories.includes('all')) {
                shouldShow = true;
            } else if (!activeCategory) {
                shouldShow = false;
            } else {
                shouldShow = categories.includes(activeCategory);
            }
        }
        element.hidden = !shouldShow;
        toggleCategoryBlockInputs(element, shouldShow);
    });
    updateFertilitySectionVisibility();
}

function updateFertilitySectionVisibility() {
    const programValue = (fertilityProgramSelect && fertilityProgramSelect.value) ? fertilityProgramSelect.value.toLowerCase() : '';
    const isGynRepro = activeCategory === 'gyn_repro';

    if (fertilityHistorySection) {
        const showFertility = isGynRepro && programValue === 'ya';
        fertilityHistorySection.hidden = !showFertility;
        toggleCategoryBlockInputs(fertilityHistorySection, showFertility);
        if (!showFertility && programValue !== 'ya') {
            clearSectionValues(fertilityHistorySection);
        }
    }

    if (previousPregnancySection) {
        if (isGynRepro) {
            const showPregnancyHistory = programValue !== 'ya';
            previousPregnancySection.hidden = !showPregnancyHistory;
            toggleCategoryBlockInputs(previousPregnancySection, showPregnancyHistory);
            if (!showPregnancyHistory) {
                clearSectionValues(previousPregnancySection);
            }
        } else {
            previousPregnancySection.hidden = false;
            toggleCategoryBlockInputs(previousPregnancySection, true);
        }
    }
}

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

function sectionMatchesCategory(section) {
    if (!section) {
        return false;
    }
    const requiresCategory = section.dataset.requiresCategory !== 'false';
    const categoriesAttr = section.dataset.categories || 'obstetri';
    const categories = categoriesAttr.split(',').map((value) => value.trim()).filter(Boolean);
    if (!activeCategory && requiresCategory) {
        return false;
    }
    if (categories.includes('all')) {
        return true;
    }
    if (!activeCategory) {
        return false;
    }
    return categories.includes(activeCategory);
}

function applyStepVisibility() {
    const activeSection = steps[currentStep] || null;
    allStepSections.forEach((section) => {
        if (!section) {
            return;
        }
        const isVisible = steps.includes(section) && section === activeSection;
        section.classList.toggle('active', isVisible);
        if (!steps.includes(section)) {
            section.classList.remove('active');
        }
    });
    stepIndicator.forEach((indicator, index) => {
        indicator.classList.toggle('active', index === currentStep);
    });
}

function rebuildSteps() {
    steps = allStepSections.filter((section) => sectionMatchesCategory(section));
    if (stepper) {
        const fragment = document.createDocumentFragment();
        const indicators = [];
        steps.forEach((section, index) => {
            const span = document.createElement('span');
            span.textContent = section.dataset.stepTitle || section.querySelector('.step-title')?.textContent || `Langkah ${index + 1}`;
            fragment.appendChild(span);
            indicators.push(span);
        });
        stepper.innerHTML = '';
        stepper.appendChild(fragment);
        stepIndicator = indicators;
    }
    if (steps.length === 0) {
        currentStep = 0;
    } else if (currentStep >= steps.length) {
        currentStep = steps.length - 1;
    }
    applyStepVisibility();
    refreshButtons();
}

function setActiveCategory(category) {
    const normalized = normalizeCategory(category);
    const previousCategory = activeCategory;
    activeCategory = normalized;
    if (categoryField) {
        categoryField.value = normalized || '';
    }
    updateCategorySummary();
    updateCategorySpecificBlocks();
    if (normalized !== previousCategory) {
        rebuildSteps();
    } else {
        if (!steps.length) {
            rebuildSteps();
        } else {
            applyStepVisibility();
            refreshButtons();
        }
    }
}

// Simple category derivation - all patients are obstetri for now
function deriveCategoryFromRouting() {
    // All patients filling this form are obstetri patients
    return 'obstetri';
}

function updateRoutingVisibility() {
    // No routing needed - all obstetri
}

function handleRoutingChange() {
    updateRoutingVisibility();
    const derived = deriveCategoryFromRouting();
    setActiveCategory(derived);
    scheduleSave();
}

function createPrenatalRow(index) {
    const tr = document.createElement('tr');
    tr.dataset.index = String(index);
    tr.innerHTML = `
        <td class="row-number">${index}</td>
        <td><input type="date" name="visit_date_${index}"></td>
        <td><input type="number" name="visit_ga_${index}" min="0" max="45"></td>
        <td><input type="number" name="visit_weight_${index}" step="0.1"></td>
        <td><input type="text" name="visit_bp_${index}" placeholder="120/80"></td>
        <td><input type="number" name="visit_fhr_${index}" min="60" max="220"></td>
        <td><textarea name="visit_note_${index}" rows="1" placeholder="opsional"></textarea></td>
    `;
    return tr;
}

// Lab section removed - will be filled by staff in Data Pasien
// function createLabRow(index) {
//     const tr = document.createElement('tr');
//     tr.dataset.index = String(index);
//     tr.innerHTML = `
//         <td><input type="text" name="lab_test_${index}" placeholder="Nama tes"></td>
//         <td><input type="text" name="lab_recommend_${index}" placeholder="Waktu rekomendasi"></td>
//         <td><input type="date" name="lab_date_${index}"></td>
//         <td><textarea name="lab_result_${index}" rows="1" placeholder="hasil"></textarea></td>
//         <td><textarea name="lab_follow_${index}" rows="1" placeholder="tindak lanjut"></textarea></td>
//     `;
//     return tr;
// }

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
    // Tables removed - data will be filled by staff
    // if (group === 'visit') {
    //     ensureTableRow(prenatalTable, createPrenatalRow, index);
    // } else if (group === 'lab') {
    //     ensureTableRow(labTable, createLabRow, index);
    // }
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
    currentStep = target;
    applyStepVisibility();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    refreshButtons();
    scheduleSave();
}

function refreshButtons() {
    const totalSteps = steps.length;
    prevBtn.disabled = currentStep === 0;

    if (totalSteps <= 1) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'none';
        return;
    }

    if (currentStep === totalSteps - 1) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'block';
    } else {
        nextBtn.style.display = 'block';
        submitBtn.style.display = 'none';
    }
}

function validateStep(stepIndex) {
    const section = steps[stepIndex];
    if (!section) {
        return true;
    }
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

// Load existing intake data from server
async function loadExistingIntake() {
    try {
        const token = localStorage.getItem('patient_token');
        if (!token) {
            console.log('[Patient Intake] No patient token, skipping server load');
            return null;
        }
        
        console.log('[Patient Intake] Attempting to load existing intake from server...');
        const response = await fetch('/api/patient-intake/my-intake', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('[Patient Intake] Server response status:', response.status);
        
        if (!response.ok) {
            console.error('[Patient Intake] Failed to load intake from server, status:', response.status);
            return null;
        }
        
        const result = await response.json();
        console.log('[Patient Intake] Server response:', result);
        
        if (result.success && result.data) {
            console.log('[Patient Intake] ✅ Loaded existing intake from server:', result.data.submissionId);
            return result.data;
        }
        
        console.log('[Patient Intake] No existing intake data found');
        return null;
    } catch (error) {
        console.error('[Patient Intake] ❌ Error loading existing intake:', error);
        return null;
    }
}

// Restore intake data into form
function restoreIntakeData(payload, intakeData = null) {
    if (!payload) return;
    
    try {
        // Restore all fields from payload
        Object.entries(payload).forEach(([name, value]) => {
            if (name === 'metadata' || name === 'review') return;
            
            ensureDynamicField(name);
            const controls = form.querySelectorAll(`[name="${escapeName(name)}"]`);
            if (!controls.length) {
                return;
            }
            controls.forEach((control) => {
                if (control.type === 'checkbox') {
                    if (name === 'consent' || name === 'final_ack') {
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

        updateRoutingVisibility();
        const storedCategory = normalizeCategory(payload.intake_category || payload?.metadata?.intakeCategory || null);
        const derivedCategory = deriveCategoryFromRouting();
        setActiveCategory(storedCategory || derivedCategory);
        applyStepVisibility();
        refreshButtons();
        
        updateDerived();
        syncMaritalFields();
        applyHeightUnknownState();
        statusMessage.hidden = false;
        statusMessage.className = 'summary alert-info';
        const quickId = intakeData?.quickId;
        const quickIdText = quickId ? ` (No. RM: ${quickId})` : '';
        statusMessage.innerHTML = `<strong>📋 Mode Perbarui${quickIdText}:</strong> Data formulir rekam medis awal Anda telah dimuat. Anda dapat memperbarui informasi jika diperlukan. Tidak perlu membuat formulir baru.`;
        showToast('Data rekam medis awal berhasil dimuat.', 'info');
    } catch (error) {
        console.error('Gagal restore intake data', error);
    }
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
        updateRoutingVisibility();
        const storedCategory = normalizeCategory(draft.category || null);
        const derivedCategory = deriveCategoryFromRouting();
        setActiveCategory(storedCategory || derivedCategory);

        if (typeof step === 'number' && steps.length) {
            const targetStep = Math.max(0, Math.min(step, steps.length - 1));
            updateStep(targetStep);
        } else {
            applyStepVisibility();
            refreshButtons();
        }
        updateDerived();
        syncMaritalFields();
        applyHeightUnknownState();
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
            updatedAt: getGMT7Timestamp(),
            step: currentStep,
            category: activeCategory,
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
        deviceTimestamp: getGMT7Timestamp(),
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
    const bmiField = document.getElementById('bmi');
    if (!bmiField) {
        currentBMICategory = null;
        return;
    }
    const defaultMessage = 'BMI akan dihitung oleh tim klinik saat kunjungan.';
    if (!heightField) {
        bmiField.value = '';
        if (BMI_SUMMARY) {
            BMI_SUMMARY.textContent = defaultMessage;
        }
        currentBMICategory = null;
        return;
    }
    if (heightUnknownCheckbox?.checked) {
        bmiField.value = '';
        if (BMI_SUMMARY) {
            BMI_SUMMARY.textContent = defaultMessage;
        }
        currentBMICategory = null;
        return;
    }
    const weightField = document.getElementById('weight');
    if (!weightField) {
        bmiField.value = '';
        if (BMI_SUMMARY) {
            BMI_SUMMARY.textContent = defaultMessage;
        }
        currentBMICategory = null;
        return;
    }
    const height = Number(heightField.value);
    const weight = Number(weightField.value);
    if (!height || !weight) {
        bmiField.value = '';
        if (BMI_SUMMARY) {
            BMI_SUMMARY.textContent = defaultMessage;
        }
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
    if (BMI_SUMMARY) {
        BMI_SUMMARY.textContent = `BMI Anda ${rounded.toFixed(1)} (${category}).`;
    }
    currentBMICategory = category;
}

function updateEDDFromLMP() {
    if (!lmpField || !eddField) {
        return;
    }
    if (!lmpField.value) {
        lastAutoEdd = null;
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
    const disableSpouseFields = status === 'cerai' || status === 'single';
    toggleFieldAvailability(husbandNameField, disableSpouseFields);
    toggleFieldAvailability(husbandAgeField, disableSpouseFields);
    toggleFieldAvailability(husbandJobField, disableSpouseFields);
}

// Prenatal and Lab buttons removed - tables will be filled by staff
// if (addPrenatalRowBtn) {
//     addPrenatalRowBtn.addEventListener('click', () => {
//         addDynamicRow(prenatalTable, createPrenatalRow);
//         computeObstetricTotals();
//     });
// }

// if (addLabRowBtn) {
//     addLabRowBtn.addEventListener('click', () => addDynamicRow(labTable, createLabRow));
// }

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

let isSubmitting = false;
let existingIntakeId = null; // Store existing intake submission ID

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    // Prevent double submission
    if (isSubmitting) {
        console.log('Form is already being submitted, ignoring duplicate request');
        return;
    }
    
    const isValid = form.checkValidity();
    if (!isValid) {
        form.reportValidity();
        return;
    }
    
    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = existingIntakeId ? 'Memperbarui...' : 'Mengirim...';
    
    const payload = buildPayload();
    const token = localStorage.getItem('patient_token');
    
    try {
        // Use PUT if updating existing intake, POST if creating new
        const url = existingIntakeId ? '/api/patient-intake/my-intake' : '/api/patient-intake';
        const method = existingIntakeId ? 'PUT' : 'POST';
        
        const headers = {
            'Content-Type': 'application/json',
        };
        
        // Add token if available (for PUT request)
        if (token && existingIntakeId) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(payload),
        });
        
        // Handle duplicate submission error (409 Conflict)
        if (response.status === 409) {
            const errorResult = await response.json().catch(() => null);
            if (errorResult && errorResult.code === 'DUPLICATE_SUBMISSION' && errorResult.shouldUpdate) {
                console.log('Duplicate submission detected, converting to update...');
                showToast('Anda sudah memiliki formulir. Mengalihkan ke mode perbarui...', 'info');
                
                // Reload the page to load existing data
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
                return;
            }
        }
        
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        const result = await response.json().catch(() => null);
        const quickId = result && typeof result === 'object' ? result.quickId : undefined;
        clearDraft();
        
        const successMessage = existingIntakeId 
            ? 'Data berhasil diperbarui. Terima kasih!' 
            : 'Data berhasil dikirim. Terima kasih!';
        showToast(successMessage, 'info');
        
        // Show success message briefly before redirect
        statusMessage.hidden = false;
        if (existingIntakeId) {
            statusMessage.textContent = 'Data berhasil diperbarui. Mengalihkan ke dashboard...';
        } else {
            statusMessage.textContent = quickId
                ? `Data berhasil dikirim dengan Nomor Rekam Medis: ${quickId}. Mengalihkan ke dashboard...`
                : 'Data berhasil dikirim. Mengalihkan ke dashboard...';
        }
        
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
            window.location.href = '/patient-dashboard.html';
        }, 2000);
    } catch (error) {
        console.error('Submit intake gagal', error);
        showToast('Gagal mengirim data. Coba lagi atau simpan screenshot.', 'error');
    } finally {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Kirim Data';
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

if (heightUnknownCheckbox) {
    heightUnknownCheckbox.addEventListener('change', () => {
        applyHeightUnknownState();
        scheduleSave();
    });
}

prevBtn.disabled = true;

// All patients are obstetri - set category immediately
if (categoryField) {
    categoryField.value = 'obstetri';
    setActiveCategory('obstetri');
}

if (fertilityProgramSelect) {
    fertilityProgramSelect.addEventListener('change', () => {
        updateFertilitySectionVisibility();
        scheduleSave();
    });
}

updateRoutingVisibility();
const initialCategory = deriveCategoryFromRouting() || activeCategory;
setActiveCategory(initialCategory);

resetDerivedFlags();

// Initialize: Load existing intake from server first, then fallback to draft
(async function initializeForm() {
    const existingIntake = await loadExistingIntake();
    if (existingIntake && existingIntake.payload) {
        existingIntakeId = existingIntake.submissionId;
        restoreIntakeData(existingIntake.payload, existingIntake);
        submitBtn.textContent = 'Perbarui Data';
        
        // Update header to show update mode
        const formTitle = document.getElementById('form-title');
        const formDescription = document.getElementById('form-description');
        const quickIdDisplay = existingIntake.quickId ? ` (No. RM: ${existingIntake.quickId})` : '';
        if (formTitle) {
            formTitle.innerHTML = `Form Riwayat Antenatal <span style="color: #16a34a; font-size: 0.9em;">• Mode Perbarui${quickIdDisplay}</span>`;
        }
        if (formDescription) {
            formDescription.textContent = 'Anda sudah memiliki formulir. Perbarui informasi jika ada perubahan.';
        }
        
        // Scroll to top to show the info message
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        restoreDraft();
        // Show draft message if there's draft data
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            statusMessage.hidden = false;
            statusMessage.className = 'summary';
            statusMessage.textContent = 'Data tersimpan sementara di perangkat Anda.';
        }
    }
    refreshButtons();
    updateDerived();
    syncMaritalFields();
    applyHeightUnknownState();
    updateFertilitySectionVisibility();
})();

//restoreDraft();
//refreshButtons();
//updateDerived();
//syncMaritalFields();

// Payment method checkbox logic
const paymentInsuranceCheckbox = document.getElementById('payment_insurance');
const insuranceNameField = document.getElementById('insurance_name');

if (paymentInsuranceCheckbox && insuranceNameField) {
    paymentInsuranceCheckbox.addEventListener('change', function() {
        if (this.checked) {
            insuranceNameField.style.display = 'block';
            insuranceNameField.required = true;
        } else {
            insuranceNameField.style.display = 'none';
            insuranceNameField.required = false;
            insuranceNameField.value = '';
        }
    });
}

// Auto-calculate EDD and GA from LMP - Intake Form Version
if (lmpDateIntake) {
    // Function to format date in Indonesian style
    function formatIndonesianDate(date) {
        const months = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
        ];
        const day = date.getDate();
        const month = months[date.getMonth()];
        const year = date.getFullYear();
        return `${day} ${month} ${year}`;
    }

    // Calculate EDD and GA when LMP changes
    lmpDateIntake.addEventListener('change', function(e) {
        const lmpValue = e.target.value;
        if (!lmpValue) {
            // Clear fields if LMP is cleared
            if (eddDateIntake) eddDateIntake.value = '';
            if (gaWeeksIntake) gaWeeksIntake.value = '';
            if (gaDaysIntake) gaDaysIntake.value = '';
            return;
        }

        const lmpDate = new Date(lmpValue);
        if (isNaN(lmpDate.getTime())) {
            alert('Tanggal HPHT tidak valid');
            return;
        }

        // Calculate EDD using Naegele's Rule: LMP + 280 days (40 weeks)
        const eddDate = new Date(lmpDate);
        eddDate.setDate(eddDate.getDate() + 280);

        // Format EDD in Indonesian style
        if (eddDateIntake) {
            eddDateIntake.value = formatIndonesianDate(eddDate);
        }

        // Calculate current GA (Gestational Age)
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time for accurate day calculation

        const diffMs = today - lmpDate;
        if (diffMs < 0) {
            // LMP is in the future
            if (gaWeeksIntake) gaWeeksIntake.value = '0';
            if (gaDaysIntake) gaDaysIntake.value = '0';
            alert('Perhatian: HPHT yang dipilih adalah tanggal yang akan datang.');
        } else {
            const totalDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
            const weeks = Math.floor(totalDays / 7);
            const days = totalDays % 7;

            if (gaWeeksIntake) gaWeeksIntake.value = weeks;
            if (gaDaysIntake) gaDaysIntake.value = days;

            // Visual feedback for different trimesters
            if (gaWeeksIntake) {
                if (weeks < 13) {
                    gaWeeksIntake.style.color = '#17a2b8'; // Info blue for 1st trimester
                } else if (weeks < 27) {
                    gaWeeksIntake.style.color = '#28a745'; // Green for 2nd trimester
                } else if (weeks < 42) {
                    gaWeeksIntake.style.color = '#ffc107'; // Yellow for 3rd trimester
                } else {
                    gaWeeksIntake.style.color = '#dc3545'; // Red for post-term
                }
            }
        }
    });

    // Trigger calculation on page load if LMP already has a value
    if (lmpDateIntake.value) {
        lmpDateIntake.dispatchEvent(new Event('change'));
    }
}

// Pregnancy history table row visibility based on pregnancy number
const pregnancyNumberSelect = document.getElementById('pregnancy_number');
if (pregnancyNumberSelect) {
    pregnancyNumberSelect.addEventListener('change', function() {
        const selectedNumber = parseInt(this.value);

        // Hide all rows first
        for (let i = 1; i <= 8; i++) {
            const row = document.getElementById(`pregnancy-row-${i}`);
            if (row) {
                row.style.display = 'none';
            }
        }

        // Show rows based on selection
        // If pregnancy #2, show row 1 (previous child)
        // If pregnancy #3, show rows 1 & 2 (2 previous children)
        // etc.
        if (selectedNumber > 1 && selectedNumber <= 9) {
            const numberOfPreviousPregnancies = selectedNumber - 1;
            for (let i = 1; i <= numberOfPreviousPregnancies; i++) {
                const row = document.getElementById(`pregnancy-row-${i}`);
                if (row) {
                    row.style.display = 'table-row';
                }
            }
        }
    });

    // Trigger on page load if value exists
    if (pregnancyNumberSelect.value) {
        pregnancyNumberSelect.dispatchEvent(new Event('change'));
    }
}
