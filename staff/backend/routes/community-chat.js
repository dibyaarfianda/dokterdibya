const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { verifyToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_LOBBY_SLUG = 'lobby';
const DEFAULT_ROOM_COLOR = '#2563eb';
const MAX_ROOM_NAME = 80;
const MAX_NICKNAME = 30;
const MAX_MESSAGE_LENGTH = 2000;

let ioRef = null;
let initPromise = null;

function isPatientUser(user) {
    return user?.user_type === 'patient' || user?.role === 'patient';
}

function isStaffUser(user) {
    return !isPatientUser(user);
}

function normalizeText(text) {
    return String(text || '').trim();
}

function toSlug(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
}

function safeColor(value) {
    const color = normalizeText(value);
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    return DEFAULT_ROOM_COLOR;
}

function mapEmoticonToEmoji(message) {
    const pairs = {
        ':)': '😊',
        '(:': '😊',
        ':D': '😃',
        ':d': '😃',
        ':(': '😢',
        '):': '😢',
        ';)': '😉',
        ':P': '😛',
        ':p': '😛',
        '<3': '❤️',
        '</3': '💔',
        ':*': '😘',
        ':o': '😮',
        ':O': '😮',
        'XD': '😆',
        'xD': '😆',
        ':thumbsup:': '👍',
        ':fire:': '🔥',
        ':heart:': '❤️',
        ':check:': '✅',
        ':x:': '❌'
    };

    let result = message;
    for (const [from, to] of Object.entries(pairs)) {
        result = result.split(from).join(to);
    }
    return result;
}

async function ensureSchema() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        await db.query(`
            CREATE TABLE IF NOT EXISTS community_chat_rooms (
                id INT AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(80) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                description VARCHAR(255) NULL,
                color VARCHAR(7) NOT NULL DEFAULT '#2563eb',
                created_by VARCHAR(64) NULL,
                created_by_type ENUM('patient', 'staff') NULL,
                is_system TINYINT(1) NOT NULL DEFAULT 0,
                is_archived TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_active (is_archived, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS community_chat_profiles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(64) NOT NULL,
                user_type ENUM('patient', 'staff') NOT NULL,
                nickname VARCHAR(40) NULL,
                bio VARCHAR(255) NULL,
                avatar_url TEXT NULL,
                profile_visible TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_user (user_id, user_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS community_chat_messages (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                room_id INT NOT NULL,
                sender_id VARCHAR(64) NOT NULL,
                sender_type ENUM('patient', 'staff') NOT NULL,
                sender_name VARCHAR(255) NOT NULL,
                sender_nickname VARCHAR(40) NULL,
                sender_avatar TEXT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_room_time (room_id, created_at),
                CONSTRAINT fk_community_chat_messages_room
                    FOREIGN KEY (room_id) REFERENCES community_chat_rooms(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS community_chat_room_moderators (
                id INT AUTO_INCREMENT PRIMARY KEY,
                room_id INT NOT NULL,
                staff_user_id VARCHAR(64) NOT NULL,
                assigned_by VARCHAR(64) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_room_staff (room_id, staff_user_id),
                INDEX idx_staff (staff_user_id),
                CONSTRAINT fk_community_chat_room_mod_room
                    FOREIGN KEY (room_id) REFERENCES community_chat_rooms(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.query(
            `INSERT INTO community_chat_rooms (slug, name, description, color, is_system)
             VALUES (?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             description = VALUES(description),
             color = VALUES(color),
             is_system = 1`,
            [DEFAULT_LOBBY_SLUG, 'Lobby Utama', 'Ruang umum untuk semua user', '#0ea5e9']
        );
    })();

    return initPromise;
}

async function getRoomBySlug(slug) {
    const [rows] = await db.query(
        `SELECT id, slug, name, description, color, is_system, is_archived, created_by, created_by_type, created_at, updated_at
         FROM community_chat_rooms
         WHERE slug = ? AND is_archived = 0
         LIMIT 1`,
        [slug]
    );
    return rows[0] || null;
}

async function resolveUserIdentity(user) {
    const userId = String(user.id);
    const userType = isPatientUser(user) ? 'patient' : 'staff';

    let defaultName = user.name || user.full_name || user.email || 'User';
    let photo = null;

    if (userType === 'patient') {
        const [rows] = await db.query(
            'SELECT full_name, photo_url FROM patients WHERE id = ? LIMIT 1',
            [userId]
        );
        if (rows.length > 0) {
            defaultName = rows[0].full_name || defaultName;
            photo = rows[0].photo_url || null;
        }
    } else {
        const [rows] = await db.query(
            'SELECT name, photo_url FROM users WHERE new_id = ? LIMIT 1',
            [userId]
        );
        if (rows.length > 0) {
            defaultName = rows[0].name || defaultName;
            photo = rows[0].photo_url || null;
        }
    }

    const [profiles] = await db.query(
        `SELECT nickname, bio, avatar_url, profile_visible
         FROM community_chat_profiles
         WHERE user_id = ? AND user_type = ?
         LIMIT 1`,
        [userId, userType]
    );

    const profile = profiles[0] || null;
    return {
        userId,
        userType,
        defaultName,
        nickname: profile?.nickname || null,
        bio: profile?.bio || '',
        avatarUrl: profile?.avatar_url || photo || null,
        profileVisible: profile ? profile.profile_visible === 1 : true
    };
}

async function getReadableProfile(userId, userType) {
    let defaultName = 'User';
    let photo = null;

    if (userType === 'patient') {
        const [rows] = await db.query('SELECT full_name, photo_url FROM patients WHERE id = ? LIMIT 1', [userId]);
        if (rows.length > 0) {
            defaultName = rows[0].full_name || defaultName;
            photo = rows[0].photo_url || null;
        }
    } else {
        const [rows] = await db.query(
            `SELECT u.name, u.photo_url, r.display_name AS role_display_name
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.new_id = ? LIMIT 1`,
            [userId]
        );
        if (rows.length > 0) {
            defaultName = rows[0].name || defaultName;
            photo = rows[0].photo_url || null;
        }
    }

    const [profiles] = await db.query(
        `SELECT nickname, bio, avatar_url, profile_visible, updated_at
         FROM community_chat_profiles
         WHERE user_id = ? AND user_type = ? LIMIT 1`,
        [userId, userType]
    );

    const profile = profiles[0] || null;
    if (profile && profile.profile_visible === 0) return null;

    return {
        user_id: userId,
        user_type: userType,
        display_name: profile?.nickname || defaultName,
        nickname: profile?.nickname || null,
        bio: profile?.bio || '',
        avatar_url: profile?.avatar_url || photo || null,
        updated_at: profile?.updated_at || null
    };
}

async function isRoomModerator(roomId, user) {
    if (isStaffUser(user)) {
        return true;
    }

    const [rows] = await db.query(
        `SELECT id FROM community_chat_room_moderators
         WHERE room_id = ? AND staff_user_id = ? LIMIT 1`,
        [roomId, String(user.id)]
    );

    return rows.length > 0;
}

function emitRoomListChanged() {
    if (!ioRef) return;
    ioRef.emit('community:rooms:changed', { at: new Date().toISOString() });
}

function mapRoom(row, currentUserType) {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description || '',
        color: row.color || DEFAULT_ROOM_COLOR,
        is_system: row.is_system === 1,
        created_by: row.created_by,
        created_by_type: row.created_by_type,
        is_owner: row.created_by && row.created_by === row.current_user_id && row.created_by_type === currentUserType,
        last_message_at: row.last_message_at,
        member_count: Number(row.member_count || 0)
    };
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema();
        next();
    } catch (error) {
        next(error);
    }
});

router.get('/rooms', verifyToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const userType = isPatientUser(req.user) ? 'patient' : 'staff';

        const [rows] = await db.query(
            `SELECT
                r.id,
                r.slug,
                r.name,
                r.description,
                r.color,
                r.is_system,
                r.created_by,
                r.created_by_type,
                r.created_at,
                r.updated_at,
                MAX(m.created_at) AS last_message_at,
                COUNT(DISTINCT room_mod.staff_user_id) AS member_count,
                ? AS current_user_id
            FROM community_chat_rooms r
            LEFT JOIN community_chat_messages m ON m.room_id = r.id
            LEFT JOIN community_chat_room_moderators room_mod ON room_mod.room_id = r.id
            WHERE r.is_archived = 0
            GROUP BY
                r.id,
                r.slug,
                r.name,
                r.description,
                r.color,
                r.is_system,
                r.created_by,
                r.created_by_type,
                r.created_at,
                r.updated_at
            ORDER BY (r.slug = ?) DESC, COALESCE(MAX(m.created_at), r.created_at) DESC`,
            [userId, DEFAULT_LOBBY_SLUG]
        );

        res.json({
            success: true,
            rooms: rows.map((row) => mapRoom(row, userType))
        });
    } catch (error) {
        console.error('community rooms error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat room chat' });
    }
});

router.post('/rooms', verifyToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const userType = isPatientUser(req.user) ? 'patient' : 'staff';

        const name = normalizeText(req.body.name).slice(0, MAX_ROOM_NAME);
        const description = normalizeText(req.body.description).slice(0, 255);
        const color = safeColor(req.body.color);

        if (!name) {
            return res.status(400).json({ success: false, message: 'Nama room wajib diisi' });
        }

        let slug = toSlug(req.body.slug || name);
        if (!slug) slug = `room-${Date.now()}`;

        const [exists] = await db.query('SELECT id FROM community_chat_rooms WHERE slug = ? LIMIT 1', [slug]);
        if (exists.length > 0) {
            slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
        }

        await db.query(
            `INSERT INTO community_chat_rooms (slug, name, description, color, created_by, created_by_type, is_system)
             VALUES (?, ?, ?, ?, ?, ?, 0)`,
            [slug, name, description || null, color, userId, userType]
        );

        const room = await getRoomBySlug(slug);
        emitRoomListChanged();

        res.json({ success: true, room });
    } catch (error) {
        console.error('community create room error:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat room' });
    }
});

router.get('/rooms/:slug/messages', verifyToken, async (req, res) => {
    try {
        const room = await getRoomBySlug(req.params.slug);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room tidak ditemukan' });
        }

        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
        const [rows] = await db.query(
            `SELECT id, room_id, sender_id, sender_type, sender_name, sender_nickname, sender_avatar, message, created_at
             FROM community_chat_messages
             WHERE room_id = ?
             ORDER BY created_at DESC
             LIMIT ?`,
            [room.id, limit]
        );

        res.json({
            success: true,
            room,
            messages: rows.reverse()
        });
    } catch (error) {
        console.error('community messages error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat pesan' });
    }
});

router.post('/rooms/:slug/messages', verifyToken, async (req, res) => {
    try {
        const room = await getRoomBySlug(req.params.slug);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room tidak ditemukan' });
        }

        const rawMessage = normalizeText(req.body.message);
        if (!rawMessage) {
            return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });
        }

        const messageText = mapEmoticonToEmoji(rawMessage).slice(0, MAX_MESSAGE_LENGTH);
        const identity = await resolveUserIdentity(req.user);
        const senderName = identity.defaultName;

        const [result] = await db.query(
            `INSERT INTO community_chat_messages
                (room_id, sender_id, sender_type, sender_name, sender_nickname, sender_avatar, message)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                room.id,
                identity.userId,
                identity.userType,
                senderName,
                identity.nickname,
                identity.avatarUrl,
                messageText
            ]
        );

        const [rows] = await db.query(
            `SELECT id, room_id, sender_id, sender_type, sender_name, sender_nickname, sender_avatar, message, created_at
             FROM community_chat_messages WHERE id = ? LIMIT 1`,
            [result.insertId]
        );

        const message = rows[0];

        if (ioRef) {
            ioRef.to(`community:${room.slug}`).emit('community:message:new', {
                room: room.slug,
                message
            });
        }

        res.json({ success: true, message });
    } catch (error) {
        console.error('community send message error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengirim pesan' });
    }
});

router.delete('/rooms/:slug/messages/:messageId', verifyToken, async (req, res) => {
    try {
        const room = await getRoomBySlug(req.params.slug);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room tidak ditemukan' });
        }

        if (!(await isRoomModerator(room.id, req.user))) {
            return res.status(403).json({ success: false, message: 'Hanya moderator/admin yang bisa menghapus pesan' });
        }

        await db.query(
            'DELETE FROM community_chat_messages WHERE id = ? AND room_id = ?',
            [req.params.messageId, room.id]
        );

        if (ioRef) {
            ioRef.to(`community:${room.slug}`).emit('community:message:deleted', {
                room: room.slug,
                message_id: Number(req.params.messageId)
            });
        }

        res.json({ success: true, message: 'Pesan dihapus' });
    } catch (error) {
        console.error('community delete message error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus pesan' });
    }
});

router.get('/me/profile', verifyToken, async (req, res) => {
    try {
        const profile = await resolveUserIdentity(req.user);
        res.json({ success: true, profile });
    } catch (error) {
        console.error('community me profile error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat profile chat' });
    }
});

router.put('/me/profile', verifyToken, async (req, res) => {
    try {
        const userId = String(req.user.id);
        const userType = isPatientUser(req.user) ? 'patient' : 'staff';
        const nickname = normalizeText(req.body.nickname).slice(0, MAX_NICKNAME);
        const bio = normalizeText(req.body.bio).slice(0, 255);
        const profileVisible = req.body.profile_visible === false ? 0 : 1;

        await db.query(
            `INSERT INTO community_chat_profiles (user_id, user_type, nickname, bio, profile_visible)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                nickname = VALUES(nickname),
                bio = VALUES(bio),
                profile_visible = VALUES(profile_visible),
                updated_at = CURRENT_TIMESTAMP`,
            [userId, userType, nickname || null, bio || null, profileVisible]
        );

        const profile = await resolveUserIdentity(req.user);
        res.json({ success: true, profile });
    } catch (error) {
        console.error('community update profile error:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan profile chat' });
    }
});

router.get('/profiles/:userType/:userId', verifyToken, async (req, res) => {
    try {
        const userType = req.params.userType === 'staff' ? 'staff' : 'patient';
        const userId = String(req.params.userId);

        const profile = await getReadableProfile(userId, userType);
        if (!profile) {
            return res.status(404).json({ success: false, message: 'Profile tidak ditemukan atau disembunyikan' });
        }

        res.json({ success: true, profile });
    } catch (error) {
        console.error('community read profile error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat profile publik' });
    }
});

router.get('/rooms/:slug/moderators', verifyToken, async (req, res) => {
    try {
        const room = await getRoomBySlug(req.params.slug);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room tidak ditemukan' });
        }

        const [rows] = await db.query(
            `SELECT m.staff_user_id, u.name, u.email, u.role_id, r.display_name AS role_display_name
             FROM community_chat_room_moderators m
             LEFT JOIN users u ON u.new_id = m.staff_user_id
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE m.room_id = ?
             ORDER BY u.name ASC`,
            [room.id]
        );

        res.json({ success: true, moderators: rows });
    } catch (error) {
        console.error('community moderators list error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat moderator room' });
    }
});

router.get('/admin/staff-users', verifyToken, async (req, res) => {
    try {
        if (!isStaffUser(req.user)) {
            return res.status(403).json({ success: false, message: 'Hanya staff yang bisa mengelola moderator' });
        }

        const [rows] = await db.query(
            `SELECT u.new_id, u.name, u.email, u.role, u.role_id, r.display_name AS role_display_name
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.user_type <> 'patient'
             ORDER BY u.name ASC`
        );

        res.json({ success: true, staff_users: rows });
    } catch (error) {
        console.error('community staff users error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat data staff' });
    }
});

router.put('/rooms/:slug/moderators', verifyToken, async (req, res) => {
    try {
        if (!isStaffUser(req.user)) {
            return res.status(403).json({ success: false, message: 'Hanya staff yang bisa mengatur moderator' });
        }

        const room = await getRoomBySlug(req.params.slug);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room tidak ditemukan' });
        }

        const moderatorIds = Array.isArray(req.body.moderator_user_ids)
            ? req.body.moderator_user_ids.map((value) => String(value)).filter(Boolean)
            : [];

        await db.query('DELETE FROM community_chat_room_moderators WHERE room_id = ?', [room.id]);

        for (const staffId of moderatorIds) {
            const [rows] = await db.query(
                'SELECT new_id FROM users WHERE new_id = ? AND user_type <> ? LIMIT 1',
                [staffId, 'patient']
            );
            if (rows.length === 0) continue;

            await db.query(
                `INSERT INTO community_chat_room_moderators (room_id, staff_user_id, assigned_by)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE assigned_by = VALUES(assigned_by)`,
                [room.id, staffId, String(req.user.id)]
            );
        }

        if (ioRef) {
            ioRef.to(`community:${room.slug}`).emit('community:moderators:changed', {
                room: room.slug
            });
        }

        res.json({ success: true, message: 'Moderator room diperbarui' });
    } catch (error) {
        console.error('community set moderators error:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui moderator' });
    }
});

router.archiveRoom = async function archiveRoom(slug) {
    await db.query('UPDATE community_chat_rooms SET is_archived = 1 WHERE slug = ?', [slug]);
    emitRoomListChanged();
};

router.setupSocketHandlers = function setupSocketHandlers(io) {
    ioRef = io;

    io.on('connection', (socket) => {
        socket.on('community:join', async (payload) => {
            try {
                const token = payload?.token;
                const roomSlug = normalizeText(payload?.room) || DEFAULT_LOBBY_SLUG;
                if (!token) return;

                const user = jwt.verify(token, JWT_SECRET);
                const room = await getRoomBySlug(roomSlug);
                if (!room) return;

                const roomKey = `community:${room.slug}`;
                socket.join(roomKey);
                socket.emit('community:joined', { room: room.slug });

                socket.to(roomKey).emit('community:user:joined', {
                    room: room.slug,
                    user_id: String(user.id),
                    user_type: isPatientUser(user) ? 'patient' : 'staff'
                });
            } catch (error) {
                socket.emit('community:error', { message: 'Gagal bergabung room' });
            }
        });

        socket.on('community:leave', (payload) => {
            const roomSlug = normalizeText(payload?.room);
            if (!roomSlug) return;
            socket.leave(`community:${roomSlug}`);
        });

        socket.on('community:typing', (payload) => {
            const roomSlug = normalizeText(payload?.room);
            if (!roomSlug) return;
            socket.to(`community:${roomSlug}`).emit('community:typing', {
                room: roomSlug,
                user_name: payload?.user_name || 'User',
                user_id: payload?.user_id || ''
            });
        });

        socket.on('community:stop-typing', (payload) => {
            const roomSlug = normalizeText(payload?.room);
            if (!roomSlug) return;
            socket.to(`community:${roomSlug}`).emit('community:stop-typing', {
                room: roomSlug,
                user_id: payload?.user_id || ''
            });
        });
    });
};

module.exports = router;
