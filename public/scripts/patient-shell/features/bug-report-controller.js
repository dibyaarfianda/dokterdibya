const MAX_MESSAGE_LENGTH = 1500;
const API_MAX_MESSAGE_LENGTH = 2000;

export function createBugReportController(options = {}) {
    const getProfile = options.getProfile || (() => ({}));
    const getToken = options.getToken || (() => '');
    const requireRealPatient = options.requireRealPatient || (() => true);
    const stopEvent = options.stopEvent || (() => {});
    const openModal = options.openModal || (() => {});
    const closeAllModals = options.closeAllModals || (() => {});
    const showToast = options.showToast || (() => {});

    function updateCount() {
        const textarea = document.getElementById('bug-report-message');
        const counter = document.getElementById('bug-report-count');
        if (textarea && counter) counter.textContent = String(textarea.value.length);
    }

    function setSubmitting(isSubmitting) {
        const textarea = document.getElementById('bug-report-message');
        const button = document.getElementById('bug-report-submit-btn');
        if (textarea) textarea.disabled = isSubmitting;
        if (button) {
            button.disabled = isSubmitting;
            button.innerHTML = isSubmitting
                ? '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...'
                : '<i class="fa-solid fa-paper-plane"></i> Kirim';
        }
    }

    function open(event) {
        stopEvent(event);
        if (!requireRealPatient(
            'Laporan bug memakai konteks akun pasien agar tim bisa menindaklanjuti dengan tepat.',
            event
        )) return;

        const textarea = document.getElementById('bug-report-message');
        if (textarea) textarea.value = '';
        updateCount();
        setSubmitting(false);
        openModal('bug-report-modal');
        window.setTimeout(() => textarea?.focus(), 120);
    }

    function close(event) {
        stopEvent(event);
        closeAllModals();
    }

    function buildMessage(message) {
        const profile = getProfile() || {};
        const context = [
            '',
            '--- Konteks otomatis ---',
            'Halaman: ' + window.location.href,
            'Viewport: ' + (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
            'Pasien: ' + (profile.fullname || profile.full_name || profile.name || '-'),
            'Patient ID: ' + (profile.id || profile.patient_id || profile.medicalRecordId || '-'),
            'User agent: ' + (navigator.userAgent || '-')
        ].join('\n');
        const combined = message + context;
        if (combined.length <= API_MAX_MESSAGE_LENGTH) return combined;
        return combined.slice(0, API_MAX_MESSAGE_LENGTH - 14) + '\n[terpotong]';
    }

    async function submit(event) {
        stopEvent(event);
        if (!requireRealPatient('Mode demo tidak dapat mengirim laporan bug.', event)) return;

        const textarea = document.getElementById('bug-report-message');
        const message = String(textarea?.value || '').trim();
        if (!message) {
            showToast('Tuliskan detail bug/error terlebih dahulu');
            textarea?.focus();
            return;
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
            showToast('Laporan maksimal ' + MAX_MESSAGE_LENGTH + ' karakter');
            return;
        }

        const token = getToken();
        if (!token) {
            showToast('Silakan login ulang untuk mengirim laporan');
            window.setTimeout(() => { window.location.href = '/patient-login.html'; }, 1000);
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch('/api/patient-feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'Cache-Control': 'no-cache'
                },
                body: JSON.stringify({
                    category: 'bug',
                    message: buildMessage(message),
                    rating: null,
                    is_anonymous: false
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Gagal mengirim laporan');
            }
            if (textarea) textarea.value = '';
            updateCount();
            closeAllModals();
            showToast(data.message || 'Laporan bug/error berhasil dikirim');
        } catch (error) {
            showToast(error?.message || 'Koneksi bermasalah, coba lagi');
        } finally {
            setSubmitting(false);
        }
    }

    return Object.freeze({
        close,
        open,
        submit,
        updateCount
    });
}
