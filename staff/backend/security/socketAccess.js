const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { ROLE_NAMES, ROLE_ID_TO_NAME } = require('../constants/roles');
const { accessControlService: defaultAccessControlService } = require('../services/AccessControlService');
const { socketAuthMetrics } = require('./socketAuthMetrics');
const { syncPermissionRooms, userRoom } = require('./realtimePermissions');
const expiredSockets = new WeakSet();

function authError(code) {
    const error = new Error(code);
    error.data = { code };
    return error;
}

function resolveSocketPrincipal(token, { allowAnonymous = true } = {}) {
    if (token === undefined || token === null || token === '') {
        if (allowAnonymous) return null;
        throw authError('AUTH_MISSING');
    }
    if (typeof token !== 'string') throw authError('AUTH_INVALID');
    let claims;
    try {
        claims = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (error) {
        throw authError(error.name === 'TokenExpiredError' ? 'AUTH_EXPIRED' : 'AUTH_INVALID');
    }
    if (!claims || !['string', 'number'].includes(typeof claims.id) || !String(claims.id).trim() || !Number.isFinite(claims.exp)) {
        throw authError('AUTH_INVALID');
    }
    const patient = claims.user_type === 'patient' || claims.role === 'patient';
    const explicitStaff = claims.user_type === 'staff';
    const role = claims.role || ROLE_ID_TO_NAME[claims.role_id];
    if (!patient && !explicitStaff && !Object.values(ROLE_NAMES).includes(role)) throw authError('FORBIDDEN');
    if (claims.demo_mode === true) throw authError('FORBIDDEN');
    return Object.freeze({
        id: String(claims.id), name: typeof claims.name === 'string' ? claims.name : '',
        role: patient ? 'patient' : role, role_id: claims.role_id,
        user_type: patient ? 'patient' : 'staff', is_superadmin: claims.is_superadmin === true,
        exp: claims.exp
    });
}

function requireSocketPrincipal(socket, { staffOnly = false, errorEvent = 'auth:error' } = {}) {
    const principal = socket.data?.principal;
    const code = !principal ? 'AUTH_MISSING'
        : principal.exp * 1000 <= Date.now() ? 'AUTH_EXPIRED'
            : staffOnly && principal.user_type !== 'staff' ? 'FORBIDDEN' : null;
    if (code) {
        if (code === 'AUTH_EXPIRED') disconnectExpiredSocket(socket, errorEvent);
        else socket.emit(errorEvent, { code });
        return null;
    }
    return socket.connected ? principal : null;
}

function disconnectExpiredSocket(socket, errorEvent = 'auth:error') {
    if (expiredSockets.has(socket)) return;
    expiredSockets.add(socket);
    socketAuthMetrics.expiredAfterConnect();
    socket.emit(errorEvent, { code: 'AUTH_EXPIRED' });
    socket.disconnect(true);
}

function installSocketAccess(io, options = {}) {
    const accessControlService = options.accessControlService || defaultAccessControlService;
    io.use(async (socket, next) => {
        try {
            let principal = resolveSocketPrincipal(socket.handshake.auth?.token, options);
            let access = null;
            if (principal?.user_type === 'staff') {
                access = await accessControlService.getEffectiveAccess(principal.id);
                if (!access.isActive) throw authError('ACCOUNT_INACTIVE');
                principal = Object.freeze({
                    ...principal,
                    role: access.roleName || principal.role,
                    role_id: access.roleId,
                    is_superadmin: access.isSuperadmin
                });
            }
            Object.defineProperty(socket.data, 'principal', { value: principal, enumerable: true });
            Object.defineProperty(socket.data, 'access', { value: access, enumerable: true, writable: true });
            socketAuthMetrics.accepted(principal === null);
            next();
        } catch (error) {
            const code = error?.data?.code || error?.code;
            const stable = ['AUTH_MISSING', 'AUTH_INVALID', 'AUTH_EXPIRED', 'FORBIDDEN', 'ACCESS_DENIED', 'ACCOUNT_INACTIVE'].includes(code)
                ? (error?.data?.code ? error : authError(code)) : authError('AUTH_INVALID');
            socketAuthMetrics.rejected(stable.data.code);
            next(stable);
        }
    });
    // Registered before domain handlers; anonymous clients get no shared room.
    io.on('connection', async socket => {
        const principal = socket.data.principal;
        if (!principal) return;
        try {
            if (principal.user_type === 'staff') {
                await socket.join('staff');
                await socket.join(userRoom(principal.id));
                const latestAccess = await accessControlService.getEffectiveAccess(principal.id);
                if (!latestAccess.isActive) {
                    socket.emit('access:changed', {
                        access_version: latestAccess.accessVersion,
                        active: false
                    });
                    socket.disconnect(true);
                    return;
                }
                await applySocketAccess(socket, latestAccess);
            } else {
                await socket.join(`patient:${principal.id}`);
            }
            // Only non-private announcements / room-list invalidations use this room.
            await socket.join('authenticated');
        } catch (_) {
            socket.emit('auth:error', { code: 'ACCESS_DENIED' });
            socket.disconnect(true);
            return;
        }
        let expiryTimer;
        const expire = () => {
            const remaining = principal.exp * 1000 - Date.now();
            if (remaining <= 0) {
                disconnectExpiredSocket(socket);
                return;
            }
            expiryTimer = setTimeout(expire, Math.min(remaining, 2147483647));
            expiryTimer.unref?.();
        };
        expire();
        socket.once('disconnect', () => clearTimeout(expiryTimer));
    });
}

function socketHasPermission(socket, permission) {
    return Boolean(permission && socket.data?.access?.permissions?.has(permission));
}

async function applySocketAccess(socket, access) {
    const permissions = new Set(access.permissions);
    const previous = socket.data.accessRoomSync || Promise.resolve();
    const next = previous
        .catch(() => undefined)
        .then(async () => {
            const appliedVersion = Number(socket.data.accessRoomAppliedVersion || 0);
            const nextVersion = Number(access.accessVersion || 0);
            if (nextVersion < appliedVersion) return false;
            socket.data.access = access;
            await syncPermissionRooms(socket, permissions);
            if (!permissions.has('support_chat.view')) {
                await Promise.all([...socket.rooms]
                    .filter(room => room.startsWith('support:'))
                    .map(room => socket.leave(room)));
            }
            socket.data.accessRoomAppliedVersion = nextVersion;
            return true;
        });
    socket.data.accessRoomSync = next;
    return next;
}

async function socketsForUser(io, userId) {
    const key = String(userId);
    const sockets = new Map();
    for (const socket of io.sockets?.sockets?.values?.() || []) {
        if (String(socket.data?.principal?.id || '') === key) sockets.set(socket.id, socket);
    }
    const room = userRoom(userId);
    if (typeof io.in === 'function') {
        const operator = io.in(room);
        if (typeof operator?.fetchSockets === 'function') {
            for (const socket of await operator.fetchSockets()) sockets.set(socket.id, socket);
        }
    }
    return [...sockets.values()];
}

async function refreshUserAccessRooms(io, userId, {
    accessControlService = defaultAccessControlService,
    disconnectInactive = true
} = {}) {
    const access = await accessControlService.getEffectiveAccess(userId);
    const sockets = await socketsForUser(io, userId);

    for (const socket of sockets) {
        const appliedVersion = Number(socket.data.accessRoomAppliedVersion || 0);
        if (Number(access.accessVersion || 0) < appliedVersion) continue;
        if (!access.isActive && disconnectInactive) {
            socket.data.access = access;
            socket.data.accessRoomAppliedVersion = Number(access.accessVersion || 0);
            socket.emit('access:changed', {
                access_version: access.accessVersion,
                active: false
            });
            socket.disconnect(true);
            continue;
        }
        const applied = await applySocketAccess(socket, access);
        if (applied) {
            socket.emit('access:changed', {
                access_version: access.accessVersion,
                active: true
            });
        }
    }
    return { access, socketsUpdated: sockets.length };
}

async function refreshRoleAccessRooms(io, roleId, options = {}) {
    const userIds = new Set();
    for (const socket of io.sockets?.sockets?.values?.() || []) {
        if (Number(socket.data?.access?.roleId) === Number(roleId) && socket.data?.principal?.id) {
            userIds.add(String(socket.data.principal.id));
        }
    }
    const results = [];
    for (const userId of userIds) {
        results.push(await refreshUserAccessRooms(io, userId, options));
    }
    return { usersUpdated: userIds.size, socketsUpdated: results.reduce((sum, item) => sum + item.socketsUpdated, 0) };
}

// Domain clients may report state changes, but actor fields always come from JWT.
function onStaffEvent(socket, event, handler, { permission = null } = {}) {
    socket.on(event, async payload => {
        const principal = requireSocketPrincipal(socket, { staffOnly: true });
        if (!principal) return;
        if (permission && !socketHasPermission(socket, permission)) {
            socket.emit('auth:error', { code: 'ACCESS_DENIED' });
            return;
        }
        if (event !== 'users:get-list' && (!payload || typeof payload !== 'object' || Array.isArray(payload))) {
            socket.emit('auth:error', { code: 'FORBIDDEN' });
            return;
        }
        if (event === 'activity:update' && (typeof payload.activity !== 'string' || payload.activity.length > 500)) {
            socket.emit('auth:error', { code: 'FORBIDDEN' });
            return;
        }
        const data = {
            ...payload, userId: principal.id, userName: principal.name,
            role: principal.role, timestamp: new Date().toISOString()
        };
        if (event === 'user:register') {
            data.name = principal.name || principal.id;
            data.photo = `/api/users/${encodeURIComponent(principal.id)}/photo`;
        }
        try {
            await handler(data);
        } catch (_) {
            // Never include rejected payloads or tokens in diagnostics.
            socket.emit('auth:error', { code: 'FORBIDDEN' });
        }
    });
}

module.exports = {
    installSocketAccess,
    onStaffEvent,
    refreshRoleAccessRooms,
    refreshUserAccessRooms,
    requireSocketPrincipal,
    resolveSocketPrincipal,
    socketHasPermission
};
