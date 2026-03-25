import { BaseDomainService } from './BaseDomainService';
import { OAuthProviderType, UserType, AgentCapability } from '@uaip/types';
import { getControlPool } from '../database/drizzle/clients/index';
import * as crypto from 'crypto';

export class OAuthService extends BaseDomainService {
  protected constructor() {
    super();
  }

  public static getInstance(): OAuthService {
    return BaseDomainService.resolve<OAuthService>(OAuthService);
  }

  public async createOAuthProvider(data: {
    name: string;
    type: OAuthProviderType;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string[];
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl?: string;
    revokeUrl?: string;
    isEnabled?: boolean;
  }): Promise<Record<string, unknown>> {
    const pool = getControlPool();
    const result = await pool.query(
      `INSERT INTO oauth_providers (name, type, client_id, client_secret_encrypted, authorization_url, token_url, user_info_url, scopes, is_enabled, configuration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        data.name,
        data.type,
        data.clientId,
        data.clientSecret,
        data.authorizationUrl,
        data.tokenUrl,
        data.userInfoUrl || null,
        JSON.stringify(data.scope),
        data.isEnabled ?? true,
        JSON.stringify({ redirectUri: data.redirectUri, revokeUrl: data.revokeUrl })
      ]
    );
    return result.rows[0];
  }

  public async findOAuthProvider(id: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM oauth_providers WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  public async findOAuthProviderByType(
    type: OAuthProviderType
  ): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM oauth_providers WHERE type = $1 AND is_enabled = true LIMIT 1`,
      [type]
    );
    return result.rows[0] ?? null;
  }

  public async findEnabledOAuthProviders(): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM oauth_providers WHERE is_enabled = true`
    );
    return result.rows;
  }

  public async createOAuthState(data: {
    providerId: string;
    redirectUri: string;
    userType?: UserType;
    agentCapabilities?: AgentCapability[];
    codeVerifier?: string;
    nonce?: string;
  }): Promise<Record<string, unknown>> {
    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 600000);
    const pool = getControlPool();

    const result = await pool.query(
      `INSERT INTO oauth_states (state, provider_id, redirect_url, user_id, metadata, expires_at)
       VALUES ($1, $2, $3, NULL, $4, $5) RETURNING *`,
      [
        state,
        data.providerId,
        data.redirectUri,
        JSON.stringify({
          userType: data.userType || UserType.HUMAN,
          agentCapabilities: data.agentCapabilities,
          codeVerifier: data.codeVerifier,
          nonce: data.nonce,
        }),
        expiresAt
      ]
    );
    return result.rows[0];
  }

  public async findOAuthState(state: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM oauth_states WHERE state = $1 LIMIT 1`,
      [state]
    );
    return result.rows[0] ?? null;
  }

  public async verifyAndConsumeOAuthState(state: string): Promise<Record<string, unknown> | null> {
    const stateEntity = await this.findOAuthState(state);

    if (!stateEntity || new Date(stateEntity.expires_at as string) < new Date()) {
      return null;
    }

    const pool = getControlPool();
    await pool.query(`DELETE FROM oauth_states WHERE state = $1`, [state]);

    return stateEntity;
  }

  public async cleanupExpiredStates(): Promise<void> {
    const pool = getControlPool();
    await pool.query(`DELETE FROM oauth_states WHERE expires_at < $1`, [new Date()]);
  }

  public async createAgentOAuthConnection(data: {
    agentId: string;
    providerId: string;
    providerType: OAuthProviderType;
    capabilities: AgentCapability[];
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    scope: string[];
  }): Promise<Record<string, unknown>> {
    const pool = getControlPool();
    const result = await pool.query(
      `INSERT INTO agent_oauth_connections (agent_id, provider_id, access_token_encrypted, refresh_token_encrypted, expires_at, scopes, metadata, last_used_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        data.agentId,
        data.providerId,
        data.accessToken,
        data.refreshToken || null,
        data.tokenExpiresAt || null,
        JSON.stringify(data.scope),
        JSON.stringify({ capabilities: data.capabilities, providerType: data.providerType }),
        new Date()
      ]
    );
    return result.rows[0];
  }

  public async findAgentOAuthConnections(agentId: string): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM agent_oauth_connections WHERE agent_id = $1`,
      [agentId]
    );
    return result.rows;
  }

  public async findAgentOAuthConnection(
    agentId: string,
    providerId: string
  ): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM agent_oauth_connections WHERE agent_id = $1 AND provider_id = $2 LIMIT 1`,
      [agentId, providerId]
    );
    return result.rows[0] ?? null;
  }

  public async updateOAuthConnectionToken(
    connectionId: string,
    data: {
      accessToken: string;
      refreshToken?: string;
      tokenExpiresAt?: Date;
    }
  ): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(
      `UPDATE agent_oauth_connections SET access_token_encrypted = $1, refresh_token_encrypted = COALESCE($2, refresh_token_encrypted), expires_at = COALESCE($3, expires_at), last_used_at = $4 WHERE id = $5`,
      [data.accessToken, data.refreshToken || null, data.tokenExpiresAt || null, new Date(), connectionId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async deactivateOAuthConnection(connectionId: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(
      `DELETE FROM agent_oauth_connections WHERE id = $1`,
      [connectionId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async isOAuthConnectionValid(connectionId: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM agent_oauth_connections WHERE id = $1 LIMIT 1`,
      [connectionId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const connection = result.rows[0];
    if (connection.expires_at && new Date(connection.expires_at) < new Date()) {
      return false;
    }

    return true;
  }
}
