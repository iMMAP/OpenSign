import crypto from 'node:crypto';

const SALT = 'immap-opensign-ms-graph';

function getKey() {
  const secret =
    process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY || process.env.MASTER_KEY || 'dev-token-encryption-key-change-me';
  return crypto.scryptSync(secret, SALT, 32);
}

export function encryptMicrosoftToken(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), encrypted.toString('base64url'), tag.toString('base64url')].join('.');
}

export function decryptMicrosoftToken(payload) {
  if (!payload) {
    throw new Error('Missing encrypted Microsoft token');
  }
  const [ivB64, dataB64, tagB64] = String(payload).split('.');
  if (!ivB64 || !dataB64 || !tagB64) {
    throw new Error('Invalid encrypted Microsoft token payload');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
