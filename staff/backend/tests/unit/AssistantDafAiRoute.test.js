const express = require('express');
const request = require('supertest');
const createAiRouter = require('../../routes/assistant-daf-ai');

function appWith(client) {
  const app = express();
  app.use(express.json());
  app.use('/ai', createAiRouter(client));
  return app;
}

test('discussion endpoint remains closed unless RunPod configuration is ready', async () => {
  const client = { isReady: () => false, discuss: jest.fn() };
  const result = await request(appWith(client)).post('/ai/discuss').send({ text: 'Apa jadwal besok?' });
  expect(result.status).toBe(503);
  expect(client.discuss).not.toHaveBeenCalled();
});

test('discussion returns advice only and never schedules an operation', async () => {
  const client = { isReady: () => true, discuss: jest.fn(async () => 'Periksa jam dan lokasi terlebih dahulu.') };
  const result = await request(appWith(client)).post('/ai/discuss').send({ text: 'Geser SC besok' });
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ success: true, answer: 'Periksa jam dan lokasi terlebih dahulu.' });
  expect(client.discuss).toHaveBeenCalledWith('Geser SC besok');
});

test('discussion rejects missing or oversized text before calling RunPod', async () => {
  const client = { isReady: () => true, discuss: jest.fn() };
  const app = appWith(client);
  expect((await request(app).post('/ai/discuss').send({ text: '' })).status).toBe(400);
  expect((await request(app).post('/ai/discuss').send({ text: 'x'.repeat(2001) })).status).toBe(400);
  expect(client.discuss).not.toHaveBeenCalled();
});
