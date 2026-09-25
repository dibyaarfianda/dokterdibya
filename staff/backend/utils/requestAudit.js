'use strict';

// Only server-registered middleware can choose this audit template. Request
// headers, query/body properties and JWT claims cannot override the symbol.
const SAFE_AUDIT_PATH = Symbol('safeAuditPath');

function safeAuditPath(req) {
    if (req[SAFE_AUDIT_PATH]) return req[SAFE_AUDIT_PATH];
    // Access/performance logs and the global patient guard run before route
    // middleware. Recognize sensitive contracts at that boundary.
    const pathname = String(req.originalUrl || req.url || req.path || '').split('?')[0];
    if (req.method === 'GET' && /^\/api\/patients\/?$/i.test(pathname)) {
        return '/api/patients';
    }
    if (req.method === 'GET' && /^\/api\/patients\/search\/advanced\/?$/i.test(pathname)) {
        return '/api/patients/search/advanced';
    }
    if (req.method === 'GET' && /^\/api\/dashboard-stats\/?$/i.test(pathname)) {
        return '/api/dashboard-stats';
    }
    if (req.method === 'GET' && /^\/api\/notifications\/count\/?$/i.test(pathname)) {
        return '/api/notifications/count';
    }
    if (req.method === 'POST' && /^\/api\/medical-records\/[^/]+\/sections\/[^/]+\/reset\/?$/i.test(pathname)) {
        return '/api/medical-records/:mrId/sections/:recordType/reset';
    }
    if (req.method === 'DELETE' && /^\/api\/medical-records\/by-type\/[^/]+\/?$/i.test(pathname)) {
        return '/api/medical-records/by-type/:recordType';
    }
    return null;
}

function requestAuditUrl(req) {
    return safeAuditPath(req) || req.originalUrl || req.url || req.path;
}

function withSafeAuditPath(template) {
    return (req, res, next) => {
        req[SAFE_AUDIT_PATH] = template;
        next();
    };
}

function requestAuditFields(req, fields) {
    // Sensitive routes log the fixed operation and outcome message, not path
    // parameters, token identities, user-supplied request IDs or raw errors.
    // Unmarked routes retain their existing useful audit metadata and paths.
    const path = safeAuditPath(req);
    if (!path) return fields;
    if (path === '/api/patients' || path === '/api/patients/search/advanced') return {
        path,
        ...(Number.isInteger(fields.statusCode) ? { statusCode: fields.statusCode } : {}),
        ...(typeof fields.duration === 'string' && /^\d+(?:\.\d+)?ms$/.test(fields.duration) ? { duration: fields.duration } : {}),
        ...(typeof fields.responseTime === 'string' && /^\d+(?:\.\d+)?ms$/.test(fields.responseTime) ? { responseTime: fields.responseTime } : {})
    };
    return {
        path,
        ...(Number.isInteger(fields.statusCode) ? { statusCode: fields.statusCode } : {})
    };
}

module.exports = { withSafeAuditPath, requestAuditFields, requestAuditUrl, safeAuditPath };
