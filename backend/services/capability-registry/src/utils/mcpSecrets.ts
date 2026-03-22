/**
 * MCP Secrets Utility — AES-256-GCM encryption for MCP server headers.
 *
 * Only the capability-registry service holds MCP_SECRETS_KEY.
 * Headers are stored encrypted in the DB; no other service can decrypt them.
 *
 * Key setup:
 *   openssl rand -hex 32   →  add to .env as MCP_SECRETS_KEY
 *   Add empty placeholder  →  sample.env: MCP_SECRETS_KEY=
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from '@uaip/utils';

const ALGO = 'aes-256-gcm';
const SEPARATOR = ':';

function getKey(): Buffer {
  const hex = process.env.MCP_SECRETS_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'MCP_SECRETS_KEY must be set to a 64-char hex string (32 bytes). ' +
        'Generate one with: openssl rand -hex 32'
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a headers object to an opaque string suitable for DB storage.
 * Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptHeaders(headers: Record<string, string>): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const plain = JSON.stringify(headers);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(SEPARATOR);
}

/**
 * Decrypts an encrypted headers blob back to the original Record.
 * Returns an empty object if the stored value is falsy.
 */
export function decryptHeaders(stored: string): Record<string, string> {
  if (!stored) return {};
  const parts = stored.split(SEPARATOR);
  if (parts.length !== 3) {
    logger.warn('mcpSecrets: malformed encrypted headers blob — returning empty');
    return {};
  }
  const [ivHex, tagHex, ctHex] = parts;
  try {
    const key = getKey();
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plain =
      decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8');
    return JSON.parse(plain);
  } catch (err) {
    logger.error('mcpSecrets: decryption failed — wrong key or tampered data', err);
    throw new Error('Failed to decrypt MCP server headers. Check MCP_SECRETS_KEY.', { cause: err });
  }
}

/**
 * Resolves ${ENV_VAR} placeholders inside header values at runtime.
 * The reference (e.g. "${ZAI_API_KEY}") is what gets stored in the DB after
 * encryption — the actual value is injected from process.env only in-process.
 */
export function resolveEnvRefs(headers: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    resolved[k] = v.replace(/\$\{([^}]+)\}/g, (_, name) => {
      const val = process.env[name];
      if (!val) {
        logger.warn(`mcpSecrets: env var "${name}" referenced in MCP headers is not set`);
      }
      return val ?? '';
    });
  }
  return resolved;
}
