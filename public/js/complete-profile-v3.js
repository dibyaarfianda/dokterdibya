// Complete Profile Form Handler v5.0 - Supports both Email Registration and Google Sign-In flows

document.addEventListener('DOMContentLoaded', async function() {
    // Detect which flow the user came from
    const verifiedToken = sessionStorage.getItem('verified_token');
    const email = sessionStorage.getItem('registration_email');
    const googleToken = localStorage.getItem('vps_auth_token');
    const authProvider = localStorage.getItem('auth_provider');

    // Determine flow type
    const isGoogleFlow = !verifiedToken && googleToken && authProvider === 'google';
    const isEmailFlow = verifiedToken && email;

    if (!isGoogleFlow && !isEmailFlow) {
        // No valid session - redirect to login
        window.location.href = '/patient-login.html';
        return;
    }

    // Check if registration code is required (only for email flow)
    let registrationCodeRequired = false;
    if (!isGoogleFlow) {
        try {
            const response = await fetch('/api/registration-codes/settings');
            const data = await response.json();
            registrationCodeRequired = data.registration_code_required === true;
        } catch (error) {
            console.log('Could not check registration code settings, assuming required');
            registrationCodeRequired = true;
        }
    }

    // Show registration code field if required (only for email flow, Google users already used code)
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

        // Validate registration code if required (email flow only)
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

        if (isGoogleFlow) {
            // Google flow: call API directly (user already has JWT token)
            try {
                const response = await fetch('/api/patients/complete-profile', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + googleToken
                    },
                    body: JSON.stringify({
                        fullname,
                        phone,
                        birth_date: birthdate,
                        age: age ? parseInt(age) : null,
                        registration_code: registrationCode || null,
                        google_flow: true
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    // Update stored user data with new profile info
                    const storedUser = JSON.parse(localStorage.getItem('patient_user') || '{}');
                    storedUser.full_name = fullname;
                    storedUser.fullname = fullname;
                    storedUser.phone = phone;
                    localStorage.setItem('patient_user', JSON.stringify(storedUser));

                    // Redirect to intake form
                    window.location.href = '/patient-intake.html';
                } else {
                    showError(data.message || 'Gagal menyimpan profil. Silakan coba lagi.');
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'Simpan & Lanjutkan';
                    }
                }
            } catch (error) {
                console.error('Complete profile error:', error);
                showError('Terjadi kesalahan. Silakan coba lagi.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'Simpan & Lanjutkan';
                }
            }
        } else {
            showError('Pendaftaran lewat email sudah ditutup. Silakan daftar dengan Google.');
            window.location.href = '/patient-login.html?mode=register';
        }
    });

    function showError(message) {
        alert(message);
    }
});
