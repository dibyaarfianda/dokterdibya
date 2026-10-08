const {
    permissionRoom,
    permissionForEvent,
    syncPermissionRooms
} = require('../../security/realtimePermissions');
const { refreshUserAccessRooms } = require('../../security/socketAccess');

test('maps clinical and operational events to stable permission rooms', () => {
    expect(permissionForEvent('patient:selected')).toBe('patients.view');
    expect(permissionForEvent('anamnesa:updated')).toBe('anamnesa.view');
    expect(permissionForEvent('billing:updated')).toBe('billing.view');
    expect(permissionForEvent('booking:new')).toBe('online_queue.view');
    expect(permissionForEvent('chat:message')).toBeNull();
    expect(permissionRoom('patients.view')).toBe('permission:patients.view');
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
