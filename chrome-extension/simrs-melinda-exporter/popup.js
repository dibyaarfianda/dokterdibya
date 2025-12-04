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
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('logged-in-section').style.display = 'none';
}

// Show logged in section
function showLoggedIn(user) {
    console.log('showLoggedIn:', user);
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('logged-in-section').style.display = 'block';
    document.getElementById('user-name').textContent = user.name || user.email || 'User';
    document.getElementById('user-role').textContent = user.role || user.role_name || 'Staff';
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
            await chrome.storage.local.set({
                'dibya_token': token,
                'dibya_user': user || { email: email, name: email.split('@')[0] }
            });

            showMessage('Login berhasil!', false);

            // Switch view
            setTimeout(function() {
                showLoggedIn(user || { email: email });
            }, 500);
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
