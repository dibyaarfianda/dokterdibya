// VPS-based auth client

// ==================== CONSTANTS ====================
// Single source of truth for auth-related keys
export const TOKEN_KEY = 'vps_auth_token';  // Use this everywhere!

// Dynamically determine API_BASE based on current host
const API_BASE = (() => {
    // Check if running locally
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    // Default to the current origin so API calls stay same-host in production
    return window.location.origin.replace(/\/$/, '');
})();

export const auth = {
    currentUser: null
};

const listeners = [];

export function onAuthStateChanged(cb) {
    if (typeof cb !== 'function') return;
    listeners.push(cb);
    console.log('[AUTH] onAuthStateChanged registered, current user:', auth.currentUser?.id || 'null');
    // Call immediately with current state so caller knows the auth status right away
    try { cb(auth.currentUser); } catch (e) { console.error('onAuthStateChanged callback error:', e); }
}

function notifyAuthChange() {
    console.log('[AUTH] notifyAuthChange called, user:', auth.currentUser?.id || 'null', 'listeners:', listeners.length);
    listeners.forEach(cb => {
        try { cb(auth.currentUser); } catch (e) { console.error('[AUTH] Listener error:', e); }
    });
}

// Normalize user object to have both 'id' and 'uid' for compatibility
// Firebase uses 'uid', VPS auth uses 'id' - this ensures both work
function normalizeUser(user) {
    if (!user) return null;
    // Add uid as alias for id (Firebase compatibility)
    if (user.id && !user.uid) {
        user.uid = user.id;
    }
    // Add id as alias for uid (VPS compatibility)
    if (user.uid && !user.id) {
        user.id = user.uid;
    }
    return user;
}

export async function getIdToken() {
    // Check localStorage first (for "remember me"), then sessionStorage
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
}

export async function fetchMe() {
    const token = await getIdToken();
    if (!token) return null;
    try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.success) {
            // Auto-refresh: if backend returned a new token (role changed), store it
            if (data.data.token && data.data.token_refreshed) {
                console.log('[AUTH] Role changed - storing refreshed token');
                // Store in same location as original token
                if (localStorage.getItem(TOKEN_KEY)) {
                    localStorage.setItem(TOKEN_KEY, data.data.token);
                } else {
                    sessionStorage.setItem(TOKEN_KEY, data.data.token);
                }
            }
            auth.currentUser = normalizeUser(data.data.user || data.user);
            notifyAuthChange();
            return auth.currentUser;
        }
    } catch (err) {
        console.error('fetchMe error', err);
    }
    return null;
}

export async function signIn(email, password, remember = false) {
    try {
        console.log('[AUTH] Attempting login for:', email);
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        console.log('[AUTH] Login response status:', res.status);
        
        if (!res.ok) {
            const err = await res.json().catch(()=>({message:'Login failed'}));
            console.error('[AUTH] Login failed:', res.status, err);
            throw new Error(err.message || 'Login failed');
        }
        const result = await res.json();
        console.log('[AUTH] Login result:', result);
        
        if (result && result.success && result.data.token) {
            if (remember) localStorage.setItem(TOKEN_KEY, result.data.token);
            else sessionStorage.setItem(TOKEN_KEY, result.data.token);

            // Store must_change_password flag
            if (result.data.user && result.data.user.must_change_password) {
                localStorage.setItem('must_change_password', 'true');
            } else {
                localStorage.removeItem('must_change_password');
            }

            auth.currentUser = normalizeUser(result.data.user) || null;
            notifyAuthChange();
            return result;
        } else {
            console.error('[AUTH] Invalid result structure:', result);
            throw new Error(result.message || 'Login failed');
        }
    } catch (err) {
        console.error('signInUser error', err);
        throw err;
    }
}

export async function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('must_change_password');
    auth.currentUser = null;
    notifyAuthChange();
}

// Initialize auth state when called
export async function initAuth() {
    console.log('[AUTH] initAuth starting...');
    const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    console.log('[AUTH] Token found:', !!token);
    if (token) {
        const user = await fetchMe();
        console.log('[AUTH] fetchMe returned:', user?.id || 'null');
        if (user) {
            // fetchMe already normalizes, but ensure consistency
            auth.currentUser = normalizeUser(user);
            console.log('[AUTH] currentUser set to:', auth.currentUser?.id, auth.currentUser?.name);
        }
    }
    console.log('[AUTH] Calling notifyAuthChange from initAuth');
    notifyAuthChange();
}

// Permission checking
let userPermissions = null;

export async function fetchUserPermissions() {
    if (!auth.currentUser) return [];
    
    const token = await getIdToken();
    if (!token) return [];
    
    try {
        const res = await fetch(`${API_BASE}/api/users/${auth.currentUser.id}/permissions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) return [];
        
        const data = await res.json();
        if (data && data.success && data.data) {
            userPermissions = data.data.permissions || [];
            return userPermissions;
        }
    } catch (err) {
        console.error('fetchUserPermissions error', err);
    }
    return [];
}

export async function hasPermission(permissionName) {
    // Superadmin/Dokter has all permissions
    if (auth.currentUser && (auth.currentUser.is_superadmin || auth.currentUser.role === 'dokter' || auth.currentUser.role === 'superadmin')) {
        return true;
    }
    
    // Fetch permissions if not already loaded
    if (userPermissions === null) {
        await fetchUserPermissions();
    }
    
    // Check if user has the specific permission
    return userPermissions && userPermissions.includes(permissionName);
}

export function clearPermissionsCache() {
    userPermissions = null;
}

// Auto-initialize current user if token present
(async function() {
    // Delay initialization to allow listeners to be registered first
    setTimeout(async () => {
        await initAuth();
    }, 100);
})();




