import crypto from 'crypto';

const CURRENT_KEY_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Validates cryptographic configuration at application startup.
 * Throws in production if DATABASE_ENCRYPTION_KEY is not configured or too weak.
 */
export function validateCryptoConfig(): void {
  const key = process.env.DATABASE_ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: DATABASE_ENCRYPTION_KEY environment variable is required in production mode. ' +
        'Configure a 32+ character high-entropy key before launching.'
      );
    }
    console.warn(
      '[CRYPTO WARNING] DATABASE_ENCRYPTION_KEY not set. Using isolated development encryption key. ' +
      'Do NOT use this configuration for production data.'
    );
  } else if (key.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: DATABASE_ENCRYPTION_KEY must be at least 32 characters long for AES-256-GCM.');
    }
  }
}

/**
 * Derives a 256-bit encryption key using SHA-256.
 * In development, uses an explicit isolated development key if not set.
 * In production, strictly requires DATABASE_ENCRYPTION_KEY.
 */
function getEncryptionKey(version = CURRENT_KEY_VERSION): Buffer {
  const secret = process.env.DATABASE_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_ENCRYPTION_KEY is required in production.');
    }
    // Explicit, isolated development-only key; never shared with JWT secret
    return crypto.createHash('sha256').update('db-vision-dev-isolated-encryption-key-2026').digest();
  }
  // Future versions can read version-specific keys (e.g. DATABASE_ENCRYPTION_KEY_V2)
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext credential string using AES-256-GCM with authenticated tags and versioning.
 * Format: v1:<ivHex>:<tagHex>:<ciphertextHex>
 */
export function encryptCredential(text: string): string {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getEncryptionKey(CURRENT_KEY_VERSION);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return `${CURRENT_KEY_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  } catch (err: any) {
    // Fail safe: NEVER return plaintext if encryption fails
    throw new Error(`Credential encryption failed: ${err.message || 'Cipher initialization error'}`);
  }
}

/**
 * Decrypts an encrypted credential string supporting current versioned format (v1:...),
 * legacy unversioned format (<iv>:<tag>:<ciphertext>), and gracefully handles legacy plaintext.
 * Redacts values from any log output.
 */
export function decryptCredential(encryptedData: string): string {
  if (!encryptedData) return '';

  // Plaintext without colons (legacy/unmigrated)
  if (!encryptedData.includes(':')) {
    return encryptedData;
  }

  const parts = encryptedData.split(':');

  try {
    let version = CURRENT_KEY_VERSION;
    let ivHex: string;
    let tagHex: string;
    let encryptedText: string;

    if (parts.length === 4 && parts[0].startsWith('v')) {
      // Versioned format: v1:<iv>:<tag>:<data>
      [version, ivHex, tagHex, encryptedText] = parts;
    } else if (parts.length === 3) {
      // Legacy unversioned format: <iv>:<tag>:<data>
      [ivHex, tagHex, encryptedText] = parts;
      version = 'v0-legacy';
    } else {
      // Malformed format, return empty string for security
      return '';
    }

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
      return '';
    }

    const key = getEncryptionKey(version);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // Intentionally omit decrypted credential or detailed cipher internals from logs
    return '';
  }
}

/**
 * Migrates a credential from legacy format or plaintext to the latest versioned AES-256-GCM format.
 */
export function migrateCredential(credential: string): { migrated: boolean; value: string } {
  if (!credential) return { migrated: false, value: '' };
  if (credential.startsWith(`${CURRENT_KEY_VERSION}:`)) {
    return { migrated: false, value: credential };
  }

  const decrypted = decryptCredential(credential);
  if (!decrypted) {
    return { migrated: false, value: credential };
  }

  const reencrypted = encryptCredential(decrypted);
  return { migrated: true, value: reencrypted };
}
