import { logger } from '@uaip/utils';
import { getControlDb } from '../database/drizzle/clients/index';
import { agentOAuthConnections } from '../database/drizzle/schemas/control_schema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Vault URI format: `vault://oauth/{connectionId}` or `secret://{name}` */
export type SecretReference = `vault://oauth/${string}` | `secret://${string}`;

export interface SecretScanResult {
  /** True when no raw secrets were detected */
  clean: boolean;
  /** JSON-path-style locations of flagged values */
  flaggedPaths: string[];
  /** Human-readable labels describing which pattern matched */
  patterns: string[];
}

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i, label: 'Bearer token' },
  { pattern: /\bsk_[A-Za-z0-9]{10,}/, label: 'API key (sk_*)' },
  { pattern: /\bpk_[A-Za-z0-9]{10,}/, label: 'API key (pk_*)' },
  { pattern: /\bkey_[A-Za-z0-9]{10,}/, label: 'API key (key_*)' },
  // OAuth-style access/refresh tokens (long hex or alphanumeric strings preceded by known keys)
  { pattern: /["']?(?:access_token|refresh_token|oauth_token)["']?\s*[:=]\s*["']?[A-Za-z0-9\-._~+/]{20,}/i, label: 'OAuth token' },
  // Base64-encoded blobs >40 chars (heuristic for embedded credentials)
  { pattern: /(?:[A-Za-z0-9+/]{40,}={0,2})/, label: 'Base64-encoded string >40 chars' },
];

const VAULT_OAUTH_RE = /^vault:\/\/oauth\/(.+)$/;
const SECRET_REF_RE = /^secret:\/\/(.+)$/;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * SecretReferenceService ensures that WorkflowDefinition JSONB payloads
 * never contain raw credentials. It provides:
 *
 * - Format validation for `vault://` and `secret://` URIs.
 * - Recursive scanning of arbitrary objects to flag embedded secrets.
 * - Runtime resolution of secret references to their actual values
 *   (for execution time only — values are never persisted in workflow state).
 *
 * Singleton — obtain via `SecretReferenceService.getInstance()`.
 */
export class SecretReferenceService {
  private static instance: SecretReferenceService;

  constructor() {
    // no external deps required
  }

  static getInstance(): SecretReferenceService {
    if (!SecretReferenceService.instance) {
      SecretReferenceService.instance = new SecretReferenceService();
    }
    return SecretReferenceService.instance;
  }

  // -------------------------------------------------------------------------
  // Format validation
  // -------------------------------------------------------------------------

  /**
   * Returns `true` when `value` matches `vault://oauth/{id}` or
   * `secret://{name}`.
   */
  isSecretReference(value: string): boolean {
    return VAULT_OAUTH_RE.test(value) || SECRET_REF_RE.test(value);
  }

  // -------------------------------------------------------------------------
  // Raw-secret scanning
  // -------------------------------------------------------------------------

  /**
   * Recursively walk every string value in `definition` and flag anything
   * that looks like a raw credential.
   */
  scanForRawSecrets(definition: object): SecretScanResult {
    const flaggedPaths: string[] = [];
    const patterns: string[] = [];

    this.walk(definition, '', flaggedPaths, patterns);

    if (flaggedPaths.length > 0) {
      logger.warn('Raw secrets detected in workflow definition', {
        flaggedPaths,
        patterns,
      });
    }

    return {
      clean: flaggedPaths.length === 0,
      flaggedPaths,
      patterns,
    };
  }

  // -------------------------------------------------------------------------
  // Secret resolution (execution-time only)
  // -------------------------------------------------------------------------

  /**
   * Resolve a `vault://oauth/{connectionId}` or `secret://{name}` reference
   * to its actual value. Intended for use at workflow execution time only —
   * the returned value must never be persisted back into workflow state.
   *
   * @throws Error when the reference format is unrecognised or the secret
   *         cannot be found.
   */
  async resolveSecretReference(ref: string): Promise<string> {
    // vault://oauth/{connectionId}
    const vaultMatch = ref.match(VAULT_OAUTH_RE);
    if (vaultMatch) {
      const connectionId = vaultMatch[1];
      return this.resolveOAuthToken(connectionId);
    }

    // secret://{name}
    const secretMatch = ref.match(SECRET_REF_RE);
    if (secretMatch) {
      const name = secretMatch[1];
      return this.resolveEnvSecret(name);
    }

    throw new Error(`Unrecognised secret reference format: ${ref}`);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Look up the encrypted OAuth access token from `agent_oauth_connections`
   * by connection ID and return it. In a production deployment the stored
   * value would be decrypted via a KMS envelope — here we return the
   * encrypted column value directly (the decryption layer sits above).
   */
  private async resolveOAuthToken(connectionId: string): Promise<string> {
    const db = getControlDb();
    const rows = await db
      .select({ accessTokenEncrypted: agentOAuthConnections.accessTokenEncrypted })
      .from(agentOAuthConnections)
      .where(eq(agentOAuthConnections.id, connectionId))
      .limit(1);

    if (rows.length === 0 || !rows[0].accessTokenEncrypted) {
      logger.error('OAuth connection not found or token missing', { connectionId });
      throw new Error(`OAuth token not found for connection ${connectionId}`);
    }

    logger.info('Resolved vault://oauth secret reference', { connectionId });
    return rows[0].accessTokenEncrypted;
  }

  /**
   * Resolve `secret://{name}` by reading from `process.env`. The value is
   * never exposed in workflow state — it is provided to the executor at
   * runtime only.
   */
  private resolveEnvSecret(name: string): string {
    const value = process.env[name];
    if (!value) {
      logger.error('Environment secret not found', { name });
      throw new Error(`Environment secret "${name}" is not set`);
    }
    logger.info('Resolved secret:// reference from env', { name });
    return value;
  }

  /**
   * Recursively walk an object/array tree and flag string values matching
   * known secret patterns. Values that are already valid secret references
   * are skipped.
   */
  private walk(
    value: unknown,
    path: string,
    flaggedPaths: string[],
    patterns: string[],
  ): void {
    if (typeof value === 'string') {
      // Skip values that are already proper references
      if (this.isSecretReference(value)) return;

      for (const { pattern, label } of SECRET_PATTERNS) {
        if (pattern.test(value)) {
          flaggedPaths.push(path || '$');
          if (!patterns.includes(label)) {
            patterns.push(label);
          }
          // One flag per path is enough — break after first match
          break;
        }
      }
      return;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        this.walk(value[i], `${path}[${i}]`, flaggedPaths, patterns);
      }
      return;
    }

    if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        this.walk(child, path ? `${path}.${key}` : key, flaggedPaths, patterns);
      }
    }
  }
}
