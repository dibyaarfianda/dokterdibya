const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function storage() {
    const data = new Map();
    return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function harness() {
    const listeners = new Map();
    const win = {
        location: { hostname: 'test.invalid', origin: 'https://test.invalid', pathname: '/patient-login.html' },
        localStorage: storage(), sessionStorage: storage(),
        addEventListener: (event, fn) => { const set = listeners.get(event) || new Set(); set.add(fn); listeners.set(event, set); },
        removeEventListener: (event, fn) => listeners.get(event)?.delete(fn),
        dispatchEvent: event => { for (const fn of listeners.get(event.type) || []) fn(event); },
        getAuthToken: () => 'staff-a'
    };
    const sockets = [];
    const timers = [];
    const io = (url, options) => {
        const handlers = {};
        const socket = { options, auth: options.auth, handlers, connected: false, active: false, handshakes: [], emitted: [],
            on: (event, fn) => { handlers[event] = fn; }, off() {},
            emit(event, value) { this.emitted.push([event, value]); },
            disconnect: jest.fn(function () { this.connected = false; this.active = false; }),
            connect: jest.fn(function () { this.active = true; this.auth?.(payload => { this.handshakes.push(payload); this.connected = true; handlers.connect?.(); }); }),
            close() { this.disconnect(); }, io: { reconnection() {} } };
        sockets.push(socket);
        if (options.autoConnect !== false) socket.connect();
        return socket;
    };
    win.io = io;
    const ctx = vm.createContext({ window: win, io, sockets, console: { log() {}, warn() {}, error() {} },
        localStorage: win.localStorage, sessionStorage: win.sessionStorage, CustomEvent: function(type) { this.type = type; },
        document: { addEventListener() {}, removeEventListener() {}, hidden: false, getElementById() { return null; } },
        setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval() {}, setTimeout() {}, clearTimeout() {},
        getIdToken: async () => win.getAuthToken() });
    win.setInterval = ctx.setInterval; win.clearInterval = ctx.clearInterval;
    const helper = path.join(root, 'public/scripts/socket-credentials.js');
    if (fs.existsSync(helper)) vm.runInContext(fs.readFileSync(helper, 'utf8'), ctx);
    vm.runInContext(read('public/scripts/patient-session.js'), ctx);
    return { ctx, win, sockets, timers, event: type => win.dispatchEvent({ type }) };
}
function staff(h) {
    vm.runInContext(read('staff/public/scripts/realtime-sync.js').replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, ''), h.ctx);
    vm.runInContext("initRealtimeSync({ id: 'staff', name: 'Synthetic' })", h.ctx);
}
test('same-user staff token rotation replaces the handshake and logout stops reconnect', async () => {
    const h = harness(); staff(h); await flush();
    const socket = h.sockets[0];
    h.win.getAuthToken = () => 'staff-b';
    h.event('storage'); await flush();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.handshakes.at(-1)).toEqual({ token: 'staff-b' });
    h.win.getAuthToken = () => null;
    h.event('auth:credentials-changed'); await flush();
    expect(socket.connected).toBe(false);
    const before = socket.handshakes.length;
    h.event('online'); h.event('pageshow'); await flush();
    expect(socket.handshakes).toHaveLength(before);
});
test('PatientSession.clearAuth immediately closes patient support and rotation reauthenticates', async () => {
    const h = harness(); h.win.PatientSession.setToken('patient-a');
    vm.runInContext(read('public/scripts/support-chat.js').replace(/\}\)\(\);\s*$/, 'window.testGetSocket = getSocket; })();'), h.ctx);
    h.win.testGetSocket(); await flush(); const socket = h.sockets[0];
    h.win.PatientSession.setToken('patient-b'); await flush();
    expect(socket.handshakes.at(-1)).toEqual({ token: 'patient-b' });
    h.win.PatientSession.clearAuth();
    expect(socket.connected).toBe(false);
    await flush(); expect(socket.connected).toBe(false);
});
test('cross-tab patient credential removal invalidates active socket', async () => {
    const h = harness(); h.win.PatientSession.setToken('patient-a', { persistent: true });
    vm.runInContext(read('public/scripts/support-chat.js').replace(/\}\)\(\);\s*$/, 'window.testGetSocket = getSocket; })();'), h.ctx);
    h.win.testGetSocket(); await flush(); const socket = h.sockets[0];
    h.win.localStorage.removeItem(h.win.PatientSession.TOKEN_KEY);
    h.event('storage'); await flush();
    expect(socket.connected).toBe(false);
});
test('a stale patient page without the lifecycle prerequisite retains support HTTP fallback', () => {
    const h = harness(); h.win.PatientSession.setToken('patient-a');
    delete h.win.bindSocketCredentials;
    vm.runInContext(read('public/scripts/support-chat.js').replace(/\}\)\(\);\s*$/, 'window.testGetSocket = getSocket; window.testPoll = startMessagePolling; })();'), h.ctx);
    expect(h.win.testGetSocket()).toBeNull();
    h.win.testPoll();
    expect(h.timers.length).toBeGreaterThan(0);
    expect(h.sockets).toHaveLength(0);
});
test('community handshakes and room rejoins use current patient credentials and stop on logout', async () => {
    const h = harness(); h.win.PatientSession.setToken('patient-a');
    const html = read('public/community-chat.html');
    const getToken = html.slice(html.indexOf('    function getToken()'), html.indexOf('    function requestStaffTokenFromParent()'));
    const init = html.slice(html.indexOf('    function initSocket()'), html.indexOf('    function initTypingHandler()'));
    vm.runInContext("let socket = null, token = 'bootstrap-stale'; const useStaffTokenBridge = false; const activeRoom = { slug: 'room' }; const typingUsers = new Map();", h.ctx);
    vm.runInContext(getToken + init + '\ninitSocket();', h.ctx); await flush();
    const socket = h.sockets[0];
    expect(socket.handshakes.at(-1)).toEqual({ token: 'patient-a' });
    h.win.PatientSession.setToken('patient-b'); await flush();
    expect(socket.handshakes.at(-1)).toEqual({ token: 'patient-b' });
    expect(socket.emitted.filter(([name]) => name === 'community:join').at(-1)[1].token).toBe('patient-b');
    h.win.PatientSession.clearAuth(); await flush();
    expect(socket.connected).toBe(false);
});

test('late async credential read cannot resurrect a logged-out socket', async () => {
    const h = harness(); let release;
    const socket = h.win.io('/', { autoConnect: false });
    let token = new Promise(resolve => { release = resolve; });
    h.win.bindSocketCredentials(socket, () => token);
    token = null; h.event('auth:credentials-changed');
    release('stale-token'); await flush();
    expect(socket.handshakes).toHaveLength(0);
    expect(socket.connected).toBe(false);
});

test('community staff bridge reads its live parent and closes immediately on parent logout', async () => {
    const h = harness(); let current = 'staff-a'; const parentEvents = {};
    h.win.parent = { getAuthToken: () => current, addEventListener: (name, fn) => { parentEvents[name] = fn; } };
    const html = read('public/community-chat.html');
    const getToken = html.slice(html.indexOf('    function getToken()'), html.indexOf('    function requestStaffTokenFromParent()'));
    const init = html.slice(html.indexOf('    function initSocket()'), html.indexOf('    function initTypingHandler()'));
    vm.runInContext("let socket = null, token = 'stale-bridge'; const useStaffTokenBridge = true; const activeRoom = { slug: 'room' }; const typingUsers = new Map();", h.ctx);
    vm.runInContext(getToken + init + '\ninitSocket();', h.ctx); await flush();
    const socket = h.sockets[0]; expect(socket.handshakes.at(-1)).toEqual({ token: 'staff-a' });
    current = 'staff-b'; parentEvents['auth:credentials-changed'](); await flush();
    expect(socket.handshakes.at(-1)).toEqual({ token: 'staff-b' });
    current = null; parentEvents['auth:credentials-changed']();
    expect(socket.connected).toBe(false);
    await flush(); expect(socket.connected).toBe(false);
});

test('real staff signOut invalidates the connected realtime socket', async () => {
    const h = harness();
    vm.runInContext(read('staff/public/scripts/vps-auth-v2.js').replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, ''), h.ctx);
    h.win.sessionStorage.setItem('vps_auth_token', 'staff-a');
    staff(h); await flush(); const socket = h.sockets[0];
    expect(socket.connected).toBe(true);
    await vm.runInContext('signOut()', h.ctx);
    expect(socket.connected).toBe(false);
});

test.each([
    'staff/public/scripts/kelola-announcement.js', 'staff/public/scripts/kelola-voting.js',
    'public/js/announcements.js', 'public/js/announcements-dashboard.js', 'public/js/patient-voting.js',
    'public/album-usg.html', 'public/scripts/community-chat-badge.js'
])('%s retires its principal after rotation and credential disappearance', async file => {
    const h = harness(); let current = 'first-token';
    h.ctx.getToken = () => current; h.ctx.getIdToken = async () => current;
    h.ctx.socketUrl = 'https://test.invalid';
    h.win.PatientSession.setToken(current);
    const creations = read(file).match(/(?:window\.)?socket\s*=\s*(?:window\.)?io\([\s\S]*?\);\s*window\.bindSocketCredentials\([^;]+;/g) || [];
    expect(creations.length).toBeGreaterThan(0);
    for (const creation of creations) vm.runInContext(creation, h.ctx);
    await flush();
    current = 'second-token'; h.win.PatientSession.setToken(current); await flush();
    for (const socket of h.sockets) expect(socket.handshakes.at(-1)).toEqual({ token: 'second-token' });
    current = null; h.win.PatientSession.clearAuth(); await flush();
    for (const socket of h.sockets) expect(socket.connected).toBe(false);
});
