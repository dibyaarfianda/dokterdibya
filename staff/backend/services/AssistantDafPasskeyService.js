'use strict';
const crypto = require('crypto');
const webauthn = require('@simplewebauthn/server');
const failure = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const validToken = (token) => /^[A-Za-z0-9_-]{43}$/.test(String(token || ''));
const hashToken = (token) => crypto.createHash('sha256').update(token).digest();

class AssistantDafPasskeyService {
  constructor({ db, rpID, origin, ownerId }) {
    const url = new URL(origin);
    if (!rpID || !ownerId || url.hostname !== rpID || url.origin !== origin
      || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))) throw new Error('Invalid passkey origin');
    Object.assign(this, { db, rpID, origin, ownerId });
  }
  // Serialize credential changes and session issuance, including revocation.
  async withOwnerTransaction(operation) {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const [owners] = await connection.query('SELECT user_id FROM assistant_daf_owner_state WHERE user_id = ? FOR UPDATE', [this.ownerId]);
      if (owners.length !== 1) throw failure('ASISTEN_BELUM_SIAP', 503);
      const result = await operation(connection);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  async passkeys(connection = this.db) {
    const [rows] = await connection.query('SELECT credential_id, public_key, counter, transports_json, created_at FROM assistant_daf_passkeys WHERE user_id = ?', [this.ownerId]);
    return rows;
  }
  async hasPasskey() { return (await this.passkeys()).length > 0; }
  async listPasskeys() { return (await this.passkeys()).map((row) => ({ id: row.credential_id, created_at: row.created_at })); }
  async requireRecentSession(connection, token) {
    if (!validToken(token)) throw failure('BUKA_ULANG_DENGAN_PASSKEY', 401);
    const [rows] = await connection.query(`SELECT user_id FROM assistant_daf_sessions WHERE token_hash = ? AND user_id = ?
      AND expires_at > NOW() AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`, [hashToken(token), this.ownerId]);
    if (rows.length !== 1) throw failure('BUKA_ULANG_DENGAN_PASSKEY', 401);
  }
  async revokePasskey(id, sessionToken) {
    return this.withOwnerTransaction(async (connection) => {
      await this.requireRecentSession(connection, sessionToken);
      const keys = await this.passkeys(connection);
      if (keys.length < 2) throw failure('PASSKEY_TERAKHIR_TIDAK_DAPAT_DICABUT', 409);
      if (!keys.some((key) => key.credential_id === id)) throw failure('PASSKEY_TIDAK_DIKENAL', 404);
      await connection.query('DELETE FROM assistant_daf_passkeys WHERE credential_id = ? AND user_id = ?', [id, this.ownerId]);
      await connection.query('DELETE FROM assistant_daf_sessions WHERE user_id = ?', [this.ownerId]);
      await connection.query('DELETE FROM assistant_daf_challenges WHERE user_id = ?', [this.ownerId]);
    });
  }
  async saveChallenge(purpose, challenge, authorityToken = null) {
    const id = crypto.randomUUID();
    await this.db.query(`INSERT INTO assistant_daf_challenges (id, user_id, purpose, challenge, authority_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
    [id, this.ownerId, purpose, challenge, authorityToken ? hashToken(authorityToken) : null]);
    return id;
  }
  async takeChallenge(connection, id, purpose) {
    if (!/^[a-f0-9-]{36}$/.test(String(id || ''))) throw failure('TANTANGAN_TIDAK_VALID');
    const [rows] = await connection.query(`SELECT challenge, authority_hash FROM assistant_daf_challenges
      WHERE id = ? AND user_id = ? AND purpose = ? AND expires_at > NOW() LIMIT 1 FOR UPDATE`, [id, this.ownerId, purpose]);
    if (!rows.length) throw failure('TANTANGAN_KEDALUWARSA', 409);
    await connection.query('DELETE FROM assistant_daf_challenges WHERE id = ?', [id]);
    return rows[0];
  }
  async registrationOptions(authorityToken = null) {
    const keys = await this.passkeys();
    if (keys.length) await this.requireRecentSession(this.db, authorityToken);
    const options = await webauthn.generateRegistrationOptions({
      rpName: 'Asisten DAF', rpID: this.rpID, userName: 'Dokter Dibya', userDisplayName: 'Dokter Dibya',
      userID: new Uint8Array(Buffer.from(this.ownerId)), attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: keys.map((key) => ({ id: key.credential_id, transports: JSON.parse(key.transports_json || '[]') }))
    });
    return { flow_id: await this.saveChallenge('register', options.challenge, keys.length ? authorityToken : null), options };
  }
  async verifyRegistration(flowId, response, authorityToken = null) {
    return this.withOwnerTransaction(async (connection) => {
      const challenge = await this.takeChallenge(connection, flowId, 'register');
      const keys = await this.passkeys(connection);
      if (keys.length || challenge.authority_hash) {
        await this.requireRecentSession(connection, authorityToken);
        if (!challenge.authority_hash || !crypto.timingSafeEqual(challenge.authority_hash, hashToken(authorityToken))) throw failure('OTORITAS_PASSKEY_BERUBAH', 403);
      }
      const result = await webauthn.verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge,
        expectedOrigin: this.origin, expectedRPID: this.rpID, requireUserVerification: true });
      if (!result.verified || !result.registrationInfo) throw failure('PASSKEY_GAGAL', 403);
      const key = result.registrationInfo.credential;
      await connection.query(`INSERT INTO assistant_daf_passkeys (credential_id, user_id, public_key, counter, transports_json) VALUES (?, ?, ?, ?, ?)`,
        [key.id, this.ownerId, Buffer.from(key.publicKey), key.counter, JSON.stringify(key.transports || [])]);
      return this.createSession(this.ownerId, connection);
    });
  }
  async authenticationOptions() {
    const options = await webauthn.generateAuthenticationOptions({ rpID: this.rpID, userVerification: 'required', allowCredentials: [] });
    return { flow_id: await this.saveChallenge('authenticate', options.challenge), options };
  }
  async verifyAuthentication(flowId, response) {
    return this.withOwnerTransaction(async (connection) => {
      const challenge = await this.takeChallenge(connection, flowId, 'authenticate');
      const row = (await this.passkeys(connection)).find((key) => key.credential_id === response?.id);
      if (!row) throw failure('PASSKEY_TIDAK_DIKENAL', 403);
      const result = await webauthn.verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge,
        expectedOrigin: this.origin, expectedRPID: this.rpID, requireUserVerification: true,
        credential: { id: row.credential_id, publicKey: new Uint8Array(row.public_key), counter: Number(row.counter), transports: JSON.parse(row.transports_json || '[]') } });
      if (!result.verified) throw failure('PASSKEY_GAGAL', 403);
      const [updated] = await connection.query('UPDATE assistant_daf_passkeys SET counter = ? WHERE credential_id = ? AND user_id = ?', [result.authenticationInfo.newCounter, row.credential_id, this.ownerId]);
      if (updated.affectedRows !== 1) throw failure('PASSKEY_TIDAK_DIKENAL', 403);
      return this.createSession(this.ownerId, connection);
    });
  }
  async createSession(ownerId, connection = this.db) {
    const token = crypto.randomBytes(32).toString('base64url');
    await connection.query(`INSERT INTO assistant_daf_sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 8 HOUR))`, [hashToken(token), ownerId]);
    return token;
  }
  async sessionOwner(token) {
    if (!validToken(token)) return null;
    const [rows] = await this.db.query('SELECT user_id FROM assistant_daf_sessions WHERE token_hash = ? AND expires_at > NOW() LIMIT 1', [hashToken(token)]);
    return rows[0]?.user_id === this.ownerId ? this.ownerId : null;
  }
  async revokeSession(token) {
    if (!validToken(token)) return;
    await this.withOwnerTransaction((connection) => connection.query('DELETE FROM assistant_daf_sessions WHERE token_hash = ?', [hashToken(token)]));
  }
  async purgeExpired() {
    await this.db.query('DELETE FROM assistant_daf_challenges WHERE expires_at <= NOW()');
    await this.db.query('DELETE FROM assistant_daf_sessions WHERE expires_at <= NOW()');
  }
}
module.exports = AssistantDafPasskeyService;
