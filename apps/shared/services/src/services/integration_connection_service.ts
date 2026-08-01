import { and, eq, sql } from 'drizzle-orm';
import { logger } from '@uaip/utils';
import { IntegrationConnectionStatus, type IntegrationAuthKind } from '@uaip/types';
import { getControlDb, getIntelligenceDb } from '../database/drizzle/clients/index';
import { agents } from '../database/drizzle/schemas/intelligence_schema';
import {
  integrationConnections,
  integrationProviders,
  projectAgentIntegrationConnections,
  projects,
  projectMembers,
} from '../database/drizzle/schemas/control_schema';
import { encryptOAuthSecret } from './oauth_token_resolver';

export interface IntegrationProviderSummary {
  id: string;
  key: string;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  description?: string;
}

export interface IntegrationProviderRef {
  id: string;
  key: string;
  displayName: string;
  oauthProviderId: string | null;
  enabled: boolean;
}

export interface IntegrationConnectionSummary {
  id: string;
  providerId: string;
  providerKey: string;
  ownerUserId: string;
  authKind: IntegrationAuthKind;
  scopes: string[];
  status: IntegrationConnectionStatus;
  expiresAt: string | null;
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationBindingSummary {
  projectId: string;
  agentId: string;
  providerId: string;
  providerKey: string;
  connectionId: string;
  enabled: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIntegrationConnectionInput {
  providerId: string;
  ownerUserId: string;
  accessToken: string;
  refreshToken?: string;
  authKind?: IntegrationAuthKind;
  scopes?: string[];
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface LinkIntegrationConnectionInput {
  projectId: string;
  agentId: string;
  connectionId: string;
  actorUserId: string;
  enabled?: boolean;
}

interface IntegrationConnectionRow {
  id: string;
  providerId: string;
  providerKey: string;
  ownerUserId: string;
  authKind: IntegrationAuthKind;
  scopes: string[];
  status: IntegrationConnectionStatus;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IntegrationErrorCode =
  | 'connection_not_found'
  | 'provider_not_found'
  | 'forbidden'
  | 'agent_not_found'
  | 'binding_not_found';

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly code: IntegrationErrorCode
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

export class IntegrationConnectionService {
  private static instance: IntegrationConnectionService;

  static getInstance(): IntegrationConnectionService {
    if (!IntegrationConnectionService.instance) {
      IntegrationConnectionService.instance = new IntegrationConnectionService();
    }
    return IntegrationConnectionService.instance;
  }

  private get db() {
    return getControlDb();
  }

  async findProviderByKey(key: string): Promise<IntegrationProviderRef | null> {
    const [row] = await this.db
      .select({
        id: integrationProviders.id,
        key: integrationProviders.key,
        displayName: integrationProviders.displayName,
        oauthProviderId: integrationProviders.oauthProviderId,
        enabled: integrationProviders.enabled,
      })
      .from(integrationProviders)
      .where(eq(integrationProviders.key, key))
      .limit(1);

    return row ?? null;
  }

  /**
   * Maps the OAuth provider that completed a callback back to the integration it
   * belongs to. The callback only knows which oauth_providers row was used.
   */
  async findProviderByOAuthProviderId(
    oauthProviderId: string
  ): Promise<IntegrationProviderRef | null> {
    const [row] = await this.db
      .select({
        id: integrationProviders.id,
        key: integrationProviders.key,
        displayName: integrationProviders.displayName,
        oauthProviderId: integrationProviders.oauthProviderId,
        enabled: integrationProviders.enabled,
      })
      .from(integrationProviders)
      .where(eq(integrationProviders.oauthProviderId, oauthProviderId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Re-connecting must not strand the previous credential: a second active row
   * for the same provider would leave existing bindings pointing at the older,
   * now-superseded token.
   */
  async upsertConnectionForOwner(
    input: CreateIntegrationConnectionInput
  ): Promise<IntegrationConnectionSummary> {
    const [existing] = await this.db
      .select({ id: integrationConnections.id })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.providerId, input.providerId),
          eq(integrationConnections.ownerUserId, input.ownerUserId)
        )
      )
      .limit(1);

    if (!existing) return this.createConnection(input);

    await this.rotateConnectionToken(
      existing.id,
      input.ownerUserId,
      input.accessToken,
      input.expiresAt,
      input.refreshToken
    );

    const [refreshed] = await this.db
      .select({
        id: integrationConnections.id,
        providerId: integrationConnections.providerId,
        providerKey: integrationProviders.key,
        ownerUserId: integrationConnections.ownerUserId,
        authKind: integrationConnections.authKind,
        scopes: integrationConnections.scopes,
        status: integrationConnections.status,
        expiresAt: integrationConnections.expiresAt,
        createdAt: integrationConnections.createdAt,
        updatedAt: integrationConnections.updatedAt,
      })
      .from(integrationConnections)
      .innerJoin(
        integrationProviders,
        eq(integrationConnections.providerId, integrationProviders.id)
      )
      .where(eq(integrationConnections.id, existing.id))
      .limit(1);

    return this.toConnectionSummary(refreshed);
  }

  async listProviders(): Promise<IntegrationProviderSummary[]> {
    const rows = await this.db
      .select({
        id: integrationProviders.id,
        key: integrationProviders.key,
        displayName: integrationProviders.displayName,
        enabled: integrationProviders.enabled,
        oauthProviderId: integrationProviders.oauthProviderId,
        metadata: integrationProviders.metadata,
      })
      .from(integrationProviders);

    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      displayName: row.displayName,
      enabled: row.enabled,
      // A provider with no OAuth row is catalogued but not yet connectable, so the
      // UI can show it as available-but-unconfigured rather than hiding it.
      configured: Boolean(row.oauthProviderId),
      description:
        typeof row.metadata?.description === 'string' ? row.metadata.description : undefined,
    }));
  }

  async listConnections(ownerUserId: string): Promise<IntegrationConnectionSummary[]> {
    const rows = await this.db
      .select({
        id: integrationConnections.id,
        providerId: integrationConnections.providerId,
        providerKey: integrationProviders.key,
        ownerUserId: integrationConnections.ownerUserId,
        authKind: integrationConnections.authKind,
        scopes: integrationConnections.scopes,
        status: integrationConnections.status,
        expiresAt: integrationConnections.expiresAt,
        createdAt: integrationConnections.createdAt,
        updatedAt: integrationConnections.updatedAt,
      })
      .from(integrationConnections)
      .innerJoin(
        integrationProviders,
        eq(integrationConnections.providerId, integrationProviders.id)
      )
      .where(eq(integrationConnections.ownerUserId, ownerUserId));

    return rows.map((row) => this.toConnectionSummary(row));
  }

  async createConnection(
    input: CreateIntegrationConnectionInput
  ): Promise<IntegrationConnectionSummary> {
    const [provider] = await this.db
      .select({ id: integrationProviders.id, key: integrationProviders.key })
      .from(integrationProviders)
      .where(eq(integrationProviders.id, input.providerId))
      .limit(1);

    if (!provider) {
      throw new IntegrationError('Integration provider not found', 'provider_not_found');
    }

    const [inserted] = await this.db
      .insert(integrationConnections)
      .values({
        providerId: input.providerId,
        ownerUserId: input.ownerUserId,
        authKind: input.authKind ?? 'oauth2',
        accessTokenEncrypted: encryptOAuthSecret(input.accessToken),
        refreshTokenEncrypted: input.refreshToken
          ? encryptOAuthSecret(input.refreshToken)
          : null,
        expiresAt: input.expiresAt ?? null,
        scopes: input.scopes ?? [],
        metadata: input.metadata ?? null,
        status: IntegrationConnectionStatus.ACTIVE,
      })
      // A concurrent connect on another instance may have inserted the row between
      // the caller's existence check and this insert. Resolving the conflict here
      // turns that race into a rotation of the SAME row, instead of a unique
      // violation or a duplicate credential a binding could point at.
      .onConflictDoUpdate({
        target: [integrationConnections.ownerUserId, integrationConnections.providerId],
        set: {
          accessTokenEncrypted: encryptOAuthSecret(input.accessToken),
          ...(input.refreshToken
            ? { refreshTokenEncrypted: encryptOAuthSecret(input.refreshToken) }
            : {}),
          expiresAt: input.expiresAt ?? null,
          scopes: input.scopes ?? [],
          tokenVersion: sql`${integrationConnections.tokenVersion} + 1`,
          status: IntegrationConnectionStatus.ACTIVE,
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.toConnectionSummary({ ...inserted, providerKey: provider.key });
  }

  /**
   * Bumps token_version so cached MCP sessions holding the superseded token are
   * invalidated rather than reused.
   */
  async rotateConnectionToken(
    connectionId: string,
    ownerUserId: string,
    accessToken: string,
    expiresAt?: Date,
    refreshToken?: string
  ): Promise<void> {
    const owned = await this.connectionOwnedBy(connectionId, ownerUserId);
    if (!owned) {
      throw new IntegrationError('Connection not found', 'connection_not_found');
    }

    await this.db
      .update(integrationConnections)
      .set({
        accessTokenEncrypted: encryptOAuthSecret(accessToken),
        // Only overwrite when the provider actually issued a new one: OAuth
        // refresh responses often omit it, and writing undefined would erase the
        // stored token and make the connection unrefreshable.
        ...(refreshToken ? { refreshTokenEncrypted: encryptOAuthSecret(refreshToken) } : {}),
        expiresAt: expiresAt ?? null,
        // Incremented BY THE DATABASE, not read-then-written: navratna-core runs
        // multi-instance, so two concurrent rotations would both read the same
        // version and both write version+1 — leaving the loser's token live under
        // a version cached sessions still treat as fresh.
        tokenVersion: sql`${integrationConnections.tokenVersion} + 1`,
        status: IntegrationConnectionStatus.ACTIVE,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connectionId));
  }

  async revokeConnection(connectionId: string, ownerUserId: string): Promise<void> {
    const owned = await this.connectionOwnedBy(connectionId, ownerUserId);
    if (!owned) {
      throw new IntegrationError('Connection not found', 'connection_not_found');
    }

    await this.db
      .update(integrationConnections)
      .set({
        status: IntegrationConnectionStatus.REVOKED,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, connectionId));

    logger.info('Integration connection revoked', { connectionId, ownerUserId });
  }

  async listBindings(
    projectId: string,
    actorUserId: string,
    agentId?: string
  ): Promise<IntegrationBindingSummary[]> {
    const permitted = await this.actorCanAccessProject(actorUserId, projectId);
    if (!permitted) {
      throw new IntegrationError('Project not found or not accessible', 'forbidden');
    }

    const predicate = agentId
      ? and(
          eq(projectAgentIntegrationConnections.projectId, projectId),
          eq(projectAgentIntegrationConnections.agentId, agentId)
        )
      : eq(projectAgentIntegrationConnections.projectId, projectId);

    const rows = await this.db
      .select({
        projectId: projectAgentIntegrationConnections.projectId,
        agentId: projectAgentIntegrationConnections.agentId,
        providerId: projectAgentIntegrationConnections.providerId,
        providerKey: integrationProviders.key,
        connectionId: projectAgentIntegrationConnections.connectionId,
        enabled: projectAgentIntegrationConnections.enabled,
        createdByUserId: projectAgentIntegrationConnections.createdByUserId,
        createdAt: projectAgentIntegrationConnections.createdAt,
        updatedAt: projectAgentIntegrationConnections.updatedAt,
      })
      .from(projectAgentIntegrationConnections)
      .innerJoin(
        integrationProviders,
        eq(projectAgentIntegrationConnections.providerId, integrationProviders.id)
      )
      .where(predicate);

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  /**
   * The provider is taken from the connection, never from the caller: the binding's
   * composite FK requires the pair to agree, and deriving it removes any way to
   * point a binding at a connection belonging to a different provider.
   */
  async linkConnection(
    input: LinkIntegrationConnectionInput
  ): Promise<IntegrationBindingSummary> {
    const permitted = await this.actorCanAccessProject(input.actorUserId, input.projectId);
    if (!permitted) {
      throw new IntegrationError('Project not found or not accessible', 'forbidden');
    }

    // agent_id has no cross-plane FK, so without this any uuid would be accepted and
    // a credential could be bound to an agent the actor has nothing to do with.
    const ownsAgent = await this.actorOwnsAgent(input.actorUserId, input.agentId);
    if (!ownsAgent) {
      throw new IntegrationError('Agent not found or not accessible', 'agent_not_found');
    }

    const [connection] = await this.db
      .select({
        id: integrationConnections.id,
        providerId: integrationConnections.providerId,
        providerKey: integrationProviders.key,
        ownerUserId: integrationConnections.ownerUserId,
      })
      .from(integrationConnections)
      .innerJoin(
        integrationProviders,
        eq(integrationConnections.providerId, integrationProviders.id)
      )
      .where(eq(integrationConnections.id, input.connectionId))
      .limit(1);

    if (!connection) {
      throw new IntegrationError('Connection not found', 'connection_not_found');
    }
    // Linking someone else's credential would let a project member act as its owner
    // on the remote system.
    if (connection.ownerUserId !== input.actorUserId) {
      throw new IntegrationError('Connection not found', 'connection_not_found');
    }

    const enabled = input.enabled ?? true;
    const now = new Date();

    const [row] = await this.db
      .insert(projectAgentIntegrationConnections)
      .values({
        projectId: input.projectId,
        agentId: input.agentId,
        providerId: connection.providerId,
        connectionId: connection.id,
        enabled,
        createdByUserId: input.actorUserId,
      })
      .onConflictDoUpdate({
        target: [
          projectAgentIntegrationConnections.projectId,
          projectAgentIntegrationConnections.agentId,
          projectAgentIntegrationConnections.providerId,
        ],
        // createdByUserId must follow the rebinding actor: findBindingActor reads it
        // to decide whose credential discovery runs under, so leaving the previous
        // actor in place would keep acting as them after the binding changed hands.
        set: {
          connectionId: connection.id,
          enabled,
          createdByUserId: input.actorUserId,
          updatedAt: now,
        },
      })
      .returning();

    return {
      projectId: row.projectId,
      agentId: row.agentId,
      providerId: row.providerId,
      providerKey: connection.providerKey,
      connectionId: row.connectionId,
      enabled: row.enabled,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Returns the provider key of the removed binding so the caller can announce it:
   * the agent still carries that provider's tools in its assigned set, and they
   * must be withdrawn or the model keeps being offered tools it can no longer use.
   */
  async unlinkConnection(
    projectId: string,
    agentId: string,
    providerId: string,
    actorUserId: string
  ): Promise<string> {
    const permitted = await this.actorCanAccessProject(actorUserId, projectId);
    if (!permitted) {
      throw new IntegrationError('Project not found or not accessible', 'forbidden');
    }

    // Symmetric with linkConnection: project membership alone would let any member
    // strip another member's agent of its credential, and the unlink event then
    // withdraws that agent's tools.
    const ownsAgent = await this.actorOwnsAgent(actorUserId, agentId);
    if (!ownsAgent) {
      throw new IntegrationError('Agent not found or not accessible', 'agent_not_found');
    }

    const [provider] = await this.db
      .select({ key: integrationProviders.key })
      .from(integrationProviders)
      .where(eq(integrationProviders.id, providerId))
      .limit(1);

    const deleted = await this.db
      .delete(projectAgentIntegrationConnections)
      .where(
        and(
          eq(projectAgentIntegrationConnections.projectId, projectId),
          eq(projectAgentIntegrationConnections.agentId, agentId),
          eq(projectAgentIntegrationConnections.providerId, providerId)
        )
      )
      .returning({ connectionId: projectAgentIntegrationConnections.connectionId });

    if (deleted.length === 0) {
      throw new IntegrationError('Integration binding not found', 'binding_not_found');
    }

    if (!provider) {
      throw new IntegrationError('Integration provider not found', 'provider_not_found');
    }

    return provider.key;
  }

  private async connectionOwnedBy(connectionId: string, ownerUserId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: integrationConnections.id })
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.ownerUserId, ownerUserId)
        )
      )
      .limit(1);
    return Boolean(row);
  }

  private async actorOwnsAgent(userId: string, agentId: string): Promise<boolean> {
    try {
      const [row] = await getIntelligenceDb()
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.createdBy, userId)))
        .limit(1);
      return Boolean(row);
    } catch (error) {
      // Fail closed: an unreadable intelligence plane must not silently widen access.
      logger.error('Failed to verify agent ownership', {
        userId,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async actorCanAccessProject(userId: string, projectId: string): Promise<boolean> {
    const [owned] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
      .limit(1);
    if (owned) return true;

    const [member] = await this.db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    return Boolean(member);
  }

  private toConnectionSummary(row: IntegrationConnectionRow): IntegrationConnectionSummary {
    return {
      id: row.id,
      providerId: row.providerId,
      providerKey: row.providerKey,
      ownerUserId: row.ownerUserId,
      authKind: row.authKind,
      scopes: row.scopes ?? [],
      status: row.status,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      isExpired: row.expiresAt ? row.expiresAt.getTime() <= Date.now() : false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
