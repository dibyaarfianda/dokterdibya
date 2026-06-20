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

        expect(patientModel).toContain('@SerializedName("google_id")\n    val googleId: String? = null');
        expect(authViewModel).toContain('val needsCompletion = patient?.isProfileComplete != true');
        expect(authViewModel).toContain('val needsCompletion = !patient.isProfileComplete');
        expect(completeProfileViewModel).toContain('val isGoogleUser: Boolean = false');
        expect(completeProfileViewModel).toContain('val actuallyRequired = required && !current.isExistingIntake && !current.isGoogleUser');
        expect(completeProfileViewModel).toContain('val isGoogleUser = !patient.googleId.isNullOrBlank()');
        expect(completeProfileViewModel).toContain('registrationCodeRequired = if (isGoogleUser) false else current.registrationCodeRequired');
        expect(completeProfileViewModel).toContain('registrationCodeValidated = if (isGoogleUser) true else current.registrationCodeValidated');
    });
});
