'use strict';
require('dotenv').config({ path: process.env.ASSISTANT_DAF_CONFIG_FILE || '/etc/assistant-daf/dokterdibya.env' });

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { verifyStaffToken } = require('../middleware/auth');
const { loadKey } = require('../services/AssistantDafCrypto');
const AssistantDafDraftService = require('../services/AssistantDafDraftService');
const AssistantDafPasskeyService = require('../services/AssistantDafPasskeyService');
const { buildCalendar } = require('../services/AssistantDafCalendar');
const docboardPushService = require('../services/DocBoardPushService');
const { AssistantDafPushService } = require('../services/AssistantDafPushService');
const { snapshot, version } = require('../services/AssistantDafScheduleState');
const AssistantDafContextService = require('../services/AssistantDafContextService');
const logger = require('../utils/logger');

const router = express.Router();
const OWNER_EMAIL = 'nanda.arfianda@gmail.com';
const OWNER_ID = 'UDZAQUCQWZ';
const COOKIE = 'assistant_daf_session';
let draftService;
let passkeyService;
let pushService;
const contextService = new AssistantDafContextService();
try {
  if (process.env.ASSISTANT_DAF_DATA_KEY && process.env.ASSISTANT_DAF_RP_ID && process.env.ASSISTANT_DAF_ORIGIN) {
    draftService = new AssistantDafDraftService({ db, key: loadKey(), context: contextService });
    passkeyService = new AssistantDafPasskeyService({ db, rpID: process.env.ASSISTANT_DAF_RP_ID,
      origin: process.env.ASSISTANT_DAF_ORIGIN, ownerId: OWNER_ID });
    pushService = new AssistantDafPushService({ db, key: loadKey() });
  }
} catch {
  draftService = undefined;
  passkeyService = undefined;
}

function readCookie(req) {
  const entry = String(req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  return entry ? entry.slice(COOKIE.length + 1) : '';
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict',
    secure: process.env.ASSISTANT_DAF_ORIGIN?.startsWith('https://'),
    path: '/api/assistant-daf', maxAge: 8 * 60 * 60 * 1000 });
}

function configured(req, res, next) {
  if (!draftService || !passkeyService) return res.status(503).json({ success: false, message: 'Asisten DAF belum dikonfigurasi' });
  next();
}

async function sessionOwner(req) {
  return passkeyService ? passkeyService.sessionOwner(readCookie(req)) : null;
}

async function requirePasskey(req, res, next) {
  try {
    const ownerId = await sessionOwner(req);
    if (!ownerId) return res.status(401).json({ success: false, message: 'Buka Asisten DAF dengan passkey' });
    req.assistantOwnerId = ownerId;
    next();
  } catch (error) { return respondError(res, error); }
}

async function requireRegistrationAuthority(req, res, next) {
  try {
    if (await passkeyService.hasPasskey()) return requirePasskey(req, res, next);
    return verifyStaffToken(req, res, () => {
      const owner = String(req.user?.email || '').toLowerCase() === OWNER_EMAIL
        && String(req.user?.id || '') === OWNER_ID && req.user?.user_type === 'staff';
      if (!owner) return res.status(403).json({ success: false, message: 'Confidential' });
      next();
    });
  } catch (error) { return respondError(res, error); }
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  if (req.method !== 'GET' && process.env.ASSISTANT_DAF_ORIGIN
      && req.get('origin') !== process.env.ASSISTANT_DAF_ORIGIN) {
    return res.status(403).json({ success: false, message: 'Origin tidak valid' });
  }
  next();
});
router.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
const authLimit = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

router.get('/status', (req, res) => res.json({
  success: true,
  manual_share_ready: Boolean(draftService && passkeyService),
  private_ai_ready: false,
  whatsapp_automatic_ready: false
}));

router.get('/calendar/feed/:token.ics', configured, async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return res.sendStatus(404);
  try {
    const hash = crypto.createHash('sha256').update(token).digest();
    const [keys] = await db.query(
      'SELECT user_id FROM assistant_daf_calendar_tokens WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1',
      [hash]
    );
    if (keys.length !== 1 || keys[0].user_id !== OWNER_ID) return res.sendStatus(404);
    const [schedules] = await db.query(
      `SELECT id, DATE_FORMAT(schedule_date, '%Y%m%d') AS schedule_day,
              DATE_FORMAT(start_time, '%H%i%s') AS start_clock, location
       FROM docboard_space_schedules
       WHERE user_id = ? AND space = 'tindakan' AND status NOT IN ('cancelled', 'completed', 'done')
         AND start_time IS NOT NULL AND schedule_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 1 YEAR)
       ORDER BY schedule_date, start_time LIMIT 500`, [OWNER_ID]
    );
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'inline; filename="asisten-daf.ics"');
    return res.send(buildCalendar(schedules));
  } catch (error) { return respondError(res, error); }
});

function respondError(res, error) {
  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode ? error.message : 'Operasi gagal'
  });
}

router.get('/passkey/state', configured, async (req, res) => {
  try { return res.json({ success: true, registered: await passkeyService.hasPasskey(), unlocked: Boolean(await sessionOwner(req)) }); }
  catch (error) { return respondError(res, error); }
});

router.post('/passkey/register/options', authLimit, configured, requireRegistrationAuthority, async (req, res) => {
  try { return res.json({ success: true, ...await passkeyService.registrationOptions(readCookie(req) || null) }); }
  catch (error) { return respondError(res, error); }
});

router.post('/passkey/register/verify', configured, requireRegistrationAuthority, async (req, res) => {
  try {
    setSessionCookie(res, await passkeyService.verifyRegistration(req.body?.flow_id, req.body?.response, readCookie(req) || null));
    return res.json({ success: true });
  } catch (error) { return respondError(res, error); }
});

router.post('/passkey/auth/options', authLimit, configured, async (req, res) => {
  try { return res.json({ success: true, ...await passkeyService.authenticationOptions() }); }
  catch (error) { return respondError(res, error); }
});

router.post('/passkey/auth/verify', configured, async (req, res) => {
  try {
    setSessionCookie(res, await passkeyService.verifyAuthentication(req.body?.flow_id, req.body?.response));
    return res.json({ success: true });
  } catch (error) { return respondError(res, error); }
});

router.post('/passkey/lock', configured, async (req, res) => {
  try {
    await passkeyService.revokeSession(readCookie(req));
    res.clearCookie(COOKIE, { path: '/api/assistant-daf' });
    return res.json({ success: true });
  } catch (error) { return respondError(res, error); }
});

router.use(requirePasskey);
router.use(configured);

router.get('/passkey/devices', async (req, res) => {
  try { return res.json({ success: true, devices: await passkeyService.listPasskeys() }); }
  catch (error) { return respondError(res, error); }
});

router.delete('/passkey/devices/:id', async (req, res) => {
  try {
    await passkeyService.revokePasskey(req.params.id, readCookie(req));
    res.clearCookie(COOKIE, { path: '/api/assistant-daf' });
    return res.json({ success: true });
  } catch (error) { return respondError(res, error); }
});

router.get('/push/key', (req, res) => res.json({ success: true, public_key: docboardPushService.getVapidPublicKey() }));

router.post('/push/register', async (req, res) => {
  try {
    await pushService.register(req.assistantOwnerId, req.body?.subscription);
    return res.json({ success: true });
  } catch (error) { return respondError(res, error); }
});

router.post('/push/unregister', async (req, res) => {
  try { await pushService.unregister(req.assistantOwnerId, req.body?.endpoint); return res.json({ success: true }); }
  catch (error) { return respondError(res, error); }
});

router.post('/calendar/token', async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest();
    await passkeyService.withOwnerTransaction(async (connection) => {
      await connection.query('UPDATE assistant_daf_calendar_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [OWNER_ID]);
      await connection.query('INSERT INTO assistant_daf_calendar_tokens (token_hash, user_id) VALUES (?, ?)', [hash, OWNER_ID]);
    });
    return res.json({ success: true, url: `${process.env.ASSISTANT_DAF_ORIGIN}/api/assistant-daf/calendar/feed/${token}.ics` });
  } catch (error) { return respondError(res, error); }
});

router.delete('/calendar/token', async (req, res) => {
  try {
    await passkeyService.withOwnerTransaction((connection) => connection.query('UPDATE assistant_daf_calendar_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [OWNER_ID]));
    return res.json({ success: true });
  } catch (error) { return respondError(res, error); }
});

router.post('/patients/search', async (req, res) => {
  const query = String(req.body?.q || '').trim();
  if (!/^[A-Za-z0-9./-]{2,50}$/.test(query)) return res.status(400).json({ success: false, message: 'Masukkan nomor RM lengkap, bukan nama pasien' });
  try {
    const patient = await contextService.patient(req.body?.facility, query);
    return res.json({ success: true, patients: [patient] });
  } catch (error) {
    return respondError(res, error);
  }
});

router.get('/schedules', async (req, res) => {
  try {
    const [schedules] = await db.query(
      `SELECT *
       FROM docboard_space_schedules
       WHERE user_id = ? AND status <> 'cancelled' AND schedule_date >= CURRENT_DATE()
       ORDER BY schedule_date, start_time LIMIT 100`, [req.assistantOwnerId]
    );
    return res.json({ success: true, schedules: schedules.map((row) => ({ ...snapshot(row), version: version(row) })) });
  } catch (error) {
    return respondError(res, error);
  }
});

router.get('/drafts', async (req, res) => {
  try {
    return res.json({ success: true, drafts: await draftService.listDrafts(req.assistantOwnerId) });
  } catch (error) {
    return respondError(res, error);
  }
});

router.post('/drafts', async (req, res) => {
  try {
    const draft = await draftService.createManualDraft(req.assistantOwnerId, req.body?.text);
    return res.status(201).json({ success: true, draft });
  } catch (error) {
    return respondError(res, error);
  }
});

router.post('/drafts/:id/ignore', async (req, res) => {
  try {
    return res.json({ success: true, draft: await draftService.ignoreDraft(req.assistantOwnerId, req.params.id) });
  } catch (error) {
    return respondError(res, error);
  }
});

router.post('/drafts/:id/confirm', async (req, res) => {
  try {
    return res.json({ success: true, result: await draftService.confirmDraft(req.assistantOwnerId, req.params.id, req.body) });
  } catch (error) {
    return respondError(res, error);
  }
});

if (draftService && passkeyService) {
  let running = false;
  const maintenance = async () => {
    if (running) return;
    running = true;
    try {
      await draftService.purgeExpiredSources();
      await passkeyService.purgeExpired();
      if (docboardPushService.isReady()) await pushService.dispatchDue();
    } catch { logger.error('[AssistantDAF] Maintenance failed', { code: 'ASSISTANT_MAINTENANCE_FAILED' }); }
    finally { running = false; }
  };
  const timer = setInterval(maintenance, 60 * 1000);
  timer.unref?.();
  if (process.env.NODE_ENV !== 'test') maintenance();
}

module.exports = router;
