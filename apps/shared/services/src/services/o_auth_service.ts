import { BaseDomainService } from './base_domain_service';
import { OAuthProviderType, UserType, AgentCapability } from '@uaip/types';
import type { OAuthProviderConfig } from '@uaip/types';
import { getControlDb } from '../database/drizzle/clients/index';
import {
  oauthProviders,
  oauthStates,
  agentOAuthConnections,
} from '../database/drizzle/schemas/control_schema';
import { eq, and, lt } from 'drizzle-orm';
import * as crypto from 'crypto';
import type {
  OAuthProvider,
  OAuthState,
  AgentOAuthConnection,
} from '../database/drizzle/schemas/control_schema';

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
    agentConfig?: OAuthProviderConfig['agentConfig'];
    isEnabled?: boolean;
  }): Promise<OAuthProvider> {
    const db = getControlDb();
    const [result] = await db
      .insert(oauthProviders)
      .values({
        name: data.name,
        type: data.type,
        clientId: data.clientId,
        clientSecretEncrypted: data.clientSecret,
        authorizationUrl: data.authorizationUrl,
        tokenUrl: data.tokenUrl,
        userInfoUrl: data.userInfoUrl ?? null,
        scopes: data.scope,
        isEnabled: data.isEnabled ?? true,
        configuration: {
          redirectUri: data.redirectUri,
          revokeUrl: data.revokeUrl,
          agentConfig: data.agentConfig,
        },
      })
      .returning();
    return result;
  }

  public async findOAuthProvider(id: string): Promise<OAuthProvider | null> {
    const db = getControlDb();
    const result = await db
      .select()
      .from(oauthProviders)
      .where(eq(oauthProviders.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  public async findOAuthProviderByType(
    type: OAuthProviderType
  ): Promise<OAuthProvider | null> {
    const db = getControlDb();
    const result = await db
      .select()
      .from(oauthProviders)
      .where(and(eq(oauthProviders.type, type), eq(oauthProviders.isEnabled, true)))
      .limit(1);
    return result[0] ?? null;
  }

  public async findEnabledOAuthProviders(): Promise<OAuthProvider[]> {
    const db = getControlDb();
    return db.select().from(oauthProviders).where(eq(oauthProviders.isEnabled, true));
  }

  public async createOAuthState(data: {
    providerId: string;
    redirectUri: string;
    userType?: UserType;
    agentCapabilities?: AgentCapability[];
    codeVerifier?: string;
    nonce?: string;
  }): Promise<OAuthState> {
    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 600000);
    const db = getControlDb();

    const [result] = await db
      .insert(oauthStates)
      .values({
        state,
        providerId: data.providerId,
        redirectUrl: data.redirectUri,
        expiresAt,
        metadata: {
          userType: data.userType || UserType.HUMAN,
          agentCapabilities: data.agentCapabilities,
          codeVerifier: data.codeVerifier,
          nonce: data.nonce,
        },
      })
      .returning();
    return result;
  }

  public async findOAuthState(state: string): Promise<OAuthState | null> {
    const db = getControlDb();
    const result = await db
      .select()
      .from(oauthStates)
      .where(eq(oauthStates.state, state))
      .limit(1);
    return result[0] ?? null;
  }

  public async verifyAndConsumeOAuthState(state: string): Promise<OAuthState | null> {
    const stateEntity = await this.findOAuthState(state);

    if (!stateEntity || stateEntity.expiresAt < new Date()) {
      return null;
    }

    const db = getControlDb();
    await db.delete(oauthStates).where(eq(oauthStates.state, state));

    return stateEntity;
  }

  public async cleanupExpiredStates(): Promise<void> {
    const db = getControlDb();
    await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
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
  }): Promise<AgentOAuthConnection> {
    const db = getControlDb();
    const [result] = await db
      .insert(agentOAuthConnections)
      .values({
        agentId: data.agentId,
        providerId: data.providerId,
        accessTokenEncrypted: data.accessToken,
        refreshTokenEncrypted: data.refreshToken ?? null,
        expiresAt: data.tokenExpiresAt ?? null,
        scopes: data.scope,
        metadata: { capabilities: data.capabilities, providerType: data.providerType },
      })
      .returning();
    return result;
  }

  public async findAgentOAuthConnections(agentId: string): Promise<AgentOAuthConnection[]> {
    const db = getControlDb();
    return db
      .select()
      .from(agentOAuthConnections)
      .where(eq(agentOAuthConnections.agentId, agentId));
  }

  public async findOAuthConnectionById(
    connectionId: string
  ): Promise<AgentOAuthConnection | null> {
    const db = getControlDb();
    const result = await db
      .select()
      .from(agentOAuthConnections)
      .where(eq(agentOAuthConnections.id, connectionId))
      .limit(1);
    return result[0] ?? null;
  }

  public async findAgentOAuthConnection(
    agentId: string,
    providerId: string
  ): Promise<AgentOAuthConnection | null> {
    const db = getControlDb();
    const result = await db
      .select()
      .from(agentOAuthConnections)
      .where(
        and(
          eq(agentOAuthConnections.agentId, agentId),
          eq(agentOAuthConnections.providerId, providerId)
        )
      )
      .limit(1);
    return result[0] ?? null;
  }

  public async updateOAuthConnectionToken(
    connectionId: string,
    data: {
      accessToken: string;
      refreshToken?: string;
      tokenExpiresAt?: Date;
    }
  ): Promise<boolean> {
    const db = getControlDb();
    const result = await db
      .update(agentOAuthConnections)
      .set({
        accessTokenEncrypted: data.accessToken,
        refreshTokenEncrypted: data.refreshToken ?? undefined,
        expiresAt: data.tokenExpiresAt ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(agentOAuthConnections.id, connectionId));
    return (result.rowCount ?? 0) > 0;
  }

  public async deactivateOAuthConnection(connectionId: string): Promise<boolean> {
    const db = getControlDb();
    const result = await db
      .delete(agentOAuthConnections)
      .where(eq(agentOAuthConnections.id, connectionId));
    return (result.rowCount ?? 0) > 0;
  }

  public async isOAuthConnectionValid(connectionId: string): Promise<boolean> {
    const db = getControlDb();
    const result = await db
      .select()
      .from(agentOAuthConnections)
      .where(eq(agentOAuthConnections.id, connectionId))
      .limit(1);

    if (result.length === 0) {
      return false;
    }

    const connection = result[0];
    if (connection.expiresAt && connection.expiresAt < new Date()) {
      return false;
    }

    return true;
  }
}
