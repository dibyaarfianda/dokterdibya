'use strict';

const crypto = require('crypto');
const { encryptText, decryptText } = require('./AssistantDafCrypto');
const { parseScheduleMessage } = require('./AssistantDafParsing');

const sha = (value) => crypto.createHash('sha256').update(value).digest();
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const validKey = (value) => typeof value === 'string' && /^[\w:./@+-]{8,256}$/.test(value);

class AssistantDafMonitorService {
  constructor({ db, key, ownerId, ai }) {
    this.db = db;
    this.key = key;
    this.ownerId = ownerId;
    this.ai = ai;
    this.reviewRunning = false;
    const configuredLimit = Number(process.env.ASSISTANT_DAF_REVIEW_DAILY_LIMIT || 100);
    this.dailyLimit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0
      ? Math.min(configuredLimit, 10000) : 100;
  }

  async createPair() {
    const code = crypto.randomBytes(9).toString('base64url');
    await this.db.query(
      `INSERT INTO assistant_daf_monitor_pairs (code_hash, user_id, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`, [sha(code), this.ownerId]
    );
    return { code, expires_minutes: 10 };
  }

  async claim(code, label) {
    if (!/^[A-Za-z0-9_-]{12}$/.test(String(code || ''))) throw fail('Kode pemasangan tidak valid', 401);
    const deviceLabel = String(label || 'Android pendamping').trim().slice(0, 80);
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `UPDATE assistant_daf_monitor_pairs SET used_at = NOW()
         WHERE code_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at > NOW()`,
        [sha(code), this.ownerId]
      );
      if (result.affectedRows !== 1) throw fail('Kode pemasangan kedaluwarsa atau sudah dipakai', 401);
      const id = crypto.randomUUID();
      const token = crypto.randomBytes(32).toString('base64url');
      await connection.query(
        `INSERT INTO assistant_daf_monitor_devices (id, user_id, token_hash, device_label, last_seen_at)
         VALUES (?, ?, ?, ?, NOW())`, [id, this.ownerId, sha(token), deviceLabel]
      );
      await connection.commit();
      return { device_id: id, token };
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  async authenticate(authorization) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(String(authorization || ''));
    if (!match) throw fail('Perangkat belum dipasangkan', 401);
    const [rows] = await this.db.query(
      `SELECT id, user_id FROM assistant_daf_monitor_devices
       WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1`, [sha(match[1])]
    );
    if (rows.length !== 1 || rows[0].user_id !== this.ownerId) throw fail('Perangkat tidak dikenal', 401);
    return rows[0].id;
  }

  async heartbeat(deviceId) {
    await this.db.query(
      `UPDATE assistant_daf_monitor_devices SET last_seen_at = NOW()
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`, [deviceId, this.ownerId]
    );
    return { connected: true };
  }

  async discover(deviceId, chatKey, label) {
    if (!validKey(chatKey) || typeof label !== 'string' || !label.trim() || label.length > 100) {
      throw fail('Identitas chat tidak cukup jelas', 422);
    }
    const keyHash = sha(`${deviceId}:${chatKey}`);
    const [existing] = await this.db.query(
      `SELECT id FROM assistant_daf_monitor_chats WHERE device_id = ? AND chat_key_hash = ? LIMIT 1`,
      [deviceId, keyHash]
    );
    const id = existing[0]?.id || crypto.randomUUID();
    const sealed = encryptText(label.trim(), this.key, this.ownerId, `${id}:chat`);
    await this.db.query(
      `INSERT INTO assistant_daf_monitor_chats
       (id, user_id, device_id, chat_key_hash, encrypted_label, label_iv, label_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE last_seen_at = NOW()`,
      [id, this.ownerId, deviceId, keyHash, sealed.ciphertext, sealed.iv, sealed.tag]
    );
    return { discovered: true };
  }

  async allowed(deviceId, chatKey) {
    if (!validKey(chatKey)) return false;
    const [rows] = await this.db.query(
      `SELECT allowed FROM assistant_daf_monitor_chats
       WHERE device_id = ? AND chat_key_hash = ? AND user_id = ? LIMIT 1`,
      [deviceId, sha(`${deviceId}:${chatKey}`), this.ownerId]
    );
    return rows.length === 1 && rows[0].allowed === 1;
  }

  async list() {
    const [devices] = await this.db.query(
      `SELECT id, device_label, last_seen_at, created_at FROM assistant_daf_monitor_devices
       WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`, [this.ownerId]
    );
    const [chats] = await this.db.query(
      `SELECT c.* FROM assistant_daf_monitor_chats c
       JOIN assistant_daf_monitor_devices d ON d.id = c.device_id AND d.revoked_at IS NULL
       WHERE c.user_id = ? ORDER BY c.last_seen_at DESC LIMIT 200`, [this.ownerId]
    );
    return { devices, chats: chats.map((row) => ({
      id: row.id, device_id: row.device_id, allowed: row.allowed === 1,
      label: decryptText({ ciphertext: row.encrypted_label, iv: row.label_iv, tag: row.label_tag },
        this.key, this.ownerId, `${row.id}:chat`), last_seen_at: row.last_seen_at
    })) };
  }

  async setAllowed(chatId, allowed) {
    const [result] = await this.db.query(
      `UPDATE assistant_daf_monitor_chats c
       JOIN assistant_daf_monitor_devices d ON d.id = c.device_id AND d.revoked_at IS NULL
       SET c.allowed = ? WHERE c.id = ? AND c.user_id = ?`,
      [allowed ? 1 : 0, chatId, this.ownerId]
    );
    if (result.affectedRows !== 1) throw fail('Chat tidak tersedia', 404);
    return { allowed: Boolean(allowed) };
  }

  async revokeDevice(deviceId) {
    const [result] = await this.db.query(
      `UPDATE assistant_daf_monitor_devices SET revoked_at = NOW()
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`, [deviceId, this.ownerId]
    );
    if (result.affectedRows !== 1) throw fail('Perangkat tidak tersedia', 404);
    return { revoked: true };
  }

  async ingest(deviceId, { chat_key: chatKey, event_id: eventId, text, truncated }) {
    if (!validKey(chatKey) || !/^[A-Za-z0-9_.:-]{8,200}$/.test(String(eventId || ''))
      || typeof text !== 'string' || !text.trim() || text.length > 2000
      || typeof truncated !== 'boolean') throw fail('Pesan perangkat tidak valid', 422);
    const [chats] = await this.db.query(
      `SELECT id, allowed, encrypted_label, label_iv, label_tag FROM assistant_daf_monitor_chats
       WHERE device_id = ? AND chat_key_hash = ? AND user_id = ? LIMIT 1`,
      [deviceId, sha(`${deviceId}:${chatKey}`), this.ownerId]
    );
    if (chats.length !== 1 || chats[0].allowed !== 1) throw fail('Chat belum dipilih Dokter', 403);
    const id = crypto.randomUUID();
    const eventHash = sha(`${deviceId}:${eventId}`);
    const label = decryptText({ ciphertext: chats[0].encrypted_label,
      iv: chats[0].label_iv, tag: chats[0].label_tag }, this.key, this.ownerId, `${chats[0].id}:chat`);
    const proposal = parseScheduleMessage(text);
    if (truncated) proposal.needs_review = [...new Set([...(proposal.needs_review || []), 'Pratinjau pesan mungkin terpotong'])];
    const sealed = encryptText(JSON.stringify({ source_text: text, proposal,
      source_chat: label, source_chat_id: chats[0].id, truncated }), this.key, this.ownerId, id);
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const [stillAllowed] = await connection.query(
        `SELECT c.id FROM assistant_daf_monitor_chats c
         JOIN assistant_daf_monitor_devices d ON d.id = c.device_id AND d.revoked_at IS NULL
         WHERE c.id = ? AND c.user_id = ? AND c.allowed = 1 FOR UPDATE`,
        [chats[0].id, this.ownerId]
      );
      if (stillAllowed.length !== 1) throw fail('Chat sudah tidak dipantau', 403);
      await connection.query(
        `INSERT INTO assistant_daf_drafts
         (id, user_id, source_kind, encrypted_payload, payload_iv, payload_tag,
          source_expires_at, source_event_hash, ai_status)
         VALUES (?, ?, 'android_notification', ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), ?, 'pending')`,
        [id, this.ownerId, sealed.ciphertext, sealed.iv, sealed.tag, eventHash]
      );
      await connection.query(
        `INSERT INTO assistant_daf_review_jobs (draft_id, user_id) VALUES (?, ?)`, [id, this.ownerId]
      );
      await connection.query(
        `INSERT INTO assistant_daf_audit (user_id, draft_id, event_type) VALUES (?, ?, 'monitor_draft_created')`,
        [this.ownerId, id]
      );
      await connection.commit();
      setImmediate(() => { this.reviewOne().catch(() => {}); });
      return { accepted: true };
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') return { accepted: true, duplicate: true };
      throw error;
    } finally { connection.release(); }
  }

  async memory() {
    const [rows] = await this.db.query(
      `SELECT action, category, location, COUNT(*) AS observations
       FROM assistant_daf_memory WHERE user_id = ?
       GROUP BY action, category, location ORDER BY observations DESC LIMIT 20`, [this.ownerId]
    );
    return rows;
  }

  async reviewUsage() {
    const [[row]] = await this.db.query(
      `SELECT COUNT(*) AS reviewed FROM assistant_daf_review_jobs
       WHERE user_id = ? AND status = 'done' AND reviewed_at >= CURRENT_DATE()`, [this.ownerId]
    );
    return { reviewed: Number(row.reviewed) || 0, daily_limit: this.dailyLimit };
  }

  async clearMemory() {
    await this.db.query('DELETE FROM assistant_daf_memory WHERE user_id = ?', [this.ownerId]);
    return { cleared: true };
  }

  async purge() {
    await this.db.query('DELETE FROM assistant_daf_monitor_pairs WHERE expires_at < NOW() OR used_at IS NOT NULL');
    await this.db.query(
      `DELETE c FROM assistant_daf_monitor_chats c
       LEFT JOIN assistant_daf_monitor_devices d ON d.id = c.device_id
       WHERE (d.revoked_at IS NOT NULL OR d.id IS NULL)
          OR (c.allowed = 0 AND c.last_seen_at < DATE_SUB(NOW(), INTERVAL 30 DAY))`
    );
    await this.db.query(
      `DELETE j FROM assistant_daf_review_jobs j
       JOIN assistant_daf_drafts d ON d.id = j.draft_id
       WHERE d.source_expires_at < NOW()`
    );
  }

  async reviewOne() {
    if (this.reviewRunning || !this.ai?.isReady()) return false;
    this.reviewRunning = true;
    try {
      if ((await this.reviewUsage()).reviewed >= this.dailyLimit) return false;
      const [jobs] = await this.db.query(
        `SELECT draft_id FROM assistant_daf_review_jobs
         WHERE (status = 'pending' OR (status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)))
           AND next_attempt_at <= NOW() ORDER BY next_attempt_at LIMIT 1`
      );
      if (!jobs.length) return false;
      const id = jobs[0].draft_id;
      const [claim] = await this.db.query(
        `UPDATE assistant_daf_review_jobs SET status = 'processing', locked_at = NOW(), attempts = attempts + 1
         WHERE draft_id = ? AND (status = 'pending' OR (status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)))`, [id]
      );
      if (claim.affectedRows !== 1) return false;
      const [rows] = await this.db.query(
        `SELECT * FROM assistant_daf_drafts WHERE id = ? AND user_id = ?
         AND status = 'pending' AND source_expires_at > NOW() AND encrypted_payload IS NOT NULL LIMIT 1`,
        [id, this.ownerId]
      );
      if (!rows.length) {
        await this.db.query(`UPDATE assistant_daf_review_jobs SET status = 'done' WHERE draft_id = ?`, [id]);
        return false;
      }
      const row = rows[0];
      const payload = JSON.parse(decryptText({ ciphertext: row.encrypted_payload,
        iv: row.payload_iv, tag: row.payload_tag }, this.key, this.ownerId, id));
      try {
        const review = await this.ai.review(payload.source_text, await this.memory());
        const sealed = encryptText(JSON.stringify({ ...payload, ai_review: review }), this.key, this.ownerId, id);
        await this.db.query(
          `UPDATE assistant_daf_drafts SET encrypted_payload = ?, payload_iv = ?, payload_tag = ?, ai_status = 'done'
           WHERE id = ? AND user_id = ? AND status = 'pending'`,
          [sealed.ciphertext, sealed.iv, sealed.tag, id, this.ownerId]
        );
        await this.db.query(`UPDATE assistant_daf_review_jobs
          SET status = 'done', locked_at = NULL, reviewed_at = NOW() WHERE draft_id = ?`, [id]);
      } catch {
        await this.db.query(
          `UPDATE assistant_daf_review_jobs SET status = IF(attempts >= 3, 'failed', 'pending'),
             next_attempt_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE), locked_at = NULL WHERE draft_id = ?`, [id]
        );
        await this.db.query(
          `UPDATE assistant_daf_drafts SET ai_status = IF((SELECT status FROM assistant_daf_review_jobs WHERE draft_id = ?) = 'failed', 'failed', 'pending')
           WHERE id = ?`, [id, id]
        );
      }
      return true;
    } finally { this.reviewRunning = false; }
  }
}

module.exports = AssistantDafMonitorService;
