/* Real MariaDB integration in a disposable database only.
   Never uses the production db.js connection or real notification recipients.
   Run: NODE_PATH=/var/www/dokterdibya/staff/backend/node_modules node .../community-chat-db.cjs */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const express = require('express');
const jwt = require('jsonwebtoken');
const backend = path.resolve(__dirname, '../..');
const database = 'codex_community_chat_qa_20260923';
const secret = 'isolated-community-integration';
const install = (relative, exports) => { require.cache[require.resolve(path.join(backend, relative))] = { exports }; };
(async () => {
    const root = await mysql.createConnection({ socketPath: '/run/mysqld/mysqld.sock', user: 'root', multipleStatements: true });
    const [existing] = await root.query('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?', [database]);
    assert.equal(existing.length, 0, 'Refusing to overwrite an existing database');
    await root.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    const db = mysql.createPool({ socketPath: '/run/mysqld/mysqld.sock', user: 'root', database, multipleStatements: true, connectionLimit: 3 });
    let server;
    try {
        for (const table of ['community_chat_rooms', 'community_chat_messages', 'community_chat_profiles', 'community_chat_room_members', 'community_chat_room_moderators', 'patient_notifications', 'staff_notifications']) {
            await db.query('CREATE TABLE ' + table + ' LIKE dibyaklinik.' + table);
        }
        await db.query("CREATE TABLE patients (id VARCHAR(50) PRIMARY KEY, full_name VARCHAR(255), photo_url TEXT)");
        await db.query("CREATE TABLE users (new_id VARCHAR(64) PRIMARY KEY, name VARCHAR(255))");
        await db.query("CREATE TABLE patient_portal_settings (patient_id VARCHAR(50) PRIMARY KEY, nickname VARCHAR(40))");
        await db.query("INSERT INTO patients VALUES ('P1','Private One',NULL),('P2','Private Two',NULL),('P3','Private Three',NULL)");
        await db.query("INSERT INTO users VALUES ('S1','Staf Uji')");
        await db.query("INSERT INTO patient_portal_settings VALUES ('P1','Mama Satu'),('P2','Mama Dua')");
        await db.query("INSERT INTO community_chat_rooms (id,slug,name) VALUES (1,'lobby','Lobby'),(2,'other','Other')");
        await db.query("INSERT INTO community_chat_rooms (id,slug,name,is_direct,direct_patient_id,direct_staff_id) VALUES (3,'private','Private',1,'P1','S1')");
        await db.query("INSERT INTO community_chat_messages (id,room_id,sender_id,sender_type,sender_name,message) VALUES (1,1,'P2','patient','Private Two','Historical')");
        const migration = fs.readFileSync(path.join(backend, 'migrations/20260923_community_chat_attention.sql'), 'utf8');
        await db.query(migration);
        await db.query("INSERT INTO community_chat_room_members (room_id,user_id,user_type,display_name) VALUES (1,'P1','patient','Mama Satu'),(1,'P2','patient','Mama Dua'),(2,'P1','patient','Mama Satu')");
        install('db.js', db);
        const verifyToken = (req, res, next) => {
            try { req.user = jwt.verify(String(req.headers.authorization).slice(7), secret); next(); }
            catch (_) { res.status(401).json({ success: false }); }
        };
        install('middleware/auth.js', { JWT_SECRET: secret, verifyToken, verifyPatientToken: verifyToken });
        const pushed = [];
        install('services/pushNotificationService.js', { sendToPatient: async (...args) => { pushed.push(args); return { success: true, sent: 1, failed: 0 }; } });
        install('realtime-sync.js', { broadcastPatientNotification: () => {} });
        const router = require(path.join(backend, 'routes/community-chat.js'));
        const app = express(); app.use(express.json()); app.use('/api/community-chat', router);
        server = await new Promise(resolve => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
        const base = 'http://127.0.0.1:' + server.address().port + '/api/community-chat';
        async function api(user, endpoint, body) {
            const response = await fetch(base + endpoint, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + jwt.sign({ id: user, user_type: 'patient' }, secret), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
            return { status: response.status, body: await response.json(), headers: response.headers };
        }
        assert.equal((await api('P1', '/unread')).body.total, 0, 'Historical messages are excluded');
        const a = await api('P2', '/rooms/lobby/messages', { message: 'Hallo' }); assert.equal(a.status, 200, JSON.stringify(a.body));
        assert.equal((await api('P1', '/unread')).body.total, 1);
        assert.equal((await api('P2', '/unread')).body.total, 0, 'Own message is excluded');
        const members = await api('P1', '/rooms/lobby/members');
        assert.equal(members.body.members.find(m => m.user_id === 'P2').display_name, 'Mama Dua');
        const b = await api('P1', '/rooms/lobby/messages', { message: '@Mama Dua hai', mentions: [{ user_id: 'P2', user_type: 'patient', start: 0, end: 9 }], reply_to_message_id: a.body.message.id });
        assert.equal(b.status, 200, JSON.stringify(b.body));
        const [notifications] = await db.query("SELECT * FROM patient_notifications WHERE patient_id='P2'");
        assert.equal(notifications.length, 1, 'Mention plus quote creates only one notification');
        assert.ok(notifications[0].link.includes('message=' + b.body.message.id));
        assert.equal(pushed.length, 1);
        assert.equal(pushed[0][0], 'P2');
        assert.ok(!notifications[0].message.includes('Private'));
        const c = await api('P2', '/rooms/other/messages', { message: 'Other room' }); assert.equal(c.status, 200);
        assert.equal((await api('P1', '/unread')).body.total, 2);
        assert.equal((await api('P1', '/rooms/lobby/read', { message_id: a.body.message.id })).status, 200);
        assert.equal((await api('P1', '/unread')).body.total, 1, 'Only the read room clears');
        await api('P1', '/rooms/lobby/read', { message_id: 1 });
        assert.equal((await api('P1', '/unread')).body.total, 1, 'Cursor cannot move backwards');
        assert.equal((await api('P1', '/rooms/lobby/read', { message_id: c.body.message.id })).status, 400);
        assert.equal((await api('P2', '/rooms/private/messages')).status, 403);
        assert.equal((await api('P1', '/rooms/lobby/messages', { message: 'cross room', reply_to_message_id: c.body.message.id })).status, 400);
        assert.equal((await api('P1', '/rooms/lobby/messages', { message: '@Mama Dua', mentions: [{ user_id: 'P3', user_type: 'patient', start: 0, end: 9 }] })).status, 400);
        assert.equal((await api('P1', '/rooms/lobby/messages/' + a.body.message.id + '/context')).status, 200);
        await db.query('DELETE FROM community_chat_messages WHERE id = ?', [a.body.message.id]);
        assert.equal((await api('P1', '/rooms/lobby/messages/' + a.body.message.id + '/context')).status, 404);
        await db.query(migration);
        const [baseline] = await db.query('SELECT message_id FROM community_chat_attention_baseline');
        assert.equal(Number(baseline[0].message_id), 1, 'Redeploy never resets the unread baseline');
        console.log(JSON.stringify({ result: 'PASS real MariaDB', schema: database, cases: 'migration twice, baseline, unread across rooms, own exclusion, monotonic read, authorization, member names, quote, recipient dedup, notification row and push dispatch, deleted context' }));
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.end();
        await root.query('DROP DATABASE ' + database);
        await root.end();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
