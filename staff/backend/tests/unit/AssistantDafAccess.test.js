const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

describe('Asisten DAF access boundary', () => {
  const app = express();
  app.use('/api/assistant-daf', require('../../routes/assistant-daf'));
  const token = (claims) => jwt.sign(claims, process.env.JWT_SECRET);

  test('readiness is public but patient data requires an assistant passkey session', async () => {
    const readiness = await request(app).get('/api/assistant-daf/status');
    expect(readiness.status).toBe(200);
    const noSession = await request(app).get('/api/assistant-daf/patients?q=Sri');
    expect(noSession.status).toBe(401);
    const staffToken = await request(app).get('/api/assistant-daf/patients?q=Sri').set('Authorization', `Bearer ${token({ id: 'UDZAQUCQWZ', email: 'nanda.arfianda@gmail.com', user_type: 'staff' })}`);
    expect(staffToken.status).toBe(401);
  });

  test('rejects a patient token even with matching identity fields', async () => {
    const result = await request(app).get('/api/assistant-daf/patients?q=Sri').set('Authorization', `Bearer ${token({ id: 'UDZAQUCQWZ', email: 'nanda.arfianda@gmail.com', user_type: 'patient' })}`);
    expect(result.status).toBe(401);
  });

  test('readiness contains no patient content', async () => {
    const result = await request(app).get('/api/assistant-daf/status');
    expect(result.status).toBe(200);
    expect(result.body.private_ai_ready).toBe(false);
    expect(result.headers['cache-control']).toBe('no-store');
  });

  test('discussion requires a passkey session even when an AI endpoint exists', async () => {
    const result = await request(app).post('/api/assistant-daf/ai/discuss')
      .set('Origin', process.env.ASSISTANT_DAF_ORIGIN || 'https://dokterdibya.com')
      .send({ text: 'Apa jadwal besok?' });
    expect(result.status).toBe(401);
  });
});
