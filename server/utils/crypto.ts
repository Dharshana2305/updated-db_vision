import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.DATABASE_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-dev-encryption-key-32-chars!!';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext string (e.g. database password).
 */
export function encryptCredential(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an encrypted credential string.
 */
export function decryptCredential(encryptedData: string): string {
  if (!encryptedData) return '';
  // If it's not encrypted format (doesn't contain colons), return as is if legacy plain text or empty
  if (!encryptedData.includes(':')) return encryptedData;

  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return encryptedData;

    const [ivHex, tagHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt credential:', err);
    return '';
  }
}
