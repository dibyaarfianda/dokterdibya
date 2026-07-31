function requirePatientSession() {
    if (!window.PatientSession) {
        throw new Error('PatientSession must be loaded before the patient shell');
    }
    return window.PatientSession;
}

export function getPatientToken() {
    return requirePatientSession().getToken();
}

export function getPatientUser() {
    return requirePatientSession().getUser() || {};
}

export function setPatientUser(user, options = { persistent: true }) {
    return requirePatientSession().setUser(user, options);
}

export function clearPatientAuth() {
    requirePatientSession().clearAuth();
}

export function redirectToPatientLogin() {
    clearPatientAuth();
    window.location.replace('/patient-login.html');
}
