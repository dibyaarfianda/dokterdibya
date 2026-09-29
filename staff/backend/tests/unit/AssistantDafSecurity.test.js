const crypto = require('crypto');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { requestAuditUrl } = require('../../utils/requestAudit');
const { validateSubscription, AssistantDafPushService } = require('../../services/AssistantDafPushService');
const { version } = require('../../services/AssistantDafScheduleState');
const DraftService = require('../../services/AssistantDafDraftService');

test('all assistant URLs redact search values and bearer credentials in application logs', () => {
  for (const url of ['/api/assistant-daf/patients?q=PRIVATE-NAME', '/api/assistant-daf/calendar/feed/SECRET.ics', '/api/assistant-daf/passkey/devices/SECRET']) {
    expect(requestAuditUrl({ method: 'GET', originalUrl: url })).toBe('/api/assistant-daf/[private]');
  }
});

test('push endpoint accepts only actual configured public provider hosts', () => {
  const keys = { p256dh: crypto.randomBytes(65).toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
  expect(validateSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys }).endpoint).toContain('fcm.googleapis.com');
  for (const endpoint of ['https://127.0.0.1/private', 'https://fcm.googleapis.com.evil.test/x', 'https://fcm.googleapis.com:8443/x', 'https://user@fcm.googleapis.com/x']) expect(() => validateSubscription({ endpoint, keys })).toThrow();
});

test('assistant subscriptions are encrypted and never enter DocBoard broadcast table', async () => {
  const queries = [];
  const service = new AssistantDafPushService({ db: { query: async (...args) => { queries.push(args); } }, key: crypto.randomBytes(32) });
  const endpoint = 'https://fcm.googleapis.com/fcm/send/private-device';
  await service.register('owner', { endpoint, keys: { p256dh: crypto.randomBytes(65).toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } });
  expect(JSON.stringify(queries)).not.toContain(endpoint);
  expect(JSON.stringify(queries)).not.toContain('docboard_push_tokens');
});

test('worker ignores unrelated broadcasts and never displays incoming patient content', async () => {
  const handlers = {}; const showNotification = jest.fn().mockResolvedValue(undefined);
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../../../assistant-daf/public/sw.js'), 'utf8'), {
    self: { addEventListener: (event, fn) => { handlers[event] = fn; }, registration: { showNotification } }, URL, Date
  });
  let wait;
  handlers.push({ data: { json: () => ({ body: 'PRIVATE NAME', type: 'surgery_reminder' }) }, waitUntil: (p) => { wait = p; } });
  expect(showNotification).not.toHaveBeenCalled();
  handlers.push({ data: { json: () => ({ body: 'PRIVATE NAME', type: 'assistant_daf_reminder' }) }, waitUntil: (p) => { wait = p; } });
  await wait;
  expect(JSON.stringify(showNotification.mock.calls)).not.toContain('PRIVATE NAME');
});

test('stale cancellation is rejected before any schedule write', async () => {
  const current = { id: 7, user_id: 'owner', space: 'pribadi', agenda: 'Changed agenda', schedule_date: '2026-10-10', start_time: '10:00', status: 'scheduled' };
  const connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    query: jest.fn(async (sql) => sql.includes('FROM assistant_daf_drafts') ? [[{ id: 'draft' }]] : sql.startsWith('SELECT * FROM docboard_space_schedules') ? [[current]] : (() => { throw Error('unexpected write'); })()) };
  const service = new DraftService({ db: { getConnection: async () => connection }, key: crypto.randomBytes(32) });
  await expect(service.confirmDraft('owner', 'draft', { action: 'cancel', target_schedule_id: 7, target_version: version({ ...current, agenda: 'Old agenda' }) })).rejects.toMatchObject({ statusCode: 409 });
  expect(connection.commit).not.toHaveBeenCalled();
});
