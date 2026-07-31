const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
const readNormalizedFile = (...segments) => readRepoFile(...segments).replace(/\r\n/g, '\n');

describe('staff and patient shell wave 1 contracts', () => {
    test('staff shell entry scripts use the current staff cache version', () => {
        const html = readNormalizedFile('staff', 'public', 'index-adminlte.html');
        const sw = readNormalizedFile('staff', 'public', 'sw.js');
        const versionMatch = html.match(/window\.STAFF_CACHE_VERSION = '([^']+)'/);

        expect(versionMatch).not.toBeNull();
        const staffVersion = versionMatch[1];

        expect(sw).toContain(`const STAFF_PWA_VERSION = '${staffVersion}';`);
        expect(html).toContain(`scripts/shell/actions.js?v=${staffVersion}`);
        expect(html).toContain(`scripts/shell/bootstrap.js?v=${staffVersion}`);
    });

    test('patient portal shell version governs home, manifest, service workers, and tool assets', () => {
        const rootSw = readNormalizedFile('public', 'sw.js');
        const sisiwanitaSw = readNormalizedFile('public', 'sisiwanita-sw.js');
        const patientMenu = readNormalizedFile('public', 'patient-menu.html');
        const manifest = readNormalizedFile('public', 'patient-portal.webmanifest');
        const versionMatch = rootSw.match(/const CACHE_VERSION = '([^']+)';/);

        expect(versionMatch).not.toBeNull();
        const shellVersion = versionMatch[1];

        expect(sisiwanitaSw.trim()).toBe(`importScripts('/sw.js?v=${shellVersion}');`);
        expect(patientMenu).toContain(`/patient-portal.webmanifest?v=${shellVersion}`);
        expect(patientMenu).toContain(`/sw.js?v=${shellVersion}`);
        expect(patientMenu).toContain(`/scripts/patient-menu-shell.js?v=${shellVersion}`);
        expect(manifest).toContain(`/patient-menu.html?source=pwa&v=${shellVersion}`);
    });

    test('patient retrofit shell uses data-shell-action for injected topbar and bottom navigation', () => {
        const retrofit = readNormalizedFile('public', 'scripts', 'patient-tool-retrofit.js');

        expect(retrofit).toContain('data-shell-action="open-settings"');
        expect(retrofit).toContain('data-shell-action="open-profile"');
        expect(retrofit).toContain('data-shell-action="scroll-top-home"');
        expect(retrofit).toContain("overlay.setAttribute('data-shell-action', 'close-sheet');");
        expect(retrofit).toContain('data-shell-action="go" data-shell-href="/patient-menu.html"');
        expect(retrofit).toContain('data-shell-action="open-sheet" data-shell-sheet="dokumen"');
        expect(retrofit).not.toContain('onclick="openSettingsModal(event)"');
        expect(retrofit).not.toContain('onclick="openProfileModal(event)"');
        expect(retrofit).not.toContain('onclick="scrollTopHome()"');
        expect(retrofit).not.toContain("onclick=\"go('/patient-menu.html')\"");
        expect(retrofit).not.toContain("onclick=\"openSheet('dokumen')\"");
    });

    test('patient home shell modal actions are delegated without blocking page shell actions', () => {
        const shell = readNormalizedFile('public', 'scripts', 'patient-menu-shell.js');
        const notificationController = readNormalizedFile(
            'public',
            'scripts',
            'patient-shell',
            'features',
            'notification-controller.js'
        );

        expect(shell).toContain('const modalActionHandlers = {');
        expect(shell).toContain('const shellActionHandlers = Object.assign({}, modalActionHandlers, {');
        expect(shell).toContain('bindPatientNavigation(shellActionHandlers);');
        expect(notificationController).toContain('data-shell-action="mark-all-notifications"');
        expect(notificationController).toContain('data-shell-action="mark-notification-read"');
        expect(shell).toContain('data-shell-action="open-settings-notifications"');
        expect(shell).toContain('data-shell-action="test-portal-sound"');
        expect(shell).toContain('data-shell-action="save-portal-settings"');
        expect(shell).toContain('data-shell-action="profile-photo-picker" data-photo-mode="camera"');
        expect(shell).toContain('data-shell-action="profile-photo-picker" data-photo-mode="gallery"');
        expect(shell).toContain('data-shell-action="guest-login"');
        expect(shell).not.toContain('onclick="markAllTopbarNotificationsRead(event)"');
        expect(shell).not.toContain('onclick="markTopbarNotificationRead(this.dataset.notificationId)"');
        expect(shell).not.toContain('onclick="openSettingsNotifications(event)"');
        expect(shell).not.toContain('onclick="playPortalNotificationSound(event)"');
        expect(shell).not.toContain('onclick="savePortalSettings(event)"');
        expect(shell).not.toContain(`onclick="openProfilePhotoPicker(event, \\'camera\\')"`);
        expect(shell).not.toContain(`onclick="openProfilePhotoPicker(event, \\'gallery\\')"`);
        expect(shell).not.toContain('onclick="resetProfilePhotoDraft(event)"');
        expect(shell).not.toContain('onclick="saveProfilePhotoDraft(event)"');
        expect(shell).not.toContain('onclick="endGuestAndLogin(event)"');
    });

    test('patient home static shell overlays and prompt controls use delegated actions', () => {
        const patientMenu = readNormalizedFile('public', 'patient-menu.html');
        const shell = readNormalizedFile('public', 'scripts', 'patient-menu-shell.js');

        expect(patientMenu).toContain('id="sheet-overlay" data-shell-action="close-sheet"');
        expect(patientMenu).toContain('id="modal-overlay" data-shell-action="close-all-modals"');
        expect(patientMenu).toContain('data-shell-action="close-topbar-modal" aria-label="Tutup"');
        expect(patientMenu).toContain('data-shell-action="close-bug-report-modal" aria-label="Tutup"');
        expect(patientMenu).toContain('data-shell-action="submit-bug-report"');
        expect(patientMenu).toContain('data-shell-action="cancel-exit-app"');
        expect(patientMenu).toContain('data-shell-action="confirm-exit-app"');
        expect(patientMenu).toContain('id="ios-install-overlay" data-shell-action="dismiss-patient-install-prompt"');
        expect(patientMenu).toContain('data-shell-action="install-patient-pwa"');
        expect(shell).toContain("'close-sheet': function()");
        expect(shell).toContain("'close-all-modals': function()");
        expect(shell).toContain("'close-topbar-modal': function(target, event)");
        expect(shell).toContain("'close-bug-report-modal': function(target, event)");
        expect(shell).toContain("'submit-bug-report': function(target, event)");
        expect(shell).toContain("'cancel-exit-app': function(target, event)");
        expect(shell).toContain("'confirm-exit-app': function(target, event)");
        expect(shell).toContain("'dismiss-patient-install-prompt': function()");
        expect(shell).toContain("'install-patient-pwa': function()");
        expect(shell).not.toContain('onclick="closeSheet()"');
        expect(shell).not.toContain('onclick="closeAllModals()"');
        expect(patientMenu).not.toContain('onclick="closeSheet()"');
        expect(patientMenu).not.toContain('onclick="closeAllModals()"');
        expect(patientMenu).not.toContain('onclick="closeTopbarModal(event)"');
        expect(patientMenu).not.toContain('onclick="closeBugReportModal(event)"');
        expect(patientMenu).not.toContain('onclick="submitBugReport(event)"');
        expect(patientMenu).not.toContain('onclick="cancelExitApp(event)"');
        expect(patientMenu).not.toContain('onclick="confirmExitApp(event)"');
        expect(patientMenu).not.toContain('onclick="dismissPatientInstallPrompt()"');
        expect(patientMenu).not.toContain('onclick="installPatientPWA()"');
        expect(shell).not.toContain('onclick="closeTopbarModal(event)"');
    });

    test('patient home generated shell controls use delegated actions', () => {
        const shell = readNormalizedFile('public', 'scripts', 'patient-menu-shell.js');

        expect(shell).toContain('data-shell-action="home-photo-picker"');
        expect(shell).toContain("'home-photo-picker': function(target, event)");
        expect(shell).toContain('data-shell-action="open-home-info-detail"');
        expect(shell).toContain('data-home-info-index="');
        expect(shell).toContain("'open-home-info-detail': function(target, event)");
        expect(shell).toContain('data-shell-action="go" data-shell-href="');
        expect(shell).not.toContain('onclick="openHomePhotoPicker(event)"');
        expect(shell).not.toContain('onclick="openHomeInfoDetail(');
        expect(shell).not.toContain('onclick="return handleSheetNavigation(event,');
    });

    test('patient birth shell launch and close controls use delegated actions', () => {
        const patientMenu = readNormalizedFile('public', 'patient-menu.html');
        const shell = readNormalizedFile('public', 'scripts', 'patient-menu-shell.js');

        expect(shell).toContain('data-shell-action="open-birth-data-modal"');
        expect(shell).toContain('data-shell-action="toggle-birth-congrats"');
        expect(shell).toContain('data-shell-action="birth-photo-picker"');
        expect(shell).toContain('data-shell-action="open-birth-testimonial-modal"');
        expect(shell).toContain("'open-birth-data-modal': function(target, event)");
        expect(shell).toContain("'toggle-birth-congrats': function(target, event)");
        expect(shell).toContain("'birth-photo-picker': function(target, event)");
        expect(shell).toContain("'open-birth-testimonial-modal': function(target, event)");

        expect(patientMenu).toContain('id="birth-photo-modal" data-shell-action="close-birth-photo-modal"');
        expect(patientMenu).toContain('data-shell-action="close-birth-photo-modal" aria-label="Tutup foto kelahiran"');
        expect(patientMenu).toContain('id="birth-date-wheel-modal" data-shell-action="close-birth-date-wheel"');
        expect(patientMenu).toContain('data-shell-action="close-birth-date-wheel" aria-label="Tutup"');
        expect(patientMenu).toContain('data-shell-action="close-birth-date-wheel">Batal</button>');
        expect(shell).toContain("'close-birth-photo-modal': function(target, event)");
        expect(shell).toContain("'close-birth-date-wheel': function(target, event)");

        expect(shell).not.toContain('onclick="openBirthDataModal(event, this.dataset.birthId)"');
        expect(shell).not.toContain('onclick="toggleBirthCongratsFromSettings(this.dataset.birthId,');
        expect(shell).not.toContain('onclick="openBirthPhotoPicker(event, this.dataset.birthId)"');
        expect(shell).not.toContain('onclick="openBirthTestimonialModal(event, this.dataset.birthId)"');
        expect(patientMenu).not.toContain('id="birth-photo-modal" onclick="closeBirthPhotoModal(event)"');
        expect(patientMenu).not.toContain('class="birth-photo-modal-close soundable" onclick="closeBirthPhotoModal(event)"');
        expect(patientMenu).not.toContain('id="birth-date-wheel-modal" onclick="closeBirthDateWheelPicker(event)"');
        expect(patientMenu).not.toContain('class="birth-date-wheel-close soundable" onclick="closeBirthDateWheelPicker(event)"');
    });

    test('patient home static birth and booking close controls use delegated actions', () => {
        const patientMenu = readNormalizedFile('public', 'patient-menu.html');
        const shell = readNormalizedFile('public', 'scripts', 'patient-menu-shell.js');

        expect(patientMenu).toContain('id="birth-photo-action" data-shell-action="birth-photo-picker"');
        expect(patientMenu).toContain('id="birth-extra-action" data-shell-action="open-birth-extra-modal"');
        expect(patientMenu).toContain('id="birth-testimonial-action" data-shell-action="open-birth-testimonial-modal"');
        expect(patientMenu).toContain('class="close-btn soundable" data-shell-action="close-cancel-booking-modal" aria-label="Tutup"');
        expect(patientMenu).toContain('id="booking-cancel-close-btn" data-shell-action="close-cancel-booking-modal"');

        expect(shell).toContain("'birth-photo-picker': function(target, event)");
        expect(shell).toContain("'open-birth-extra-modal': function(target, event)");
        expect(shell).toContain("'open-birth-testimonial-modal': function(target, event)");
        expect(shell).toContain("'close-cancel-booking-modal': function(target, event)");

        expect(patientMenu).not.toContain('id="birth-photo-action" onclick="openBirthPhotoPicker(event)"');
        expect(patientMenu).not.toContain('id="birth-extra-action" onclick="openBirthExtraModal(event)"');
        expect(patientMenu).not.toContain('id="birth-testimonial-action" onclick="openBirthTestimonialModal(event)"');
        expect(patientMenu).not.toContain('class="close-btn soundable" onclick="closeCancelBookingModal()"');
        expect(patientMenu).not.toContain('id="booking-cancel-close-btn" onclick="closeCancelBookingModal()"');

        expect(patientMenu).toContain('id="booking-cancel-btn" data-shell-action="cancel-active-booking"');
        expect(patientMenu).toContain('id="booking-cancel-submit-btn" data-shell-action="submit-cancel-booking"');
        expect(patientMenu).toContain('data-shell-action="apply-birth-date-wheel"');
        expect(patientMenu).not.toContain('onclick="cancelActiveBooking(event)"');
        expect(patientMenu).not.toContain('onclick="submitCancelBooking()"');
        expect(patientMenu).not.toContain('onclick="applyBirthDateWheelPicker(event)"');
    });
});
