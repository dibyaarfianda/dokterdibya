const DEFAULT_DISMISS_KEY = 'sisiwanita_portal_pwa_install_dismissed';

export function createPatientPwaInstallController(options = {}) {
    const getProfile = options.getProfile || (() => null);
    const getToken = options.getToken || (() => '');
    const isGuestMode = options.isGuestMode || (() => false);
    const dismissKey = options.dismissKey || DEFAULT_DISMISS_KEY;
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

    function isIntakeCompleted(profile) {
        return Boolean(profile && (
            profile.intake_completed === true
            || profile.intake_completed === 1
            || profile.intake_completed === '1'
        ));
    }

    function canShow() {
        const profile = getProfile();
        if (!profile || profile.is_guest || profile.id === 'DEMO') return false;
        if (!isIntakeCompleted(profile) || !getToken() || isGuestMode()) return false;
        if (isStandaloneMode() || isNativeApp()) return false;
        const platform = getPlatform();
        return platform === 'android' || platform === 'ios';
    }

    function configure(platform) {
        const prompt = document.getElementById('ios-install-prompt');
        const title = document.getElementById('pwa-install-title');
        const subtitle = document.getElementById('pwa-install-subtitle');
        const action = document.getElementById('pwa-install-action');
        const note = document.getElementById('pwa-install-note');
        if (!prompt) return;

        prompt.classList.toggle('is-android', platform === 'android');
        if (platform === 'android') {
            if (title) title.innerHTML = '<i class="fa-brands fa-android"></i> Install SISIwanita';
            if (subtitle) subtitle.textContent = 'Pasang SISIwanita di layar utama Android untuk akses portal lebih cepat.';
            if (action) action.innerHTML = '<i class="fa-solid fa-download"></i> Install sekarang';
            if (note) note.textContent = 'Jika tombol belum memunculkan prompt, buka menu Chrome lalu pilih "Install app".';
            return;
        }

        if (title) title.innerHTML = '<i class="fa-brands fa-apple"></i> Install SISIwanita';
        if (subtitle) subtitle.textContent = 'Simpan SISIwanita ke Home Screen iPhone/iPad setelah login portal.';
        if (note) note.textContent = 'Setelah di-install, buka dari Home Screen untuk pengalaman terbaik.';
    }

    function show(platform) {
        if (!canShow()) return;
        const prompt = document.getElementById('ios-install-prompt');
        const overlay = document.getElementById('ios-install-overlay');
        if (!prompt || !overlay) return;

        configure(platform || getPlatform());
        overlay.classList.add('active');
        prompt.classList.add('active');
        requestAnimationFrame(() => {
            prompt.style.transform = 'translateY(0)';
        });
    }

    function wasDismissed() {
        try {
            return sessionStorage.getItem(dismissKey) === 'true';
        } catch (error) {
            return false;
        }
    }

    function rememberDismissed() {
        try {
            sessionStorage.setItem(dismissKey, 'true');
        } catch (error) {}
    }

    function autoShow() {
        if (autoShown || wasDismissed() || !canShow()) return;
        autoShown = true;
        window.setTimeout(() => show(getPlatform()), 900);
    }

    function dismiss() {
        const prompt = document.getElementById('ios-install-prompt');
        const overlay = document.getElementById('ios-install-overlay');
        prompt?.classList.remove('active', 'is-android');
        overlay?.classList.remove('active');
        rememberDismissed();
    }

    function install() {
        if (!canShow()) return;
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => {
                deferredPrompt = null;
                rememberDismissed();
                dismiss();
            });
            return;
        }

        if (/Android/i.test(navigator.userAgent || '')) {
            alert('Untuk memasang SISIwanita, buka menu Chrome lalu pilih "Install app".');
            return;
        }
        alert('Buka menu Share lalu pilih "Add to Home Screen" untuk memasang SISIwanita.');
    }

    function init() {
        if (initialized) return;
        initialized = true;
        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            deferredPrompt = event;
            autoShow();
        });
        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            rememberDismissed();
            dismiss();
        });
    }

    return Object.freeze({
        autoShow,
        dismiss,
        init,
        install,
        show
    });
}
