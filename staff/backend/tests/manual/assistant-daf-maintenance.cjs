const mysql = require('mysql2/promise');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const Drafts = require('../../services/AssistantDafDraftService');
const { AssistantDafPushService } = require('../../services/AssistantDafPushService');
const { version } = require('../../services/AssistantDafScheduleState');
const schema = process.env.ASSISTANT_DAF_TEST_SCHEMA;
if (!/^assistant_daf_test_[a-z0-9_]+$/.test(schema || '')) throw new Error('Explicit isolated test schema required');
(async () => {
  const db = await mysql.createConnection({ socketPath: '/run/mysqld/mysqld.sock', user: 'root', database: schema, timezone: '+07:00' });
  try {
    const owner = 'synthetic-reminder'; const key = crypto.randomBytes(32);
    await db.query("SET timestamp = UNIX_TIMESTAMP(CONCAT(CURRENT_DATE(), ' 10:00:00'))");
    const [insert] = await db.query(`INSERT INTO docboard_space_schedules
      (user_id, space, agenda, category, schedule_date, start_time, location, status)
      VALUES (?, 'tindakan', 'SYNTHETIC PRIVATE AGENDA', 'SC', DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY), '07:30', 'Melinda', 'scheduled')`, [owner]);
    const [rows] = await db.query('SELECT * FROM docboard_space_schedules WHERE id = ?', [insert.insertId]);
    await db.query(`INSERT INTO assistant_daf_reminders (schedule_id, user_id, schedule_version, reminder_at)
      VALUES (?, ?, ?, CONCAT(CURRENT_DATE(), ' 09:00:00'))`, [insert.insertId, owner, version(rows[0])]);
    const sent = [];
    const service = new AssistantDafPushService({ db, key, sender: async (subscription, payload) => { sent.push(payload); } });
    await service.register(owner, { endpoint: 'https://fcm.googleapis.com/fcm/send/SYNTHETIC-ONLY',
      keys: { auth: crypto.randomBytes(16).toString('base64url'), p256dh: crypto.randomBytes(65).toString('base64url') } });
    await service.dispatchDue(); await service.dispatchDue();
    assert.equal(sent.length, 1); assert(!sent[0].includes('PRIVATE AGENDA')); assert(!sent[0].includes('Melinda'));
    const [[reminder]] = await db.query('SELECT status FROM assistant_daf_reminders WHERE schedule_id = ?', [insert.insertId]);
    assert.equal(reminder.status, 'sent');
    const draftId = crypto.randomUUID();
    await db.query(`INSERT INTO assistant_daf_drafts (id, user_id, source_kind, encrypted_payload, payload_iv, payload_tag, source_expires_at)
      VALUES (?, ?, 'manual_share', 'expired-ciphertext', 'iv', 'tag', DATE_SUB(NOW(), INTERVAL 1 MINUTE))`, [draftId, owner]);
    await new Drafts({ db, key }).purgeExpiredSources();
    const [[expired]] = await db.query('SELECT status, encrypted_payload, payload_iv, payload_tag FROM assistant_daf_drafts WHERE id = ?', [draftId]);
    assert.deepEqual(expired, { status: 'expired', encrypted_payload: null, payload_iv: null, payload_tag: null });
    console.log('PASS H-1 claim/send once with generic payload; source expiry removes payload, nonce and tag. No external push sent.');
  } finally { await db.end(); }
})().catch((error) => { console.error(error.message); process.exit(1); });
