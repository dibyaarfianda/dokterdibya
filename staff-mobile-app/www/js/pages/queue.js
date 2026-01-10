/**
 * Queue Page - Today's Appointments
 */

import { api } from '../api.js';
import { showToast } from '../app.js';

const STATUS_LABELS = {
    'booked': 'Menunggu',
    'arrived': 'Hadir',
    'in_progress': 'Sedang',
    'done': 'Selesai',
    'cancelled': 'Batal',
    'no_show': 'Tidak Hadir'
};

const STATUS_CLASSES = {
    'booked': 'waiting',
    'arrived': 'pending',
    'in_progress': 'in-progress',
    'done': 'done',
    'cancelled': 'cancelled',
    'no_show': 'cancelled'
};

function formatTime(timeStr) {
    if (!timeStr) return '-';
    // Handle HH:MM:SS or HH:MM format
    return timeStr.substring(0, 5);
}

export async function renderQueue(container) {
    container.innerHTML = `
        <div class="fade-in">
            <div class="search-bar">
                <i class="fas fa-search"></i>
                <input type="text" id="queue-search" placeholder="Cari nama pasien...">
            </div>
            <div id="queue-list">
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Memuat antrian...</p>
                </div>
            </div>
        </div>
    `;

    const searchInput = document.getElementById('queue-search');
    const listContainer = document.getElementById('queue-list');
    let allQueue = [];

    // Search filter
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        renderQueueList(listContainer, allQueue.filter(item =>
            item.patient_name?.toLowerCase().includes(query) ||
            item.patient_id?.toLowerCase().includes(query)
        ));
    });

    // Load queue
    try {
        const response = await api.getTodayQueue();
        if (response.success) {
            allQueue = response.queue || [];
            renderQueueList(listContainer, allQueue);
        } else {
            throw new Error(response.message || 'Gagal memuat antrian');
        }
    } catch (error) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderQueueList(container, queue) {
    if (!queue || queue.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-calendar-check"></i>
                <p>Tidak ada antrian hari ini</p>
            </div>
        `;
        return;
    }

    // Sort by time
    queue.sort((a, b) => {
        const timeA = a.appointment_time || a.time || '99:99';
        const timeB = b.appointment_time || b.time || '99:99';
        return timeA.localeCompare(timeB);
    });

    container.innerHTML = queue.map(item => {
        const status = item.status || 'booked';
        const statusLabel = STATUS_LABELS[status] || status;
        const statusClass = STATUS_CLASSES[status] || 'waiting';
        const time = formatTime(item.appointment_time || item.time);
        const patientName = item.patient_name || 'Unknown';
        const patientId = item.patient_id || '-';
        const mrId = item.mr_id || '-';

        return `
            <div class="list-item queue-item" data-id="${item.id}" data-mr="${mrId}">
                <div class="list-item-icon">
                    <i class="fas fa-user"></i>
                </div>
                <div class="list-item-content">
                    <div class="list-item-title">${patientName}</div>
                    <div class="list-item-subtitle">${patientId} ${mrId !== '-' ? '• ' + mrId : ''}</div>
                </div>
                <div class="list-item-meta">
                    <div class="list-item-time">${time}</div>
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.queue-item').forEach(item => {
        item.addEventListener('click', () => {
            showQueueDetail(item.dataset.id, item.dataset.mr);
        });
    });
}

async function showQueueDetail(appointmentId, mrId) {
    // Simple status update modal
    const statuses = [
        { value: 'booked', label: 'Menunggu' },
        { value: 'arrived', label: 'Hadir' },
        { value: 'in_progress', label: 'Sedang Periksa' },
        { value: 'done', label: 'Selesai' },
        { value: 'cancelled', label: 'Batal' }
    ];

    const statusOptions = statuses.map(s =>
        `<button class="btn btn-outline btn-block mb-2" data-status="${s.value}">${s.label}</button>`
    ).join('');

    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Update Status</h3>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                ${statusOptions}
            </div>
        </div>
    `;

    // Add modal styles if not exist
    if (!document.getElementById('modal-styles')) {
        const style = document.createElement('style');
        style.id = 'modal-styles';
        style.textContent = `
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.7);
                display: flex;
                align-items: flex-end;
                z-index: 1000;
                animation: fadeIn 0.2s ease;
            }
            .modal-content {
                width: 100%;
                background: var(--bg-secondary);
                border-radius: 20px 20px 0 0;
                padding: 20px;
                padding-bottom: calc(20px + var(--safe-area-bottom));
                animation: slideUp 0.3s ease;
            }
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }
            .modal-header h3 {
                font-size: 18px;
                font-weight: 600;
            }
            .modal-close {
                width: 32px;
                height: 32px;
                background: var(--bg-card);
                border: none;
                border-radius: 8px;
                color: var(--text-secondary);
                cursor: pointer;
            }
            @keyframes slideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(modal);

    // Close handler
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Status button handlers
    modal.querySelectorAll('[data-status]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const newStatus = btn.dataset.status;
            try {
                const response = await api.updateAppointmentStatus(appointmentId, newStatus);
                if (response.success) {
                    showToast('Status diperbarui');
                    modal.remove();
                    // Reload queue
                    const container = document.getElementById('page-container');
                    const { renderQueue } = await import('./queue.js');
                    renderQueue(container);
                } else {
                    throw new Error(response.message);
                }
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    });
}
