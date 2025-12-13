// Complete Profile Form Handler v4.1 - New Registration Flow with Registration Code

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async function() {
    // Check if we're coming from email verification
    const verifiedToken = sessionStorage.getItem('verified_token');
    const email = sessionStorage.getItem('registration_email');

    if (!verifiedToken || !email) {
        window.location.href = '/register.html';
        return;
    }

    // Check if registration code is required
    let registrationCodeRequired = false;
    try {
        const response = await fetch('/api/registration-codes/settings');
        const data = await response.json();
        registrationCodeRequired = data.registration_code_required === true;
    } catch (error) {
        console.log('Could not check registration code settings, assuming required');
        registrationCodeRequired = true;
    }

    // Show registration code field if required
    const regCodeGroup = document.getElementById('registration-code-group');
    const regCodeInput = document.getElementById('registration_code');
    if (registrationCodeRequired && regCodeGroup) {
        regCodeGroup.style.display = 'block';
        if (regCodeInput) {
            regCodeInput.required = true;
        }
    }

    // Phone number auto-formatting (08 → 628, +628 → 628, 8 → 628)
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            let value = this.value.trim();

            // Remove + sign if present
            value = value.replace(/\+/g, '');

            // If starts with 08, replace with 628
            if (value.startsWith('08')) {
                value = '628' + value.substring(2);
            }
            // If starts with 8 (no 0), add 62
            else if (value.startsWith('8') && !value.startsWith('62')) {
                value = '62' + value;
            }

            // Only allow numbers
            value = value.replace(/[^0-9]/g, '');

            this.value = value;
        });

        // Set placeholder
        phoneInput.placeholder = '08123456789 atau 628123456789';
    }

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

    // Handle form submission
    const completeProfileForm = document.getElementById('complete-profile-form');

    if (!completeProfileForm) {
        return;
    }

    completeProfileForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const fullnameInput = document.getElementById('fullname');
        const phoneInput = document.getElementById('phone');
        const birthdateInput = document.getElementById('birthdate');
        const ageInput = document.getElementById('age');
        const regCodeInput = document.getElementById('registration_code');

        const fullname = fullnameInput ? fullnameInput.value.trim() : '';
        const phone = phoneInput ? phoneInput.value.trim() : '';
        const birthdate = birthdateInput ? birthdateInput.value : '';
        const age = ageInput ? ageInput.value : '';
        const registrationCode = regCodeInput ? regCodeInput.value.trim().toUpperCase() : '';

        // Validation
        if (!fullname || !phone || !birthdate) {
            showError('Semua field yang bertanda (*) harus diisi!');
            return;
        }

        // Validate registration code if required
        if (registrationCodeRequired && !registrationCode) {
            showError('Kode registrasi harus diisi. Hubungi klinik untuk mendapatkan kode.');
            return;
        }

        if (registrationCodeRequired && registrationCode.length !== 6) {
            showError('Kode registrasi harus 6 karakter.');
            return;
        }

        // Validate phone format (must start with 628)
        const phoneRegex = /^628\d{9,12}$/;
        if (!phoneRegex.test(phone)) {
            showError('Format nomor telepon tidak valid. Harus dimulai dengan 628 dan 12-15 digit total.');
            return;
        }

        // Disable submit button
        const submitBtn = document.getElementById('submit-btn');

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Menyimpan...';
        }

        // Save profile data to sessionStorage for use in set-password
        const profileData = {
            fullname,
            phone,
            birth_date: birthdate,
            age: age ? parseInt(age) : null,
            email: email,
            registration_code: registrationCode || null
        };

        sessionStorage.setItem('profile_data', JSON.stringify(profileData));

        // Redirect to set-password page
        window.location.href = 'set-password.html';
    });

    function showError(message) {
        alert(message); // Simple alert for now
    }
});
