/**
 * Patients Search Page
 */

import { api } from '../api.js';
import { showToast } from '../app.js';

let searchTimeout = null;

export async function renderPatients(container) {
    container.innerHTML = `
        <div class="fade-in">
            <div class="search-bar">
                <i class="fas fa-search"></i>
                <input type="text" id="patient-search" placeholder="Cari nama, No HP, atau ID pasien..." autofocus>
            </div>
            <div id="patient-list">
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>Ketik untuk mencari pasien</p>
                </div>
            </div>
        </div>
    `;

    const searchInput = document.getElementById('patient-search');
    const listContainer = document.getElementById('patient-list');

    // Debounced search
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();

        if (query.length < 2) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>Ketik minimal 2 karakter</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Mencari...</p>
            </div>
        `;

        searchTimeout = setTimeout(() => searchPatients(query, listContainer), 300);
    });
}

async function searchPatients(query, container) {
    try {
        const response = await api.searchPatients(query);
        if (response.success) {
            const patients = response.patients || [];
            renderPatientList(container, patients);
        } else {
            throw new Error(response.message || 'Pencarian gagal');
        }
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderPatientList(container, patients) {
    if (!patients || patients.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-slash"></i>
                <p>Pasien tidak ditemukan</p>
            </div>
        `;
        return;
    }

    container.innerHTML = patients.map(patient => {
        const name = patient.full_name || patient.name || 'Unknown';
        const patientId = patient.patient_id || '-';
        const phone = patient.phone || patient.whatsapp || '-';
        const lastVisit = patient.last_visit_date ? formatDate(patient.last_visit_date) : '-';

        return `
            <div class="list-item patient-item" data-id="${patient.id}" data-patient-id="${patientId}">
                <div class="list-item-icon">
                    <i class="fas fa-user"></i>
                </div>
                <div class="list-item-content">
                    <div class="list-item-title">${name}</div>
                    <div class="list-item-subtitle">${patientId} • ${phone}</div>
                </div>
                <div class="list-item-meta">
                    <div class="list-item-time">${lastVisit}</div>
                    <i class="fas fa-chevron-right" style="color: var(--text-muted)"></i>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.patient-item').forEach(item => {
        item.addEventListener('click', () => {
            showPatientDetail(item.dataset.id);
        });
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

async function showPatientDetail(patientId) {
    // Create modal for patient detail
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>Detail Pasien</h3>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body" id="patient-detail-body">
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Memuat data...</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Load patient data
    try {
        const response = await api.getPatient(patientId);
        if (response.success && response.patient) {
            const p = response.patient;
            const bodyEl = document.getElementById('patient-detail-body');

            bodyEl.innerHTML = `
                <div class="detail-section">
                    <div class="detail-label">Nama Lengkap</div>
                    <div class="detail-value">${p.full_name || '-'}</div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">ID Pasien</div>
                    <div class="detail-value">${p.patient_id || '-'}</div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">Tanggal Lahir</div>
                    <div class="detail-value">${formatDate(p.dob) || '-'}</div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">No. Telepon</div>
                    <div class="detail-value">
                        ${p.phone || '-'}
                        ${p.phone ? `<a href="tel:${p.phone}" class="btn btn-outline" style="margin-left: 8px; padding: 4px 8px; font-size: 12px;"><i class="fas fa-phone"></i></a>` : ''}
                    </div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">WhatsApp</div>
                    <div class="detail-value">
                        ${p.whatsapp || '-'}
                        ${p.whatsapp ? `<a href="https://wa.me/${p.whatsapp.replace(/[^0-9]/g, '')}" target="_blank" class="btn btn-outline" style="margin-left: 8px; padding: 4px 8px; font-size: 12px;"><i class="fab fa-whatsapp"></i></a>` : ''}
                    </div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">Alamat</div>
                    <div class="detail-value">${p.address || '-'}</div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">Status Kehamilan</div>
                    <div class="detail-value">${p.is_pregnant ? '<span class="status-badge pending">Hamil</span>' : '<span class="status-badge waiting">Tidak Hamil</span>'}</div>
                </div>

                <div class="section-title mt-4">Riwayat Kunjungan</div>
                <div id="visit-history">
                    <div class="text-muted">Memuat...</div>
                </div>
            `;

            // Load visit history
            loadVisitHistory(patientId);
        } else {
            throw new Error(response.message || 'Gagal memuat data');
        }
    } catch (error) {
        document.getElementById('patient-detail-body').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message}</p>
            </div>
        `;
    }
}

async function loadVisitHistory(patientId) {
    const container = document.getElementById('visit-history');
    if (!container) return;

    try {
        const response = await api.getPatientVisits(patientId);
        if (response.success) {
            const visits = response.visits || [];
            if (visits.length === 0) {
                container.innerHTML = '<div class="text-muted">Belum ada kunjungan</div>';
                return;
            }

            container.innerHTML = visits.slice(0, 5).map(visit => `
                <div class="card" style="margin-bottom: 8px; padding: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 500;">${visit.mr_id || '-'}</div>
                            <div class="text-muted" style="font-size: 12px;">${formatDate(visit.visit_date || visit.created_at)}</div>
                        </div>
                        <span class="status-badge ${visit.status === 'finalized' ? 'done' : 'pending'}">${visit.status || 'draft'}</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        container.innerHTML = '<div class="text-muted">Gagal memuat riwayat</div>';
    }
}
