const crypto = require('crypto');
const { encryptText, decryptText, loadKey } = require('../../services/AssistantDafCrypto');

describe('Asisten DAF source encryption', () => {
  const key = crypto.randomBytes(32);

  test('round trips only for the matching owner and draft', () => {
    const sealed = encryptText('Pesan pasien privat', key, 'owner-1', 'draft-1');
    expect(JSON.stringify(sealed)).not.toContain('Pesan pasien privat');
    expect(decryptText(sealed, key, 'owner-1', 'draft-1')).toBe('Pesan pasien privat');
    expect(() => decryptText(sealed, key, 'owner-2', 'draft-1')).toThrow();
  });

  test('rejects absent and incorrectly sized keys', () => {
    expect(() => loadKey('')).toThrow();
    expect(() => loadKey(Buffer.alloc(16).toString('base64'))).toThrow();
    expect(loadKey(key.toString('base64'))).toEqual(key);
  });
});
