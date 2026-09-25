const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { ROLE_NAMES, ROLE_ID_TO_NAME } = require('../constants/roles');
const { socketAuthMetrics } = require('./socketAuthMetrics');
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
    io.use((socket, next) => {
        try {
            const principal = resolveSocketPrincipal(socket.handshake.auth?.token, options);
            Object.defineProperty(socket.data, 'principal', { value: principal, enumerable: true });
            socketAuthMetrics.accepted(principal === null);
            next();
        } catch (error) {
            const code = error?.data?.code;
            const stable = ['AUTH_MISSING', 'AUTH_INVALID', 'AUTH_EXPIRED', 'FORBIDDEN'].includes(code)
                ? error : authError('AUTH_INVALID');
            socketAuthMetrics.rejected(stable.data.code);
            next(stable);
        }
    });
    // Registered before domain handlers; anonymous clients get no shared room.
    io.on('connection', socket => {
        const principal = socket.data.principal;
        if (!principal) return;
        socket.join(principal.user_type === 'staff' ? 'staff' : `patient:${principal.id}`);
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

// Domain clients may report state changes, but actor fields always come from JWT.
function onStaffEvent(socket, event, handler) {
    socket.on(event, async payload => {
        const principal = requireSocketPrincipal(socket, { staffOnly: true });
        if (!principal) return;
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

module.exports = { resolveSocketPrincipal, installSocketAccess, requireSocketPrincipal, onStaffEvent };
