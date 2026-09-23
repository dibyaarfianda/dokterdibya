const {
    isPatientAllowedRoute,
    isPatientAuthBootstrapRoute
} = require('../../security/patientRouteAccess');

describe('patient route access policy', () => {
    test.each([
        ['GET', '/api/patients/profile'],
        ['GET', '/api/patients/profile?_t=123'],
        ['PUT', '/api/patients/profile/'],
        ['GET', '/api/patients/pregnancy-tracker'],
        ['POST', '/api/patient/birth-self-report'],
        ['GET', '/api/patient-intake/my-intake'],
        ['PUT', '/api/patient-intake/my-intake'],
        ['GET', '/api/patient-documents/my-documents'],
        ['GET', '/api/patient-documents/42/content'],
        ['POST', '/api/patient-documents/42/view'],
        ['GET', '/api/patient-documents/share/opaque-share-token'],
        ['GET', '/api/patient-questions/can-ask'],
        ['GET', '/api/patient-questions/question-1'],
        ['POST', '/api/patient-questions'],
        ['GET', '/api/sunday-appointments/available?date=2026-09-27'],
        ['POST', '/api/sunday-appointments/42/confirm-attendance'],
        ['PUT', '/api/sunday-appointments/42/cancel'],
        ['GET', '/api/hospital-appointments/patient'],
        ['POST', '/api/polls/patient/9/vote'],
        ['GET', '/api/fertility-calendar/calendar-data'],
        ['DELETE', '/api/fertility-calendar/intercourse/2026-09-23'],
        ['POST', '/api/kick-counter/kick'],
        ['PUT', '/api/contraction-timer/session/7/end'],
        ['GET', '/api/tanya-subscriptions/payment/order-7'],
        ['POST', '/api/patient-billing/bill-7/create-payment'],
        ['GET', '/api/announcements/active'],
        ['POST', '/api/announcements/9/like'],
        ['GET', '/api/articles/9'],
        ['POST', '/api/articles/9/like'],
        ['GET', '/api/community-chat/rooms'],
        ['POST', '/api/community-chat/rooms/general/messages'],
        ['GET', '/api/community-chat/unread'],
        ['POST', '/api/support-chat/sessions'],
        ['POST', '/api/patient-feedback'],
        ['GET', '/api/patient-workdesk/layout'],
        ['PUT', '/api/patient-workdesk/public-settings'],
        ['GET', '/api/billings/my-billings'],
        ['GET', '/api/billings/99/details'],
        ['GET', '/api/practice-schedules'],
        ['GET', '/api/sunday-clinic/queue/public'],
        ['POST', '/api/guest-activity']
    ])('allows patient operation %s %s', (method, url) => {
        expect(isPatientAllowedRoute(method, url)).toBe(true);
    });

    test.each([
        ['GET', '/api/patients'],
        ['GET', '/api/patients/all'],
        ['GET', '/api/patients/other-patient-id'],
        ['PUT', '/api/patients/other-patient-id'],
        ['GET', '/api/patient-intake'],
        ['GET', '/api/patient-intake/submission-1'],
        ['GET', '/api/patient-documents/by-patient/other-patient-id'],
        ['POST', '/api/patient-documents/42/create-share-link'],
        ['GET', '/api/patient-documents/file/private-key.pdf'],
        ['GET', '/api/patient-questions/staff/all'],
        ['GET', '/api/support-chat/staff/pending'],
        ['POST', '/api/polls/staff/create'],
        ['GET', '/api/sunday-appointments/list'],
        ['PUT', '/api/sunday-appointments/42/status'],
        ['POST', '/api/sunday-appointments/42/start-clinic-record'],
        ['POST', '/api/usg-photos/upload'],
        ['GET', '/api/community-chat/admin/patient-users'],
        ['GET', '/api/community-chat/rooms/general/moderators'],
        ['POST', '/api/community-chat/rooms/direct'],
        ['PUT', '/api/community-chat/rooms/general/moderators'],
        ['POST', '/api/community-chat/rooms/direct-room/archive'],
        ['POST', '/api/articles'],
        ['GET', '/api/articles/admin/all'],
        ['GET', '/api/announcements'],
        ['POST', '/api/birth-classes/sessions'],
        ['GET', '/api/registration-codes'],
        ['GET', '/api/guest-activity'],
        ['GET', '/api/app-version/logs'],
        ['POST', '/api/app/version'],
        ['GET', '/api/sunday-clinic/patient-visits/other-patient-id'],
        ['POST', '/api/tanya-subscriptions/webhook'],
        ['GET', '/api/polls/staff/list']
    ])('denies staff operation %s %s', (method, url) => {
        expect(isPatientAllowedRoute(method, url)).toBe(false);
    });

    test('does not allow a valid path with the wrong method', () => {
        expect(isPatientAllowedRoute('DELETE', '/api/announcements/9/like')).toBe(false);
        expect(isPatientAllowedRoute('POST', '/api/patients/profile')).toBe(false);
        expect(isPatientAllowedRoute('GET', '/api/patient-feedback')).toBe(false);
    });

    test.each([
        ['POST', '/api/auth/patient-login'],
        ['POST', '/api/registration-codes/validate'],
        ['POST', '/api/patients/register'],
        ['POST', '/api/patients/login'],
        ['POST', '/api/patients/auth/google'],
        ['POST', '/api/patients/google-auth-code']
    ])('recognizes patient bootstrap operation %s %s', (method, url) => {
        expect(isPatientAuthBootstrapRoute(method, url)).toBe(true);
    });

    test('bootstrap matching is exact and method-aware', () => {
        expect(isPatientAuthBootstrapRoute('GET', '/api/patients/login')).toBe(false);
        expect(isPatientAuthBootstrapRoute('POST', '/api/patients/login/anything')).toBe(false);
    });
});
