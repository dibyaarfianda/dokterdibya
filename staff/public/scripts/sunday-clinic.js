const SECTION_DEFS = [
    { id: 'identitas', label: 'Identitas' },
    { id: 'anamnesa', label: 'Anamnesa' },
    { id: 'pemeriksaan', label: 'Pemeriksaan Fisik' },
    { id: 'usg', label: 'USG' },
    { id: 'penunjang', label: 'Laboratorium' },
    { id: 'diagnosis', label: 'Diagnosis' },
    { id: 'planning', label: 'Planning' },
    { id: 'tagihan', label: 'Tagihan' }
];

const SECTION_LOOKUP = new Map(SECTION_DEFS.map(section => [section.id, section]));

const RISK_FACTOR_LABELS = {
    age_extremes: 'Usia ibu di bawah 18 tahun atau di atas 35 tahun',
    previous_complication: 'Riwayat komplikasi kehamilan sebelumnya',
    multiple_pregnancy: 'Kemungkinan kehamilan kembar',
    medical_conditions: 'Memiliki penyakit medis yang berisiko',
    family_history: 'Riwayat keluarga dengan kelainan genetik',
    substance: 'Paparan rokok/alkohol/narkoba'
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
    surgery: 'Riwayat operasi mayor',
    blood: 'Kelainan darah'
};

const ANAMNESIS_LABELS = {
    keluhan_utama: 'Keluhan Utama',
    riwayat_penyakit_sekarang: 'Riwayat Penyakit Sekarang',
    riwayat_penyakit_dahulu: 'Riwayat Penyakit Dahulu',
    riwayat_keluarga: 'Riwayat Keluarga'
};

const PHYSICAL_LABELS = {
    tekanan_darah: 'Tekanan Darah',
    nadi: 'Nadi',
    suhu: 'Suhu',
    respirasi: 'Respirasi',
    kepala_leher: 'Kepala & Leher',
    thorax: 'Thorax',
    abdomen: 'Abdomen',
    ekstremitas: 'Ekstremitas',
    pemeriksaan_obstetri: 'Pemeriksaan Obstetri'
};

const USG_LABELS = {
    usg_date: 'Tanggal USG',
    usia_kehamilan: 'Usia Kehamilan',
    biometri: 'Biometri',
    anatomi_janin: 'Anatomi Janin',
    plasenta_air_ketuban: 'Plasenta & Cairan Ketuban',
    kesimpulan_usg: 'Kesimpulan'
};

const LAB_LABELS = {
    lab_results: 'Ringkasan Hasil Lab',
    radiologi: 'Pemeriksaan Radiologi',
    pemeriksaan_lain: 'Pemeriksaan Lain'
};

const DIAGNOSIS_LABELS = {
    diagnosis: 'Diagnosis',
    catatan: 'Catatan Tambahan'
};

const PLANNING_LABELS = {
    rencana_tindakan: 'Rencana Tindakan',
    resep: 'Resep',
    catatan: 'Catatan Tambahan'
};

const FOLLOWUP_LABELS = {
    normal: 'Normal',
    perlu_monitor: 'Perlu Monitor',
    konsultasi: 'Perlu Konsultasi'
};

const RECORD_TYPE_LABELS = {
    anamnesa: 'Anamnesa',
    physical_exam: 'Pemeriksaan Fisik',
    usg: 'USG',
    lab: 'Laboratorium',
    diagnosis: 'Diagnosis',
    planning: 'Planning',
    complete: 'Rekam Medis Lengkap'
};

function parseRoute(pathname = window.location.pathname) {
    const trimmed = pathname.replace(/^\/+|\/+$/g, '');
    const segments = trimmed.split('/');
    const [root, rawMrId = '', rawSection = 'identitas', ...rest] = segments;

    if (root !== 'sunday-clinic') {
        return { mrId: null, section: 'identitas', remainder: '' };
    }

    return {
        mrId: rawMrId || null,
        section: (rawSection || 'identitas').toLowerCase(),
        remainder: rest.join('/')
    };
}

const initialRoute = parseRoute();
let routeMrSlug = initialRoute.mrId || null;
let activeSection = SECTION_LOOKUP.has(initialRoute.section) ? initialRoute.section : SECTION_DEFS[0].id;
let routeRemainder = initialRoute.remainder || '';

const state = {
    data: null,
    derived: null
};

const directoryState = {
    loading: false,
    patients: [],
    filteredPatients: [],
    selectedPatientId: null,
    selectedVisitMrId: null,
    searchTerm: '',
    error: null
};

const DIRECTORY_DOM = {
    container: null,
    patientList: null,
    visitList: null,
    infoPanel: null,
    openButton: null,
    closeButton: null,
    searchInput: null
};

const DOM = {
    loading: document.getElementById('sunday-clinic-loading'),
    content: document.getElementById('sunday-clinic-content'),
    mrBadge: document.getElementById('mr-id-badge'),
    mrDisplay: document.getElementById('mr-id-display'),
    sectionLabel: document.getElementById('section-label')
};

let sidebarEl = null;
let sectionOutlet = null;
let directoryHideTimer = null;
let previousBodyOverflow = null;

function bindDirectoryDom() {
    DIRECTORY_DOM.container = document.getElementById('sc-directory-overlay');
    DIRECTORY_DOM.patientList = document.getElementById('sc-directory-patient-list');
    DIRECTORY_DOM.visitList = document.getElementById('sc-directory-visit-list');
    DIRECTORY_DOM.infoPanel = document.getElementById('sc-directory-info');
    DIRECTORY_DOM.openButton = document.getElementById('sc-open-directory');
    DIRECTORY_DOM.closeButton = document.getElementById('sc-directory-close');
    DIRECTORY_DOM.searchInput = document.getElementById('sc-directory-search');

    if (DIRECTORY_DOM.openButton) {
        DIRECTORY_DOM.openButton.addEventListener('click', () => openDirectory());
    }

    if (DIRECTORY_DOM.closeButton) {
        DIRECTORY_DOM.closeButton.addEventListener('click', () => closeDirectory({ restoreFocus: true }));
    }

    if (DIRECTORY_DOM.container) {
        DIRECTORY_DOM.container.addEventListener('click', (event) => {
            if (event.target === DIRECTORY_DOM.container) {
                closeDirectory({ restoreFocus: true });
            }
        });
    }

    if (DIRECTORY_DOM.searchInput) {
        DIRECTORY_DOM.searchInput.addEventListener('input', handleDirectorySearchInput);
    }

    if (DIRECTORY_DOM.patientList) {
        DIRECTORY_DOM.patientList.addEventListener('click', (event) => {
            const item = event.target.closest('.sc-directory-patient');
            if (!item) {
                return;
            }
            handleDirectoryPatientClick(item.dataset.patientId || null);
        });
    }

    if (DIRECTORY_DOM.visitList) {
        DIRECTORY_DOM.visitList.addEventListener('click', (event) => {
            const item = event.target.closest('.sc-directory-visit');
            if (!item) {
                return;
            }
            handleDirectoryVisitClick(item.dataset.mrId || null, item.dataset.patientId || null);
        });
    }
}

function handleDirectoryKeydown(event) {
    if (event.key === 'Escape') {
        closeDirectory({ restoreFocus: true });
    }
}

function openDirectory({ focusSearch = true, forceReload = false } = {}) {
    if (!DIRECTORY_DOM.container) {
        return;
    }

    if (directoryHideTimer) {
        clearTimeout(directoryHideTimer);
        directoryHideTimer = null;
    }

    const alreadyVisible = DIRECTORY_DOM.container.classList.contains('is-visible') && !DIRECTORY_DOM.container.hasAttribute('hidden');

    DIRECTORY_DOM.container.removeAttribute('hidden');
    DIRECTORY_DOM.container.setAttribute('aria-hidden', 'false');

    if (!alreadyVisible) {
        requestAnimationFrame(() => {
            DIRECTORY_DOM.container.classList.add('is-visible');
        });
    } else {
        DIRECTORY_DOM.container.classList.add('is-visible');
    }

    if (previousBodyOverflow === null) {
        previousBodyOverflow = document.body.style.overflow || '';
    }
    document.body.style.overflow = 'hidden';

    directoryState.selectedVisitMrId = routeMrSlug || null;

    if (DIRECTORY_DOM.searchInput) {
        DIRECTORY_DOM.searchInput.value = directoryState.searchTerm || '';
    }

    const hasCachedData = Boolean(directoryState.patients.length);
    const forceLoad = forceReload || !hasCachedData;

    if (directoryState.loading && !hasCachedData) {
        renderDirectoryPatients();
        renderDirectoryInfoPanel(null);
        renderDirectoryVisits(null);
    } else if (hasCachedData && !forceReload) {
        refreshDirectoryViews();
    }

    loadDirectory({ force: forceLoad });

    if (focusSearch && DIRECTORY_DOM.searchInput) {
        setTimeout(() => {
            DIRECTORY_DOM.searchInput.focus({ preventScroll: true });
            DIRECTORY_DOM.searchInput.select();
        }, 80);
    }

    if (!alreadyVisible) {
        document.addEventListener('keydown', handleDirectoryKeydown);
    }
}

function closeDirectory({ restoreFocus = false } = {}) {
    if (!DIRECTORY_DOM.container) {
        return;
    }

    DIRECTORY_DOM.container.classList.remove('is-visible');
    DIRECTORY_DOM.container.setAttribute('aria-hidden', 'true');

    if (directoryHideTimer) {
        clearTimeout(directoryHideTimer);
    }

    directoryHideTimer = setTimeout(() => {
        if (DIRECTORY_DOM.container) {
            DIRECTORY_DOM.container.setAttribute('hidden', '');
        }
        directoryHideTimer = null;
    }, 220);

    if (previousBodyOverflow !== null) {
        document.body.style.overflow = previousBodyOverflow || '';
        previousBodyOverflow = null;
    }
    document.removeEventListener('keydown', handleDirectoryKeydown);

    if (restoreFocus && DIRECTORY_DOM.openButton) {
        DIRECTORY_DOM.openButton.focus({ preventScroll: true });
    }
}

function getSelectedPatient() {
    if (!directoryState.selectedPatientId) {
        return null;
    }
    return directoryState.patients.find((patient) => patient.patientId === directoryState.selectedPatientId) || null;
}

function applyDirectoryFilter() {
    const term = (directoryState.searchTerm || '').trim().toLowerCase();
    if (!term) {
        directoryState.filteredPatients = directoryState.patients.slice();
        return;
    }

    directoryState.filteredPatients = directoryState.patients.filter((patient) => {
        const fields = [];
        if (patient.fullName) fields.push(patient.fullName);
        if (patient.patientId) fields.push(patient.patientId);
        if (patient.whatsapp) fields.push(patient.whatsapp);
        if (patient.phone) fields.push(patient.phone);
        (patient.visits || []).forEach((visit) => {
            if (visit.mrId) {
                fields.push(visit.mrId);
            }
        });
        const searchHaystack = fields.join(' ').toLowerCase();
        return searchHaystack.includes(term);
    });
}

function renderDirectoryPatients() {
    if (!DIRECTORY_DOM.patientList) {
        return;
    }

    if (directoryState.loading) {
        DIRECTORY_DOM.patientList.innerHTML = `
            <div class="sc-directory-loader">
                <i class="fas fa-spinner fa-spin fa-lg"></i>
                <span>Memuat daftar pasien...</span>
            </div>
        `;
        return;
    }

    if (directoryState.error) {
        DIRECTORY_DOM.patientList.innerHTML = `
            <div class="sc-directory-error">${escapeHtml(directoryState.error)}</div>
        `;
        return;
    }

    if (!directoryState.filteredPatients.length) {
        DIRECTORY_DOM.patientList.innerHTML = `
            <div class="sc-directory-empty">Tidak ditemukan pasien dengan kata kunci tersebut.</div>
        `;
        return;
    }

    const itemsHtml = directoryState.filteredPatients.map((patient) => {
        const latestVisit = (patient.visits || [])[0] || null;
        const latestLabel = latestVisit
            ? formatDate(latestVisit.appointmentDate) || formatDate(latestVisit.recordUpdatedAt) || formatDate(latestVisit.recordCreatedAt)
            : null;
        const contact = formatPhone(patient.whatsapp || patient.phone);
        const totalVisits = patient.totalVisits || (patient.visits ? patient.visits.length : 0);
        const metaParts = [];
        if (contact) {
            metaParts.push(`Kontak ${contact}`);
        }
        if (latestLabel) {
            metaParts.push(`Terakhir ${latestLabel}`);
        }
        metaParts.push(`${totalVisits} kunjungan`);
        const metaHtml = metaParts.map((part) => `<span>${escapeHtml(part)}</span>`).join('');
        const isActive = directoryState.selectedPatientId === patient.patientId;
        return `
            <button type="button" class="sc-directory-patient${isActive ? ' is-active' : ''}" data-patient-id="${escapeHtml(patient.patientId)}" role="option" aria-selected="${isActive}">
                <span class="sc-directory-patient-name">${escapeHtml(patient.fullName || patient.patientId)}</span>
                <div class="sc-directory-patient-meta">${metaHtml}</div>
            </button>
        `;
    }).join('');

    DIRECTORY_DOM.patientList.innerHTML = itemsHtml;
}

function renderDirectoryInfoPanel(patient) {
    if (!DIRECTORY_DOM.infoPanel) {
        return;
    }

    if (directoryState.loading) {
        DIRECTORY_DOM.infoPanel.innerHTML = `
            <div class="sc-directory-loader">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Menyiapkan ringkasan pasien...</span>
            </div>
        `;
        return;
    }

    if (directoryState.error) {
        DIRECTORY_DOM.infoPanel.innerHTML = `
            <div class="sc-directory-error">${escapeHtml(directoryState.error)}</div>
        `;
        return;
    }

    if (!patient) {
        DIRECTORY_DOM.infoPanel.innerHTML = `
            <div class="sc-directory-placeholder">
                Pilih pasien untuk melihat detail kunjungan Sunday Clinic.
            </div>
        `;
        return;
    }

    const latestVisit = (patient.visits || [])[0] || null;
    const contact = formatPhone(patient.whatsapp || patient.phone) || '-';
    const totalVisits = patient.totalVisits || (patient.visits ? patient.visits.length : 0);
    const latestDate = latestVisit
        ? formatDateTime(latestVisit.recordUpdatedAt || latestVisit.recordCreatedAt || latestVisit.appointmentDate)
        : null;
    const birthDate = formatDate(patient.birthDate) || '-';
    const ageText = patient.age ? `${patient.age} tahun` : '-';
    const latestMr = latestVisit?.mrId ? latestVisit.mrId.toUpperCase() : '-';

    DIRECTORY_DOM.infoPanel.innerHTML = `
        <h3>${escapeHtml(patient.fullName || 'Pasien')}</h3>
        <p><strong>Total kunjungan:</strong> ${escapeHtml(String(totalVisits))}</p>
        <p><strong>MR terbaru:</strong> ${escapeHtml(latestMr)}</p>
        <p><strong>Kunjungan terakhir:</strong> ${escapeHtml(latestDate || '-')}</p>
        <p><strong>Kontak:</strong> ${escapeHtml(contact)}</p>
        <p><strong>Usia:</strong> ${escapeHtml(ageText)}</p>
        <p><strong>Tanggal lahir:</strong> ${escapeHtml(birthDate)}</p>
    `;
}

function renderDirectoryVisits(patient) {
    if (!DIRECTORY_DOM.visitList) {
        return;
    }

    if (directoryState.loading) {
        DIRECTORY_DOM.visitList.innerHTML = `
            <div class="sc-directory-loader">
                <i class="fas fa-spinner fa-spin fa-lg"></i>
                <span>Memuat daftar kunjungan...</span>
            </div>
        `;
        return;
    }

    if (directoryState.error) {
        DIRECTORY_DOM.visitList.innerHTML = `
            <div class="sc-directory-error">${escapeHtml(directoryState.error)}</div>
        `;
        return;
    }

    if (!patient) {
        DIRECTORY_DOM.visitList.innerHTML = `
            <div class="sc-directory-placeholder">
                Pilih pasien untuk melihat kunjungan Sunday Clinic yang tersedia.
            </div>
        `;
        return;
    }

    if (!patient.visits || !patient.visits.length) {
        DIRECTORY_DOM.visitList.innerHTML = `
            <div class="sc-directory-empty">Pasien ini belum memiliki kunjungan Sunday Clinic.</div>
        `;
        return;
    }

    const activeMr = (directoryState.selectedVisitMrId || routeMrSlug || '').toLowerCase();

    const itemsHtml = patient.visits.map((visit) => {
        const timestamp = formatDateTime(visit.recordUpdatedAt || visit.recordCreatedAt || visit.appointmentDate) || 'Kunjungan';
        const metaParts = [];
        if (visit.mrId) {
            metaParts.push(`MR ${visit.mrId.toUpperCase()}`);
        }
        if (visit.sessionLabel) {
            metaParts.push(visit.sessionLabel);
        }
        if (visit.slotTime) {
            metaParts.push(`${visit.slotTime} WIB`);
        }
        if (visit.appointmentStatus) {
            metaParts.push(formatStatus(visit.appointmentStatus));
        }
        if (visit.recordStatus) {
            metaParts.push(formatStatus(visit.recordStatus));
        }
        const metaHtml = metaParts.filter(Boolean).map((part) => `<span>${escapeHtml(part)}</span>`).join('');
        const complaintHtml = visit.chiefComplaint
            ? `<div class="sc-directory-visit-note">${escapeHtml(visit.chiefComplaint)}</div>`
            : '';
        const isActive = Boolean(visit.mrId && visit.mrId.toLowerCase() === activeMr);
        return `
            <button type="button" class="sc-directory-visit${isActive ? ' is-active' : ''}" data-mr-id="${escapeHtml(visit.mrId || '')}" data-patient-id="${escapeHtml(patient.patientId)}" role="option" aria-selected="${isActive}">
                <strong>${escapeHtml(timestamp)}</strong>
                <div class="sc-directory-visit-meta">${metaHtml}</div>
                ${complaintHtml}
            </button>
        `;
    }).join('');

    DIRECTORY_DOM.visitList.innerHTML = itemsHtml;
}

function refreshDirectoryViews() {
    applyDirectoryFilter();

    const filteredContainsSelection = directoryState.selectedPatientId
        && directoryState.filteredPatients.some((patient) => patient.patientId === directoryState.selectedPatientId);

    if (!filteredContainsSelection) {
        const matchByVisit = directoryState.selectedVisitMrId
            ? directoryState.filteredPatients.find((patient) => (patient.visits || []).some((visit) => visit.mrId === directoryState.selectedVisitMrId))
            : null;
        if (matchByVisit) {
            directoryState.selectedPatientId = matchByVisit.patientId;
        } else {
            directoryState.selectedPatientId = directoryState.filteredPatients[0]?.patientId || null;
        }
    }

    renderDirectoryPatients();
    const selectedPatient = getSelectedPatient();
    renderDirectoryInfoPanel(selectedPatient);
    renderDirectoryVisits(selectedPatient);
}

async function loadDirectory({ force = false } = {}) {
    if (directoryState.loading) {
        return;
    }

    if (!force && directoryState.patients.length) {
        refreshDirectoryViews();
        return;
    }

    const token = getToken();
    if (!token) {
        return;
    }

    directoryState.loading = true;
    directoryState.error = null;
    renderDirectoryPatients();
    renderDirectoryInfoPanel(null);
    renderDirectoryVisits(null);

    try {
        const response = await fetch('/api/sunday-clinic/directory', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }

        if (!response.ok) {
            throw new Error('Gagal memuat direktori Sunday Clinic.');
        }

        const payload = await response.json();
        const patients = Array.isArray(payload?.data?.patients) ? payload.data.patients : [];

        directoryState.patients = patients;
        directoryState.loading = false;
        directoryState.error = null;

        const currentPatient = routeMrSlug
            ? patients.find((patient) => (patient.visits || []).some((visit) => visit.mrId === routeMrSlug))
            : null;

        applyDirectoryFilter();

        if (currentPatient) {
            directoryState.selectedPatientId = currentPatient.patientId;
        } else if (!directoryState.selectedPatientId && directoryState.filteredPatients.length) {
            directoryState.selectedPatientId = directoryState.filteredPatients[0].patientId;
        }

        directoryState.selectedVisitMrId = routeMrSlug || directoryState.selectedVisitMrId;

        refreshDirectoryViews();
    } catch (error) {
        directoryState.loading = false;
        directoryState.error = error.message || 'Gagal memuat direktori pasien Sunday Clinic.';
        console.error('Sunday Clinic: gagal memuat direktori', error);
        refreshDirectoryViews();
    }
}

function handleDirectorySearchInput(event) {
    directoryState.searchTerm = event.target.value || '';
    directoryState.selectedPatientId = null;
    applyDirectoryFilter();
    if (directoryState.filteredPatients.length) {
        directoryState.selectedPatientId = directoryState.filteredPatients[0].patientId;
    }
    refreshDirectoryViews();
    if (DIRECTORY_DOM.patientList) {
        DIRECTORY_DOM.patientList.scrollTop = 0;
    }
}

function handleDirectoryPatientClick(patientId) {
    if (!patientId || directoryState.selectedPatientId === patientId) {
        return;
    }
    directoryState.selectedPatientId = patientId;
    directoryState.selectedVisitMrId = null;
    refreshDirectoryViews();
    if (DIRECTORY_DOM.visitList) {
        DIRECTORY_DOM.visitList.scrollTop = 0;
    }
}

function handleDirectoryVisitClick(mrId, patientId) {
    if (!mrId) {
        return;
    }
    if (patientId) {
        directoryState.selectedPatientId = patientId;
    }
    directoryState.selectedVisitMrId = mrId;
    closeDirectory();
    navigateToMr(mrId);
}

function hideLoading() {
    if (DOM.loading) {
        DOM.loading.remove();
        DOM.loading = null;
    }
}

function getSectionLabel(sectionId) {
    return SECTION_LOOKUP.get(sectionId)?.label || sectionId;
}

function updateSectionLabel() {
    if (DOM.sectionLabel) {
        DOM.sectionLabel.textContent = getSectionLabel(activeSection);
    }
}

function setMeta() {
    const displayMrId = state.derived?.mrId || routeMrSlug;
    if (DOM.mrBadge) {
        DOM.mrBadge.textContent = displayMrId ? displayMrId.toUpperCase() : '-';
    }
    if (DOM.mrDisplay) {
        DOM.mrDisplay.textContent = displayMrId ? displayMrId.toUpperCase() : '-';
    }
    updateSectionLabel();
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showLoading(message = 'Memuat data rekam medis...') {
    if (!DOM.content) {
        return;
    }
    DOM.content.innerHTML = `
        <div class="loading-state" id="sunday-clinic-loading">
            <i class="fas fa-spinner fa-spin fa-2x mb-3"></i>
            <p class="mb-0">${escapeHtml(message)}</p>
        </div>
    `;
    DOM.loading = document.getElementById('sunday-clinic-loading');
}

function safeText(value, fallback = '-') {
    const source = value === null || value === undefined || value === '' ? fallback : value;
    return escapeHtml(String(source));
}

function toDate(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
}

function formatDate(value) {
    const date = toDate(value);
    if (!date) {
        return null;
    }
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(date);
}

function formatDateTime(value) {
    const date = toDate(value);
    if (!date) {
        return null;
    }
    return new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'long',
        timeStyle: 'short'
    }).format(date);
}

function formatPhone(value) {
    if (!value) {
        return null;
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.startsWith('+')) {
        return trimmed;
    }
    if (trimmed.startsWith('62')) {
        return `+${trimmed}`;
    }
    return trimmed;
}

function calculateGestationalAge(lmpValue) {
    const lmpDate = toDate(lmpValue);
    if (!lmpDate) {
        return null;
    }
    const diffMs = Date.now() - lmpDate.getTime();
    if (diffMs < 0) {
        return null;
    }
    const totalDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;
    return { weeks, days, reference: lmpDate };
}

function formatGestationalAge(gestationalAge) {
    if (!gestationalAge || !Number.isFinite(gestationalAge.weeks)) {
        return null;
    }
    const weeksText = `${gestationalAge.weeks} minggu`;
    const daysText = Number.isFinite(gestationalAge.days) && gestationalAge.days > 0
        ? ` ${gestationalAge.days} hari`
        : '';
    return weeksText + daysText;
}

function formatYesNo(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const normalized = String(value).trim().toLowerCase();
    if (['ya', 'yes', 'y', 'true'].includes(normalized)) {
        return 'Ya';
    }
    if (['tidak', 'no', 'n', 'false'].includes(normalized)) {
        return 'Tidak';
    }
    return value;
}

function formatRecordStatus(status) {
    if (!status) {
        return null;
    }
    const normalized = String(status).trim().toLowerCase();
    const map = {
        draft: 'Draft',
        finalized: 'Final',
        amended: 'Direvisi'
    };
    if (map[normalized]) {
        return map[normalized];
    }
    return status;
}

function uniqueArray(items) {
    return Array.from(new Set((items || []).map(item => (item === null || item === undefined ? '' : String(item).trim()))))
        .filter(item => item);
}

function mapRiskCodesToLabels(codes) {
    return uniqueArray(Array.isArray(codes)
        ? codes.map(code => RISK_FACTOR_LABELS[code] || code)
        : []);
}

function mapMedicalConditionCodes(codes) {
    return uniqueArray(Array.isArray(codes)
        ? codes.map(code => PAST_CONDITION_LABELS[code] || code)
        : []);
}

function hasMeaningfulContent(value) {
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value === 'string') {
        return value.trim().length > 0;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return true;
    }
    if (Array.isArray(value)) {
        return value.some(item => hasMeaningfulContent(item));
    }
    if (typeof value === 'object') {
        return Object.values(value).some(entry => hasMeaningfulContent(entry));
    }
    return false;
}

function formatRecordTypeLabel(recordType) {
    if (!recordType) {
        return '';
    }
    if (RECORD_TYPE_LABELS[recordType]) {
        return RECORD_TYPE_LABELS[recordType];
    }
    return recordType
        .split(/[_-]/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function getMedicalRecordContext(primaryType, fallbackTypes = []) {
    const bundle = state.derived?.medicalRecords;
    if (!bundle) {
        return null;
    }

    const byType = bundle.byType || {};
    const candidates = [primaryType, ...fallbackTypes];

    for (const type of candidates) {
        const direct = byType[type];
        if (direct && hasMeaningfulContent(direct.data)) {
            return {
                record: direct,
                data: direct.data || {},
                source: 'record',
                recordType: type
            };
        }

        const completeData = bundle.latestComplete?.data?.[type];
        if (completeData && hasMeaningfulContent(completeData)) {
            return {
                record: bundle.latestComplete,
                data: completeData,
                source: 'complete',
                recordType: type
            };
        }
    }

    return null;
}

function renderRecordMeta(context, primaryType) {
    if (!context || !context.record) {
        return '';
    }

    const meta = [];
    if (context.record.doctorName) {
        meta.push(`Dicatat oleh ${escapeHtml(context.record.doctorName)}`);
    }

    const timestamp = context.record.updatedAt || context.record.createdAt;
    const timestampText = formatDateTime(timestamp);
    if (timestampText) {
        meta.push(`Terakhir diperbarui ${escapeHtml(timestampText)}`);
    }

    if (context.source === 'complete') {
        meta.push('Sumber: Rekam medis lengkap');
    }

    if (context.recordType && primaryType && context.recordType !== primaryType) {
        meta.push(`Menggunakan data ${escapeHtml(formatRecordTypeLabel(context.recordType))}`);
    }

    if (!meta.length) {
        return '';
    }

    return `<div class="sc-note">${meta.join(' • ')}</div>`;
}

function renderChipList(items) {
    const list = uniqueArray(items);
    if (!list.length) {
        return safeText('-');
    }
    return `<div class="sc-chip-list">${list.map(item => `<span class="sc-chip">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function formatMultiline(value, fallback = '-') {
    if (!value || !String(value).trim()) {
        return safeText(fallback);
    }
    return escapeHtml(String(value)).replace(/\n/g, '<br>');
}

function buildInfoTable(rows) {
    const normalized = rows.filter(row => Array.isArray(row) && row.length === 2);
    if (!normalized.length) {
        return '';
    }
    const body = normalized
        .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`)
        .join('');
    return `<table class="sc-info-table"><tbody>${body}</tbody></table>`;
}

function renderPreviousPregnanciesTable(pregnancies) {
    const records = (Array.isArray(pregnancies) ? pregnancies : [])
        .filter(entry => entry && Object.values(entry).some(value => value));

    if (!records.length) {
        return '<div class="sc-note">Tidak ada catatan kehamilan sebelumnya.</div>';
    }

    const rows = records.map((entry, index) => {
        const number = index + 1;
        const year = safeText(entry.year || entry.preg_year || '-');
        const mode = safeText(entry.mode || entry.preg_mode || '-');
        const complication = formatMultiline(entry.complication || entry.preg_complication || '-', '-');
        const weight = safeText(entry.weight || entry.preg_weight || '-');
        const alive = safeText(formatYesNo(entry.alive || entry.preg_alive) || '-');
        return `
            <tr>
                <td>${safeText(number)}</td>
                <td>${year}</td>
                <td>${mode}</td>
                <td>${complication}</td>
                <td>${weight}</td>
                <td>${alive}</td>
            </tr>
        `;
    }).join('');

    return `
        <table class="sc-data-table">
            <thead>
                <tr>
                    <th>No</th>
                    <th>Tahun</th>
                    <th>Mode Persalinan</th>
                    <th>Komplikasi</th>
                    <th>Berat Bayi (gr)</th>
                    <th>Anak Hidup</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function buildMedicationsList(payload) {
    if (!payload || typeof payload !== 'object') {
        return [];
    }
    const entries = [];

    if (Array.isArray(payload.medications)) {
        payload.medications.forEach(item => {
            if (!item) {
                return;
            }
            const parts = [];
            if (item.name) parts.push(item.name);
            if (item.dose) parts.push(item.dose);
            if (item.freq) parts.push(item.freq);
            const combined = parts.join(' ').trim();
            if (combined) {
                entries.push(combined);
            }
        });
    }

    if (payload.current_medications) {
        payload.current_medications
            .split(/;|\n|,/)
            .map(part => part.trim())
            .filter(Boolean)
            .forEach(part => entries.push(part));
    }

    return uniqueArray(entries);
}

function formatTrimester(value) {
    if (value === null || value === undefined || value === '') {
        return '-';
    }
    const normalized = String(value).trim();
    const map = {
        '1': 'Trimester 1',
        '2': 'Trimester 2',
        '3': 'Trimester 3'
    };
    return map[normalized] || normalized;
}

function renderLabTestsTable(tests) {
    if (!Array.isArray(tests)) {
        return '<div class="sc-note">Tidak ada riwayat pemeriksaan laboratorium terperinci.</div>';
    }

    const meaningful = tests.filter(entry => hasMeaningfulContent(entry));
    if (!meaningful.length) {
        return '<div class="sc-note">Tidak ada riwayat pemeriksaan laboratorium terperinci.</div>';
    }

    const rows = meaningful.map((entry, index) => {
        const order = entry.test_number || index + 1;
        const testType = safeText(entry.test_type || '-');
        const trimester = safeText(formatTrimester(entry.trimester));
        const testDate = safeText(formatDate(entry.test_date) || entry.test_date || '-');
        const result = formatMultiline(entry.results || '-');
        const followUpLabel = FOLLOWUP_LABELS[entry.followup] || entry.followup || '-';
        const followUp = safeText(followUpLabel);

        return `
            <tr>
                <td>${safeText(order)}</td>
                <td>${testType}</td>
                <td>${trimester}</td>
                <td>${testDate}</td>
                <td>${result}</td>
                <td>${followUp}</td>
            </tr>
        `;
    }).join('');

    return `
        <table class="sc-data-table">
            <thead>
                <tr>
                    <th>No</th>
                    <th>Jenis Tes</th>
                    <th>Trimester</th>
                    <th>Tanggal</th>
                    <th>Hasil</th>
                    <th>Tindak Lanjut</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function formatStatus(value) {
    if (!value) {
        return null;
    }
    const normalized = String(value).toLowerCase();
    const mapping = {
        verified: 'Terverifikasi',
        patient_reported: 'Dilaporkan Pasien',
        pending_review: 'Menunggu Review',
        finalized: 'Final'
    };
    if (mapping[normalized]) {
        return mapping[normalized];
    }
    return String(value).replace(/[_-]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function computeDerived(data) {
    const record = data.record || {};
    const patient = data.patient || {};
    const appointment = data.appointment || null;
    const intake = data.intake || {};
    const medicalRecords = data.medicalRecords || null;
    const payload = intake.payload && typeof intake.payload === 'object' ? intake.payload : {};
    const metadata = intake.metadata && typeof intake.metadata === 'object'
        ? intake.metadata
        : (payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {});
    const summary = intake.summary || {};

    const displayMrId = record.mrId || record.mr_id || routeMrSlug || null;
    const fullName = summary.fullName || payload.full_name || patient.fullName || appointment?.patientName || null;
    const dob = summary.dob || payload.dob || patient.birthDate || payload.patient_dob || null;
    const ageSource = summary.age ?? patient.age ?? (payload.patient_age ? Number(payload.patient_age) : null);
    const phone = payload.phone || patient.whatsapp || patient.phone || appointment?.patientPhone || null;
    const emergencyContact = payload.patient_emergency_contact || null;
    const address = payload.address || payload.patient_address || null;
    const maritalStatus = payload.marital_status || null;
    const lmp = summary.lmp || payload.lmp_date || payload.lmp || (metadata.edd && metadata.edd.lmpReference) || null;
    const edd = summary.edd || (metadata.edd && metadata.edd.value) || payload.edd || null;
    const gestationalAge = summary.gestationalAge || calculateGestationalAge(lmp);
    const obstetric = metadata.obstetricTotals && typeof metadata.obstetricTotals === 'object' ? metadata.obstetricTotals : {};
    const gravida = obstetric.gravida ?? payload.gravida_count ?? payload.gravida ?? null;
    const para = obstetric.para ?? payload.para_count ?? payload.para ?? null;
    const abortus = obstetric.abortus ?? payload.abortus_count ?? payload.abortus ?? null;
    const living = obstetric.living ?? payload.living_children_count ?? payload.living ?? null;
    const bmi = metadata.bmiValue || payload.bmi || null;
    const riskFlags = (summary.riskFlags && summary.riskFlags.length)
        ? summary.riskFlags
        : mapRiskCodesToLabels(summary.riskFactorCodes || payload.risk_factors);
    const highRisk = Boolean(summary.highRisk || metadata.highRisk || (payload.flags && payload.flags.highRisk));

    return {
        record,
        patient,
        appointment,
        intake,
        payload,
        metadata,
        summary,
        mrId: displayMrId,
        patientName: fullName,
        quickId: intake.quickId || intake.quick_id || null,
        patientId: record.patientId || record.patient_id || null,
        age: Number.isFinite(ageSource) ? Math.round(ageSource) : null,
        dob,
        phone,
        emergencyContact,
        address,
        maritalStatus,
        husbandName: payload.husband_name || null,
        husbandAge: payload.husband_age || null,
        husbandJob: payload.husband_job || null,
        occupation: payload.occupation || null,
        education: payload.education || null,
        insurance: payload.insurance || null,
        edd,
        lmp,
        gestationalAge,
        gravida,
        para,
        abortus,
        living,
        bmi,
        riskFlags,
        riskFactorCodes: summary.riskFactorCodes || payload.risk_factors || [],
        highRisk,
        cycle: {
            menarcheAge: payload.menarche_age || null,
            cycleLength: payload.cycle_length || null,
            regular: payload.cycle_regular || null
        },
        contraception: {
            previous: payload.previous_contraception || null,
            failure: payload.contraception_failure || payload.kb_failure || null,
            failureType: payload.failed_contraception_type || payload.current_contraception || null
        },
        intakeCreatedAt: intake.createdAt || intake.created_at || null,
        intakeReviewedAt: intake.reviewedAt || intake.reviewed_at || (intake.review && (intake.review.verifiedAt || intake.review.reviewedAt)) || null,
        intakeReviewedBy: intake.reviewedBy || (intake.review && (intake.review.verifiedBy || intake.review.reviewedBy)) || null,
        intakeStatus: intake.status || null,
        intakeReviewNotes: intake.reviewNotes || (intake.review && intake.review.notes) || null,
        medicalRecords
    };
}

function createSummaryCard(title, valueHtml, metaItems = []) {
    const card = document.createElement('div');
    card.className = 'sc-summary-card';
    card.innerHTML = `
        <h4>${escapeHtml(title)}</h4>
        <div class="sc-summary-value">${valueHtml}</div>
        ${metaItems.length ? `<div class="sc-summary-meta">${metaItems.join('<br>')}</div>` : ''}
    `;
    return card;
}

function createHeaderCard(title, valueHtml, metaHtml = '') {
    const card = document.createElement('div');
    card.className = 'sc-header-card';
    card.innerHTML = `
        <h6>${escapeHtml(title)}</h6>
        <div class="value">${valueHtml}</div>
        ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ''}
    `;
    return card;
}

function createSummary() {
    if (!state.derived) {
        return null;
    }
    const derived = state.derived;
    const container = document.createElement('div');
    container.className = 'd-flex flex-wrap';

    // Card 1: Pasien (without high risk badge)
    const patientMeta = derived.quickId ? `Quick ID: ${escapeHtml(derived.quickId)}` : '';
    container.appendChild(createHeaderCard(
        'Pasien',
        safeText(derived.patientName || '-'),
        patientMeta
    ));

    // Card 2: Usia
    const dobText = formatDate(derived.dob);
    const ageMeta = dobText ? `Lahir ${escapeHtml(dobText)}` : '';
    container.appendChild(createHeaderCard(
        'Usia',
        safeText(derived.age ? `${derived.age} th` : '-'),
        ageMeta
    ));

    // Card 3: Usia Kehamilan
    const gaText = formatGestationalAge(derived.gestationalAge) || '-';
    const hphtText = formatDate(derived.lmp);
    const eddText = formatDate(derived.edd);
    const pregnancyMetaParts = [];
    if (hphtText) pregnancyMetaParts.push(`HPHT ${escapeHtml(hphtText)}`);
    if (eddText) pregnancyMetaParts.push(`HPL ${escapeHtml(eddText)}`);
    container.appendChild(createHeaderCard(
        'Usia Kehamilan',
        safeText(gaText),
        pregnancyMetaParts.join(' • ')
    ));

    // Card 4: Janji Temu
    let appointmentValue = 'Tidak terhubung';
    let appointmentMeta = '';
    if (derived.appointment) {
        const appointmentDate = formatDate(derived.appointment.appointmentDate);
        appointmentValue = appointmentDate || 'Terhubung';
        const metaParts = [];
        if (derived.appointment.slotTime) {
            metaParts.push(`${derived.appointment.slotTime} WIB`);
        }
        if (derived.appointment.status) {
            metaParts.push(formatStatus(derived.appointment.status));
        }
        appointmentMeta = metaParts.join(' • ');
    }
    container.appendChild(createHeaderCard(
        'Janji Temu',
        safeText(appointmentValue),
        appointmentMeta
    ));

    return container;
}

function buildPath(sectionId) {
    const base = `/sunday-clinic/${encodeURIComponent(routeMrSlug || '')}`;
    const remainder = routeRemainder ? `/${routeRemainder}` : '';
    return `${base}/${sectionId}${remainder}`;
}

function createSidebar() {
    // Return null since we're using the main sidebar now
    return null;
}

function updateSidebarActive() {
    // Update main sidebar navigation
    const links = document.querySelectorAll('.main-sidebar .sc-nav-link[data-section]');
    links.forEach(link => {
        link.classList.toggle('active', link.dataset.section === activeSection);
    });
}

function renderIdentitas() {
    const section = document.createElement('div');
    section.className = 'sc-section';
    const derived = state.derived;
    const patient = derived.patient || {};

    const primaryRows = [
        ['Nama Lengkap', safeText(derived.patientName || '-')],
        ['Quick ID Intake', safeText(derived.quickId || '-')],
        ['ID Pasien', safeText(derived.patientId || '-')],
        ['Usia', safeText(derived.age ? `${derived.age} tahun` : '-')],
        ['Telepon', safeText(formatPhone(derived.phone) || '-')],
        ['Kontak Darurat', safeText(formatPhone(derived.emergencyContact) || '-')],
        ['Email', safeText(patient.email || '-')],
        ['Alamat', formatMultiline(derived.address)],
        ['Status Pernikahan', safeText(formatStatus(derived.maritalStatus) || '-')],
        ['Nama Suami', safeText(derived.husbandName || '-')],
        ['Umur Suami', safeText(derived.husbandAge ? `${derived.husbandAge} tahun` : '-')],
        ['Pekerjaan Suami', safeText(derived.husbandJob || '-')],
        ['Pekerjaan Ibu', safeText(derived.occupation || '-')],
        ['Pendidikan', safeText(derived.education || '-')],
        ['Asuransi', safeText(derived.insurance || '-')]
    ];

    const intakeRows = [
        ['Status Intake', safeText(formatStatus(derived.intakeStatus) || '-')],
        ['Diterima', safeText(formatDateTime(derived.intakeCreatedAt) || '-')],
        ['Diverifikasi', safeText(formatDateTime(derived.intakeReviewedAt) || '-')],
        ['Direview Oleh', safeText(derived.intakeReviewedBy || '-')],
        ['Catatan Review', formatMultiline(derived.intakeReviewNotes)]
    ];

    const riskBlock = derived.riskFlags && derived.riskFlags.length
        ? `<div class="sc-note">Faktor Risiko Intake: ${renderChipList(derived.riskFlags)}</div>`
        : '';

    const riskBadge = derived.highRisk
        ? '<span class="sc-pill sc-pill--danger ml-3">High Risk</span>'
        : '';

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Identitas Pasien${riskBadge}</h3>
        </div>
        <div class="sc-grid two">
            <div class="sc-card">
                <h4>Data Utama</h4>
                ${buildInfoTable(primaryRows)}
            </div>
            <div class="sc-card">
                <h4>Informasi Intake</h4>
                ${buildInfoTable(intakeRows)}
                ${riskBlock}
            </div>
        </div>
    `;

    return section;
}

function renderAnamnesa() {
    const section = document.createElement('div');
    section.className = 'sc-section';
    const derived = state.derived;
    const payload = derived.payload || {};

    // Load saved anamnesa data from medical records
    const context = getMedicalRecordContext('anamnesa');
    const savedData = context?.data || {};

    // Merge saved data with intake data (saved data takes priority)
    const keluhanUtama = savedData.keluhan_utama || derived.appointment?.chiefComplaint || payload.current_symptoms || payload.reason || '';
    const riwayatKehamilanSaatIni = savedData.riwayat_kehamilan_saat_ini || payload.current_pregnancy_history || payload.obstetric_history || '';
    const hpht = savedData.hpht || derived.lmp || '';
    const hpl = savedData.hpl || derived.edd || '';
    const detailRiwayatPenyakit = savedData.detail_riwayat_penyakit || payload.past_medical_history || payload.other_conditions || payload.past_conditions_detail || '';
    const riwayatKeluarga = savedData.riwayat_keluarga || payload.family_medical_history || payload.family_history_detail || '';
    const alergiObat = savedData.alergi_obat || payload.drug_allergies || payload.allergy_drugs || '';
    const alergiMakanan = savedData.alergi_makanan || payload.food_allergies || payload.allergy_food || '';
    const alergiLingkungan = savedData.alergi_lingkungan || payload.other_allergies || payload.allergy_env || '';
    const gravida = savedData.gravida ?? derived.gravida ?? '';
    const para = savedData.para ?? derived.para ?? '';
    const abortus = savedData.abortus ?? derived.abortus ?? '';
    const anakHidup = savedData.anak_hidup ?? derived.living ?? '';
    const usiaMenuarche = savedData.usia_menarche ?? derived.cycle.menarcheAge ?? '';
    const lamaSiklus = savedData.lama_siklus ?? derived.cycle.cycleLength ?? '';
    const siklusTeratur = savedData.siklus_teratur ?? (derived.cycle.regular !== undefined ? (derived.cycle.regular ? 'Ya' : 'Tidak') : '');
    const metodeKBTerakhir = savedData.metode_kb_terakhir ?? derived.contraception.previous ?? '';
    const kegagalanKB = savedData.kegagalan_kb ?? (derived.contraception.failure !== undefined ? (derived.contraception.failure ? 'Ya' : 'Tidak') : '');
    const jenisKBGagal = savedData.jenis_kb_gagal ?? derived.contraception.failureType ?? '';

    // Verification banner
    const verificationBanner = savedData.verified_by && savedData.verified_at
        ? `<div class="alert alert-success mb-3">
            <i class="fas fa-check-circle"></i> Diverifikasi oleh <strong>${escapeHtml(savedData.verified_by)}</strong> pada ${formatDateTime(savedData.verified_at)}
           </div>`
        : '';

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Anamnesa & Riwayat</h3>
            <button class="btn btn-primary btn-sm" id="btn-update-anamnesa" style="display:none;">
                <i class="fas fa-save"></i> Update
            </button>
        </div>
        ${verificationBanner}
        <div class="sc-grid two">
            <div class="sc-card">
                <h4>Keluhan & Kehamilan Saat Ini</h4>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Keluhan Utama</label>
                    <textarea class="form-control anamnesa-field" id="anamnesa-keluhan-utama" rows="2">${escapeHtml(keluhanUtama)}</textarea>
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Riwayat Kehamilan Saat Ini</label>
                    <textarea class="form-control anamnesa-field" id="anamnesa-riwayat-kehamilan" rows="2">${escapeHtml(riwayatKehamilanSaatIni)}</textarea>
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">HPHT</label>
                    <input type="date" class="form-control anamnesa-field" id="anamnesa-hpht" value="${escapeHtml(hpht)}">
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">HPL</label>
                    <input type="date" class="form-control anamnesa-field" id="anamnesa-hpl" value="${escapeHtml(hpl)}">
                </div>
            </div>
            <div class="sc-card">
                <h4>Riwayat Medis</h4>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Detail Riwayat Penyakit</label>
                    <textarea class="form-control anamnesa-field" id="anamnesa-detail-riwayat" rows="2">${escapeHtml(detailRiwayatPenyakit)}</textarea>
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Riwayat Keluarga</label>
                    <textarea class="form-control anamnesa-field" id="anamnesa-riwayat-keluarga" rows="2">${escapeHtml(riwayatKeluarga)}</textarea>
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Alergi Obat</label>
                    <textarea class="form-control anamnesa-field" id="anamnesa-alergi-obat" rows="2">${escapeHtml(alergiObat)}</textarea>
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Alergi Makanan</label>
                    <textarea class="form-control anamnesa-field" id="anamnesa-alergi-makanan" rows="2">${escapeHtml(alergiMakanan)}</textarea>
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Alergi Lingkungan</label>
                    <textarea class="form-control anamnesa-field" id="anamnesa-alergi-lingkungan" rows="2">${escapeHtml(alergiLingkungan)}</textarea>
                </div>
            </div>
        </div>
        <div class="sc-grid two">
            <div class="sc-card">
                <h4>Ringkasan Obstetri</h4>
                <div class="row">
                    <div class="col-md-6 form-group mb-3">
                        <label class="font-weight-bold">Gravida (G)</label>
                        <input type="number" class="form-control anamnesa-field" id="anamnesa-gravida" value="${escapeHtml(gravida)}">
                    </div>
                    <div class="col-md-6 form-group mb-3">
                        <label class="font-weight-bold">Para (P)</label>
                        <input type="number" class="form-control anamnesa-field" id="anamnesa-para" value="${escapeHtml(para)}">
                    </div>
                    <div class="col-md-6 form-group mb-3">
                        <label class="font-weight-bold">Abortus (A)</label>
                        <input type="number" class="form-control anamnesa-field" id="anamnesa-abortus" value="${escapeHtml(abortus)}">
                    </div>
                    <div class="col-md-6 form-group mb-3">
                        <label class="font-weight-bold">Anak Hidup (L)</label>
                        <input type="number" class="form-control anamnesa-field" id="anamnesa-anak-hidup" value="${escapeHtml(anakHidup)}">
                    </div>
                </div>
            </div>
            <div class="sc-card">
                <h4>Siklus & Kontrasepsi</h4>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Usia Menarche (tahun)</label>
                    <input type="number" class="form-control anamnesa-field" id="anamnesa-usia-menarche" value="${escapeHtml(usiaMenuarche)}">
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Lama Siklus (hari)</label>
                    <input type="number" class="form-control anamnesa-field" id="anamnesa-lama-siklus" value="${escapeHtml(lamaSiklus)}">
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Siklus Teratur</label>
                    <select class="form-control anamnesa-field" id="anamnesa-siklus-teratur">
                        <option value="">-</option>
                        <option value="Ya" ${siklusTeratur === 'Ya' ? 'selected' : ''}>Ya</option>
                        <option value="Tidak" ${siklusTeratur === 'Tidak' ? 'selected' : ''}>Tidak</option>
                    </select>
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Metode KB Terakhir</label>
                    <input type="text" class="form-control anamnesa-field" id="anamnesa-metode-kb" value="${escapeHtml(metodeKBTerakhir)}">
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Kegagalan KB</label>
                    <select class="form-control anamnesa-field" id="anamnesa-kegagalan-kb">
                        <option value="">-</option>
                        <option value="Ya" ${kegagalanKB === 'Ya' ? 'selected' : ''}>Ya</option>
                        <option value="Tidak" ${kegagalanKB === 'Tidak' ? 'selected' : ''}>Tidak</option>
                    </select>
                </div>
                <div class="form-group mb-3">
                    <label class="font-weight-bold">Jenis KB saat gagal</label>
                    <input type="text" class="form-control anamnesa-field" id="anamnesa-jenis-kb-gagal" value="${escapeHtml(jenisKBGagal)}">
                </div>
            </div>
        </div>
    `;

    // Add change detection
    setTimeout(() => {
        const fields = section.querySelectorAll('.anamnesa-field');
        const updateBtn = document.getElementById('btn-update-anamnesa');

        fields.forEach(field => {
            field.addEventListener('input', () => {
                if (updateBtn) updateBtn.style.display = 'inline-block';
            });
        });

        if (updateBtn) {
            updateBtn.addEventListener('click', saveAnamnesa);
        }
    }, 0);

    return section;
}

function renderPemeriksaan() {
    const context = getMedicalRecordContext('physical_exam');
    const data = context?.data || {};

    const section = document.createElement('div');
    section.className = 'sc-section';

    const metaHtml = context ? renderRecordMeta(context, 'physical_exam') : '';

    // Build vital signs in horizontal layout
    const vitalsHtml = `
        <div class="row mb-3">
            <div class="col-md-3">
                <label class="font-weight-bold">Tekanan Darah</label>
                <input type="text" class="form-control" id="pe-tekanan-darah" value="${escapeHtml(data.tekanan_darah || '120/80')}">
            </div>
            <div class="col-md-3">
                <label class="font-weight-bold">Nadi</label>
                <input type="text" class="form-control" id="pe-nadi" value="${escapeHtml(data.nadi || '88')}">
            </div>
            <div class="col-md-3">
                <label class="font-weight-bold">Suhu</label>
                <input type="text" class="form-control" id="pe-suhu" value="${escapeHtml(data.suhu || '36.8')}">
            </div>
            <div class="col-md-3">
                <label class="font-weight-bold">Respirasi</label>
                <input type="text" class="form-control" id="pe-respirasi" value="${escapeHtml(data.respirasi || '18')}">
            </div>
        </div>
    `;

    // Build examination findings
    const findingsHtml = `
        <div class="mb-3">
            <label class="font-weight-bold">Pemeriksaan Kepala & Leher</label>
            <textarea class="form-control" id="pe-kepala-leher" rows="2">${escapeHtml(data.kepala_leher || 'Anemia/Icterus/Cyanosis/Dyspneu (-)')}</textarea>
        </div>
        <div class="mb-3">
            <label class="font-weight-bold">Pemeriksaan Thorax</label>
            <textarea class="form-control" id="pe-thorax" rows="3">${escapeHtml(data.thorax || 'Simetris. Vesiculer/vesicular. Rhonki/Wheezing (-)\nS1 S2 tunggal, murmur (-), gallop (-)')}</textarea>
        </div>
        <div class="mb-3">
            <label class="font-weight-bold">Pemeriksaan Abdomen</label>
            <textarea class="form-control" id="pe-abdomen" rows="3">${escapeHtml(data.abdomen || 'BU (+), Soepel\nGravida tampak sesuai usia kehamilan / Massa abdomen')}</textarea>
        </div>
        <div class="mb-3">
            <label class="font-weight-bold">Pemeriksaan Ekstremitas</label>
            <textarea class="form-control" id="pe-ekstremitas" rows="2">${escapeHtml(data.ekstremitas || 'Akral hangat, kering. CRT < 2 detik')}</textarea>
        </div>
        <div class="mb-3">
            <label class="font-weight-bold">Pemeriksaan Obstetri</label>
            <textarea class="form-control" id="pe-obstetri" rows="4">${escapeHtml(data.pemeriksaan_obstetri || 'TFU:\nDJJ:\nVT: (tidak dilakukan)')}</textarea>
        </div>
    `;

    const saveButton = `
        <div class="text-right mt-3">
            <button type="button" class="btn btn-primary" id="save-physical-exam">
                <i class="fas fa-save mr-2"></i>Simpan Pemeriksaan Fisik
            </button>
        </div>
    `;

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Pemeriksaan Fisik</h3>
        </div>
        ${metaHtml}
        <div class="sc-card">
            ${vitalsHtml}
            ${findingsHtml}
            ${saveButton}
        </div>
    `;

    // Add save handler
    setTimeout(() => {
        const saveBtn = document.getElementById('save-physical-exam');
        if (saveBtn) {
            saveBtn.addEventListener('click', savePhysicalExam);
        }
    }, 0);

    return section;
}

async function savePhysicalExam() {
    try {
        const data = {
            tekanan_darah: document.getElementById('pe-tekanan-darah')?.value || '',
            nadi: document.getElementById('pe-nadi')?.value || '',
            suhu: document.getElementById('pe-suhu')?.value || '',
            respirasi: document.getElementById('pe-respirasi')?.value || '',
            kepala_leher: document.getElementById('pe-kepala-leher')?.value || '',
            thorax: document.getElementById('pe-thorax')?.value || '',
            abdomen: document.getElementById('pe-abdomen')?.value || '',
            ekstremitas: document.getElementById('pe-ekstremitas')?.value || '',
            pemeriksaan_obstetri: document.getElementById('pe-obstetri')?.value || ''
        };

        const token = await getToken();
        if (!token) return;

        const response = await fetch('/api/medical-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                patientId: routeMrSlug,
                type: 'physical_exam',
                data: data,
                doctorName: 'Staff User',
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            console.error('Server error response:', errorData);
            throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log('Save successful:', result);

        showSuccess('Pemeriksaan Fisik berhasil disimpan!');

        // Reload the record to show updated data
        await fetchRecord(routeMrSlug);

    } catch (error) {
        console.error('Error saving physical exam:', error);
        showError('Gagal menyimpan pemeriksaan fisik: ' + error.message);
    }
}

async function saveDiagnosis() {
    try {
        const data = {
            diagnosis_utama: document.getElementById('diagnosis-utama')?.value || '',
            diagnosis_sekunder: document.getElementById('diagnosis-sekunder')?.value || ''
        };

        const patientId = state.derived?.patientId;
        if (!patientId) {
            showError('Patient ID tidak ditemukan');
            return;
        }

        const token = await getToken();
        if (!token) return;

        const response = await fetch('/api/medical-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                patientId: patientId,
                type: 'diagnosis',
                data: data,
                doctorName: 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.',
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            console.error('Server error response:', errorData);
            throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log('Save successful:', result);

        showSuccess('Diagnosis berhasil disimpan!');

        // Reload the record to show updated data
        await fetchRecord(routeMrSlug);

    } catch (error) {
        console.error('Error saving diagnosis:', error);
        showError('Gagal menyimpan diagnosis: ' + error.message);
    }
}

async function savePlanning() {
    try {
        const data = {
            tindakan: document.getElementById('planning-tindakan')?.value || '',
            terapi: document.getElementById('planning-terapi')?.value || '',
            rencana: document.getElementById('planning-rencana')?.value || ''
        };

        const patientId = state.derived?.patientId;
        if (!patientId) {
            showError('Patient ID tidak ditemukan');
            return;
        }

        const token = await getToken();
        if (!token) return;

        const response = await fetch('/api/medical-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                patientId: patientId,
                type: 'planning',
                data: data,
                doctorName: 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.',
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            console.error('Server error response:', errorData);
            throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const result = await response.json();
        console.log('Save successful:', result);

        showSuccess('Planning berhasil disimpan!');

        // Reload the record to show updated data
        await fetchRecord(routeMrSlug);

    } catch (error) {
        console.error('Error saving planning:', error);
        showError('Gagal menyimpan planning: ' + error.message);
    }
}

async function openTindakanModal() {
    try {
        const token = await getToken();
        if (!token) return;

        const response = await fetch('/api/tindakan?active=true', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch tindakan');

        const result = await response.json();
        const tindakanList = result.data || result;

        // Filter out ADMINISTRATIF category
        const filteredTindakan = tindakanList.filter(item => item.category !== 'ADMINISTRATIF');

        // Show modal with tindakan list
        showTindakanModal(filteredTindakan);

    } catch (error) {
        console.error('Error loading tindakan:', error);
        showError('Gagal memuat data tindakan: ' + error.message);
    }
}

async function openTerapiModal() {
    try {
        const token = await getToken();
        if (!token) return;

        const response = await fetch('/api/obat?active=true', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch obat');

        const result = await response.json();
        const obatList = result.data || result;

        // Show modal with obat list
        showTerapiModal(obatList);

    } catch (error) {
        console.error('Error loading obat:', error);
        showError('Gagal memuat data obat: ' + error.message);
    }
}

function showTindakanModal(tindakanList) {
    const modal = document.getElementById('tindakan-modal');
    const tbody = document.getElementById('tindakan-modal-body');

    if (!modal || !tbody) return;

    // Clear existing content
    tbody.innerHTML = '';

    // Populate table
    tindakanList.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(item.code || '')}</td>
            <td>${escapeHtml(item.name || '')}</td>
            <td>${escapeHtml(item.category || '')}</td>
            <td>
                <button type="button" class="btn btn-sm btn-success" onclick="addTindakan('${escapeHtml(item.name || '')}')">
                    <i class="fas fa-plus"></i> Tambah
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Show modal using Bootstrap
    $('#tindakan-modal').modal('show');
}

function showTerapiModal(obatList) {
    const modal = document.getElementById('terapi-modal');
    const tbody = document.getElementById('terapi-modal-body');

    if (!modal || !tbody) return;

    // Clear existing content
    tbody.innerHTML = '';

    // Populate table with checkboxes
    obatList.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input obat-checkbox" id="obat-${index}" data-obat-name="${escapeHtml(item.name || '')}" data-obat-id="${item.id || ''}">
                    <label class="custom-control-label" for="obat-${index}"></label>
                </div>
            </td>
            <td>${escapeHtml(item.code || '')}</td>
            <td>${escapeHtml(item.name || '')}</td>
            <td>${escapeHtml(item.category || '')}</td>
            <td>${item.stock !== undefined ? item.stock : '-'}</td>
        `;
        tbody.appendChild(row);
    });

    // Add select all functionality
    const selectAllCheckbox = document.getElementById('select-all-obat');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.onchange = function() {
            const checkboxes = document.querySelectorAll('.obat-checkbox');
            checkboxes.forEach(cb => cb.checked = this.checked);
        };
    }

    // Show modal using Bootstrap
    $('#terapi-modal').modal('show');
}

function proceedToCaraPakai() {
    // Get all selected obat
    const selectedCheckboxes = document.querySelectorAll('.obat-checkbox:checked');

    if (selectedCheckboxes.length === 0) {
        showError('Silakan pilih minimal satu obat');
        return;
    }

    const selectedObat = Array.from(selectedCheckboxes).map(cb => ({
        name: cb.dataset.obatName,
        id: cb.dataset.obatId
    }));

    // Hide terapi modal
    $('#terapi-modal').modal('hide');

    // Show batch cara pakai modal
    showBatchCaraPakaiModal(selectedObat);
}

function showBatchCaraPakaiModal(selectedObat) {
    const modalBody = document.getElementById('batch-cara-pakai-body');
    if (!modalBody) return;

    // Build form for each selected obat
    let formHtml = '';
    selectedObat.forEach((obat, index) => {
        formHtml += `
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <h6 class="mb-0"><i class="fas fa-pills mr-2"></i>${escapeHtml(obat.name)}</h6>
                </div>
                <div class="card-body">
                    <div class="form-row">
                        <div class="form-group col-md-4">
                            <label class="font-weight-bold">Jumlah:</label>
                            <input type="number" class="form-control" id="jumlah-${index}" min="1" value="1" placeholder="Jumlah">
                        </div>
                        <div class="form-group col-md-4">
                            <label class="font-weight-bold">Satuan:</label>
                            <select class="form-control" id="satuan-${index}">
                                <option value="tablet">tablet</option>
                                <option value="kapsul">kapsul</option>
                                <option value="box">box</option>
                                <option value="botol">botol</option>
                                <option value="tube">tube</option>
                                <option value="sachet">sachet</option>
                                <option value="ampul">ampul</option>
                                <option value="vial">vial</option>
                            </select>
                        </div>
                        <div class="form-group col-md-4">
                            <label class="font-weight-bold">Cara Pakai:</label>
                            <input type="text" class="form-control" id="carapakai-${index}" placeholder="3x1 sebelum makan">
                        </div>
                    </div>
                    <small class="form-text text-muted">
                        Contoh: "3x1 sebelum makan", "2x1 setelah makan", "1x1 sehari"
                    </small>
                </div>
            </div>
        `;
    });

    modalBody.innerHTML = formHtml;

    // Store selected obat data for later use
    window.selectedObatForPrescription = selectedObat;

    // Show modal
    $('#cara-pakai-modal').modal('show');
}

function backToObatSelection() {
    $('#cara-pakai-modal').modal('hide');
    $('#terapi-modal').modal('show');
}

function addBatchTerapi() {
    const selectedObat = window.selectedObatForPrescription;
    if (!selectedObat || selectedObat.length === 0) return;

    const textarea = document.getElementById('planning-terapi');
    if (!textarea) return;

    let allPrescriptions = [];

    // Collect all prescriptions
    selectedObat.forEach((obat, index) => {
        const jumlah = document.getElementById(`jumlah-${index}`)?.value || '1';
        const satuan = document.getElementById(`satuan-${index}`)?.value || 'tablet';
        const caraPakai = document.getElementById(`carapakai-${index}`)?.value.trim() || '';

        // Convert to Latin format
        const romanQuantity = toRoman(parseInt(jumlah));
        const latinSig = convertToLatinSig(caraPakai);

        // Format: R/ [Drug] [Unit] No. [Roman] Sig. [Latin]
        let prescription = `R/ ${obat.name} ${satuan} No. ${romanQuantity}`;
        if (latinSig) {
            prescription += ` Sig. ${latinSig}`;
        }

        allPrescriptions.push(prescription);
    });

    // Add all prescriptions to textarea
    const currentValue = textarea.value.trim();
    const newEntries = allPrescriptions.join('\n');

    if (currentValue) {
        textarea.value = currentValue + '\n' + newEntries;
    } else {
        textarea.value = newEntries;
    }

    // Hide modal
    $('#cara-pakai-modal').modal('hide');

    showSuccess(`${selectedObat.length} resep obat ditambahkan`);

    // Clear stored data
    window.selectedObatForPrescription = null;
}

function addTindakan(tindakanName) {
    const textarea = document.getElementById('planning-tindakan');
    if (!textarea) return;

    const currentValue = textarea.value.trim();
    const newEntry = `- ${tindakanName}`;

    if (currentValue) {
        textarea.value = currentValue + '\n' + newEntry;
    } else {
        textarea.value = newEntry;
    }

    showSuccess(`Tindakan "${tindakanName}" ditambahkan`);
}


// Convert Arabic number to Roman numerals
function toRoman(num) {
    const romanNumerals = [
        { value: 1000, numeral: 'M' },
        { value: 900, numeral: 'CM' },
        { value: 500, numeral: 'D' },
        { value: 400, numeral: 'CD' },
        { value: 100, numeral: 'C' },
        { value: 90, numeral: 'XC' },
        { value: 50, numeral: 'L' },
        { value: 40, numeral: 'XL' },
        { value: 10, numeral: 'X' },
        { value: 9, numeral: 'IX' },
        { value: 5, numeral: 'V' },
        { value: 4, numeral: 'IV' },
        { value: 1, numeral: 'I' }
    ];

    let result = '';
    let remaining = parseInt(num);

    for (const { value, numeral } of romanNumerals) {
        while (remaining >= value) {
            result += numeral;
            remaining -= value;
        }
    }

    return result;
}

// Convert Indonesian usage instructions to Latin abbreviations
// Based on staff/prescription.csv
function convertToLatinSig(caraPakai) {
    if (!caraPakai) return '';

    let latinSig = caraPakai.toLowerCase();
    let result = '';

    // Extract frequency pattern (e.g., "3x1", "2x2", "1x1")
    const frequencyMatch = latinSig.match(/(\d+)\s*x\s*(\d+)/);

    if (frequencyMatch) {
        const timesPerDay = frequencyMatch[1];
        const doseAmount = frequencyMatch[2];
        const doseRoman = toRoman(parseInt(doseAmount));

        // Frequency mapping based on prescription.csv
        const frequencyMap = {
            '1': 'd.d',           // tiap hari (daily)
            '2': 'b.d.d',         // dua kali sehari (twice daily) - line 11
            '3': 'ter.d.d',       // tiga kali sehari (three times daily) - line 87
            '4': 'q.d.d'          // empat kali sehari (four times daily) - line 74
        };

        const freqLatin = frequencyMap[timesPerDay] || `${timesPerDay} dd`;
        result = `${freqLatin} ${doseRoman}`;
    }

    // Timing/meal-related conversions from prescription.csv
    const timingConversions = {
        'sebelum makan': 'a.c',           // line 3
        'setelah makan': 'p.c',           // line 68
        'pada saat makan': 'd.c',         // line 26
        'saat makan': 'd.c',
        'dengan makan': 'd.c',
        'bila diperlukan': 'p.r.n',       // line 67
        'bila perlu': 'p.r.n',
        'jika perlu': 'p.r.n',
        'pagi hari': 'h.m',               // line 42
        'pagi': 'h.m',
        'malam hari': 'h.v',              // line 43 (or 'n, noct' line 54)
        'malam': 'h.v',
        'sore': 'p.m',                    // line 69
        'sebelum tidur': 'h.v',
        'tiap jam': 'o.h',                // line 59
        'tiap 2 jam': 'o.b.h',            // line 58
        'tiap pagi': 'o.m',               // line 60
        'tiap malam': 'o.n',              // line 61
        'segera': 'cito',                 // line 18
        'diminum sekaligus': 'haust'      // line 44
    };

    // Find timing conversion
    let timing = '';
    for (const [indonesian, latin] of Object.entries(timingConversions)) {
        if (latinSig.includes(indonesian)) {
            timing = latin;
            break;
        }
    }

    // Build final Latin Sig
    if (timing) {
        result = result ? `${result} ${timing}` : timing;
    }

    // If no conversion happened, preserve original
    if (!result) {
        result = caraPakai;
    }

    return result;
}

// Make functions globally accessible
window.addTindakan = addTindakan;
window.proceedToCaraPakai = proceedToCaraPakai;
window.backToObatSelection = backToObatSelection;
window.addBatchTerapi = addBatchTerapi;

// USG Helper Functions
function switchTrimester(trimester) {
    // Hide all trimester contents
    document.querySelectorAll('.trimester-content').forEach(content => {
        content.style.display = 'none';
    });

    // Show selected trimester
    const targetContent = document.getElementById(`usg-${trimester}-trimester`);
    if (targetContent) {
        targetContent.style.display = 'block';
    }

    // Update button states
    document.querySelectorAll('.trimester-selector .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.btn').classList.add('active');
}

// Expose globally for inline onclick
window.switchTrimester = switchTrimester;

async function saveUSGExam() {
    const btn = document.getElementById('btn-save-usg');
    if (!btn) return;

    // Disable button
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    try {
        // Determine active trimester
        const activeTrimester = document.querySelector('.trimester-selector .btn.active input')?.value || 'first';

        let usgData = { trimester: activeTrimester };

        // Collect data based on trimester
        if (activeTrimester === 'first') {
            const embryoCount = document.querySelector('input[name="first_embryo_count"]:checked')?.value || 'single';
            const implantation = document.querySelector('input[name="first_implantation"]:checked')?.value || 'intrauterine';

            usgData = {
                ...usgData,
                date: document.getElementById('usg-first-date')?.value || '',
                embryo_count: embryoCount,
                crl_cm: document.getElementById('usg-first-crl-cm')?.value || '',
                crl_weeks: document.getElementById('usg-first-crl-weeks')?.value || '',
                implantation: implantation,
                heart_rate: document.getElementById('usg-first-heart-rate')?.value || '',
                edd: document.getElementById('usg-first-edd')?.value || '',
                nt: document.getElementById('usg-first-nt')?.value || '',
                notes: 'Posisi janin harus menghadap kedepan dengan kepala sedikit menunduk untuk mendapatkan gambaran nuchal translucency (NT)'
            };
        } else if (activeTrimester === 'second') {
            const fetusCount = document.querySelector('input[name="second_fetus_count"]:checked')?.value || 'single';
            const gender = document.querySelector('input[name="second_gender"]:checked')?.value || '';
            const fetusLie = document.querySelector('input[name="second_fetus_lie"]:checked')?.value || '';
            const presentation = document.querySelector('input[name="second_presentation"]:checked')?.value || '';
            const placenta = document.querySelector('input[name="second_placenta"]:checked')?.value || '';

            usgData = {
                ...usgData,
                date: document.getElementById('usg-second-date')?.value || '',
                fetus_count: fetusCount,
                gender: gender,
                fetus_lie: fetusLie,
                presentation: presentation,
                bpd: document.getElementById('usg-second-bpd')?.value || '',
                ac: document.getElementById('usg-second-ac')?.value || '',
                fl: document.getElementById('usg-second-fl')?.value || '',
                heart_rate: document.getElementById('usg-second-heart-rate')?.value || '',
                placenta: placenta,
                placenta_previa: document.getElementById('usg-second-placenta-previa')?.value || '',
                afi: document.getElementById('usg-second-afi')?.value || '',
                efw: document.getElementById('usg-second-efw')?.value || '',
                edd: document.getElementById('usg-second-edd')?.value || '',
                notes: document.getElementById('usg-second-notes')?.value || ''
            };
        } else if (activeTrimester === 'third') {
            const fetusCount = document.querySelector('input[name="third_fetus_count"]:checked')?.value || 'single';
            const gender = document.querySelector('input[name="third_gender"]:checked')?.value || '';
            const fetusLie = document.querySelector('input[name="third_fetus_lie"]:checked')?.value || '';
            const presentation = document.querySelector('input[name="third_presentation"]:checked')?.value || '';
            const placenta = document.querySelector('input[name="third_placenta"]:checked')?.value || '';
            const membraneSweep = document.querySelector('input[name="third_membrane_sweep"]:checked')?.value || 'no';

            // Get all selected contraception methods
            const contraception = Array.from(document.querySelectorAll('input[name="third_contraception"]:checked'))
                .map(cb => cb.value);

            usgData = {
                ...usgData,
                date: document.getElementById('usg-third-date')?.value || '',
                fetus_count: fetusCount,
                gender: gender,
                fetus_lie: fetusLie,
                presentation: presentation,
                bpd: document.getElementById('usg-third-bpd')?.value || '',
                ac: document.getElementById('usg-third-ac')?.value || '',
                fl: document.getElementById('usg-third-fl')?.value || '',
                heart_rate: document.getElementById('usg-third-heart-rate')?.value || '',
                placenta: placenta,
                placenta_previa: document.getElementById('usg-third-placenta-previa')?.value || '',
                afi: document.getElementById('usg-third-afi')?.value || '',
                efw: document.getElementById('usg-third-efw')?.value || '',
                edd: document.getElementById('usg-third-edd')?.value || '',
                membrane_sweep: membraneSweep,
                contraception: contraception
            };
        } else if (activeTrimester === 'screening') {
            const gender = document.querySelector('input[name="screening_gender"]:checked')?.value || '';

            usgData = {
                ...usgData,
                date: document.getElementById('usg-screening-date')?.value || '',
                // Identifikasi
                diameter_kepala: document.getElementById('scr-diameter-kepala-text')?.value || '',
                lingkar_kepala: document.getElementById('scr-lingkar-kepala-text')?.value || '',
                lingkar_perut: document.getElementById('scr-lingkar-perut-text')?.value || '',
                panjang_tulang_paha: document.getElementById('scr-panjang-tulang-paha-text')?.value || '',
                taksiran_berat_janin: document.getElementById('scr-taksiran-berat-janin-text')?.value || '',
                // Kepala dan Otak
                simetris_hemisfer: document.getElementById('scr-simetris-hemisfer')?.checked || false,
                falx_bpd: document.getElementById('scr-falx-bpd')?.checked || false,
                ventrikel: document.getElementById('scr-ventrikel')?.checked || false,
                cavum_septum: document.getElementById('scr-cavum-septum')?.checked || false,
                // Muka dan Leher
                profil_muka: document.getElementById('scr-profil-muka')?.checked || false,
                tulang_hidung: document.getElementById('scr-bibir-langit')?.checked || false,
                garis_bibir: document.getElementById('scr-lens-bibir')?.checked || false,
                // Jantung dan Rongga Dada
                four_chamber: document.getElementById('scr-4chamber')?.checked || false,
                jantung_kiri: document.getElementById('scr-jantung-kiri')?.checked || false,
                septum_interv: document.getElementById('scr-septum-interv')?.checked || false,
                besar_jantung: document.getElementById('scr-besar-jantung')?.checked || false,
                dua_atrium: document.getElementById('scr-dua-atrium')?.checked || false,
                katup_atrioventricular: document.getElementById('scr-irama-jantung')?.checked || false,
                ritme_jantung: document.getElementById('scr-ritme-jantung')?.checked || false,
                echogenic_pads: document.getElementById('scr-echogenic-pads')?.checked || false,
                // Tulang Belakang
                vertebra: document.getElementById('scr-vertebra')?.checked || false,
                kulit_dorsal: document.getElementById('scr-kulit-dorsal')?.checked || false,
                // Anggota Gerak
                alat_gerak_atas: document.getElementById('scr-gerakan-lengan')?.checked || false,
                alat_gerak_bawah: document.getElementById('scr-alat-gerak')?.checked || false,
                visual_tangan: document.getElementById('scr-visual-tangan')?.checked || false,
                // Rongga perut
                lambung_kiri: document.getElementById('scr-lambung-kiri')?.checked || false,
                posisi_liver: document.getElementById('scr-posisi-liver')?.checked || false,
                ginjal_kiri_kanan: document.getElementById('scr-ginjal-kiri-kanan')?.checked || false,
                ginjal_echohypoic: document.getElementById('scr-ginjal-echohypoic')?.checked || false,
                kandung_kemih: document.getElementById('scr-kandung-kemih')?.checked || false,
                insersi_tali_pusat: document.getElementById('scr-hawa-jantung')?.checked || false,
                dinding_perut: document.getElementById('scr-masa-padat')?.checked || false,
                // Plasenta dan Air Ketuban
                lokasi_plasenta: document.getElementById('scr-lokasi-plasenta')?.checked || false,
                lokasi_plasenta_text: document.getElementById('scr-lokasi-plasenta-text')?.value || '',
                tekstur_plasenta: document.getElementById('scr-tekstur-plasenta')?.checked || false,
                volume_ketuban: document.getElementById('scr-volume-ketuban')?.checked || false,
                panjang_serviks: document.getElementById('scr-warna-jernih')?.checked || false,
                panjang_serviks_text: document.getElementById('scr-panjang-serviks-text')?.value || '',
                // Lainnya
                gerak_janin_baik: document.getElementById('scr-gerak-janin-baik')?.checked || false,
                gender: gender,
                // Kesimpulan
                tidak_kelainan: document.getElementById('scr-tidak-kelainan')?.checked || false,
                kecurigaan: document.getElementById('scr-kecurigaan')?.checked || false,
                kecurigaan_text: document.getElementById('usg-screening-kecurigaan-text')?.value || ''
            };
        }

        // Get token
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        // Send to API
        const response = await fetch('/api/medical-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                patientId: routeMrSlug,
                type: 'usg',
                data: usgData,
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const result = await response.json();

        // Show success message
        showSuccess('Data USG berhasil disimpan!');

        // Reload the record to show updated data
        await fetchRecord(routeMrSlug);

    } catch (error) {
        console.error('Error saving USG record:', error);
        showError('Gagal menyimpan USG: ' + error.message);

        // Re-enable button
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Simpan';
    }
}

function renderUSG() {
    const section = document.createElement('div');
    section.className = 'sc-section';

    // Load saved USG data from medical records
    const context = getMedicalRecordContext('usg');
    const savedData = context?.data || {};

    // Auto-populate today's date
    const today = new Date().toISOString().split('T')[0];
    const usgDate = savedData.date || today;
    const trimester = savedData.trimester || 'first';

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>USG Obstetri</h3>
            <button class="btn btn-primary btn-sm" id="btn-save-usg" style="display:none;">
                <i class="fas fa-save"></i> Simpan
            </button>
        </div>

        <div class="sc-card">
            <div class="trimester-selector mb-4">
                <div class="btn-group btn-group-toggle" data-toggle="buttons">
                    <label class="btn btn-outline-primary ${trimester === 'first' ? 'active' : ''}" onclick="switchTrimester('first')">
                        <input type="radio" name="trimester" value="first" ${trimester === 'first' ? 'checked' : ''}> Trimester 1 (10-13w)
                    </label>
                    <label class="btn btn-outline-primary ${trimester === 'second' ? 'active' : ''}" onclick="switchTrimester('second')">
                        <input type="radio" name="trimester" value="second" ${trimester === 'second' ? 'checked' : ''}> Trimester 2 (14-27w)
                    </label>
                    <label class="btn btn-outline-primary ${trimester === 'screening' ? 'active' : ''}" onclick="switchTrimester('screening')">
                        <input type="radio" name="trimester" value="screening" ${trimester === 'screening' ? 'checked' : ''}> Skrining Kelainan Kongenital (18-23w)
                    </label>
                    <label class="btn btn-outline-primary ${trimester === 'third' ? 'active' : ''}" onclick="switchTrimester('third')">
                        <input type="radio" name="trimester" value="third" ${trimester === 'third' ? 'checked' : ''}> Trimester 3 (28+w)
                    </label>
                </div>
            </div>

            <!-- First Trimester Form -->
            <div id="usg-first-trimester" class="trimester-content" style="display: ${trimester === 'first' ? 'block' : 'none'};">
                <h4 class="mb-3">JANIN (Fetus) - Trimester Pertama</h4>

                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Tanggal</label>
                        <input type="date" class="form-control usg-field" id="usg-first-date" style="width: 150.923076px;" value="${escapeHtml(usgDate)}">
                    </div>
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Jumlah Embrio/Janin</label>
                        <div class="d-flex gap-3">
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="first_embryo_count" id="first-single" value="single" ${(savedData.embryo_count || 'single') === 'single' ? 'checked' : ''}>
                                <label class="custom-control-label" for="first-single">Tunggal</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="first_embryo_count" id="first-multiple" value="multiple" ${savedData.embryo_count === 'multiple' ? 'checked' : ''}>
                                <label class="custom-control-label" for="first-multiple">Multipel</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Panjang Kepala-Ekor (CRL)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-first-crl-cm" placeholder="cm" value="${escapeHtml(savedData.crl_cm || '')}">
                            <div class="input-group-append"><span class="input-group-text">cm ~</span></div>
                            <input type="number" step="1" class="form-control usg-field" id="usg-first-crl-weeks" placeholder="minggu" value="${escapeHtml(savedData.crl_weeks || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Lokasi Implantasi</label>
                        <div class="d-flex gap-3">
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="first_implantation" id="first-intrauterine" value="intrauterine" ${(savedData.implantation || 'intrauterine') === 'intrauterine' ? 'checked' : ''}>
                                <label class="custom-control-label" for="first-intrauterine">Dalam rahim</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="first_implantation" id="first-ectopic" value="ectopic">
                                <label class="custom-control-label" for="first-ectopic">Luar rahim / Ektopik</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Detak Jantung</label>
                        <div class="input-group">
                            <input type="number" class="form-control usg-field" id="usg-first-heart-rate" placeholder="x/menit" value="${escapeHtml(savedData.heart_rate || '')}">
                            <div class="input-group-append"><span class="input-group-text">x/menit</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Hari Perkiraan Lahir (HPL)</label>
                        <input type="date" class="form-control usg-field" id="usg-first-edd" value="${escapeHtml(savedData.edd || '')}">
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Cairan Tengkuk Janin (NT)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-first-nt" placeholder="mm" value="${escapeHtml(savedData.nt || '')}">
                            <div class="input-group-append"><span class="input-group-text">mm (&lt;3.5)</span></div>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="font-weight-bold">Notes</label>
                    <textarea class="form-control usg-field" id="usg-first-notes" rows="2" readonly>Posisi janin harus menghadap kedepan dengan kepala sedikit menunduk untuk mendapatkan gambaran nuchal translucency (NT)</textarea>
                </div>
            </div>

            <!-- Second Trimester Form -->
            <div id="usg-second-trimester" class="trimester-content" style="display: ${trimester === 'second' ? 'block' : 'none'};">
                <h4 class="mb-3">BIOMETRI JANIN (Fetal Biometry) - Trimester Kedua</h4>

                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Tanggal</label>
                        <input type="date" class="form-control usg-field" id="usg-second-date" value="${escapeHtml(usgDate)}">
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Jumlah Janin</label>
                        <div class="d-flex">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_fetus_count" id="second-single" value="single" ${(savedData.fetus_count || 'single') === 'single' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-single">Tunggal</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="second_fetus_count" id="second-multiple" value="multiple" ${savedData.fetus_count === 'multiple' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-multiple">Multipel</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Kelamin</label>
                        <div class="d-flex">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_gender" id="second-male" value="male" ${savedData.gender === 'male' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-male">Laki-laki</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="second_gender" id="second-female" value="female" ${savedData.gender === 'female' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-female">Perempuan</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Letak Janin</label>
                        <div class="d-flex flex-wrap">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_fetus_lie" id="second-longitudinal" value="longitudinal" ${savedData.fetus_lie === 'longitudinal' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-longitudinal">Membujur</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_fetus_lie" id="second-transverse" value="transverse" ${savedData.fetus_lie === 'transverse' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-transverse">Melintang</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="second_fetus_lie" id="second-oblique" value="oblique" ${savedData.fetus_lie === 'oblique' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-oblique">Oblique</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Presentasi Janin</label>
                        <div class="d-flex flex-wrap">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_presentation" id="second-cephalic" value="cephalic" ${savedData.presentation === 'cephalic' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-cephalic">Kepala</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_presentation" id="second-breech" value="breech" ${savedData.presentation === 'breech' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-breech">Bokong</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="second_presentation" id="second-shoulder" value="shoulder" ${savedData.presentation === 'shoulder' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-shoulder">Bahu/Punggung</label>
                            </div>
                        </div>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Biometri</h5>
                <div class="form-row">
                    <div class="form-group col-md-3">
                        <label>Diameter Parietal Kepala (BPD)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-second-bpd" value="${escapeHtml(savedData.bpd || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Lingkar Perut Janin (AC)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-second-ac" value="${escapeHtml(savedData.ac || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Panjang Tulang Paha (FL)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-second-fl" value="${escapeHtml(savedData.fl || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Detak Jantung (HR)</label>
                        <div class="input-group">
                            <input type="number" class="form-control usg-field" id="usg-second-heart-rate" value="${escapeHtml(savedData.heart_rate || '')}">
                            <div class="input-group-append"><span class="input-group-text">x/menit</span></div>
                        </div>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Plasenta & Ketuban</h5>
                <div class="form-row">
                    <div class="form-group col-md-12">
                        <label class="font-weight-bold">Lokasi Plasenta</label>
                        <div class="d-flex flex-wrap">
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_placenta" id="second-anterior" value="anterior" ${savedData.placenta === 'anterior' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-anterior">Anterior</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_placenta" id="second-posterior" value="posterior" ${savedData.placenta === 'posterior' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-posterior">Posterior</label>
                            </div>
                            <div class="custom-control custom-radio mr-3">
                                <input type="radio" class="custom-control-input usg-field" name="second_placenta" id="second-fundus" value="fundus" ${savedData.placenta === 'fundus' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-fundus">Fundus</label>
                            </div>
                            <div class="custom-control custom-radio">
                                <input type="radio" class="custom-control-input usg-field" name="second_placenta" id="second-lateral" value="lateral" ${savedData.placenta === 'lateral' ? 'checked' : ''}>
                                <label class="custom-control-label" for="second-lateral">Lateral</label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label>Plasenta Previa</label>
                        <input type="text" class="form-control usg-field" id="usg-second-placenta-previa" placeholder="Jika ada, sebutkan..." value="${escapeHtml(savedData.placenta_previa || '')}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label>AFI (Amniotic Fluid Index)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-second-afi" value="${escapeHtml(savedData.afi || '')}">
                            <div class="input-group-append"><span class="input-group-text">cm (5-25)</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label>Taksiran Berat Janin (EFW)</label>
                        <div class="input-group">
                            <input type="text" class="form-control usg-field" id="usg-second-efw" placeholder="gram" value="${escapeHtml(savedData.efw || '')}">
                            <div class="input-group-append"><span class="input-group-text">gram</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label>Hari Perkiraan Lahir (HPL)</label>
                        <input type="date" class="form-control usg-field" id="usg-second-edd" value="${escapeHtml(savedData.edd || '')}">
                    </div>
                </div>

                <div class="form-group">
                    <label class="font-weight-bold">Notes</label>
                    <textarea class="form-control usg-field" id="usg-second-notes" rows="2" placeholder="Pemeriksaan skrining kelainan kongenital dilakukan di usia kehamilan 18-21 minggu. Bila ditemukan kelainan bawaan, dikonsulkan kepada Subspesialis Fetomaternal">${escapeHtml(savedData.notes || '')}</textarea>
                </div>
            </div>

            <!-- Screening Trimester Form -->
            <div id="usg-screening-trimester" class="trimester-content" style="display: ${trimester === 'screening' ? 'block' : 'none'};">
                <h4 class="mb-3">SCREENING ULTRASONOGRAFI ABDOMINAL (Trimester Kedua)</h4>

                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Tanggal</label>
                        <input type="date" class="form-control usg-field" id="usg-screening-date" style="width: 150.923076px;" value="${escapeHtml(usgDate)}">
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Biometri</h5>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label>Diameter Kepala</label>
                        <div class="input-group">
                            <input type="text" class="form-control usg-field" id="scr-diameter-kepala-text" value="${escapeHtml(savedData.diameter_kepala || '')}">
                            <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <label>Lingkar Kepala</label>
                        <div class="input-group">
                            <input type="text" class="form-control usg-field" id="scr-lingkar-kepala-text" value="${escapeHtml(savedData.lingkar_kepala || '')}">
                            <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label>Lingkar Perut</label>
                        <div class="input-group">
                            <input type="text" class="form-control usg-field" id="scr-lingkar-perut-text" value="${escapeHtml(savedData.lingkar_perut || '')}">
                            <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <label>Panjang Tulang Paha</label>
                        <div class="input-group">
                            <input type="text" class="form-control usg-field" id="scr-panjang-tulang-paha-text" value="${escapeHtml(savedData.panjang_tulang_paha || '')}">
                            <div class="input-group-append"><span class="input-group-text">minggu</span></div>
                        </div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label>Taksiran Berat Janin</label>
                        <div class="input-group">
                            <input type="text" class="form-control usg-field" id="scr-taksiran-berat-janin-text" value="${escapeHtml(savedData.taksiran_berat_janin || '')}">
                            <div class="input-group-append"><span class="input-group-text">gram</span></div>
                        </div>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Kepala dan Otak:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-simetris-hemisfer" ${savedData.simetris_hemisfer ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-simetris-hemisfer">Simetris hemisfer serebral</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-falx-bpd" ${savedData.falx_bpd ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-falx-bpd">Ventrikel lateral, Atrium < 10 mm</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-ventrikel" ${savedData.ventrikel ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-ventrikel">Ventrikel sereberal, cisterna magna</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-cavum-septum" ${savedData.cavum_septum ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-cavum-septum">Cavum septum pellucidum</label>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Muka dan Leher:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-profil-muka" ${savedData.profil_muka ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-profil-muka">Profil muka normal</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-bibir-langit" ${savedData.tulang_hidung ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-bibir-langit">Tulang hidung tampak, ukuran normal</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-lens-bibir" ${savedData.garis_bibir ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-lens-bibir">Garis bibir atas menyambung</label>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Jantung dan Rongga Dada:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-4chamber" ${savedData.four_chamber ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-4chamber">Gambaran jelas 4-chamber view</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-jantung-kiri" ${savedData.jantung_kiri ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-jantung-kiri">Jantung di sebelah kiri</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-septum-interv" ${savedData.septum_interv ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-septum-interv">Apex jantung kearah kiri (~45')</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-besar-jantung" ${savedData.besar_jantung ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-besar-jantung">Besar jantung <1/3 area dada</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-dua-atrium" ${savedData.dua_atrium ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-dua-atrium">Dua atrium dan dua ventrikel</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-irama-jantung" ${savedData.katup_atrioventricular ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-irama-jantung">Katup atrioventricular</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-ritme-jantung" ${savedData.ritme_jantung ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-ritme-jantung">Ritme jantung reguler</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-echogenic-pads" ${savedData.echogenic_pads ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-echogenic-pads">Echogenic pada lapang paru</label>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Tulang Belakang:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-vertebra" ${savedData.vertebra ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-vertebra">Tidak tampak kelainan vertebra</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-kulit-dorsal" ${savedData.kulit_dorsal ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-kulit-dorsal">Garis kulit tampak baik</label>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Anggota Gerak:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-gerakan-lengan" ${savedData.alat_gerak_atas ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-gerakan-lengan">Alat gerak kiri kanan atas normal</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-alat-gerak" ${savedData.alat_gerak_bawah ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-alat-gerak">Alat gerak kiri kanan bawah normal</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-visual-tangan" ${savedData.visual_tangan ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-visual-tangan">Visualisasi tangan dan kaki baik</label>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Rongga perut:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-lambung-kiri" ${savedData.lambung_kiri ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-lambung-kiri">Lambung di sebelah kiri</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-posisi-liver" ${savedData.posisi_liver ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-posisi-liver">Posisi liver dan echogenocity normal</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-ginjal-kiri-kanan" ${savedData.ginjal_kiri_kanan ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-ginjal-kiri-kanan">Terlihat ginjal kiri & kanan</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-ginjal-echohypoic" ${savedData.ginjal_echohypoic ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-ginjal-echohypoic">Ginjal tampak hipoechoic dibanding usus</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-kandung-kemih" ${savedData.kandung_kemih ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-kandung-kemih">Kandung kemih terisi</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-hawa-jantung" ${savedData.insersi_tali_pusat ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-hawa-jantung">Insersi tali pusat baik</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-masa-padat" ${savedData.dinding_perut ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-masa-padat">Dinding perut tidak tampak defek</label>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Plasenta dan Air Ketuban:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox mb-2">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-lokasi-plasenta" ${savedData.lokasi_plasenta ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-lokasi-plasenta">Lokasi plasenta</label>
                    </div>
                    <div class="form-row mb-2">
                        <div class="form-group col-md-6 mb-0">
                            <input type="text" class="form-control usg-field" id="scr-lokasi-plasenta-text" placeholder="Sebutkan lokasi plasenta..." value="${escapeHtml(savedData.lokasi_plasenta_text || '')}">
                        </div>
                    </div>
                    <div class="custom-control custom-checkbox mb-2">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-tekstur-plasenta" ${savedData.tekstur_plasenta ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-tekstur-plasenta">Tekstur plasenta homogen</label>
                    </div>
                    <div class="custom-control custom-checkbox mb-2">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-volume-ketuban" ${savedData.volume_ketuban ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-volume-ketuban">Volume ketuban cukup</label>
                    </div>
                    <div class="custom-control custom-checkbox mb-2">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-warna-jernih" ${savedData.panjang_serviks ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-warna-jernih">Panjang serviks</label>
                    </div>
                    <div class="form-row">
                        <div class="form-group col-md-4 mb-0">
                            <div class="input-group">
                                <input type="text" class="form-control usg-field" id="scr-panjang-serviks-text" placeholder="Panjang serviks" value="${escapeHtml(savedData.panjang_serviks_text || '')}">
                                <div class="input-group-append"><span class="input-group-text">cm</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Lainnya:</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-gerak-janin-baik" ${savedData.gerak_janin_baik ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-gerak-janin-baik">Gerak janin baik</label>
                    </div>
                    <div class="form-group mt-2">
                        <label class="font-weight-bold">Jenis kelamin</label>
                        <div class="d-flex gap-3">
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="screening_gender" id="scr-gender-male" value="male" ${savedData.gender === 'male' ? 'checked' : ''}>
                                <label class="custom-control-label" for="scr-gender-male">Laki-laki</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="screening_gender" id="scr-gender-female" value="female" ${savedData.gender === 'female' ? 'checked' : ''}>
                                <label class="custom-control-label" for="scr-gender-female">Perempuan</label>
                            </div>
                        </div>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">KESIMPULAN</h5>
                <div class="form-group">
                    <div class="custom-control custom-checkbox mb-3">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-tidak-kelainan" ${savedData.tidak_kelainan ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-tidak-kelainan">Tidak ditemukan kelainan</label>
                    </div>
                    <div class="custom-control custom-checkbox">
                        <input type="checkbox" class="custom-control-input usg-field" id="scr-kecurigaan" ${savedData.kecurigaan ? 'checked' : ''}>
                        <label class="custom-control-label" for="scr-kecurigaan">Kecurigaan</label>
                    </div>
                    <div class="mt-2">
                        <textarea class="form-control usg-field" id="usg-screening-kecurigaan-text" style="width: 700px; height: 71px;">${escapeHtml(savedData.kecurigaan_text || '')}</textarea>
                    </div>
                </div>
            </div>

            <!-- Third Trimester Form -->
            <div id="usg-third-trimester" class="trimester-content" style="display: ${trimester === 'third' ? 'block' : 'none'};">
                <h4 class="mb-3">BIOMETRI JANIN (Fetal Biometry) - Trimester Ketiga</h4>

                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Tanggal</label>
                        <input type="date" class="form-control usg-field" id="usg-third-date" style="width: 150.923076px;" value="${escapeHtml(usgDate)}">
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Jumlah Janin</label>
                        <div class="d-flex gap-3">
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_fetus_count" id="third-single" value="single" ${(savedData.fetus_count || 'single') === 'single' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-single">Tunggal</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_fetus_count" id="third-multiple" value="multiple" ${savedData.fetus_count === 'multiple' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-multiple">Multipel</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label class="font-weight-bold">Kelamin</label>
                        <div class="d-flex gap-3">
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_gender" id="third-male" value="male" ${savedData.gender === 'male' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-male">Laki/Laki</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_gender" id="third-female" value="female" ${savedData.gender === 'female' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-female">Perempuan</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Letak Janin</label>
                        <div class="d-flex gap-3">
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_fetus_lie" id="third-longitudinal" value="longitudinal" ${savedData.fetus_lie === 'longitudinal' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-longitudinal">Membujur</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_fetus_lie" id="third-transverse" value="transverse" ${savedData.fetus_lie === 'transverse' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-transverse">Melintang</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_fetus_lie" id="third-oblique" value="oblique" ${savedData.fetus_lie === 'oblique' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-oblique">Oblique</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Presentasi Janin</label>
                        <div class="d-flex gap-3">
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_presentation" id="third-cephalic" value="cephalic" ${savedData.presentation === 'cephalic' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-cephalic">Kepala</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_presentation" id="third-breech" value="breech" ${savedData.presentation === 'breech' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-breech">Bokong</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_presentation" id="third-shoulder" value="shoulder" ${savedData.presentation === 'shoulder' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-shoulder">Bahu/Punggung</label>
                            </div>
                        </div>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Biometri</h5>
                <div class="form-row">
                    <div class="form-group col-md-3">
                        <label>Diameter Parietal Kepala (BPD)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-third-bpd" value="${escapeHtml(savedData.bpd || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Lingkar Perut Janin (AC)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-third-ac" value="${escapeHtml(savedData.ac || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Panjang Tulang Paha (FL)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-third-fl" value="${escapeHtml(savedData.fl || '')}">
                            <div class="input-group-append"><span class="input-group-text">mgg</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-3">
                        <label>Detak Jantung (HR)</label>
                        <div class="input-group">
                            <input type="number" class="form-control usg-field" id="usg-third-heart-rate" value="${escapeHtml(savedData.heart_rate || '')}">
                            <div class="input-group-append"><span class="input-group-text">x/menit</span></div>
                        </div>
                    </div>
                </div>

                <h5 class="mt-3 mb-2">Plasenta & Ketuban</h5>
                <div class="form-row">
                    <div class="form-group col-md-6">
                        <label class="font-weight-bold">Plasenta</label>
                        <div class="d-flex gap-2 flex-wrap">
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_placenta" id="third-anterior" value="anterior" ${savedData.placenta === 'anterior' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-anterior">Anterior</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_placenta" id="third-posterior" value="posterior" ${savedData.placenta === 'posterior' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-posterior">Posterior</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_placenta" id="third-fundus" value="fundus" ${savedData.placenta === 'fundus' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-fundus">Fundus</label>
                            </div>
                            <div class="custom-control custom-radio mr-4">
                                <input type="radio" class="custom-control-input usg-field" name="third_placenta" id="third-lateral" value="lateral" ${savedData.placenta === 'lateral' ? 'checked' : ''}>
                                <label class="custom-control-label" for="third-lateral">Lateral</label>
                            </div>
                        </div>
                    </div>
                    <div class="form-group col-md-6">
                        <label>Plasenta Previa</label>
                        <input type="text" class="form-control usg-field" id="usg-third-placenta-previa" placeholder="Jika ada, sebutkan..." value="${escapeHtml(savedData.placenta_previa || '')}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group col-md-4">
                        <label>AFI (Amniotic Fluid Index)</label>
                        <div class="input-group">
                            <input type="number" step="0.1" class="form-control usg-field" id="usg-third-afi" value="${escapeHtml(savedData.afi || '')}">
                            <div class="input-group-append"><span class="input-group-text">cm (5-25)</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label>Taksiran Berat Janin (EFW)</label>
                        <div class="input-group">
                            <input type="text" class="form-control usg-field" id="usg-third-efw" placeholder="gram" value="${escapeHtml(savedData.efw || '')}">
                            <div class="input-group-append"><span class="input-group-text">gram</span></div>
                        </div>
                    </div>
                    <div class="form-group col-md-4">
                        <label>Hari Perkiraan Lahir (HPL)</label>
                        <input type="date" class="form-control usg-field" id="usg-third-edd" value="${escapeHtml(savedData.edd || '')}">
                    </div>
                </div>

                <div class="form-group">
                    <label class="font-weight-bold">Stripping of membrane</label>
                    <div class="d-flex gap-3">
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="third_membrane_sweep" id="third-sweep-no" value="no" ${(savedData.membrane_sweep || 'no') === 'no' ? 'checked' : ''}>
                            <label class="custom-control-label" for="third-sweep-no">Tidak</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="third_membrane_sweep" id="third-sweep-success" value="successful" ${savedData.membrane_sweep === 'successful' ? 'checked' : ''}>
                            <label class="custom-control-label" for="third-sweep-success">Berhasil</label>
                        </div>
                        <div class="custom-control custom-radio mr-4">
                            <input type="radio" class="custom-control-input usg-field" name="third_membrane_sweep" id="third-sweep-fail" value="failed" ${savedData.membrane_sweep === 'failed' ? 'checked' : ''}>
                            <label class="custom-control-label" for="third-sweep-fail">Gagal</label>
                        </div>
                    </div>
                </div>

                <h5 class="mt-4 mb-2">Rencana Kontrasepsi</h5>
                <div class="row">
                    ${['steril', 'iud', 'iud_mirena', 'implant', 'injection', 'pill', 'condom', 'vasectomy', 'none'].map(method => {
                        const labels = {
                            steril: 'Steril (Tubektomi Bilateral)',
                            iud: 'Intra-Uterine Device (IUD)',
                            iud_mirena: 'IUD Mirena (hormonal)',
                            implant: 'Implant',
                            injection: 'Suntik KB 3 bulan',
                            pill: 'Pil KB',
                            condom: 'Kondom',
                            vasectomy: 'Vasektomi',
                            none: 'Tanpa kontrasepsi (riwayat infertil)'
                        };
                        const checked = (savedData.contraception || []).includes(method) ? 'checked' : '';
                        return `
                            <div class="col-md-6">
                                <div class="custom-control custom-checkbox">
                                    <input type="checkbox" class="custom-control-input usg-field" name="third_contraception" id="third-contra-${method}" value="${method}" ${checked}>
                                    <label class="custom-control-label" for="third-contra-${method}">${labels[method]}</label>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <div class="mt-3 text-right">
                <p class="mb-0"><strong>dr. Dibya Arfianda, SpOG, M.Ked.Klin.</strong></p>
                <p class="text-muted small">Obstetrician Gynaecologist</p>
            </div>
        </div>
    `;

    // Add event listeners
    setTimeout(() => {
        // Show save button on any field change
        document.querySelectorAll('.usg-field').forEach(field => {
            field.addEventListener('input', () => {
                document.getElementById('btn-save-usg').style.display = 'inline-block';
            });
            field.addEventListener('change', () => {
                document.getElementById('btn-save-usg').style.display = 'inline-block';
            });
        });

        // Attach save handler
        const btnSave = document.getElementById('btn-save-usg');
        if (btnSave) {
            btnSave.onclick = saveUSGExam;
        }
    }, 100);

    return section;
}

function renderPenunjang() {
    const context = getMedicalRecordContext('lab');
    if (!context) {
        return renderPlaceholderSection(
            'Laboratorium',
            'Belum ada pemeriksaan penunjang.',
            'Hasil laboratorium atau penunjang lain akan muncul setelah ditambahkan.'
        );
    }

    const data = context.data || {};
    const section = document.createElement('div');
    section.className = 'sc-section';

    const summaryRows = [
        [LAB_LABELS.lab_results, formatMultiline(data.lab_results || '-')],
        [LAB_LABELS.radiologi, formatMultiline(data.radiologi || '-')],
        [LAB_LABELS.pemeriksaan_lain, formatMultiline(data.pemeriksaan_lain || '-')]
    ];

    const testsHtml = renderLabTestsTable(data.laboratory_tests);
    const metaHtml = renderRecordMeta(context, 'lab');

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Laboratorium</h3>
        </div>
        ${metaHtml}
        <div class="sc-card">
            <h4>Ringkasan Pemeriksaan</h4>
            ${buildInfoTable(summaryRows)}
        </div>
        <div class="sc-card">
            <h4>Riwayat Tes Laboratorium</h4>
            ${testsHtml}
        </div>
    `;

    return section;
}

function renderDiagnosisSection() {
    const context = getMedicalRecordContext('diagnosis');
    const data = context?.data || {};
    const section = document.createElement('div');
    section.className = 'sc-section';
    const metaHtml = context ? renderRecordMeta(context, 'diagnosis') : '';

    const diagnosisFormHtml = `
        <div class="mb-3">
            <label class="font-weight-bold">Diagnosis Utama</label>
            <textarea class="form-control" id="diagnosis-utama" rows="1" style="height: 40px;" placeholder="Masukkan diagnosis utama">${escapeHtml(data.diagnosis_utama || '')}</textarea>
        </div>
        <div class="mb-3">
            <label class="font-weight-bold">Diagnosis Sekunder (jika ada)</label>
            <textarea class="form-control" id="diagnosis-sekunder" rows="1" style="height: 40px;" placeholder="Masukkan diagnosis sekunder jika ada">${escapeHtml(data.diagnosis_sekunder || '')}</textarea>
        </div>
        <div class="mb-4 mt-4">
            <p class="mb-0"><strong>dr. Dibya Arfianda, SpOG, M.Ked.Klin.</strong></p>
            <p class="text-muted mb-0">Obstetrician Gynaecologist</p>
        </div>
    `;

    const saveButton = `
        <div class="text-right mt-3">
            <button type="button" class="btn btn-primary" id="save-diagnosis">
                <i class="fas fa-save mr-2"></i>Simpan Diagnosis
            </button>
        </div>
    `;

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Diagnosis</h3>
        </div>
        ${metaHtml}
        <div class="sc-card">
            ${diagnosisFormHtml}
            ${saveButton}
        </div>
    `;

    // Add save handler
    setTimeout(() => {
        const saveBtn = document.getElementById('save-diagnosis');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveDiagnosis);
        }
    }, 0);

    return section;
}

function renderPlanning() {
    const context = getMedicalRecordContext('planning');
    const data = context?.data || {};
    const section = document.createElement('div');
    section.className = 'sc-section';
    const metaHtml = context ? renderRecordMeta(context, 'planning') : '';

    const planningFormHtml = `
        <div class="mb-3">
            <label class="font-weight-bold">Tindakan</label>
            <textarea class="form-control" id="planning-tindakan" rows="4" placeholder="Klik tombol 'Input Tindakan' untuk memilih dari daftar...">${escapeHtml(data.tindakan || '')}</textarea>
            <button type="button" class="btn btn-sm btn-outline-primary mt-2" id="btn-input-tindakan">
                <i class="fas fa-plus-circle mr-1"></i>Input Tindakan
            </button>
        </div>
        <div class="mb-3">
            <label class="font-weight-bold">Terapi</label>
            <textarea class="form-control" id="planning-terapi" rows="4" placeholder="Klik tombol 'Input Terapi' untuk memilih obat...">${escapeHtml(data.terapi || '')}</textarea>
            <button type="button" class="btn btn-sm btn-outline-primary mt-2" id="btn-input-terapi">
                <i class="fas fa-plus-circle mr-1"></i>Input Terapi
            </button>
        </div>
        <div class="mb-3">
            <label class="font-weight-bold">Rencana</label>
            <textarea class="form-control" id="planning-rencana" rows="4" placeholder="Masukkan rencana tindak lanjut...">${escapeHtml(data.rencana || '')}</textarea>
        </div>
    `;

    const saveButton = `
        <div class="text-right mt-3">
            <button type="button" class="btn btn-primary" id="save-planning">
                <i class="fas fa-save mr-2"></i>Simpan Planning
            </button>
        </div>
    `;

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Planning</h3>
        </div>
        ${metaHtml}
        <div class="sc-card">
            ${planningFormHtml}
            ${saveButton}
        </div>
    `;

    // Add event handlers
    setTimeout(() => {
        const savePlanningBtn = document.getElementById('save-planning');
        const inputTindakanBtn = document.getElementById('btn-input-tindakan');
        const inputTerapiBtn = document.getElementById('btn-input-terapi');

        if (savePlanningBtn) {
            savePlanningBtn.addEventListener('click', savePlanning);
        }
        if (inputTindakanBtn) {
            inputTindakanBtn.addEventListener('click', openTindakanModal);
        }
        if (inputTerapiBtn) {
            inputTerapiBtn.addEventListener('click', openTerapiModal);
        }
    }, 0);

    return section;
}

// ==================== BILLING / TAGIHAN FUNCTIONS ====================

// Parse tindakan text and extract item names
function parseTindakanItems(tindakanText) {
    if (!tindakanText || typeof tindakanText !== 'string') return [];

    return tindakanText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('-'))
        .map(line => line.substring(1).trim())
        .filter(Boolean);
}

// Parse terapi text and extract drug names
function parseTerapiItems(terapiText) {
    if (!terapiText || typeof terapiText !== 'string') return [];

    const items = [];
    const lines = terapiText.split('\n').filter(line => line.trim().startsWith('R/'));

    for (const line of lines) {
        // Extract drug name from "R/ DrugName unit No. X Sig. ..."
        const match = line.match(/R\/\s*([^0-9]+?)\s+(tablet|botol|kapsul|tube|sachet|strip)/i);
        if (match) {
            const drugName = match[1].trim();

            // Extract quantity from "No. X" (Roman numerals)
            const qtyMatch = line.match(/No\.\s*([IVXLCDM]+)/i);
            const quantity = qtyMatch ? romanToArabic(qtyMatch[1]) : 1;

            // Extract cara pakai for item_data
            const sigMatch = line.match(/Sig\.\s*(.+)$/i);
            const caraPakai = sigMatch ? sigMatch[1].trim() : '';

            items.push({
                name: drugName,
                quantity: quantity,
                caraPakai: caraPakai,
                originalLine: line
            });
        }
    }

    return items;
}

// Convert Roman numerals to Arabic numbers
function romanToArabic(roman) {
    const romanValues = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let result = 0;
    for (let i = 0; i < roman.length; i++) {
        const current = romanValues[roman[i]];
        const next = romanValues[roman[i + 1]];
        if (next && current < next) {
            result -= current;
        } else {
            result += current;
        }
    }
    return result;
}

// Format number to Rupiah
function formatRupiah(amount) {
    const number = Math.round(amount || 0);
    return 'Rp. ' + number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Load billing data
async function loadBilling() {
    try {
        const token = await getToken();
        if (!token) return null;

        const response = await fetch(`/api/sunday-clinic/billing/${routeMrSlug}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error('Failed to load billing');
        }

        const result = await response.json();
        return result.data;
    } catch (error) {
        console.error('Error loading billing:', error);
        return null;
    }
}

// Generate billing items from planning data
async function generateBillingItemsFromPlanning() {
    const planningContext = getMedicalRecordContext('planning');
    if (!planningContext) return [];

    const planningData = planningContext.data || {};
    const items = [];

    try {
        const token = await getToken();
        if (!token) return items;

        // Parse tindakan
        const tindakanNames = parseTindakanItems(planningData.tindakan || '');
        if (tindakanNames.length > 0) {
            // Fetch all tindakan to match by name
            const tindakanResponse = await fetch('/api/tindakan?active=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (tindakanResponse.ok) {
                const tindakanResult = await tindakanResponse.json();
                const tindakanList = tindakanResult.data || tindakanResult;

                for (const name of tindakanNames) {
                    const found = tindakanList.find(t =>
                        t.name && t.name.toLowerCase() === name.toLowerCase()
                    );
                    if (found) {
                        items.push({
                            item_type: 'tindakan',
                            item_code: found.code,
                            item_name: found.name,
                            quantity: 1,
                            price: parseFloat(found.price) || 0,
                            item_data: {}
                        });
                    }
                }
            }
        }

        // Parse terapi
        const terapiItems = parseTerapiItems(planningData.terapi || '');
        if (terapiItems.length > 0) {
            // Fetch all obat to match by name
            const obatResponse = await fetch('/api/obat?active=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (obatResponse.ok) {
                const obatResult = await obatResponse.json();
                const obatList = obatResult.data || obatResult;

                for (const item of terapiItems) {
                    const found = obatList.find(o =>
                        o.name && o.name.toLowerCase() === item.name.toLowerCase()
                    );
                    if (found) {
                        items.push({
                            item_type: 'obat',
                            item_code: found.code,
                            item_name: found.name,
                            quantity: item.quantity,
                            price: parseFloat(found.sell_price || found.price) || 0,
                            item_data: {
                                caraPakai: item.caraPakai,
                                originalLine: item.originalLine
                            }
                        });
                    }
                }
            }
        }

        // Always add Biaya Admin
        items.push({
            item_type: 'admin',
            item_code: 'ADMIN',
            item_name: 'Biaya Admin',
            quantity: 1,
            price: 5000,
            item_data: {}
        });

    } catch (error) {
        console.error('Error generating billing items:', error);
    }

    return items;
}

// Render Tagihan section
async function renderTagihan() {
    const section = document.createElement('div');
    section.className = 'sc-section';

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Tagihan & Pembayaran</h3>
        </div>
        <div class="sc-card">
            <div class="text-center py-4">
                <i class="fas fa-spinner fa-spin fa-2x text-muted"></i>
                <p class="mt-2 text-muted">Memuat data tagihan...</p>
            </div>
        </div>
    `;

    // Load billing data asynchronously
    setTimeout(async () => {
        try {
            let billing = await loadBilling();

            // If no billing exists, generate from planning
            if (!billing) {
                const items = await generateBillingItemsFromPlanning();
                if (items.length > 0) {
                    // Auto-save the generated billing
                    const token = await getToken();
                    if (token) {
                        await fetch(`/api/sunday-clinic/billing/${routeMrSlug}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ items, status: 'draft' })
                        });
                        billing = await loadBilling();
                    }
                }
            }

            renderTagihanContent(section, billing);
        } catch (error) {
            console.error('Error rendering tagihan:', error);
            section.querySelector('.sc-card').innerHTML = `
                <div class="alert alert-danger">
                    Gagal memuat data tagihan: ${error.message}
                </div>
            `;
        }
    }, 0);

    return section;
}

// Render billing content
function renderTagihanContent(container, billing) {
    const items = billing?.items || [];
    const status = billing?.status || 'draft';
    const confirmedBy = billing?.confirmed_by;
    const printedBy = billing?.printed_by;

    let subtotal = 0;
    const itemsHtml = items.map(item => {
        const itemTotal = (item.quantity || 1) * (item.price || 0);
        subtotal += itemTotal;
        return `
            <tr>
                <td>${escapeHtml(item.item_name)}</td>
                <td class="text-center">${item.quantity || 1}</td>
                <td class="text-right">${formatRupiah(item.price)}</td>
                <td class="text-right font-weight-bold">${formatRupiah(itemTotal)}</td>
            </tr>
        `;
    }).join('');

    const total = subtotal;

    const statusBadge = status === 'confirmed'
        ? '<span class="badge badge-success">Dikonfirmasi</span>'
        : '<span class="badge badge-warning">Draft</span>';

    const actionsHtml = status === 'draft'
        ? `<button type="button" class="btn btn-primary" id="btn-confirm-billing">
               <i class="fas fa-check mr-2"></i>Konfirmasi Tagihan
           </button>`
        : `<button type="button" class="btn btn-success mr-2" id="btn-print-etiket">
               <i class="fas fa-tag mr-2"></i>Cetak Etiket
           </button>
           <button type="button" class="btn btn-info" id="btn-print-invoice">
               <i class="fas fa-receipt mr-2"></i>Cetak Invoice
           </button>`;

    container.querySelector('.sc-card').innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <h4 class="mb-1">Rincian Tagihan</h4>
                <div class="text-muted small">
                    ${statusBadge}
                    ${confirmedBy ? `<span class="ml-2">• Dikonfirmasi oleh: ${escapeHtml(confirmedBy)}</span>` : ''}
                    ${printedBy ? `<span class="ml-2">• Dicetak oleh: ${escapeHtml(printedBy)}</span>` : ''}
                </div>
            </div>
        </div>

        <table class="table table-bordered">
            <thead class="thead-light">
                <tr>
                    <th>Item</th>
                    <th width="10%" class="text-center">Qty</th>
                    <th width="20%" class="text-right">Harga</th>
                    <th width="20%" class="text-right">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
                <tr class="table-active font-weight-bold">
                    <td colspan="3" class="text-right">GRAND TOTAL</td>
                    <td class="text-right">${formatRupiah(total)}</td>
                </tr>
            </tbody>
        </table>

        <div class="text-right mt-3">
            ${actionsHtml}
        </div>
    `;

    // Add event listeners
    setTimeout(() => {
        const confirmBtn = document.getElementById('btn-confirm-billing');
        const etiketBtn = document.getElementById('btn-print-etiket');
        const invoiceBtn = document.getElementById('btn-print-invoice');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', confirmBilling);
        }
        if (etiketBtn) {
            etiketBtn.addEventListener('click', () => printEtiket(items));
        }
        if (invoiceBtn) {
            etiketBtn.addEventListener('click', () => printInvoice(billing));
        }
    }, 0);
}

async function confirmBilling() {
    try {
        const token = await getToken();
        if (!token) return;

        const response = await fetch(`/api/sunday-clinic/billing/${routeMrSlug}/confirm`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to confirm billing');

        showSuccess('Tagihan berhasil dikonfirmasi!');
        await fetchRecord(routeMrSlug);
    } catch (error) {
        console.error('Error confirming billing:', error);
        showError('Gagal mengkonfirmasi tagihan: ' + error.message);
    }
}

function printEtiket(items) {
    // TODO: Implement etiket printing
    console.log('Print etiket:', items);
    showSuccess('Etiket akan segera dicetak...');
}

function printInvoice(billing) {
    // TODO: Implement invoice printing
    console.log('Print invoice:', billing);
    showSuccess('Invoice akan segera dicetak...');
}

function renderPlaceholderSection(title, description, note) {
    const section = document.createElement('div');
    section.className = 'sc-section';
    section.innerHTML = `
        <div class="sc-section-header">
            <h3>${escapeHtml(title)}</h3>
        </div>
        <div class="sc-card">
            <div class="sc-empty">
                <strong>${escapeHtml(description)}</strong>
                <span>${escapeHtml(note || 'Catatan pemeriksaan akan muncul di sini setelah dicatat di sistem.')}</span>
            </div>
        </div>
    `;
    return section;
}

function applyPageTitle() {
    if (!state.derived) {
        return;
    }
    const sectionLabel = getSectionLabel(activeSection);
    const patientName = state.derived.patientName || 'Pasien';
    const mrDisplay = (state.derived.mrId || routeMrSlug || 'MR').toUpperCase();
    document.title = `${sectionLabel} • ${patientName} • ${mrDisplay}`;
}

function renderActiveSection() {
    if (!sectionOutlet || !state.data || !state.derived) {
        return;
    }

    let element;
    switch (activeSection) {
        case 'identitas':
            element = renderIdentitas();
            break;
        case 'anamnesa':
            element = renderAnamnesa();
            break;
        case 'pemeriksaan':
            element = renderPemeriksaan();
            break;
        case 'usg':
            element = renderUSG();
            break;
        case 'penunjang':
            element = renderPenunjang();
            break;
        case 'diagnosis':
            element = renderDiagnosisSection();
            break;
        case 'planning':
            element = renderPlanning();
            break;
        case 'tagihan':
            element = renderTagihan();
            break;
        default:
            element = renderPlaceholderSection(
                getSectionLabel(activeSection),
                'Bagian ini belum memiliki konten.',
                'Fitur akan segera dikembangkan.'
            );
    }

    sectionOutlet.innerHTML = '';
    if (element) {
        sectionOutlet.appendChild(element);

        // Add auto-capitalization for text inputs and textareas
        const textFields = element.querySelectorAll('input[type="text"], textarea:not([readonly])');
        textFields.forEach(field => {
            field.addEventListener('input', (e) => {
                const value = e.target.value;
                if (value.length > 0) {
                    const firstChar = value.charAt(0);
                    if (firstChar !== firstChar.toUpperCase() && firstChar.toLowerCase() !== firstChar.toUpperCase()) {
                        const start = e.target.selectionStart;
                        const end = e.target.selectionEnd;
                        e.target.value = firstChar.toUpperCase() + value.slice(1);
                        e.target.setSelectionRange(start, end);
                    }
                }
            });
        });
    }
    applyPageTitle();
}

function renderApp() {
    if (!DOM.content) {
        return;
    }
    DOM.content.innerHTML = '';

    // Render summary in header
    const summaryContainer = document.getElementById('summary-cards-container');
    if (summaryContainer) {
        summaryContainer.innerHTML = '';
        const summary = createSummary();
        if (summary) {
            summaryContainer.appendChild(summary);
        }
    }

    sectionOutlet = document.createElement('div');
    sectionOutlet.className = 'sc-section-container';
    DOM.content.appendChild(sectionOutlet);

    updateSidebarActive();
    renderActiveSection();
}

function navigateToMr(mrId, { section = SECTION_DEFS[0].id } = {}) {
    const normalizedMr = mrId ? String(mrId).trim() : '';
    if (!normalizedMr) {
        showError('MR ID tidak valid. Pilih kunjungan lain.');
        openDirectory({ focusSearch: true, forceReload: false });
        return;
    }

    const targetSection = SECTION_LOOKUP.has(section) ? section : SECTION_DEFS[0].id;

    if (normalizedMr === routeMrSlug && activeSection === targetSection && state.data) {
        handleSectionChange(targetSection);
        return;
    }

    routeMrSlug = normalizedMr;
    routeRemainder = '';
    activeSection = targetSection;
    directoryState.selectedVisitMrId = normalizedMr;
    const matchingPatient = directoryState.patients.find((patient) => (patient.visits || []).some((visit) => visit.mrId === normalizedMr));
    if (matchingPatient) {
        directoryState.selectedPatientId = matchingPatient.patientId;
    }
    state.data = null;
    state.derived = null;

    updateSectionLabel();
    setMeta();
    showLoading('Memuat data rekam medis...');

    const newPath = `/sunday-clinic/${encodeURIComponent(routeMrSlug)}/${targetSection}`;
    if (window.location.pathname !== newPath) {
        history.pushState({ section: targetSection }, '', newPath);
    } else {
        history.replaceState({ section: targetSection }, '', newPath);
    }

    fetchRecord(routeMrSlug, { skipSpinner: true });
}

function handleSectionChange(sectionId, { pushHistory = true } = {}) {
    const target = SECTION_LOOKUP.has(sectionId) ? sectionId : SECTION_DEFS[0].id;
    if (target === activeSection && pushHistory) {
        return;
    }
    activeSection = target;
    updateSectionLabel();
    updateSidebarActive();
    renderActiveSection();
    if (pushHistory) {
        history.pushState({ section: target }, '', buildPath(target));
    }
}

// Expose handleSectionChange globally for HTML inline script
window.handleSectionChange = handleSectionChange;

function getToken() {
    const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    return token;
}

function capitalizeFirstLetter(str) {
    if (typeof str !== 'string' || str.length === 0) return str;
    const firstChar = str.charAt(0);
    if (firstChar.toLowerCase() === firstChar.toUpperCase()) return str; // Not a letter
    return firstChar.toUpperCase() + str.slice(1);
}

function capitalizePatientData(data) {
    if (!data || typeof data !== 'object') return data;

    if (Array.isArray(data)) {
        return data.map(item => capitalizePatientData(item));
    }

    const result = {};
    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            const value = data[key];
            if (typeof value === 'string') {
                result[key] = capitalizeFirstLetter(value);
            } else if (typeof value === 'object' && value !== null) {
                result[key] = capitalizePatientData(value);
            } else {
                result[key] = value;
            }
        }
    }
    return result;
}

async function fetchRecord(mrId = routeMrSlug, { skipSpinner = false } = {}) {
    const token = getToken();
    if (!token) {
        return;
    }

    const normalizedMr = mrId ? String(mrId).trim() : '';
    if (!normalizedMr) {
        showError('MR ID tidak ditemukan pada URL. Pilih kunjungan dari direktori.');
        openDirectory({ focusSearch: true });
        return;
    }

    routeMrSlug = normalizedMr;

    if (!skipSpinner) {
        showLoading('Memuat data rekam medis...');
    }

    try {
        const response = await fetch(`/api/sunday-clinic/records/${encodeURIComponent(routeMrSlug)}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.status === 401) {
            window.location.href = 'login.html';
            return;
        }

        if (response.status === 404) {
            showError('Data rekam medis Sunday Clinic tidak ditemukan.');
            openDirectory({ focusSearch: true });
            return;
        }

        if (!response.ok) {
            throw new Error('Gagal memuat data Sunday Clinic');
        }

        const payload = await response.json();
        if (!payload || !payload.data) {
            showError('Data rekam medis Sunday Clinic kosong.');
            openDirectory({ focusSearch: true });
            return;
        }

        // Capitalize first letter of all string fields in patient data
        state.data = capitalizePatientData(payload.data);
        state.derived = computeDerived(state.data);

        hideLoading();
        setMeta();
        renderApp();
    } catch (error) {
        console.error('Sunday Clinic: gagal memuat rekam medis', error);
        showError('Terjadi kesalahan saat memuat data rekam medis Sunday Clinic.');
        openDirectory({ focusSearch: true });
    }
}

function showError(message) {
    hideLoading();
    if (!DOM.content) {
        return;
    }
    DOM.content.innerHTML = `
        <div class="alert alert-danger mb-0">
            ${escapeHtml(message)}
        </div>
    `;
}

function showSuccess(message) {
    // Create a temporary toast notification
    const toast = document.createElement('div');
    toast.className = 'alert alert-success position-fixed';
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    toast.innerHTML = `
        <i class="fas fa-check-circle mr-2"></i>${escapeHtml(message)}
    `;
    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.addEventListener('popstate', () => {
    const route = parseRoute();
    if (route.mrId !== routeMrSlug) {
        window.location.reload();
        return;
    }
    handleSectionChange(SECTION_LOOKUP.has(route.section) ? route.section : SECTION_DEFS[0].id, { pushHistory: false });
});

// Save Anamnesa function
async function saveAnamnesa() {
    const btn = document.getElementById('btn-update-anamnesa');
    if (!btn) return;

    // Disable button
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    try {
        // Collect all field values
        const data = {
            keluhan_utama: document.getElementById('anamnesa-keluhan-utama')?.value || '',
            riwayat_kehamilan_saat_ini: document.getElementById('anamnesa-riwayat-kehamilan')?.value || '',
            hpht: document.getElementById('anamnesa-hpht')?.value || '',
            hpl: document.getElementById('anamnesa-hpl')?.value || '',
            detail_riwayat_penyakit: document.getElementById('anamnesa-detail-riwayat')?.value || '',
            riwayat_keluarga: document.getElementById('anamnesa-riwayat-keluarga')?.value || '',
            alergi_obat: document.getElementById('anamnesa-alergi-obat')?.value || '',
            alergi_makanan: document.getElementById('anamnesa-alergi-makanan')?.value || '',
            alergi_lingkungan: document.getElementById('anamnesa-alergi-lingkungan')?.value || '',
            gravida: document.getElementById('anamnesa-gravida')?.value || '',
            para: document.getElementById('anamnesa-para')?.value || '',
            abortus: document.getElementById('anamnesa-abortus')?.value || '',
            anak_hidup: document.getElementById('anamnesa-anak-hidup')?.value || '',
            usia_menarche: document.getElementById('anamnesa-usia-menarche')?.value || '',
            lama_siklus: document.getElementById('anamnesa-lama-siklus')?.value || '',
            siklus_teratur: document.getElementById('anamnesa-siklus-teratur')?.value || '',
            metode_kb_terakhir: document.getElementById('anamnesa-metode-kb')?.value || '',
            kegagalan_kb: document.getElementById('anamnesa-kegagalan-kb')?.value || '',
            jenis_kb_gagal: document.getElementById('anamnesa-jenis-kb-gagal')?.value || '',
            verified_at: new Date().toISOString()
        };

        // Get patient ID from state
        const patientId = state.data?.record?.patientId || state.data?.patient?.id;
        if (!patientId) {
            throw new Error('Patient ID tidak ditemukan');
        }

        // Get token
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        // Send to API
        const response = await fetch('/api/medical-records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                patientId: patientId,
                type: 'anamnesa',
                data: data,
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const result = await response.json();

        // Show success message
        showSuccess('Anamnesa berhasil diperbarui');

        // Reload the record to show updated data
        await fetchRecord(routeMrSlug);

    } catch (error) {
        console.error('Error saving anamnesa:', error);
        showError('Gagal menyimpan anamnesa: ' + error.message);

        // Re-enable button
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Update';
    }
}

function init() {
    bindDirectoryDom();

    if (!routeMrSlug) {
        hideLoading();
        setMeta();
        if (DOM.content) {
            DOM.content.innerHTML = `
                <div class="alert alert-info mb-0">
                    Pilih pasien dari direktori untuk membuka rekam medis Sunday Clinic.
                </div>
            `;
        }
        openDirectory({ focusSearch: true, forceReload: true });
        return;
    }

    setMeta();
    fetchRecord(routeMrSlug);
    loadDirectory();
}

init();
