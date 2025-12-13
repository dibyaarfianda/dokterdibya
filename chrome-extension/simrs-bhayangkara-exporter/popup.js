/**
 * RS Bhayangkara Exporter - Popup Script
 */

const API_BASE = 'https://dokterdibya.com';

document.addEventListener('DOMContentLoaded', async () => {
    // Check if already logged in
    const storage = await chrome.storage.local.get(['dibya_token', 'dibya_email']);
    
    if (storage.dibya_token) {
        showLoggedIn(storage.dibya_email);
    } else {
        showLogin();
    }

    // Login button handler
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    
    // Logout button handler
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    
    // Enter key on password field
    document.getElementById('password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
});

async function handleLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const statusEl = document.getElementById('login-status');

    if (!email || !password) {
        showStatus('Masukkan email dan password', 'error');
        return;
    }

    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    try {
        const response = await fetch(API_BASE + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const result = await response.json();

        if (result.success && result.token) {
            // Save token
            await chrome.storage.local.set({
                'dibya_token': result.token,
                'dibya_email': email,
                'dibya_user': result.user
            });

            showStatus('Login berhasil!', 'success');
            setTimeout(() => showLoggedIn(email), 1000);
        } else {
            showStatus(result.message || 'Login gagal', 'error');
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Login';
}

async function handleLogout() {
    await chrome.storage.local.remove(['dibya_token', 'dibya_email', 'dibya_user']);
    showLogin();
}

function showLogin() {
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('logged-section').classList.add('hidden');
    document.getElementById('login-status').classList.add('hidden');
}

function showLoggedIn(email) {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('logged-section').classList.remove('hidden');
    document.getElementById('user-email').textContent = email || 'Unknown';
}

function showStatus(message, type) {
    const statusEl = document.getElementById('login-status');
    statusEl.textContent = message;
    statusEl.className = 'status status-' + type;
    statusEl.classList.remove('hidden');
}
