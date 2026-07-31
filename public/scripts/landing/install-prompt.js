const DISMISS_KEY = 'sisiwanita_pwa_install_dismissed';

let deferredPrompt = null;
let autoShown = false;
let initialized = false;

function isStandaloneMode() {
    return window.navigator.standalone === true
        || Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
}

function isNativeApp() {
    return Boolean(
        window.Capacitor
        && window.Capacitor.isNativePlatform
        && window.Capacitor.isNativePlatform()
    );
}

function getPlatform() {
    const userAgent = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return 'ios';
    if (/Android/i.test(userAgent)) return 'android';
    return 'desktop';
}

function rememberDismissed() {
    try {
        sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch (error) {}
}

function wasDismissed() {
    try {
        return sessionStorage.getItem(DISMISS_KEY) === 'true';
    } catch (error) {
        return false;
    }
}

export function updateButtons() {
    const androidButton = document.getElementById('btn-download-android');
    if (!androidButton) return;

    if (isNativeApp() || isStandaloneMode()) {
        androidButton.style.display = 'none';
        return;
    }

    androidButton.style.display = 'inline-flex';
    androidButton.innerHTML = getPlatform() === 'android'
        ? '<i class="fa-brands fa-android"></i> Install di Android'
        : '<i class="fa-solid fa-download"></i> Install di Browser';
}

function updateDownloadBanner() {
    const platform = getPlatform();
    const pwaButton = document.getElementById('btn-pwa-install');
    const appStoreButton = document.getElementById('btn-appstore-ios');
    const androidButton = document.getElementById('btn-download-android');

    if (platform === 'ios' && !isStandaloneMode() && !isNativeApp()) {
        if (pwaButton) pwaButton.style.display = 'inline-flex';
        if (appStoreButton) appStoreButton.style.display = 'inline-flex';
        if (androidButton) androidButton.style.display = 'none';
    } else if (platform === 'ios' && isStandaloneMode()) {
        if (appStoreButton) appStoreButton.style.display = 'inline-flex';
        if (pwaButton) pwaButton.style.display = 'none';
        if (androidButton) androidButton.style.display = 'none';
    } else if (appStoreButton) {
        appStoreButton.style.display = 'inline-flex';
    }

    updateButtons();
}

function configure(platform) {
    const prompt = document.getElementById('ios-install-prompt');
    const overlay = document.getElementById('ios-install-overlay');
    const title = document.getElementById('pwa-install-title');
    const subtitle = document.getElementById('pwa-install-subtitle');
    const action = document.getElementById('pwa-install-action');
    const note = document.getElementById('pwa-install-note');
    if (!prompt || !overlay) return;

    prompt.classList.toggle('is-android', platform === 'android');
    if (platform === 'android') {
        if (title) title.innerHTML = '<i class="fa-brands fa-android"></i> Install SISIwanita';
        if (subtitle) subtitle.textContent = 'Pasang SISIwanita sebagai PWA di layar utama Android untuk akses cepat dan notifikasi yang tetap berjalan.';
        if (action) action.innerHTML = '<i class="fa-solid fa-download"></i> Install sekarang';
        if (note) note.textContent = 'Jika tombol belum memunculkan prompt, buka menu Chrome lalu pilih "Install app" atau "Tambahkan ke layar utama".';
        return;
    }

    if (title) title.innerHTML = '<i class="fa-brands fa-apple"></i> Install SISIwanita';
    if (subtitle) subtitle.textContent = 'Simpan SISIwanita ke Home Screen iPhone/iPad agar portal terasa seperti aplikasi.';
    if (note) note.textContent = 'Setelah di-install, buka dari Home Screen untuk pengalaman terbaik.';
}

export function show(platform) {
    const prompt = document.getElementById('ios-install-prompt');
    const overlay = document.getElementById('ios-install-overlay');
    if (!prompt || !overlay) return;

    configure(typeof platform === 'string' ? platform : getPlatform());
    overlay.classList.add('active');
    prompt.classList.add('active');
    requestAnimationFrame(() => {
        prompt.style.transform = 'translateY(0)';
    });
}

export function showIos() {
    show('ios');
}

export function autoShow() {
    if (autoShown || isStandaloneMode() || isNativeApp() || wasDismissed()) return;
    const platform = getPlatform();
    if (platform !== 'android' && platform !== 'ios') return;
    autoShown = true;
    show(platform);
}

export function dismiss() {
    const prompt = document.getElementById('ios-install-prompt');
    const overlay = document.getElementById('ios-install-overlay');
    prompt?.classList.remove('active', 'is-android');
    overlay?.classList.remove('active');
    rememberDismissed();
}

export function install({ event } = {}) {
    event?.preventDefault();
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            deferredPrompt = null;
            rememberDismissed();
            dismiss();
            updateButtons();
        });
        return;
    }

    if (/Android/i.test(navigator.userAgent || '')) {
        alert('Untuk memasang SISIwanita, buka menu browser lalu pilih "Install app" atau "Tambahkan ke layar utama".');
        return;
    }
    alert('Buka halaman ini dari browser Android atau gunakan menu browser untuk memasang PWA SISIwanita.');
}

export function init() {
    if (initialized) return;
    initialized = true;

    window._iosDetection = {
        isIOS: getPlatform() === 'ios',
        isAndroid: getPlatform() === 'android',
        isStandalone: isStandaloneMode(),
        isCapacitorApp: isNativeApp()
    };

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredPrompt = event;
        updateButtons();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        rememberDismissed();
        dismiss();
        updateButtons();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.getElementById('ios-install-prompt')?.classList.contains('active')) {
            dismiss();
        }
    });

    updateDownloadBanner();
    Object.assign(window, {
        installPatientPWA: install,
        showIosInstallPrompt: showIos,
        showPortalInstallPrompt: show,
        autoShowInstallPrompt: autoShow,
        dismissIosInstallPrompt: dismiss,
        updatePatientPortalInstallButtons: updateButtons
    });
}
