// JWT Authentication for Patient Registration and Login
const API_BASE_URL = '/api/patients';

// Configuration
const GOOGLE_CLIENT_ID = '738335602560-52as846lk2oo78fr38a86elu8888m7eh.apps.googleusercontent.com'; // TODO: Replace with actual Google Client ID from console.cloud.google.com
const REDIRECT_AFTER_LOGIN = '/patient-dashboard.html'; // Change to '/patient-intake.html' if you want direct form access

// Initialize Google Sign-In
function initializeGoogleSignIn() {
    // Only initialize if Google Sign-In API is loaded AND client ID is configured
    if (typeof google !== 'undefined' && google.accounts && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID') {
        try {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleGoogleSignIn
            });
            console.log('Google Sign-In initialized successfully');
        } catch (error) {
            console.error('Google Sign-In initialization error:', error);
        }
    } else if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
        console.log('Google Sign-In: Client ID not configured. See GOOGLE_OAUTH_SETUP.md');
    } else {
        console.log('Google Sign-In: API not loaded yet, will retry...');
    }
}

// Handle Google Sign-In Response
async function handleGoogleSignIn(response) {
    try {
        // Send Google credential to backend
        const res = await fetch(`${API_BASE_URL}/auth/google`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                credential: response.credential
            })
        });

        if (!res.ok) {
            throw new Error('Google sign-in failed');
        }

        const data = await res.json();
        
        // Store JWT token
        localStorage.setItem('patient_token', data.token);
        localStorage.setItem('patient_user', JSON.stringify(data.user));
        
        // Show success message
        showMessage('Login berhasil! Mengalihkan...', 'success');
        
        // Redirect to patient dashboard
        setTimeout(() => {
            window.location.href = REDIRECT_AFTER_LOGIN;
        }, 1500);
        
    } catch (error) {
        console.error('Google sign-in error:', error);
        showMessage('Login dengan Google gagal. Silakan coba lagi.', 'error');
    }
}

// Sign Up with Email
async function signUpWithEmail(fullname, email, phone, password) {
    try {
        const res = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fullname,
                email,
                phone,
                password
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Registrasi gagal');
        }

        // Store JWT token
        localStorage.setItem('patient_token', data.token);
        localStorage.setItem('patient_user', JSON.stringify(data.user));
        
        // Show success message
        showMessage('Registrasi berhasil! Mengalihkan...', 'success');
        
        // Redirect to patient dashboard
        setTimeout(() => {
            window.location.href = REDIRECT_AFTER_LOGIN;
        }, 1500);
        
    } catch (error) {
        console.error('Registration error:', error);
        showMessage(error.message, 'error');
        throw error;
    }
}

// Sign In with Email
async function signInWithEmail(email, password) {
    try {
        const res = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Login gagal');
        }

        // Store JWT token
        localStorage.setItem('patient_token', data.token);
        localStorage.setItem('patient_user', JSON.stringify(data.user));
        
        // Show success message
        showMessage('Login berhasil! Mengalihkan...', 'success');
        
        // Redirect to patient dashboard
        setTimeout(() => {
            window.location.href = REDIRECT_AFTER_LOGIN;
        }, 1500);
        
    } catch (error) {
        console.error('Login error:', error);
        showMessage(error.message, 'error');
        throw error;
    }
}

// Show Message Helper
function showMessage(message, type) {
    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'success' ? 'success' : 'danger'} alert-dismissible fade in`;
    alertDiv.innerHTML = `
        <button type="button" class="close" data-dismiss="alert">&times;</button>
        <strong>${type === 'success' ? 'Sukses!' : 'Error!'}</strong> ${message}
    `;
    
    // Insert before first section
    const firstSection = document.querySelector('section');
    if (firstSection) {
        firstSection.insertBefore(alertDiv, firstSection.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    }
}

// Check if user is already logged in
function checkAuth() {
    const token = localStorage.getItem('patient_token');
    const user = localStorage.getItem('patient_user');
    
    if (token && user) {
        // Optionally verify token with backend
        verifyToken(token);
    }
}

// Verify token validity
async function verifyToken(token) {
    try {
        const res = await fetch(`${API_BASE_URL}/verify`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            // Token invalid, clear storage
            localStorage.removeItem('patient_token');
            localStorage.removeItem('patient_user');
        }
    } catch (error) {
        console.error('Token verification error:', error);
        localStorage.removeItem('patient_token');
        localStorage.removeItem('patient_user');
    }
}

// Logout function
function logout() {
    localStorage.removeItem('patient_token');
    localStorage.removeItem('patient_user');
    window.location.href = '/index.html';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Google Sign-In with delay to ensure API is loaded
    setTimeout(() => {
        initializeGoogleSignIn();
    }, 500);
    
    // Check if user is already logged in
    checkAuth();
    
    // Google Sign-Up Button
    const googleSignUpBtn = document.getElementById('google-signup-btn');
    if (googleSignUpBtn) {
        googleSignUpBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Google Sign-In button clicked');
            console.log('Client ID:', GOOGLE_CLIENT_ID);
            console.log('Google available:', typeof google !== 'undefined');
            
            if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
                showMessage('Google Sign-In belum dikonfigurasi. Silakan gunakan email/password untuk mendaftar.', 'error');
                alert('Google Sign-In belum dikonfigurasi.\n\nSilakan gunakan formulir email/password di bawah untuk mendaftar.');
            } else if (typeof google !== 'undefined') {
                google.accounts.id.prompt();
            } else {
                showMessage('Google Sign-In tidak tersedia. Silakan gunakan email.', 'error');
            }
        });
    } else {
        console.log('Google signup button not found');
    }
    
    // Email Registration Form
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const fullname = document.getElementById('fullname').value.trim();
            const email = document.getElementById('email').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const password = document.getElementById('password').value;
            
            // Basic validation
            if (!fullname || !email || !phone || !password) {
                showMessage('Semua field harus diisi!', 'error');
                return;
            }
            
            if (password.length < 6) {
                showMessage('Password minimal 6 karakter!', 'error');
                return;
            }
            
            // Disable submit button
            const submitBtn = registerForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Mendaftar...';
            
            try {
                await signUpWithEmail(fullname, email, phone, password);
            } catch (error) {
                // Re-enable submit button
                submitBtn.disabled = false;
                submitBtn.textContent = 'DAFTAR SEKARANG';
            }
        });
    }
    
    // Login Form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            
            // Basic validation
            if (!email || !password) {
                showMessage('Email dan password harus diisi!', 'error');
                return;
            }
            
            // Disable submit button
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Masuk...';
            
            try {
                await signInWithEmail(email, password);
            } catch (error) {
                // Re-enable submit button
                submitBtn.disabled = false;
                submitBtn.textContent = 'MASUK';
            }
        });
    }
});
