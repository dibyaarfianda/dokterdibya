// VPS-based auth client
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
    // Call immediately with current state so caller knows the auth status right away
    try { cb(auth.currentUser); } catch (e) { console.error('onAuthStateChanged callback error:', e); }
}

function notifyAuthChange() {
    listeners.forEach(cb => {
        try { cb(auth.currentUser); } catch (e) {}
    });
}

export async function getIdToken() {
    // Check localStorage first (for "remember me"), then sessionStorage
    return localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token') || null;
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
            auth.currentUser = data.data.user || data.user;
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
            if (remember) localStorage.setItem('vps_auth_token', result.data.token);
            else sessionStorage.setItem('vps_auth_token', result.data.token);

            auth.currentUser = result.data.user || null;
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
    localStorage.removeItem('vps_auth_token');
    sessionStorage.removeItem('vps_auth_token');
    auth.currentUser = null;
    notifyAuthChange();
}

// Initialize auth state when called
export async function initAuth() {
    const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
    if (token) {
        const user = await fetchMe();
    }
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
    // Superadmin has all permissions
    if (auth.currentUser && auth.currentUser.role === 'superadmin') {
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




