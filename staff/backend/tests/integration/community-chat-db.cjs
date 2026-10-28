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
        await db.query("CREATE TABLE users (new_id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), user_type VARCHAR(20), photo_url TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, role VARCHAR(40), role_id INT, is_superadmin TINYINT DEFAULT 0)");
        await db.query("CREATE TABLE patient_portal_settings (patient_id VARCHAR(50) PRIMARY KEY, nickname VARCHAR(40))");
        await db.query("INSERT INTO patients VALUES ('P1','Private One',NULL),('P2','Private Two',NULL),('P3','Private Three',NULL)");
        await db.query("INSERT INTO users (new_id,name,user_type,photo_url) VALUES ('S1','Staf Uji','staff','data:image/png;base64,aGVsbG8=')");
        await db.query("INSERT INTO patient_portal_settings VALUES ('P1','Mama Satu'),('P2','Mama Dua')");
        await db.query("INSERT INTO community_chat_rooms (id,slug,name) VALUES (1,'lobby','Lobby'),(2,'other','Other')");
        await db.query("INSERT INTO community_chat_rooms (id,slug,name,is_direct,direct_patient_id,direct_staff_id) VALUES (3,'private','Private',1,'P1','S1')");
        await db.query("INSERT INTO community_chat_messages (id,room_id,sender_id,sender_type,sender_name,message) VALUES (1,1,'P2','patient','Private Two','Historical')");
        const migration = fs.readFileSync(path.join(backend, 'migrations/20260923_community_chat_attention.sql'), 'utf8');
        await db.query(migration);
        const notificationMigration = fs.readFileSync(path.join(backend, 'migrations/20261025_patient_chat_notifications.sql'), 'utf8');
        await db.query(notificationMigration);
        await db.query(notificationMigration);
        await db.query("INSERT INTO patient_chat_notification_settings (patient_id,enabled) VALUES ('P2',1)");
        await db.query("INSERT INTO community_chat_room_members (room_id,user_id,user_type,display_name) VALUES (1,'P1','patient','Mama Satu'),(1,'P2','patient','Mama Dua'),(2,'P1','patient','Mama Satu')");
        install('db.js', db);
        const verifyToken = (req, res, next) => {
            try { req.user = jwt.verify(String(req.headers.authorization).slice(7), secret); next(); }
            catch (_) { res.status(401).json({ success: false }); }
        };
        install('middleware/auth.js', { JWT_SECRET: secret, verifyToken, verifyStaffToken: verifyToken, verifyPatientToken: verifyToken });
        const pushed = [];
        install('services/pushNotificationService.js', { sendToPatient: async (...args) => { pushed.push(args); return { success: true, sent: 1, failed: 0 }; } });
        install('realtime-sync.js', { broadcastPatientNotification: () => {} });
        const router = require(path.join(backend, 'routes/community-chat.js'));
        const { isPatientAllowedRoute } = require(path.join(backend, 'security/patientRouteAccess'));
        const app = express(); app.use(express.json());
        app.use('/api/community-chat', verifyToken, (req, res, next) => {
            if (req.user.user_type === 'patient' && !isPatientAllowedRoute(req.method, req.originalUrl)) {
                return res.status(403).json({ success: false, message: 'Patient route blocked' });
            }
            next();
        }, router);
        server = await new Promise(resolve => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
        const base = 'http://127.0.0.1:' + server.address().port + '/api/community-chat';
        async function api(user, endpoint, body, method = body ? 'POST' : 'GET') {
            const response = await fetch(base + endpoint, { method, headers: { Authorization: 'Bearer ' + jwt.sign({ id: user, user_type: user === 'S1' ? 'staff' : 'patient' }, secret), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
            return { status: response.status, body: await response.json(), headers: response.headers };
        }
        const preference = await api('P1', '/me/notifications');
        assert.equal(preference.status, 200, 'Patient notification settings pass the shared route boundary');
        assert.equal(preference.body.settings.enabled, false);
        assert.equal((await api('P1', '/me/notifications', { enabled: true }, 'PUT')).status, 200);
        assert.equal((await api('P1', '/me/notifications')).body.settings.enabled, true);
        assert.equal((await api('P1', '/me/notifications', { enabled: false }, 'PUT')).status, 200);
        assert.equal((await api('P1', '/me/notifications')).body.settings.enabled, false);
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
        // Chat push dispatch is detached from the already-persisted message response.
        const pushDeadline = Date.now() + 2000;
        while (!pushed.length && Date.now() < pushDeadline) await new Promise(resolve => setTimeout(resolve, 10));
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
        await db.query("INSERT INTO community_chat_profiles (user_id,user_type,nickname,avatar_url) VALUES ('S1','staff','Nama Komunitas Lama','/old.png')");
        const sent = await api('S1', '/rooms/lobby/messages', { message: 'Pesan staff' });
        assert.equal(sent.status, 200, JSON.stringify(sent.body));
        assert.equal(sent.body.message.sender_nickname, 'Staf Uji');
        assert.ok(sent.body.message.sender_avatar.startsWith('/api/auth/staff-avatar/S1?v='));
        await db.query("UPDATE users SET name='Staf Terbaru', updated_at='2026-10-19 12:34:56' WHERE new_id='S1'");
        const ownProfile = (await api('S1', '/me/profile')).body.profile;
        const publicProfile = (await api('P1', '/profiles/staff/S1')).body.profile;
        assert.equal(ownProfile.defaultName, 'Staf Terbaru');
        assert.equal(ownProfile.nickname, null);
        assert.equal(publicProfile.display_name, ownProfile.defaultName);
        assert.equal(publicProfile.avatar_url, ownProfile.avatarUrl);
        assert.notEqual(ownProfile.avatarUrl, sent.body.message.sender_avatar, 'Staff photo cache key follows Staff Profile updates');
        const currentMembers = (await api('P1', '/rooms/lobby/members')).body.members;
        assert.equal(currentMembers.find(m => m.user_id === 'S1').display_name, ownProfile.defaultName);
        assert.equal(currentMembers.find(m => m.user_id === 'S1').avatar_url, ownProfile.avatarUrl);
        for (const endpoint of ['/rooms/lobby/messages', '/rooms/lobby/messages/' + sent.body.message.id + '/context']) {
            const history = await api('P1', endpoint);
            assert.equal(history.status, 200, JSON.stringify(history.body));
            const staffMessage = history.body.messages.find(m => m.id === sent.body.message.id);
            assert.equal(staffMessage.sender_name, ownProfile.defaultName);
            assert.equal(staffMessage.sender_nickname, ownProfile.defaultName);
            assert.equal(staffMessage.sender_avatar, ownProfile.avatarUrl);
        }
        const attention = require(path.join(backend, 'services/CommunityChatAttention'));
        const metadata = await attention.validateMetadata(db, { id: 1 }, { mentions: [{ user_id: 'S1', user_type: 'staff', start: 0, end: 13 }], reply_to_message_id: sent.body.message.id }, '@Staf Terbaru');
        assert.equal(metadata.mentions[0].label, ownProfile.defaultName);
        assert.equal(metadata.reply.sender, ownProfile.defaultName);
        await db.query("UPDATE users SET photo_url=NULL WHERE new_id='S1'");
        assert.equal((await api('S1', '/me/profile')).body.profile.avatarUrl, '/staff/public/images/avatarwanita.png');
        await db.query("UPDATE community_chat_profiles SET profile_visible=0 WHERE user_id='S1' AND user_type='staff'");
        const bio = 'Bio dokter\nInformasi publik.';
        const savedBio = await api('S1', '/me/profile', { bio }, 'PUT');
        assert.equal(savedBio.status, 200, JSON.stringify(savedBio.body));
        assert.equal(savedBio.body.profile.bio, bio);
        const [preserved] = await db.query("SELECT nickname, profile_visible FROM community_chat_profiles WHERE user_id='S1' AND user_type='staff'");
        assert.equal(preserved[0].nickname, 'Nama Komunitas Lama');
        assert.equal(preserved[0].profile_visible, 0, 'Saving only bio preserves hidden profile');
        assert.equal((await api('S1', '/me/profile', { bio: 'x'.repeat(501) }, 'PUT')).status, 400);
        await api('S1', '/me/profile', { profile_visible: true }, 'PUT');
        const { ROLE_IDS } = require(path.join(backend, 'constants/roles'));
        await db.query('UPDATE users SET role_id=? WHERE new_id=?', [ROLE_IDS.DOKTER, 'S1']);
        const doctor = (await api('P1', '/profiles/staff/S1')).body.profile;
        assert.equal(doctor.is_doctor, true);
        assert.equal(doctor.bio, bio);
        await db.query('UPDATE users SET role_id=? WHERE new_id=?', [ROLE_IDS.ADMIN, 'S1']);
        assert.equal((await api('P1', '/profiles/staff/S1')).body.profile.is_doctor, false);
        assert.equal((await api('S1', '/me/profile', { bio: '' }, 'PUT')).body.profile.bio, '');
        console.log(JSON.stringify({ result: 'PASS real MariaDB', schema: database, cases: 'migration twice, baseline, unread across rooms, own exclusion, monotonic read, authorization, member names, quote, recipient dedup, notification row and push dispatch, deleted context' }));
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.end();
        await root.query('DROP DATABASE ' + database);
        await root.end();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
