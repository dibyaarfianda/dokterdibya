// Modern Toast Notification System for AdminLTE 3
// Replaces traditional alert() with beautiful toast notifications

let toastCounter = 0;

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
export function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('Toast container not found, falling back to alert');
        alert(message);
        return;
    }

    const toastId = `toast-${toastCounter++}`;
    
    // Icon mapping
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    // Title mapping
    const titles = {
        success: 'Berhasil',
        error: 'Error',
        warning: 'Peringatan',
        info: 'Informasi'
    };

    const icon = icons[type] || icons.info;
    const title = titles[type] || titles.info;

    // Create toast element
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `custom-toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');

    toast.innerHTML = `
        <div class="toast-header">
            <i class="fas ${icon} mr-2"></i>
            <strong class="mr-auto">${title}</strong>
            <button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button>
        </div>
        <div class="toast-body bg-white text-dark">
            ${message}
        </div>
    `;

    // Add to container
    container.appendChild(toast);

    // Close button handler
    const closeBtn = toast.querySelector('[data-dismiss="toast"]');
    closeBtn.addEventListener('click', () => {
        removeToast(toastId);
    });

    // Auto remove after duration
    if (duration > 0) {
        setTimeout(() => {
            removeToast(toastId);
        }, duration);
    }

    return toastId;
}

/**
 * Remove a toast notification
 */
function removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (!toast) return;

    toast.classList.add('fade-out');
    setTimeout(() => {
        toast.remove();
    }, 300); // Match animation duration
}

/**
 * Shorthand functions for different toast types
 */
export function showSuccess(message, duration = 4000) {
    return showToast(message, 'success', duration);
}

export function showError(message, duration = 5000) {
    return showToast(message, 'error', duration);
}

export function showWarning(message, duration = 4500) {
    return showToast(message, 'warning', duration);
}

export function showInfo(message, duration = 4000) {
    return showToast(message, 'info', duration);
}

/**
 * Show a confirmation dialog with custom buttons
 * Returns a Promise that resolves to true/false
 */
export function showConfirm(message, title = 'Konfirmasi') {
    return new Promise((resolve) => {
        // Create modal backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop fade show';
        backdrop.style.zIndex = '10000';
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal fade show';
        modal.style.display = 'block';
        modal.style.zIndex = '10001';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-warning">
                        <h5 class="modal-title">
                            <i class="fas fa-question-circle mr-2"></i>${title}
                        </h5>
                    </div>
                    <div class="modal-body">
                        <p class="mb-0">${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="cancel">
                            <i class="fas fa-times mr-1"></i>Batal
                        </button>
                        <button type="button" class="btn btn-primary" data-action="confirm">
                            <i class="fas fa-check mr-1"></i>Ya, Lanjutkan
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);
        
        // Add event listeners
        const cleanup = () => {
            modal.classList.remove('show');
            backdrop.classList.remove('show');
            setTimeout(() => {
                modal.remove();
                backdrop.remove();
            }, 150);
        };
        
        modal.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            cleanup();
            resolve(false);
        });
        
        modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
            cleanup();
            resolve(true);
        });
        
        // Close on backdrop click
        backdrop.addEventListener('click', () => {
            cleanup();
            resolve(false);
        });
    });
}

// Make available globally for inline usage
window.showToast = showToast;
window.showSuccess = showSuccess;
window.showError = showError;
window.showWarning = showWarning;
window.showInfo = showInfo;
window.showConfirm = showConfirm;

