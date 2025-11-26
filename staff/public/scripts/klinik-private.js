const API_BASE = '/api/sunday-appointments';
const state = {
    appointments: [],
    selectedDate: null,
    isLoading: false
};

const elements = {
    dateLabel: null,
    countBadge: null,
    refreshBtn: null,
    loading: null,
    tableWrapper: null,
    tbody: null,
    emptyState: null,
    errorBox: null
};

let hasInitialized = false;

function ensureElements() {
    if (hasInitialized) {
        return;
    }

    elements.dateLabel = document.getElementById('klinik-private-date-label');
    elements.countBadge = document.getElementById('klinik-private-count');
    elements.refreshBtn = document.getElementById('klinik-private-refresh-btn');
    elements.loading = document.getElementById('klinik-private-loading');
    elements.tableWrapper = document.getElementById('klinik-private-table-wrapper');
    elements.tbody = document.getElementById('klinik-private-tbody');
    elements.emptyState = document.getElementById('klinik-private-empty');
    elements.errorBox = document.getElementById('klinik-private-error');

    if (elements.refreshBtn) {
        elements.refreshBtn.addEventListener('click', () => {
            loadUpcomingAppointments({ force: true });
        });
    }

    hasInitialized = true;
}

function getToken() {
    const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
    if (!token) {
        window.location.href = 'login.html';
    }
    return token;
}

function getUpcomingSunday(reference = new Date()) {
    const base = new Date(reference.getTime());
    const day = base.getDay();
    let daysAhead = (7 - day) % 7;

    // If today is Sunday and it's before 9 PM, show today's Sunday
    if (daysAhead === 0) {
        const currentHour = base.getHours();
        // If it's after 9 PM on Sunday, show next Sunday
        if (currentHour >= 21) {
            daysAhead = 7;
        }
        // Otherwise show today (daysAhead = 0)
    }

    base.setDate(base.getDate() + daysAhead);
    base.setHours(0, 0, 0, 0);
    return base;
}

function formatDateIso(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateLabel(date) {
    return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
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

function setLoading(isLoading) {
    state.isLoading = isLoading;
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

function setError(message) {
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

function updateCount(count) {
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
        confirmed: { label: 'Confirmed', className: 'badge-success' },
        completed: { label: 'Completed', className: 'badge-secondary' },
        cancelled: { label: 'Cancelled', className: 'badge-danger' },
        no_show: { label: 'No Show', className: 'badge-danger' }
    };
    return map[normalized] || { label: status || '-', className: 'badge-secondary' };
}

function renderAppointments(appointments) {
    if (!elements.tbody || !elements.tableWrapper || !elements.emptyState) {
        return;
    }

    elements.tbody.innerHTML = '';

    if (!appointments || appointments.length === 0) {
        elements.tableWrapper.classList.add('d-none');
        elements.emptyState.classList.remove('d-none');
        updateCount(0);
        return;
    }

    elements.tableWrapper.classList.remove('d-none');
    elements.emptyState.classList.add('d-none');

    appointments.forEach(appointment => {
        const tr = document.createElement('tr');
        const patientIdBadge = `<span class="badge badge-secondary">${formatPatientId(appointment.patient_id)}</span>`;

        const infoParts = [];
        if (appointment.time) {
            infoParts.push(`${escapeHtml(appointment.time)} WIB`);
        }
        if (appointment.sessionLabel) {
            infoParts.push(escapeHtml(appointment.sessionLabel));
        }
        if (Number.isFinite(Number(appointment.slot_number))) {
            infoParts.push(`Slot ${appointment.slot_number}`);
        }
        const infoLine = infoParts.length ? `<div class="small text-muted">${infoParts.join(' · ')}</div>` : '';

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

        tr.innerHTML = `
            <td>${patientIdBadge}</td>
            <td>
                <div class="font-weight-bold">${escapeHtml(appointment.patient_name || '-')}</div>
                ${infoLine}
            </td>
            <td>${formatAge(appointment.patientAge)}</td>
            <td>${categoryBadge}</td>
            <td>${complaint}</td>
            <td>${statusBadge}</td>
            <td class="text-center">
                <button type="button" class="btn btn-sm btn-primary klinik-private-periksa-btn">
                    <i class="fas fa-stethoscope mr-1"></i>Periksa
                </button>
            </td>
        `;

        const actionBtn = tr.querySelector('.klinik-private-periksa-btn');
        actionBtn.addEventListener('click', () => handlePeriksa(appointment));

        elements.tbody.appendChild(tr);
    });

    updateCount(appointments.length);
}

async function handlePeriksa(appointment) {
    if (!appointment || !appointment.patient_id) {
        return;
    }

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
            }
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
            ? `/sunday-clinic/${mrSlug}/identitas`
            : `/${record.folderPath}/identitas/index.html`;
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
            return status === 'pending' || status === 'confirmed';
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
    if (!token) {
        return;
    }

    if (state.isLoading && !force) {
        return;
    }

    const upcomingSunday = getUpcomingSunday();
    state.selectedDate = upcomingSunday;

    if (elements.dateLabel) {
        elements.dateLabel.textContent = formatDateLabel(upcomingSunday);
    }

    setLoading(true);

    try {
        const response = await fetch(`${API_BASE}/list?date=${formatDateIso(upcomingSunday)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = 'login.html';
                return;
            }
            throw new Error('Gagal memuat data daftar pasien');
        }

        const payload = await response.json();
        const appointments = filterAndSortAppointments(payload.appointments);
        state.appointments = appointments;

        if (elements.errorBox) {
            elements.errorBox.classList.add('d-none');
            elements.errorBox.textContent = '';
        }

        renderAppointments(appointments);
    } catch (error) {
        console.error('Klinik Private: gagal memuat data', error);
        setError(error.message || 'Gagal memuat daftar pasien.');
        updateCount(0);
    } finally {
        setLoading(false);
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
    loadUpcomingAppointments();
    loadRecentPatients();
}

window.klinikPrivate = {
    reload: () => loadUpcomingAppointments({ force: true })
};
