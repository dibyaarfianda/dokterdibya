'use strict';

const db = require('../db');
const { normalizePath } = require('./patientRouteAccess');
const PatientAccountSuspensionService = require('../services/PatientAccountSuspensionService');

// Routes a suspended patient may still use: identity/status checks for the
// portal popup, and the inbox (/pesan.html) to talk to staff.
const SUSPENDED_ALLOWED_RULES = [
    ['GET', /^\/api\/patients\/(?:verify|profile|account-status)$/],
    [['POST', 'DELETE'], /^\/api\/patients\/(?:push-token|fcm-token)$/],
    ['GET', /^\/api\/community-chat\/(?:inbox|inbox\/count)$/]
];

// Room-scoped inbox routes: allowed only for the patient's own direct room.
const SUSPENDED_ROOM_RULES = [
    [['GET', 'POST'], /^\/api\/community-chat\/rooms\/([^/]+)\/messages$/],
    ['POST', /^\/api\/community-chat\/rooms\/([^/]+)\/read$/]
];

function methodMatches(methods, method) {
    return (Array.isArray(methods) ? methods : [methods]).includes(method);
}

function matchSuspendedRoute(method, url) {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const path = normalizePath(url);
    if (!path) return { allowed: false };

    if (SUSPENDED_ALLOWED_RULES.some(([methods, pattern]) => methodMatches(methods, normalizedMethod) && pattern.test(path))) {
        return { allowed: true };
    }

    for (const [methods, pattern] of SUSPENDED_ROOM_RULES) {
        if (!methodMatches(methods, normalizedMethod)) continue;
        const match = pattern.exec(path);
        if (match) return { allowed: false, roomSlug: match[1] };
    }

    return { allowed: false };
}

async function isOwnDirectRoom(roomSlug, patientId) {
    const [rows] = await db.query(
        `SELECT is_direct, direct_patient_id
         FROM community_chat_rooms
         WHERE slug = ? AND is_archived = 0
         LIMIT 1`,
        [roomSlug]
    );
    const room = rows[0];
    return Boolean(room)
        && Number(room.is_direct) === 1
        && String(room.direct_patient_id || '') === String(patientId);
}

function suspendedResponse(res, suspension) {
    return res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        account_suspended: true,
        message: PatientAccountSuspensionService.SUSPENDED_PATIENT_MESSAGE,
        reason: suspension.reason || '',
        suspended_at: suspension.suspended_at || null,
        inbox_url: '/pesan.html'
    });
}

/**
 * Returns true when the request was answered (blocked). Call only for verified
 * patient tokens.
 */
async function enforcePatientAccountSuspension(req, res, patientId) {
    const suspension = await PatientAccountSuspensionService.getActiveSuspension(patientId);
    if (!suspension) return false;

    const fullPath = req.originalUrl || req.url;
    const decision = matchSuspendedRoute(req.method, fullPath);
    if (decision.allowed) return false;

    if (decision.roomSlug) {
        try {
            if (await isOwnDirectRoom(decision.roomSlug, patientId)) return false;
        } catch (_error) {
            // Fall through to the suspension response.
        }
    }

    suspendedResponse(res, suspension);
    return true;
}

module.exports = {
    enforcePatientAccountSuspension,
    matchSuspendedRoute
};
