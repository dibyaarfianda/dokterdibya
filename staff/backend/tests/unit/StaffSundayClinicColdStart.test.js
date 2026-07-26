const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs
    .readFileSync(path.join(repoRoot, ...segments), 'utf8')
    .replace(/\r\n/g, '\n');

function functionSource(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

describe('staff Sunday Clinic cold-start contracts', () => {
    test('reuses the server auth result and paints navbar identity before core modules finish', () => {
        const bootstrap = readRepoFile('staff', 'public', 'scripts', 'shell', 'bootstrap.js');
        const credentials = readRepoFile('staff', 'public', 'scripts', 'shell', 'credentials.js');

        const corePromiseStart = bootstrap.indexOf('const coreModulesPromise = Promise.all([');
        const serverAuthReady = bootstrap.indexOf('const serverVerifiedUser = await authInitPromise;');
        const guardedUserReady = bootstrap.indexOf(
            'const user = await verifyStaffCredentials({ auth, serverVerifiedUser });'
        );
        const verifiedTokenReady = bootstrap.indexOf(
            'const serverVerifiedToken = await getIdToken();'
        );
        const verifiedUserGetter = bootstrap.indexOf(
            'window.getShellVerifiedStaffUser = async () =>'
        );
        const navbarIdentityUpdate = bootstrap.indexOf(
            "const navName = document.getElementById('navbar-user-name');"
        );
        const corePromiseAwait = bootstrap.indexOf('await coreModulesPromise');

        expect(corePromiseStart).toBeGreaterThan(-1);
        expect(serverAuthReady).toBeGreaterThan(corePromiseStart);
        expect(guardedUserReady).toBeGreaterThan(serverAuthReady);
        expect(verifiedTokenReady).toBeGreaterThan(guardedUserReady);
        expect(verifiedUserGetter).toBeGreaterThan(verifiedTokenReady);
        expect(navbarIdentityUpdate).toBeGreaterThan(verifiedUserGetter);
        expect(corePromiseAwait).toBeGreaterThan(navbarIdentityUpdate);
        expect(bootstrap).toContain(
            'currentToken === serverVerifiedToken ? user : null'
        );

        // The credential guard must accept the exact user returned by initAuth.
        // Its existing /api/auth/me request remains the fallback/error path only.
        const guardSignature = credentials.indexOf(
            'verifyStaffCredentials({ auth, serverVerifiedUser } = {})'
        );
        const serverUserBranch = credentials.indexOf('serverVerifiedUser', guardSignature + 1);
        const fallbackFetch = credentials.indexOf('/api/auth/me', guardSignature);

        expect(guardSignature).toBeGreaterThan(-1);
        expect(serverUserBranch).toBeGreaterThan(guardSignature);
        expect(fallbackFetch).toBeGreaterThan(serverUserBranch);
    });

    test('overlaps feature loading with the fragment while preserving fragment-before-module evaluation', () => {
        const main = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const showSundayClinic = functionSource(
            main,
            'async function showSundayClinicPage',
            '\nfunction showSundayClinicClosingPage'
        );

        const featureStart = showSundayClinic.indexOf(
            'const sundayClinicFeaturePromise ='
        );
        const fragmentAwait = showSundayClinic.indexOf(
            "await ensureRegisteredPage('sunday-clinic')"
        );
        const moduleStart = showSundayClinic.indexOf(
            'const sundayClinicModulePromise = ensureSundayClinicModule();'
        );
        const joinedAwait = showSundayClinic.indexOf(
            'await Promise.all([sundayClinicFeaturePromise, sundayClinicModulePromise]);'
        );

        expect(featureStart).toBeGreaterThan(-1);
        expect(fragmentAwait).toBeGreaterThan(featureStart);
        expect(moduleStart).toBeGreaterThan(fragmentAwait);
        expect(joinedAwait).toBeGreaterThan(moduleStart);
    });

    test('preloads the Sunday Clinic fragment before evaluating its DOM-dependent module', () => {
        const main = readRepoFile('staff', 'public', 'scripts', 'main.js');
        const showKlinikPrivate = functionSource(
            main,
            'function showKlinikPrivatePage()',
            '\nfunction showAntrianOnlinePage'
        );

        const fragmentPreload = showKlinikPrivate.indexOf(
            "ensureRegisteredPage('sunday-clinic')"
        );
        const modulePreload = showKlinikPrivate.indexOf(
            'ensureSundayClinicModule()'
        );

        expect(fragmentPreload).toBeGreaterThan(-1);
        expect(modulePreload).toBeGreaterThan(fragmentPreload);
    });

    test('reuses the shell-verified staff identity before the standalone auth API fallback', () => {
        const sundayClinic = readRepoFile('staff', 'public', 'scripts', 'sunday-clinic.js');
        const checkAuthentication = functionSource(
            sundayClinic,
            'async function checkAuthentication()',
            '\n// ============================================================================\n// HANDLE PATIENT FROM URL'
        );

        const verifiedShellUser = checkAuthentication.indexOf('window.getShellVerifiedStaffUser');
        const fallbackApiCall = checkAuthentication.indexOf("apiClient.get('/api/auth/me')");

        expect(verifiedShellUser).toBeGreaterThan(-1);
        expect(fallbackApiCall).toBeGreaterThan(verifiedShellUser);
    });
});
