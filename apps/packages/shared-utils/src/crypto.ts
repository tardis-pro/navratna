import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Encrypts an API key using AES-256-GCM.
 *
 * Output format: `iv_hex:authTag_hex:ciphertext_hex` (all hex-encoded).
 * The encryption key must be exactly 32 bytes (64 hex chars).
 * Use env var `LLM_PROVIDER_ENCRYPTION_KEY` as the source.
 */
export function encryptApiKey(plaintext: string, encryptionKeyHex: string): string {
  const key = Buffer.from(encryptionKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes (64 hex chars), got ${key.length} bytes`);
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts an API key encrypted with `encryptApiKey()`.
 *
 * Expects format: `iv_hex:authTag_hex:ciphertext_hex`.
 * Throws on tampered ciphertext (GCM auth tag verification failure).
 */
export function decryptApiKey(encrypted: string, encryptionKeyHex: string): string {
  const key = Buffer.from(encryptionKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes (64 hex chars), got ${key.length} bytes`);
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      `Invalid encrypted API key format — expected iv:authTag:ciphertext, got ${parts.length} parts`
    );
  }

  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertextBuf = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertextBuf).toString('utf8') + decipher.final('utf8');
}

/**
 * Returns `true` if the value looks like an encrypted API key in the
 * `iv:authTag:ciphertext` format produced by `encryptApiKey()`.
 *
 * Use this as a guard before calling `decryptApiKey()` to avoid
 * attempting decryption on plaintext values.
 */
export function isEncryptedApiKey(value: string): boolean {
  const parts = value.split(':');
  return (
    parts.length === 3 &&
    parts.every((p) => p.length > 0 && /^[\da-f]+$/i.test(p))
  );
}
