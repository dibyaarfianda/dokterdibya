/**
 * Sunday Clinic - WebView Wrapper
 * Opens the existing web Sunday Clinic in an iframe/webview
 */

import { api } from '../api.js';
import { showToast } from '../app.js';

export async function renderSundayClinic(container) {
    container.innerHTML = `
        <div class="sunday-clinic-wrapper fade-in">
            <!-- Mode Tabs -->
            <div class="mode-tabs">
                <button class="tab-btn active" data-mode="queue">
                    <i class="fas fa-clipboard-list"></i> Antrian
                </button>
                <button class="tab-btn" data-mode="search">
                    <i class="fas fa-search"></i> Cari
                </button>
            </div>

            <!-- Queue Mode -->
            <div id="queue-mode" class="mode-content">
                <div id="queue-list" class="list-container">
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Memuat antrian...</p>
                    </div>
                </div>
            </div>

            <!-- Search Mode -->
            <div id="search-mode" class="mode-content" style="display:none">
                <div class="search-bar">
                    <i class="fas fa-search"></i>
                    <input type="text" id="patient-search" placeholder="Nama, No. HP, atau MR ID...">
                </div>
                <div id="search-results" class="list-container">
                    <div class="empty-state">
                        <i class="fas fa-user-md"></i>
                        <p>Ketik minimal 2 karakter</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    injectStyles();

    // Tab switching
    const tabBtns = container.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.mode;
            document.getElementById('queue-mode').style.display = mode === 'queue' ? 'block' : 'none';
            document.getElementById('search-mode').style.display = mode === 'search' ? 'block' : 'none';
            if (mode === 'search') document.getElementById('patient-search').focus();
        });
    });

    // Search
    const searchInput = document.getElementById('patient-search');
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();
        if (query.length < 2) {
            document.getElementById('search-results').innerHTML = `
                <div class="empty-state"><i class="fas fa-user-md"></i><p>Ketik minimal 2 karakter</p></div>
            `;
            return;
        }
        searchTimeout = setTimeout(() => searchPatients(query), 300);
    });

    await loadQueue();
}

async function loadQueue() {
    const listContainer = document.getElementById('queue-list');
    try {
        const response = await api.getTodayQueue();
        const queue = response.data?.queue || response.queue || [];

        if (queue.length === 0) {
            listContainer.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-check"></i><p>Tidak ada antrian hari ini</p></div>`;
            return;
        }

        listContainer.innerHTML = queue.map(item => `
            <div class="list-item" data-mr="${item.mr_id || ''}" data-patient="${item.patient_id}">
                <div class="item-icon"><i class="fas fa-user"></i></div>
                <div class="item-content">
                    <div class="item-title">${item.patient_name || 'Pasien'}</div>
                    <div class="item-subtitle">${item.mr_id || ''} ${item.chief_complaint ? '• ' + item.chief_complaint.substring(0, 25) : ''}</div>
                </div>
                <div class="item-meta">
                    <span class="item-time">${(item.slot_time || '').substring(0, 5)}</span>
                </div>
            </div>
        `).join('');

        listContainer.querySelectorAll('.list-item').forEach(item => {
            item.addEventListener('click', () => {
                const mrId = item.dataset.mr;
                if (mrId) {
                    openWebSundayClinic(mrId);
                } else {
                    showToast('Pasien belum ada MR', 'warning');
                }
            });
        });
    } catch (error) {
        listContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${error.message}</p></div>`;
    }
}

async function searchPatients(query) {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i></div>`;

    try {
        const response = await api.searchPatients(query);
        const patients = response.data?.patients || response.patients || [];

        if (patients.length === 0) {
            resultsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-user-slash"></i><p>Tidak ditemukan</p></div>`;
            return;
        }

        resultsContainer.innerHTML = patients.map(p => `
            <div class="list-item" data-id="${p.id}">
                <div class="item-icon"><i class="fas fa-user"></i></div>
                <div class="item-content">
                    <div class="item-title">${p.full_name || p.name}</div>
                    <div class="item-subtitle">${p.id} ${p.phone ? '• ' + p.phone : ''}</div>
                </div>
                <div class="item-meta"><i class="fas fa-chevron-right"></i></div>
            </div>
        `).join('');

        resultsContainer.querySelectorAll('.list-item').forEach(item => {
            item.addEventListener('click', () => showPatientVisits(item.dataset.id, item.querySelector('.item-title').textContent));
        });
    } catch (error) {
        resultsContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${error.message}</p></div>`;
    }
}

async function showPatientVisits(patientId, patientName) {
    try {
        const response = await api.getPatientVisits(patientId);
        const visits = response.data?.visits || response.visits || [];

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-sheet">
                <div class="modal-header">
                    <h3>${patientName}</h3>
                    <button class="modal-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    ${visits.length === 0 ? '<p class="empty-text">Belum ada kunjungan</p>' :
                        visits.map(v => `
                            <div class="visit-item" data-mr="${v.mr_id}">
                                <span class="visit-mr">${v.mr_id}</span>
                                <span class="visit-date">${formatDate(v.created_at)}</span>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        modal.querySelectorAll('.visit-item').forEach(item => {
            item.addEventListener('click', () => {
                modal.remove();
                openWebSundayClinic(item.dataset.mr);
            });
        });
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function openWebSundayClinic(mrId) {
    // Open the existing web Sunday Clinic page
    // Add ?mobile=1 to trigger mobile-friendly mode (hide sidebar, show footer nav)
    // Add timestamp _t to bypass browser cache
    const url = `https://dokterdibya.com/staff/public/sunday-clinic.html?mr=${mrId}&mobile=1&_t=${Date.now()}`;

    // Open in same webview (full replacement)
    window.location.href = url;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function injectStyles() {
    if (document.getElementById('sc-styles')) return;
    const style = document.createElement('style');
    style.id = 'sc-styles';
    style.textContent = `
        .sunday-clinic-wrapper { padding-bottom: 70px; }
        .mode-tabs { display: flex; gap: 8px; padding: 16px; }
        .mode-tabs .tab-btn {
            flex: 1; padding: 12px; border: none; border-radius: 12px;
            background: var(--color-bg-secondary); color: var(--color-text-secondary);
            font-size: 14px; font-weight: 500; display: flex; align-items: center;
            justify-content: center; gap: 8px;
        }
        .mode-tabs .tab-btn.active { background: var(--color-primary); color: white; }
        .mode-content { padding: 0 16px 16px; }
        .loading-state, .empty-state { padding: 40px; text-align: center; color: var(--color-text-secondary); }
        .loading-state i, .empty-state i { font-size: 32px; margin-bottom: 12px; opacity: 0.5; }
        .visit-item {
            display: flex; justify-content: space-between; padding: 14px;
            background: var(--color-bg-secondary); border-radius: 10px; margin-bottom: 8px; cursor: pointer;
        }
        .visit-mr { font-weight: 600; color: var(--color-primary); }
        .visit-date { color: var(--color-text-secondary); font-size: 13px; }
        .empty-text { text-align: center; color: var(--color-text-secondary); padding: 20px; }
    `;
    document.head.appendChild(style);
}
