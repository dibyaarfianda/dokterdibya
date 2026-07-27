// Profile Completion Handler
window.profileCompletionData = {
    photo: null,
    password: null
};

function buildSmoothedAvatarDataUrl(sourceUrl, targetSize, mimeType, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = function() {
            try {
                const size = targetSize || 512;
                const cropSize = Math.min(img.naturalWidth, img.naturalHeight);
                const offsetX = Math.max(0, Math.floor((img.naturalWidth - cropSize) / 2));
                const offsetY = Math.max(0, Math.floor((img.naturalHeight - cropSize) / 2));
                const sourceCanvas = document.createElement('canvas');
                const sourceContext = sourceCanvas.getContext('2d');

                if (!sourceContext || !cropSize) {
                    resolve(sourceUrl);
                    return;
                }

                sourceCanvas.width = cropSize;
                sourceCanvas.height = cropSize;
                sourceContext.imageSmoothingEnabled = true;
                sourceContext.imageSmoothingQuality = 'high';
                sourceContext.drawImage(img, offsetX, offsetY, cropSize, cropSize, 0, 0, cropSize, cropSize);

                let currentCanvas = sourceCanvas;
                let currentSize = cropSize;

                while (currentSize > size * 2) {
                    const nextSize = Math.max(size, Math.floor(currentSize / 2));
                    const nextCanvas = document.createElement('canvas');
                    const nextContext = nextCanvas.getContext('2d');

                    if (!nextContext) break;

                    nextCanvas.width = nextSize;
                    nextCanvas.height = nextSize;
                    nextContext.imageSmoothingEnabled = true;
                    nextContext.imageSmoothingQuality = 'high';
                    nextContext.drawImage(currentCanvas, 0, 0, currentSize, currentSize, 0, 0, nextSize, nextSize);
                    currentCanvas = nextCanvas;
                    currentSize = nextSize;
                }

                if (currentSize !== size) {
                    const finalCanvas = document.createElement('canvas');
                    const finalContext = finalCanvas.getContext('2d');

                    if (finalContext) {
                        finalCanvas.width = size;
                        finalCanvas.height = size;
                        finalContext.imageSmoothingEnabled = true;
                        finalContext.imageSmoothingQuality = 'high';
                        finalContext.drawImage(currentCanvas, 0, 0, currentSize, currentSize, 0, 0, size, size);
                        currentCanvas = finalCanvas;
                    }
                }

                if ((mimeType || 'image/png') === 'image/png') {
                    resolve(currentCanvas.toDataURL('image/png'));
                    return;
                }

                resolve(currentCanvas.toDataURL(mimeType || 'image/jpeg', quality || 0.92));
            } catch (error) {
                reject(error);
            }
        };
        img.onerror = reject;
        img.src = sourceUrl;
    });
}

// Toggle password visibility
window.toggleCompletionPassword = function(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

// Photo input handler
document.getElementById('completion-photo-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        Swal.fire('Error', 'File harus berupa gambar (JPG, PNG)', 'error');
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        Swal.fire('Error', 'Ukuran file maksimal 2MB', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(event) {
        try {
            const optimizedPhoto = await buildSmoothedAvatarDataUrl(event.target.result, 512, 'image/png');
            window.profileCompletionData.photo = optimizedPhoto;
            document.getElementById('completion-avatar-img').src = optimizedPhoto;
            document.getElementById('completion-avatar-img').style.display = 'block';
            document.getElementById('completion-avatar-icon').style.display = 'none';
            validateCompletionForm();
        } catch (error) {
            console.error('Failed to process completion avatar:', error);
            Swal.fire('Error', 'Gagal memproses foto profil', 'error');
        }
    };
    reader.readAsDataURL(file);
});

// Password input handlers
document.getElementById('completion-new-password')?.addEventListener('input', validateCompletionForm);
document.getElementById('completion-confirm-password')?.addEventListener('input', validateCompletionForm);

function validateCompletionForm() {
    const photo = window.profileCompletionData.photo;
    const newPassword = document.getElementById('completion-new-password')?.value || '';
    const confirmPassword = document.getElementById('completion-confirm-password')?.value || '';

    const isValid = photo &&
                    newPassword.length >= 6 &&
                    newPassword === confirmPassword;

    const saveBtn = document.getElementById('btn-save-completion');
    if (saveBtn) {
        saveBtn.disabled = !isValid;
    }

    return isValid;
}

// Skip button - logout
document.getElementById('btn-skip-completion')?.addEventListener('click', async function() {
    const result = await Swal.fire({
        title: 'Keluar?',
        text: 'Anda harus melengkapi profil untuk mengakses website ini.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Keluar',
        cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
        localStorage.removeItem(window.TOKEN_KEY);
        sessionStorage.removeItem(window.TOKEN_KEY);
        localStorage.removeItem('vps_auth_user');
        window.location.href = 'login.html';
    }
});

// Save completion
document.getElementById('btn-save-completion')?.addEventListener('click', async function() {
    if (!validateCompletionForm()) {
        Swal.fire('Error', 'Lengkapi semua field yang diperlukan', 'error');
        return;
    }

    const btn = this;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Menyimpan...';

    try {
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        const apiBase = window.location.origin;

        // Update photo
        const photoResponse = await fetch(`${apiBase}/api/auth/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ photo_url: window.profileCompletionData.photo })
        });

        if (!photoResponse.ok) {
            throw new Error('Gagal menyimpan foto profil');
        }

        // Update password - need to use default password as current
        const newPassword = document.getElementById('completion-new-password').value;
        const passwordResponse = await fetch(`${apiBase}/api/auth/set-initial-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ newPassword })
        });

        if (!passwordResponse.ok) {
            const errData = await passwordResponse.json();
            throw new Error(errData.message || 'Gagal mengubah password');
        }

        // Mark profile as completed
        await fetch(`${apiBase}/api/auth/mark-profile-completed`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        // Update local user data
        const userData = JSON.parse(localStorage.getItem('vps_auth_user') || '{}');
        userData.photo_url = window.profileCompletionData.photo;
        userData.profile_completed = true;
        localStorage.setItem('vps_auth_user', JSON.stringify(userData));

        $('#profile-completion-modal').modal('hide');

        Swal.fire({
            title: 'Berhasil!',
            text: 'Profil Anda telah dilengkapi. Selamat bekerja!',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
        }).then(() => {
            // Refresh page to update UI
            window.location.reload();
        });

    } catch (error) {
        console.error('Profile completion error:', error);
        Swal.fire('Error', error.message || 'Gagal menyimpan profil', 'error');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// Function to show profile completion modal
window.showProfileCompletionModal = function() {
    // Reset form
    window.profileCompletionData.photo = null;
    document.getElementById('completion-avatar-img').style.display = 'none';
    document.getElementById('completion-avatar-icon').style.display = 'block';
    document.getElementById('completion-new-password').value = '';
    document.getElementById('completion-confirm-password').value = '';
    document.getElementById('btn-save-completion').disabled = true;

    $('#profile-completion-modal').modal('show');
};

// ============================================
// Registration Codes Functions
// ============================================

let currentGeneratedCode = null;
let currentGeneratedPhone = null;
let currentPatientName = null;
let regCodesCurrentPage = 1;
let regCodesTotalPages = 1;

// Legacy function - redirects to main page function
async function loadRegistrationCodes(page = 1) {
    if (typeof loadNewPatients === 'function') {
        loadNewPatients(page);
    }
}

async function openGenerateCodeModal() {
    document.getElementById('generated-code-result').style.display = 'none';
    document.getElementById('current-public-code').style.display = 'none';
    document.getElementById('btn-generate-code').style.display = 'inline-block';
    $('#generateCodeModal').modal('show');

    // Check for existing public code
    try {
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        const response = await fetch('/api/registration-codes/public', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && data.code) {
            document.getElementById('current-code-display').textContent = data.code;
            const expires = new Date(data.expires_at);
            document.getElementById('current-code-expires').textContent = `Berlaku sampai: ${expires.toLocaleString('id-ID')}`;
            document.getElementById('current-public-code').style.display = 'block';
        }
    } catch (e) {
        console.log('No active public code');
    }
}

async function generatePublicCode() {
    const btn = document.getElementById('btn-generate-code');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

    try {
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        const response = await fetch('/api/registration-codes/generate-public', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Gagal generate kode');
        }

        document.getElementById('generated-code-display').textContent = data.code;
        document.getElementById('generated-code-result').style.display = 'block';
        document.getElementById('current-public-code').style.display = 'none';

        // Reload new patients on main page
        if (typeof loadNewPatients === 'function') {
            loadNewPatients(newPatientsCurrentPage || 1);
        }

        // Update dashboard display
        updateDashboardCodeDisplay(data.code, data.expires_at);

    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-key"></i> Generate Kode Baru';
    }
}

// Update dashboard code display
function updateDashboardCodeDisplay(code, expiresAt) {
    console.log('[REG CODE] updateDashboardCodeDisplay called with:', code);
    const el = document.getElementById('dashboard-current-code');
    console.log('[REG CODE] Element found:', !!el, el);
    if (el && code) {
        el.textContent = code;
        console.log('[REG CODE] Element updated to:', el.textContent);
    } else {
        console.log('[REG CODE] Element not found or code is empty');
    }
}

// Load current code for dashboard on page load
async function loadDashboardCurrentCode() {
    console.log('[REG CODE] loadDashboardCurrentCode called');
    try {
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        console.log('[REG CODE] Token exists:', !!token);
        const response = await fetch('/api/registration-codes/public', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        console.log('[REG CODE] API response:', data);
        if (data.success && data.code) {
            console.log('[REG CODE] Updating display with code:', data.code);
            updateDashboardCodeDisplay(data.code, data.expires_at);
        } else {
            console.log('[REG CODE] No active code in response');
        }
    } catch (e) {
        console.error('[REG CODE] Error:', e);
    }
}

// Make function globally available
window.openGenerateCodeModal = openGenerateCodeModal;
window.loadDashboardCurrentCode = loadDashboardCurrentCode;

async function sendCodeWhatsApp() {
    if (!currentGeneratedCode || !currentGeneratedPhone) {
        alert('Kode belum di-generate');
        return;
    }

    const btn = document.getElementById('btn-send-whatsapp');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';

    try {
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        const response = await fetch('/api/registration-codes/send-whatsapp', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: currentGeneratedCode,
                phone: currentGeneratedPhone,
                patient_name: currentPatientName
            })
        });

        const data = await response.json();

        if (data.method === 'fonnte') {
            alert('Kode berhasil dikirim via WhatsApp!');
            $('#generateCodeModal').modal('hide');
        } else if (data.waLink) {
            window.open(data.waLink, '_blank');
            alert('Link WhatsApp terbuka di tab baru. Klik kirim untuk mengirim pesan.');
            $('#generateCodeModal').modal('hide');
        } else {
            throw new Error(data.message || 'Gagal mengirim');
        }

    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fab fa-whatsapp"></i> Kirim via WhatsApp';
    }
}

async function resendCodeWhatsApp(code, phone, patientName) {
    try {
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        const response = await fetch('/api/registration-codes/send-whatsapp', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code, phone, patient_name: patientName })
        });

        const data = await response.json();

        if (data.method === 'fonnte') {
            alert('Kode berhasil dikirim ulang via WhatsApp!');
        } else if (data.waLink) {
            window.open(data.waLink, '_blank');
            alert('Link WhatsApp terbuka di tab baru.');
        }

    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function deleteCode(codeId) {
    if (!confirm('Hapus kode registrasi ini?')) return;

    try {
        const token = (window.getAuthToken ? window.getAuthToken() : '');
        const response = await fetch(`/api/registration-codes/${codeId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Gagal menghapus');

        // Reload new patients on main page
        if (typeof loadNewPatients === 'function') {
            loadNewPatients(newPatientsCurrentPage || 1);
        }

    } catch (error) {
        alert('Error: ' + error.message);
    }
}
