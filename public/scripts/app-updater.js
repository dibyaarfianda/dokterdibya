/**
 * App Updater Module
 * Handles checking for app updates and triggering downloads
 *
 * Usage:
 *   import { checkForUpdates, showUpdateDialog } from '/scripts/app-updater.js';
 *
 *   // Auto check on startup (only in Capacitor)
 *   checkForUpdates();
 *
 *   // Manual check
 *   const result = await checkForUpdates({ showNoUpdateToast: true });
 */

// Current app version (update this when releasing new APK)
const APP_VERSION = '2.0.0';
const APP_VERSION_CODE = 200;

// Detect if running in Capacitor
const isCapacitor = window.Capacitor?.isNativePlatform?.() || false;

// Storage key for skipped version
const SKIPPED_VERSION_KEY = 'app_update_skipped_version';
const LAST_CHECK_KEY = 'app_update_last_check';

/**
 * Get current platform
 */
function getPlatform() {
    if (!isCapacitor) return 'web';

    const platform = window.Capacitor?.getPlatform?.() || 'web';
    return platform; // 'android', 'ios', or 'web'
}

/**
 * Check for app updates
 * @param {Object} options - Options
 * @param {boolean} options.showNoUpdateToast - Show toast if no update available
 * @param {boolean} options.force - Force check even if recently checked
 * @returns {Promise<Object>} Update info
 */
export async function checkForUpdates(options = {}) {
    const { showNoUpdateToast = false, force = false } = options;

    // Only check in Capacitor app
    if (!isCapacitor) {
        console.log('[AppUpdater] Not running in Capacitor, skipping check');
        return { updateAvailable: false };
    }

    const platform = getPlatform();
    if (platform === 'web') {
        return { updateAvailable: false };
    }

    // Throttle checks (max once per hour unless forced)
    if (!force) {
        const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
        if (lastCheck) {
            const hoursSinceCheck = (Date.now() - parseInt(lastCheck)) / (1000 * 60 * 60);
            if (hoursSinceCheck < 1) {
                console.log('[AppUpdater] Recently checked, skipping');
                return { updateAvailable: false, skipped: true };
            }
        }
    }

    try {
        console.log('[AppUpdater] Checking for updates...');

        const response = await fetch(`/api/app-version?platform=${platform}&current_version_code=${APP_VERSION_CODE}`);
        const data = await response.json();

        if (!data.success) {
            console.error('[AppUpdater] API error:', data.message);
            return { updateAvailable: false, error: data.message };
        }

        // Save last check time
        localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());

        console.log('[AppUpdater] Current:', APP_VERSION_CODE, 'Latest:', data.version_code);

        if (data.update_available) {
            // Check if user skipped this version
            const skippedVersion = localStorage.getItem(SKIPPED_VERSION_KEY);
            if (!data.update_required && skippedVersion === data.version.toString()) {
                console.log('[AppUpdater] User skipped this version');
                return { updateAvailable: true, skipped: true, ...data };
            }

            // Show update dialog
            showUpdateDialog(data);

            return { updateAvailable: true, ...data };
        } else {
            if (showNoUpdateToast) {
                showToast('Aplikasi sudah versi terbaru', 'success');
            }
            return { updateAvailable: false, ...data };
        }

    } catch (error) {
        console.error('[AppUpdater] Error checking for updates:', error);
        return { updateAvailable: false, error: error.message };
    }
}

/**
 * Show update dialog
 * @param {Object} updateInfo - Update info from API
 */
export function showUpdateDialog(updateInfo) {
    // Remove existing dialog if any
    const existingDialog = document.getElementById('app-update-dialog');
    if (existingDialog) existingDialog.remove();

    const isRequired = updateInfo.update_required || updateInfo.force_update;

    // Create dialog HTML
    const dialogHtml = `
        <div id="app-update-dialog" class="update-dialog-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        ">
            <div class="update-dialog" style="
                background: #1a1a2e;
                border-radius: 20px;
                padding: 30px;
                max-width: 350px;
                width: 100%;
                text-align: center;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(40, 167, 233, 0.3);
            ">
                <div class="update-icon" style="
                    width: 70px;
                    height: 70px;
                    background: linear-gradient(135deg, #10b981, #059669);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    font-size: 32px;
                    color: white;
                ">
                    <i class="fa fa-download"></i>
                </div>

                <h3 style="color: #fff; font-size: 20px; margin-bottom: 10px;">
                    Update Tersedia
                </h3>

                <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 15px;">
                    Versi baru <strong style="color: #10b981;">${updateInfo.version}</strong> sudah tersedia.
                    ${isRequired ? '<br><span style="color: #ef4444;">Update ini wajib diinstal.</span>' : ''}
                </p>

                ${updateInfo.release_notes ? `
                    <div style="
                        background: rgba(255,255,255,0.05);
                        border-radius: 10px;
                        padding: 12px;
                        margin-bottom: 20px;
                        text-align: left;
                    ">
                        <p style="color: rgba(255,255,255,0.5); font-size: 11px; margin-bottom: 5px;">
                            Catatan Pembaruan:
                        </p>
                        <p style="color: rgba(255,255,255,0.8); font-size: 13px; margin: 0; line-height: 1.5;">
                            ${escapeHtml(updateInfo.release_notes)}
                        </p>
                    </div>
                ` : ''}

                <button id="btn-update-now" style="
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    margin-bottom: 10px;
                ">
                    <i class="fa fa-download"></i> Update Sekarang
                </button>

                ${!isRequired ? `
                    <button id="btn-update-later" style="
                        width: 100%;
                        padding: 12px;
                        background: transparent;
                        color: rgba(255,255,255,0.6);
                        border: 1px solid rgba(255,255,255,0.2);
                        border-radius: 12px;
                        font-size: 14px;
                        cursor: pointer;
                    ">
                        Nanti Saja
                    </button>
                ` : ''}
            </div>
        </div>
    `;

    // Add dialog to body
    document.body.insertAdjacentHTML('beforeend', dialogHtml);

    // Add event listeners
    document.getElementById('btn-update-now').addEventListener('click', () => {
        downloadUpdate(updateInfo);
    });

    const laterBtn = document.getElementById('btn-update-later');
    if (laterBtn) {
        laterBtn.addEventListener('click', () => {
            // Save skipped version
            localStorage.setItem(SKIPPED_VERSION_KEY, updateInfo.version);
            closeUpdateDialog();
        });
    }
}

/**
 * Download and install update
 * @param {Object} updateInfo - Update info
 */
async function downloadUpdate(updateInfo) {
    const btn = document.getElementById('btn-update-now');
    if (btn) {
        btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Mengunduh...';
        btn.disabled = true;
    }

    try {
        // Get absolute URL
        const downloadUrl = updateInfo.download_url.startsWith('http')
            ? updateInfo.download_url
            : window.location.origin + updateInfo.download_url;

        console.log('[AppUpdater] Downloading from:', downloadUrl);

        // For Android, we'll open the URL which will trigger the APK download
        // The system will handle the installation prompt
        if (getPlatform() === 'android') {
            // Use Capacitor Browser plugin if available
            if (window.Capacitor?.Plugins?.Browser) {
                await window.Capacitor.Plugins.Browser.open({ url: downloadUrl });
            } else {
                // Fallback to window.open
                window.open(downloadUrl, '_system');
            }

            // Show instruction
            if (btn) {
                btn.innerHTML = '<i class="fa fa-check"></i> Unduhan Dimulai';
            }

            // Show instruction toast
            setTimeout(() => {
                showToast('Buka notifikasi untuk menginstal update', 'info');
            }, 1000);

            // Close dialog after a delay
            setTimeout(() => {
                closeUpdateDialog();
            }, 3000);

        } else if (getPlatform() === 'ios') {
            // iOS - redirect to App Store (when available)
            showToast('Versi iOS akan segera tersedia', 'info');
            closeUpdateDialog();
        }

    } catch (error) {
        console.error('[AppUpdater] Download error:', error);
        showToast('Gagal mengunduh update', 'error');

        if (btn) {
            btn.innerHTML = '<i class="fa fa-download"></i> Update Sekarang';
            btn.disabled = false;
        }
    }
}

/**
 * Close update dialog
 */
export function closeUpdateDialog() {
    const dialog = document.getElementById('app-update-dialog');
    if (dialog) {
        dialog.style.opacity = '0';
        dialog.style.transition = 'opacity 0.3s';
        setTimeout(() => dialog.remove(), 300);
    }
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    // Use existing toast if available
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }

    // Create simple toast
    let toast = document.getElementById('app-updater-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-updater-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            border-radius: 25px;
            font-size: 14px;
            font-weight: 500;
            z-index: 100000;
            opacity: 0;
            transition: opacity 0.3s;
            max-width: 90%;
            text-align: center;
        `;
        document.body.appendChild(toast);
    }

    // Set style based on type
    const colors = {
        success: { bg: 'rgba(16, 185, 129, 0.95)', color: '#fff' },
        error: { bg: 'rgba(239, 68, 68, 0.95)', color: '#fff' },
        info: { bg: 'rgba(40, 167, 233, 0.95)', color: '#fff' }
    };
    const style = colors[type] || colors.info;

    toast.style.background = style.bg;
    toast.style.color = style.color;
    toast.textContent = message;
    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

/**
 * Get current app version
 */
export function getAppVersion() {
    return {
        version: APP_VERSION,
        versionCode: APP_VERSION_CODE,
        platform: getPlatform(),
        isCapacitor
    };
}

/**
 * Manual check for updates (with UI feedback)
 */
export async function manualCheckForUpdates() {
    return checkForUpdates({ showNoUpdateToast: true, force: true });
}

// Export utilities
export { isCapacitor, getPlatform };
