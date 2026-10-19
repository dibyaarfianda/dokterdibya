const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../services/OperationalSchemaValidator', () => ({ validateOperationalSchemaScope: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    JWT_SECRET: 'community-staff-profile-test',
    verifyToken: (req, res, next) => { req.user = { id: 'S01', user_type: 'staff' }; next(); },
    verifyStaffToken: (req, res, next) => { req.user = { id: 'S01', user_type: 'staff' }; next(); }
}));
const db = require('../../db');
const router = require('../../routes/community-chat');
const attention = require('../../services/CommunityChatAttention');
const { hydrateStaffMessages } = require('../../services/CommunityChatStaffProfile');
const { resolveSocketPrincipal } = require('../../security/socketAccess');
const { ROLE_IDS, ROLE_NAMES } = require('../../constants/roles');
const app = express();
app.use(express.json(), router);
const room = { id: 1, slug: 'lobby', name: 'Lobby', is_direct: 0 };
const staff = { new_id: 'S01', name: 'Dr. Dibya', has_photo: 1, avatar_version: 1234 };
const avatar = '/api/auth/staff-avatar/S01?v=1234';
const staleMessage = { id: 8, room_id: 1, sender_id: 'S01', sender_type: 'staff', sender_name: 'Nama Lama', sender_nickname: 'Nickname Lama', sender_avatar: '/old.png', message: 'Halo' };
const patientMessage = { id: 9, room_id: 1, sender_id: 'P01', sender_type: 'patient', sender_name: 'Nama Privat', sender_nickname: 'Bunda Uji', sender_avatar: '/patient.png', message: 'Hai' };

beforeEach(() => {
    db.query.mockReset();
    db.query.mockImplementation(async sql => {
        if (sql.includes('FROM community_chat_rooms r')) return [[room]];
        if (/FROM users(?:\s|$)/.test(sql)) return [[{ ...staff }]];
        if (sql.includes('FROM community_chat_profiles')) return [[{ nickname: 'Nickname Lama', avatar_url: '/old.png', profile_visible: 1 }]];
        if (sql.includes('FROM community_chat_room_members member')) return [[{ user_id: 'S01', user_type: 'staff', display_name: 'Nickname Lama', avatar_url: '/old.png' }]];
        if (sql.includes('SELECT id FROM community_chat_messages')) return [[{ id: 8 }]];
        if (sql.includes('SELECT MAX(id)')) return [[{ id: 9 }]];
        if (sql.includes('FROM community_chat_messages')) return [[{ ...staleMessage }, { ...patientMessage }]];
        if (sql.includes('INSERT INTO community_chat_messages')) return [{ insertId: 8 }];
        return [[]];
    });
});

test('own chat profile uses the name and versioned photo from Staff Profile', async () => {
    const result = await request(app).get('/me/profile');
    expect(result.status).toBe(200);
    expect(result.body.profile).toMatchObject({ defaultName: staff.name, nickname: null, avatarUrl: avatar });
});

test('clicked staff profile uses Staff Profile and respects existing profile visibility', async () => {
    const result = await request(app).get('/profiles/staff/S01');
    expect(result.status).toBe(200);
    expect(result.body.profile).toMatchObject({ display_name: staff.name, nickname: null, avatar_url: avatar });
    const query = db.query.getMockImplementation();
    db.query.mockImplementation(sql => sql.includes('FROM community_chat_profiles') ? [[{ profile_visible: 0 }]] : query(sql));
    expect((await request(app).get('/profiles/staff/S01')).status).toBe(404);
});

test.each(['/rooms/lobby/messages', '/rooms/lobby/messages/8/context'])('stored history reads current staff identity at %s without changing patient identity', async endpoint => {
    const result = await request(app).get(endpoint);
    expect(result.status).toBe(200);
    expect(result.body.messages.find(m => m.sender_type === 'staff')).toMatchObject({ sender_name: staff.name, sender_nickname: staff.name, sender_avatar: avatar });
    expect(result.body.messages.find(m => m.sender_type === 'patient')).toMatchObject(patientMessage);
});

test('room members use current staff name and photo rather than the saved community snapshot', async () => {
    const result = await request(app).get('/rooms/lobby/members');
    expect(result.status).toBe(200);
    expect(result.body.members[0]).toMatchObject({ display_name: staff.name, avatar_url: avatar });
});

test('new staff message persists Staff Profile identity and returns it to socket clients', async () => {
    const result = await request(app).post('/rooms/lobby/messages').send({ message: 'Halo' });
    expect(result.status).toBe(200);
    const insert = db.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO community_chat_messages'));
    expect(insert[1].slice(3, 6)).toEqual([staff.name, staff.name, avatar]);
    expect(result.body.message).toMatchObject({ sender_name: staff.name, sender_nickname: staff.name, sender_avatar: avatar });
});

test('staff without an uploaded photo gets the same fallback as Staff Profile', async () => {
    staff.has_photo = 0;
    try {
        const result = await request(app).get('/me/profile');
        expect(result.body.profile.avatarUrl).toBe('/staff/public/images/avatarlaki.png');
    } finally { staff.has_photo = 1; }
});

test('typing uses the staff account name even when a separate community nickname exists', async () => {
    const handlers = {}, emit = jest.fn();
    const principal = resolveSocketPrincipal(jwt.sign({ id: 'S01', user_type: 'staff' }, 'community-staff-profile-test', { expiresIn: 60 }));
    const socket = { connected: true, data: { principal }, on: (name, fn) => { handlers[name] = fn; }, join: jest.fn(), emit: jest.fn(), to: () => ({ emit }) };
    router.setupSocketHandlers({ on: (_, fn) => fn(socket), to: () => ({ emit }) });
    await handlers['community:join']({ room: 'lobby' });
    await handlers['community:typing']({ room: 'lobby', user_name: 'Impostor' });
    expect(emit.mock.calls.find(([event]) => event === 'community:typing')[1].user_name).toBe(staff.name);
});

test('quoting an old staff message uses the current staff profile name', async () => {
    const { reply } = await attention.validateMetadata(db, room, { reply_to_message_id: 8 }, 'Balasan');
    expect(reply.sender).toBe(staff.name);
});

test('historical quote headings use the current staff name while preserving the quote and patient sender', async () => {
    const reply = { id: 7, sender_id: 'S01', sender_type: 'staff', sender: 'Nickname Lama', text: 'Teks asli quote' };
    const rows = await hydrateStaffMessages(db, [{ ...patientMessage, reply_snapshot: JSON.stringify(reply) }, staleMessage]);
    expect(attention.messageDto(rows[0])).toMatchObject({ ...patientMessage, reply: { ...reply, sender: staff.name } });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual([['S01']]);
});

test('patient quote snapshots and malformed legacy snapshots are left unchanged without staff queries', async () => {
    const rows = [
        { ...patientMessage, reply_snapshot: JSON.stringify({ sender_id: 'P02', sender_type: 'patient', sender: 'Bunda Lain' }) },
        { ...patientMessage, reply_snapshot: 'invalid json' }
    ];
    expect(await hydrateStaffMessages(db, rows)).toEqual(rows);
    expect(db.query).not.toHaveBeenCalled();
});

test.each([
    [{ role_id: ROLE_IDS.DOKTER }, true],
    [{ role: ROLE_NAMES.DOKTER }, true],
    [{ is_superadmin: 1 }, true],
    [{ role_id: ROLE_IDS.ADMIN, role: ROLE_NAMES.ADMIN, is_superadmin: 0 }, false]
])('public doctor badge comes from the stored account role %j', async (fields, expected) => {
    Object.assign(staff, fields);
    try {
        const result = await request(app).get('/profiles/staff/S01');
        expect(result.body.profile.is_doctor).toBe(expected);
    } finally {
        delete staff.role_id; delete staff.role; delete staff.is_superadmin;
    }
});

test.each([42, 'x'.repeat(501)])('rejects an invalid public bio before writing any profile data', async bio => {
    const result = await request(app).put('/me/profile').send({ bio });
    expect(result.status).toBe(400);
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO community_chat_profiles'))).toBe(false);
});

test.each(['GET', 'PUT'])('own public profile is a self-service route for %s even without chat write permission', method => {
    const { createRuntimeAccessResolver } = require('../../security/accountModeAccess');
    expect(createRuntimeAccessResolver()(method, '/api/community-chat/me/profile')).toMatchObject({ exemption: 'staff_profile' });
});
