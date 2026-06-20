const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

describe('patient Google registration flow contract', () => {
    test('Google auth responses include profile completion fields for native routing', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'patients-auth.js');

        expect(route).toContain('function formatDateOnlyLocal(value)');
        expect(route).toContain('birth_date: formatDateOnlyLocal(patient.birth_date)');
        expect(route).toContain('profile_completed: patient.profile_completed || 0');
        expect(route).toContain('google_id: patient.google_id || googleId');
    });

    test('native app treats Google registration code as already satisfied after Google auth', () => {
        const patientModel = readRepoFile(
            'android-native',
            'app',
            'src',
            'main',
            'java',
            'com',
            'dokterdibya',
            'patient',
            'data',
            'model',
            'Patient.kt'
        );
        const authViewModel = readRepoFile(
            'android-native',
            'app',
            'src',
            'main',
            'java',
            'com',
            'dokterdibya',
            'patient',
            'viewmodel',
            'AuthViewModel.kt'
        );
        const completeProfileViewModel = readRepoFile(
            'android-native',
            'app',
            'src',
            'main',
            'java',
            'com',
            'dokterdibya',
            'patient',
            'viewmodel',
            'CompleteProfileViewModel.kt'
        );
        const navGraph = readRepoFile(
            'android-native',
            'app',
            'src',
            'main',
            'java',
            'com',
            'dokterdibya',
            'patient',
            'ui',
            'navigation',
            'NavGraph.kt'
        );
        const strings = readRepoFile('android-native', 'app', 'src', 'main', 'res', 'values', 'strings.xml');

        expect(patientModel).toContain('@SerializedName("google_id")\n    val googleId: String? = null');
        expect(authViewModel).toContain('val needsCompletion = patient?.isProfileComplete != true');
        expect(authViewModel).toContain('val needsCompletion = !patient.isProfileComplete');
        expect(completeProfileViewModel).toContain('val isGoogleUser: Boolean = false');
        expect(completeProfileViewModel).toContain('val actuallyRequired = required && !current.isExistingIntake && !current.isGoogleUser');
        expect(completeProfileViewModel).toContain('val isGoogleUser = !patient.googleId.isNullOrBlank()');
        expect(completeProfileViewModel).toContain('registrationCodeRequired = if (isGoogleUser) false else current.registrationCodeRequired');
        expect(completeProfileViewModel).toContain('registrationCodeValidated = if (isGoogleUser) true else current.registrationCodeValidated');
        expect(navGraph).toContain('object RegistrationCode : Screen("registration_code")');
        expect(navGraph).toContain('navController.navigate(Screen.RegistrationCode.route)');
        expect(navGraph).toContain('RegistrationCodeScreen(');
        expect(navGraph).toContain('onGoogleSignIn()');
        expect(strings).toContain('<string name="login_google">Daftar dengan Google</string>');
        expect(strings).not.toContain('Masuk dengan Google');
    });

    test('patient web login uses registration-first Google flow only', () => {
        const loginPage = readRepoFile('public', 'patient-login.html');
        const mobileCallback = readRepoFile('public', 'mobile-google-callback.html');
        const rootSw = readRepoFile('public', 'sw.js');
        const sisiwanitaSw = readRepoFile('public', 'sisiwanita-sw.js');
        const mobileDisabled = readRepoFile('public', 'mobile-app-disabled.html');
        const patientMenu = readRepoFile('public', 'patient-menu.html');
        const manifest = readRepoFile('public', 'patient-portal.webmanifest');

        expect(loginPage).toContain('<section class="portal-card login-card" id="page-register">');
        expect(loginPage).toContain("const requestedMode = 'register';");
        expect(loginPage).toContain("let pendingGoogleAction = 'register';");
        expect(loginPage).toContain("setAuthMode('register');");
        expect(loginPage).toContain('id="btn-google-register" onclick="registerWithGoogle()"');
        expect(loginPage).toContain('<span>Daftar dengan Google</span>');
        expect(loginPage).not.toContain('id="page-login"');
        expect(loginPage).not.toContain('loginWithGoogle()');
        expect(loginPage).not.toContain('Masuk dengan Google');
        expect(loginPage).not.toContain("pendingGoogleAction = 'login'");
        expect(mobileCallback).toContain('/patient-login.html?mode=register');
        expect(mobileDisabled).toContain('patient-login.html?mode=register');
        expect(mobileDisabled).not.toContain('autoGoogle=1');
        expect(rootSw).toContain("const CACHE_VERSION = '20260620googlereg1';");
        expect(sisiwanitaSw).toContain("const CACHE_VERSION = '20260620googlereg1';");
        expect(patientMenu).toContain('/patient-portal.webmanifest?v=20260620googlereg1');
        expect(patientMenu).toContain("/sw.js?v=20260620googlereg1");
        expect(manifest).toContain('/patient-menu.html?source=pwa&v=20260620googlereg1');
    });
});
