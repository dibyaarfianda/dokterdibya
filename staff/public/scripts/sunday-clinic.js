const SECTION_DEFS = [
    { id: 'identitas', label: 'Identitas' },
    { id: 'anamnesa', label: 'Anamnesa' },
    { id: 'pemeriksaan', label: 'Pemeriksaan Fisik' },
    { id: 'usg', label: 'USG' },
    { id: 'penunjang', label: 'Pemeriksaan Penunjang' },
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
    lab: 'Pemeriksaan Penunjang',
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

function createSummary() {
    if (!state.derived) {
        return null;
    }
    const derived = state.derived;
    const summary = document.createElement('div');
    summary.className = 'sc-summary';

    const mrDisplay = (derived.mrId || routeMrSlug || '-').toUpperCase();
    const riskBadge = derived.highRisk
        ? '<span class="sc-pill sc-pill--danger">High Risk</span>'
        : '<span class="sc-pill sc-pill--info">Low Risk</span>';

    const patientMeta = [
        `MR ID: ${escapeHtml(mrDisplay)}`
    ];
    if (derived.quickId) {
        patientMeta.push(`Quick ID: ${escapeHtml(derived.quickId)}`);
    }
    patientMeta.push(riskBadge);
    summary.appendChild(createSummaryCard('Pasien', safeText(derived.patientName || '-'), patientMeta));

    const dobText = formatDate(derived.dob);
    const ageMeta = [];
    if (dobText) {
        ageMeta.push(`Lahir ${escapeHtml(dobText)}`);
    }
    summary.appendChild(createSummaryCard('Usia', safeText(derived.age ? `${derived.age} th` : '-'), ageMeta));

    const gaText = formatGestationalAge(derived.gestationalAge) || '-';
    const pregnancyMeta = [];
    const hphtText = formatDate(derived.lmp);
    const eddText = formatDate(derived.edd);
    if (hphtText) {
        pregnancyMeta.push(`HPHT ${escapeHtml(hphtText)}`);
    }
    if (eddText) {
        pregnancyMeta.push(`HPL ${escapeHtml(eddText)}`);
    }
    if (derived.bmi) {
        pregnancyMeta.push(`BMI ${escapeHtml(String(derived.bmi))}`);
    }
    summary.appendChild(createSummaryCard('Usia Kehamilan', safeText(gaText), pregnancyMeta));

    const appointmentMeta = [];
    let appointmentValue = 'Tidak terhubung';
    if (derived.appointment) {
        const appointmentDate = formatDate(derived.appointment.appointmentDate);
        appointmentValue = appointmentDate || 'Terhubung';
        const timeLabel = [derived.appointment.slotTime ? `${derived.appointment.slotTime} WIB` : null, derived.appointment.sessionLabel || null]
            .filter(Boolean)
            .join(' • ');
        if (timeLabel) {
            appointmentMeta.push(`Waktu: ${escapeHtml(timeLabel)}`);
        }
        const appointmentStatus = formatStatus(derived.appointment.status);
        if (appointmentStatus) {
            appointmentMeta.push(`Status: ${escapeHtml(appointmentStatus)}`);
        }
        if (derived.appointment.chiefComplaint) {
            appointmentMeta.push(`Keluhan: ${escapeHtml(derived.appointment.chiefComplaint)}`);
        }
    } else {
        appointmentMeta.push('Gunakan daftar pasien Klinik Private untuk memulai pemeriksaan.');
    }
    summary.appendChild(createSummaryCard('Janji Temu', safeText(appointmentValue), appointmentMeta));

    return summary;
}

function buildPath(sectionId) {
    const base = `/sunday-clinic/${encodeURIComponent(routeMrSlug || '')}`;
    const remainder = routeRemainder ? `/${routeRemainder}` : '';
    return `${base}/${sectionId}${remainder}`;
}

function createSidebar() {
    const nav = document.createElement('nav');
    nav.className = 'sc-sidebar';
    SECTION_DEFS.forEach(section => {
        const link = document.createElement('a');
        link.href = buildPath(section.id);
        link.className = 'sc-nav-link';
        link.dataset.section = section.id;
        link.textContent = section.label;
        nav.appendChild(link);
    });

    nav.addEventListener('click', event => {
        const target = event.target.closest('.sc-nav-link');
        if (!target) {
            return;
        }
        event.preventDefault();
        handleSectionChange(target.dataset.section);
    });

    return nav;
}

function updateSidebarActive() {
    if (!sidebarEl) {
        return;
    }
    const links = sidebarEl.querySelectorAll('[data-section]');
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
        ['Nomor MR', safeText((derived.mrId || '-').toUpperCase())],
        ['Quick ID Intake', safeText(derived.quickId || '-')],
        ['ID Pasien', safeText(derived.patientId || '-')],
        ['Jenis Pasien', safeText(patient.patientType || '-')],
        ['Usia', safeText(derived.age ? `${derived.age} tahun` : '-')]
    ];

    const contactRows = [
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

    const pregnancyRows = [
        ['HPHT', safeText(formatDate(derived.lmp) || '-')],
        ['HPL', safeText(formatDate(derived.edd) || '-')],
        ['Usia Kehamilan', safeText(formatGestationalAge(derived.gestationalAge) || '-')],
        ['BMI (Intake)', safeText(derived.bmi || '-')],
        ['Gravida (G)', safeText(derived.gravida ?? '-')],
        ['Para (P)', safeText(derived.para ?? '-')],
        ['Abortus (A)', safeText(derived.abortus ?? '-')],
        ['Anak Hidup (L)', safeText(derived.living ?? '-')]
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

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Identitas Pasien</h3>
            ${derived.highRisk ? '<span class="sc-pill sc-pill--danger">High Risk</span>' : ''}
        </div>
        <div class="sc-grid two">
            <div class="sc-card">
                <h4>Data Utama</h4>
                ${buildInfoTable(primaryRows)}
            </div>
            <div class="sc-card">
                <h4>Kontak & Sosial</h4>
                ${buildInfoTable(contactRows)}
            </div>
        </div>
        <div class="sc-grid two">
            <div class="sc-card">
                <h4>Kehamilan Saat Ini</h4>
                ${buildInfoTable(pregnancyRows)}
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
    const riskFlags = derived.riskFlags && derived.riskFlags.length
        ? derived.riskFlags
        : mapRiskCodesToLabels(derived.riskFactorCodes);

    const medicalConditions = mapMedicalConditionCodes(payload.medical_conditions);
    const medications = buildMedicationsList(payload);
    const allergies = {
        drug: payload.drug_allergies || payload.allergy_drugs || '',
        food: payload.food_allergies || payload.allergy_food || '',
        other: payload.other_allergies || payload.allergy_env || ''
    };
    const familyHistory = payload.family_medical_history || payload.family_history_detail || '';
    const complaintRows = [
        ['Keluhan Utama', formatMultiline(derived.appointment?.chiefComplaint || payload.current_symptoms || payload.reason)],
        ['Riwayat Kehamilan Saat Ini', formatMultiline(payload.current_pregnancy_history || payload.obstetric_history)],
        ['HPHT', safeText(formatDate(derived.lmp) || '-')],
        ['HPL', safeText(formatDate(derived.edd) || '-')],
        ['Usia Kehamilan', safeText(formatGestationalAge(derived.gestationalAge) || '-')],
        ['BMI (Intake)', safeText(derived.bmi || '-')],
        ['Catatan Review Intake', formatMultiline(derived.intakeReviewNotes)]
    ];

    const medicalRows = [
        ['Riwayat Penyakit', renderChipList(medicalConditions)],
        ['Detail Riwayat Penyakit', formatMultiline(payload.past_medical_history || payload.other_conditions || payload.past_conditions_detail)],
        ['Riwayat Keluarga', formatMultiline(familyHistory)],
        ['Obat yang Sedang Dikonsumsi', renderChipList(medications)],
        ['Alergi Obat', formatMultiline(allergies.drug)],
        ['Alergi Makanan', formatMultiline(allergies.food)],
        ['Alergi Lingkungan', formatMultiline(allergies.other)],
        ['Faktor Risiko Intake', riskFlags.length ? renderChipList(riskFlags) : safeText('Tidak ada faktor risiko')]
    ];

    const obstetricRows = [
        ['Gravida (G)', safeText(derived.gravida ?? '-')],
        ['Para (P)', safeText(derived.para ?? '-')],
        ['Abortus (A)', safeText(derived.abortus ?? '-')],
        ['Anak Hidup (L)', safeText(derived.living ?? '-')]
    ];

    const cycleRows = [
        ['Usia Menarche', safeText(derived.cycle.menarcheAge ? `${derived.cycle.menarcheAge} tahun` : '-')],
        ['Lama Siklus', safeText(derived.cycle.cycleLength ? `${derived.cycle.cycleLength} hari` : '-')],
        ['Siklus Teratur', safeText(formatYesNo(derived.cycle.regular) || '-')],
        ['Metode KB Terakhir', safeText(derived.contraception.previous || '-')],
        ['Kegagalan KB', safeText(formatYesNo(derived.contraception.failure) || (derived.contraception.failure ? derived.contraception.failure : '-'))],
        ['Jenis KB saat gagal', safeText(derived.contraception.failureType || '-')]
    ];

    const pregnanciesTable = renderPreviousPregnanciesTable(payload.previous_pregnancies || payload.previousPregnancies);

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Anamnesa & Riwayat</h3>
        </div>
        <div class="sc-grid two">
            <div class="sc-card">
                <h4>Keluhan & Kehamilan Saat Ini</h4>
                ${buildInfoTable(complaintRows)}
            </div>
            <div class="sc-card">
                <h4>Riwayat Medis</h4>
                ${buildInfoTable(medicalRows)}
            </div>
        </div>
        <div class="sc-grid two">
            <div class="sc-card">
                <h4>Ringkasan Obstetri</h4>
                ${buildInfoTable(obstetricRows)}
            </div>
            <div class="sc-card">
                <h4>Siklus & Kontrasepsi</h4>
                ${buildInfoTable(cycleRows)}
            </div>
        </div>
        <div class="sc-card">
            <h4>Kehamilan Sebelumnya</h4>
            ${pregnanciesTable}
        </div>
    `;

    return section;
}

function renderPemeriksaan() {
    const context = getMedicalRecordContext('physical_exam');
    if (!context) {
        return renderPlaceholderSection(
            'Pemeriksaan Fisik',
            'Belum ada data pemeriksaan fisik.',
            'Catat temuan fisik di modul pemeriksaan untuk menampilkan data di sini.'
        );
    }

    const data = context.data || {};
    const section = document.createElement('div');
    section.className = 'sc-section';

    const vitalsRows = [
        [PHYSICAL_LABELS.tekanan_darah, formatMultiline(data.tekanan_darah || '-')],
        [PHYSICAL_LABELS.nadi, formatMultiline(data.nadi || '-')],
        [PHYSICAL_LABELS.suhu, formatMultiline(data.suhu || '-')],
        [PHYSICAL_LABELS.respirasi, formatMultiline(data.respirasi || '-')]
    ];

    const findingsRows = [
        [PHYSICAL_LABELS.kepala_leher, formatMultiline(data.kepala_leher || '-')],
        [PHYSICAL_LABELS.thorax, formatMultiline(data.thorax || '-')],
        [PHYSICAL_LABELS.abdomen, formatMultiline(data.abdomen || '-')],
        [PHYSICAL_LABELS.ekstremitas, formatMultiline(data.ekstremitas || '-')],
        [PHYSICAL_LABELS.pemeriksaan_obstetri, formatMultiline(data.pemeriksaan_obstetri || '-')]
    ];

    const metaHtml = renderRecordMeta(context, 'physical_exam');

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Pemeriksaan Fisik</h3>
        </div>
        ${metaHtml}
        <div class="sc-grid two">
            <div class="sc-card">
                <h4>Tanda Vital</h4>
                ${buildInfoTable(vitalsRows)}
            </div>
            <div class="sc-card">
                <h4>Temuan Klinis</h4>
                ${buildInfoTable(findingsRows)}
            </div>
        </div>
    `;

    return section;
}

function renderUSG() {
    const context = getMedicalRecordContext('usg');
    if (!context) {
        return renderPlaceholderSection(
            'USG',
            'Belum ada hasil USG yang tersimpan.',
            'Unggah atau catat temuan USG untuk menampilkan ringkasan.'
        );
    }

    const data = context.data || {};
    const section = document.createElement('div');
    section.className = 'sc-section';

    const infoRows = [
        [USG_LABELS.usg_date, safeText(formatDate(data.usg_date) || data.usg_date || '-')],
        [USG_LABELS.usia_kehamilan, safeText(data.usia_kehamilan || '-')]
    ];

    const findingsRows = [
        [USG_LABELS.biometri, formatMultiline(data.biometri || '-')],
        [USG_LABELS.anatomi_janin, formatMultiline(data.anatomi_janin || '-')],
        [USG_LABELS.plasenta_air_ketuban, formatMultiline(data.plasenta_air_ketuban || '-')]
    ];

    const metaHtml = renderRecordMeta(context, 'usg');

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>USG</h3>
        </div>
        ${metaHtml}
        <div class="sc-grid two">
            <div class="sc-card">
                <h4>Informasi Pemeriksaan</h4>
                ${buildInfoTable(infoRows)}
            </div>
            <div class="sc-card">
                <h4>Temuan USG</h4>
                ${buildInfoTable(findingsRows)}
            </div>
        </div>
        <div class="sc-card">
            <h4>${USG_LABELS.kesimpulan_usg}</h4>
            <div>${formatMultiline(data.kesimpulan_usg || '-')}</div>
        </div>
    `;

    return section;
}

function renderPenunjang() {
    const context = getMedicalRecordContext('lab');
    if (!context) {
        return renderPlaceholderSection(
            'Pemeriksaan Penunjang',
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
            <h3>Pemeriksaan Penunjang</h3>
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
    if (!context) {
        return renderPlaceholderSection(
            'Diagnosis',
            'Diagnosis kerja belum dicatat.',
            'Gunakan formulir pencatatan pemeriksaan untuk menyimpan diagnosis pasien.'
        );
    }

    const data = context.data || {};
    const section = document.createElement('div');
    section.className = 'sc-section';
    const metaHtml = renderRecordMeta(context, 'diagnosis');

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Diagnosis</h3>
        </div>
        ${metaHtml}
        <div class="sc-card">
            <h4>Diagnosis Klinis</h4>
            <div>${formatMultiline(data.diagnosis || '-')}</div>
        </div>
    `;

    return section;
}

function renderPlanning() {
    const context = getMedicalRecordContext('planning', ['diagnosis']);
    if (!context) {
        return renderPlaceholderSection(
            'Planning',
            'Rencana tindak lanjut belum tersedia.',
            'Susun rencana pengobatan atau kontrol untuk menampilkan ringkasan di sini.'
        );
    }

    const data = context.data || {};
    const section = document.createElement('div');
    section.className = 'sc-section';
    const metaHtml = renderRecordMeta(context, 'planning');

    const planRows = [
        [PLANNING_LABELS.rencana_tindakan, formatMultiline(data.rencana_tindakan || '-')],
        [PLANNING_LABELS.resep, formatMultiline(data.resep || '-')],
        [PLANNING_LABELS.catatan, formatMultiline(data.catatan || '-')]
    ];

    section.innerHTML = `
        <div class="sc-section-header">
            <h3>Planning</h3>
        </div>
        ${metaHtml}
        <div class="sc-card">
            <h4>Rencana & Tindak Lanjut</h4>
            ${buildInfoTable(planRows)}
        </div>
    `;

    return section;
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
            element = renderPlaceholderSection(
                'Tagihan & Biaya',
                'Belum ada data tagihan untuk kunjungan ini.',
                'Tagihan kunjungan akan otomatis muncul setelah dibuat melalui modul billing.'
            );
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
    }
    applyPageTitle();
}

function renderApp() {
    if (!DOM.content) {
        return;
    }
    DOM.content.innerHTML = '';

    const layout = document.createElement('div');
    layout.className = 'sc-layout';

    sidebarEl = createSidebar();
    layout.appendChild(sidebarEl);

    const main = document.createElement('div');
    main.className = 'sc-main';

    const summary = createSummary();
    if (summary) {
        main.appendChild(summary);
    }

    sectionOutlet = document.createElement('div');
    sectionOutlet.className = 'sc-section-container';
    main.appendChild(sectionOutlet);

    layout.appendChild(main);
    DOM.content.appendChild(layout);

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

function getToken() {
    const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    return token;
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

        state.data = payload.data;
        state.derived = computeDerived(payload.data);

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

window.addEventListener('popstate', () => {
    const route = parseRoute();
    if (route.mrId !== routeMrSlug) {
        window.location.reload();
        return;
    }
    handleSectionChange(SECTION_LOOKUP.has(route.section) ? route.section : SECTION_DEFS[0].id, { pushHistory: false });
});

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
