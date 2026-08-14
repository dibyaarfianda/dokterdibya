import { ROLE_IDS } from './role-constants.js';

const apiHeaders = () => ({
    'Authorization': `Bearer ${typeof window.getAuthToken === 'function' ? window.getAuthToken() : ''}`,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
});

function assertDoctor() {
    if (Number(window.auth?.currentUser?.role_id) !== ROLE_IDS.DOKTER) {
        throw new Error('Halaman Portal Pasien Dummy hanya tersedia untuk dokter.');
    }
}

function formatWib(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta'
    }).format(date);
}

async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: apiHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || 'Permintaan Portal Pasien Dummy gagal.');
    return data;
}

function setStatus(status) {
    document.getElementById('patient-demo-active-sessions').textContent = String(status.activeSessions || 0);
    document.getElementById('patient-demo-last-reset').textContent = formatWib(status.lastResetAt);
    document.getElementById('patient-demo-version').textContent = status.schemaVersion || '-';
    document.getElementById('patient-demo-updated').textContent = formatWib(status.updatedAt);
}

async function loadStatus() {
    try {
        assertDoctor();
        const data = await request('/api/patient-demo/status');
        setStatus(data.status);
    } catch (error) {
        const box = document.getElementById('patient-demo-error');
        if (box) { box.textContent = error.message; box.classList.remove('d-none'); }
    }
}

window.showPatientDemoPage = function showPatientDemoPage() {
    try {
        assertDoctor();
    } catch (error) {
        window.Swal?.fire('Akses ditolak', error.message, 'error');
        return;
    }
    window.hideAllPages?.();
    document.getElementById('patient-demo-page')?.classList.remove('d-none');
    document.getElementById('nav-patient-demo')?.querySelector('.nav-link')?.classList.add('active');
    const title = document.getElementById('page-title');
    if (title) title.textContent = 'Portal Pasien Dummy';
    window.updateStaffPageRoute?.('patient-demo', 'nav-patient-demo');
    window.dispatchStaffPageChanged?.('patient-demo');
    loadStatus();
};

window.openPatientDemo = async function openPatientDemo() {
    const button = document.getElementById('patient-demo-open-btn');
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    if (button) button.disabled = true;
    try {
        assertDoctor();
        const data = await request('/api/patient-demo/sessions', { method: 'POST', body: '{}' });
        if (popup) popup.location.replace(data.launchUrl);
        else throw new Error('Popup diblokir browser. Izinkan popup untuk membuka portal dummy.');
        await loadStatus();
    } catch (error) {
        if (popup) popup.close();
        window.Swal?.fire('Portal dummy tidak dapat dibuka', error.message, 'error');
    } finally {
        if (button) button.disabled = false;
    }
};

window.resetPatientDemo = async function resetPatientDemo() {
    assertDoctor();
    const confirmation = await window.Swal.fire({
        title: 'Reset seluruh data dummy?',
        text: 'Perubahan sandbox akan dihapus dan semua sesi dummy aktif langsung dicabut.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, reset data dummy',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#dc3545'
    });
    if (!confirmation.isConfirmed) return;
    const button = document.getElementById('patient-demo-reset-btn');
    if (button) button.disabled = true;
    try {
        const data = await request('/api/patient-demo/reset', { method: 'POST', body: '{}' });
        await window.Swal.fire('Data dummy direset', data.message, 'success');
        await loadStatus();
    } catch (error) {
        await window.Swal.fire('Reset gagal', error.message, 'error');
    } finally {
        if (button) button.disabled = false;
    }
};

window.loadPatientDemoStatus = loadStatus;
