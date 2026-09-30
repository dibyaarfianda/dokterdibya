const express = require('express');
const request = require('supertest');

process.env.ASSISTANT_DAF_DATA_KEY = Buffer.alloc(32, 1).toString('base64');
process.env.ASSISTANT_DAF_RP_ID = 'dokterdibya.com';
process.env.ASSISTANT_DAF_ORIGIN = 'https://dokterdibya.com';

jest.mock('../../services/AssistantDafRunpodClient', () => ({
  fromEnvironment: jest.fn(() => ({ isReady: () => true, discuss: jest.fn() }))
}));

const app = express();
app.use('/api/assistant-daf', require('../../routes/assistant-daf'));

test('ready AI is reported but discussion is still behind the passkey boundary', async () => {
  const status = await request(app).get('/api/assistant-daf/status');
  expect(status.body.private_ai_ready).toBe(true);
  const protectedRoute = await request(app).post('/api/assistant-daf/ai/discuss')
    .set('Origin', process.env.ASSISTANT_DAF_ORIGIN || 'https://dokterdibya.com')
    .send({ text: 'Halo' });
  expect(protectedRoute.status).toBe(401);
});
