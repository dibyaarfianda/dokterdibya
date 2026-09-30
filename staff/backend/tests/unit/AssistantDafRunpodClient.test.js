const AssistantDafRunpodClient = require('../../services/AssistantDafRunpodClient');

const response = (content) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ choices: [{ message: { content } }] })
});

test('RunPod connector never sends text unless both deployment and patient-data consent gates are open', async () => {
  const fetchImpl = jest.fn(async () => response('{"action":"create","space":"tindakan","category":"SC"}'));
  const config = { endpointId: 'privateEndpoint123', model: 'private-model', apiKey: 'test-only', fetchImpl };
  await expect(new AssistantDafRunpodClient(config).classify('SC besok')).rejects.toMatchObject({ statusCode: 503 });
  await expect(new AssistantDafRunpodClient({ ...config, enabled: true }).classify('SC besok')).rejects.toMatchObject({ statusCode: 503 });
  await expect(new AssistantDafRunpodClient({ ...config, consent: true }).classify('SC besok')).rejects.toMatchObject({ statusCode: 503 });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('connector uses only the fixed RunPod host and returns constrained classification without schedule or patient fields', async () => {
  const fetchImpl = jest.fn(async () => response(JSON.stringify({
    action: 'update', space: 'tindakan', category: 'SC', schedule_date: '2026-10-05',
    patient_name: 'Invented name', patient_ref_value: '12345'
  })));
  const client = new AssistantDafRunpodClient({ endpointId: 'privateEndpoint123', model: 'private-model',
    apiKey: 'test-only', enabled: true, consent: true, fetchImpl });
  await expect(client.classify('geser SC')).resolves.toEqual({ action: 'update', space: 'tindakan', category: 'SC' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://api.runpod.ai/v2/privateEndpoint123/openai/v1/chat/completions');
  expect(options.headers.Authorization).toBe('Bearer test-only');
  expect(JSON.parse(options.body).messages[1].content).toBe('geser SC');
});

test('connector rejects invalid endpoint IDs and malformed AI output before use', async () => {
  const fetchImpl = jest.fn(async () => response('{"action":"delete","space":"tindakan","category":"SC"}'));
  const config = { model: 'private-model', apiKey: 'test-only', enabled: true, consent: true, fetchImpl };
  await expect(new AssistantDafRunpodClient({ ...config, endpointId: 'abc/../../x' }).classify('SC')).rejects.toMatchObject({ statusCode: 503 });
  expect(fetchImpl).not.toHaveBeenCalled();
  await expect(new AssistantDafRunpodClient({ ...config, endpointId: 'valid123' }).classify('SC')).rejects.toMatchObject({ statusCode: 502 });
});
