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
    const role = claims.role || ROLE_ID_TO_NAME[claims.role_id];
    if (!patient && !Object.values(ROLE_NAMES).includes(role)) throw authError('FORBIDDEN');
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
        if (principal.user_type === 'staff') {
            await socket.join('staff');
            await socket.join(userRoom(principal.id));
            await syncPermissionRooms(socket, socket.data.access.permissions);
        } else {
            await socket.join(`patient:${principal.id}`);
        }
        // Only non-private announcements / room-list invalidations use this room.
        socket.join('authenticated');
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

async function refreshUserAccessRooms(io, userId, {
    accessControlService = defaultAccessControlService,
    disconnectInactive = true
} = {}) {
    const access = await accessControlService.getEffectiveAccess(userId);
    const room = userRoom(userId);
    let sockets;
    if (typeof io.in === 'function' && typeof io.in(room).fetchSockets === 'function') {
        sockets = await io.in(room).fetchSockets();
    } else {
        sockets = [...(io.sockets?.sockets?.values?.() || [])]
            .filter(socket => socket.rooms?.has(room));
    }

    for (const socket of sockets) {
        socket.emit('access:changed', {
            access_version: access.accessVersion,
            active: access.isActive
        });
        if (!access.isActive && disconnectInactive) {
            socket.disconnect(true);
            continue;
        }
        socket.data.access = access;
        await syncPermissionRooms(socket, access.permissions);
    }
    return { access, socketsUpdated: sockets.length };
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
    refreshUserAccessRooms,
    requireSocketPrincipal,
    resolveSocketPrincipal,
    socketHasPermission
};
