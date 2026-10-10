/**
 * Application-level encryption for connection secrets stored in the database
 * (AES-256-GCM). Stored format: "enc:v1:<iv>:<tag>:<ciphertext>" (base64url parts).
 *
 * WHATSAPP_SECRETS_KEY must be a 32-byte key encoded as 64 hex chars or base64.
 * Plaintext values (legacy rows) are returned unchanged by decrypt(), so rollout can
 * be gradual; run `npm run encrypt-secrets` to convert existing rows.
 */
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

function loadKey() {
  const raw = process.env.WHATSAPP_SECRETS_KEY;
  if (!raw) return null;
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('WHATSAPP_SECRETS_KEY must decode to exactly 32 bytes');
  return key;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encrypt(value) {
  if (value === null || value === undefined || value === '') return value;
  if (isEncrypted(value)) return value;
  const key = loadKey();
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('WHATSAPP_SECRETS_KEY must be set in production to store connection secrets');
    }
    return value;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ciphertext].map((part) => part.toString('base64url')).join(':');
}

function decrypt(value) {
  if (!isEncrypted(value)) return value;
  const key = loadKey();
  if (!key) throw new Error('Encrypted connection secret found but WHATSAPP_SECRETS_KEY is not set');
  const [iv, tag, ciphertext] = value.slice(PREFIX.length).split(':').map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

const SECRET_FIELDS = ['apiToken', 'appSecret'];

/** Returns a copy of a connection row with secret columns encrypted. */
function encryptConnectionSecrets(data) {
  const out = { ...data };
  for (const field of SECRET_FIELDS) {
    if (typeof out[field] === 'string') out[field] = encrypt(out[field]);
  }
  return out;
}

/** Returns a copy of a connection row with secret columns decrypted (for provider construction). */
function decryptConnectionSecrets(connection) {
  const out = { ...connection };
  for (const field of SECRET_FIELDS) {
    if (typeof out[field] === 'string') out[field] = decrypt(out[field]);
  }
  return out;
}

module.exports = { encrypt, decrypt, isEncrypted, encryptConnectionSecrets, decryptConnectionSecrets, SECRET_FIELDS };
