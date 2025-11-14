// Patient Dashboard Announcements
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://dibyaklinik.com/api';

let socket = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadAnnouncements();
    initializeSocket();
});

function initializeSocket() {
    const socketUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : 'https://dibyaklinik.com';
    
    socket = io(socketUrl);

    socket.on('connect', () => {
        console.log('Socket connected for announcements');
    });

    // Listen for new announcements
    socket.on('announcement:new', (announcement) => {
        console.log('New announcement received:', announcement);
        // Reload announcements to show the new one
        loadAnnouncements();
        
        // Show notification
        showNotification(announcement);
    });
}

async function loadAnnouncements() {
    try {
        const response = await fetch(`${API_URL}/announcements/active`);
        
        if (!response.ok) {
            throw new Error('Failed to load announcements');
        }

        const data = await response.json();
        displayAnnouncements(data.data || []);
    } catch (error) {
        console.error('Error loading announcements:', error);
        displayError();
    }
}

function displayAnnouncements(announcements) {
    const container = document.getElementById('announcements-container');
    
    if (announcements.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center">
                <i class="fa fa-info-circle"></i> Tidak ada pengumuman saat ini
            </div>
        `;
        return;
    }

    container.innerHTML = announcements.map(announcement => `
        <div class="announcement-item wow fadeInUp" data-wow-offset="30" data-wow-delay="0.3s" style="
            background: white;
            border-left: 5px solid ${getPriorityColor(announcement.priority)};
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        ">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <h4 style="margin: 0; color: #2c3e50;">
                    ${getPriorityIcon(announcement.priority)} ${escapeHtml(announcement.title)}
                </h4>
                <span class="badge" style="
                    background: ${getPriorityBadgeColor(announcement.priority)};
                    color: white;
                    padding: 5px 10px;
                    border-radius: 3px;
                    font-size: 12px;
                ">${getPriorityLabel(announcement.priority)}</span>
            </div>
            <p style="color: #555; margin: 15px 0; white-space: pre-wrap; line-height: 1.6;">
                ${escapeHtml(announcement.message)}
            </p>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #eee;">
                <small style="color: #7f8c8d;">
                    <i class="fa fa-user-md"></i> ${escapeHtml(announcement.created_by_name)}
                </small>
                <small style="color: #95a5a6;">
                    <i class="fa fa-clock-o"></i> ${formatDate(announcement.created_at)}
                </small>
            </div>
        </div>
    `).join('');
}

function getPriorityColor(priority) {
    switch (priority) {
        case 'urgent': return '#e74c3c';
        case 'important': return '#f39c12';
        default: return '#3498db';
    }
}

function getPriorityBadgeColor(priority) {
    switch (priority) {
        case 'urgent': return '#c0392b';
        case 'important': return '#e67e22';
        default: return '#2980b9';
    }
}

function getPriorityIcon(priority) {
    switch (priority) {
        case 'urgent': return '🔴';
        case 'important': return '⚠️';
        default: return 'ℹ️';
    }
}

function getPriorityLabel(priority) {
    switch (priority) {
        case 'urgent': return 'MENDESAK';
        case 'important': return 'PENTING';
        default: return 'INFORMASI';
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit yang lalu`;
    if (diffHours < 24) return `${diffHours} jam yang lalu`;
    if (diffDays < 7) return `${diffDays} hari yang lalu`;

    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function displayError() {
    const container = document.getElementById('announcements-container');
    container.innerHTML = `
        <div class="alert alert-warning text-center">
            <i class="fa fa-exclamation-triangle"></i> Gagal memuat pengumuman. 
            <button onclick="loadAnnouncements()" class="btn btn-sm btn-warning" style="margin-left: 10px;">
                <i class="fa fa-refresh"></i> Coba Lagi
            </button>
        </div>
    `;
}

function showNotification(announcement) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'announcement-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-left: 5px solid ${getPriorityColor(announcement.priority)};
        padding: 15px 20px;
        border-radius: 5px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 9999;
        max-width: 400px;
        animation: slideInRight 0.3s ease-out;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
                <strong style="color: #2c3e50; display: block; margin-bottom: 5px;">
                    ${getPriorityIcon(announcement.priority)} Pengumuman Baru
                </strong>
                <p style="margin: 0; color: #555; font-size: 14px;">
                    ${escapeHtml(announcement.title)}
                </p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="
                background: none;
                border: none;
                font-size: 20px;
                color: #999;
                cursor: pointer;
                margin-left: 10px;
            ">&times;</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
