// Patient Dashboard Announcements
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://dokterdibya.com/api';

let socket = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadAnnouncements();
    initializeSocket();
});

function initializeSocket() {
    const socketUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : 'https://dokterdibya.com';
    
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

    // Listen for updated announcements
    socket.on('announcement:updated', (announcement) => {
        console.log('Announcement updated:', announcement);
        // Reload announcements to reflect changes
        loadAnnouncements();
    });
}

async function loadAnnouncements() {
    try {
        const patientId = window.currentProfile?.id;
        let url = `${API_URL}/announcements/active`;
        if (patientId) {
            url += `?patient_id=${patientId}`;
        }

        const response = await fetch(url);

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

// Toggle like on announcement
async function toggleLike(announcementId, buttonEl) {
    const patientId = window.currentProfile?.id;
    if (!patientId) {
        alert('Silakan login untuk menyukai pengumuman');
        return;
    }

    try {
        buttonEl.disabled = true;
        const response = await fetch(`${API_URL}/announcements/${announcementId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patient_id: patientId })
        });

        if (!response.ok) throw new Error('Failed to toggle like');

        const data = await response.json();

        // Update button appearance
        const icon = buttonEl.querySelector('i');
        const countSpan = buttonEl.querySelector('.like-count');

        if (data.liked) {
            icon.classList.remove('fa-thumbs-o-up');
            icon.classList.add('fa-thumbs-up');
            buttonEl.style.color = '#28a7e9';
        } else {
            icon.classList.remove('fa-thumbs-up');
            icon.classList.add('fa-thumbs-o-up');
            buttonEl.style.color = '#999';
        }

        countSpan.textContent = data.like_count;
    } catch (error) {
        console.error('Error toggling like:', error);
    } finally {
        buttonEl.disabled = false;
    }
}

function renderContent(content, contentType = 'plain') {
    if (!content) return '';

    if (contentType === 'markdown' && typeof marked !== 'undefined') {
        try {
            const html = marked.parse(content);
            // Sanitize if DOMPurify is available
            return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return escapeHtml(content).replace(/\n/g, '<br>');
        }
    }

    // Plain text - escape and preserve line breaks
    return escapeHtml(content).replace(/\n/g, '<br>');
}

function displayAnnouncements(announcements) {
    const container = document.getElementById('announcements-container');

    if (announcements.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #999;">
                <i class="fa fa-info-circle" style="font-size: 48px; color: #404040; margin-bottom: 15px;"></i>
                <p style="margin: 0; font-size: 16px;">Tidak ada pengumuman saat ini</p>
            </div>
        `;
        return;
    }

    // Get priority announcement and most recent
    const priorityAnnouncement = announcements.find(a => a.priority === 'important' || a.priority === 'urgent');
    const otherAnnouncements = announcements.filter(a => a.id !== priorityAnnouncement?.id);

    // Initial 2: priority (if exists) + most recent
    const initialAnnouncements = [];
    if (priorityAnnouncement) initialAnnouncements.push(priorityAnnouncement);
    if (otherAnnouncements[0]) initialAnnouncements.push(otherAnnouncements[0]);
    const initialIds = initialAnnouncements.map(a => a.id);

    const remainingAnnouncements = announcements.filter(a => !initialIds.includes(a.id));
    const hasMore = remainingAnnouncements.length > 0;

    // Render initial announcements
    let html = initialAnnouncements.map(announcement => renderAnnouncementCard(announcement)).join('');

    // Add expand button if there are more
    if (hasMore) {
        html += `
            <div id="remaining-announcements" style="display: none;">
                ${remainingAnnouncements.map(announcement => renderAnnouncementCard(announcement)).join('')}
            </div>
            <button id="toggle-announcements-btn" onclick="toggleRemainingAnnouncements()" style="
                width: 100%;
                background: #333;
                border: 1px solid #404040;
                color: #28a7e9;
                padding: 12px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            " onmouseover="this.style.background='#404040'" onmouseout="this.style.background='#333'">
                <span>Lihat ${remainingAnnouncements.length} Pengumuman Lainnya</span>
                <i class="fa fa-chevron-down"></i>
            </button>
        `;
    }

    container.innerHTML = html;
}

function toggleRemainingAnnouncements() {
    const remaining = document.getElementById('remaining-announcements');
    const btn = document.getElementById('toggle-announcements-btn');

    if (remaining.style.display === 'none') {
        remaining.style.display = 'block';
        btn.innerHTML = `
            <span>Lihat Lebih Sedikit</span>
            <i class="fa fa-chevron-up"></i>
        `;
    } else {
        remaining.style.display = 'none';
        const count = remaining.querySelectorAll('.announcement-item').length;
        btn.innerHTML = `
            <span>Lihat ${count} Pengumuman Lainnya</span>
            <i class="fa fa-chevron-down"></i>
        `;
    }
}

function renderAnnouncementCard(announcement) {
        // Render formatted content or plain message
        const contentHtml = announcement.formatted_content && announcement.content_type === 'markdown' ?
            announcement.formatted_content :
            renderContent(announcement.message, announcement.content_type || 'plain');

        // Build content area with thumbnail image beside text if image exists
        const contentAreaHtml = announcement.image_url ? `
            <div style="display: flex; gap: 12px; margin: 15px 0; align-items: flex-start;">
                <img src="${escapeHtml(announcement.image_url)}"
                     alt="Announcement image"
                     style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; flex-shrink: 0;"
                     onerror="this.style.display='none'">
                <div style="color: #e0e0e0; line-height: 1.7; font-size: 15px; flex: 1;">
                    ${contentHtml}
                </div>
            </div>
        ` : `
            <div style="color: #e0e0e0; margin: 15px 0; line-height: 1.7; font-size: 15px;">
                ${contentHtml}
            </div>
        `;

        return `
            <div class="announcement-item" style="
                background: #2a2a2a;
                border-left: 5px solid ${getPriorityColor(announcement.priority)};
                padding: 20px;
                margin-bottom: 15px;
                border-radius: 5px;
                transition: all 0.3s;
            " onmouseover="this.style.background='#333333'; this.style.borderLeftWidth='6px';"
               onmouseout="this.style.background='#2a2a2a'; this.style.borderLeftWidth='5px';">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
                    <h4 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600; flex: 1;">
                        ${getPriorityIcon(announcement.priority)} ${escapeHtml(announcement.title)}
                    </h4>
                    <span style="
                        background: ${getPriorityBadgeColor(announcement.priority)};
                        color: white;
                        padding: 5px 12px;
                        border-radius: 20px;
                        font-size: 11px;
                        font-weight: 600;
                        letter-spacing: 0.5px;
                        white-space: nowrap;
                    ">${getPriorityLabel(announcement.priority)}</span>
                </div>
                ${contentAreaHtml}
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #404040; flex-wrap: wrap; gap: 10px;">
                    <small style="color: #28a7e9; font-weight: 500;">
                        <i class="fa fa-user-md"></i> ${escapeHtml(announcement.created_by_name)}
                    </small>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <button onclick="toggleLike(${announcement.id}, this)" style="
                            background: none;
                            border: none;
                            cursor: pointer;
                            padding: 5px 10px;
                            border-radius: 20px;
                            display: flex;
                            align-items: center;
                            gap: 5px;
                            color: ${announcement.liked_by_me ? '#28a7e9' : '#999'};
                            transition: all 0.2s;
                            font-size: 14px;
                        " onmouseover="this.style.background='#333'" onmouseout="this.style.background='none'">
                            <i class="fa ${announcement.liked_by_me ? 'fa-thumbs-up' : 'fa-thumbs-o-up'}"></i>
                            <span class="like-count">${announcement.like_count || 0}</span>
                        </button>
                        <small style="color: #999;">
                            <i class="fa fa-clock-o"></i> ${formatDate(announcement.created_at)}
                        </small>
                    </div>
                </div>
            </div>
        `;
}

function getPriorityColor(priority) {
    switch (priority) {
        case 'urgent': return '#e74c3c';
        case 'important': return '#f39c12';
        default: return '#28a7e9';
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
        <div style="text-align: center; padding: 20px;">
            <div style="
                background: #3a2a2a;
                border: 1px solid #e74c3c;
                border-left: 4px solid #e74c3c;
                padding: 15px;
                border-radius: 5px;
                color: #ffffff;
            ">
                <i class="fa fa-exclamation-triangle" style="color: #e74c3c; margin-right: 10px;"></i> 
                Gagal memuat pengumuman. 
                <button onclick="loadAnnouncements()" style="
                    background: #e74c3c;
                    color: white;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 4px;
                    margin-left: 10px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: background 0.3s;
                " onmouseover="this.style.background='#c0392b'" 
                   onmouseout="this.style.background='#e74c3c'">
                    <i class="fa fa-refresh"></i> Coba Lagi
                </button>
            </div>
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
        background: #202020;
        border: 1px solid #404040;
        border-left: 5px solid ${getPriorityColor(announcement.priority)};
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        z-index: 9999;
        max-width: 400px;
        animation: slideInRight 0.3s ease-out;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
                <strong style="color: #28a7e9; display: block; margin-bottom: 8px; font-size: 16px;">
                    ${getPriorityIcon(announcement.priority)} Pengumuman Baru
                </strong>
                <p style="margin: 0; color: #ffffff; font-size: 15px; font-weight: 600; margin-bottom: 5px;">
                    ${escapeHtml(announcement.title)}
                </p>
                <small style="color: #999; font-size: 12px;">
                    <i class="fa fa-user-md"></i> ${escapeHtml(announcement.created_by_name)}
                </small>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="
                background: none;
                border: none;
                font-size: 24px;
                color: #666;
                cursor: pointer;
                margin-left: 15px;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.3s;
            " onmouseover="this.style.background='#333'; this.style.color='#fff'" 
               onmouseout="this.style.background='none'; this.style.color='#666'">&times;</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }
    }, 8000);
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
