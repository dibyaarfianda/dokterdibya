(function installStaffCompactSidebar() {
    'use strict';

    const GROUPS = [
        { key: 'klinik', label: 'Klinik & Jadwal', icon: 'fa-calendar-alt' },
        { key: 'pasien', label: 'Pasien', icon: 'fa-users' },
        { key: 'percakapan', label: 'Percakapan', icon: 'fa-comments' },
        { key: 'konten', label: 'Konten Pasien', icon: 'fa-book-open' },
        { key: 'operasional', label: 'Obat & Tindakan', icon: 'fa-capsules' },
        { key: 'keuangan', label: 'Keuangan & Tim', icon: 'fa-wallet' },
        { key: 'monitoring', label: 'Monitoring', icon: 'fa-chart-line' },
        { key: 'sistem', label: 'Sistem', icon: 'fa-cog' }
    ];
    const SHORTCUTS = {
        dokter: ['nav-dashboard', 'nav-klinik-private', 'nav-antrian-online', 'nav-kelola-pasien', 'nav-tanya-dokter'],
        staff: ['nav-dashboard', 'nav-kantor-saya', 'nav-antrian-online', 'nav-kelola-pasien', 'nav-pasien-baru']
    };
    const HEADER_GROUPS = {
        BERANDA: 'klinik', KLINIK: 'klinik', PASIEN: 'pasien',
        KOMUNIKASI: 'percakapan', OPERASIONAL: 'operasional',
        MONITORING: 'monitoring', SISTEM: 'sistem'
    };
    const CONTENT_IDS = new Set([
        'nav-voting', 'nav-birth-class', 'nav-birth-congrats', 'nav-birth-testimonials',
        'nav-artikel-kesehatan', 'nav-ruang-cerita'
    ]);
    const FINANCE_IDS = new Set([
        'nav-invoice-history', 'nav-finance-analysis', 'nav-staff-briefing', 'nav-private'
    ]);

    const nav = document.querySelector('.main-sidebar .nav-sidebar');
    const sidebar = document.querySelector('.main-sidebar .sidebar');
    const aside = document.querySelector('.main-sidebar');
    if (!nav || !sidebar || !aside) return;

    const originalNodes = Array.from(nav.children);
    const originalItems = originalNodes.filter(node => node.classList?.contains('nav-item'));
    const groups = new Map();
    const openGroups = new Set();
    const searchOpenedItems = new Set();
    let attached = false;
    let currentUser = null;
    let searchInput = null;
    let onlineObserver = null;
    let badgeObserver = null;
    let activeObserver = null;
    let searchWrap = null;
    let collapseButton = null;
    let searchToggle = null;
    let onlineButton = null;

    function isDesktop() {
        return window.matchMedia('(min-width: 992px)').matches &&
            !document.documentElement.classList.contains('mobile-app-mode');
    }

    function isDoctor() {
        return Boolean(window.staffRoleConstants?.isSuperadminUser?.(currentUser));
    }

    function isAllowed(item) {
        return !item.hidden && !item.classList.contains('d-none') &&
            item.style.display !== 'none' && item.getAttribute('aria-hidden') !== 'true';
    }

    function menuLabel(item) {
        const label = item.querySelector(':scope > .nav-link > p');
        if (!label) return item.textContent.trim();
        return Array.from(label.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent).join(' ').trim() || label.textContent.trim();
    }

    function groupFor(item, header) {
        if (CONTENT_IDS.has(item.id)) return 'konten';
        if (FINANCE_IDS.has(item.id)) return 'keuangan';
        return HEADER_GROUPS[header] || 'sistem';
    }

    function makeButton(id, label, icon) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
        return button;
    }

    function makeGroup(definition) {
        const item = document.createElement('li');
        item.className = 'nav-item staff-compact-group';
        item.dataset.group = definition.key;
        const button = makeButton(`staff-compact-group-${definition.key}`, definition.label, definition.icon);
        button.className = 'staff-compact-group-button';
        button.innerHTML += `<span class="staff-compact-label">${definition.label}</span>` +
            '<span class="staff-compact-group-badge" hidden></span>' +
            '<i class="fas fa-chevron-down staff-compact-chevron" aria-hidden="true"></i>';
        button.setAttribute('aria-expanded', 'false');
        const list = document.createElement('ul');
        list.className = 'nav nav-treeview';
        list.id = `staff-compact-list-${definition.key}`;
        button.setAttribute('aria-controls', list.id);
        item.append(button, list);
        const positionFlyout = () => {
            const top = Math.max(8, Math.min(item.getBoundingClientRect().top, window.innerHeight - 320));
            list.style.top = `${top}px`;
        };
        item.addEventListener('mouseenter', positionFlyout);
        item.addEventListener('focusin', positionFlyout);
        button.addEventListener('click', () => {
            if (openGroups.has(definition.key)) openGroups.delete(definition.key);
            else openGroups.add(definition.key);
            refresh();
        });
        groups.set(definition.key, { item, button, list });
        return item;
    }

    function makeControls() {
        searchWrap = document.createElement('div');
        searchWrap.className = 'staff-compact-search-wrap';
        searchWrap.innerHTML = '<i class="fas fa-search" aria-hidden="true"></i>';
        searchInput = document.createElement('input');
        searchInput.id = 'staff-compact-search';
        searchInput.type = 'search';
        searchInput.placeholder = 'Cari menu...';
        searchInput.setAttribute('aria-label', 'Cari menu staff');
        searchInput.autocomplete = 'off';
        searchWrap.appendChild(searchInput);
        searchInput.addEventListener('input', refresh);
        sidebar.insertBefore(searchWrap, sidebar.querySelector('nav'));

        collapseButton = makeButton('staff-compact-collapse', 'Ciutkan sidebar', 'fa-angle-double-left');
        collapseButton.className = 'staff-compact-collapse';
        collapseButton.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-collapse');
            const collapsed = document.body.classList.contains('sidebar-collapse');
            collapseButton.setAttribute('aria-label', collapsed ? 'Bentangkan sidebar' : 'Ciutkan sidebar');
            collapseButton.title = collapsed ? 'Bentangkan sidebar' : 'Ciutkan sidebar';
        });
        sidebar.querySelector('.sidebar-logo')?.appendChild(collapseButton);

        searchToggle = makeButton('staff-compact-search-toggle', 'Cari menu', 'fa-search');
        searchToggle.className = 'staff-compact-search-toggle';
        searchToggle.addEventListener('click', () => {
            document.body.classList.remove('sidebar-collapse');
            searchInput.focus();
        });
        sidebar.insertBefore(searchToggle, searchWrap);

        onlineButton = makeButton('staff-compact-online', 'Tampilkan pengguna online', 'fa-circle');
        onlineButton.className = 'staff-compact-online';
        onlineButton.innerHTML += '<span>Online <strong id="staff-compact-online-count">0</strong></span>';
        onlineButton.addEventListener('click', () => {
            const open = sidebar.classList.toggle('staff-compact-online-open');
            onlineButton.setAttribute('aria-expanded', String(open));
        });
        onlineButton.setAttribute('aria-expanded', 'false');
        sidebar.insertBefore(onlineButton, document.getElementById('online-users-panel'));
        const count = document.getElementById('online-count');
        if (count) {
            const syncCount = () => {
                const target = document.getElementById('staff-compact-online-count');
                if (target) target.textContent = count.textContent.trim();
            };
            syncCount();
            onlineObserver = new MutationObserver(syncCount);
            onlineObserver.observe(count, { childList: true, characterData: true, subtree: true });
        }
    }

    function attach() {
        if (attached || !isDesktop()) return false;
        attached = true;
        aside.classList.add('staff-compact-enabled');
        makeControls();
        nav.replaceChildren();
        const heading = document.createElement('li');
        heading.className = 'nav-header staff-compact-shortcuts-label';
        heading.textContent = 'PINTASAN';
        const shortcutHost = document.createElement('li');
        shortcutHost.className = 'staff-compact-shortcuts-host';
        const shortcutList = document.createElement('ul');
        shortcutList.id = 'staff-compact-shortcuts';
        shortcutList.className = 'nav nav-pills flex-column';
        shortcutHost.appendChild(shortcutList);
        nav.append(heading, shortcutHost);
        GROUPS.forEach(definition => nav.appendChild(makeGroup(definition)));
        const empty = document.createElement('li');
        empty.id = 'staff-compact-empty';
        empty.className = 'staff-compact-empty';
        empty.textContent = 'Menu tidak ditemukan';
        empty.hidden = true;
        nav.appendChild(empty);

        const shortcuts = new Set(SHORTCUTS[isDoctor() ? 'dokter' : 'staff']);
        let header = '';
        originalNodes.forEach(node => {
            if (node.classList?.contains('nav-header')) {
                header = node.textContent.trim();
                return;
            }
            if (!node.classList?.contains('nav-item')) return;
            const link = node.querySelector(':scope > .nav-link');
            if (link) link.title = menuLabel(node);
            if (shortcuts.has(node.id)) {
                shortcutList.appendChild(node);
                if (link) {
                    const railBadge = document.createElement('span');
                    railBadge.className = 'staff-compact-rail-badge';
                    railBadge.hidden = true;
                    link.appendChild(railBadge);
                }
            } else {
                groups.get(groupFor(node, header)).list.appendChild(node);
            }
        });
        badgeObserver = new MutationObserver(() => {
            if (attached) refreshBadges();
        });
        originalItems.forEach(item => {
            item.querySelectorAll('.badge').forEach(badge => {
                badgeObserver.observe(badge, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
            });
        });
        activeObserver = new MutationObserver(refresh);
        originalItems.forEach(item => {
            item.querySelectorAll('.nav-link').forEach(link => {
                activeObserver.observe(link, { attributes: true, attributeFilter: ['class'] });
            });
        });
        refresh();
        return true;
    }

    function badgeCount(item) {
        return Array.from(item.querySelectorAll('.badge')).reduce((total, badge) => {
            if (badge.hidden || badge.classList.contains('d-none') || badge.style.display === 'none') return total;
            const count = Number.parseInt(badge.textContent.trim(), 10);
            return total + (Number.isFinite(count) && count > 0 ? count : 0);
        }, 0);
    }

    function refreshBadges() {
        groups.forEach(group => {
            const badge = group.button.querySelector('.staff-compact-group-badge');
            const total = Array.from(group.list.children).reduce((sum, item) => sum + (isAllowed(item) ? badgeCount(item) : 0), 0);
            badge.hidden = total === 0;
            badge.textContent = total > 99 ? '99+' : String(total);
        });
        const shortcuts = document.getElementById('staff-compact-shortcuts');
        shortcuts?.querySelectorAll(':scope > .nav-item').forEach(item => {
            const badge = item.querySelector('.staff-compact-rail-badge');
            if (!badge) return;
            const count = isAllowed(item) ? badgeCount(item) : 0;
            badge.hidden = count === 0;
            badge.textContent = count > 99 ? '99+' : String(count);
        });
    }

    function refresh() {
        if (!attached) return;
        const query = searchInput.value.trim().toLocaleLowerCase('id');
        let matches = 0;
        document.querySelectorAll('#staff-compact-shortcuts > .nav-item').forEach(item => {
            const match = isAllowed(item) && (!query || menuLabel(item).toLocaleLowerCase('id').includes(query));
            item.classList.toggle('staff-compact-filtered', !match);
            if (match) matches++;
        });
        groups.forEach((group, key) => {
            let visible = 0;
            let active = false;
            Array.from(group.list.children).forEach(item => {
                const allowed = isAllowed(item);
                const ownMatch = !query || menuLabel(item).toLocaleLowerCase('id').includes(query);
                let nestedMatches = 0;
                const nestedList = item.querySelector(':scope > .nav-treeview');
                nestedList?.querySelectorAll(':scope > .nav-item').forEach(child => {
                    const childMatch = allowed && isAllowed(child) &&
                        (ownMatch || menuLabel(child).toLocaleLowerCase('id').includes(query));
                    child.classList.toggle('staff-compact-filtered', !childMatch);
                    if (childMatch) nestedMatches++;
                });
                if (query && nestedMatches > 0 && !ownMatch) {
                    if (!item.classList.contains('menu-open')) searchOpenedItems.add(item);
                    item.classList.add('menu-open');
                    if (nestedList) nestedList.style.display = 'block';
                } else if (searchOpenedItems.has(item)) {
                    item.classList.remove('menu-open');
                    searchOpenedItems.delete(item);
                    if (nestedList) nestedList.style.display = '';
                }
                const match = allowed && (ownMatch || nestedMatches > 0);
                item.classList.toggle('staff-compact-filtered', !match);
                if (match) visible++;
                if (allowed && item.querySelector('.nav-link.active')) active = true;
            });
            const open = query ? visible > 0 : openGroups.has(key) || active;
            group.item.style.display = visible > 0 ? '' : 'none';
            group.item.classList.toggle('menu-open', open);
            group.list.style.display = open ? 'block' : 'none';
            group.button.classList.toggle('active', active);
            group.button.setAttribute('aria-expanded', String(open));
            matches += visible;
        });
        const empty = document.getElementById('staff-compact-empty');
        if (empty) empty.hidden = !query || matches > 0;
        refreshBadges();
    }

    function detach() {
        if (!attached) return;
        attached = false;
        badgeObserver?.disconnect();
        activeObserver?.disconnect();
        onlineObserver?.disconnect();
        groups.clear();
        openGroups.clear();
        searchOpenedItems.clear();
        originalItems.forEach(item => {
            item.classList.remove('staff-compact-filtered');
            item.querySelector('.staff-compact-rail-badge')?.remove();
        });
        nav.replaceChildren(...originalNodes);
        searchWrap?.remove();
        collapseButton?.remove();
        searchToggle?.remove();
        onlineButton?.remove();
        sidebar.classList.remove('staff-compact-online-open');
        aside.classList.remove('staff-compact-enabled');
    }

    function syncViewport() {
        if (isDesktop()) attach();
        else detach();
    }

    window.staffCompactSidebar = {
        init(user) {
            currentUser = user;
            const result = attach();
            if (attached) refresh();
            return result || attached;
        },
        refresh,
        destroy: detach
    };
    window.addEventListener('resize', syncViewport);
    document.addEventListener('staffPageChanged', refresh);
})();
