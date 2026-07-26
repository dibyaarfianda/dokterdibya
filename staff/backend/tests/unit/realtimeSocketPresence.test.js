const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

function createRealtimeClientHarness() {
    const handlers = new Map();
    const emitted = [];
    const onlineCount = { textContent: '' };
    const onlineUsersList = { innerHTML: '' };
    const socket = {
        connected: false,
        disconnected: true,
        connecting: false,
        id: 'socket-current-staff',
        on: jest.fn((eventName, handler) => handlers.set(eventName, handler)),
        emit: jest.fn((eventName, payload) => emitted.push({ eventName, payload })),
        close: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn()
    };
    const context = {
        console,
        Map,
        Date,
        setTimeout,
        clearTimeout,
        CustomEvent: function CustomEvent(type, options) {
            this.type = type;
            this.detail = options?.detail;
        },
        window: {
            location: {
                hostname: 'dokterdibya.com',
                origin: 'https://dokterdibya.com'
            },
            addEventListener: jest.fn(),
            dispatchEvent: jest.fn()
        },
        document: {
            visibilityState: 'visible',
            addEventListener: jest.fn(),
            getElementById: jest.fn((id) => {
                if (id === 'online-count') return onlineCount;
                if (id === 'online-users-list') return onlineUsersList;
                return null;
            })
        },
        io: jest.fn(() => socket)
    };
    const source = readRepoFile('staff', 'public', 'scripts', 'realtime-sync.js')
        .replace(/^export\s+/gm, '');

    vm.createContext(context);
    vm.runInContext(
        `${source}\n;globalThis.__realtimePresenceTestApi = { initRealtimeSync };`,
        context
    );

    return {
        initRealtimeSync: context.__realtimePresenceTestApi.initRealtimeSync,
        handlers,
        emitted,
        onlineCount,
        onlineUsersList,
        socket
    };
}

function connectCurrentStaff(harness, user = { id: 7, name: 'Staf Saat Ini', role: 'admin' }) {
    harness.initRealtimeSync(user);
    harness.socket.connected = true;
    harness.socket.disconnected = false;
    harness.handlers.get('connect')();
}

describe('staff realtime socket presence', () => {
    test('debounces transient polling disconnects before marking staff offline', () => {
        const server = readRepoFile('staff', 'backend', 'server.js');

        expect(server).toContain('const USER_DISCONNECT_GRACE_MS');
        expect(server).toContain('const userSocketIds = new Map();');
        expect(server).toContain('const userDisconnectTimers = new Map();');
        expect(server).toContain('function getOnlineUsersList()');
        expect(server).toContain('clearTimeout(existingDisconnectTimer);');
        expect(server).toContain('socketIds.delete(socket.id);');
        expect(server).toContain('if (socketIds.size > 0) {');
        expect(server).toContain('setTimeout(() => {');
        expect(server).toContain('io.emit(\'user:disconnected\'');
    });

    test('requests the authoritative online list immediately after staff registration', () => {
        const harness = createRealtimeClientHarness();

        connectCurrentStaff(harness);

        expect({
            registeredUser: harness.emitted.find(({ eventName }) => eventName === 'user:register')?.payload,
            requestedOnlineList: harness.emitted.some(({ eventName }) => eventName === 'users:get-list')
        }).toEqual({
            registeredUser: {
                userId: 7,
                name: 'Staf Saat Ini',
                role: 'admin',
                photo: null
            },
            requestedOnlineList: true
        });
    });

    test('keeps the current staff in the online list and labels the row as self', () => {
        const harness = createRealtimeClientHarness();

        connectCurrentStaff(harness);
        harness.handlers.get('users:list')([
            {
                userId: 7,
                name: 'Staf Saat Ini',
                role: 'admin',
                timestamp: '2026-07-26T04:00:00.000Z'
            },
            {
                userId: 8,
                name: 'Staf Lain',
                role: 'bidan',
                timestamp: '2026-07-26T04:01:00.000Z'
            }
        ]);

        const renderedHtml = harness.onlineUsersList.innerHTML;
        expect({
            count: harness.onlineCount.textContent,
            currentStaffRows: (renderedHtml.match(/Staf Saat Ini/g) || []).length,
            currentStaffIsLabelled: renderedHtml.includes('(Saya)'),
            otherStaffIsRendered: renderedHtml.includes('Staf Lain')
        }).toEqual({
            count: 2,
            currentStaffRows: 1,
            currentStaffIsLabelled: true,
            otherStaffIsRendered: true
        });
    });

    test('normalizes presence IDs across list and incremental socket events', () => {
        const harness = createRealtimeClientHarness();

        connectCurrentStaff(harness);
        harness.handlers.get('users:list')([
            {
                userId: '7',
                name: 'Staf Saat Ini',
                role: 'admin',
                timestamp: '2026-07-26T04:00:00.000Z'
            },
            {
                userId: 8,
                name: 'Staf Lain',
                role: 'bidan',
                timestamp: '2026-07-26T04:01:00.000Z'
            }
        ]);
        harness.handlers.get('user:connected')({
            userId: '8',
            name: 'Staf Lain',
            role: 'bidan'
        });

        const renderedHtml = harness.onlineUsersList.innerHTML;
        expect({
            count: harness.onlineCount.textContent,
            currentStaffRows: (renderedHtml.match(/Staf Saat Ini/g) || []).length,
            currentStaffIsLabelled: renderedHtml.includes('(Saya)'),
            otherStaffRows: (renderedHtml.match(/Staf Lain/g) || []).length
        }).toEqual({
            count: 2,
            currentStaffRows: 1,
            currentStaffIsLabelled: true,
            otherStaffRows: 1
        });
    });

    test('escapes staff names and roles before rendering presence markup', () => {
        const harness = createRealtimeClientHarness();

        connectCurrentStaff(harness);
        harness.handlers.get('users:list')([
            {
                userId: 7,
                name: '<img src=x onerror=alert(1)>',
                role: '<script>alert(1)</script>',
                timestamp: '2026-07-26T04:00:00.000Z'
            }
        ]);

        expect(harness.onlineUsersList.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(harness.onlineUsersList.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(harness.onlineUsersList.innerHTML).not.toContain('<img');
        expect(harness.onlineUsersList.innerHTML).not.toContain('<script>');
    });
});
