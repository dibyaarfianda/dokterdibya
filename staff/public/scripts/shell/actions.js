(function initStaffShellActions() {
var shellActionsInitialized = false;

function callGlobal(fnName) {
    if (typeof window[fnName] !== 'function') return false;
    window[fnName]();
    return true;
}

function logoutFallback() {
    localStorage.removeItem(window.TOKEN_KEY);
    sessionStorage.removeItem(window.TOKEN_KEY);
    localStorage.removeItem('cache_version');
    window.location.replace('/staff/public/login.html');
}

function markBadge(locationKey) {
    if (typeof window.markBadgeRead === 'function') {
        window.markBadgeRead(locationKey);
    }
}

function openMobileMenu() {
    // Remove existing if any
    var existing = document.getElementById('dynamic-mobile-menu');
    if(existing) existing.remove();

    // Create container with FLEXBOX to position content at bottom
    var container = document.createElement('div');
    container.id = 'dynamic-mobile-menu';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '9999999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.justifyContent = 'flex-end';

    // Create overlay as background
    var overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.style.zIndex = '1';
    overlay.onclick = closeMobileMenu;

    // Create content panel - NO position absolute, just flex child
    var content = document.createElement('div');
    content.style.position = 'relative';
    content.style.zIndex = '2';
    content.style.width = '100%';
    content.style.backgroundColor = '#ffffff';
    content.style.borderTopLeftRadius = '20px';
    content.style.borderTopRightRadius = '20px';
    content.style.maxHeight = '70%';
    content.style.overflowY = 'auto';
    content.style.boxShadow = '0 -4px 20px rgba(0,0,0,0.3)';

    // Header
    var header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.padding = '16px 20px';
    header.style.borderBottom = '1px solid #eee';

    var title = document.createElement('span');
    title.style.fontWeight = '600';
    title.style.fontSize = '16px';
    title.style.color = '#333';
    title.textContent = 'Menu Lainnya';

    var closeBtn = document.createElement('button');
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.color = '#666';
    closeBtn.style.padding = '4px 8px';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = closeMobileMenu;

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Menu items container
    var items = document.createElement('div');
    items.style.padding = '8px 0 16px 0';

    var menuData = [
        {icon: 'fa-user-cog', text: 'Profil', fn: 'showProfileSettings', color: '#0d6efd'},
        {icon: 'fa-capsules', text: 'Obat/Alkes', fn: 'showKelolaObatManagementPage', color: '#0d6efd'},
        {icon: 'fa-hand-holding-medical', text: 'Layanan', fn: 'showKelolaTindakanPage', color: '#0d6efd'},
        {icon: 'fa-calendar-day', text: 'Pengaturan Sesi', fn: 'showBookingSettingsPage', color: '#0d6efd'},
        {icon: 'fa-pills', text: 'Penjualan', fn: 'showPenjualanObatPage', color: '#0d6efd'},
        {icon: 'divider'},
        {icon: 'fa-sync-alt', text: 'Perbarui Aplikasi', fn: 'clearAppCache', color: '#6c757d'},
        {icon: 'divider'},
        {icon: 'fa-sign-out-alt', text: 'Logout', fn: 'handleLogout', color: '#dc3545'}
    ];

    menuData.forEach(function(item) {
        if (item.icon === 'divider') {
            var divider = document.createElement('div');
            divider.style.height = '1px';
            divider.style.background = '#eee';
            divider.style.margin = '8px 20px';
            items.appendChild(divider);
        } else {
            var link = document.createElement('a');
            link.href = '#';
            link.style.display = 'flex';
            link.style.alignItems = 'center';
            link.style.gap = '14px';
            link.style.padding = '14px 20px';
            link.style.color = item.color === '#dc3545' ? '#dc3545' : '#333';
            link.style.textDecoration = 'none';
            link.style.fontSize = '14px';
            link.onclick = function(e) {
                e.preventDefault();
                closeMobileMenu();
                if (typeof window[item.fn] === 'function') window[item.fn]();
            };

            var icon = document.createElement('i');
            icon.className = 'fas ' + item.icon;
            icon.style.width = '24px';
            icon.style.fontSize = '18px';
            icon.style.color = item.color;
            icon.style.textAlign = 'center';

            var text = document.createTextNode(' ' + item.text);

            link.appendChild(icon);
            link.appendChild(text);
            items.appendChild(link);
        }
    });

    content.appendChild(header);
    content.appendChild(items);
    container.appendChild(overlay);
    container.appendChild(content);
    document.body.appendChild(container);
    document.body.style.overflow = 'hidden';
}
function closeMobileMenu() {
    var m = document.getElementById('dynamic-mobile-menu');
    if(m) m.remove();
    document.body.style.overflow = '';
}
function clearAppCache() {
    if(!confirm('Hapus cache dan muat ulang aplikasi?\nAnda perlu login ulang.')) return;
    var done = function(){ window.location.reload(true); };
    var tasks = [];
    if('serviceWorker' in navigator) {
        tasks.push(
            navigator.serviceWorker.getRegistrations().then(function(regs){
                return Promise.all(regs.map(function(r){ return r.unregister(); }));
            })
        );
    }
    if('caches' in window) {
        tasks.push(
            caches.keys().then(function(keys){
                return Promise.all(keys.map(function(k){ return caches.delete(k); }));
            })
        );
    }
    localStorage.removeItem(window.TOKEN_KEY);
    sessionStorage.removeItem(window.TOKEN_KEY);
    Promise.all(tasks).then(done).catch(done);
}
function mobileNavClick(btn, action) {
    document.querySelectorAll('#mobile-action-bar button').forEach(function(b){b.classList.remove('active');});
    if(btn && action !== 'more') btn.classList.add('active');
}

const shellActionHandlers = {
    'open-profile-settings': function() {
        callGlobal('showProfileSettings');
    },
    'logout': function() {
        if (!callGlobal('handleLogout')) {
            logoutFallback();
        }
    },
    'show-dashboard': function() {
        callGlobal('showDashboardPage');
    },
    'show-kantor-saya': function() {
        callGlobal('showKantorSayaPage');
    },
    'show-klinik-private': function() {
        callGlobal('showKlinikPrivatePage');
        markBadge('klinik_private');
    },
    'show-antrian-online': function() {
        callGlobal('showAntrianOnlinePage');
    },
    'show-manage-patients': function() {
        callGlobal('showManagePatientsPage');
    },
    'show-tanya-dokter': function() {
        callGlobal('showTanyaDokterPage');
    },
    'mobile-nav': function(element) {
        var action = element.dataset.mobileNav || '';
        mobileNavClick(element, action);

        if (action === 'dashboard') return callGlobal('showDashboardPage');
        if (action === 'klinik') return callGlobal('showKlinikPrivatePage');
        if (action === 'docboard') return callGlobal('showDocboardPage');
        if (action === 'pasien') return callGlobal('showManagePatientsPage');
        if (action === 'tanya') return callGlobal('showTanyaDokterPage');
        if (action === 'more') return openMobileMenu();
    },
    'open-mobile-menu': function() {
        openMobileMenu();
    }
};

function bindShellActions() {
    if (shellActionsInitialized) return;
    shellActionsInitialized = true;

    document.addEventListener('click', function(event) {
        var target = event.target.closest('[data-shell-action]');
        if (!target) return;

        var actionName = target.dataset.shellAction || '';
        var handler = shellActionHandlers[actionName];
        if (typeof handler !== 'function') return;

        event.preventDefault();
        handler(target, event);
    });
}

bindShellActions();

window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.clearAppCache = clearAppCache;
window.mobileNavClick = mobileNavClick;
})();
