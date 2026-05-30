const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { verifyToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_LOBBY_SLUG = 'lobby';
const DEFAULT_ROOM_COLOR = '#2563eb';
const MAX_ROOM_NAME = 80;
const MAX_MESSAGE_LENGTH = 2000;

let ioRef = null;
let initPromise = null;

function isPatientUser(user) {
    return user?.user_type === 'patient' || user?.role === 'patient';
}

function isStaffUser(user) {
    return !isPatientUser(user);
}

async function isVipPatient(patientId) {
    const [rows] = await db.query(
        `SELECT tier
         FROM tanya_subscriptions
         WHERE patient_id = ?
           AND is_active = TRUE
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC
         LIMIT 1`,
        [patientId]
    );

    return rows.length > 0 && String(rows[0].tier || '').toLowerCase() === 'vip';
}

async function canCreateRoom(user) {
    return !!user?.id;
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
        const ensureColumn = async (tableName, columnName, definition) => {
            const [rows] = await db.query(
                `SELECT 1
                 FROM information_schema.columns
                 WHERE table_schema = DATABASE()
                   AND table_name = ?
                   AND column_name = ?
                 LIMIT 1`,
                [tableName, columnName]
            );

            if (rows.length === 0) {
                await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
            }
        };

        const ensureIndex = async (tableName, indexName, ddl) => {
            const [rows] = await db.query(
                `SELECT 1
                 FROM information_schema.statistics
                 WHERE table_schema = DATABASE()
                   AND table_name = ?
                   AND index_name = ?
                 LIMIT 1`,
                [tableName, indexName]
            );

            if (rows.length === 0) {
                await db.query(ddl);
            }
        };

        await db.query(`
            CREATE TABLE IF NOT EXISTS community_chat_rooms (
                id INT AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(80) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                description VARCHAR(255) NULL,
                color VARCHAR(7) NOT NULL DEFAULT '#2563eb',
                created_by VARCHAR(64) NULL,
                created_by_type ENUM('patient', 'staff') NULL,
                is_direct TINYINT(1) NOT NULL DEFAULT 0,
                direct_patient_id VARCHAR(64) NULL,
                direct_staff_id VARCHAR(64) NULL,
                is_system TINYINT(1) NOT NULL DEFAULT 0,
                is_archived TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_active (is_archived, updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await ensureColumn('community_chat_rooms', 'is_direct', 'is_direct TINYINT(1) NOT NULL DEFAULT 0 AFTER created_by_type');
        await ensureColumn('community_chat_rooms', 'direct_patient_id', 'direct_patient_id VARCHAR(64) NULL AFTER is_direct');
        await ensureColumn('community_chat_rooms', 'direct_staff_id', 'direct_staff_id VARCHAR(64) NULL AFTER direct_patient_id');

        await ensureIndex(
            'community_chat_rooms',
            'idx_direct_patient',
            'CREATE INDEX idx_direct_patient ON community_chat_rooms (direct_patient_id, is_archived)'
        );
        await ensureIndex(
            'community_chat_rooms',
            'idx_direct_staff',
            'CREATE INDEX idx_direct_staff ON community_chat_rooms (direct_staff_id, is_archived)'
        );

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

        await db.query(`
            CREATE TABLE IF NOT EXISTS community_chat_room_members (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                room_id INT NOT NULL,
                user_id VARCHAR(64) NOT NULL,
                user_type ENUM('patient', 'staff') NOT NULL,
                display_name VARCHAR(255) NOT NULL,
                avatar_url TEXT NULL,
                first_joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_room_user (room_id, user_id, user_type),
                INDEX idx_room_seen (room_id, last_seen_at),
                CONSTRAINT fk_community_chat_room_members_room
                    FOREIGN KEY (room_id) REFERENCES community_chat_rooms(id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.query(`
            INSERT INTO community_chat_room_members
                (room_id, user_id, user_type, display_name, avatar_url, first_joined_at, last_seen_at)
            SELECT
                m.room_id,
                m.sender_id,
                m.sender_type,
                COALESCE(NULLIF(MAX(m.sender_nickname), ''), MAX(m.sender_name), 'User') AS display_name,
                MAX(m.sender_avatar) AS avatar_url,
                MIN(m.created_at) AS first_joined_at,
                MAX(m.created_at) AS last_seen_at
            FROM community_chat_messages m
            GROUP BY m.room_id, m.sender_id, m.sender_type
            ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name),
                avatar_url = COALESCE(VALUES(avatar_url), avatar_url),
                last_seen_at = GREATEST(last_seen_at, VALUES(last_seen_at))
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
        `SELECT r.id, r.slug, r.name, r.description, r.color, r.is_system, r.is_archived, r.created_by, r.created_by_type,
            r.is_direct, r.direct_patient_id, r.direct_staff_id,
                p.full_name AS direct_patient_name,
                u.name AS direct_staff_name,
            (SELECT COUNT(*) FROM community_chat_room_members cm WHERE cm.room_id = r.id) AS member_count,
            r.created_at, r.updated_at
         FROM community_chat_rooms r
         LEFT JOIN patients p ON p.id = r.direct_patient_id
         LEFT JOIN users u ON u.new_id = r.direct_staff_id
         WHERE r.slug = ? AND r.is_archived = 0
         LIMIT 1`,
        [slug]
    );
    return rows[0] || null;
}

async function findActiveDirectRoom(staffUserId, patientId) {
    const [rows] = await db.query(
        `SELECT slug
         FROM community_chat_rooms
         WHERE is_archived = 0
           AND is_direct = 1
           AND direct_staff_id = ?
           AND direct_patient_id = ?
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
        [staffUserId, patientId]
    );

    if (rows.length === 0) return null;
    return getRoomBySlug(rows[0].slug);
}

function getRoomDisplayMeta(row, currentUserType, currentUserId) {
    if (Number(row.is_direct) !== 1) {
        return {
            name: row.name,
            description: row.description || '',
            counterpart_name: null
        };
    }

    if (currentUserType === 'patient') {
        const staffName = row.direct_staff_name || 'Staff dokterDIBYA';
        return {
            name: `Chat dengan ${staffName}`,
            description: 'Percakapan pribadi dengan staff',
            counterpart_name: staffName
        };
    }

    if (String(row.direct_staff_id || '') === String(currentUserId || '')) {
        const patientName = row.direct_patient_name || `Pasien ${row.direct_patient_id || ''}`.trim();
        return {
            name: patientName,
            description: 'Percakapan pribadi dengan pasien',
            counterpart_name: patientName
        };
    }

    return {
        name: row.name || 'Chat Pasien',
        description: row.description || 'Percakapan pribadi',
        counterpart_name: null
    };
}

function canAccessRoom(room, user) {
    if (!room) return false;
    if (Number(room.is_direct) !== 1) return true;

    const userId = String(user.id);
    if (isPatientUser(user)) {
        return String(room.direct_patient_id || '') === userId;
    }

    return String(room.direct_staff_id || '') === userId;
}

async function resolveUserIdentity(user) {
    const userId = String(user.id);
    const userType = isPatientUser(user) ? 'patient' : 'staff';

    let defaultName = user.name || user.full_name || user.email || 'User';

    if (userType === 'patient') {
        const [rows] = await db.query(
            'SELECT full_name FROM patients WHERE id = ? LIMIT 1',
            [userId]
        );
        if (rows.length > 0) {
            defaultName = rows[0].full_name || defaultName;
        }
    } else {
        const [rows] = await db.query(
            'SELECT name FROM users WHERE new_id = ? LIMIT 1',
            [userId]
        );
        if (rows.length > 0) {
            defaultName = rows[0].name || defaultName;
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
        avatarUrl: profile?.avatar_url || null,
        profileVisible: profile ? profile.profile_visible === 1 : true
    };
}

async function touchRoomMember(room, user, identity = null) {
    if (!room || !user?.id) return null;

    const resolved = identity || await resolveUserIdentity(user);
    const displayName = resolved.nickname || resolved.defaultName || 'User';

    await db.query(
        `INSERT INTO community_chat_room_members
            (room_id, user_id, user_type, display_name, avatar_url)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            display_name = VALUES(display_name),
            avatar_url = VALUES(avatar_url),
            last_seen_at = CURRENT_TIMESTAMP`,
        [room.id, resolved.userId, resolved.userType, displayName, resolved.avatarUrl]
    );

    return {
        user_id: resolved.userId,
        user_type: resolved.userType,
        display_name: displayName,
        avatar_url: resolved.avatarUrl
    };
}

async function getReadableProfile(userId, userType) {
    let defaultName = 'User';

    if (userType === 'patient') {
        const [rows] = await db.query('SELECT full_name FROM patients WHERE id = ? LIMIT 1', [userId]);
        if (rows.length > 0) {
            defaultName = rows[0].full_name || defaultName;
        }
    } else {
        const [rows] = await db.query(
            `SELECT u.name, r.display_name AS role_display_name
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE u.new_id = ? LIMIT 1`,
            [userId]
        );
        if (rows.length > 0) {
            defaultName = rows[0].name || defaultName;
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
        avatar_url: profile?.avatar_url || null,
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

function mapRoom(row, currentUserType, currentUserId) {
    const displayMeta = getRoomDisplayMeta(row, currentUserType, currentUserId);
    return {
        id: row.id,
        slug: row.slug,
        name: displayMeta.name,
        description: displayMeta.description,
        color: row.color || DEFAULT_ROOM_COLOR,
        is_system: row.is_system === 1,
        is_direct: Number(row.is_direct) === 1,
        direct_patient_id: row.direct_patient_id || null,
        direct_staff_id: row.direct_staff_id || null,
        counterpart_name: displayMeta.counterpart_name,
        can_archive: Number(row.is_direct) === 1 && currentUserType === 'staff' && String(row.direct_staff_id || '') === String(currentUserId || ''),
        created_by: row.created_by,
        created_by_type: row.created_by_type,
        is_owner: row.created_by && row.created_by === currentUserId && row.created_by_type === currentUserType,
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
        const canCreate = await canCreateRoom(req.user);
        const isVip = isPatientUser(req.user) ? await isVipPatient(userId) : null;
        const accessClause = userType === 'patient'
            ? '(r.is_direct = 0 OR r.direct_patient_id = ?)'
            : '(r.is_direct = 0 OR r.direct_staff_id = ?)';

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
                r.is_direct,
                r.direct_patient_id,
                r.direct_staff_id,
                p.full_name AS direct_patient_name,
                u.name AS direct_staff_name,
                r.created_at,
                r.updated_at,
                MAX(m.created_at) AS last_message_at,
                COUNT(DISTINCT room_member.id) AS member_count,
                ? AS current_user_id
            FROM community_chat_rooms r
            LEFT JOIN community_chat_messages m ON m.room_id = r.id
            LEFT JOIN community_chat_room_members room_member ON room_member.room_id = r.id
            LEFT JOIN patients p ON p.id = r.direct_patient_id
            LEFT JOIN users u ON u.new_id = r.direct_staff_id
            WHERE r.is_archived = 0
              AND ${accessClause}
            GROUP BY
                r.id,
                r.slug,
                r.name,
                r.description,
                r.color,
                r.is_system,
                r.created_by,
                r.created_by_type,
                r.is_direct,
                r.direct_patient_id,
                r.direct_staff_id,
                p.full_name,
                u.name,
                r.created_at,
                r.updated_at
            ORDER BY (r.slug = ?) DESC, COALESCE(MAX(m.created_at), r.created_at) DESC`,
            [userId, userId, DEFAULT_LOBBY_SLUG]
        );

        res.json({
            success: true,
            rooms: rows.map((row) => mapRoom(row, userType, userId)),
            permissions: {
                can_create_room: canCreate,
                is_vip: isVip
            }
        });
    } catch (error) {
        console.error('community rooms error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat room chat' });
    }
});

router.post('/rooms', verifyToken, async (req, res) => {
    try {
        const allowedCreate = await canCreateRoom(req.user);
        if (!allowedCreate) {
            return res.status(403).json({
                success: false,
                message: 'Anda belum memiliki akses untuk membuat room'
            });
        }

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
    await touchRoomMember(room, req.user);
        emitRoomListChanged();

        res.json({ success: true, room });
    } catch (error) {
        console.error('community create room error:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat room' });
    }
});

router.post('/rooms/direct', verifyToken, async (req, res) => {
    try {
        if (!isStaffUser(req.user)) {
            return res.status(403).json({ success: false, message: 'Hanya staff yang bisa memulai chat pasien' });
        }

        const staffUserId = String(req.user.id);
        const patientId = normalizeText(req.body.patient_id);
        const openingMessage = normalizeText(req.body.opening_message).slice(0, MAX_MESSAGE_LENGTH);

        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID wajib diisi' });
        }

        const [patientRows] = await db.query(
            'SELECT id, full_name FROM patients WHERE id = ? LIMIT 1',
            [patientId]
        );

        if (patientRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Pasien tidak ditemukan' });
        }

        let room = await findActiveDirectRoom(staffUserId, patientId);

        if (!room) {
            const slug = `direct-${staffUserId}-${patientId}-${Math.random().toString(36).slice(2, 8)}`;
            await db.query(
                `INSERT INTO community_chat_rooms
                    (slug, name, description, color, created_by, created_by_type, is_direct, direct_patient_id, direct_staff_id, is_system)
                 VALUES (?, ?, ?, ?, ?, 'staff', 1, ?, ?, 0)`,
                [
                    slug,
                    `Chat Pasien ${patientRows[0].full_name}`,
                    'Percakapan pribadi staff dan pasien',
                    '#16a34a',
                    staffUserId,
                    patientId,
                    staffUserId
                ]
            );

            room = await getRoomBySlug(slug);
            emitRoomListChanged();
        }

        if (openingMessage) {
            const identity = await resolveUserIdentity(req.user);
            await db.query(
                `INSERT INTO community_chat_messages
                    (room_id, sender_id, sender_type, sender_name, sender_nickname, sender_avatar, message)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    room.id,
                    identity.userId,
                    identity.userType,
                    identity.defaultName,
                    identity.nickname,
                    identity.avatarUrl,
                    mapEmoticonToEmoji(openingMessage)
                ]
            );
        }

        await touchRoomMember(room, req.user);

        const mappedRoom = mapRoom(room, 'staff', staffUserId);
        res.json({ success: true, room: mappedRoom });
    } catch (error) {
        console.error('community create direct room error:', error);
        res.status(500).json({ success: false, message: 'Gagal memulai chat pasien' });
    }
});

router.get('/rooms/:slug/messages', verifyToken, async (req, res) => {
    try {
        const room = await getRoomBySlug(req.params.slug);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room tidak ditemukan' });
        }

        if (!canAccessRoom(room, req.user)) {
            return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke room ini' });
        }

        await touchRoomMember(room, req.user);
        const roomForResponse = await getRoomBySlug(req.params.slug);

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
            room: mapRoom(roomForResponse || room, isPatientUser(req.user) ? 'patient' : 'staff', String(req.user.id)),
            messages: rows.reverse()
        });
    } catch (error) {
        console.error('community messages error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat pesan' });
    }
});

router.get('/rooms/:slug/members', verifyToken, async (req, res) => {
    try {
        const room = await getRoomBySlug(req.params.slug);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room tidak ditemukan' });
        }

        if (!canAccessRoom(room, req.user)) {
            return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke room ini' });
        }

        await touchRoomMember(room, req.user);

        const [rows] = await db.query(
            `SELECT
                member.user_id,
                member.user_type,
                member.display_name,
                member.avatar_url,
                member.first_joined_at,
                member.last_seen_at,
                COALESCE(stats.message_count, 0) AS message_count,
                stats.last_message_at
             FROM community_chat_room_members member
             LEFT JOIN (
                SELECT sender_id, sender_type, COUNT(*) AS message_count, MAX(created_at) AS last_message_at
                FROM community_chat_messages
                WHERE room_id = ?
                GROUP BY sender_id, sender_type
             ) stats ON stats.sender_id = member.user_id AND stats.sender_type = member.user_type
             WHERE member.room_id = ?
             ORDER BY COALESCE(stats.last_message_at, member.last_seen_at, member.first_joined_at) DESC, member.display_name ASC`,
            [room.id, room.id]
        );

        res.json({
            success: true,
            room: mapRoom(await getRoomBySlug(req.params.slug) || room, isPatientUser(req.user) ? 'patient' : 'staff', String(req.user.id)),
            members: rows,
            summary: {
                total_members: rows.length,
                staff_count: rows.filter((member) => member.user_type === 'staff').length,
                patient_count: rows.filter((member) => member.user_type === 'patient').length
            }
        });
    } catch (error) {
        console.error('community members error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat anggota room' });
    }
});

router.post('/rooms/:slug/messages', verifyToken, async (req, res) => {
    try {
        const room = await getRoomBySlug(req.params.slug);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room tidak ditemukan' });
        }

        if (!canAccessRoom(room, req.user)) {
            return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke room ini' });
        }

        const rawMessage = normalizeText(req.body.message);
        if (!rawMessage) {
            return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });
        }

        const messageText = mapEmoticonToEmoji(rawMessage).slice(0, MAX_MESSAGE_LENGTH);
        const identity = await resolveUserIdentity(req.user);
        const senderName = identity.defaultName;
        await touchRoomMember(room, req.user, identity);

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

        if (!canAccessRoom(room, req.user)) {
            return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke room ini' });
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
        const nickname = normalizeText(req.body.nickname);
        const bio = normalizeText(req.body.bio);
        const profileVisible = req.body.profile_visible === false ? 0 : 1;

        if (nickname || bio) {
            return res.status(403).json({
                success: false,
                message: 'Nickname dan bio tidak dapat diubah.'
            });
        }

        await db.query(
            `INSERT INTO community_chat_profiles (user_id, user_type, nickname, bio, profile_visible)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                nickname = VALUES(nickname),
                bio = VALUES(bio),
                profile_visible = VALUES(profile_visible),
                updated_at = CURRENT_TIMESTAMP`,
            [userId, userType, null, null, profileVisible]
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

        if (Number(room.is_direct) === 1) {
            return res.status(400).json({ success: false, message: 'Chat pribadi tidak menggunakan moderator room' });
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

router.get('/admin/patient-users', verifyToken, async (req, res) => {
    try {
        if (!isStaffUser(req.user)) {
            return res.status(403).json({ success: false, message: 'Hanya staff yang bisa memulai chat pasien' });
        }

        const search = `%${normalizeText(req.query.q).slice(0, 60)}%`;
        const [rows] = await db.query(
            `SELECT id, full_name, phone, email
             FROM patients
             WHERE (? = '%%' OR id LIKE ? OR full_name LIKE ? OR phone LIKE ? OR email LIKE ?)
             ORDER BY full_name ASC
             LIMIT 20`,
            [search, search, search, search, search]
        );

        res.json({ success: true, patients: rows });
    } catch (error) {
        console.error('community patient users error:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat daftar pasien' });
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

        if (Number(room.is_direct) === 1) {
            return res.status(400).json({ success: false, message: 'Chat pribadi tidak menggunakan moderator room' });
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

router.post('/rooms/:slug/archive', verifyToken, async (req, res) => {
    try {
        const room = await getRoomBySlug(req.params.slug);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room tidak ditemukan' });
        }

        if (Number(room.is_direct) !== 1) {
            return res.status(400).json({ success: false, message: 'Hanya chat pribadi yang dapat diakhiri dari menu ini' });
        }

        if (!isStaffUser(req.user) || String(room.direct_staff_id || '') !== String(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Hanya staff pembuka chat yang dapat mengakhiri percakapan' });
        }

        await router.archiveRoom(room.slug);
        res.json({ success: true, message: 'Percakapan diakhiri oleh staff' });
    } catch (error) {
        console.error('community archive direct room error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengakhiri percakapan' });
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

                await ensureSchema();
                const user = jwt.verify(token, JWT_SECRET);
                const room = await getRoomBySlug(roomSlug);
                if (!room || !canAccessRoom(room, user)) return;

                const roomKey = `community:${room.slug}`;
                socket.data.communityRooms = socket.data.communityRooms || new Set();
                socket.data.communityRooms.add(room.slug);
                socket.join(roomKey);
                await touchRoomMember(room, user);
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
            if (socket.data.communityRooms) {
                socket.data.communityRooms.delete(roomSlug);
            }
            socket.leave(`community:${roomSlug}`);
        });

        socket.on('community:typing', (payload) => {
            const roomSlug = normalizeText(payload?.room);
            if (!roomSlug) return;
            if (!socket.data.communityRooms || !socket.data.communityRooms.has(roomSlug)) return;
            socket.to(`community:${roomSlug}`).emit('community:typing', {
                room: roomSlug,
                user_name: payload?.user_name || 'User',
                user_id: payload?.user_id || ''
            });
        });

        socket.on('community:stop-typing', (payload) => {
            const roomSlug = normalizeText(payload?.room);
            if (!roomSlug) return;
            if (!socket.data.communityRooms || !socket.data.communityRooms.has(roomSlug)) return;
            socket.to(`community:${roomSlug}`).emit('community:stop-typing', {
                room: roomSlug,
                user_id: payload?.user_id || ''
            });
        });
    });
};

module.exports = router;
