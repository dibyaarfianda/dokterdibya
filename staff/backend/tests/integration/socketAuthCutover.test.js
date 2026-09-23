const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { Decoder, PacketType } = require('socket.io-parser');

// Execute the production Socket.IO setup, but never start application schedulers,
// database routes, or a public listener. Drive real Engine.IO polling locally.
let io;
let origin;
async function start(required) {
    const server = http.createServer();
    const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
    const setup = source.slice(source.indexOf('const io = new Server'), source.indexOf('// Make io globally'));
    const context = {
        Server, server, corsOriginDelegate: (origin, callback) => callback(null, true),
        process: { env: { ...process.env, SOCKET_AUTH_REQUIRED: required } },
        require: id => require(path.resolve(__dirname, '../..', id))
    };
    vm.runInNewContext(setup + '\nglobalThis.testIo = io;', context);
    io = context.testIo;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
}

function request(url, body) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, {
            method: body === undefined ? 'GET' : 'POST',
            agent: false,
            headers: body === undefined ? {} : { 'Content-Type': 'text/plain;charset=UTF-8' }
        }, res => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { text += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, text }));
        });
        req.on('error', reject);
        req.setTimeout(3000, () => req.destroy(new Error('Local polling request timed out')));
        req.end(body);
    });
}

async function handshake(token) {
    const base = `${origin}/socket.io/?EIO=4&transport=polling`;
    const opened = await request(base);
    expect(opened.status).toBe(200);
    const opening = JSON.parse(opened.text.slice(1));
    expect(opening.upgrades).toEqual([]);
    const session = `${base}&sid=${encodeURIComponent(opening.sid)}`;
    const sent = await request(session, '40' + JSON.stringify(token === undefined ? {} : { token }));
    expect(sent.status).toBe(200);
    const received = await request(session);
    expect(received.status).toBe(200);
    const packets = [];
    const decoder = new Decoder();
    decoder.on('decoded', packet => packets.push(packet));
    for (const packet of received.text.split('\x1e')) {
        if (packet.startsWith('4')) decoder.add(packet.slice(1));
    }
    decoder.destroy();
    return packets[0];
}

afterEach(async () => {
    if (io) await new Promise(resolve => io.close(resolve));
    io = undefined;
});

test.each([undefined, 'false'])('SOCKET_AUTH_REQUIRED=%s retains missing-token quarantine', async required => {
    await start(required);
    const packet = await handshake();
    expect(packet.type).toBe(PacketType.CONNECT);
    const socket = io.sockets.sockets.get(packet.data.sid);
    expect(socket.data.principal).toBeNull();
    // Anonymous clients have only their own transport room, never domain rooms.
    expect([...socket.rooms]).toEqual([socket.id]);
});

test.each([undefined, null, ''])('strict mode rejects missing token %s with connect_error / AUTH_MISSING', async missing => {
    await start('true');
    const packet = await handshake(missing);
    expect(packet).toMatchObject({
        type: PacketType.CONNECT_ERROR, data: { message: 'AUTH_MISSING', data: { code: 'AUTH_MISSING' } }
    });
    expect(io.sockets.sockets.size).toBe(0);
});

describe.each([undefined, 'false', 'true'])('SOCKET_AUTH_REQUIRED=%s', required => {
    test.each(['AUTH_INVALID', 'AUTH_EXPIRED'])('rejects %s independently of anonymous policy', async code => {
        await start(required);
        const credential = code === 'AUTH_INVALID' ? 'synthetic-invalid' : jwt.sign(
            { id: 'synthetic-cutover', role: 'patient', user_type: 'patient' },
            process.env.JWT_SECRET, { expiresIn: -1 }
        );
        const packet = await handshake(credential);
        expect(packet).toMatchObject({ type: PacketType.CONNECT_ERROR, data: { message: code, data: { code } } });
        expect(io.sockets.sockets.size).toBe(0);
    });

    test('preserves authenticated principal and patient-owned room', async () => {
        await start(required);
        const packet = await handshake(jwt.sign(
            { id: 'synthetic-cutover', role: 'patient', user_type: 'patient' },
            process.env.JWT_SECRET, { expiresIn: 60 }
        ));
        expect(packet.type).toBe(PacketType.CONNECT);
        const socket = io.sockets.sockets.get(packet.data.sid);
        expect(socket.data.principal).toMatchObject({ id: 'synthetic-cutover', user_type: 'patient' });
        expect(Object.isFrozen(socket.data.principal)).toBe(true);
        expect([...socket.rooms].sort()).toEqual([socket.id, 'authenticated', 'patient:synthetic-cutover'].sort());
        expect(socket.conn.transport.name).toBe('polling');
    });
});
