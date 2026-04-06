// Patient Dashboard Announcements
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://dokterdibya.com/api';

let socket = null;
let infoTerbaruAllAnnouncements = [];
let infoTerbaruExpanded = false;
let infoTerbaruObserver = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadAnnouncements();
    initializeSocket();
});

function initializeSocket() {
    const socketUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : 'https://dokterdibya.com';
    
    socket = io(socketUrl, {
        transports: ['polling'],
        upgrade: false
    });

    socket.on('connect', () => {});

    // Listen for new announcements
    socket.on('announcement:new', (announcement) => {
        loadAnnouncements();
        showNotification(announcement);
    });

    // Listen for updated announcements
    socket.on('announcement:updated', () => {
        loadAnnouncements();
    });

    // Listen for USG photo updates (auto-publish from staff)
    socket.on('usg:patient_updated', () => {
        if (typeof window.loadUnreadUsgCount === 'function') {
            window.loadUnreadUsgCount();
        }
    });

    // Listen for new patient notifications (bell badge)
    socket.on('notification:new', () => {
        if (typeof window.loadNotificationCount === 'function') {
            window.loadNotificationCount();
        }
    });

    // Listen for document updates (resume medis, lab auto-publish)
    socket.on('document:patient_updated', () => {
        if (typeof window.loadUnreadDocCounts === 'function') {
            window.loadUnreadDocCounts();
        } else if (typeof window.loadUnreadUsgCount === 'function') {
            window.loadUnreadUsgCount();
        }
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
    if (isInfoTerbaruLayout()) {
        displayInfoTerbaruAnnouncements(announcements);
        return;
    }

    displayAnnouncementsLegacy(announcements);
}

function displayAnnouncementsLegacy(announcements) {
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

    // Show only latest 1 announcement (prioritize important/urgent if any)
    const priorityAnnouncement = announcements.find(a => a.priority === 'important' || a.priority === 'urgent');

    // Initial: only 1 announcement (priority if exists, otherwise most recent)
    const initialAnnouncement = priorityAnnouncement || announcements[0];
    const initialAnnouncements = initialAnnouncement ? [initialAnnouncement] : [];

    const remainingAnnouncements = announcements.filter(a => a.id !== initialAnnouncement?.id);
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
    if (isInfoTerbaruLayout()) {
        toggleInfoTerbaruExpanded();
        return;
    }

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

function isInfoTerbaruLayout() {
    const container = document.getElementById('announcements-container');
    return !!container && container.dataset.layout === 'info-terbaru';
}

let infoTerbaruCurrentIndex = 0;
let infoTerbaruScrollHandler = null;

function displayInfoTerbaruAnnouncements(announcements) {
    const container = document.getElementById('announcements-container');
    if (!container) return;

    if (!Array.isArray(announcements) || announcements.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 24px; color: var(--text-muted); border: 1px solid var(--line-soft); border-radius: 10px;">
                <i class="fa fa-info-circle" style="font-size: 22px; margin-bottom: 8px;"></i>
                <p style="margin: 0; font-size: 12px;">Belum ada info terbaru saat ini</p>
            </div>
        `;
        return;
    }

    const sorted = [...announcements].sort((a, b) => {
        const ad = new Date(a.published_at || a.created_at).getTime();
        const bd = new Date(b.published_at || b.created_at).getTime();
        return bd - ad;
    });

    infoTerbaruAllAnnouncements = sorted;
    const items = sorted.slice(0, 3);

    // Build item HTML
    const itemsHtml = items.map((item, i) => {
        const title = escapeHtml(truncateText(stripEmoji(item.title || 'Info terbaru'), 80));
        const desc = escapeHtml(truncateText(stripEmoji(item.message || ''), 120));
        return `
            <div class="info-terbaru-item" data-index="${i}" onclick="openInfoTerbaruModal(${i})">
                <h4>${title}</h4>
                <p>${desc}</p>
            </div>
        `;
    }).join('');

    // CTA as last item
    const ctaHtml = `
        <div class="info-terbaru-item info-terbaru-item-cta" data-index="${items.length}">
            <h4>Lihat Info Lainnya</h4>
            <p>Baca semua pengumuman dan informasi terbaru dari dokter.</p>
        </div>
    `;

    const totalSlides = items.length + 1; // items + CTA
    const containerHeight = 60 * totalSlides + 100; // vh units (60vh per item + 100vh base)

    container.innerHTML = `
        <div class="info-terbaru-bg" id="info-terbaru-bg"></div>
        <div class="info-terbaru-pinned" id="info-terbaru-pinned" style="height: ${containerHeight}vh;">
            <div class="info-terbaru-inner">
                <div class="info-terbaru-number">
                    <span class="info-terbaru-num-fixed">0</span>
                    <span class="info-terbaru-num-slot">
                        <span class="info-terbaru-num-digit" id="info-terbaru-digit">1</span>
                    </span>
                </div>
                <div class="info-terbaru-scroll-content" id="info-terbaru-scroll-content">
                    ${itemsHtml}
                    ${ctaHtml}
                </div>
            </div>
        </div>
    `;

    infoTerbaruCurrentIndex = 0;
    setupInfoTerbaruScroll();
}

function stripEmoji(text) {
    return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

function truncateText(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

var _infoDigitAnimating = false;
function animateInfoTerbaruDigit(index) {
    var digit = document.getElementById('info-terbaru-digit');
    if (!digit || _infoDigitAnimating) return;
    var newValue = String(index + 1);
    if (digit.textContent === newValue) return;

    _infoDigitAnimating = true;

    // Slide out: move UP + fade out
    digit.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    digit.style.transform = 'translateY(-100%)';
    digit.style.opacity = '0';

    setTimeout(function() {
        // Jump to below position instantly (no transition)
        digit.style.transition = 'none';
        digit.style.transform = 'translateY(100%)';
        digit.textContent = newValue;

        // Force browser reflow so position resets before animation
        void digit.offsetHeight;

        // Slide in: move UP to center + fade in
        digit.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        digit.style.transform = 'translateY(0)';
        digit.style.opacity = '1';

        setTimeout(function() { _infoDigitAnimating = false; }, 350);
    }, 320);
}

function setupInfoTerbaruScroll() {
    const pinned = document.getElementById('info-terbaru-pinned');
    const scrollContent = document.getElementById('info-terbaru-scroll-content');
    const bgEl = document.getElementById('info-terbaru-bg');
    if (!pinned || !scrollContent) return;

    const items = scrollContent.querySelectorAll('.info-terbaru-item');
    const totalItems = items.length;
    let prevIndex = -1;

    // Remove old handler if exists
    if (infoTerbaruScrollHandler) {
        window.removeEventListener('scroll', infoTerbaruScrollHandler);
        window.removeEventListener('resize', infoTerbaruScrollHandler);
    }

    infoTerbaruScrollHandler = function() {
        const rect = pinned.getBoundingClientRect();
        const scrollRange = pinned.offsetHeight - window.innerHeight;
        if (scrollRange <= 0) return;

        const progress = Math.max(0, Math.min(1, -rect.top / scrollRange));

        // Move content up as user scrolls
        const contentH = scrollContent.scrollHeight;
        const viewH = window.innerHeight;
        const maxShift = contentH - viewH;
        if (maxShift > 0) {
            const shift = progress * maxShift;
            scrollContent.style.transform = 'translateY(' + (-shift) + 'px)';
        }

        // Background fade: 0→fade in by item 2, full during middle, fade out at end
        if (bgEl) {
            var bgOpacity = 0;
            var segment = 1 / totalItems;
            // Fade in: progress 0 → segment*1.5 (reaches full by item 2)
            var fadeInEnd = segment * 1.5;
            // Fade out: starts at progress (1 - segment) → 1
            var fadeOutStart = 1 - segment;

            if (progress <= 0) {
                bgOpacity = 0;
            } else if (progress < fadeInEnd) {
                bgOpacity = progress / fadeInEnd;
            } else if (progress < fadeOutStart) {
                bgOpacity = 1;
            } else {
                bgOpacity = 1 - (progress - fadeOutStart) / segment;
            }
            bgEl.style.opacity = Math.max(0, Math.min(1, bgOpacity));
        }

        // Determine current item index
        var segmentSize = 1 / totalItems;
        const currentIndex = Math.min(Math.floor(progress / segmentSize), totalItems - 1);

        // Animate digit on index change — shift strip upward
        if (currentIndex !== prevIndex) {
            animateInfoTerbaruDigit(currentIndex);
            prevIndex = currentIndex;
            infoTerbaruCurrentIndex = currentIndex;
        }

        // Number motion: drift upward during scroll, then wipe out in final segment
        var numberEl = pinned.querySelector('.info-terbaru-number');
        if (numberEl) {
            var lastSegmentStart = 1 - segmentSize;
            var driftUp = progress * 28; // continuous upward drift across section
            var opacity = 1;
            var extraWipeUp = 0;
            var baseShift = 0;

            // Start gentle fade before the final segment.
            var preFadeStart = Math.max(0, lastSegmentStart - segmentSize * 0.35);
            if (progress > preFadeStart) {
                opacity = 1 - ((progress - preFadeStart) / (1 - preFadeStart));
                opacity = Math.max(0, Math.min(1, opacity));
            }

            if (progress >= lastSegmentStart) {
                var wipeProgress = (progress - lastSegmentStart) / segmentSize;
                extraWipeUp = wipeProgress * 80;
                opacity = Math.min(opacity, 1 - wipeProgress);
            }

            numberEl.style.opacity = String(Math.max(0, Math.min(1, opacity)));
            numberEl.style.transform = 'translate3d(0, ' + (baseShift - driftUp - extraWipeUp) + '%, 0)';
        }
    };

    window.addEventListener('scroll', infoTerbaruScrollHandler, { passive: true });
    window.addEventListener('resize', infoTerbaruScrollHandler);
    infoTerbaruScrollHandler();
}

// Backwards compat stubs
function toggleInfoTerbaruExpanded() {}
function setupInfoTerbaruObserver() {}

function openInfoTerbaruModal(index) {
    const announcement = infoTerbaruAllAnnouncements[index];
    if (!announcement) return;

    const modal = document.getElementById('info-terbaru-modal');
    const titleEl = document.getElementById('info-terbaru-modal-title');
    const metaEl = document.getElementById('info-terbaru-modal-meta');
    const bodyEl = document.getElementById('info-terbaru-modal-body');
    const imageEl = document.getElementById('info-terbaru-modal-image');
    if (!modal || !titleEl || !metaEl || !bodyEl || !imageEl) return;

    const contentHtml = announcement.formatted_content && announcement.content_type === 'markdown'
        ? announcement.formatted_content
        : renderContent(announcement.message, announcement.content_type || 'plain');

    titleEl.textContent = announcement.title || 'Info terbaru';
    metaEl.textContent = `${announcement.created_by_name || 'Admin'} • ${formatDate(announcement.published_at || announcement.created_at)}`;
    bodyEl.innerHTML = contentHtml || '';

    if (announcement.image_url) {
        imageEl.src = announcement.image_url;
        imageEl.style.display = 'block';
    } else {
        imageEl.style.display = 'none';
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeInfoTerbaruModal(event) {
    if (event && event.target && event.target.id !== 'info-terbaru-modal') return;
    const modal = document.getElementById('info-terbaru-modal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
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

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeInfoTerbaruModal();
    }
});

// Export for pull-to-refresh
window.loadAnnouncements = loadAnnouncements;
window.openInfoTerbaruModal = openInfoTerbaruModal;
window.closeInfoTerbaruModal = closeInfoTerbaruModal;
window.toggleInfoTerbaruExpanded = toggleInfoTerbaruExpanded;
