function isAccountMode(user) {
    return Boolean(user) && !user?.is_doctor_protected && user?.user_type !== 'patient';
}

function hasNoGrantedAccess(user) {
    return isAccountMode(user) && (!Array.isArray(user.permissions) || user.permissions.length === 0);
}

const MOBILE_QUICK_NAVIGATION = {
    'mobile-btn-dashboard': 'nav-dashboard',
    'mobile-btn-klinik': 'nav-klinik-private',
    'mobile-btn-docboard': 'nav-docboard',
    'mobile-btn-pasien': 'nav-kelola-pasien',
    'mobile-btn-tanya': 'nav-tanya-dokter'
};

export function hasAccountPermission(permission, user = window.currentStaffUser || window.auth?.currentUser) {
    if (!isAccountMode(user)) return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

function setElementVisible(element, visible) {
    if (!element) return;
    element.style.display = visible ? '' : 'none';
    element.classList.toggle('d-none', !visible);
    if (visible) element.removeAttribute('hidden');
    else element.setAttribute('hidden', 'hidden');
}

function syncSidebarHeaders() {
    document.querySelectorAll('.nav-sidebar > .nav-header').forEach(header => {
        let sibling = header.nextElementSibling;
        let hasVisibleItem = false;
        while (sibling && !sibling.classList.contains('nav-header')) {
            if (sibling.classList.contains('nav-item') && sibling.style.display !== 'none' && !sibling.hidden) {
                hasVisibleItem = true;
                break;
            }
            sibling = sibling.nextElementSibling;
        }
        header.style.display = hasVisibleItem ? '' : 'none';
    });
}

function syncAccountPermissionElements(user) {
    document.querySelectorAll('[data-account-permission]').forEach(element => {
        setElementVisible(element, hasAccountPermission(element.dataset.accountPermission, user));
    });
}

function syncMobileActionBar(user) {
    const bar = document.getElementById('mobile-action-bar');
    if (!bar) return;
    const allowedNavigation = new Set(user.navigation || []);
    const quickNavigation = new Set(Object.values(MOBILE_QUICK_NAVIGATION));
    let visibleQuickActions = 0;
    Object.entries(MOBILE_QUICK_NAVIGATION).forEach(([buttonId, navigationId]) => {
        const visible = allowedNavigation.has(navigationId);
        setElementVisible(document.getElementById(buttonId), visible);
        if (visible) visibleQuickActions += 1;
    });
    const hasOtherNavigation = Array.from(allowedNavigation).some(id => !quickNavigation.has(id));
    setElementVisible(document.getElementById('mobile-btn-more'), hasOtherNavigation);
    setElementVisible(bar, visibleQuickActions > 0 || hasOtherNavigation);
}

function openFirstGrantedNavigation(user) {
    if (window.__currentPage !== 'no-access') return false;
    const navigation = Array.isArray(user.navigation) ? user.navigation : [];
    if (navigation.includes('nav-dashboard')) {
        window.showDashboardPage?.();
        return true;
    }
    for (const navigationId of navigation) {
        const link = document.getElementById(navigationId)?.querySelector(':scope > .nav-link');
        if (!link) continue;
        link.click();
        return true;
    }
    return false;
}

window.hasAccountPermission = permission => hasAccountPermission(permission);
window.syncAccountPermissionElements = () => {
    const user = window.currentStaffUser || window.auth?.currentUser;
    if (user) syncAccountPermissionElements(user);
};

export function applyAccountAccess(user, access = null) {
    if (access) {
        user.permissions = Array.isArray(access.permissions) ? access.permissions : [];
        user.navigation = Array.isArray(access.navigation) ? access.navigation : [];
        user.access_mode = access.mode || user.access_mode;
        user.access_version = access.access_version || user.access_version;
        user.is_doctor_protected = Boolean(access.is_doctor_protected);
        user.role_display_name = access.job_label || user.role_display_name;
    }
    if (!isAccountMode(user)) return false;

    const allowedNavigation = new Set(user.navigation || []);
    document.querySelectorAll('.nav-sidebar .nav-item[id]').forEach(item => {
        setElementVisible(item, allowedNavigation.has(item.id));
    });
    syncAccountPermissionElements(user);
    syncSidebarHeaders();
    syncMobileActionBar(user);

    // Profile remains available from the navbar even when the account has no grants.
    setElementVisible(document.getElementById('navbar-profile-btn'), true);
    setElementVisible(document.getElementById('navbar-logout-btn'), true);

    document.body.dataset.staffAccessMode = 'account';
    document.body.dataset.staffAccessVersion = String(user.access_version || 1);
    const noGrantedAccess = hasNoGrantedAccess(user);
    if (noGrantedAccess) {
        document.querySelectorAll('.navbar-queue-control, .navbar-doctor-control, .navbar-break-control')
            .forEach(element => setElementVisible(element, false));
        window.showNoAccessPage?.();
    }
    return true;
}

export function installAccountAccessListener(auth) {
    window.addEventListener('staff:access-changed', event => {
        if (!auth?.currentUser || !event.detail) return;
        const hadNoGrantedAccess = hasNoGrantedAccess(auth.currentUser);
        applyAccountAccess(auth.currentUser, event.detail);
        const noGrantedAccess = hasNoGrantedAccess(auth.currentUser);
        if (!noGrantedAccess) {
            window.staffCompactSidebar?.init(auth.currentUser);
            window.staffCompactSidebar?.refresh();
            if (hadNoGrantedAccess || window.__currentPage === 'no-access') {
                openFirstGrantedNavigation(auth.currentUser);
            }
            return;
        }
        window.staffCompactSidebar?.refresh();
    });
}

export { hasNoGrantedAccess, isAccountMode };
