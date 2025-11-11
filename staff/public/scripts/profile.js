// Profile Settings Module
import { auth, getIdToken } from './vps-auth-v2.js';
import { showSuccess, showError, showWarning } from './toast.js';

const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

let currentUser = null;
let selectedProfilePicture = null; // Store selected image as base64

// Load profile data
export async function loadProfileData() {
    currentUser = auth.currentUser;
    
    if (!currentUser) {
        showError('Anda harus login terlebih dahulu');
        if (window.showDashboardPage) {
            window.showDashboardPage();
        }
        return;
    }
    
    // Get photo from server (photo_url is now loaded with user data from auth API)
    const photoURL = currentUser.photo_url || null;
    
    const displayName = currentUser.name || 'User';
    const email = currentUser.email || '-';
    const uid = currentUser.id || '-';
    const created = '-';  // VPS doesn't have metadata yet
    const lastLogin = '-';
    
    console.log('Loading profile data:', { displayName, email, photoURL: photoURL ? 'exists' : 'none' });
    
    // Update display elements
    const profileDisplayNameEl = document.getElementById('profile-display-name');
    if (profileDisplayNameEl) profileDisplayNameEl.textContent = displayName;
    
    const profileDisplayEmailEl = document.getElementById('profile-display-email');
    if (profileDisplayEmailEl) profileDisplayEmailEl.textContent = email;
    
    const profileDisplayUidEl = document.getElementById('profile-display-uid');
    if (profileDisplayUidEl) profileDisplayUidEl.textContent = uid.substring(0, 20) + '...';
    
    const profileDisplayCreatedEl = document.getElementById('profile-display-created');
    if (profileDisplayCreatedEl) profileDisplayCreatedEl.textContent = created;
    
    const profileDisplayLastloginEl = document.getElementById('profile-display-lastlogin');
    if (profileDisplayLastloginEl) profileDisplayLastloginEl.textContent = lastLogin;
    
    // Update form fields
    const profileDisplaynameInput = document.getElementById('profile-displayname');
    if (profileDisplaynameInput) profileDisplaynameInput.value = displayName;
    
    const profileEmailInput = document.getElementById('profile-email');
    if (profileEmailInput) profileEmailInput.value = email;
    
    // Load and display profile picture
    displayProfilePicture(photoURL);
    
    // Clear password fields
    const currentPasswordInput = document.getElementById('profile-current-password');
    if (currentPasswordInput) currentPasswordInput.value = '';
    
    const newPasswordInput = document.getElementById('profile-new-password');
    if (newPasswordInput) newPasswordInput.value = '';
    
    const confirmPasswordInput = document.getElementById('profile-confirm-password');
    if (confirmPasswordInput) confirmPasswordInput.value = '';
}

// Load profile picture from localStorage
async function loadProfilePicture() {
    if (!currentUser) return;
    
    try {
        const photoURL = localStorage.getItem(`profile_photo_${currentUser.id}`);
        displayProfilePicture(photoURL);
    } catch (err) {
        console.error('Failed to load profile picture:', err);
        displayProfilePicture(null);
    }
}

// Display profile picture
function displayProfilePicture(photoURL) {
    const avatarImg = document.getElementById('profile-avatar-img');
    const avatarIcon = document.getElementById('profile-avatar-icon');
    const previewImg = document.getElementById('profile-picture-preview-img');
    const previewIcon = document.getElementById('profile-picture-preview-icon');
    const removeBtn = document.getElementById('remove-profile-picture-btn');
    
    if (photoURL) {
        // Show image, hide icon
        if (avatarImg) {
            avatarImg.src = photoURL;
            avatarImg.style.display = 'block';
        }
        if (avatarIcon) avatarIcon.style.display = 'none';
        
        if (previewImg) {
            previewImg.src = photoURL;
            previewImg.style.display = 'block';
        }
        if (previewIcon) previewIcon.style.display = 'none';
        
        if (removeBtn) removeBtn.style.display = 'inline-block';
    } else {
        // Show icon, hide image
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarIcon) avatarIcon.style.display = 'block';
        
        if (previewImg) previewImg.style.display = 'none';
        if (previewIcon) previewIcon.style.display = 'block';
        
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

// Initialize profile form
export function initProfile() {
    console.log('initProfile() called');
    const profileForm = document.getElementById('profile-form');
    const profilePictureInput = document.getElementById('profile-picture-input');
    const removeProfilePictureBtn = document.getElementById('remove-profile-picture-btn');
    
    console.log('Profile form element:', profileForm ? 'found' : 'NOT FOUND');
    
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Form submitted!');
            await handleProfileUpdate();
        });
        console.log('✓ Form submit listener attached');
    } else {
        console.error('✗ Profile form not found!');
    }
    
    // Handle profile picture selection
    if (profilePictureInput) {
        profilePictureInput.addEventListener('change', handleProfilePictureSelect);
    }
    
    // Handle remove profile picture
    if (removeProfilePictureBtn) {
        removeProfilePictureBtn.addEventListener('click', handleRemoveProfilePicture);
    }
}

// Handle profile picture file selection
function handleProfilePictureSelect(e) {
    const file = e.target.files[0];
    
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showError('File harus berupa gambar (JPG, PNG, GIF)');
        return;
    }
    
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        showError('Ukuran file maksimal 2MB');
        return;
    }
    
    // Read file as base64
    const reader = new FileReader();
    reader.onload = (event) => {
        selectedProfilePicture = event.target.result;
        displayProfilePicture(selectedProfilePicture);
        showSuccess('Foto dipilih. Klik Save untuk menyimpan.');
    };
    reader.onerror = () => {
        showError('Gagal membaca file');
    };
    reader.readAsDataURL(file);
}

// Handle remove profile picture
function handleRemoveProfilePicture() {
    selectedProfilePicture = ''; // Empty string to indicate removal
    displayProfilePicture(null);
    showSuccess('Foto akan dihapus. Klik Save untuk menyimpan.');
}

// Handle profile update
async function handleProfileUpdate() {
    if (!currentUser) {
        showError('Session expired. Please login again.');
        return;
    }
    
    const newDisplayName = document.getElementById('profile-displayname').value.trim();
    const currentPassword = document.getElementById('profile-current-password').value;
    const newPassword = document.getElementById('profile-new-password').value;
    const confirmPassword = document.getElementById('profile-confirm-password').value;
    
    let hasChanges = false;
    let needsReauth = false;
    
    // Check if display name changed
    if (newDisplayName && newDisplayName !== currentUser.name) {
        hasChanges = true;
    }
    
    // Check if profile picture changed
    if (selectedProfilePicture !== null) {
        hasChanges = true;
    }
    
    // Check if password change requested
    if (newPassword || confirmPassword) {
        hasChanges = true;
        needsReauth = true;
        
        // Validate password change
        if (!currentPassword) {
            showError('Masukkan password saat ini untuk mengubah password');
            return;
        }
        
        if (newPassword.length < 6) {
            showError('Password baru minimal 6 karakter');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showError('Konfirmasi password tidak cocok');
            return;
        }
    }
    
    if (!hasChanges) {
        showWarning('Tidak ada perubahan yang disimpan');
        return;
    }
    
    try {
        console.log('Starting profile update...');
        console.log('Has changes:', { displayName: newDisplayName !== currentUser.name, photo: selectedProfilePicture !== null, password: !!newPassword });
        
        const token = await getIdToken();
        if (!token) {
            showError('Session expired. Silakan login ulang');
            return;
        }
        
        // Update display name via VPS API
        if (newDisplayName && newDisplayName !== currentUser.name) {
            console.log('Updating display name:', newDisplayName);
            try {
                const response = await fetch(`${VPS_API_BASE}/api/auth/profile`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name: newDisplayName })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        console.log('✓ Display name updated');
                        // Update local auth user object
                        auth.currentUser.name = newDisplayName;
                    }
                }
            } catch (err) {
                console.error('Failed to update name:', err);
            }
        }
        
        // Update profile picture via VPS API
        if (selectedProfilePicture !== null) {
            console.log('Saving profile picture to server...');
            console.log('User ID:', currentUser.id);
            
            try {
                const response = await fetch(`${VPS_API_BASE}/api/auth/profile`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ photo_url: selectedProfilePicture })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to update profile photo');
                }
                
                console.log('✓ Profile picture saved to server');
                // Update auth user with new photo
                auth.currentUser.photo_url = selectedProfilePicture;
                selectedProfilePicture = null; // Reset after save
            } catch (storageError) {
                console.error('✗ Server save failed:', storageError);
                throw new Error('Gagal menyimpan foto profile: ' + storageError.message);
            }
        }
        
        // Update password via VPS API
        if (newPassword) {
            console.log('Updating password...');
            
            const response = await fetch(`${VPS_API_BASE}/api/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    currentPassword: currentPassword,
                    newPassword: newPassword
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to update password');
            }
            
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Failed to update password');
            }
            
            console.log('✓ Password updated');
            
            // Clear password fields
            document.getElementById('profile-current-password').value = '';
            document.getElementById('profile-new-password').value = '';
            document.getElementById('profile-confirm-password').value = '';
        }
        
        // Reload auth user to get updated photo_url from server
        currentUser = auth.currentUser;
        
        // Get latest photo from server (already updated in auth.currentUser.photo_url)
        const latestPhotoURL = currentUser.photo_url || null;
        
        console.log('Updating UI with:', { newDisplayName, latestPhotoURL: latestPhotoURL ? 'exists' : 'none' });
        
        // Update ALL display name elements
        const displayNameElements = [
            'profile-display-name',
            'user-info',
            'summary-cashier'
        ];
        
        displayNameElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = newDisplayName || currentUser.name || currentUser.email;
                console.log(`Updated ${id}:`, el.textContent);
            }
        });
        
        // Update profile display email
        const profileDisplayEmail = document.getElementById('profile-display-email');
        if (profileDisplayEmail) {
            profileDisplayEmail.textContent = currentUser.email;
        }
        
        // Update form field
        const profileDisplaynameInput = document.getElementById('profile-displayname');
        if (profileDisplaynameInput) {
            profileDisplaynameInput.value = newDisplayName || currentUser.name || '';
        }
        
        // Update ALL profile picture elements
        displayProfilePicture(latestPhotoURL);
        
        // Update navbar avatar specifically
        const navbarAvatar = document.getElementById('navbar-user-avatar');
        if (navbarAvatar) {
            if (latestPhotoURL) {
                navbarAvatar.src = latestPhotoURL;
                navbarAvatar.style.display = 'inline-block';
                console.log('Navbar avatar updated with photo');
            } else {
                navbarAvatar.style.display = 'none';
                console.log('Navbar avatar hidden (no photo)');
            }
        }
        
        // Also update the navbar user icon if it exists
        const navbarUserIcon = document.querySelector('.navbar-nav .nav-link img.user-image');
        if (navbarUserIcon && latestPhotoURL) {
            navbarUserIcon.src = latestPhotoURL;
            console.log('Navbar user icon updated');
        }
        
        showSuccess('Profile berhasil diupdate!');
        
    } catch (error) {
        console.error('Profile update error:', error);
        
        let errorMessage = 'Gagal mengupdate profile';
        
        // Check for common errors
        if (error.message && error.message.includes('Invalid credentials')) {
            errorMessage = 'Password saat ini salah';
        } else if (error.message && error.message.includes('Session expired')) {
            errorMessage = 'Session expired. Silakan login ulang';
        } else {
            errorMessage = error.message || errorMessage;
        }
        
        showError(errorMessage);
    }
}

// Note: initProfile() is now called from main.js when profile page is shown
// This prevents duplicate event listeners

