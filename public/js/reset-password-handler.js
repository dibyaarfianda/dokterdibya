$(document).ready(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    const requestView = $('#request-view');
    const resetView = $('#reset-view');
    const requestForm = $('#request-form');
    const resetForm = $('#reset-form');

    const requestSuccessAlert = $('#request-success-alert');
    const requestErrorAlert = $('#request-error-alert');
    const resetSuccessAlert = $('#reset-success-alert');
    const resetErrorAlert = $('#reset-error-alert');

    if (token) {
        // Show reset password form
        requestView.hide();
        resetView.show();
        $('#reset-token').val(token);
    } else {
        // Show request email form
        requestView.show();
        resetView.hide();
    }

    // Handle request for reset link
    requestForm.on('submit', function(e) {
        e.preventDefault();
        const email = $('#email').val();
        
        requestSuccessAlert.hide();
        requestErrorAlert.hide();

        $.ajax({
            url: '/api/auth/forgot-password',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ email: email }),
            success: function(response) {
                requestSuccessAlert.text('Jika email terdaftar, kami telah mengirimkan tautan reset password. Silakan periksa inbox Anda.').show();
                requestForm.hide();
            },
            error: function(xhr) {
                const message = xhr.responseJSON?.message || 'Terjadi kesalahan. Silakan coba lagi.';
                // Even on error, show a generic success message to prevent email enumeration
                requestSuccessAlert.text('Jika email terdaftar, kami telah mengirimkan tautan reset password. Silakan periksa inbox Anda.').show();
                requestForm.hide();
            }
        });
    });

    // Handle password reset submission
    resetForm.on('submit', function(e) {
        e.preventDefault();
        const newPassword = $('#new-password').val();
        const confirmPassword = $('#confirm-password').val();
        const resetToken = $('#reset-token').val();

        resetSuccessAlert.hide();
        resetErrorAlert.hide();

        if (newPassword !== confirmPassword) {
            resetErrorAlert.text('Password tidak cocok.').show();
            return;
        }

        $.ajax({
            url: '/api/auth/reset-password',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ token: resetToken, newPassword: newPassword }),
            success: function(response) {
                resetSuccessAlert.text('Password berhasil diubah! Anda akan diarahkan ke halaman login...').show();
                resetForm.hide();
                setTimeout(() => {
                    window.location.href = '/index.html'; // Redirect to login page
                }, 3000);
            },
            error: function(xhr) {
                const message = xhr.responseJSON?.message || 'Tautan reset tidak valid atau telah kedaluwarsa.';
                resetErrorAlert.text(message).show();
            }
        });
    });
});
