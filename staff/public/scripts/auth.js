import { auth, onAuthStateChanged, signOut } from './vps-auth-v2.js';

function $(id) { return document.getElementById(id); }

async function setAuthUI(user) {
    const userInfo = $('user-info');
    const logoutBtn = $('navbar-logout-btn');
    const profileBtn = $('navbar-profile-btn');
    const navbarDivider = $('navbar-divider');
    
    if (user) {
        const name = user.name || user.email;
        const role = user.role || '';
        
        // Set global user variables for real-time features
        window.currentUserId = user.id;
        window.currentUserName = user.name || user.email;
        
        // Display name with role: "dr.dibya (superadmin)"
        if (userInfo) {
            userInfo.textContent = `${name}${role ? ` (${role})` : ''}`;
        }
        
        if (logoutBtn) logoutBtn.classList.remove('d-none');
        if (profileBtn) profileBtn.classList.remove('d-none');
        if (navbarDivider) navbarDivider.classList.remove('d-none');
        
        // Profile picture from server (photo_url is now loaded with user data from auth API)
        const photoURL = user.photo_url || null;
        
        const navbarAvatar = $('navbar-user-avatar');
        
        if (photoURL && navbarAvatar) {
            navbarAvatar.src = photoURL;
            navbarAvatar.style.display = 'inline-block';
        } else if (navbarAvatar) {
            navbarAvatar.style.display = 'none';
        }
        
        // Toggle superadmin items based on role
        const isSuperAdmin = user.is_superadmin || user.role === 'dokter' || user.role === 'superadmin';
        const isAdmin = user.role === 'admin' || user.role === 'managerial';
        console.log('Checking user role:', { id: user.id, role: user.role, isSuperAdmin, isAdmin });
        
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
    } else {
        // User logged out - redirect to login page
        window.location.replace('login.html');
    }
}

// Login form is now in separate login.html page

function bindLogout() {
    const logoutBtn = $('navbar-logout-btn');
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await signOut(); } catch(e) {}
    });
}

export function initAuth() {
    bindLogout();
    onAuthStateChanged((user) => setAuthUI(user));
}


