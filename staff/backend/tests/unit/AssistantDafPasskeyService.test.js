const crypto = require('crypto');
jest.mock('@simplewebauthn/server', () => ({ verifyAuthenticationResponse: jest.fn(async () => ({ verified: true, authenticationInfo: { newCounter: 1 } })) }));
const AssistantDafPasskeyService = require('../../services/AssistantDafPasskeyService');

describe('Asisten DAF passkey session', () => {
  test('hashes a random session secret and does not store plaintext', async () => {
    const calls = [];
    const db = { query: async (...args) => { calls.push(args); return [{ affectedRows: 1 }]; } };
    const service = new AssistantDafPasskeyService({ db, rpID: 'localhost', origin: 'http://localhost:4177', ownerId: 'owner-1' });
    const token = await service.createSession('owner-1');
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(JSON.stringify(calls)).not.toContain(token);
    expect(calls[0][1][0]).toEqual(crypto.createHash('sha256').update(token).digest());
  });

  test('requires a fixed origin and RP identifier', () => {
    expect(() => new AssistantDafPasskeyService({ db: {}, rpID: '', origin: '', ownerId: 'owner-1' })).toThrow();
  });

  test('revoked credential cannot create a session and owner lock precedes credential lookup', async () => {
    const calls = [];
    const connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: async (sql) => {
      calls.push(sql);
      if (sql.includes('FROM assistant_daf_owner_state')) return [[{ user_id: 'owner' }]];
      if (sql.includes('FROM assistant_daf_challenges')) return [[{ challenge: 'synthetic' }]];
      if (sql.startsWith('DELETE FROM assistant_daf_challenges')) return [{ affectedRows: 1 }];
      if (sql.includes('FROM assistant_daf_passkeys')) return [[]];
      throw Error('unexpected session write');
    } };
    const service = new AssistantDafPasskeyService({ db: { getConnection: async () => connection }, rpID: 'localhost', origin: 'http://localhost:4177', ownerId: 'owner' });
    await expect(service.verifyAuthentication(crypto.randomUUID(), { id: 'revoked' })).rejects.toMatchObject({ statusCode: 403 });
    expect(calls[0]).toContain('assistant_daf_owner_state');
    expect(calls[0]).toContain('FOR UPDATE');
    expect(connection.rollback).toHaveBeenCalled();
    expect(calls.join(' ')).not.toContain('INSERT INTO assistant_daf_sessions');
  });
});
