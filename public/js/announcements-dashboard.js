// Patient Dashboard Announcements
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://dokterdibya.com/api';

let socket = null;
let infoTerbaruAllAnnouncements = [];
let infoTerbaruExpanded = false;
let infoTerbaruObserver = null;
let infoTerbaruScrollCleanup = null;

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

    // New structure: each item is a flex ROW with its own sticky number on the right
    // Items column: no individual numbers (shared animated number lives in num-col)
    const itemsHtml = items.map((item, i) => {
        const titleHtml = getFirstThreeWordsWithColors(stripEmoji(item.title || 'Info terbaru'));
        const desc = escapeHtml(truncateText(stripEmoji(item.message || ''), 120));
        return `
            <div class="info-terbaru-item" data-index="${i}">
                <div class="info-terbaru-content" onclick="openInfoTerbaruModal(${i})">
                    <h4>${titleHtml}</h4>
                    <p>${desc}</p>
                </div>
            </div>
        `;
    }).join('');

    // CTA as last item
    const ctaHtml = `
        <div class="info-terbaru-item info-terbaru-item-cta">
            <div class="info-terbaru-content" onclick="window.location.href='/announcements.html'">
                <h4>Lihat Info Lainnya</h4>
                <p>Baca semua pengumuman dan informasi terbaru dari dokter.</p>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="info-terbaru-wrapper">
            <div class="info-terbaru-items">
                ${itemsHtml}
                ${ctaHtml}
            </div>
            <div class="info-terbaru-num-col">
                <div class="info-terbaru-num-sticky">
                    <div class="digit-track">
                        <span class="digit-prefix">0</span>
                        <span class="digit-value-track">
                            <span class="digit-value-current">1</span>
                        </span>
                    </div>
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

function getFirstThreeWords(text) {
    const words = text.trim().split(/\s+/);
    return words.slice(0, 3).join(' ');
}

function getFirstThreeWordsWithColors(text) {
    const words = text.trim().split(/\s+/).slice(0, 3);
    if (words.length <= 1) {
        return `<span style="color: #0a0a0a;">${words[0]}</span>`;
    }
    const firstWord = words[0];
    const lastTwoWords = words.slice(1).join(' ');
    return `<span style="color: #0a0a0a;">${firstWord}</span> <span style="color: rgb(59, 130, 246);">${lastTwoWords}</span>`;
}

function truncateText(text, maxLen) {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

// No scroll setup needed — sticky number is pure CSS per item
// Single shared sticky digit with slide + fade animation between items
function setupInfoTerbaruScroll() {
    if (typeof infoTerbaruScrollCleanup === 'function') {
        infoTerbaruScrollCleanup();
        infoTerbaruScrollCleanup = null;
    }

    const wrapper = document.querySelector('.info-terbaru-wrapper');
    if (!wrapper) return;

    const allItems = Array.from(wrapper.querySelectorAll('.info-terbaru-item'));
    if (allItems.length < 2) return;

    const digitTrack = wrapper.querySelector('.digit-track');
    if (!digitTrack) return;

    const animOffsetPx = 188;
    const leaveDurationMs = 560;
    const enterDurationMs = 560;
    const fallbackDurationMs = 650;
    const triggerDelayPx = 8; // small delay after midpoint so change feels less jumpy
    const stickyVisualOffsetPx = 72; // lower resting position closer to ClearPath reference
    let currentIndex = 0;
    let isAnimating = false;
    let pendingTarget = null;
    let stickyTopPxValue = null;

    function getScrollHost(el) {
        let cur = el.parentElement;
        while (cur && cur !== document.body) {
            const style = window.getComputedStyle(cur);
            const y = style.overflowY;
            const isScrollable = (y === 'auto' || y === 'scroll') && (cur.scrollHeight > cur.clientHeight);
            if (isScrollable) return cur;
            cur = cur.parentElement;
        }
        return window;
    }

    const scrollHost = getScrollHost(wrapper);

    function getStickyTopPx() {
        const firstTitle = allItems[0]?.querySelector('h4');
        if (!firstTitle) return (0.30 * window.innerHeight) + stickyVisualOffsetPx;

        const firstTitleTop = firstTitle.getBoundingClientRect().top;
        if (scrollHost === window) {
            return Math.max(0, firstTitleTop + stickyVisualOffsetPx);
        }

        const hostRect = scrollHost.getBoundingClientRect();
        return Math.max(0, firstTitleTop - hostRect.top + stickyVisualOffsetPx);
    }

    function refreshStickyTopAnchor() {
        stickyTopPxValue = getStickyTopPx();
        wrapper.style.setProperty('--info-num-top', `${stickyTopPxValue}px`);
    }

    function getStickyLineY() {
        const topPx = stickyTopPxValue ?? getStickyTopPx();
        if (scrollHost === window) {
            return topPx;
        }
        const hostRect = scrollHost.getBoundingClientRect();
        return hostRect.top + topPx;
    }

    function animateDigit(newIndex) {
        // Let current transition finish fully; do not interrupt with scroll updates.
        if (isAnimating) {
            pendingTarget = newIndex;
            return;
        }

        const valueTrack = digitTrack.querySelector('.digit-value-track');
        if (!valueTrack) return;

        const currentEl = valueTrack.querySelector('.digit-value-current');
        const goingDown = newIndex > currentIndex;
        currentIndex = newIndex;
        isAnimating = true;

        // Build incoming digit — starts off-screen
        const incoming = document.createElement('span');
        incoming.className = 'digit-value-incoming';
        incoming.textContent = String(newIndex + 1);
        valueTrack.appendChild(incoming);

        const leaveOffset = goingDown ? -animOffsetPx : animOffsetPx;
        const enterOffset = goingDown ? animOffsetPx : -animOffsetPx;

        let transitionDone;

        // Prefer WAAPI for deterministic animation; fallback to CSS classes.
        if (typeof incoming.animate === 'function') {
            incoming.style.transform = `translateY(${enterOffset}px)`;
            incoming.style.opacity = '0';

            const animations = [];
            if (currentEl) {
                animations.push(currentEl.animate(
                    [
                        { transform: 'translateY(0)', opacity: 1 },
                        { transform: `translateY(${leaveOffset}px)`, opacity: 0 }
                    ],
                    { duration: leaveDurationMs, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }
                ).finished);
            }

            animations.push(incoming.animate(
                [
                    { transform: `translateY(${enterOffset}px)`, opacity: 0 },
                    { transform: 'translateY(0)', opacity: 1 }
                ],
                { duration: enterDurationMs, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }
            ).finished);

            transitionDone = Promise.allSettled(animations);
        } else {
            if (currentEl) {
                currentEl.classList.add(goingDown ? 'is-leaving-up' : 'is-leaving-down');
            }
            incoming.classList.add(goingDown ? 'from-below' : 'from-above');
            transitionDone = new Promise(resolve => setTimeout(resolve, fallbackDurationMs));
        }

        // Cleanup: promote incoming → current
        transitionDone.finally(() => {
            if (currentEl) currentEl.remove();
            incoming.className = 'digit-value-current';
            isAnimating = false;

            if (pendingTarget !== null && pendingTarget !== currentIndex) {
                const nextTarget = pendingTarget;
                pendingTarget = null;
                animateDigit(nextTarget);
                return;
            }

            pendingTarget = null;
            // Re-sync to current scroll position after transition completes.
            updateByViewport();
        });
    }

    function getTargetIndexByViewport(stickyLineY) {
        let target = 0;
        for (let i = 0; i < allItems.length - 1; i++) {
            const p1 = allItems[i].querySelector('p');
            const h4_2 = allItems[i + 1].querySelector('h4');
            if (!p1 || !h4_2) continue;
            const midGapY = (p1.getBoundingClientRect().bottom + h4_2.getBoundingClientRect().top) / 2;
            if (stickyLineY >= (midGapY + triggerDelayPx)) target = i + 1;
        }
        return target;
    }

    function getLastItemWipeY() {
        const lastItem = allItems[allItems.length - 1];
        if (!lastItem) return Number.POSITIVE_INFINITY;

        const lastTitle = lastItem.querySelector('h4');
        const lastDesc = lastItem.querySelector('p');
        const titleTop = lastTitle
            ? lastTitle.getBoundingClientRect().top
            : lastItem.getBoundingClientRect().top;
        const descBottom = lastDesc
            ? lastDesc.getBoundingClientRect().bottom
            : lastItem.getBoundingClientRect().bottom;
        return (titleTop + descBottom) / 2;
    }

    function updateByViewport() {
        const stickyLineY = getStickyLineY();
        const target = getTargetIndexByViewport(stickyLineY);
        if (target !== currentIndex) animateDigit(target);

        const lastIndex = allItems.length - 1;
        const shouldFinalWipe = (target === lastIndex) && (stickyLineY >= getLastItemWipeY());
        digitTrack.classList.toggle('is-final-wipe', shouldFinalWipe);
    }

    let ticking = false;
    function requestUpdate() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            updateByViewport();
        });
    }

    function onResize() {
        refreshStickyTopAnchor();
        requestUpdate();
    }

    const scrollTarget = scrollHost === window ? window : scrollHost;
    scrollTarget.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    refreshStickyTopAnchor();
    requestUpdate();

    // Recalibrate after font/layout settle to avoid early wrong anchor measurement.
    setTimeout(() => {
        refreshStickyTopAnchor();
        requestUpdate();
    }, 250);
    setTimeout(() => {
        refreshStickyTopAnchor();
        requestUpdate();
    }, 700);

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            refreshStickyTopAnchor();
            requestUpdate();
        }).catch(() => {});
    }

    infoTerbaruScrollCleanup = () => {
        scrollTarget.removeEventListener('scroll', requestUpdate);
        window.removeEventListener('resize', onResize);
    };
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
