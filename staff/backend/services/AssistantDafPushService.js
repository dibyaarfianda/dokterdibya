'use strict';
const crypto = require('crypto');
const webpush = require('web-push');
const { encryptText, decryptText } = require('./AssistantDafCrypto');
const { version, day } = require('./AssistantDafScheduleState');

function validateSubscription(value) {
  const endpoint = new URL(String(value?.endpoint || ''));
  const hosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password
    || endpoint.hash || !hosts.includes(endpoint.hostname) || endpoint.href.length > 2000) throw new Error('PUSH_ENDPOINT_TIDAK_VALID');
  const { p256dh, auth } = value?.keys || {};
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh || '') || Buffer.from(p256dh, 'base64url').length !== 65
    || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth || '') || Buffer.from(auth, 'base64url').length !== 16) throw new Error('PUSH_KEY_TIDAK_VALID');
  return { endpoint: endpoint.href, keys: { p256dh, auth } };
}

class AssistantDafPushService {
  constructor({ db, key, sender = webpush.sendNotification.bind(webpush) }) { Object.assign(this, { db, key, sender }); }
  async register(ownerId, input) {
    let subscription;
    try { subscription = validateSubscription(input); }
    catch { throw Object.assign(new Error('Langganan push tidak valid'), { statusCode: 400 }); }
    const hash = crypto.createHash('sha256').update(subscription.endpoint).digest();
    const sealed = encryptText(JSON.stringify(subscription), this.key, ownerId, `push:${hash.toString('hex')}`);
    await this.db.query(`INSERT INTO assistant_daf_push_subscriptions
      (user_id, endpoint_hash, encrypted_payload, payload_iv, payload_tag) VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE encrypted_payload = VALUES(encrypted_payload), payload_iv = VALUES(payload_iv), payload_tag = VALUES(payload_tag)`,
    [ownerId, hash, sealed.ciphertext, sealed.iv, sealed.tag]);
  }
  async unregister(ownerId, endpoint) {
    const hash = crypto.createHash('sha256').update(String(endpoint || '')).digest();
    await this.db.query('DELETE FROM assistant_daf_push_subscriptions WHERE user_id = ? AND endpoint_hash = ?', [ownerId, hash]);
  }
  async dispatchDue() {
    await this.db.query(`UPDATE assistant_daf_reminders r JOIN docboard_space_schedules s ON s.id = r.schedule_id
      SET r.reminder_at = DATE_SUB(CONCAT(s.schedule_date, ' 09:00:00'), INTERVAL 1 DAY), r.status = 'scheduled', r.attempts = 0
      WHERE r.status IN ('scheduled', 'sent') AND s.status NOT IN ('cancelled', 'completed')
        AND r.reminder_at <> DATE_SUB(CONCAT(s.schedule_date, ' 09:00:00'), INTERVAL 1 DAY)`);
    // Claim is atomic across PM2 workers; stale deliveries may retry with the same browser tag.
    await this.db.query(`UPDATE assistant_daf_reminders SET status = 'scheduled'
      WHERE status = 'sending' AND claimed_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`);
    const [due] = await this.db.query(`SELECT r.schedule_id, r.user_id, r.schedule_version, r.attempts FROM assistant_daf_reminders r
      WHERE r.status = 'scheduled' AND r.reminder_at <= NOW() AND r.attempts < 3 ORDER BY r.reminder_at LIMIT 25`);
    for (const reminder of due) {
      const [claimed] = await this.db.query(`UPDATE assistant_daf_reminders SET status = 'sending', claimed_at = NOW(), attempts = attempts + 1
        WHERE schedule_id = ? AND status = 'scheduled' AND schedule_version = ?`, [reminder.schedule_id, reminder.schedule_version]);
      if (!claimed.affectedRows) continue;
      const [schedules] = await this.db.query('SELECT * FROM docboard_space_schedules WHERE id = ? AND user_id = ?', [reminder.schedule_id, reminder.user_id]);
      const schedule = schedules[0];
      const today = day(new Date());
      if (!schedule || schedule.space !== 'tindakan' || ['cancelled', 'completed', 'done'].includes(schedule.status) || day(schedule.schedule_date) <= today) {
        await this.finish(reminder, 'cancelled'); continue;
      }
      if (version(schedule) !== reminder.schedule_version) {
        await this.db.query(`UPDATE assistant_daf_reminders SET status = 'scheduled', attempts = 0, schedule_version = ?,
          reminder_at = DATE_SUB(CONCAT(?, ' 09:00:00'), INTERVAL 1 DAY) WHERE schedule_id = ? AND schedule_version = ?`,
        [version(schedule), day(schedule.schedule_date), reminder.schedule_id, reminder.schedule_version]);
        continue;
      }
      const [subscriptions] = await this.db.query('SELECT * FROM assistant_daf_push_subscriptions WHERE user_id = ?', [reminder.user_id]);
      let sent = 0;
      for (const row of subscriptions) {
        try {
          const subscription = JSON.parse(decryptText({ ciphertext: row.encrypted_payload, iv: row.payload_iv, tag: row.payload_tag },
            this.key, row.user_id, `push:${row.endpoint_hash.toString('hex')}`));
          validateSubscription(subscription);
          await this.sender(subscription, JSON.stringify({ type: 'assistant_daf_reminder', tag: `assistant-daf-${reminder.schedule_id}` }), { TTL: 3600, timeout: 10000 });
          sent++;
        } catch (error) {
          if ([404, 410].includes(error.statusCode)) await this.db.query('DELETE FROM assistant_daf_push_subscriptions WHERE id = ?', [row.id]);
        }
      }
      await this.finish(reminder, sent ? 'sent' : Number(reminder.attempts) >= 2 ? 'failed' : 'scheduled');
    }
  }
  async finish(reminder, status) {
    await this.db.query(`UPDATE assistant_daf_reminders SET status = ?, sent_at = IF(? = 'sent', NOW(), sent_at)
      WHERE schedule_id = ? AND schedule_version = ? AND status = 'sending'`,
    [status, status, reminder.schedule_id, reminder.schedule_version]);
  }
}
module.exports = { AssistantDafPushService, validateSubscription };
