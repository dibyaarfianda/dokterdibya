export function createPatientExitController({
    isHomeRoute,
    closeSheet,
    closeAllModals,
    stopEvent
}) {
    let installed = false;
    let exitConfirmed = false;

    function hasActiveHomeSurface() {
        return !!document.querySelector('.bottom-sheet.active, .modal-card.active:not(#exit-app-modal)');
    }

    function rearm() {
        if (exitConfirmed || !installed || !isHomeRoute()) return;
        try {
            history.pushState({ patientHomeBackGuard: true }, '', window.location.href);
        } catch (error) {}
    }

    function showExitModal() {
        closeSheet();
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('exit-app-modal');
        if (!overlay || !modal) return;
        overlay.classList.add('active');
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function cancel(event) {
        stopEvent(event);
        closeAllModals();
    }

    function requestPwaClose() {
        // Installed Android PWAs do not expose a reliable close API. These
        // calls work in browser contexts that do allow scripted closing.
        try { window.open('', '_self').close(); } catch (error) {}
        try { window.close(); } catch (error) {}
        return false;
    }

    function confirm(event) {
        stopEvent(event);
        exitConfirmed = true;
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('exit-app-modal');
        if (overlay) overlay.classList.remove('active');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';

        if (!requestPwaClose()) {
            window.setTimeout(() => {
                if (document.visibilityState !== 'hidden') {
                    window.location.replace('/app-closed.html');
                }
            }, 350);
        }
    }

    function install() {
        if (installed || !isHomeRoute() || !history.pushState) return;
        installed = true;
        try {
            history.replaceState(
                Object.assign({}, history.state || {}, { patientHomeRoot: true }),
                '',
                window.location.href
            );
            history.pushState({ patientHomeBackGuard: true }, '', window.location.href);
        } catch (error) {}

        window.addEventListener('popstate', () => {
            if (exitConfirmed || !isHomeRoute()) return;
            if (hasActiveHomeSurface()) {
                closeSheet();
                closeAllModals();
                rearm();
                return;
            }
            showExitModal();
        });
    }

    return { install, cancel, confirm };
}
