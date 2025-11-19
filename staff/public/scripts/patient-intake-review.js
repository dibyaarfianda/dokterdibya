import { getIdToken, auth, onAuthStateChanged, signOut, initAuth } from './vps-auth-v2.js';
import { initRealtimeSync } from './realtime-sync.js';

const API_BASE = (() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return window.location.origin.replace(/\/$/, '');
})();

const STATUS_LABELS = {
    patient_reported: 'Patient Reported',
    in_progress: 'In Progress',
    needs_follow_up: 'Needs Follow Up',
    verified: 'Verified',
    rejected: 'Rejected',
};

const STATUS_BADGE = {
    patient_reported: 'badge-secondary',
    in_progress: 'badge-info',
    needs_follow_up: 'badge-warning',
    verified: 'badge-success',
    rejected: 'badge-danger',
};

const VALID_INTAKE_CATEGORIES = new Set(['obstetri', 'gyn_repro', 'gyn_special', 'admin_followup']);
const INTAKE_CATEGORY_LABELS = {
    obstetri: 'Obstetri (Kehamilan)',
    gyn_repro: 'Ginekologi Reproduksi',
    gyn_special: 'Ginekologi Spesialis',
    admin_followup: 'Tindak Lanjut Admin',
};

const REPRO_GOAL_LABELS = {
    promil: 'Program hamil / promil',
    kb_setup: 'Pasang/lepas alat kontrasepsi',
    fertility_check: 'Pemeriksaan kesuburan',
    pre_marital: 'Konsultasi pra-nikah',
    cycle_planning: 'Mengatur siklus/menunda haid',
    other: 'Lainnya',
};

const PAST_CONDITION_LABELS = {
    hipertensi: 'Hipertensi',
    diabetes: 'Diabetes',
    heart: 'Penyakit jantung',
    kidney: 'Gangguan ginjal',
    thyroid: 'Gangguan tiroid',
    cyst_myoma: 'Kista/Myoma',
    asthma: 'Asma',
    autoimmune: 'Penyakit autoimun',
    mental: 'Kondisi kesehatan mental',
    surgery: 'Riwayat operasi',
    blood: 'Kelainan darah',
};

const FAMILY_HISTORY_LABELS = {
    hipertensi: 'Hipertensi',
    diabetes: 'Diabetes',
    heart: 'Penyakit jantung',
    stroke: 'Stroke',
    cancer: 'Kanker',
    kidney: 'Gangguan ginjal',
    thyroid: 'Gangguan tiroid',
    asthma: 'Asma',
    mental: 'Kondisi kesehatan mental',
    blood: 'Kelainan darah',
    genetic: 'Kelainan genetik',
};

const FERTILITY_ASSESSMENT_LABELS = {
    diagnosedPcos: 'Diagnosis PCOS',
    diagnosedGyneConditions: 'Riwayat miom/kista/endometriosis',
    transvaginalUsg: 'USG transvaginal kesuburan',
    hsgHistory: 'Pemeriksaan HSG',
    previousPrograms: 'Program hamil sebelumnya',
    partnerSmoking: 'Pasangan merokok',
    partnerAlcohol: 'Pasangan mengonsumsi alkohol',
    spermAnalysis: 'Analisa sperma',
    preferNaturalProgram: 'Prefer promil alami',
    willingHormonalTherapy: 'Bersedia terapi hormonal',
};

function trimToNull(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
}

function normalizeChoice(value) {
    const trimmed = trimToNull(value);
    return trimmed ? trimmed.toLowerCase() : null;
}

function ensureArray(value) {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value
            .map((item) => trimToNull(item))
            .filter((item) => item !== null);
    }
    const single = trimToNull(value);
    return single ? [single] : [];
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function formatChoiceDisplay(value) {
    if (!value && value !== 0) {
        return null;
    }
    const normalized = typeof value === 'string' ? value.toLowerCase() : value;
    if (normalized === 'ya' || normalized === 'yes') {
        return 'Ya';
    }
    if (normalized === 'tidak' || normalized === 'no') {
        return 'Tidak';
    }
    if (typeof normalized === 'string') {
        return normalized
            .split('_')
            .filter((segment) => segment.length)
            .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(' ');
    }
    return normalized;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createDisplayLines(value) {
    if (value === null || value === undefined || value === '') {
        return [];
    }
    if (Array.isArray(value)) {
        return value
            .map((entry) => {
                if (entry && typeof entry === 'object') {
                    const label = entry.label ? `${entry.label}: ` : '';
                    const lines = createDisplayLines(entry.value);
                    return lines.map((line) => `${label}${line}`);
                }
                const text = trimToNull(entry);
                return text ? [text] : [];
            })
            .flat();
    }
    if (typeof value === 'object') {
        if ('label' in value || 'value' in value) {
            const label = value.label ? `${value.label}: ` : '';
            const lines = createDisplayLines(value.value);
            return lines.map((line) => `${label}${line}`);
        }
        return Object.entries(value)
            .map(([key, val]) => {
                const lines = createDisplayLines(val);
                return lines.map((line) => `${key}: ${line}`);
            })
            .flat();
    }
    const text = trimToNull(value);
    return text ? [text] : [];
}

function renderValue(value) {
    const lines = createDisplayLines(value);
    if (!lines.length) {
        return null;
    }
    return lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
}

function renderDefinitionRow(label, value) {
    const content = renderValue(value);
    if (!content) {
        return '';
    }
    return `<dt class="col-sm-4">${escapeHtml(label)}</dt><dd class="col-sm-8">${content}</dd>`;
}

function formatMeasurement(value, unit) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    return `${value} ${unit}`;
}

function buildRoutingSnapshot(payload = {}) {
    return {
        pregnantStatus: normalizeChoice(payload.pregnant_status),
        needsReproductive: normalizeChoice(payload.needs_reproductive),
        hasGynIssue: normalizeChoice(payload.has_gyn_issue),
    };
}

function buildRoutingSummary(routing) {
    if (!routing || typeof routing !== 'object') {
        return '-';
    }
    const parts = [];
    if (routing.pregnantStatus) {
        parts.push(`Sedang hamil: ${formatChoiceDisplay(routing.pregnantStatus) || routing.pregnantStatus}`);
    }
    if (routing.needsReproductive) {
        parts.push(`Butuh konsultasi reproduksi: ${formatChoiceDisplay(routing.needsReproductive) || routing.needsReproductive}`);
    }
    if (routing.hasGynIssue) {
        parts.push(`Keluhan ginekologi: ${formatChoiceDisplay(routing.hasGynIssue) || routing.hasGynIssue}`);
    }
    return parts.length ? parts.map((line) => `<div>${escapeHtml(line)}</div>`).join('') : '-';
}

function resolveIntakeCategory(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const direct = normalizeChoice(payload.intake_category || payload.metadata?.intakeCategory || null);
    if (direct && VALID_INTAKE_CATEGORIES.has(direct)) {
        return direct;
    }
    const routing = buildRoutingSnapshot(payload);
    if (routing.pregnantStatus === 'yes') {
        return 'obstetri';
    }
    if (routing.pregnantStatus === 'no') {
        if (routing.needsReproductive === 'yes') {
            return 'gyn_repro';
        }
        if (routing.needsReproductive === 'no') {
            if (routing.hasGynIssue === 'yes') {
                return 'gyn_special';
            }
            if (routing.hasGynIssue === 'no') {
                const adminNote = trimToNull(payload.admin_followup_note) || trimToNull(payload.admin_followup_note_secondary);
                return adminNote ? 'admin_followup' : null;
            }
        }
    }
    return null;
}

function formatMedicationRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const name = trimToNull(row.name);
    const dose = trimToNull(row.dose);
    const freq = trimToNull(row.freq);
    const parts = [name, dose, freq].filter(Boolean);
    return parts.length ? parts.join(' • ') : null;
}

function buildGeneralMedicalItems(payload = {}) {
    const items = [];
    const bloodType = trimToNull(payload.blood_type);
    if (bloodType) {
        items.push({ label: 'Golongan darah', value: bloodType.toUpperCase() });
    }
    const rhesus = trimToNull(payload.rhesus);
    if (rhesus) {
        items.push({ label: 'Rhesus', value: rhesus.toUpperCase() });
    }

    const allergyNotes = [];
    const allergyDrugs = trimToNull(payload.allergy_drugs);
    const allergyFood = trimToNull(payload.allergy_food);
    const allergyEnv = trimToNull(payload.allergy_env);
    if (allergyDrugs) {
        allergyNotes.push(`Obat: ${allergyDrugs}`);
    }
    if (allergyFood) {
        allergyNotes.push(`Makanan: ${allergyFood}`);
    }
    if (allergyEnv) {
        allergyNotes.push(`Lingkungan: ${allergyEnv}`);
    }
    if (allergyNotes.length) {
        items.push({ label: 'Alergi', value: allergyNotes });
    }

    const pastConditions = ensureArray(payload.past_conditions)
        .map((code) => PAST_CONDITION_LABELS[code] || code)
        .filter(Boolean);
    if (pastConditions.length) {
        items.push({ label: 'Riwayat penyakit', value: pastConditions });
    }
    const pastDetail = trimToNull(payload.past_conditions_detail);
    if (pastDetail) {
        items.push({ label: 'Detail penyakit', value: pastDetail });
    }

    const familyHistory = ensureArray(payload.family_history)
        .map((code) => FAMILY_HISTORY_LABELS[code] || code)
        .filter(Boolean);
    if (familyHistory.length) {
        items.push({ label: 'Riwayat keluarga', value: familyHistory });
    }
    const familyDetail = trimToNull(payload.family_history_detail);
    if (familyDetail) {
        items.push({ label: 'Detail keluarga', value: familyDetail });
    }

    const medications = Array.isArray(payload.medications)
        ? payload.medications.map(formatMedicationRow).filter(Boolean)
        : [];
    if (medications.length) {
        items.push({ label: 'Obat yang sedang dikonsumsi', value: medications });
    }

    return items;
}

function buildMenstrualDisplay(payload = {}) {
    const items = [];
    const menarcheAge = toNumber(payload.menarche_age);
    if (menarcheAge !== null) {
        items.push({ label: 'Pertama kali menstruasi', value: `${menarcheAge} tahun` });
    }
    const cycleLength = toNumber(payload.cycle_length);
    if (cycleLength !== null) {
        items.push({ label: 'Siklus menstruasi', value: `${cycleLength} hari` });
    }
    const menstruationDuration = toNumber(payload.menstruation_duration);
    if (menstruationDuration !== null) {
        items.push({ label: 'Lama menstruasi', value: `${menstruationDuration} hari` });
    }
    const menstruationFlow = formatChoiceDisplay(normalizeChoice(payload.menstruation_flow));
    if (menstruationFlow) {
        items.push({ label: 'Jumlah perdarahan', value: menstruationFlow });
    }
    const dysmenorrheaLevel = formatChoiceDisplay(normalizeChoice(payload.dysmenorrhea_level));
    if (dysmenorrheaLevel) {
        items.push({ label: 'Nyeri menstruasi', value: dysmenorrheaLevel });
    }
    const spottingOutsideCycle = formatChoiceDisplay(normalizeChoice(payload.spotting_outside_cycle));
    if (spottingOutsideCycle) {
        items.push({ label: 'Intermenstrual spotting', value: spottingOutsideCycle });
    }
    const cycleRegular = formatChoiceDisplay(normalizeChoice(payload.cycle_regular));
    if (cycleRegular) {
        items.push({ label: 'Siklus menstruasi teratur', value: cycleRegular });
    }
    const lmp = trimToNull(payload.lmp);
    if (lmp) {
        items.push({ label: 'Hari pertama haid terakhir', value: lmp });
    }
    return items;
}

function collectPregnancyEntries(payload = {}) {
    if (Array.isArray(payload.previousPregnancies)) {
        return payload.previousPregnancies;
    }
    if (Array.isArray(payload.previous_pregnancies)) {
        return payload.previous_pregnancies;
    }
    if (Array.isArray(payload.pregnancy_history)) {
        return payload.pregnancy_history;
    }
    return [];
}

function formatPregnancyRow(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const indexLabel = row.index ? `#${row.index}` : null;
    const year = trimToNull(row.year);
    const mode = trimToNull(row.mode);
    const complication = trimToNull(row.complication);
    const weight = toNumber(row.weight);
    const alive = formatChoiceDisplay(normalizeChoice(row.alive));
    const parts = [];
    if (year) {
        parts.push(year);
    }
    if (mode) {
        parts.push(mode);
    }
    if (weight !== null) {
        parts.push(`${weight} gr`);
    }
    if (alive) {
        parts.push(`Anak hidup: ${alive}`);
    }
    if (complication) {
        parts.push(`Komplikasi: ${complication}`);
    }
    if (!parts.length) {
        return null;
    }
    return [indexLabel, parts.join(' • ')].filter(Boolean).join(' ');
}

function buildPregnancyDisplay(payload = {}) {
    const items = [];
    const totals = [
        ['Gravida', toNumber(payload.gravida)],
        ['Para', toNumber(payload.para)],
        ['Abortus', toNumber(payload.abortus)],
        ['Anak hidup', toNumber(payload.living_children)],
    ];
    totals.forEach(([label, value]) => {
        if (value !== null && value !== undefined) {
            items.push({ label, value });
        }
    });

    const pregnancies = collectPregnancyEntries(payload)
        .map(formatPregnancyRow)
        .filter(Boolean);
    if (pregnancies.length) {
        items.push({ label: 'Riwayat persalinan', value: pregnancies });
    }

    return items;
}

function buildGynReproSections(payload = {}) {
    const sections = [];
    const reproductiveGoals = ensureArray(payload.repro_goals);
    const goalDetail = trimToNull(payload.repro_goal_detail);
    const tryingDuration = trimToNull(payload.repro_trying_duration);
    const previousEvaluations = trimToNull(payload.repro_previous_evaluations);
    const expectation = trimToNull(payload.repro_expectation);
    const lastContraception = trimToNull(payload.repro_last_contraception);
    const fertilityProgramInterest = normalizeChoice(payload.fertility_program_interest);

    const complaintItems = [];
    if (reproductiveGoals.length) {
        complaintItems.push({
            label: 'Tujuan konsultasi',
            value: reproductiveGoals.map((goal) => REPRO_GOAL_LABELS[goal] || goal),
        });
    }
    if (goalDetail) {
        complaintItems.push({ label: 'Detail kebutuhan', value: goalDetail });
    }
    if (tryingDuration) {
        complaintItems.push({ label: 'Durasi mencoba hamil', value: tryingDuration });
    }
    if (previousEvaluations) {
        complaintItems.push({ label: 'Pemeriksaan sebelumnya', value: previousEvaluations });
    }
    if (expectation) {
        complaintItems.push({ label: 'Harapan konsultasi', value: expectation });
    }
    if (lastContraception) {
        complaintItems.push({ label: 'Metode kontrasepsi terakhir', value: lastContraception });
    }
    const formattedInterest = formatChoiceDisplay(fertilityProgramInterest);
    if (formattedInterest) {
        complaintItems.push({ label: 'Sedang mengikuti program hamil', value: formattedInterest });
    }

    const fertilityAssessment = {
        diagnosedPcos: normalizeChoice(payload.diagnosed_pcos),
        diagnosedGyneConditions: normalizeChoice(payload.diagnosed_gyne_conditions),
        transvaginalUsg: normalizeChoice(payload.transvaginal_usg),
        hsgHistory: normalizeChoice(payload.hsg_history),
        previousPrograms: normalizeChoice(payload.previous_programs),
        partnerSmoking: normalizeChoice(payload.partner_smoking),
        partnerAlcohol: normalizeChoice(payload.partner_alcohol),
        spermAnalysis: normalizeChoice(payload.sperm_analysis),
        preferNaturalProgram: normalizeChoice(payload.prefer_natural_program),
        willingHormonalTherapy: normalizeChoice(payload.willing_hormonal_therapy),
    };

    const assessmentItems = Object.entries(FERTILITY_ASSESSMENT_LABELS)
        .map(([key, label]) => {
            const formatted = formatChoiceDisplay(fertilityAssessment[key]);
            return formatted ? { label, value: formatted } : null;
        })
        .filter(Boolean);
    if (assessmentItems.length) {
        complaintItems.push({ label: 'Riwayat reproduksi & gaya hidup', value: assessmentItems });
    }

    sections.push({ title: 'Keluhan Utama', items: complaintItems });
    sections.push({ title: 'Riwayat Medis Umum', items: buildGeneralMedicalItems(payload) });
    sections.push({ title: 'Riwayat Menstruasi', items: buildMenstrualDisplay(payload) });
    sections.push({ title: 'Riwayat Kehamilan Sebelumnya', items: buildPregnancyDisplay(payload) });

    return sections;
}

function buildStructuredSections(payload, intakeCategory) {
    if (intakeCategory === 'gyn_repro') {
        return buildGynReproSections(payload);
    }
    return [];
}

function renderStructuredSections(container, sections) {
    if (!container) {
        return;
    }
    if (!Array.isArray(sections) || !sections.length) {
        container.innerHTML = '<div class="text-muted">Tidak ada data.</div>';
        return;
    }
    container.innerHTML = sections
        .map((section) => {
            const rows = Array.isArray(section.items)
                ? section.items.map((item) => renderDefinitionRow(item.label, item.value)).join('')
                : '';
            const content = rows || '<dd class="col-12 text-muted">Tidak ada data</dd>';
            return `
                <div class="structured-section mb-3">
                    <div class="font-weight-semibold text-secondary">${escapeHtml(section.title)}</div>
                    <dl class="row mb-0">${content}</dl>
                </div>
            `;
        })
        .join('');
}

const tableBody = document.querySelector('#intake-table tbody');
const statusFilter = document.getElementById('filter-status');
const riskFilter = document.getElementById('filter-risk');
const dateFrom = document.getElementById('filter-from');
const dateTo = document.getElementById('filter-to');
const searchInput = document.getElementById('filter-search');
const refreshBtn = document.getElementById('btn-refresh');
const logoutBtn = document.getElementById('btn-logout');
const alertContainer = document.getElementById('alert-container');
const loadingOverlay = document.getElementById('table-loading');

const detailModal = $('#intakeDetailModal');
const detailLoader = document.getElementById('detail-loading');
const detailContent = document.getElementById('detail-content');
const detailRiskBadge = document.getElementById('detail-risk-badge');
const detailStatusBadge = document.getElementById('detail-status-badge');
const detailIntakeCategory = document.getElementById('detail-intake-category');
const detailIntakeRouting = document.getElementById('detail-intake-routing');
const detailAdminFollowup = document.getElementById('detail-admin-followup');
const detailAdminFollowupPrimary = document.getElementById('detail-admin-followup-primary');
const detailAdminFollowupSecondary = document.getElementById('detail-admin-followup-secondary');
const detailAnamnesaWrapper = document.getElementById('detail-anamnesa-wrapper');
const detailAnamnesaSections = document.getElementById('detail-anamnesa-sections');
const detailName = document.getElementById('detail-name');
const detailDob = document.getElementById('detail-dob');
const detailPhone = document.getElementById('detail-phone');
const detailAddress = document.getElementById('detail-address');
const detailLmp = document.getElementById('detail-lmp');
const detailEdd = document.getElementById('detail-edd');
const detailBmi = document.getElementById('detail-bmi');
const detailObstetric = document.getElementById('detail-obstetric');
const detailPregnancySection = document.getElementById('detail-pregnancy-section');
const detailMedicalHistorySection = document.getElementById('detail-medical-history-section');
const detailRiskFlags = document.getElementById('detail-risk-flags');
const detailHistory = document.getElementById('detail-history');
const detailStatusSelect = document.getElementById('detail-status');
const detailReviewer = document.getElementById('detail-reviewed-by');
const detailNotes = document.getElementById('detail-notes');
const saveReviewBtn = document.getElementById('btn-save-review');

let currentSubmissionId = null;
let searchDebounceTimer = null;

function redirectToLogin() {
    window.location.href = 'login.html';
}

function setLoading(isLoading) {
    if (!loadingOverlay) return;
    loadingOverlay.classList.toggle('d-none', !isLoading);
}

function showAlert(message, type = 'info', timeout = 4000) {
    if (!alertContainer) return;
    const wrapper = document.createElement('div');
    wrapper.className = `alert alert-${type} alert-dismissible fade show`;
    wrapper.role = 'alert';
    wrapper.innerHTML = `
        ${message}
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
            <span aria-hidden="true">&times;</span>
        </button>
    `;
    alertContainer.appendChild(wrapper);
    if (timeout) {
        setTimeout(() => {
            $(wrapper).alert('close');
        }, timeout);
    }
}

async function authorizedFetch(path, options = {}) {
    const token = await getIdToken();
    if (!token) {
        redirectToLogin();
        throw new Error('Unauthorized');
    }
    const headers = new Headers(options.headers || {});
    if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    // Add cache-busting headers
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    
    // Add timestamp to URL for cache-busting
    const fullPath = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const separator = fullPath.includes('?') ? '&' : '?';
    const cacheBustingUrl = `${fullPath}${separator}_=${Date.now()}`;
    
    const response = await fetch(cacheBustingUrl, {
        ...options,
        headers,
    });
    if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        throw new Error('Unauthorized');
    }
    return response;
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatStatus(status) {
    const label = STATUS_LABELS[status] || status || '-';
    const badge = STATUS_BADGE[status] || 'badge-secondary';
    return `<span class="badge ${badge} status-badge"><i class="fas fa-circle"></i> ${label}</span>`;
}

function renderRiskBadge(isHighRisk) {
    return isHighRisk
        ? '<span class="badge badge-high-risk">High</span>'
        : '<span class="badge badge-normal">Normal</span>';
}

function renderTableRows(data) {
    if (!tableBody) return;
    if (!Array.isArray(data) || !data.length) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Tidak ada data ditemukan.</td></tr>';
        return;
    }
    const rows = data.map((item) => {
        const received = formatDate(item.receivedAt);
        const status = formatStatus(item.status);
        const risk = renderRiskBadge(item.highRisk);
    const nikLine = item.nik ? `<br><small>NIK: ${item.nik}</small>` : '';
    const patient = item.patientName ? `<strong>${item.patientName}</strong>${nikLine}` : '-';
        const reviewInfo = item.reviewedBy ? `${item.reviewedBy}<br><small>${formatDate(item.reviewedAt)}</small>` : '-';
        const eddText = item.edd ? item.edd : '-';
        const phone = item.phone || '-';
        return `
            <tr>
                <td>${received}</td>
                <td>${patient}</td>
                <td>${phone}</td>
                <td>${status}</td>
                <td>${risk}</td>
                <td>${eddText}</td>
                <td>${reviewInfo}</td>
                <td>
                    <button class="btn btn-outline-primary btn-sm btn-detail" data-id="${item.submissionId}">
                        <i class="fas fa-eye"></i> Detail
                    </button>
                    <button class="btn btn-outline-danger btn-sm btn-delete ml-1" data-id="${item.submissionId}" data-name="${item.patientName || 'pasien'}" title="Hapus data intake">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    tableBody.innerHTML = rows;
}

async function loadSubmissions() {
    try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set('limit', '200');
        if (statusFilter && statusFilter.value) {
            params.set('status', statusFilter.value);
        }
        if (riskFilter && riskFilter.value) {
            params.set('risk', riskFilter.value);
        }
        if (dateFrom && dateFrom.value) {
            params.set('from', dateFrom.value);
        }
        if (dateTo && dateTo.value) {
            params.set('to', dateTo.value);
        }
        if (searchInput && searchInput.value.trim()) {
            params.set('search', searchInput.value.trim());
        }
        const res = await authorizedFetch(`/api/patient-intake?${params.toString()}`);
        const payload = await res.json();
        if (!payload.success) {
            throw new Error(payload.message || 'Gagal memuat data intake');
        }
        renderTableRows(payload.data || []);
    } catch (error) {
        console.error('loadSubmissions error:', error);
        showAlert(error.message || 'Gagal memuat data intake', 'danger', 6000);
    } finally {
        setLoading(false);
    }
}

function renderRiskFlags(flags) {
    if (!Array.isArray(flags) || !flags.length) {
        detailRiskFlags.innerHTML = '<span class="text-muted">Tidak ada risk flag.</span>';
        return;
    }
    detailRiskFlags.innerHTML = flags.map((flag) => `<span class="risk-flag">${flag}</span>`).join('');
}

function renderHistory(history) {
    if (!Array.isArray(history) || !history.length) {
        detailHistory.innerHTML = '<span class="text-muted">Belum ada riwayat review.</span>';
        return;
    }
    detailHistory.innerHTML = history.map((item) => {
        const label = STATUS_LABELS[item.status] || item.status;
        const timestamp = formatDate(item.timestamp);
        const actor = item.actor || '-';
        const notes = item.notes ? `<div class="text-muted small">"${item.notes}"</div>` : '';
        return `
            <div class="history-entry">
                <div><strong>${label}</strong> oleh <strong>${actor}</strong></div>
                <div class="text-muted small">${timestamp}</div>
                ${notes}
            </div>
        `;
    }).join('');
}

function resetDetailModal() {
    currentSubmissionId = null;
    detailContent.classList.add('d-none');
    detailLoader.classList.remove('d-none');
    detailRiskBadge.className = 'badge';
    detailRiskBadge.textContent = '';
    detailStatusBadge.className = 'badge badge-secondary ml-2';
    detailStatusBadge.textContent = '';
    if (detailIntakeCategory) {
        detailIntakeCategory.textContent = '-';
    }
    if (detailIntakeRouting) {
        detailIntakeRouting.textContent = '-';
    }
    if (detailAdminFollowup) {
        detailAdminFollowup.classList.add('d-none');
    }
    if (detailAdminFollowupPrimary) {
        detailAdminFollowupPrimary.textContent = '';
        detailAdminFollowupPrimary.classList.add('d-none');
    }
    if (detailAdminFollowupSecondary) {
        detailAdminFollowupSecondary.textContent = '';
        detailAdminFollowupSecondary.classList.add('d-none');
    }
    if (detailAnamnesaWrapper) {
        detailAnamnesaWrapper.classList.add('d-none');
    }
    if (detailAnamnesaSections) {
        detailAnamnesaSections.innerHTML = '';
    }
    detailName.textContent = '-';
    detailDob.textContent = '-';
    detailPhone.textContent = '-';
    detailAddress.textContent = '-';
    detailLmp.textContent = '-';
    detailEdd.textContent = '-';
    detailBmi.textContent = '-';
    detailObstetric.textContent = '-';
    if (detailPregnancySection) {
        detailPregnancySection.classList.remove('d-none');
    }
    if (detailMedicalHistorySection) {
        detailMedicalHistorySection.classList.remove('d-none');
    }
    detailRiskFlags.innerHTML = '';
    detailHistory.innerHTML = '';
    detailStatusSelect.value = 'verified';
    detailReviewer.value = auth.currentUser?.name || auth.currentUser?.email || '';
    detailNotes.value = '';
}

function populateDetail(record) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    const totals = metadata.obstetricTotals || {};
    const review = record.review || {};
    const intakeCategory = record.intakeCategory
        || record.integration?.intakeCategory
        || metadata.intakeCategory
        || resolveIntakeCategory(payload);
    const routing = record.routing
        || record.integration?.routing
        || metadata.routing
        || buildRoutingSnapshot(payload);
    const adminFollowup = record.adminFollowup
        || record.integration?.adminFollowup
        || metadata.adminFollowup
        || null;
    const structuredSections = buildStructuredSections(payload, intakeCategory);

    const statusLabel = STATUS_LABELS[record.status || review.status] || record.status || review.status || 'Unknown';
    const statusBadge = STATUS_BADGE[record.status || review.status] || 'badge-secondary';
    detailStatusBadge.className = `badge ${statusBadge} ml-2`;
    detailStatusBadge.textContent = statusLabel;

    if (record.summary?.highRisk || metadata.highRisk) {
        detailRiskBadge.className = 'badge badge-high-risk';
        detailRiskBadge.textContent = 'High Risk';
    } else {
        detailRiskBadge.className = 'badge badge-normal';
        detailRiskBadge.textContent = 'Normal Risk';
    }

    if (detailIntakeCategory) {
        detailIntakeCategory.textContent = intakeCategory
            ? (INTAKE_CATEGORY_LABELS[intakeCategory] || intakeCategory)
            : '-';
    }
    if (detailIntakeRouting) {
        const routingSummary = buildRoutingSummary(routing);
        if (routingSummary === '-') {
            detailIntakeRouting.textContent = '-';
        } else {
            detailIntakeRouting.innerHTML = routingSummary;
        }
    }
    if (detailAdminFollowup) {
        const primaryNote = trimToNull(adminFollowup?.primaryNote);
        const secondaryNote = trimToNull(adminFollowup?.secondaryNote);
        if (primaryNote || secondaryNote) {
            detailAdminFollowup.classList.remove('d-none');
            if (detailAdminFollowupPrimary) {
                if (primaryNote) {
                    detailAdminFollowupPrimary.textContent = primaryNote;
                    detailAdminFollowupPrimary.classList.remove('d-none');
                } else {
                    detailAdminFollowupPrimary.textContent = '';
                    detailAdminFollowupPrimary.classList.add('d-none');
                }
            }
            if (detailAdminFollowupSecondary) {
                if (secondaryNote) {
                    detailAdminFollowupSecondary.textContent = secondaryNote;
                    detailAdminFollowupSecondary.classList.remove('d-none');
                } else {
                    detailAdminFollowupSecondary.textContent = '';
                    detailAdminFollowupSecondary.classList.add('d-none');
                }
            }
        } else {
            detailAdminFollowup.classList.add('d-none');
            if (detailAdminFollowupPrimary) {
                detailAdminFollowupPrimary.textContent = '';
                detailAdminFollowupPrimary.classList.add('d-none');
            }
            if (detailAdminFollowupSecondary) {
                detailAdminFollowupSecondary.textContent = '';
                detailAdminFollowupSecondary.classList.add('d-none');
            }
        }
    }
    if (detailAnamnesaWrapper) {
        if (structuredSections.length) {
            detailAnamnesaWrapper.classList.remove('d-none');
            renderStructuredSections(detailAnamnesaSections, structuredSections);
        } else {
            detailAnamnesaWrapper.classList.add('d-none');
            if (detailAnamnesaSections) {
                detailAnamnesaSections.innerHTML = '';
            }
        }
    }

    // Basic identity
    detailName.textContent = payload.full_name || '-';
    detailDob.textContent = payload.dob ? `${payload.dob} (usia ${payload.age || '-'})` : '-';
    detailPhone.textContent = payload.phone || '-';
    detailAddress.textContent = payload.address || '-';
    
    // Family & Social Information
    const familySocialContainer = document.getElementById('detail-family-social');
    if (familySocialContainer) {
        let familySocialHTML = '';
        if (payload.marital_status) {
            familySocialHTML += `<dt class="col-sm-4">Status Pernikahan</dt><dd class="col-sm-8">${payload.marital_status}</dd>`;
        }
        if (payload.husband_name) {
            familySocialHTML += `<dt class="col-sm-4">Nama Suami</dt><dd class="col-sm-8">${payload.husband_name}</dd>`;
        }
        if (payload.husband_age) {
            familySocialHTML += `<dt class="col-sm-4">Umur Suami</dt><dd class="col-sm-8">${payload.husband_age} tahun</dd>`;
        }
        if (payload.husband_job) {
            familySocialHTML += `<dt class="col-sm-4">Pekerjaan Suami</dt><dd class="col-sm-8">${payload.husband_job}</dd>`;
        }
        if (payload.occupation) {
            familySocialHTML += `<dt class="col-sm-4">Pekerjaan</dt><dd class="col-sm-8">${payload.occupation}</dd>`;
        }
        if (payload.education) {
            familySocialHTML += `<dt class="col-sm-4">Pendidikan</dt><dd class="col-sm-8">${payload.education}</dd>`;
        }
        familySocialContainer.innerHTML = familySocialHTML || '<dd class="col-12 text-muted">Tidak ada data</dd>';
    }
    
    // Pregnancy current
    detailLmp.textContent = payload.lmp || '-';
    detailEdd.textContent = metadata.edd?.value || payload.edd || '-';
    detailBmi.textContent = payload.bmi ? `${payload.bmi} (${metadata.bmiCategory || '-'})` : '-';
    detailObstetric.textContent = `G${totals.gravida ?? payload.gravida ?? '-'} P${totals.para ?? '-'} A${totals.abortus ?? '-'} L${totals.living ?? '-'}`;
    const pregnantStatus = normalizeChoice(payload.pregnant_status);
    if (detailPregnancySection) {
        if ((intakeCategory && intakeCategory !== 'obstetri') || pregnantStatus === 'no') {
            detailPregnancySection.classList.add('d-none');
        } else {
            detailPregnancySection.classList.remove('d-none');
        }
    }
    
    // Medical History & Risk
    const medicalHistoryContainer = document.getElementById('detail-medical-history');
    if (medicalHistoryContainer) {
        const rows = [];
        const pushRow = (label, value) => {
            const row = renderDefinitionRow(label, value);
            if (row) {
                rows.push(row);
            }
        };
        pushRow('Tinggi Badan', formatMeasurement(payload.height, 'cm'));
        pushRow('Berat Badan', formatMeasurement(payload.weight, 'kg'));
        pushRow('Faktor Risiko', payload.risk_factors);

        const generalItems = buildGeneralMedicalItems(payload);
        generalItems.forEach((item) => pushRow(item.label, item.value));

        const hasAllergyStructured = generalItems.some((item) => item.label === 'Alergi');
        if (!hasAllergyStructured) {
            pushRow('Alergi', payload.allergies);
        }

        const hasMedicationStructured = generalItems.some((item) => item.label === 'Obat yang sedang dikonsumsi');
        if (!hasMedicationStructured) {
            pushRow('Obat yang sedang dikonsumsi', trimToNull(payload.current_medications));
        }

        pushRow('Imunisasi', payload.immunizations);

        medicalHistoryContainer.innerHTML = rows.length
            ? rows.join('')
            : '<dd class="col-12 text-muted">Tidak ada data</dd>';
    }
    
    // Prenatal/ANC visits
    const prenatalSection = document.getElementById('detail-prenatal-section');
    const prenatalTableContainer = document.getElementById('detail-prenatal-table');
    if (prenatalTableContainer && payload.prenatal_visits && payload.prenatal_visits.length > 0) {
        let tableHTML = '<table class="table table-sm table-bordered"><thead><tr><th>Tanggal</th><th>Tempat</th><th>Keluhan</th><th>Hasil</th><th>Tindakan</th></tr></thead><tbody>';
        payload.prenatal_visits.forEach(visit => {
            tableHTML += `<tr>
                <td>${visit.date || '-'}</td>
                <td>${visit.location || '-'}</td>
                <td>${visit.complaint || '-'}</td>
                <td>${visit.result || '-'}</td>
                <td>${visit.action || '-'}</td>
            </tr>`;
        });
        tableHTML += '</tbody></table>';
        prenatalTableContainer.innerHTML = tableHTML;
        prenatalSection.style.display = 'block';
    } else if (prenatalSection) {
        prenatalSection.style.display = 'none';
    }
    
    // Lab tests
    const labSection = document.getElementById('detail-lab-section');
    const labTableContainer = document.getElementById('detail-lab-table');
    if (labTableContainer && payload.lab_tests && payload.lab_tests.length > 0) {
        let tableHTML = '<table class="table table-sm table-bordered"><thead><tr><th>Tanggal</th><th>Jenis Tes</th><th>Hasil</th><th>Satuan</th><th>Nilai Normal</th></tr></thead><tbody>';
        payload.lab_tests.forEach(test => {
            tableHTML += `<tr>
                <td>${test.date || '-'}</td>
                <td>${test.test_name || '-'}</td>
                <td>${test.result || '-'}</td>
                <td>${test.unit || '-'}</td>
                <td>${test.normal_range || '-'}</td>
            </tr>`;
        });
        tableHTML += '</tbody></table>';
        labTableContainer.innerHTML = tableHTML;
        labSection.style.display = 'block';
    } else if (labSection) {
        labSection.style.display = 'none';
    }
    
    renderRiskFlags(record.summary?.riskFlags || metadata.riskFlags || []);
    renderHistory(review.history || []);

    if (review.status) {
        detailStatusSelect.value = review.status;
    }
    if (review.verifiedBy) {
        detailReviewer.value = review.verifiedBy;
    } else if (!detailReviewer.value) {
        detailReviewer.value = auth.currentUser?.name || auth.currentUser?.email || '';
    }
    if (review.notes) {
        detailNotes.value = review.notes;
    }
}

async function openDetailModal(submissionId) {
    resetDetailModal();
    currentSubmissionId = submissionId;
    detailModal.modal('show');
    try {
        const res = await authorizedFetch(`/api/patient-intake/${submissionId}`);
        const payload = await res.json();
        if (!payload.success) {
            throw new Error(payload.message || 'Gagal memuat detail intake');
        }
        populateDetail(payload.data);
        detailLoader.classList.add('d-none');
        detailContent.classList.remove('d-none');
    } catch (error) {
        console.error('openDetailModal error:', error);
        detailModal.modal('hide');
        showAlert(error.message || 'Gagal memuat detail intake', 'danger', 6000);
    }
}

async function saveReview() {
    if (!currentSubmissionId) {
        return;
    }
    const status = detailStatusSelect.value;
    const reviewer = detailReviewer.value.trim() || auth.currentUser?.name || auth.currentUser?.email || 'clinic_staff';
    const notes = detailNotes.value.trim();

    const payload = {
        status,
        reviewedBy: reviewer,
    };
    if (notes) {
        payload.notes = notes;
    }

    saveReviewBtn.disabled = true;
    saveReviewBtn.innerHTML = '<span class="spinner-border spinner-border-sm mr-2" role="status" aria-hidden="true"></span>Menyimpan...';

    try {
        const res = await authorizedFetch(`/api/patient-intake/${currentSubmissionId}/review`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (!body.success) {
            throw new Error(body.message || 'Gagal memperbarui status review');
        }
        showAlert('Status review berhasil diperbarui.', 'success');
        detailModal.modal('hide');
        await loadSubmissions();
    } catch (error) {
        console.error('saveReview error:', error);
        showAlert(error.message || 'Gagal memperbarui status review', 'danger', 6000);
    } finally {
        saveReviewBtn.disabled = false;
        saveReviewBtn.innerHTML = '<i class="fas fa-save"></i> Simpan';
    }
}

async function deleteSubmission(submissionId, patientName) {
    if (!confirm(`Apakah Anda yakin ingin menghapus data intake untuk pasien "${patientName}"?\n\nData yang dihapus:\n- Data intake di patient-intake-review\n- File data pasien di server\n\nTindakan ini tidak dapat dibatalkan.`)) {
        return;
    }

    try {
        const res = await authorizedFetch(`/api/patient-intake/${submissionId}`, {
            method: 'DELETE',
        });

        const payload = await res.json();
        
        if (!payload.success) {
            throw new Error(payload.message || 'Gagal menghapus data intake');
        }

        showAlert(`Data intake untuk pasien "${patientName}" berhasil dihapus.`, 'success');
        await loadSubmissions();
    } catch (error) {
        console.error('deleteSubmission error:', error);
        showAlert(error.message || 'Gagal menghapus data intake', 'danger', 6000);
    }
}

function attachEventListeners() {
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadSubmissions());
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', () => loadSubmissions());
    }
    if (riskFilter) {
        riskFilter.addEventListener('change', () => loadSubmissions());
    }
    if (dateFrom) {
        dateFrom.addEventListener('change', () => loadSubmissions());
    }
    if (dateTo) {
        dateTo.addEventListener('change', () => loadSubmissions());
    }
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => loadSubmissions(), 350);
        });
    }
    if (tableBody) {
        tableBody.addEventListener('click', (event) => {
            const detailButton = event.target.closest('.btn-detail');
            if (detailButton && detailButton.dataset.id) {
                openDetailModal(detailButton.dataset.id);
                return;
            }
            
            const deleteButton = event.target.closest('.btn-delete');
            if (deleteButton && deleteButton.dataset.id) {
                deleteSubmission(deleteButton.dataset.id, deleteButton.dataset.name);
                return;
            }
        });
    }
    if (saveReviewBtn) {
        saveReviewBtn.addEventListener('click', () => saveReview());
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOut();
            redirectToLogin();
        });
    }
}

// Initialize realtime sync for intake verification updates
function setupRealtimeListeners() {
    // Listen for intake verification events
    if (typeof initRealtimeSync === 'function' && auth.currentUser) {
        initRealtimeSync({
            id: auth.currentUser.uid,
            name: auth.currentUser.displayName || auth.currentUser.email,
            role: 'staff'
        });
        
        // Setup socket listeners after a short delay to ensure connection
        setTimeout(() => {
            if (window.socket) {
                window.socket.on('intake:verified', (data) => {
                    console.log('📨 [REALTIME] Intake verification received:', data);
                    
                    // Show notification
                    showAlert(
                        `<i class="fas fa-check-circle"></i> ${data.userName} telah memverifikasi intake untuk ${data.patientName}`,
                        'success',
                        5000
                    );
                    
                    // Refresh the table to show updated status
                    setTimeout(() => {
                        loadSubmissions();
                    }, 1000);
                });
            }
        }, 2000);
    }
}

async function bootstrap() {
    attachEventListeners();

    await initAuth();

    const token = await getIdToken();
    if (!token || !auth.currentUser) {
        redirectToLogin();
        return;
    }

    loadSubmissions();
    setupRealtimeListeners();

    onAuthStateChanged((user) => {
        if (!user) {
            redirectToLogin();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bootstrap().catch((error) => {
        console.error('Bootstrap error:', error);
    });
});
