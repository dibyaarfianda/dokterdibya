import { initAuth, getIdToken } from './vps-auth-v2.js';

const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://dokterdibya.com/api';

let socket = null;
let currentUser = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize auth and wait for user
        currentUser = await initAuth();
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }

        // Initialize Socket.io
        const socketUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3000' 
            : 'https://dokterdibya.com';
        socket = io(socketUrl);

        socket.on('connect', () => {
            console.log('Socket connected for announcements');
        });

        // Load announcements
        await loadAnnouncements();

        // Event listeners
        setupEventListeners();
    } catch (error) {
        console.error('Initialization error:', error);
        showAlert('error', 'Gagal menginisialisasi halaman');
    }
});

function setupEventListeners() {
    // Logout
    document.getElementById('btn-logout').addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const { signOut } = await import('./vps-auth-v2.js');
            await signOut();
            window.location.href = 'login.html';
        } catch (err) {
            console.error('Logout error:', err);
            window.location.href = 'login.html';
        }
    });

    // New announcement button
    document.getElementById('btn-new-announcement').addEventListener('click', () => {
        openModal();
    });

    // Save button
    document.getElementById('btn-save').addEventListener('click', async () => {
        await saveAnnouncement();
    });
}

async function loadAnnouncements() {
    try {
        const token = await getIdToken();
        const response = await fetch(`${API_URL}/announcements`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load announcements');
        }

        const data = await response.json();
        displayAnnouncements(data.data || []);
    } catch (error) {
        console.error('Error loading announcements:', error);
        showAlert('error', 'Gagal memuat pengumuman');
    }
}

function displayAnnouncements(announcements) {
    const container = document.getElementById('announcements-container');
    
    if (announcements.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Belum ada pengumuman. Klik "Buat Pengumuman Baru" untuk membuat pengumuman pertama.
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = announcements.map(announcement => `
        <div class="col-md-6 col-lg-4 mb-4">
            <div class="card announcement-card h-100">
                <div class="card-header bg-${getPriorityColor(announcement.priority)}">
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="badge badge-light priority-badge">
                            ${getPriorityLabel(announcement.priority)}
                        </span>
                        <span class="badge badge-${announcement.status === 'active' ? 'success' : 'secondary'}">
                            ${announcement.status === 'active' ? 'Aktif' : 'Tidak Aktif'}
                        </span>
                    </div>
                </div>
                <div class="card-body">
                    <h5 class="card-title">${escapeHtml(announcement.title)}</h5>
                    <p class="card-text announcement-preview text-muted">
                        ${escapeHtml(announcement.message)}
                    </p>
                    <small class="text-muted">
                        <i class="far fa-clock"></i> ${formatDate(announcement.created_at)}
                    </small>
                </div>
                <div class="card-footer bg-transparent">
                    <button class="btn btn-sm btn-primary" onclick="editAnnouncement(${announcement.id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement(${announcement.id}, '${escapeHtml(announcement.title)}')">
                        <i class="fas fa-trash"></i> Hapus
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function getPriorityColor(priority) {
    switch (priority) {
        case 'urgent': return 'danger';
        case 'important': return 'warning';
        default: return 'info';
    }
}

function getPriorityLabel(priority) {
    switch (priority) {
        case 'urgent': return '🔴 Mendesak';
        case 'important': return '🟡 Penting';
        default: return '🔵 Normal';
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openModal(announcement = null) {
    const modal = $('#announcementModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('announcementForm');

    // Reset form
    form.reset();
    document.getElementById('announcementId').value = '';

    if (announcement) {
        // Edit mode
        title.textContent = 'Edit Pengumuman';
        document.getElementById('announcementId').value = announcement.id;
        document.getElementById('title').value = announcement.title;
        document.getElementById('message').value = announcement.message;
        document.getElementById('priority').value = announcement.priority;
        document.getElementById('status').value = announcement.status;
    } else {
        // Create mode
        title.textContent = 'Buat Pengumuman Baru';
        document.getElementById('status').value = 'active';
        document.getElementById('priority').value = 'normal';
    }

    modal.modal('show');
}

async function saveAnnouncement() {
    const id = document.getElementById('announcementId').value;
    const title = document.getElementById('title').value.trim();
    const message = document.getElementById('message').value.trim();
    const priority = document.getElementById('priority').value;
    const status = document.getElementById('status').value;

    if (!title || !message) {
        showAlert('warning', 'Mohon isi semua field yang wajib');
        return;
    }

    try {
        const token = await getIdToken();
        const user = currentUser;
        
        const payload = {
            title,
            message,
            priority,
            status,
            created_by: user.uid,
            created_by_name: 'dr. Dibya Arfianda, SpOG, M.Ked.Klin.'
        };

        const url = id ? `${API_URL}/announcements/${id}` : `${API_URL}/announcements`;
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Failed to save announcement');
        }

        const result = await response.json();

        // Broadcast to patients if active
        if (status === 'active') {
            socket.emit('announcement:new', result.data);
        }

        showAlert('success', id ? 'Pengumuman berhasil diupdate' : 'Pengumuman berhasil dibuat');
        $('#announcementModal').modal('hide');
        await loadAnnouncements();
    } catch (error) {
        console.error('Error saving announcement:', error);
        showAlert('error', 'Gagal menyimpan pengumuman');
    }
}

window.editAnnouncement = async function(id) {
    try {
        const token = await getIdToken();
        const response = await fetch(`${API_URL}/announcements/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load announcement');
        }

        const result = await response.json();
        openModal(result.data);
    } catch (error) {
        console.error('Error loading announcement:', error);
        showAlert('error', 'Gagal memuat data pengumuman');
    }
};

window.deleteAnnouncement = async function(id, title) {
    if (!confirm(`Apakah Anda yakin ingin menghapus pengumuman "${title}"?`)) {
        return;
    }

    try {
        const token = await getIdToken();
        const response = await fetch(`${API_URL}/announcements/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete announcement');
        }

        showAlert('success', 'Pengumuman berhasil dihapus');
        await loadAnnouncements();
    } catch (error) {
        console.error('Error deleting announcement:', error);
        showAlert('error', 'Gagal menghapus pengumuman');
    }
};

function showAlert(type, message) {
    const alertContainer = document.getElementById('alert-container');
    const alertClass = type === 'error' ? 'danger' : type;
    
    const alert = `
        <div class="alert alert-${alertClass} alert-dismissible fade show" role="alert">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            ${message}
            <button type="button" class="close" data-dismiss="alert">
                <span>&times;</span>
            </button>
        </div>
    `;
    
    alertContainer.innerHTML = alert;
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        $('.alert').alert('close');
    }, 5000);
}
