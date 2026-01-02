/**
 * Encryption utility for MEDIFY credentials
 * Uses AES-256-CBC encryption
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Get encryption key from environment
 * @returns {Buffer} 32-byte key
 */
function getKey() {
    const key = process.env.MEDIFY_ENCRYPTION_KEY;
    if (!key) {
        throw new Error('MEDIFY_ENCRYPTION_KEY not configured');
    }
    return Buffer.from(key, 'hex');
}

/**
 * Encrypt a string
 * @param {string} text - Plain text to encrypt
 * @returns {Buffer} Encrypted data (IV + ciphertext)
 */
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return Buffer.concat([iv, encrypted]);
}

/**
 * Decrypt data
 * @param {Buffer} data - Encrypted data (IV + ciphertext)
 * @returns {string} Decrypted text
 */
function decrypt(data) {
    const iv = data.slice(0, IV_LENGTH);
    const encryptedText = data.slice(IV_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
}

module.exports = {
    encrypt,
    decrypt
};
