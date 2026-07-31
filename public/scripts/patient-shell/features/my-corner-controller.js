const CORNER_NOTE_KEY = 'patient_my_corner_note';
const MY_CORNER_ALLOWED_NAMES = new Set(['nanda ananda', 'feby kumalasari']);

function normalizePatientName(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isAllowedProfile(profile) {
    const patientName = normalizePatientName(
        profile?.fullname || profile?.full_name || profile?.name || ''
    );
    return MY_CORNER_ALLOWED_NAMES.has(patientName);
}

export function createMyCornerController(options = {}) {
    const cornerNameKey = options.cornerNameKey || 'patient_my_corner_name';
    const getProfile = options.getProfile || (() => ({}));
    const getToken = options.getToken || (() => '');
    const isGuestMode = options.isGuestMode || (() => false);
    const requireRealPatient = options.requireRealPatient || (() => true);
    const showToast = options.showToast || (() => {});
    const loadFeature = options.loadFeature || (() => Promise.resolve());

    function readPreference(key, fallback) {
        try {
            return localStorage.getItem(key) || fallback;
        } catch (error) {
            return fallback;
        }
    }

    function apply() {
        const profile = getProfile() || {};
        const fallback = profile.fullname
            ? 'Ruang ' + profile.fullname.split(' ')[0]
            : 'Ruang Saya';
        const name = readPreference(cornerNameKey, fallback);
        const note = readPreference(
            CORNER_NOTE_KEY,
            'Simpan catatan kecil, atur preferensi, dan pin hal yang sering Anda buka.'
        );
        const cornerName = document.getElementById('corner-name');
        const cornerCardTitle = document.getElementById('corner-card-title');
        const cornerDesc = document.getElementById('corner-desc');
        const cornerAction = document.getElementById('my-corner-action-btn');
        const isAllowed = isAllowedProfile(profile);

        if (cornerName) cornerName.textContent = name;
        if (cornerCardTitle) cornerCardTitle.textContent = name.length > 14 ? 'Ruang' : name;
        if (cornerDesc) cornerDesc.textContent = isAllowed ? note : 'Coming Soon';
        if (cornerAction) {
            cornerAction.innerHTML = isAllowed
                ? '<i class="fa-solid fa-pen"></i> Atur'
                : '<i class="fa-solid fa-clock"></i> Coming Soon';
        }
    }

    function trackComingSoon() {
        const profile = getProfile();
        if (!profile || isGuestMode()) return;
        const token = getToken();
        if (!token) return;
        fetch('/api/patients/track-page', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ page_name: 'Ruang Saya - Coming Soon' })
        }).catch(() => {});
    }

    async function ensureFeature() {
        showToast('Ruang sedang dimuat');
        try {
            await loadFeature('myCorner');
        } catch (error) {
            console.error('[PatientShell] My Corner failed to load:', error);
        }

        // The legacy feature publishes its own globals while loading. Restore the
        // shell wrappers so access checks remain in force until callers migrate.
        window.openMyCorner = open;
        window.saveMyCorner = save;
        return window.PatientMyCorner;
    }

    async function open() {
        if (!requireRealPatient(
            'Ruang personal tersimpan untuk akun pasien. Masuk untuk membuka dan mengaturnya.'
        )) {
            return;
        }

        const profile = getProfile() || {};
        if (!isAllowedProfile(profile)) {
            trackComingSoon();
            showToast('Ruang Saya Coming Soon');
            return;
        }

        const feature = window.PatientMyCorner || await ensureFeature();
        if (feature && typeof feature.open === 'function') {
            return feature.open();
        }
        showToast('Ruang sedang dimuat');
    }

    async function save() {
        const feature = window.PatientMyCorner || await ensureFeature();
        if (feature && typeof feature.save === 'function') {
            return feature.save();
        }
        showToast('Ruang sedang dimuat');
    }

    return Object.freeze({
        apply,
        isAllowedProfile,
        open,
        save
    });
}
