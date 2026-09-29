'use strict';

const crypto = require('crypto');

function loadKey(value = process.env.ASSISTANT_DAF_DATA_KEY) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error('ASSISTANT_DAF_DATA_KEY must be a 32-byte base64 key');
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error('ASSISTANT_DAF_DATA_KEY must be a 32-byte base64 key');
  }
  return key;
}

function aad(ownerId, draftId) {
  return Buffer.from(`${ownerId}\0${draftId}`, 'utf8');
}

function encryptText(text, key, ownerId, draftId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(ownerId, draftId));
  const ciphertext = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

function decryptText(sealed, key, ownerId, draftId) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAAD(aad(ownerId, draftId));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

module.exports = { loadKey, encryptText, decryptText };
