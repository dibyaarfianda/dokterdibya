const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../services/OperationalSchemaValidator', () => ({ validateOperationalSchemaScope: jest.fn() }));
jest.mock('../../middleware/auth', () => ({
    JWT_SECRET: 'community-test',
    verifyToken: (req, res, next) => { req.user = { id: 'P1', user_type: 'patient' }; next(); },
    verifyStaffToken: (req, res, next) => { req.user = { id: 'S1', user_type: 'staff' }; next(); }
}));
const db = require('../../db');
const router = require('../../routes/community-chat');
const app = express();
app.use(express.json(), router);
const room = { id: 1, slug: 'lobby', name: 'Lobby', is_direct: 0 };
beforeEach(() => {
    db.query.mockReset();
    db.query.mockImplementation(async (sql) => {
        if (sql.includes('FROM community_chat_rooms r')) return [[room]];
        if (sql.includes('SELECT full_name')) return [[{ full_name: 'Private Name' }]];
        if (sql.includes('SELECT nickname')) return [[{ nickname: 'Bunda Anggrek' }]];
        if (sql.includes('SELECT COALESCE(MAX')) return [[{ last_id: 10 }]];
        return [[]];
    });
});
test('typing uses authenticated community nickname, never client email or identity', async () => {
    const handlers = {};
    const emit = jest.fn();
    const socket = { data: {}, on: (name, fn) => { handlers[name] = fn; }, join: jest.fn(), emit: jest.fn(), to: () => ({ emit }) };
    router.setupSocketHandlers({ on: (_, fn) => fn(socket) });
    await handlers['community:join']({ room: 'lobby', token: jwt.sign({ id: 'P1', user_type: 'patient' }, 'community-test') });
    await handlers['community:typing']({ room: 'lobby', user_id: 'victim', user_name: 'private@example.test' });
    const event = emit.mock.calls.find(call => call[0] === 'community:typing');
    expect(event[1]).toMatchObject({ user_id: 'P1', user_name: 'Bunda Anggrek', user_type: 'patient' });
});
test('unread summary is authenticated, numeric and never cached', async () => {
    const result = await request(app).get('/unread');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true, total: expect.any(Number), rooms: expect.any(Array) });
    expect(result.headers['cache-control']).toContain('no-store');
});
test('read cursor rejects a message that is not in the requested room', async () => {
    const result = await request(app).post('/rooms/lobby/read').send({ message_id: 99 });
    expect(result.status).toBe(400);
    expect(db.query.mock.calls.some(([sql]) => sql.includes('UPDATE community_chat_room_members'))).toBe(false);
});
