export function createPatientRouter(options = {}) {
    const {
        isGuestMode = () => false,
        isGuestLoginRoute = () => false,
        getGuestNavigationUrl = url => url,
        endGuestAndLogin = () => {},
        showGuestUpgradePrompt = () => {},
        trackGuestActivity = () => {}
    } = options;

    function go(url) {
        if (isGuestMode()) {
            if (isGuestLoginRoute(url)) {
                endGuestAndLogin();
                return;
            }

            const guestUrl = getGuestNavigationUrl(url);
            if (!guestUrl) {
                showGuestUpgradePrompt('Halaman ini memakai data atau aksi pasien asli. Masuk dengan akun pasien untuk membukanya.');
                return;
            }

            trackGuestActivity('demo_navigation', 'Buka halaman demo: ' + guestUrl, guestUrl);
            window.location.assign(guestUrl);
            return;
        }

        window.location.assign(url);
    }

    return {
        go,
        isHomeRoute() {
            return window.location.pathname === '/patient-menu.html';
        }
    };
}
