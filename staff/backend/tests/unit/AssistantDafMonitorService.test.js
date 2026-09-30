const crypto = require('crypto');
const AssistantDafMonitorService = require('../../services/AssistantDafMonitorService');
const AssistantDafRunpodClient = require('../../services/AssistantDafRunpodClient');

test('an unselected chat cannot create a draft or review job', async () => {
  const calls = [];
  const db = { query: jest.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM assistant_daf_monitor_chats')) return [[{ id: 'chat-1', allowed: 0 }]];
    throw new Error('unexpected write');
  }) };
  const service = new AssistantDafMonitorService({ db, key: crypto.randomBytes(32), ownerId: 'owner' });
  await expect(service.ingest('device-1', { chat_key: 'group@1234', event_id: 'event-1234',
    text: 'SC 03/10/2026 jam 07.30 di Melinda', truncated: false }))
    .rejects.toMatchObject({ statusCode: 403 });
  expect(calls).toHaveLength(1);
  expect(JSON.stringify(calls)).not.toContain('SC 03/10/2026');
});

test('discovery stores only an encrypted chat label and no message content', async () => {
  const calls = [];
  const db = { query: jest.fn(async (sql, params) => {
    calls.push({ sql, params });
    return sql.includes('SELECT id FROM assistant_daf_monitor_chats') ? [[]] : [{ affectedRows: 1 }];
  }) };
  const service = new AssistantDafMonitorService({ db, key: crypto.randomBytes(32), ownerId: 'owner' });
  await service.discover('device-1', 'group@1234', 'Grup IBS');
  expect(JSON.stringify(calls)).not.toContain('Grup IBS');
  await expect(service.discover('device-1', 'Grup IBS', 'Grup IBS')).rejects.toMatchObject({ statusCode: 422 });
});

test('the AI review is separate from disabled discussion and returns bounded fields', async () => {
  const fetchImpl = jest.fn(async (_url, options) => ({ ok: true, text: async () => JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ is_schedule: true, action: 'create',
      space: 'tindakan', category: 'SC', reason: 'Ada permintaan jadwal' }) } }]
  }) }));
  const client = new AssistantDafRunpodClient({ endpointId: 'testEndpoint', model: 'model', apiKey: 'secret',
    enabled: true, consent: true, fetchImpl });
  const result = await client.review('SC 03/10/2026 jam 07.30 di Melinda', [
    { action: 'create', category: 'SC', location: 'Melinda', observations: 3 }
  ]);
  expect(result).toEqual({ is_schedule: true, action: 'create', space: 'tindakan',
    category: 'SC', reason: 'Ada permintaan jadwal' });
  const request = JSON.parse(fetchImpl.mock.calls[0][1].body);
  expect(request.messages[0].content).not.toContain('03/10/2026');
  expect(request.messages[1].content).toContain('03/10/2026');
  expect(request).not.toHaveProperty('tools');
});
