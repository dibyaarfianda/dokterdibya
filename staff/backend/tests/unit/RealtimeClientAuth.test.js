const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function context(extra = {}) {
    const sockets = [];
    const timers = [];
    const io = (url, options) => {
        const handlers = {};
        const socket = { options, handlers, on: (e, fn) => { handlers[e] = fn; }, emit() {}, off() {}, close() {}, disconnect() {} };
        sockets.push(socket);
        return socket;
    };
    const window = { location: { hostname: 'test.invalid', origin: 'https://test.invalid' },
        PatientSession: { getToken: () => 'patient-jwt' }, getAuthToken: () => 'staff-jwt',
        addEventListener() {}, dispatchEvent() {}, io };
    return vm.createContext({ window, location: window.location, io, sockets, timers,
        console: { log() {}, warn() {}, error() {} },
        document: { addEventListener() {}, getElementById() { return null; }, createElement() { return {}; }, head: { appendChild() {} } },
        CustomEvent: function() {}, setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
        setTimeout() {}, clearTimeout() {}, clearInterval() {}, ...extra });
}

async function tokenOf(socket) {
    const auth = socket.options?.auth;
    return typeof auth === 'function' ? new Promise(resolve => auth(value => resolve(value.token))) : auth?.token;
}

test('staff connection sends helper token and refreshes it on reconnect', async () => {
    const ctx = context({ getIdToken: async () => 'staff-jwt' });
    vm.runInContext(read('staff/public/scripts/realtime-sync.js').replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, ''), ctx);
    vm.runInContext("initRealtimeSync({ id: 'staff-test', name: 'Test', role: 'staff' })", ctx);
    expect(await tokenOf(ctx.sockets[0])).toBe('staff-jwt');
    expect(ctx.sockets[0].options.transports).toEqual(['polling']);
    expect(ctx.sockets[0].options.upgrade).toBe(false);
    ctx.getIdToken = async () => 'rotated-staff-jwt';
    expect(await tokenOf(ctx.sockets[0])).toBe('rotated-staff-jwt');
});

test.each(['public/js/announcements.js', 'public/js/announcements-dashboard.js'])('%s authenticates and keeps HTTP refresh when strict auth rejects stale credentials', async file => {
    const ctx = context();
    vm.runInContext(read(file), ctx);
    vm.runInContext('initializeSocket()', ctx);
    expect(await tokenOf(ctx.sockets[0])).toBe('patient-jwt');
    expect(ctx.timers.some(t => t.ms === 30000)).toBe(true);
    ctx.sockets[0].handlers.connect_error?.(new Error('unauthorized'));
    // A fresh initializer installs one timer; its callback still reaches the real HTTP loader.
    const httpCalls = [];
    ctx.fetch = async url => { httpCalls.push(url); return { ok: true, json: async () => ({ data: [] }) }; };
    vm.runInContext('displayAnnouncements = () => {}; if (typeof refreshAnnouncementBadgeState === "function") refreshAnnouncementBadgeState = () => {};', ctx);
    await ctx.timers.find(t => t.ms === 30000).fn();
    expect(httpCalls[0]).toContain('/api/announcements/active');
    expect(ctx.timers.some(t => t.ms === 30000)).toBe(true);
});

test.each(['public/js/announcements.js', 'public/js/announcements-dashboard.js'])('%s uses HTTP only without credentials', file => {
    const ctx = context();
    ctx.window.PatientSession.getToken = () => null;
    vm.runInContext(read(file), ctx);
    vm.runInContext('initializeSocket()', ctx);
    expect(ctx.sockets).toHaveLength(0);
    expect(ctx.timers.some(t => t.ms === 30000)).toBe(true);
});

// Execute the checked-in connection expression at its IO boundary, without DOM/UI dependencies.
test.each([
    ['staff/public/scripts/kelola-announcement.js', 'staff-jwt'],
    ['staff/public/scripts/kelola-voting.js', 'staff-jwt'],
    ['public/js/patient-voting.js', 'patient-jwt'],
    ['public/album-usg.html', 'patient-jwt'],
    ['public/community-chat.html', 'patient-jwt'],
    ['public/scripts/community-chat-badge.js', 'patient-jwt']
])('%s supplies credentials and polling-only options at every IO call', async (file, expected) => {
    const ctx = context({ socketUrl: 'https://test.invalid', getToken: () => expected, token: 'patient-jwt', getIdToken: async () => 'staff-jwt' });
    const calls = read(file).match(/(?:window\.)?io\([^;]+?\);/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) vm.runInContext(call, ctx);
    for (const socket of ctx.sockets) {
        expect(await tokenOf(socket)).toBe(expected);
        expect(socket.options.transports).toEqual(['polling']);
        expect(socket.options.upgrade).toBe(false);
    }
});

test('patient support creates authenticated socket while retaining HTTP polling', async () => {
    const ctx = context();
    vm.runInContext(read('public/scripts/support-chat.js').replace(/\}\)\(\);\s*$/, 'window.testGetSocket = getSocket; window.testStartPolling = startMessagePolling; })();'), ctx);
    ctx.window.testGetSocket();
    expect(ctx.sockets).toHaveLength(1);
    expect(await tokenOf(ctx.sockets[0])).toBe('patient-jwt');
    ctx.window.testStartPolling();
    expect(ctx.timers.some(t => t.ms === 3000)).toBe(true);
});

test('cache cutover preserves session-only login credentials', () => {
    function storage(initial) {
        const values = { ...initial };
        return { getItem: key => values[key] || null, setItem: (key, value) => { values[key] = value; },
            clear: () => { for (const key of Object.keys(values)) delete values[key]; } };
    }
    const html = read('staff/public/index-adminlte.html');
    const script = html.slice(html.indexOf('<!-- Cache Clear Script -->')).match(/<script>([\s\S]*?)<\/script>/)[1];
    const ctx = context({ localStorage: storage({ cache_version: 'old' }), sessionStorage: storage({ syntheticKey: 'staff-jwt' }) });
    ctx.window.TOKEN_KEY = 'syntheticKey';
    ctx.window.STAFF_CACHE_VERSION = 'new';
    ctx.window.location.reload = () => {};
    vm.runInContext(script, ctx);
    expect(ctx.sessionStorage.getItem('syntheticKey')).toBe('staff-jwt');
});

test('loading fresh realtime module replaces a legacy unauthenticated singleton', () => {
    const ctx = context({ getIdToken: async () => 'staff-jwt' });
    const close = jest.fn();
    ctx.window.__realtimeSyncState = { socket: { connected: true, emit() {}, close }, currentUser: { id: 'staff-test' }, initialized: true };
    vm.runInContext(read('staff/public/scripts/realtime-sync.js').replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, ''), ctx);
    vm.runInContext("initRealtimeSync({ id: 'staff-test', name: 'Test' })", ctx);
    expect(ctx.sockets).toHaveLength(1);
    expect(close).toHaveBeenCalledTimes(1);
});

test('public queue retains its thirty-second HTTP refresh', () => {
    const html = read('public/antrian.html');
    const ctx = context({ loadQueue: jest.fn(), updateCountdown() {}, REFRESH_INTERVAL_MS: 30000,
        countdownTimer: null, refreshTimer: null, countdownSec: 0 });
    const scheduled = [];
    ctx.setTimeout = (fn, ms) => { scheduled.push({ fn, ms }); };
    const source = html.match(/function resetCountdown\(\) \{[\s\S]*?(?=\n\s*function updateCountdown)/)[0];
    vm.runInContext(source + '\nresetCountdown();', ctx);
    expect(scheduled[0].ms).toBe(30000);
    scheduled[0].fn();
    expect(ctx.loadQueue).toHaveBeenCalledWith(false);
});

test('realtime sends domain updates without logging patient identifiers or clinical names', () => {
    const log = jest.fn();
    const ctx = context({ getIdToken: async () => 'staff-jwt', console: { log, warn() {}, error() {} } });
    vm.runInContext(read('staff/public/scripts/realtime-sync.js').replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, ''), ctx);
    vm.runInContext("initRealtimeSync({ id: 'staff-test', name: 'Test' }); broadcastPatientSelection('sensitive-id', 'sensitive-name'); broadcastAnamnesaUpdate('sensitive-id', 'sensitive-name');", ctx);
    expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive');
});
