const {
    permissionRoom,
    permissionForEvent,
    syncPermissionRooms
} = require('../../security/realtimePermissions');
const fs = require('fs');
const path = require('path');
const {
    refreshRoleAccessRooms,
    refreshUserAccessRooms,
    socketHasPermission
} = require('../../security/socketAccess');

test('maps clinical and operational events to stable permission rooms', () => {
    expect(permissionForEvent('patient:selected')).toBe('patients.view');
    expect(permissionForEvent('anamnesa:updated')).toBe('anamnesa.view');
    expect(permissionForEvent('billing:updated')).toBe('billing.view');
    expect(permissionForEvent('booking:new')).toBe('online_queue.view');
    expect(permissionForEvent('chat:message')).toBeNull();
    expect(permissionRoom('patients.view')).toBe('permission:patients.view');
});

test('authorization is available from the handshake snapshot before async room joins settle', () => {
    const socket = {
        data: { access: { permissions: new Set(['patients.view']) } },
        rooms: new Set(['socket-a'])
    };
    expect(socketHasPermission(socket, 'patients.view')).toBe(true);
    expect(socketHasPermission(socket, 'billing.view')).toBe(false);
});

test('synchronizes only permission rooms and preserves staff/chat membership', async () => {
    const socket = {
        rooms: new Set(['socket-a', 'staff', 'authenticated', 'permission:billing.view']),
        join: jest.fn(room => socket.rooms.add(room)),
        leave: jest.fn(room => socket.rooms.delete(room))
    };

    await syncPermissionRooms(socket, new Set(['patients.view', 'billing.view']));

    expect([...socket.rooms].sort()).toEqual([
        'authenticated',
        'permission:billing.view',
        'permission:patients.view',
        'socket-a',
        'staff'
    ]);
    expect(socket.leave).not.toHaveBeenCalledWith('staff');
});

test('zero grants remove clinical rooms without removing staff chat room', async () => {
    const socket = {
        rooms: new Set(['socket-a', 'staff', 'authenticated', 'permission:patients.view']),
        join: jest.fn(room => socket.rooms.add(room)),
        leave: jest.fn(room => socket.rooms.delete(room))
    };

    await syncPermissionRooms(socket, new Set());

    expect([...socket.rooms].sort()).toEqual(['authenticated', 'socket-a', 'staff']);
});

test('access refresh updates every active session and disconnects an inactive account', async () => {
    const makeSocket = id => ({
        id,
        data: { access: { accessVersion: 1, permissions: new Set(['billing.view']) } },
        rooms: new Set([id, 'staff', 'authenticated', 'user:staff-a', 'permission:billing.view']),
        join: jest.fn(),
        leave: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn()
    });
    const sockets = ['socket-a', 'socket-b'].map(id => {
        const socket = makeSocket(id);
        socket.join = jest.fn(room => socket.rooms.add(room));
        socket.leave = jest.fn(room => socket.rooms.delete(room));
        return socket;
    });
    const io = { in: () => ({ fetchSockets: async () => sockets }) };
    const service = {
        getEffectiveAccess: jest.fn(async () => ({
            isActive: true,
            accessVersion: 2,
            permissions: new Set(['patients.view'])
        }))
    };

    const refreshed = await refreshUserAccessRooms(io, 'staff-a', { accessControlService: service });
    expect(refreshed.socketsUpdated).toBe(2);
    for (const socket of sockets) {
        expect(socket.rooms.has('staff')).toBe(true);
        expect(socket.rooms.has('permission:billing.view')).toBe(false);
        expect(socket.rooms.has('permission:patients.view')).toBe(true);
        expect(socket.emit).toHaveBeenCalledWith('access:changed', { access_version: 2, active: true });
    }

    service.getEffectiveAccess.mockResolvedValueOnce({
        isActive: false,
        accessVersion: 3,
        permissions: new Set()
    });
    await refreshUserAccessRooms(io, 'staff-a', { accessControlService: service });
    for (const socket of sockets) {
        expect(socket.emit).toHaveBeenCalledWith('access:changed', { access_version: 3, active: false });
        expect(socket.disconnect).toHaveBeenCalledWith(true);
    }
});

test('refresh catches a connecting socket before its private room join completes', async () => {
    const socket = {
        id: 'socket-connecting',
        data: {
            principal: { id: 'staff-a' },
            access: { roleId: 2, permissions: new Set(['billing.view']) }
        },
        rooms: new Set(['socket-connecting']),
        join: jest.fn(room => socket.rooms.add(room)),
        leave: jest.fn(room => socket.rooms.delete(room)),
        emit: jest.fn(),
        disconnect: jest.fn()
    };
    const io = {
        sockets: { sockets: new Map([[socket.id, socket]]) },
        in: () => ({ fetchSockets: async () => [] })
    };
    const service = {
        getEffectiveAccess: jest.fn(async () => ({
            roleId: 2,
            isActive: true,
            accessVersion: 2,
            permissions: new Set(['patients.view'])
        }))
    };

    const result = await refreshUserAccessRooms(io, 'staff-a', { accessControlService: service });

    expect(result.socketsUpdated).toBe(1);
    expect(socket.rooms.has('permission:billing.view')).toBe(false);
    expect(socket.rooms.has('permission:patients.view')).toBe(true);
});

test('overlapping access refreshes serialize room writes so the newest grant set wins', async () => {
    let releaseBillingJoin;
    const billingJoin = new Promise(resolve => { releaseBillingJoin = resolve; });
    const socket = {
        id: 'socket-race',
        data: { principal: { id: 'staff-a' }, access: { roleId: 2, permissions: new Set() } },
        rooms: new Set(['socket-race', 'staff', 'user:staff-a']),
        join: jest.fn(async room => {
            if (room === 'permission:billing.view') await billingJoin;
            socket.rooms.add(room);
        }),
        leave: jest.fn(async room => socket.rooms.delete(room)),
        emit: jest.fn(),
        disconnect: jest.fn()
    };
    const io = {
        sockets: { sockets: new Map([[socket.id, socket]]) },
        in: () => ({ fetchSockets: async () => [socket] })
    };
    const service = {
        getEffectiveAccess: jest.fn()
            .mockResolvedValueOnce({ roleId: 2, isActive: true, accessVersion: 2, permissions: new Set(['billing.view']) })
            .mockResolvedValueOnce({ roleId: 2, isActive: true, accessVersion: 3, permissions: new Set(['patients.view']) })
    };

    const first = refreshUserAccessRooms(io, 'staff-a', { accessControlService: service });
    await Promise.resolve();
    await Promise.resolve();
    const second = refreshUserAccessRooms(io, 'staff-a', { accessControlService: service });
    releaseBillingJoin();
    await Promise.all([first, second]);

    expect(socket.data.access.accessVersion).toBe(3);
    expect(socket.rooms.has('permission:billing.view')).toBe(false);
    expect(socket.rooms.has('permission:patients.view')).toBe(true);
    expect(socket.rooms.has('staff')).toBe(true);
});

test('legacy role permission writes refresh all connected users for that role', async () => {
    const sockets = ['staff-a', 'staff-b', 'staff-other'].map((id, index) => ({
        id: `socket-${index}`,
        data: {
            principal: { id },
            access: { roleId: id === 'staff-other' ? 3 : 2, permissions: new Set(['billing.view']) }
        },
        rooms: new Set([`socket-${index}`, `user:${id}`, 'staff', 'permission:billing.view']),
        join: jest.fn(), leave: jest.fn(), emit: jest.fn(), disconnect: jest.fn()
    }));
    const io = {
        sockets: { sockets: new Map(sockets.map(socket => [socket.id, socket])) },
        in: room => ({ fetchSockets: async () => sockets.filter(socket => socket.rooms.has(room)) })
    };
    const service = {
        getEffectiveAccess: jest.fn(async userId => ({
            userId, roleId: 2, isActive: true, accessVersion: 2, permissions: new Set()
        }))
    };

    const result = await refreshRoleAccessRooms(io, 2, { accessControlService: service });
    expect(result).toEqual({ usersUpdated: 2, socketsUpdated: 2 });
    expect(service.getEffectiveAccess).toHaveBeenCalledTimes(2);

    const roleRoute = fs.readFileSync(path.resolve(__dirname, '../../routes/roles.js'), 'utf8');
    expect(roleRoute).toContain("await refreshRoleAccessRooms(req.app.get('io'), Number(id));");
    expect(roleRoute.match(/await refreshUserAccessRooms\(req\.app\.get\('io'\), userId\);/g)).toHaveLength(3);
});
