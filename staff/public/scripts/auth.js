import { TOKEN_KEY } from './vps-auth-v2.js';
import {
    ROLE_IDS,
    isSuperadminRoleId,
    isSuperadminUser
} from './role-constants.js';

function $(id) { return document.getElementById(id); }

// Direct logout function - clear tokens and redirect
function doLogout() {
    console.log('[AUTH] doLogout called');

    // Clear all auth tokens
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('must_change_password');
    localStorage.removeItem('cache_version'); // Force cache refresh on next login

    // Clear window.auth if exists
    if (window.auth) {
        window.auth.currentUser = null;
    }

    console.log('[AUTH] Tokens cleared, redirecting to login...');

    // Redirect to login
    window.location.href = '/staff/public/login.html';
}

// Global logout function for mobile menu
window.handleLogout = doLogout;

// Helper functions
function isSuperadminRole(roleId) {
    return isSuperadminRoleId(roleId);
}

function isAdminRole(roleId) {
    return [ROLE_IDS.DOKTER, ROLE_IDS.ADMIN].includes(roleId);
}

function isManagementRole(roleId) {
    return [ROLE_IDS.DOKTER, ROLE_IDS.ADMIN, ROLE_IDS.MANAGERIAL].includes(roleId);
}

function isEmailLike(value) {
    return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function resolveDisplayName(user) {
    const candidate = String(user?.name || '').trim();
    if (candidate && !isEmailLike(candidate)) {
        return candidate;
    }

    const fallbackId = String(user?.id || '').trim();
    return fallbackId || 'User';
}

// Check if profile needs completion
function checkProfileCompletion(user) {
    // Skip check for superadmin/dokter
    if (user.is_superadmin || isSuperadminRole(user.role_id)) {
        return true; // Profile is complete for superadmin
    }

    // Check if profile is incomplete (no photo OR profile_completed is false)
    const hasPhoto = user.photo_url && user.photo_url.length > 0;
    const profileCompleted = user.profile_completed === true || user.profile_completed === 1;

    if (!hasPhoto || !profileCompleted) {
        console.log('Profile incomplete:', { hasPhoto, profileCompleted });
        return false;
    }

    return true;
}

async function setAuthUI(user) {
    const userInfo = $('user-info');
    const logoutBtn = $('navbar-logout-btn');
    const profileBtn = $('navbar-profile-btn');
    const navbarDivider = $('navbar-divider');

    if (user) {
        const name = resolveDisplayName(user);
        const role = user.role || '';

        // Set global user variables for real-time features
        window.currentUserId = user.id;
        window.currentUserName = name;

        // Display name with role: "dr.dibya (superadmin)"
        if (userInfo) {
            userInfo.textContent = `${name}${role ? ` (${role})` : ''}`;
        }

        if (logoutBtn) logoutBtn.classList.remove('d-none');
        if (profileBtn) profileBtn.classList.remove('d-none');
        if (navbarDivider) navbarDivider.classList.remove('d-none');

        // Update navbar user name and role
        const navbarUserName = $('navbar-user-name');
        const navbarUserRole = $('navbar-user-role');

        if (navbarUserName) {
            navbarUserName.textContent = name;
        }

        if (navbarUserRole) {
            // Get display name for role
            const roleDisplay = user.role_display_name || role || 'Staff';
            navbarUserRole.textContent = roleDisplay;

            // Set badge color based on role_id
            navbarUserRole.className = 'badge badge-sm';
            if (user.is_superadmin || isSuperadminRole(user.role_id)) {
                navbarUserRole.classList.add('badge-danger');
            } else if (user.role_id === ROLE_IDS.ADMIN) {
                navbarUserRole.classList.add('badge-warning');
            } else if (user.role_id === ROLE_IDS.MANAGERIAL) {
                navbarUserRole.classList.add('badge-info');
            } else if (user.role_id === ROLE_IDS.BIDAN) {
                navbarUserRole.style.backgroundColor = '#e91e63';
                navbarUserRole.style.color = 'white';
            } else {
                navbarUserRole.classList.add('badge-secondary');
            }
            navbarUserRole.style.fontSize = '10px';
        }

        // Profile picture from server (photo_url is now loaded with user data from auth API)
        const photoURL = user.photo_url || null;

        const navbarAvatar = $('navbar-user-avatar');
        const navbarAvatarPlaceholder = $('navbar-user-avatar-placeholder');

        if (photoURL && navbarAvatar) {
            navbarAvatar.src = photoURL;
            navbarAvatar.style.display = 'block';
            if (navbarAvatarPlaceholder) navbarAvatarPlaceholder.style.display = 'none';
        } else {
            if (navbarAvatar) navbarAvatar.style.display = 'none';
            if (navbarAvatarPlaceholder) {
                navbarAvatarPlaceholder.style.display = 'flex';
                navbarAvatarPlaceholder.style.alignItems = 'center';
                navbarAvatarPlaceholder.style.justifyContent = 'center';
            }
        }

        // Toggle superadmin items based on role_id
        const isSuperAdmin = isSuperadminUser(user);
        const isAdmin = isAdminRole(user.role_id) || isManagementRole(user.role_id);
        console.log('Checking user role:', { id: user.id, role_id: user.role_id, isSuperAdmin, isAdmin });

        // Show all superadmin-only items to superadmin and admin
        document.querySelectorAll('.superadmin-only').forEach(el => {
            if (isSuperAdmin || isAdmin) {
                el.classList.remove('d-none');
            } else {
                el.classList.add('d-none');
            }
        });

        document.querySelectorAll('.superadmin-exclusive').forEach(el => {
            if (isSuperAdmin) {
                el.classList.remove('d-none');
            } else {
                el.classList.add('d-none');
            }
        });

        // Check profile completion after UI is set
        setTimeout(() => {
            if (!checkProfileCompletion(user)) {
                console.log('Showing profile completion modal');
                if (typeof window.showProfileCompletionModal === 'function') {
                    window.showProfileCompletionModal();
                }
            }
        }, 500);
    } else {
        // User logged out - redirect to login page
        window.location.replace('login.html');
    }
}

// Login form is now in separate login.html page

function bindLogout() {
    // Logout is now handled by onclick in HTML with direct href to login.html
    // No need for JavaScript event listener
}

export function initAuth(userFromCaller) {
    bindLogout();
    // Accept user from caller (index-adminlte.html passes it) or fallback to window.auth
    // This avoids module instance mismatch issues with cache-busted imports
    const user = userFromCaller || window.auth?.currentUser;
    console.log('[AUTH UI] initAuth called, user:', user?.id, user?.name);
    if (user) {
        setAuthUI(user);
    } else {
        console.warn('[AUTH UI] No user available for setAuthUI');
    }
}


