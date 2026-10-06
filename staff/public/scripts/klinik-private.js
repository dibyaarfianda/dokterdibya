const API_BASE = '/api/sunday-appointments';
const state = {
    appointments: [],
    isLoading: false,
    realtimeBound: false,
    realtimeRetryCount: 0
};

// Expose state globally for WebView onclick handlers
window._klinikPrivateState = state;

const clinics = [
    { key: 'weekend', prefix: 'weekend-clinic', dayOfWeek: 6, name: 'Weekend Clinic', appointments: [], elements: {} },
    { key: 'sunday', prefix: 'klinik-private', dayOfWeek: 0, name: 'Sunday Clinic', appointments: [], elements: {} }
];
let hasInitialized = false;
let loadSequence = 0;

function ensureElements() {
    if (hasInitialized) return;
    for (const clinic of clinics) {
        const suffixes = { dateLabel: 'date-label', countBadge: 'count', refreshBtn: 'refresh-btn',
            loading: 'loading', tableWrapper: 'table-wrapper', tbody: 'tbody', emptyState: 'empty', errorBox: 'error' };
        for (const [key, suffix] of Object.entries(suffixes)) {
            clinic.elements[key] = document.getElementById(`${clinic.prefix}-${suffix}`);
        }
        clinic.elements.refreshBtn?.addEventListener('click', () => loadUpcomingAppointments({ force: true }));
    }
    hasInitialized = true;
}

function getToken() {
    const token = (typeof window !== 'undefined' && typeof window.getAuthToken === 'function' ? window.getAuthToken() : '') || (typeof window !== 'undefined' && typeof window.getAuthToken === 'function' ? window.getAuthToken() : '');
    if (!token) {
        window.location.href = 'login.html';
    }
    return token;
}

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setLoading(clinic, isLoading) {
    const elements = clinic.elements;
    if (elements.loading) {
        elements.loading.classList.toggle('d-none', !isLoading);
    }
    if (!isLoading) {
        return;
    }
    if (elements.tableWrapper) {
        elements.tableWrapper.classList.add('d-none');
    }
    if (elements.emptyState) {
        elements.emptyState.classList.add('d-none');
    }
    if (elements.errorBox) {
        elements.errorBox.classList.add('d-none');
        elements.errorBox.textContent = '';
    }
}

function setError(clinic, message) {
    const elements = clinic.elements;
    if (!elements.errorBox) return;
    elements.errorBox.textContent = message || 'Terjadi kesalahan saat memuat data.';
    elements.errorBox.classList.remove('d-none');
    if (elements.tableWrapper) {
        elements.tableWrapper.classList.add('d-none');
    }
    if (elements.emptyState) {
        elements.emptyState.classList.add('d-none');
    }
}

function showTemporaryToast(message) {
    if (!message) return;
    const toast = document.createElement('div');
    toast.className = 'dashboard-toast error visible';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 3000);
}

function setupRealtimeUpdates() {
    if (state.realtimeBound) {
        return;
    }

    if (!window.socket) {
        if (state.realtimeRetryCount < 10) {
            state.realtimeRetryCount += 1;
            window.setTimeout(setupRealtimeUpdates, 1000);
        }
        return;
    }

    const refreshAppointments = () => loadUpcomingAppointments({ force: true });

    window.socket.on('booking:new', refreshAppointments);
    window.socket.on('booking:update', refreshAppointments);
    window.socket.on('booking:cancel', refreshAppointments);

    state.realtimeBound = true;
}

function updateCount(clinic, count) {
    const elements = clinic.elements;
    if (!elements.countBadge) return;
    const suffix = count === 1 ? 'Pasien' : 'Pasien';
    elements.countBadge.textContent = `${count} ${suffix}`;
}

function formatPatientId(id) {
    if (id === null || id === undefined || id === '') {
        return '-';
    }
    return String(id).padStart(5, '0');
}

function formatAge(age) {
    if (typeof age !== 'number' || Number.isNaN(age)) {
        return '-';
    }
    return `${age} th`;
}

function getStatusMeta(status) {
    const normalized = (status || '').toLowerCase();
    const map = {
        pending: { label: 'Pending', className: 'badge-warning' },
        pending_confirmation: { label: 'Menunggu Konfirmasi', className: 'badge-warning' },
        confirmed: { label: 'Confirmed', className: 'badge-success' },
        completed: { label: 'Completed', className: 'badge-secondary' },
        cancelled: { label: 'Cancelled', className: 'badge-danger' },
        no_show: { label: 'No Show', className: 'badge-danger' }
    };
    return map[normalized] || { label: status || '-', className: 'badge-secondary' };
}

function renderAppointments(clinic, appointments) {
    const elements = clinic.elements;
    if (!elements.tbody || !elements.tableWrapper || !elements.emptyState) {
        return;
    }

    elements.tbody.innerHTML = '';

    if (!appointments || appointments.length === 0) {
        elements.emptyState.querySelector?.('p')?.replaceChildren('Belum ada pasien yang terjadwal');
        elements.tableWrapper.classList.add('d-none');
        elements.emptyState.classList.remove('d-none');
        updateCount(clinic, 0);
        return;
    }

    elements.tableWrapper.classList.remove('d-none');
    elements.emptyState.classList.add('d-none');

    appointments.forEach(appointment => {
        const tr = document.createElement('tr');
        // Format slot time for first column
        const time = appointment.time || '-';
        const slotNumber = appointment.slot_number || '-';
        const slotBadge = `<span class="badge badge-info">${escapeHtml(time)}</span><div class="small text-muted mt-1">Slot ${slotNumber}</div>`;

        // Format session info for name column
        const sessionLabel = appointment.sessionLabel || '';
        const infoLine = sessionLabel ? `<div class="small text-muted">${escapeHtml(sessionLabel)}</div>` : '';

        // Category badge
        const categoryBadges = {
            'obstetri': '<span class="badge badge-info">Obstetri</span>',
            'gyn_repro': '<span class="badge badge-success">Reproduksi</span>',
            'gyn_special': '<span class="badge badge-warning">Ginekologi</span>'
        };
        const categoryBadge = categoryBadges[appointment.consultation_category] || '<span class="badge badge-secondary">-</span>';

        const complaint = appointment.chief_complaint ? escapeHtml(appointment.chief_complaint) : '-';
        const statusMeta = getStatusMeta(appointment.status);
        const statusBadge = `<span class="badge ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>`;
        const isPendingConfirmation = (appointment.status || '').toLowerCase() === 'pending_confirmation';
        const confirmationAlreadySent = Boolean(appointment.confirmation_popup_enabled_at);
        const confirmationButton = isPendingConfirmation ? `
                <button type="button" class="btn btn-sm btn-${confirmationAlreadySent ? 'success' : 'warning'} klinik-private-popup-btn ml-1" onclick="window.handleKlinikConfirmationPopup && window.handleKlinikConfirmationPopup(${Number(appointment.id)})" title="${confirmationAlreadySent ? 'Kirim ulang popup konfirmasi' : 'Kirim popup konfirmasi ke pasien'}">
                    <i class="fas fa-${confirmationAlreadySent ? 'bell-slash' : 'bell'} mr-1"></i>Popup
                </button>
            ` : '';

        // Check if patient has completed examination
        const isSelesai = (appointment.status || '').toLowerCase() === 'completed';
        const selesaiClass = isSelesai ? 'patient-selesai' : '';

        tr.innerHTML = `
            <td class="text-center">${slotBadge}</td>
            <td>
                <div class="font-weight-bold ${selesaiClass}">${escapeHtml(appointment.patient_name || '-')}</div>
                ${infoLine}
            </td>
            <td>${formatAge(appointment.patientAge)}</td>
            <td>${categoryBadge}</td>
            <td class="complaint-cell">${complaint}</td>
            <td>${statusBadge}</td>
            <td class="text-center">
                <button type="button" class="btn btn-sm btn-primary klinik-private-periksa-btn" onclick="window.handleKlinikPeriksa && window.handleKlinikPeriksa(${Number(appointment.id)})">
                    <i class="fas fa-stethoscope mr-1"></i>Periksa
                </button>
                ${confirmationButton}
            </td>
        `;

        elements.tbody.appendChild(tr);
    });

    updateCount(clinic, appointments.length);
}

async function handlePeriksa(appointment) {
    if (!appointment || !appointment.patient_id) {
        return;
    }

    // Show category selection modal
    showCategoryModal(appointment);
}

// Expose appointment-ID actions globally for WebView onclick handlers
window.handleKlinikPeriksa = function(id) {
    const appointment = state.appointments.find(apt => String(apt.id) === String(id));
    if (appointment) {
        handlePeriksa(appointment);
    }
};

window.handleKlinikConfirmationPopup = async function(id) {
    const appointment = state.appointments.find(apt => String(apt.id) === String(id));
    if (!appointment) return;

    if ((appointment.status || '').toLowerCase() !== 'pending_confirmation') {
        showTemporaryToast('Popup hanya untuk pasien yang masih menunggu konfirmasi.');
        return;
    }

    if (!confirm(`Kirim popup konfirmasi kehadiran untuk ${appointment.patient_name || 'pasien ini'}?\n\nPopup akan muncul saat pasien membuka portal pasien.`)) {
        return;
    }

    try {
        const token = getToken();
        const response = await fetch(`${API_BASE}/${appointment.id}/trigger-confirmation-popup`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Gagal mengirim popup konfirmasi');
        }

        if (typeof window.showToast === 'function') {
            window.showToast('success', data.message || 'Popup konfirmasi dikirim');
        } else {
            showTemporaryToast(data.message || 'Popup konfirmasi dikirim');
        }

        await loadUpcomingAppointments({ force: true });
    } catch (error) {
        console.error('Klinik Private: gagal mengirim popup konfirmasi', error);
        showTemporaryToast(error.message || 'Gagal mengirim popup konfirmasi.');
    }
};

function showCategoryModal(appointment) {
    // Remove existing modal if any
    const existingModal = document.getElementById('category-select-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const defaultCategory = appointment.consultation_category || 'obstetri';

    const modalHtml = `
        <div class="modal fade" id="category-select-modal" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-dialog-centered" role="document">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-stethoscope mr-2"></i>Pilih Kategori Konsultasi
                        </h5>
                        <button type="button" class="close text-white" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <p class="mb-3">Pasien: <strong>${escapeHtml(appointment.patient_name || '-')}</strong></p>
                        <div class="category-options">
                            <label class="category-option d-block mb-2">
                                <input type="radio" name="mr_category" value="obstetri" ${defaultCategory === 'obstetri' ? 'checked' : ''}>
                                <span class="ml-2"><i class="fas fa-baby text-info mr-1"></i> <strong>Obstetri</strong> - Kehamilan & Persalinan</span>
                            </label>
                            <label class="category-option d-block mb-2">
                                <input type="radio" name="mr_category" value="gyn_repro" ${defaultCategory === 'gyn_repro' ? 'checked' : ''}>
                                <span class="ml-2"><i class="fas fa-venus text-success mr-1"></i> <strong>Ginekologi Reproduksi</strong> - Program Hamil, KB</span>
                            </label>
                            <label class="category-option d-block mb-2">
                                <input type="radio" name="mr_category" value="gyn_special" ${defaultCategory === 'gyn_special' ? 'checked' : ''}>
                                <span class="ml-2"><i class="fas fa-microscope text-warning mr-1"></i> <strong>Ginekologi Khusus</strong> - Kista, Miom, dll</span>
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Batal</button>
                        <button type="button" class="btn btn-primary" id="btn-start-with-category">
                            <i class="fas fa-check mr-1"></i>Mulai Konsultasi
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = $('#category-select-modal');
    modal.modal('show');

    document.getElementById('btn-start-with-category').addEventListener('click', async () => {
        const selectedCategory = document.querySelector('input[name="mr_category"]:checked').value;
        modal.modal('hide');
        await startClinicRecord(appointment, selectedCategory);
    });

    modal.on('hidden.bs.modal', function() {
        this.remove();
    });
}

async function startClinicRecord(appointment, category) {
    try {
        const token = getToken();
        if (!token) {
            return;
        }

        const response = await fetch(`${API_BASE}/${appointment.id}/start-clinic-record`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ category: category })
        });

        if (!response.ok) {
            throw new Error('Gagal memulai rekam medis Klinik Private');
        }

        const payload = await response.json();
        const record = payload && payload.record ? payload.record : null;
        if (!record || !record.mrId || !record.folderPath) {
            throw new Error('Data rekam medis tidak lengkap');
        }

        try {
            const { updateSessionPatient } = await import('./session-manager.js');
            updateSessionPatient({
                id: appointment.patient_id,
                patientId: appointment.patient_id,
                name: appointment.patient_name,
                whatsapp: appointment.patient_phone || '-',
                age: appointment.patientAge || null,
                sundayClinic: {
                    mrId: record.mrId,
                    appointmentId: record.appointmentId,
                    status: record.status
                }
            });
        } catch (error) {
            console.warn('Unable to update session for patient:', error);
        }

        const mrSlug = record.mrId ? String(record.mrId).toLowerCase() : null;
        const targetUrl = mrSlug
            ? (window.buildSundayClinicAppUrl
                ? window.buildSundayClinicAppUrl(mrSlug, 'identitas')
                : `/staff/public/index-adminlte.html?page=sunday-clinic&mr=${encodeURIComponent(mrSlug)}&section=identitas`)
            : `/${record.folderPath}/identitas/index.html`;

        if (mrSlug && typeof window.showSundayClinicPage === 'function') {
            if (targetUrl) {
                window.history.pushState({}, '', targetUrl);
            }
            await window.showSundayClinicPage({
                mrId: mrSlug,
                section: 'identitas',
                appointmentId: record.appointmentId || appointment.id,
                location: 'klinik_private'
            });
            return;
        }

        window.location.href = targetUrl;

    } catch (error) {
        console.error('Klinik Private: gagal memulai rekam medis', error);
        showTemporaryToast('Gagal membuka rekam medis Klinik Private.');
    }
}

function filterAndSortAppointments(appointments) {
    if (!Array.isArray(appointments)) {
        return [];
    }

    return appointments
        .filter(apt => {
            const status = (apt.status || '').toLowerCase();
            return status === 'pending' || status === 'pending_confirmation' || status === 'confirmed' || status === 'completed';
        })
        .sort((a, b) => {
            const sessionDiff = (a.session || 0) - (b.session || 0);
            if (sessionDiff !== 0) return sessionDiff;
            return (a.slot_number || 0) - (b.slot_number || 0);
        });
}

async function loadUpcomingAppointments({ force = false } = {}) {
    ensureElements();
    const token = getToken();
    if (!token || (state.isLoading && !force)) return;
    const sequence = ++loadSequence;
    state.isLoading = true;
    clinics.forEach(clinic => {
        clinic.appointments = [];
        setLoading(clinic, true);
        updateCount(clinic, 0);
    });
    state.appointments = [];
    const options = { headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }, cache: 'no-store' };
    try {
        const response = await fetch(`${API_BASE}/practice-dates?_t=${Date.now()}`, options);
        if (response.status === 401) window.location.href = 'login.html';
        if (!response.ok) throw new Error('Gagal memuat tanggal praktik');
        const payload = await response.json();
        if (sequence !== loadSequence) return;
        if (!Array.isArray(payload.practices)) throw new Error('Tanggal praktik belum termuat');
        await Promise.all(clinics.map(async clinic => {
            const practices = payload.practices.filter(p => p.dayOfWeek === clinic.dayOfWeek && p.date)
                .sort((a, b) => a.date.localeCompare(b.date));
            const first = practices[0];
            if (clinic.elements.dateLabel) clinic.elements.dateLabel.textContent = first?.formatted || 'Jadwal belum tersedia';
            if (!first) {
                renderAppointments(clinic, []);
                if (clinic.elements.emptyState) clinic.elements.emptyState.querySelector?.('p')?.replaceChildren('Sesi belum aktif atau jadwal tidak tersedia');
                setLoading(clinic, false);
                return;
            }
            try {
                const results = await Promise.all(practices.filter(p => p.date === first.date).map(async practice => {
                    const result = await fetch(`${API_BASE}/list?date=${practice.date}&session=${practice.session}&_t=${Date.now()}`, options);
                    if (result.status === 401) window.location.href = 'login.html';
                    if (!result.ok) throw new Error(`Gagal memuat pasien ${clinic.name}`);
                    const data = await result.json();
                    if (!Array.isArray(data.appointments)) throw new Error(`Data pasien ${clinic.name} belum termuat`);
                    return data.appointments;
                }));
                if (sequence !== loadSequence) return;
                clinic.appointments = filterAndSortAppointments(results.flat());
                state.appointments = clinics.flatMap(c => c.appointments);
                renderAppointments(clinic, clinic.appointments);
            } catch (error) {
                if (sequence !== loadSequence) return;
                setError(clinic, error.message);
            } finally {
                if (sequence === loadSequence) setLoading(clinic, false);
            }
        }));
    } catch (error) {
        if (sequence !== loadSequence) return;
        clinics.forEach(clinic => {
            if (clinic.elements.dateLabel) clinic.elements.dateLabel.textContent = '-';
            setError(clinic, error.message || 'Gagal memuat daftar pasien');
            setLoading(clinic, false);
        });
    } finally {
        if (sequence === loadSequence) state.isLoading = false;
    }
}

async function loadRecentPatients() {
    const loadingEl = document.getElementById('sunday-clinic-patients-loading');
    const listEl = document.getElementById('sunday-clinic-patients-list');
    const errorEl = document.getElementById('sunday-clinic-patients-error');
    const tbody = document.getElementById('sunday-clinic-patients-tbody');

    if (!tbody) return;

    try {
        // Show loading
        if (loadingEl) loadingEl.classList.remove('d-none');
        if (listEl) listEl.classList.add('d-none');
        if (errorEl) errorEl.classList.add('d-none');

        const token = getToken();
        const response = await fetch(`/api/sunday-clinic/directory?_=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch Sunday Clinic patients');
        }

        const result = await response.json();
        const patients = result.success && result.data && result.data.patients ? result.data.patients : [];

        // Get last 10 patients with their most recent visit
        const recentPatients = patients.slice(0, 10).map(patient => {
            const latestVisit = patient.visits && patient.visits.length > 0 ? patient.visits[0] : null;
            return {
                mrId: latestVisit ? latestVisit.mrId : null,
                fullName: patient.fullName,
                appointmentDate: latestVisit ? latestVisit.appointmentDate : null
            };
        }).filter(p => p.mrId); // Only show patients with MR ID

        // Render patients
        tbody.innerHTML = recentPatients.map(patient => {
            const lastVisit = patient.appointmentDate ? new Date(patient.appointmentDate).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }) : '-';

            return `
                <tr>
                    <td><strong>${patient.mrId}</strong></td>
                    <td>${patient.fullName || '-'}</td>
                    <td>${lastVisit}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="window.openSundayClinicWithMrId('${patient.mrId}')">
                            <i class="fas fa-folder-open"></i> Buka
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Show list
        if (loadingEl) loadingEl.classList.add('d-none');
        if (listEl) listEl.classList.remove('d-none');

    } catch (error) {
        console.error('Error loading recent patients:', error);
        if (loadingEl) loadingEl.classList.add('d-none');
        if (errorEl) errorEl.classList.remove('d-none');
    }
}

export function initKlinikPrivatePage() {
    ensureElements();
    setupRealtimeUpdates();
    loadUpcomingAppointments();
    loadRecentPatients();
}

window.klinikPrivate = {
    reload: () => loadUpcomingAppointments({ force: true })
};
