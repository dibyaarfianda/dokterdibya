'use strict';

function normalizeMethod(method) {
    return String(method || 'GET').trim().toUpperCase();
}

function normalizePath(url) {
    try {
        const rawPath = new URL(String(url || '/'), 'http://localhost').pathname;
        const decodedPath = decodeURIComponent(rawPath).replace(/\/{2,}/g, '/');
        const withoutTrailingSlash = decodedPath.length > 1
            ? decodedPath.replace(/\/+$/, '')
            : decodedPath;
        return withoutTrailingSlash.toLowerCase();
    } catch (_error) {
        return null;
    }
}

function createRule(methods, pattern) {
    const allowedMethods = new Set((Array.isArray(methods) ? methods : [methods]).map(normalizeMethod));
    return { allowedMethods, pattern };
}

const PATIENT_AUTH_BOOTSTRAP_RULES = [
    createRule('POST', /^\/api\/auth\/patient-login$/),
    createRule('POST', /^\/api\/registration-codes\/(?:validate|use)$/),
    createRule('POST', /^\/api\/patients\/(?:register|login|auth\/google|google-auth-code)$/)
];

const PATIENT_ROUTE_RULES = [
    createRule('GET', /^\/api\/patients\/(?:verify|profile|portal-settings|pregnancy-tracker|medications|birth-record|daily-quote|pregnancy-data)$/),
    createRule('PUT', /^\/api\/patients\/(?:profile|profile\/me|portal-settings)$/),
    createRule('POST', /^\/api\/patients\/(?:push-token|fcm-token|track-page|upload-photo|upload-home-photo|set-password|change-password|complete-profile|complete-profile-full)$/),
    createRule('DELETE', /^\/api\/patients\/(?:push-token|fcm-token|home-photo)$/),

    createRule('GET', /^\/api\/patient\/(?:birth-pending|birth-all|birth-congratulations|estimasi-biaya)$/),
    createRule('POST', /^\/api\/patient\/(?:birth-self-report|birth-data\/[^/]+|birth-extra\/[^/]+|birth-testimonial\/[^/]+|birth-dismiss\/[^/]+|birth-show\/[^/]+|birth-photo\/[^/]+)$/),

    createRule('POST', /^\/api\/patient-intake$/),
    createRule(['GET', 'PUT'], /^\/api\/patient-intake\/my-intake$/),
    createRule('GET', /^\/api\/patient-intake\/status$/),

    createRule('GET', /^\/api\/patient-documents\/(?:unread-usg-count|unread-counts|my-documents|my-uploads)$/),
    createRule('POST', /^\/api\/patient-documents\/(?:mark-all-viewed|patient-upload|[^/]+\/(?:view|track))$/),
    createRule('GET', /^\/api\/patient-documents\/[^/]+\/content$/),
    createRule('DELETE', /^\/api\/patient-documents\/my-uploads\/[^/]+$/),
    createRule('GET', /^\/api\/patient-documents\/share\/[^/]+$/),

    createRule('GET', /^\/api\/patient-questions\/(?:can-ask|[^/]+)$/),
    createRule(['GET', 'POST'], /^\/api\/patient-questions$/),

    createRule('GET', /^\/api\/sunday-appointments\/(?:available|sundays|my-bookings|patient|my-pending-confirmation)$/),
    createRule('POST', /^\/api\/sunday-appointments\/(?:book|[^/]+\/(?:confirm-attendance|cancel-attendance))$/),
    createRule('PUT', /^\/api\/sunday-appointments\/[^/]+\/cancel$/),
    createRule('GET', /^\/api\/sunday-appointments\/by-token\/[^/]+$/),
    createRule('POST', /^\/api\/sunday-appointments\/by-token\/[^/]+\/(?:confirm|cancel)$/),

    createRule('GET', /^\/api\/hospital-appointments\/(?:schedules|patient)$/),
    createRule('POST', /^\/api\/hospital-appointments\/book$/),

    createRule('GET', /^\/api\/articles(?:\/categories|\/[^/]+|\/[^/]+\/liked)?$/),
    createRule('POST', /^\/api\/articles\/[^/]+\/like$/),
    createRule('GET', /^\/api\/announcements\/(?:active|[^/]+)$/),
    createRule('POST', /^\/api\/announcements\/[^/]+\/like$/),
    createRule('GET', /^\/api\/greeting-cards\/active$/),

    createRule('GET', /^\/api\/polls\/patient\/active$/),
    createRule('POST', /^\/api\/polls\/patient\/[^/]+\/(?:vote|comment)$/),
    createRule('POST', /^\/api\/polls\/patient\/[^/]+\/comments\/[^/]+\/like$/),

    createRule('GET', /^\/api\/fertility-calendar(?:\/(?:calendar-data|intercourse|predictions))?$/),
    createRule('POST', /^\/api\/fertility-calendar(?:\/intercourse)?$/),
    createRule('PUT', /^\/api\/fertility-calendar\/[^/]+$/),
    createRule('DELETE', /^\/api\/fertility-calendar\/(?:[^/]+|intercourse\/[^/]+)$/),

    createRule('GET', /^\/api\/kick-counter\/(?:today|stats|history)$/),
    createRule('POST', /^\/api\/kick-counter\/(?:session|kick)$/),
    createRule('PUT', /^\/api\/kick-counter\/session\/[^/]+\/end$/),
    createRule('DELETE', /^\/api\/kick-counter\/session\/[^/]+$/),

    createRule('GET', /^\/api\/contraction-timer\/(?:today|history)$/),
    createRule('POST', /^\/api\/contraction-timer\/(?:session|event)$/),
    createRule('PUT', /^\/api\/contraction-timer\/session\/[^/]+\/(?:assessment|end)$/),

    createRule('GET', /^\/api\/tanya-subscriptions\/(?:tiers|my|payments|payment\/[^/]+)$/),
    createRule('POST', /^\/api\/tanya-subscriptions\/(?:subscribe|cancel|simulate-payment)$/),

    createRule('GET', /^\/api\/patient-billing\/(?:my-bills|[^/]+\/(?:details|payment-details)|[^/]+\/payment-status\/[^/]+)$/),
    createRule('POST', /^\/api\/patient-billing\/[^/]+\/(?:create-payment|create-insurance-payment)$/),

    createRule('GET', /^\/api\/patient-notifications(?:\/(?:count|with-announcements|queue-reminder-settings))?$/),
    createRule('PUT', /^\/api\/patient-notifications\/queue-reminder-settings$/),
    createRule('POST', /^\/api\/patient-notifications\/(?:[^/]+\/read|mark-read-by-link|read-all)$/),

    createRule('GET', /^\/api\/patient-stories(?:\/my|\/[^/]+)?$/),
    createRule('POST', /^\/api\/patient-stories(?:\/[^/]+\/(?:reaction|report))?$/),
    createRule('POST', /^\/api\/patient-feedback$/),

    createRule('GET', /^\/api\/support-chat\/sessions\/current$/),
    createRule('POST', /^\/api\/support-chat\/(?:sessions|sessions\/[^/]+\/(?:message|rating))$/),

    createRule('GET', /^\/api\/community-chat\/(?:rooms|unread|me\/profile|profiles\/[^/]+\/[^/]+|rooms\/[^/]+\/(?:messages|members)|rooms\/[^/]+\/messages\/[^/]+\/context)$/),
    createRule('POST', /^\/api\/community-chat\/(?:rooms|rooms\/[^/]+\/(?:messages|read))$/),
    createRule('PUT', /^\/api\/community-chat\/me\/profile$/),
    createRule('DELETE', /^\/api\/community-chat\/rooms\/[^/]+\/messages\/[^/]+$/),

    createRule('GET', /^\/api\/patient-workdesk\/(?:layout|public\/[^/]+)$/),
    createRule('PUT', /^\/api\/patient-workdesk\/(?:layout|public-settings)$/),
    createRule('POST', /^\/api\/patient-workdesk\/reset$/),

    createRule('GET', /^\/api\/billings\/(?:my-billings|[^/]+\/details)$/),
    createRule('GET', /^\/api\/practice-schedules(?:\/check-disabled)?$/),
    createRule('GET', /^\/api\/doctors\/(?:available|[^/]+)$/),
    createRule('GET', /^\/api\/app\/version$/),
    createRule('GET', /^\/api\/app-version(?:\/download\/[^/]+)?$/),
    createRule('GET', /^\/api\/registration-codes\/settings$/),
    createRule(['POST'], /^\/api\/registration-codes\/(?:validate|use)$/),
    createRule('GET', /^\/api\/birth-classes\/sessions\/public$/),
    createRule('POST', /^\/api\/birth-classes\/register$/),
    createRule('POST', /^\/api\/guest-activity$/),
    createRule('GET', /^\/api\/sunday-clinic\/queue\/(?:public|settings)$/)
];

function matchesRule(rule, method, path) {
    return rule.allowedMethods.has(method) && rule.pattern.test(path);
}

function matchesAnyRule(rules, method, url) {
    const normalizedMethod = normalizeMethod(method);
    const normalizedPath = normalizePath(url);
    if (!normalizedPath) return false;
    return rules.some(rule => matchesRule(rule, normalizedMethod, normalizedPath));
}

function isPatientAllowedRoute(method, url) {
    return matchesAnyRule(PATIENT_ROUTE_RULES, method, url)
        || matchesAnyRule(PATIENT_AUTH_BOOTSTRAP_RULES, method, url);
}

function isPatientAuthBootstrapRoute(method, url) {
    return matchesAnyRule(PATIENT_AUTH_BOOTSTRAP_RULES, method, url);
}

module.exports = {
    isPatientAllowedRoute,
    isPatientAuthBootstrapRoute,
    normalizePath
};
