const fs = require('fs');
const path = require('path');
const vm = require('vm');
const jwt = require('jsonwebtoken');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../services/OperationalSchemaValidator', () => ({ validateOperationalSchemaScope: jest.fn() }));
const db = require('../../db');
const secret = process.env.JWT_SECRET;
const staff = { id: 'staff-a', name: 'Staff A', role: 'admin', user_type: 'staff' };
const patient = { id: 'P2025091', name: 'Synthetic Patient', role: 'patient', user_type: 'patient' };
const token = (claims, expiresIn = 3600) => jwt.sign(claims, secret, { expiresIn });

// In-memory transport only. Execute the production registration/handlers without
// starting server.js schedulers, listening sockets, or touching clinical data.
function harness() {
    const sockets = [];
    const connections = [];
    const middleware = [];
    const adapter = { broadcast() {} };
    const deliver = (rooms, excluded) => ({
        to(room) { return deliver([...(rooms || []), ...[].concat(room)], excluded); },
        emit(event, payload) {
            adapter.broadcast({ data: [event, payload] }, { rooms, excluded });
            for (const socket of sockets) {
                if (socket.connected && socket !== excluded && (!rooms || rooms.some(room => socket.rooms.has(room)))) socket.emit(event, payload);
            }
        }
    });
    const io = {
        ...deliver(null),
        sockets: { sockets: new Map() },
        of: () => ({ adapter }),
        use: fn => middleware.push(fn),
        on: (event, fn) => { if (event === 'connection') connections.push(fn); }
    };
    const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
    const socketSetup = source.slice(source.indexOf('const io = new Server'), source.indexOf('// Make io globally'));
    const handlers = source.slice(source.indexOf('const USER_DISCONNECT_GRACE_MS'), source.indexOf('// Start server'));
    const metrics = source.slice(source.indexOf('// Track socket emission volume'), source.indexOf('const USER_DISCONNECT_GRACE_MS'));
    const context = {
        Server: function () { return io; }, server: {}, corsOriginDelegate() {},
        process, require: id => require(path.resolve(__dirname, '../..', id)),
        logger: { info() {}, warn() {}, error() {} },
        activityLogger: { log: jest.fn(), ACTIONS: {} },
        currentSelectedPatient: null, setTimeout, clearTimeout, Date, console
    };
    vm.runInNewContext(socketSetup + metrics + handlers + '\n globalThis.readEmissionCount = () => _socketEmitCount;', context);
    return {
        io,
        readEmissionCount: () => context.readEmissionCount(),
        async connect(authToken) {
            const handlers = new Map();
            const socket = {
                id: `socket-${sockets.length}`, connected: true, data: {}, rooms: new Set(), received: [],
                handshake: { auth: authToken === undefined ? {} : { token: authToken }, headers: {}, address: 'local-test' },
                conn: { transport: { name: 'polling' } },
                on(event, fn) { handlers.set(event, [...(handlers.get(event) || []), fn]); },
                once(event, fn) { this.on(event, fn); },
                emit(event, payload) { this.received.push({ event, payload }); },
                join(room) { this.rooms.add(room); }, leave(room) { this.rooms.delete(room); },
                disconnect() { this.connected = false; this.rooms.clear(); handlers.get('disconnect')?.forEach(fn => fn('server namespace disconnect')); },
                receive: (event, payload) => Promise.all((handlers.get(event) || []).map(fn => fn(payload)))
            };
            socket.broadcast = deliver(null, socket);
            socket.to = room => deliver([].concat(room), socket);
            for (const fn of middleware) {
                let error;
                await fn(socket, err => { error = err; });
                if (error) return { error, socket };
            }
            sockets.push(socket);
            io.sockets.sockets.set(socket.id, socket);
            connections.forEach(fn => fn(socket));
            return socket;
        }
    };
}

beforeEach(() => { jest.useFakeTimers(); db.query.mockReset(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('room scoping preserves broadcast cost accounting without inspecting payloads', () => {
    const h = harness();
    h.io.to('staff').emit('billing:updated', { synthetic: true });
    h.io.to('patient:example').emit('notification:new', { synthetic: true });
    expect(h.readEmissionCount()).toBe(2);
});

test.each([undefined, 'patient'])('%s cannot forge staff registration or obtain presence/clinical data', async kind => {
    const h = harness();
    const actor = await h.connect(kind ? token(patient) : undefined);
    const listener = await h.connect(token(staff));
    await actor.receive('user:register', { userId: 'forged', name: 'forged', role: 'dokter' });
    await actor.receive('users:get-list');
    for (const event of ['patient:select', 'anamnesa:update', 'physical:update', 'usg:update', 'lab:update', 'billing:update', 'visit:complete']) {
        await actor.receive(event, { userId: 'forged', patientId: 'other', patientName: 'Synthetic' });
    }
    jest.advanceTimersByTime(600);
    expect(actor.received.filter(x => !x.event.endsWith(':error'))).toEqual([]);
    expect(listener.received).toEqual([]);
    expect(actor.userId).toBeUndefined();
});

test('verified identity owns staff presence/activity and malformed activity is harmless', async () => {
    const h = harness();
    const actor = await h.connect(token(staff));
    const observer = await h.connect(token({ ...staff, id: 'staff-b' }));
    await actor.receive('user:register', { userId: 'forged', name: 'forged', role: 'dokter' });
    await expect(Promise.resolve().then(() => actor.receive('activity:update', null))).resolves.not.toThrow();
    await actor.receive('activity:update', { userId: 'forged', activity: 'Ready', timestamp: 'forged' });
    expect(actor.userId).toBe('staff-a');
    expect(observer.received.find(x => x.event === 'user:connected').payload).toMatchObject({ userId: 'staff-a', name: 'Staff A', role: 'admin' });
    expect(observer.received.find(x => x.event === 'user:activity').payload).toMatchObject({ userId: 'staff-a', activity: 'Ready' });
});

test('clients cannot publish announcements even as staff', async () => {
    const h = harness();
    const actor = await h.connect(token(staff));
    await actor.receive('announcement:new', { title: 'forged' });
    expect(actor.received.some(x => x.event === 'announcement:new')).toBe(false);
});

test('staff and per-patient server emissions exclude anonymous and unrelated patients', async () => {
    const h = harness();
    const a = await h.connect(token(patient));
    const b = await h.connect(token({ ...patient, id: 'patient-b' }));
    const anon = await h.connect();
    const s = await h.connect(token(staff));
    const realtime = require('../../realtime-sync');
    realtime.init(h.io);
    realtime.broadcast({ type: 'billing:updated', patientName: 'Synthetic' });
    realtime.broadcastPatientNotification({ id: 12, patient_id: patient.id, title: 'Synthetic' });
    expect(a.received.map(x => x.event)).toEqual(['notification:new']);
    expect(b.received).toEqual([]);
    expect(anon.received).toEqual([]);
    expect(s.received.map(x => x.event)).toEqual(['billing:updated']);
});

test.each(['usg:patient_updated', 'document:patient_updated', 'appointment:confirmation_popup_triggered'])('%s reaches only the owning patient and staff', async type => {
    const h = harness();
    const a = await h.connect(token(patient));
    const b = await h.connect(token({ ...patient, id: 'patient-b' }));
    const anon = await h.connect();
    const s = await h.connect(token(staff));
    const realtime = require('../../realtime-sync');
    realtime.init(h.io);
    realtime.broadcast({ type, patient_id: patient.id });
    expect([a.received.length, b.received.length, anon.received.length, s.received.length]).toEqual([1, 0, 0, 1]);
});

test('invalid and expired handshake credentials return stable errors', async () => {
    const h = harness();
    expect((await h.connect('invalid')).error?.data?.code).toBe('AUTH_INVALID');
    expect((await h.connect(token(staff, -1))).error?.data?.code).toBe('AUTH_EXPIRED');
});

test('strict resolver rejects missing identity and disallows demo or unrecognized roles', () => {
    const { resolveSocketPrincipal } = require('../../security/socketAccess');
    expect(() => resolveSocketPrincipal(undefined, { allowAnonymous: false })).toThrow('AUTH_MISSING');
    expect(() => resolveSocketPrincipal(token({ ...staff, demo_mode: true }))).toThrow('FORBIDDEN');
    expect(() => resolveSocketPrincipal(token({ id: 'x', role: 'unrecognized' }))).toThrow('FORBIDDEN');
    expect(() => resolveSocketPrincipal(token({ role: 'admin' }))).toThrow('AUTH_INVALID');
    const principal = resolveSocketPrincipal(token(staff));
    expect(Object.isFrozen(principal)).toBe(true);
});

test('presence preserves sibling tabs and reconnect grace while excluding non-staff', async () => {
    const h = harness();
    const observer = await h.connect(token({ ...staff, id: 'observer' }));
    const a = await h.connect(token(staff));
    const sibling = await h.connect(token(staff));
    await a.receive('user:register', {});
    await sibling.receive('user:register', {});
    jest.advanceTimersByTime(600);
    observer.received.length = 0;
    a.disconnect();
    jest.advanceTimersByTime(31000);
    expect(observer.received.some(x => x.event === 'user:disconnected')).toBe(false);
    sibling.disconnect();
    jest.advanceTimersByTime(1000);
    const reconnected = await h.connect(token(staff));
    await reconnected.receive('user:register', {});
    jest.advanceTimersByTime(31000);
    expect(observer.received.some(x => x.event === 'user:disconnected')).toBe(false);
    reconnected.disconnect();
    jest.advanceTimersByTime(31000);
    expect(observer.received.filter(x => x.event === 'user:disconnected')).toEqual([
        { event: 'user:disconnected', payload: { userId: 'staff-a', name: 'Staff A' } }
    ]);
});

test('community uses handshake identity and keeps canonical direct-room ownership', async () => {
    const h = harness();
    require('../../routes/community-chat').setupSocketHandlers(h.io);
    db.query.mockImplementation(async sql => {
        if (sql.includes('FROM community_chat_rooms r')) return [[{ id: 3, slug: 'room-a', is_direct: 1, direct_patient_id: patient.id }]];
        if (sql.includes('FROM patients')) return [[{ full_name: 'Synthetic', photo_url: null }]];
        return [[]];
    });
    const anon = await h.connect();
    await anon.receive('community:join', { room: 'room-a', token: token(patient) });
    expect(anon.rooms.has('community:room-a')).toBe(false);
    const b = await h.connect(token({ ...patient, id: 'patient-b' }));
    await b.receive('community:join', { room: 'room-a', token: token(staff) });
    expect(b.rooms.has('community:room-a')).toBe(false);
    const a = await h.connect(token(patient));
    await a.receive('community:join', { room: 'room-a', token: token({ ...patient, id: 'patient-b' }) });
    expect(a.rooms.has('community:room-a')).toBe(true);
    const s = await h.connect(token(staff));
    await s.receive('community:join', { room: 'room-a' });
    expect(s.rooms.has('community:room-a')).toBe(true);
    await a.receive('community:typing', { room: 'room-a', user_id: 'forged', user_name: 'forged' });
    expect(s.received.find(x => x.event === 'community:typing').payload).toMatchObject({ user_id: patient.id, user_type: 'patient' });
    expect(b.received.some(x => x.event === 'community:typing')).toBe(false);
});

test('support failures and expiry during lookup cannot grant room membership', async () => {
    const h = harness();
    require('../../routes/support-chat').setupSocketHandlers(h.io);
    const a = await h.connect(token(patient, 1));
    let finish;
    db.query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = a.receive('support:join', { sessionId: 'session-a' });
    jest.advanceTimersByTime(1100);
    finish([[{ id: 'session-a', patient_id: patient.id }]]);
    await pending;
    expect(a.rooms.has('support:session-a')).toBe(false);
    const s = await h.connect(token(staff));
    db.query.mockRejectedValueOnce(new Error('synthetic failure'));
    await s.receive('support:join', { sessionId: 'session-a' });
    expect(s.rooms.has('support:session-a')).toBe(false);
});

test.each(['support:leave', 'community:leave', 'community:typing', 'community:stop-typing'])('%s cannot throw on malformed room identifiers', async event => {
    const h = harness();
    require('../../routes/support-chat').setupSocketHandlers(h.io);
    require('../../routes/community-chat').setupSocketHandlers(h.io);
    const s = await h.connect(token(staff));
    await expect(Promise.resolve().then(() => s.receive(event, {
        sessionId: { toString: null }, room: { toString: null }
    }))).resolves.not.toThrow();
});

test('token expiry removes socket from rooms and disconnects it', async () => {
    const h = harness();
    const s = await h.connect(token(staff, 1));
    jest.advanceTimersByTime(1001);
    expect(s.connected).toBe(false);
    expect(s.rooms.size).toBe(0);
    expect(s.received).toContainEqual({ event: 'auth:error', payload: { code: 'AUTH_EXPIRED' } });
});

test('support join uses canonical ownership and rollout policy, never supplied identity', async () => {
    const h = harness();
    require('../../routes/support-chat').setupSocketHandlers(h.io);
    db.query.mockResolvedValue([[{ id: 'session-b', patient_id: 'patient-b' }]]);
    const p = await h.connect(token(patient));
    await p.receive('support:join', { sessionId: 'session-b', patientId: 'patient-b', role: 'admin' });
    expect(p.rooms.has('support:session-b')).toBe(false);
    expect(p.received).toContainEqual(expect.objectContaining({ event: 'support:error', payload: expect.objectContaining({ code: 'FORBIDDEN' }) }));
    db.query.mockResolvedValue([[{ id: 'session-a', patient_id: patient.id }]]);
    await p.receive('support:join', { sessionId: 'session-a' });
    expect(p.rooms.has('support:session-a')).toBe(true);
    const s = await h.connect(token(staff));
    await s.receive('support:join', { sessionId: 'session-a' });
    expect(s.rooms.has('support:session-a')).toBe(true);
    const b = await h.connect(token({ ...patient, id: 'patient-b' }));
    db.query.mockResolvedValue([[{ id: 'session-b', patient_id: 'patient-b' }]]);
    await b.receive('support:join', { sessionId: 'session-b' });
    expect(b.rooms.has('support:session-b')).toBe(false);
});

const emitterFiles = [
    'services/activityLogger.js', 'services/DocBoardService.js', 'routes/docboard.js',
    'routes/chat.js', 'routes/status.js', 'routes/medify-batch.js',
    'routes/staff-announcements.js', 'routes/support-chat.js', 'routes/polls.js',
    'routes/announcements.js', 'routes/community-chat.js'
];

// Exercise every production emitter's receiver expression. This isolates the
// recipient boundary from unrelated HTTP/DB work while retaining actual .to()
// calls, including computed patient/support/community room names.
test.each(emitterFiles)('%s server emitters exclude unauthorized recipients', async file => {
    const h = harness();
    const anon = await h.connect();
    const a = await h.connect(token(patient));
    const b = await h.connect(token({ ...patient, id: 'patient-b' }));
    const s = await h.connect(token(staff));
    a.join('support:session-a');
    a.join('community:room-a');
    s.join('community:room-a');
    const source = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
    const ast = require('@babel/parser').parse(source);
    const emitters = [];
    const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'emit') {
            const receiver = source.slice(node.callee.object.start, node.callee.object.end);
            if (/^(global\.io|router\.io|req\.app\.get\('io'\)|ioRef|io)(\.|$)/.test(receiver)) emitters.push({ receiver, event: node.arguments[0].value });
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value === 'object') walk(value);
        }
    };
    walk(ast);
    expect(emitters.length).toBeGreaterThan(0);
    for (const { receiver, event } of emitters) {
        for (const socket of [anon, a, b, s]) socket.received.length = 0;
        const broadcaster = vm.runInNewContext(receiver, {
            io: h.io, ioRef: h.io, global: { io: h.io }, router: { io: h.io },
            req: { app: { get: () => h.io } }, sessionId: 'session-a',
            room: { slug: 'room-a' }, patients: [{ id: patient.id }]
        });
        broadcaster.emit(event, { synthetic: true });
        expect({ file, event, deliveries: anon.received }).toEqual({ file, event, deliveries: [] });
        if (file === 'routes/announcements.js' || (file === 'routes/polls.js' && event !== 'notification:new') || event === 'community:rooms:changed') {
            expect([a.received.length, b.received.length, s.received.length]).toEqual([1, 1, 1]);
        } else if (receiver.includes('support:') || event === 'notification:new') {
            expect([a.received.length, b.received.length, s.received.length]).toEqual([1, 0, 0]);
        } else if (receiver.includes('community:')) {
            expect([a.received.length, b.received.length, s.received.length]).toEqual([1, 0, 1]);
        } else {
            expect([a.received.length, b.received.length, s.received.length]).toEqual([0, 0, 1]);
        }
    }
});
