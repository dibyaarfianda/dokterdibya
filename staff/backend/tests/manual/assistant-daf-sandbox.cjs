const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const express = require('express');
const jwt = require('jsonwebtoken');
const root = path.resolve(__dirname, '../..');
const schema = process.env.ASSISTANT_DAF_TEST_SCHEMA;
if (!/^assistant_daf_test_[a-z0-9_]+$/.test(schema || '')) throw new Error('Explicit isolated test schema required');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.ASSISTANT_DAF_DATA_KEY = crypto.randomBytes(32).toString('base64');
process.env.ASSISTANT_DAF_RP_ID = 'localhost';
process.env.ASSISTANT_DAF_ORIGIN = 'http://localhost:4179';
const mockModule = (file, exports) => { require.cache[require.resolve(path.join(root, file))] = { exports }; };

(async () => {
  const admin = await mysql.createConnection({ socketPath: '/run/mysqld/mysqld.sock', user: 'root', multipleStatements: true });
  await admin.query(`CREATE DATABASE ${schema}`);
  await admin.query(`CREATE TABLE ${schema}.docboard_space_schedules LIKE dibyaklinik.docboard_space_schedules`);
  await admin.query(`CREATE TABLE ${schema}.surgery_schedules LIKE dibyaklinik.surgery_schedules`);
  await admin.query(`USE ${schema}`);
  await admin.query(fs.readFileSync(path.join(root, 'migrations/20260929_assistant_daf_phase1.sql'), 'utf8'));
  await admin.end();
  const pool = mysql.createPool({ socketPath: '/run/mysqld/mysqld.sock', user: 'root', database: schema, timezone: '+07:00' });
  mockModule('db.js', pool);
  mockModule('utils/logger.js', { info() {}, warn() {}, error() {}, debug() {} });
  mockModule('services/DocBoardPushService.js', { getVapidPublicKey: () => null, isReady: () => false });
  mockModule('services/AssistantDafContextService.js', class {
    async patient(facility, mr) {
      if (!['TEST01', 'TEST02'].includes(mr)) throw Object.assign(new Error('Nomor RM sintetis tidak ditemukan'), { statusCode: 422 });
      return { id: mr, full_name: 'Pasien Sintetis Sama Nama', facility, hospital_mr_id: mr };
    }
  });
  const app = express(); app.use(express.json());
  app.get('/_fixture/token', (req, res) => res.json({ token: jwt.sign({ id: 'UDZAQUCQWZ', email: 'nanda.arfianda@gmail.com', user_type: 'staff' }, process.env.JWT_SECRET, { expiresIn: '1h' }) }));
  app.post('/_fixture/expire', async (req, res) => { await pool.query('UPDATE assistant_daf_sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE)'); res.json({ ok: true }); });
  app.get('/_fixture/summary', async (req, res) => {
    const [schedules] = await pool.query('SELECT id, agenda, patient_name, patient_ref_value, status FROM docboard_space_schedules');
    const [drafts] = await pool.query('SELECT encrypted_payload, status FROM assistant_daf_drafts');
    const [audit] = await pool.query('SELECT encrypted_payload, event_type FROM assistant_daf_audit');
    res.json({ schedules, drafts, audit });
  });
  app.use('/api/assistant-daf', require(path.join(root, 'routes/assistant-daf')));
  app.get('/assistant-daf/docboard-session.js', (req, res) => res.sendFile(path.resolve(root, '../../public/scripts/docboard-session.js')));
  app.use('/assistant-daf', (req, res, next) => { res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; form-action 'self'; object-src 'none'"); next(); }, express.static(path.resolve(root, '../../assistant-daf/public')));
  const server = app.listen(4179, '127.0.0.1', () => console.log('Synthetic sandbox ready; no production rows copied.'));
  const stop = () => server.close(async () => { await pool.end(); process.exit(0); });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
})().catch((error) => { console.error(error.code || error.message); process.exit(1); });
