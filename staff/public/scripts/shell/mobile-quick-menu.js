(function installMobileQuickMenu() {
    'use strict';
    const MAX = 5;
    const defaults = ['dashboard', 'klinik', 'docboard', 'pasien', 'tanya'];
    const keys = { 'nav-dashboard': 'dashboard', 'nav-klinik-private': 'klinik', 'nav-docboard': 'docboard',
        'nav-kelola-pasien': 'pasien', 'nav-tanya-dokter': 'tanya', 'nav-community-chat': 'community' };
    const defaultIcons = { dashboard: 'fas fa-home', klinik: 'fas fa-calendar-check', docboard: 'fas fa-procedures', pasien: 'fas fa-users' };
    const memory = new Map();
    let currentSelection = [];
    let currentUser = null;
    let closeEditor = null;

    function storageKey(user) { return 'staff_mobile_quick_menu_v1:' + String(user.id); }
    function normalize(selection, available) {
        const allowed = new Set(available.map(item => item.key));
        return [...new Set(Array.isArray(selection) ? selection : defaults)]
            .filter(key => key !== 'more' && allowed.has(key)).slice(0, MAX);
    }
    function catalog(user = currentUser) {
        if (!user) return [];
        const allowed = new Set(user.navigation || []);
        const entries = Array.from(document.querySelectorAll('.nav-sidebar .nav-item[id]')).flatMap(item => {
            if (user.is_doctor_protected ? item.style.display === 'none' : !allowed.has(item.id)) return [];
            const link = item.querySelector(':scope > .nav-link');
            const label = link?.querySelector('p');
            if (!link || !label || item.classList.contains('has-treeview') || link.getAttribute('data-widget') === 'treeview') return [];
            const text = Array.from(label.childNodes).filter(node => node.nodeType === 3)
                .map(node => node.textContent).join(' ').trim();
            if (!text) return [];
            const icon = link.querySelector('i');
            const key = keys[item.id] || item.id;
            const iconClass = defaultIcons[key] || Array.from(icon?.classList || []).filter(name => /^(fa[srb]?|fa-[a-z-]+)$/.test(name) && name !== 'fa-circle').join(' ') || 'fas fa-th-large';
            return [{ key, navId: item.id, text: key === 'klinik' ? 'Janji Temu' : key === 'pasien' ? 'Pasien' : text,
                iconClass, icon: iconClass.split(' ').find(name => name.startsWith('fa-')) || 'fa-th-large',
                run: () => document.getElementById(item.id)?.querySelector(':scope > .nav-link')?.click() }];
        });
        if (!entries.some(item => item.navId === 'nav-laboratorium') &&
            (user.is_doctor_protected || user.permissions?.includes('lab_exam.view'))) {
            entries.push({ key: 'laboratorium', text: 'Laboratorium', iconClass: 'fas fa-flask', icon: 'fa-flask',
                run: () => window.showLaboratoriumPage?.() });
        }
        entries.push({ key: 'profile', text: 'Profil', iconClass: 'fas fa-user-cog', icon: 'fa-user-cog',
            run: () => window.showProfileSettings?.() });
        return entries;
    }
    function badge(key) {
        const element = document.createElement('span');
        element.className = 'staff-conversation-badge badge badge-danger d-none';
        element.dataset.conversationBadge = key;
        element.hidden = true;
        return element;
    }
    function render(user = window.currentStaffUser || window.auth?.currentUser) {
        const bar = document.getElementById('mobile-action-bar');
        if (!bar || !user?.id) return;
        currentUser = user;
        const available = catalog(user);
        const key = storageKey(user);
        let saved = memory.get(key);
        if (!saved) {
            try { saved = JSON.parse(localStorage.getItem(key)); } catch (_) {}
        }
        currentSelection = normalize(saved, available);
        bar.querySelectorAll('[data-mobile-nav]').forEach(button => button.remove());
        const more = document.getElementById('mobile-btn-more');
        more.hidden = false;
        more.classList.remove('d-none');
        more.style.display = '';
        if (!more.querySelector('[data-conversation-badge]')) more.querySelector('.icon-wrapper').appendChild(badge('more'));
        currentSelection.forEach(key => {
            const item = available.find(entry => entry.key === key);
            const button = document.createElement('button');
            button.type = 'button';
            button.id = 'mobile-btn-' + key;
            button.dataset.shellAction = 'mobile-nav';
            button.dataset.mobileNav = key;
            const wrapper = document.createElement('span');
            wrapper.className = 'icon-wrapper';
            const icon = document.createElement('i');
            icon.className = item.iconClass;
            wrapper.appendChild(icon);
            if (['tanya', 'community'].includes(key)) wrapper.appendChild(badge(key));
            const label = document.createElement('span');
            label.textContent = item.text;
            button.append(wrapper, label);
            bar.insertBefore(button, more);
        });
        bar.hidden = false;
        bar.classList.remove('d-none');
        bar.style.display = '';
        window.syncMobileNavForPage?.(window.__currentPage || window.staffPageRegistry?.activeKey || 'dashboard');
        window.staffConversationBadges?.apply();
    }
    function navigate(key) {
        const item = catalog().find(item => item.key === key);
        if (!item) return false;
        item.run();
        return true;
    }
    function moreItems() {
        return catalog().filter(item => !currentSelection.includes(item.key)).map(item => ({ ...item, color: '#0d6efd' }));
    }
    function openEditor() {
        window.closeMobileMenu?.();
        closeEditor?.();
        const available = catalog();
        let draft = [...currentSelection];
        const host = document.createElement('div');
        host.id = 'staff-quick-menu-editor';
        host.className = 'staff-quick-menu-overlay';
        host.innerHTML = '<section class="staff-quick-menu-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-menu-title">' +
            '<h3 id="quick-menu-title">Atur Quick Menu</h3><p>Pilih maksimal 5 menu. Lainnya selalu tersedia.</p>' +
            '<p id="quick-menu-status" role="status"></p><div class="staff-quick-menu-choices"></div>' +
            '<div class="staff-quick-menu-footer"><button type="button" data-quick-cancel>Batal</button>' +
            '<button type="button" data-quick-save>Simpan</button></div></section>';
        const choices = host.querySelector('.staff-quick-menu-choices');
        function sync() {
            host.querySelector('#quick-menu-status').textContent = draft.length + ' dari ' + MAX + ' menu dipilih';
            choices.querySelectorAll('input').forEach(input => {
                input.checked = draft.includes(input.value);
                input.disabled = !input.checked && draft.length >= MAX;
            });
        }
        available.forEach(item => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = item.key;
            const icon = document.createElement('i');
            icon.className = item.iconClass;
            label.append(input, icon, document.createTextNode(item.text));
            input.addEventListener('change', () => {
                draft = draft.filter(key => key !== item.key);
                if (input.checked && draft.length < MAX) draft.push(item.key);
                sync();
            });
            choices.appendChild(label);
        });
        const previousOverflow = document.body.style.overflow;
        const focusBefore = document.activeElement;
        function close() {
            host.remove();
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKey);
            (focusBefore?.isConnected ? focusBefore : document.getElementById('mobile-btn-more'))?.focus();
            closeEditor = null;
        }
        function onKey(event) {
            if (event.key === 'Escape') close();
            if (event.key !== 'Tab') return;
            const elements = [...host.querySelectorAll('input:not(:disabled),button')];
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        host.querySelector('[data-quick-cancel]').onclick = close;
        closeEditor = close;
        host.querySelector('[data-quick-save]').onclick = () => {
            draft = normalize(draft, catalog());
            const key = storageKey(currentUser);
            memory.set(key, draft);
            try { localStorage.setItem(key, JSON.stringify(draft)); } catch (_) {
                window.showToast?.('Pengaturan berlaku selama aplikasi ini terbuka; penyimpanan perangkat tidak tersedia.', 'warning');
            }
            close();
            render(currentUser);
        };
        host.addEventListener('click', event => { if (event.target === host) close(); });
        document.body.appendChild(host);
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKey);
        sync();
        host.querySelector('input:not(:disabled),button')?.focus();
    }
    function activeKey() {
        return catalog().find(item => item.navId && document.getElementById(item.navId)?.querySelector(':scope > .nav-link.active'))?.key;
    }
    window.staffMobileQuickMenu = { render, navigate, moreItems, openEditor, normalize, storageKey, catalog, activeKey,
        selected: () => [...currentSelection] };
    window.addEventListener('staff:auth-ready', () => render());
    window.addEventListener('staff:access-changed', () => { closeEditor?.(); window.closeMobileMenu?.(); render(); });
})();
