// Complete Profile Form Handler v3.0
console.log('=== COMPLETE PROFILE HANDLER v3.0 - ' + new Date().toISOString() + ' ===');
console.log('✅ NEW VERSION LOADED - Cache cleared successfully!');
console.log('If you still see auth.js errors, please:');
console.log('1. Close ALL browser tabs for this site');
console.log('2. Clear browser cache completely');
console.log('3. Reopen in Incognito/Private mode');

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready, initializing complete profile...');
    
    const token = localStorage.getItem('patient_token');
    
    // Redirect if not logged in
    if (!token) {
        console.log('No token found, redirecting...');
        window.location.href = '/index.html';
        return;
    }
    
    console.log('Token found, setting up form...');
    
    // Auto-calculate age from birth date
    const birthdateInput = document.getElementById('birthdate');
    if (birthdateInput) {
        birthdateInput.addEventListener('change', function() {
            const birthDate = new Date(this.value);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            
            const ageInput = document.getElementById('age');
            if (ageInput) {
                ageInput.value = age >= 0 ? age : '';
            }
        });
    }
    
    // Load current profile data
    async function loadCurrentData() {
        try {
            const response = await fetch('/api/patients/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const profile = data.user;
                
                // Pre-fill available data
                if (profile.full_name || profile.fullname) {
                    const fullnameInput = document.getElementById('fullname');
                    if (fullnameInput) fullnameInput.value = profile.full_name || profile.fullname;
                }
                if (profile.phone) {
                    const phoneInput = document.getElementById('phone');
                    if (phoneInput) phoneInput.value = profile.phone;
                }
                if (profile.birth_date) {
                    const birthDate = new Date(profile.birth_date);
                    const birthdateInput = document.getElementById('birthdate');
                    const ageInput = document.getElementById('age');
                    if (birthdateInput) {
                        birthdateInput.value = birthDate.toISOString().split('T')[0];
                    }
                    if (ageInput && profile.age) {
                        ageInput.value = profile.age;
                    }
                }
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }
    
    loadCurrentData();
    
    // Handle form submission
    const completeProfileForm = document.getElementById('complete-profile-form');
    
    if (!completeProfileForm) {
        console.error('Form not found!');
        return;
    }
    
    console.log('Form found, attaching submit handler');
    
    completeProfileForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        console.log('Form submitted');
        
        const fullnameInput = document.getElementById('fullname');
        const phoneInput = document.getElementById('phone');
        const birthdateInput = document.getElementById('birthdate');
        const ageInput = document.getElementById('age');
        
        const fullname = fullnameInput ? fullnameInput.value.trim() : '';
        const phone = phoneInput ? phoneInput.value.trim() : '';
        const birthdate = birthdateInput ? birthdateInput.value : '';
        const age = ageInput ? ageInput.value : '';
        
        // Validation
        if (!fullname || !phone || !birthdate) {
            showError('Semua field yang bertanda (*) harus diisi!');
            return;
        }
        
        // Validate phone format
        const phoneRegex = /^628\d{9,12}$/;
        if (!phoneRegex.test(phone)) {
            showError('Format nomor telepon tidak valid. Harus dimulai dengan 628 dan 12-15 digit total.');
            return;
        }
        
        // Disable submit button
        const submitBtn = document.getElementById('submit-btn');
        console.log('Submit button element:', submitBtn);
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Menyimpan...';
        } else {
            console.error('Submit button not found!');
        }
        
        try {
            const response = await fetch('/api/patients/complete-profile', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fullname,
                    phone,
                    birth_date: birthdate,
                    age: age ? parseInt(age) : null
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Gagal menyimpan profil');
            }
            
            // Success - redirect to dashboard
            console.log('Profile saved successfully, redirecting...');
            window.location.href = '/patient-dashboard.html';
            
        } catch (error) {
            console.error('Error saving profile:', error);
            showError(error.message);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa fa-check-circle"></i> Simpan & Lanjutkan';
            }
        }
    });
    
    function showError(message) {
        const errorDiv = document.getElementById('error-message');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            
            // Scroll to error
            errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
});
