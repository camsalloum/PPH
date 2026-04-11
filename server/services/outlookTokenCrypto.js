const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function getKey() {
  const hex = process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY || '';
  if (!hex) {
    throw new Error('OUTLOOK_TOKEN_ENCRYPTION_KEY is required');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('OUTLOOK_TOKEN_ENCRYPTION_KEY must be 32 bytes hex');
  }
  return key;
}

function encryptToken(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  });
}

function decryptToken(payload) {
  if (!payload) return null;
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(parsed.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = {
  encryptToken,
  decryptToken,
};
