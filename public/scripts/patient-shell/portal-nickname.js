/** Account-scoped nickname persistence shared by Home and tool pages. */
export function createPortalNicknameStore({ getPatient, storage, warn }) {
    let owner = null;
    let remembered = '';
    let warned = false;
    let volatile = false;
    const storageWarning = 'Nickname tidak dapat disimpan di browser ini; Anda mungkin perlu mengisinya lagi setelah membuka ulang halaman.';

    function accountKey() {
        const id = getPatient()?.id;
        const next = id == null || id === '' ? null : String(id);
        if (owner !== next) {
            owner = next;
            remembered = '';
            warned = false;
            volatile = false;
        }
        return owner ? 'patient_portal_nickname:' + owner : null;
    }

    function notifyStorageFailure() {
        if (!warned) { warned = true; warn(storageWarning); }
    }

    function read() {
        const key = accountKey();
        if (!key) return '';
        if (volatile) return remembered;
        try {
            const saved = String(storage().getItem(key) || '').trim();
            if (saved) remembered = saved;
        } catch (error) { notifyStorageFailure(); }
        return remembered;
    }

    function persist(nickname, required = false) {
        const key = accountKey();
        if (!key) throw new Error('Identitas akun pasien tidak tersedia. Silakan masuk kembali.');
        try {
            storage().setItem(key, nickname);
            if (storage().getItem(key) !== nickname) throw new Error('Storage verification failed');
        } catch (error) {
            if (required) throw new Error(storageWarning);
            remembered = nickname;
            volatile = true;
            notifyStorageFailure();
            return false;
        }
        remembered = nickname;
        volatile = false;
        return true;
    }

    function merge(settings = {}, { cached = false } = {}) {
        let nickname = read();
        // Unscoped legacy settings are never evidence of nickname ownership.
        if (!nickname && !cached) {
            nickname = String(settings.nickname || '').trim();
            if (nickname && accountKey()) persist(nickname);
        }
        return { ...settings, nickname: nickname || null };
    }

    async function save(payload, { demo = false, request } = {}) {
        const candidate = String(payload.nickname || '').trim();
        if (candidate.length < 3 || candidate.length > 40) throw new Error('Nickname harus terdiri dari 3–40 karakter.');
        const key = accountKey();
        if (!key) throw new Error('Identitas akun pasien tidak tersedia. Silakan masuk kembali.');
        const normalized = { ...payload, nickname: candidate };
        // Real accounts retain server validation and community nickname sync.
        const settings = demo ? normalized : await request(normalized);
        if (accountKey() !== key) throw new Error('Akun berubah. Silakan ulangi penyimpanan.');
        if (String(settings?.nickname || '').trim() !== candidate) {
            throw new Error('Nickname belum tersimpan. Silakan coba lagi.');
        }
        const persisted = persist(candidate, demo);
        return { settings: { ...settings, nickname: candidate }, persisted };
    }

    return { merge, save };
}
