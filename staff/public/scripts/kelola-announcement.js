import { auth, initAuth, getIdToken, signOut } from './vps-auth-v2.js';

const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://dokterdibya.com/api';

let socket = null;
let currentUser = null;
let userPermissions = []; // Store user permissions

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize auth and wait for user
        await initAuth();
        currentUser = auth.currentUser;
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
    // Logout (only for standalone page)
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await signOut();
                window.location.href = 'login.html';
            } catch (err) {
                console.error('Logout error:', err);
                window.location.href = 'login.html';
            }
        });
    }

    // New announcement button (standalone page)
    const btnNew = document.getElementById('btn-new-announcement');
    if (btnNew) {
        btnNew.addEventListener('click', () => {
            openModal();
        });
    }

    // Save button
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            await saveAnnouncement();
        });
    }

    // Image file upload
    const imageFile = document.getElementById('imageFile');
    if (imageFile) {
        imageFile.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await uploadAnnouncementImage(file);
            }
        });
    }

    // Update preview button
    const btnUpdatePreview = document.getElementById('btn-update-preview');
    if (btnUpdatePreview) {
        btnUpdatePreview.addEventListener('click', () => {
            updatePreview();
        });
    }

    // Content type change event
    const contentType = document.getElementById('contentType');
    if (contentType) {
        contentType.addEventListener('change', (e) => {
            const toolbar = document.getElementById('formatToolbar');
            const messageHelp = document.getElementById('messageHelp');

            if (e.target.value === 'markdown') {
                if (toolbar) toolbar.style.display = 'block';
                if (messageHelp) messageHelp.innerHTML = 'Gunakan markdown untuk pemformatan. <a href="https://www.markdownguide.org/basic-syntax/" target="_blank">Panduan Markdown</a>';
            } else {
                if (toolbar) toolbar.style.display = 'none';
                if (messageHelp) messageHelp.textContent = 'Masukkan teks biasa tanpa pemformatan.';
            }
        });
    }

    // Auto-update preview when switching to preview tab
    const previewTab = document.getElementById('preview-tab');
    if (previewTab) {
        $(previewTab).on('shown.bs.tab', () => {
            updatePreview();
        });
    }
}

// Upload announcement image to R2
async function uploadAnnouncementImage(file) {
    const progressBar = document.getElementById('imageUploadProgress');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const preview = document.getElementById('imagePreview');
    const imageUrl = document.getElementById('imageUrl');
    const fileLabel = document.getElementById('imageFileLabel');

    try {
        // Show progress
        if (progressBar) progressBar.style.display = 'block';

        const token = window.getIdTokenOverride ? await window.getIdTokenOverride() : await getIdToken();

        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`${API_URL}/announcements/upload-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Upload failed');
        }

        const result = await response.json();

        // Set image URL
        if (imageUrl) imageUrl.value = result.image_url;

        // Show preview
        if (preview) preview.src = result.image_url;
        if (previewContainer) previewContainer.style.display = 'block';
        if (fileLabel) fileLabel.textContent = file.name;

        showAlert('success', 'Gambar berhasil diupload');
    } catch (error) {
        console.error('Error uploading image:', error);
        showAlert('error', 'Gagal upload gambar: ' + error.message);
    } finally {
        if (progressBar) progressBar.style.display = 'none';
    }
}

// Remove announcement image
window.removeAnnouncementImage = function() {
    const imageUrl = document.getElementById('imageUrl');
    const imageFile = document.getElementById('imageFile');
    const fileLabel = document.getElementById('imageFileLabel');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const preview = document.getElementById('imagePreview');

    if (imageUrl) imageUrl.value = '';
    if (imageFile) imageFile.value = '';
    if (fileLabel) fileLabel.textContent = 'Pilih gambar...';
    if (previewContainer) previewContainer.style.display = 'none';
    if (preview) preview.src = '';
};

async function loadAnnouncements() {
    try {
        const token = window.getIdTokenOverride ? await window.getIdTokenOverride() : await getIdToken();
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
    const container = document.getElementById('announcements-container-inline') || document.getElementById('announcements-container');
    
    if (!container) {
        console.error('Announcements container not found');
        return;
    }

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

    container.innerHTML = announcements.map(announcement => {
        const imageHtml = announcement.image_url ?
            `<img src="${escapeHtml(announcement.image_url)}" class="announcement-image" alt="Announcement image" onerror="this.style.display='none'">` : '';

        // Always render as plain text for preview, disable markdown
        const previewContent = escapeHtml(announcement.message).replace(/\n/g, '<br>');

        return `
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
                        <div class="row">
                            <div class="col-12 mb-3">
                                <h5 class="card-title mb-0">${escapeHtml(announcement.title)}</h5>
                            </div>
                            <div class="col-12">
                                <div class="announcement-preview text-muted collapsed" id="preview-${announcement.id}" style="max-height: 140px; overflow: hidden; position: relative;">
                                    ${previewContent}
                                </div>
                                <button class="btn btn-sm btn-link p-0 mt-2" onclick="togglePreview(${announcement.id})" id="toggle-btn-${announcement.id}">
                                    <i class="fas fa-chevron-down"></i> Show More
                                </button>
                                ${imageHtml}
                                <small class="text-muted d-block mt-2">
                                    <i class="far fa-clock"></i> ${formatDate(announcement.created_at)}
                                </small>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer bg-transparent">
                        <button class="btn btn-sm btn-primary ${!hasPermission('announcements.edit') ? 'disabled' : ''}" 
                            onclick="${hasPermission('announcements.edit') ? `editAnnouncement(${announcement.id})` : 'return false'}"
                            ${!hasPermission('announcements.edit') ? 'disabled title="Anda tidak memiliki izin untuk mengedit pengumuman"' : ''}>
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-danger ${!hasPermission('announcements.delete') ? 'disabled' : ''}" 
                            onclick="${hasPermission('announcements.delete') ? `deleteAnnouncement(${announcement.id}, '${escapeHtml(announcement.title)}')` : 'return false'}"
                            ${!hasPermission('announcements.delete') ? 'disabled title="Anda tidak memiliki izin untuk menghapus pengumuman"' : ''}>
                            <i class="fas fa-trash"></i> Hapus
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
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

// Toggle preview expand/collapse
window.togglePreview = function(announcementId) {
    const preview = document.getElementById(`preview-${announcementId}`);
    const toggleBtn = document.getElementById(`toggle-btn-${announcementId}`);
    
    if (!preview || !toggleBtn) return;
    
    if (preview.classList.contains('collapsed')) {
        // Expand
        preview.style.maxHeight = 'none';
        preview.classList.remove('collapsed');
        toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Show Less';
    } else {
        // Collapse
        preview.style.maxHeight = '140px';
        preview.classList.add('collapsed');
        toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Show More';
    }
};

function renderContent(content, contentType, isPreview = false) {
    if (!content) return '';

    if (contentType === 'markdown') {
        try {
            // Use marked to parse markdown
            const html = marked.parse(content);
            // Sanitize HTML to prevent XSS
            return DOMPurify.sanitize(html);
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return escapeHtml(content);
        }
    }

    // Plain text - escape and preserve line breaks
    return escapeHtml(content).replace(/\n/g, '<br>');
}

function updatePreview() {
    const title = document.getElementById('title').value;
    const message = document.getElementById('message').value;
    const imageUrl = document.getElementById('imageUrl').value;
    const contentType = document.getElementById('contentType').value;
    const priority = document.getElementById('priority').value;
    const status = document.getElementById('status').value;

    // Update preview title
    document.getElementById('previewTitle').textContent = title || 'Judul Pengumuman';

    // Update preview image
    const previewImage = document.getElementById('previewImage');
    if (imageUrl) {
        previewImage.src = imageUrl;
        previewImage.style.display = 'block';
    } else {
        previewImage.style.display = 'none';
    }

    // Update preview message with formatting
    const previewMessage = document.getElementById('previewMessage');
    if (message) {
        previewMessage.innerHTML = renderContent(message, contentType);
    } else {
        previewMessage.innerHTML = '<em class="text-muted">Pesan akan ditampilkan di sini...</em>';
    }

    // Update priority badge
    const previewPriority = document.getElementById('previewPriority');
    previewPriority.textContent = getPriorityLabel(priority);

    // Update status badge
    const previewStatus = document.getElementById('previewStatus');
    previewStatus.textContent = status === 'active' ? 'Aktif' : 'Tidak Aktif';
    previewStatus.className = `badge badge-${status === 'active' ? 'success' : 'secondary'}`;

    // Update header color
    const previewHeader = document.getElementById('previewHeader');
    previewHeader.className = `card-header bg-${getPriorityColor(priority)}`;
}

// Helper function to insert markdown formatting
window.insertFormat = function(before, after, placeholder) {
    const messageField = document.getElementById('message');
    const start = messageField.selectionStart;
    const end = messageField.selectionEnd;
    const selectedText = messageField.value.substring(start, end);
    const textToInsert = selectedText || placeholder;
    const newText = before + textToInsert + after;

    messageField.value = messageField.value.substring(0, start) + newText + messageField.value.substring(end);

    // Set cursor position
    const newCursorPos = selectedText ? start + newText.length : start + before.length;
    messageField.focus();
    messageField.setSelectionRange(newCursorPos, newCursorPos + (selectedText ? 0 : placeholder.length));
};

window.openModal = function(announcement = null) {
    const modal = $('#announcementModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('announcementForm');
    const toolbar = document.getElementById('formatToolbar');

    if (!modal || !title || !form) {
        console.error('Required modal elements not found');
        return;
    }

    // Reset form
    form.reset();
    document.getElementById('announcementId').value = '';

    // Reset image fields
    const imageFile = document.getElementById('imageFile');
    const fileLabel = document.getElementById('imageFileLabel');
    const previewContainer = document.getElementById('imagePreviewContainer');
    const preview = document.getElementById('imagePreview');
    const imageUrl = document.getElementById('imageUrl');

    if (imageFile) imageFile.value = '';
    if (fileLabel) fileLabel.textContent = 'Pilih gambar...';
    if (imageUrl) imageUrl.value = '';

    // Reset tabs to form tab if available
    const formTab = document.getElementById('form-tab');
    if (formTab) {
        $('#form-tab').tab('show');
    }

    if (announcement) {
        // Edit mode
        title.textContent = 'Edit Pengumuman';
        document.getElementById('announcementId').value = announcement.id;
        document.getElementById('title').value = announcement.title;
        document.getElementById('message').value = announcement.message;
        if (imageUrl) imageUrl.value = announcement.image_url || '';
        document.getElementById('contentType').value = announcement.content_type || 'plain';
        document.getElementById('priority').value = announcement.priority;
        document.getElementById('status').value = announcement.status;

        // Show image preview if exists
        if (announcement.image_url && previewContainer && preview) {
            preview.src = announcement.image_url;
            previewContainer.style.display = 'block';
            if (fileLabel) fileLabel.textContent = 'Gambar sudah ada';
        } else if (previewContainer) {
            previewContainer.style.display = 'none';
        }

        // Show toolbar if markdown (only if toolbar exists)
        if (toolbar) {
            if (announcement.content_type === 'markdown') {
                toolbar.style.display = 'block';
            } else {
                toolbar.style.display = 'none';
            }
        }
    } else {
        // Create mode
        title.textContent = 'Buat Pengumuman Baru';
        document.getElementById('status').value = 'active';
        document.getElementById('priority').value = 'normal';
        document.getElementById('contentType').value = 'plain';
        if (previewContainer) previewContainer.style.display = 'none';
        if (toolbar) {
            toolbar.style.display = 'none';
        }
    }

    modal.modal('show');
}

async function saveAnnouncement() {
    const id = document.getElementById('announcementId').value;
    const title = document.getElementById('title').value.trim();
    const message = document.getElementById('message').value.trim();
    const imageUrl = document.getElementById('imageUrl').value.trim();
    const contentType = document.getElementById('contentType').value;
    const priority = document.getElementById('priority').value;
    const status = document.getElementById('status').value;

    if (!title || !message) {
        showAlert('warning', 'Mohon isi semua field yang wajib');
        return;
    }

    try {
        const token = await getIdToken();
        const user = currentUser;

        // Generate formatted content based on type
        let formattedContent = null;
        if (contentType === 'markdown') {
            formattedContent = renderContent(message, contentType);
        }

        const payload = {
            title,
            message,
            image_url: imageUrl || null,
            formatted_content: formattedContent,
            content_type: contentType,
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
        const token = window.getIdTokenOverride ? await window.getIdTokenOverride() : await getIdToken();
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
        const token = window.getIdTokenOverride ? await window.getIdTokenOverride() : await getIdToken();
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
    // Use toast notification if available (for embedded mode)
    if (window.showSuccess && window.showError && window.showWarning) {
        if (type === 'success') {
            window.showSuccess(message);
        } else if (type === 'error') {
            window.showError(message);
        } else {
            window.showWarning(message);
        }
        return;
    }
    
    // Fallback to alert container for standalone mode
    const alertContainer = document.getElementById('alert-container');
    if (!alertContainer) {
        console.warn('Alert container not found, using console:', type, message);
        return;
    }
    
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

// Export init function for embedding in index-adminlte
window.initKelolaAnnouncement = async function() {
    try {
        // Get current user from window.auth (set by index-adminlte)
        currentUser = window.auth?.currentUser;
        if (!currentUser) {
            console.error('No authenticated user found');
            return;
        }

        // Override getIdToken to use window.getIdToken when embedded
        if (window.getIdToken && typeof window.getIdToken === 'function') {
            window.getIdTokenOverride = window.getIdToken;
        }

        // Fetch user permissions from API
        try {
            const token = window.getIdTokenOverride ? await window.getIdTokenOverride() : await getIdToken();
            const response = await fetch(`${API_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                userPermissions = data.data?.user?.permissions || [];
                console.log('User permissions:', userPermissions);
            }
        } catch (err) {
            console.error('Failed to fetch user permissions:', err);
        }

        // Initialize Socket.io if not already connected
        if (!window.socket) {
            const socketUrl = window.location.hostname === 'localhost' 
                ? 'http://localhost:3000' 
                : 'https://dokterdibya.com';
            window.socket = io(socketUrl);
        }
        socket = window.socket;

        socket.on('connect', () => {
            console.log('Socket connected for announcements');
        });

        // Update container references for inline mode
        const announcementsContainer = document.getElementById('announcements-container-inline') || document.getElementById('announcements-container');
        
        // Check permission for "Buat Pengumuman Baru" button
        const btnNew = document.getElementById('btn-new-announcement-inline') || document.getElementById('btn-new-announcement');
        if (btnNew) {
            if (!hasPermission('announcements.create')) {
                btnNew.disabled = true;
                btnNew.classList.add('disabled');
                btnNew.title = 'Anda tidak memiliki izin untuk membuat pengumuman';
            } else {
                btnNew.disabled = false;
                btnNew.classList.remove('disabled');
                btnNew.addEventListener('click', () => {
                    window.openModal();
                });
            }
        }

        // Load announcements
        await loadAnnouncements();

        setupEventListeners();
    } catch (error) {
        console.error('Kelola Announcement initialization error:', error);
    }
};

// Helper function to check if user has permission
function hasPermission(permissionName) {
    return userPermissions.includes(permissionName);
}

// Export hasPermission for use in displayAnnouncements
window.hasAnnouncementPermission = hasPermission;
