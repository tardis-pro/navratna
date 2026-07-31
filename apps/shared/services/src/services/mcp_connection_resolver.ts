import { and, eq, isNotNull } from 'drizzle-orm';
import { logger } from '@uaip/utils';
import { IntegrationConnectionStatus, type McpCredentialMode } from '@uaip/types';
import { getControlDb } from '../database/drizzle/clients/index';
import {
  integrationConnections,
  mcpServers,
  projectAgentIntegrationConnections,
  projects,
  projectMembers,
} from '../database/drizzle/schemas/control_schema';
import { decryptOAuthSecret } from './oauth_token_resolver';

export type McpConnectionErrorCode =
  | 'server_not_found'
  | 'server_misconfigured'
  | 'forbidden'
  | 'no_integration_connection'
  | 'connection_unusable'
  | 'credential_unreadable'
  | 'catalog_credential_required';

export class McpConnectionError extends Error {
  constructor(
    message: string,
    readonly code: McpConnectionErrorCode
  ) {
    super(message);
    this.name = 'McpConnectionError';
  }
}

export interface McpExecutionRequest {
  serverKey: string;
  projectId: string;
  agentId: string;
  actorUserId: string;
}

export interface McpResolvedCredential {
  accessToken: string;
  tokenVersion: number;
}

export interface McpIntegrationServerSummary {
  serverKey: string;
  credentialMode: McpCredentialMode;
  enabled: boolean;
}

export interface McpResolvedConnection {
  serverKey: string;
  url: string;
  credentialMode: McpCredentialMode;
  authHeaderName?: string;
  authScheme?: string;
  connectionId: string;
  providerId?: string;
  credential?: McpResolvedCredential;
}

/**
 * A server needing no credential still needs a stable session-cache key. Using a
 * sentinel keeps every public server's sessions in one bucket instead of
 * fabricating a per-user id that would multiply identical anonymous sessions.
 */
const PUBLIC_CONNECTION_ID = '__public__';

export class McpConnectionResolver {
  private static instance: McpConnectionResolver;

  static getInstance(): McpConnectionResolver {
    if (!McpConnectionResolver.instance) {
      McpConnectionResolver.instance = new McpConnectionResolver();
    }
    return McpConnectionResolver.instance;
  }

  private get db() {
    return getControlDb();
  }

  /**
   * Server keys of every DB-registered integration server. Used to split a
   * `mcp-<server>-<tool>` id when both halves may contain hyphens; a legacy
   * stdio server has no server_key and is absent here by design.
   */
  async listServerKeys(): Promise<string[]> {
    const rows = await this.db
      .select({ serverKey: mcpServers.serverKey })
      .from(mcpServers)
      .where(isNotNull(mcpServers.serverKey));

    return rows
      .map((row) => row.serverKey)
      .filter((serverKey): serverKey is string => Boolean(serverKey));
  }

  /**
   * Returns null ONLY when no integration server owns this key, meaning the tool
   * belongs to the legacy MCP path. Every other failure throws, so a
   * misconfigured or unauthorised integration can never silently fall back to an
   * unauthenticated execution.
   */
  async resolveIfIntegration(
    request: McpExecutionRequest
  ): Promise<McpResolvedConnection | null> {
    const [row] = await this.db
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(eq(mcpServers.serverKey, request.serverKey))
      .limit(1);

    if (!row) return null;
    return this.resolve(request);
  }

  async listIntegrationServers(): Promise<McpIntegrationServerSummary[]> {
    const rows = await this.db
      .select({
        serverKey: mcpServers.serverKey,
        credentialMode: mcpServers.credentialMode,
        enabled: mcpServers.enabled,
      })
      .from(mcpServers)
      .where(isNotNull(mcpServers.serverKey));

    return rows
      .filter((row): row is typeof row & { serverKey: string } => Boolean(row.serverKey))
      .map((row) => ({
        serverKey: row.serverKey,
        credentialMode: row.credentialMode,
        enabled: row.enabled,
      }));
  }

  /**
   * Resolves a connection for CATALOG discovery, which has no acting user. It is
   * therefore usable only where a credential is not caller-specific: a public
   * server, or one with a configured catalog connection. A caller_connection
   * server is refused rather than silently discovered unauthenticated, because a
   * partial catalog is worse than a missing one — an agent would plan against
   * tools the provider never advertised.
   */
  async resolveForCatalog(serverKey: string): Promise<McpResolvedConnection> {
    const server = await this.loadServer(serverKey);

    if (server.credentialMode === 'none') {
      return {
        serverKey,
        url: server.url,
        credentialMode: 'none',
        connectionId: PUBLIC_CONNECTION_ID,
        providerId: server.providerId ?? undefined,
      };
    }

    if (server.credentialMode === 'caller_connection') {
      throw new McpConnectionError(
        `MCP server "${serverKey}" needs a user's own connection, so its catalog is discovered when a connection is linked`,
        'catalog_credential_required'
      );
    }

    if (!server.providerId) {
      throw new McpConnectionError(
        `MCP server "${serverKey}" requires a credential but has no provider configured`,
        'server_misconfigured'
      );
    }

    const connectionId = this.requireCatalogConnectionId(server.catalogConnectionId, serverKey);
    const credential = await this.loadCredential(connectionId, server.providerId);

    return {
      serverKey,
      url: server.url,
      credentialMode: 'catalog',
      authHeaderName: server.authHeaderName ?? undefined,
      authScheme: server.authScheme ?? undefined,
      connectionId,
      providerId: server.providerId,
      credential,
    };
  }

  async resolve(request: McpExecutionRequest): Promise<McpResolvedConnection> {
    const server = await this.loadServer(request.serverKey);

    if (server.credentialMode === 'none') {
      return {
        serverKey: request.serverKey,
        url: server.url,
        credentialMode: 'none',
        connectionId: PUBLIC_CONNECTION_ID,
        providerId: server.providerId ?? undefined,
      };
    }

    if (!server.providerId) {
      throw new McpConnectionError(
        `MCP server "${request.serverKey}" requires a credential but has no provider configured`,
        'server_misconfigured'
      );
    }

    const connectionId =
      server.credentialMode === 'catalog'
        ? this.requireCatalogConnectionId(server.catalogConnectionId, request.serverKey)
        : await this.resolveCallerConnectionId(request, server.providerId);

    const credential = await this.loadCredential(connectionId, server.providerId);

    return {
      serverKey: request.serverKey,
      url: server.url,
      credentialMode: server.credentialMode,
      authHeaderName: server.authHeaderName ?? undefined,
      authScheme: server.authScheme ?? undefined,
      connectionId,
      providerId: server.providerId,
      credential,
    };
  }

  private async loadServer(serverKey: string) {
    const [row] = await this.db
      .select({
        url: mcpServers.url,
        providerId: mcpServers.providerId,
        credentialMode: mcpServers.credentialMode,
        authHeaderName: mcpServers.authHeaderName,
        authScheme: mcpServers.authScheme,
        catalogConnectionId: mcpServers.catalogConnectionId,
        enabled: mcpServers.enabled,
        transportType: mcpServers.transportType,
      })
      .from(mcpServers)
      .where(eq(mcpServers.serverKey, serverKey))
      .limit(1);

    if (!row) {
      throw new McpConnectionError(`MCP server "${serverKey}" not found`, 'server_not_found');
    }
    if (!row.enabled) {
      throw new McpConnectionError(`MCP server "${serverKey}" is disabled`, 'server_not_found');
    }
    if (!row.url) {
      throw new McpConnectionError(
        `MCP server "${serverKey}" has no URL configured`,
        'server_misconfigured'
      );
    }
    // A stdio server's credentials are fixed when the process is spawned, so a
    // caller-scoped token could never reach it — reject rather than silently
    // running the tool under the wrong identity.
    if (row.credentialMode === 'caller_connection' && row.transportType === 'stdio') {
      throw new McpConnectionError(
        `MCP server "${serverKey}" is stdio and cannot use caller credentials`,
        'server_misconfigured'
      );
    }

    return { ...row, url: row.url };
  }

  private requireCatalogConnectionId(
    catalogConnectionId: string | null,
    serverKey: string
  ): string {
    if (!catalogConnectionId) {
      throw new McpConnectionError(
        `MCP server "${serverKey}" uses catalog credentials but none is configured`,
        'server_misconfigured'
      );
    }
    return catalogConnectionId;
  }

  /**
   * The credential is chosen from the stored (project, agent, provider) binding.
   * The caller never supplies a connection id — accepting one would let any actor
   * borrow another user's credential by guessing a uuid.
   */
  private async resolveCallerConnectionId(
    request: McpExecutionRequest,
    providerId: string
  ): Promise<string> {
    const permitted = await this.actorCanAccessProject(request.actorUserId, request.projectId);
    if (!permitted) {
      throw new McpConnectionError(
        'Project not found or not accessible',
        'forbidden'
      );
    }

    const [binding] = await this.db
      .select({
        connectionId: projectAgentIntegrationConnections.connectionId,
        enabled: projectAgentIntegrationConnections.enabled,
      })
      .from(projectAgentIntegrationConnections)
      .where(
        and(
          eq(projectAgentIntegrationConnections.projectId, request.projectId),
          eq(projectAgentIntegrationConnections.agentId, request.agentId),
          eq(projectAgentIntegrationConnections.providerId, providerId)
        )
      )
      .limit(1);

    if (!binding || !binding.enabled) {
      throw new McpConnectionError(
        'No enabled integration connection is linked to this project and agent',
        'no_integration_connection'
      );
    }

    return binding.connectionId;
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

  private async loadCredential(
    connectionId: string,
    providerId: string
  ): Promise<McpResolvedCredential> {
    const [connection] = await this.db
      .select({
        accessTokenEncrypted: integrationConnections.accessTokenEncrypted,
        expiresAt: integrationConnections.expiresAt,
        status: integrationConnections.status,
        tokenVersion: integrationConnections.tokenVersion,
      })
      .from(integrationConnections)
      .where(
        // Matching the provider too means a binding cannot reach a connection
        // belonging to a different provider even if a row were tampered with.
        and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.providerId, providerId)
        )
      )
      .limit(1);

    if (!connection) {
      throw new McpConnectionError(
        'Linked integration connection no longer exists',
        'no_integration_connection'
      );
    }
    if (connection.status !== IntegrationConnectionStatus.ACTIVE) {
      throw new McpConnectionError(
        `Integration connection is ${connection.status}`,
        'connection_unusable'
      );
    }
    if (connection.expiresAt && connection.expiresAt.getTime() <= Date.now()) {
      throw new McpConnectionError(
        'Integration connection token has expired',
        'connection_unusable'
      );
    }
    if (!connection.accessTokenEncrypted) {
      throw new McpConnectionError(
        'Integration connection has no stored access token',
        'connection_unusable'
      );
    }

    try {
      return {
        accessToken: decryptOAuthSecret(connection.accessTokenEncrypted),
        tokenVersion: connection.tokenVersion,
      };
    } catch (error) {
      logger.error('Failed to decrypt integration connection token', {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new McpConnectionError(
        'Integration connection token could not be decrypted',
        'credential_unreadable'
      );
    }
  }
}
