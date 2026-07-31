import * as crypto from 'node:crypto';
import { config } from '@uaip/config';
import { logger } from '@uaip/utils';
import type { OAuthProviderType } from '@uaip/types';
import { getControlDb } from '../database/drizzle/clients/index';
import { agentOAuthConnections, oauthProviders } from '../database/drizzle/schemas/control_schema';
import { and, eq } from 'drizzle-orm';

export interface ResolvedOAuthToken {
  connectionId: string;
  providerId: string;
  providerType: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
  isExpired: boolean;
}

const ALGORITHM = 'aes-256-gcm';

function encryptionKey(): string {
  const key = config.security?.encryptionKey;
  if (!key) {
    throw new Error('OAuth encryption key is not configured. Set ENCRYPTION_KEY in environment.');
  }
  return key;
}

/**
 * Mirrors OAuthProviderService.encryptSecret exactly — the ciphertext is read
 * back by that service, so the salt:iv:authTag:encrypted layout must match.
 */
export function encryptOAuthSecret(secret: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey(), salt, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = cipher.update(secret, 'utf8', 'hex') + cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Mirrors OAuthProviderService.decryptSecret. Three historical formats exist in
 * the column and all must keep decrypting, so the branch order matters:
 * 4 parts = salt:iv:authTag:encrypted (current, per-record random salt),
 * 3 parts = iv:authTag:encrypted (legacy static salt),
 * 2 parts = iv:encrypted (legacy, no auth tag).
 */
export function decryptOAuthSecret(encryptedSecret: string): string {
  const parts = encryptedSecret.split(':');

  if (parts.length === 4) {
    const [saltHex, ivHex, authTagHex, encrypted] = parts;
    const key = crypto.scryptSync(encryptionKey(), Buffer.from(saltHex, 'hex'), 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  }

  const legacyKey = crypto.scryptSync(encryptionKey(), 'salt', 32);

  if (parts.length === 3) {
    const [ivHex, authTagHex, encrypted] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, legacyKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  }

  const [ivHex, encrypted] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, legacyKey, Buffer.from(ivHex, 'hex'));
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

/**
 * Resolves OAuth access tokens straight from `agent_oauth_connections`.
 *
 * The event-driven OAuthCapabilityDiscovery cache cannot be used for this:
 * `oauth.provider.connected` never carries tokenInfo, so its in-memory entries
 * always have an undefined token, and the cache is empty after any restart.
 * Tool execution needs a durable source, which is the database row.
 */
export class OAuthTokenResolver {
  private static instance: OAuthTokenResolver;

  static getInstance(): OAuthTokenResolver {
    if (!OAuthTokenResolver.instance) {
      OAuthTokenResolver.instance = new OAuthTokenResolver();
    }
    return OAuthTokenResolver.instance;
  }

  private get db() {
    return getControlDb();
  }

  async resolveByProviderType(
    ownerId: string,
    providerType: OAuthProviderType
  ): Promise<ResolvedOAuthToken | null> {
    try {
      const rows = await this.db
        .select({
          connection: agentOAuthConnections,
          providerType: oauthProviders.type,
        })
        .from(agentOAuthConnections)
        .innerJoin(oauthProviders, eq(agentOAuthConnections.providerId, oauthProviders.id))
        .where(
          and(
            eq(agentOAuthConnections.agentId, ownerId),
            eq(oauthProviders.type, providerType),
            eq(oauthProviders.isEnabled, true)
          )
        )
        .limit(1);

      const row = rows[0];
      if (!row?.connection.accessTokenEncrypted) return null;

      return this.toResolvedToken(row.connection, row.providerType);
    } catch (error) {
      logger.error('Failed to resolve OAuth token by provider type', {
        ownerId,
        providerType,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async resolveByProviderId(
    ownerId: string,
    providerId: string
  ): Promise<ResolvedOAuthToken | null> {
    try {
      const rows = await this.db
        .select({
          connection: agentOAuthConnections,
          providerType: oauthProviders.type,
        })
        .from(agentOAuthConnections)
        .innerJoin(oauthProviders, eq(agentOAuthConnections.providerId, oauthProviders.id))
        .where(
          and(
            eq(agentOAuthConnections.agentId, ownerId),
            eq(agentOAuthConnections.providerId, providerId)
          )
        )
        .limit(1);

      const row = rows[0];
      if (!row?.connection.accessTokenEncrypted) return null;

      return this.toResolvedToken(row.connection, row.providerType);
    } catch (error) {
      logger.error('Failed to resolve OAuth token by provider id', {
        ownerId,
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private toResolvedToken(
    connection: typeof agentOAuthConnections.$inferSelect,
    providerType: string
  ): ResolvedOAuthToken | null {
    try {
      const accessToken = decryptOAuthSecret(connection.accessTokenEncrypted!);
      const refreshToken = connection.refreshTokenEncrypted
        ? decryptOAuthSecret(connection.refreshTokenEncrypted)
        : undefined;

      return {
        connectionId: connection.id,
        providerId: connection.providerId,
        providerType,
        accessToken,
        refreshToken,
        expiresAt: connection.expiresAt ?? undefined,
        scopes: connection.scopes ?? [],
        isExpired: connection.expiresAt ? connection.expiresAt.getTime() <= Date.now() : false,
      };
    } catch (error) {
      logger.error('Failed to decrypt stored OAuth token', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
