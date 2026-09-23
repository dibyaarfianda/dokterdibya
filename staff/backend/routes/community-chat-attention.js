const { messageDto } = require('../services/CommunityChatAttention');

module.exports = function attachAttentionRoutes(router, { db, verifyToken, getRoomBySlug, canAccessRoom, touchRoomMember, isPatientUser }) {
    router.get('/unread', verifyToken, async (req, res) => {
        try {
            const id = String(req.user.id);
            const type = isPatientUser(req.user) ? 'patient' : 'staff';
            const [rows] = await db.query(
                `SELECT r.slug, COUNT(m.id) AS unread_count
                 FROM community_chat_rooms r
                 JOIN community_chat_attention_baseline baseline ON baseline.id = 1
                 LEFT JOIN community_chat_room_members cm ON cm.room_id = r.id AND cm.user_id = ? AND cm.user_type = ?
                 JOIN community_chat_messages m ON m.room_id = r.id
                    AND m.id > GREATEST(COALESCE(cm.last_read_message_id, 0), baseline.message_id)
                    AND NOT (m.sender_id = ? AND m.sender_type = ?)
                 WHERE r.is_archived = 0
                    AND (cm.id IS NOT NULL OR (r.is_direct = 1 AND ((r.direct_patient_id = ? AND ? = 'patient') OR (r.direct_staff_id = ? AND ? = 'staff'))))
                    AND (r.is_direct = 0 OR ? = 'staff' OR r.direct_patient_id = ?)
                 GROUP BY r.id, r.slug`, [id, type, id, type, id, type, id, type, type, id]);
            const rooms = rows.map(row => ({ slug: row.slug, unread_count: Number(row.unread_count) || 0 }));
            res.json({ success: true, rooms, total: rooms.reduce((sum, row) => sum + row.unread_count, 0) });
        } catch (error) {
            console.error('community unread error:', error);
            res.status(500).json({ success: false, message: 'Gagal memuat jumlah chat baru' });
        }
    });

    router.post('/rooms/:slug/read', verifyToken, async (req, res) => {
        try {
            const room = await getRoomBySlug(req.params.slug);
            if (!room) return res.status(404).json({ success: false, message: 'Room tidak tersedia' });
            if (!canAccessRoom(room, req.user)) return res.status(403).json({ success: false, message: 'Tidak memiliki akses' });
            const id = String(req.body.message_id || '');
            if (!/^[1-9][0-9]*$/.test(id)) return res.status(400).json({ success: false, message: 'Pesan tidak valid' });
            const [messages] = await db.query('SELECT id FROM community_chat_messages WHERE id = ? AND room_id = ?', [id, room.id]);
            if (!messages.length) return res.status(400).json({ success: false, message: 'Pesan tidak ada di room ini' });
            await touchRoomMember(room, req.user);
            await db.query(
                'UPDATE community_chat_room_members SET last_read_message_id = GREATEST(last_read_message_id, ?) WHERE room_id = ? AND user_id = ? AND user_type = ?',
                [id, room.id, String(req.user.id), isPatientUser(req.user) ? 'patient' : 'staff']);
            res.json({ success: true });
        } catch (error) {
            console.error('community read error:', error);
            res.status(500).json({ success: false, message: 'Gagal menyimpan status baca' });
        }
    });

    router.get('/rooms/:slug/messages/:id/context', verifyToken, async (req, res) => {
        try {
            const room = await getRoomBySlug(req.params.slug);
            if (!room) return res.status(404).json({ success: false, message: 'Room tidak tersedia' });
            if (!canAccessRoom(room, req.user)) return res.status(403).json({ success: false, message: 'Tidak memiliki akses' });
            const [target] = await db.query('SELECT id FROM community_chat_messages WHERE id = ? AND room_id = ?', [req.params.id, room.id]);
            if (!target.length) return res.status(404).json({ success: false, message: 'Pesan sudah dihapus atau tidak tersedia' });
            const [before] = await db.query('SELECT * FROM community_chat_messages WHERE room_id = ? AND id <= ? ORDER BY id DESC LIMIT 60', [room.id, target[0].id]);
            const [after] = await db.query('SELECT * FROM community_chat_messages WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT 60', [room.id, target[0].id]);
            const [latest] = await db.query('SELECT MAX(id) AS id FROM community_chat_messages WHERE room_id = ?', [room.id]);
            res.json({ success: true, messages: [...before.reverse(), ...after].map(messageDto), latest_message_id: latest[0].id });
        } catch (error) {
            console.error('community context error:', error);
            res.status(500).json({ success: false, message: 'Gagal memuat pesan' });
        }
    });
};
