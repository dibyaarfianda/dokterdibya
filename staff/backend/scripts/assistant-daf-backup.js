'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const DIRECTORY = '/var/backups/assistant-daf';
const KEY = '/etc/assistant-daf/backup.key';
const OWNER = 'UDZAQUCQWZ';
const tables = ['assistant_daf_owner_state', 'assistant_daf_drafts', 'assistant_daf_audit',
  'assistant_daf_passkeys', 'assistant_daf_push_subscriptions', 'assistant_daf_reminders',
  'assistant_daf_monitor_devices', 'assistant_daf_monitor_chats', 'assistant_daf_memory',
  'docboard_space_schedules'];

(async () => {
  const key = await fs.readFile(KEY);
  if (key.length !== 32) throw new Error('Invalid backup key');
  if (process.argv[2] === '--verify') {
    const file = path.resolve(process.argv[3] || '');
    if (path.dirname(file) !== DIRECTORY || !/\.dafenc$/.test(file)) throw new Error('Invalid backup path');
    const data = await fs.readFile(file);
    if (data.subarray(0, 4).toString() !== 'DAF1') throw new Error('Invalid backup format');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(4, 16));
    decipher.setAAD(Buffer.from('assistant-daf-backup-v1'));
    decipher.setAuthTag(data.subarray(-16));
    const snapshot = JSON.parse(Buffer.concat([decipher.update(data.subarray(16, -16)), decipher.final()]));
    if (snapshot.tables.assistant_daf_drafts.some((row) => row.encrypted_payload !== null)) throw new Error('Source retention violation');
    console.log(JSON.stringify({ verified: true, tables: Object.keys(snapshot.tables).length, sources_included: false }));
    return;
  }
  await fs.mkdir(DIRECTORY, { recursive: true, mode: 0o700 });
  const db = await mysql.createConnection({ socketPath: '/run/mysqld/mysqld.sock', user: 'root', database: 'dibyaklinik', timezone: '+07:00' });
  let document;
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    document = { version: 1, createdAt: new Date().toISOString(), tables: {} };
    for (const table of tables) {
      const [rows] = await db.query(`SELECT * FROM ${table} WHERE user_id = ?`, [OWNER]);
      document.tables[table] = table === 'assistant_daf_drafts' ? rows.map((row) => ({ ...row,
        encrypted_payload: null, payload_iv: null, payload_tag: null, status: row.status === 'pending' ? 'expired' : row.status })) : rows;
    }
    await db.commit();
  } finally { await db.end(); }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('assistant-daf-backup-v1'));
  const encrypted = Buffer.concat([Buffer.from('DAF1'), iv, cipher.update(JSON.stringify(document)), cipher.final(), cipher.getAuthTag()]);
  const filename = path.join(DIRECTORY, `${new Date().toISOString().replace(/[:.]/g, '-')}.dafenc`);
  await fs.writeFile(filename, encrypted, { mode: 0o600, flag: 'wx' });
  for (const entry of await fs.readdir(DIRECTORY)) {
    if (!/^\d{4}-\d{2}-\d{2}T[0-9TZ-]+\.dafenc$/.test(entry)) continue;
    const candidate = path.join(DIRECTORY, entry);
    if (Date.now() - (await fs.stat(candidate)).mtimeMs > 7 * 86400000) await fs.unlink(candidate);
  }
  console.log('Encrypted assistant backup created; sources excluded.');
})().catch(() => { console.error('ASSISTANT_BACKUP_FAILED'); process.exitCode = 1; });
