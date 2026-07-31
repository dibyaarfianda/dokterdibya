// JWT Authentication for Patient Registration and Login
const API_BASE_URL = '/api/patients';

// Configuration
const GOOGLE_CLIENT_ID = '738335602560-ab9ihfr7eei5phhvo724iu0ebro9aed5.apps.googleusercontent.com'; // TODO: Replace with actual Google Client ID from console.cloud.google.com
const REDIRECT_AFTER_LOGIN = '/patient-menu.html'; // Change to '/patient-intake.html' if you want direct form access

// Suppress Google Sign-In related errors globally
window.addEventListener('error', function(event) {
    if (event.message && (
        event.message.includes('FedCM') || 
        event.message.includes('Third-party') ||
        event.message.includes('GSI_LOGGER') ||
        event.filename?.includes('accounts.google.com')
    )) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }
});

// Initialize Google Sign-In
function initializeGoogleSignIn() {
    console.log('Legacy Google buttons use patient-login.html as the canonical auth flow.');
}

// Disable Google Sign-In buttons with message
function disableGoogleSignInButtons(message) {
    const buttons = ['google-signup-btn', 'google-signin-btn'];
    buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.title = message;
            btn.onclick = (e) => {
                e.preventDefault();
                showMessage(message + ' Silakan gunakan email dan password.', 'warning');
            };
        }
    });
}

function storePatientSession(data, provider) {
    window.PatientSession?.clearAuth();
    localStorage.removeItem('patient_intake_draft_v3');

    window.PatientSession?.setToken(data.token, { persistent: true });
    window.PatientSession?.setUser(data.user || {}, { persistent: true });
    localStorage.setItem('patient_name', data.user?.full_name || data.user?.name || '');
    localStorage.setItem('patient_email', data.user?.email || '');
    localStorage.setItem('auth_provider', provider);
}

// Legacy Google buttons should enter the canonical patient-login.html flow.
function triggerGooglePrompt(mode = 'login') {
    const params = new URLSearchParams();
    params.set('mode', mode === 'register' ? 'register' : 'login');
    if (mode !== 'register') params.set('autoGoogle', '1');
    window.location.href = '/patient-login.html?' + params.toString();
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

        storePatientSession(data, 'google');
        
        // Show success message
        showMessage('Login berhasil! Mengalihkan...', 'success');
        
        // Check profile completion and redirect accordingly
        setTimeout(async () => {
            await checkProfileCompletionAndRedirect();
        }, 1500);
        
    } catch (error) {
        console.error('Google sign-in error:', error);
        showMessage('Login dengan Google gagal. Silakan coba lagi.', 'error');
    }
}

// Sign Up with Email
async function signUpWithEmail(fullname, email, phone, password) {
    showMessage('Pendaftaran lewat email sudah ditutup. Silakan daftar dengan Google.', 'info');
    setTimeout(() => {
        window.location.href = '/patient-login.html?mode=register';
    }, 800);
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

        storePatientSession(data, 'email');

        // Show success message
        showMessage('Login berhasil! Mengalihkan...', 'success');

        // Check profile completion and redirect accordingly
        setTimeout(async () => {
            await checkProfileCompletionAndRedirect();
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

// Check profile completion and redirect accordingly
async function checkProfileCompletionAndRedirect() {
    try {
        const token = localStorage.getItem('patient_token');
        if (!token) {
            window.location.href = '/index.html';
            return;
        }

        const res = await fetch(`${API_BASE_URL}/profile`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            throw new Error('Failed to fetch profile');
        }

        const data = await res.json();
        const profile = data.user;

        // Skip email verification check for Google users (they're already verified by Google)
        const isGoogleUser = profile.google_id && profile.google_id.length > 0;
        
        // Check email verification FIRST (most important) - but skip for Google users
        if (!isGoogleUser && (profile.email_verified === 0 || profile.email_verified === false)) {
            console.log('Email not verified, redirecting to verify-email');
            window.location.href = '/verify-email.html';
            return;
        }

        // Check birth_date second (required for all patients)
        if (!profile.birth_date) {
            window.location.href = '/complete-profile.html';
            return;
        }

        // Check if profile is completed
        if (profile.profile_completed === 1) {
            window.location.href = REDIRECT_AFTER_LOGIN;
        } else {
            window.location.href = '/complete-profile.html';
        }
    } catch (error) {
        console.error('Profile check error:', error);
        // Check if user data exists in localStorage to determine redirect
        const userData = localStorage.getItem('patient_user');
        if (userData) {
            try {
                const user = JSON.parse(userData);
                // If Google user, skip email verification
                if (user.google_id) {
                    window.location.href = '/complete-profile.html';
                    return;
                }
            } catch (e) {
                console.error('Failed to parse user data:', e);
            }
        }
        // On error for non-Google users, redirect to verify email to be safe
        window.location.href = '/verify-email.html';
    }
}

// Logout function
function logout() {
    localStorage.removeItem('patient_token');
    window.PatientSession?.clearAuth();

    localStorage.removeItem('patient_user');
    localStorage.removeItem('auth_provider'); // Clear auth_provider on logout
    localStorage.removeItem('patient_intake_draft_v3'); // Clear intake draft to prevent data leakage
    window.location.href = '/index.html';
}

// Suppress annoying FedCM console errors and warnings
(function() {
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.error = function(...args) {
        // Suppress specific FedCM errors
        const message = args[0]?.toString() || '';
        if (message.includes('Third-party sign in was disabled') || 
            message.includes('FedCM') ||
            message.includes('AbortError') ||
            message.includes('GSI_LOGGER')) {
            // Silently ignore these - they're expected when third-party cookies are blocked
            return;
        }
        originalError.apply(console, args);
    };
    
    console.warn = function(...args) {
        // Suppress GSI_LOGGER warnings about FedCM migration
        const message = args[0]?.toString() || '';
        if (message.includes('GSI_LOGGER') || 
            message.includes('FedCM') ||
            message.includes('fedcm-migration')) {
            // Silently ignore these migration warnings
            return;
        }
        originalWarn.apply(console, args);
    };
})();

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
            console.log('[Google Sign-In] Sign-up button clicked');
            triggerGooglePrompt('register');
        });
    } else {
        console.log('Google signup button not found');
    }

    // Google Sign-In Button inside navbar dropdown
    const googleSigninBtn = document.getElementById('google-signin-btn');
    if (googleSigninBtn) {
        googleSigninBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('[Google Sign-In] Navbar sign-in button clicked');
            triggerGooglePrompt('login');
        });
    } else {
        console.log('Google signin button (navbar) not found');
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
            const submitBtn = registerForm.querySelector('input[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.value = 'Mendaftar...';
            }
            
            try {
                await signUpWithEmail(fullname, email, phone, password);
            } catch (error) {
                // Re-enable submit button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.value = 'DAFTAR SEKARANG';
                }
            }
        });
    }
    
    // Login Form (section)
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
            const submitBtn = loginForm.querySelector('input[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.value = 'Masuk...';
            }
            
            try {
                await signInWithEmail(email, password);
            } catch (error) {
                // Re-enable submit button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.value = 'MASUK';
                }
            }
        });
    }
    
    // Navbar Login Form
    const navbarLoginForm = document.getElementById('navbar-login-form');
    if (navbarLoginForm) {
        navbarLoginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('navbar-email').value.trim();
            const password = document.getElementById('navbar-password').value;
            
            if (!email || !password) {
                showMessage('Email dan password harus diisi!', 'error');
                return;
            }
            
            const submitBtn = navbarLoginForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Loading...';
            }
            
            try {
                await signInWithEmail(email, password);
            } catch (error) {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Login';
                }
            }
        });

        // Add a specific listener for the forgot password link to ensure it works inside the dropdown
        const forgotPasswordLink = navbarLoginForm.querySelector('a[href="reset-password.html"]');
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = this.href;
            });
        }
    }
    
    // Forgot Password Link
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', function(e) {
            e.preventDefault();
            
            const email = prompt('Masukkan email Anda untuk reset password:');
            if (!email) {
                return;
            }
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showMessage('Format email tidak valid!', 'error');
                return;
            }
            
            // Send reset password request
            fetch(`${API_BASE_URL}/forgot-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: email })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showMessage('Link reset password telah dikirim ke email Anda. Silakan cek inbox atau spam folder.', 'success');
                } else {
                    showMessage(data.message || 'Gagal mengirim link reset password', 'error');
                }
            })
            .catch(error => {
                console.error('Forgot password error:', error);
                showMessage('Terjadi kesalahan. Silakan coba lagi.', 'error');
            });
        });
    }
});

// Function to check login status and update UI
function checkLoginStatus() {
    const token = localStorage.getItem('patient_token');
    let storedUser = {};
    try {
        storedUser = JSON.parse(localStorage.getItem('patient_user') || '{}');
    } catch (error) {
        storedUser = {};
    }
    const userFullName = storedUser.full_name || storedUser.name || localStorage.getItem('patient_name');
    const userEmail = storedUser.email || localStorage.getItem('patient_email');
    const authProvider = localStorage.getItem('auth_provider');

    if (token && userFullName && userEmail) {
        // User is logged in
        if (window.location.pathname.endsWith('patient-menu.html') || window.location.pathname.endsWith('patient-dashboard.html')) {
            $('#user-name').text(userFullName);
            $('#user-email').text(userEmail);

            // Show "Atur Password" link for Google users
            if (authProvider === 'google') {
                $('#google-user-password-section').show();
            }
        }
    } else {
        // User is not logged in
        if (!window.location.pathname.endsWith('index.html')) {
            window.location.href = '/index.html';
        }
    }
}

// Call checkLoginStatus on every page load
checkLoginStatus();

// ... existing code ...
function onLoginSuccess(data) {
    if (data.token) {
        storePatientSession(data, data.user?.provider || 'email');
        window.location.href = REDIRECT_AFTER_LOGIN;
    } else {
        showMessage('Login gagal. Silakan coba lagi.', 'error');
    }
}
