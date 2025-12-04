/**
 * SIMRS Melinda Exporter - Popup Script
 */

const API_BASE = 'https://dokterdibya.com';

// Check if already logged in
async function checkAuth() {
    try {
        const storage = await chrome.storage.local.get(['dibya_token', 'dibya_user']);
        console.log('checkAuth:', storage);

        if (storage.dibya_token && storage.dibya_user) {
            showLoggedIn(storage.dibya_user);
        } else {
            showLogin();
        }
    } catch (e) {
        console.error('checkAuth error:', e);
        showLogin();
    }
}

// Show login section
function showLogin() {
    var loginSection = document.getElementById('login-section');
    var loggedInSection = document.getElementById('logged-in-section');

    if (loginSection) {
        loginSection.style.setProperty('display', 'block', 'important');
    }
    if (loggedInSection) {
        loggedInSection.style.setProperty('display', 'none', 'important');
    }
}

// Show logged in section
function showLoggedIn(user) {
    console.log('showLoggedIn called with:', user);

    var loginSection = document.getElementById('login-section');
    var loggedInSection = document.getElementById('logged-in-section');

    console.log('loginSection:', loginSection);
    console.log('loggedInSection:', loggedInSection);

    if (loginSection) {
        loginSection.style.setProperty('display', 'none', 'important');
    }
    if (loggedInSection) {
        loggedInSection.style.setProperty('display', 'block', 'important');
    }

    var userName = user && (user.name || user.email) ? (user.name || user.email) : 'User';
    var userRole = user && (user.role || user.role_name) ? (user.role || user.role_name) : 'Staff';

    document.getElementById('user-name').textContent = userName;
    document.getElementById('user-role').textContent = userRole;

    console.log('View switched to logged in');
}

// Show message
function showMessage(message, isError) {
    const el = document.getElementById('error-message');
    el.textContent = message;
    el.style.display = 'block';
    if (isError) {
        el.style.background = '#f8d7da';
        el.style.color = '#721c24';
    } else {
        el.style.background = '#d4edda';
        el.style.color = '#155724';
    }
}

// Handle login form
document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');

    btn.disabled = true;
    btn.textContent = 'Logging in...';

    try {
        const response = await fetch(API_BASE + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        });

        const result = await response.json();
        console.log('Login result:', result);

        // Extract token and user from response
        // API returns: { success: true, data: { token, user } }
        let token = null;
        let user = null;

        if (result.data && result.data.token) {
            token = result.data.token;
            user = result.data.user;
        } else if (result.token) {
            token = result.token;
            user = result.user;
        }

        console.log('Token:', token ? 'found' : 'not found');
        console.log('User:', user);

        if (token) {
            // Save to storage
            var userData = user || { email: email, name: email.split('@')[0] };
            await chrome.storage.local.set({
                'dibya_token': token,
                'dibya_user': userData
            });

            // Switch view immediately
            console.log('Switching to logged in view...');
            showLoggedIn(userData);
        } else {
            showMessage(result.message || 'Login gagal', true);
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('Tidak dapat terhubung ke server', true);
    }

    btn.disabled = false;
    btn.textContent = 'Login';
});

// Handle logout
document.getElementById('logout-btn').addEventListener('click', async function() {
    await chrome.storage.local.remove(['dibya_token', 'dibya_user']);
    document.getElementById('error-message').style.display = 'none';
    showLogin();
});

// Init
checkAuth();
