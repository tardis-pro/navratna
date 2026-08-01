import { logger } from '@uaip/utils';
import {
  McpConnectionResolver,
  type McpExecutionRequest,
  type McpResolvedConnection,
} from '@uaip/shared-services';
import {
  McpSessionCache,
  createAuthenticatedMcpClient,
  type AuthenticatedMcpClient,
  type McpSessionKey,
} from './authenticated_mcp_transport.js';

export interface IntegrationMcpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface IntegrationMcpExecutorOptions {
  resolver?: McpConnectionResolver;
  sessionCache?: McpSessionCache;
  createClient?: typeof createAuthenticatedMcpClient;
}

const DEFAULT_MAX_SESSIONS = 200;
const DEFAULT_IDLE_TTL_MS = 5 * 60 * 1000;

// A remote server may retire a session at any time; the SDK surfaces that as a
// 401 or 404 on an otherwise valid request. These are the only statuses worth a
// second attempt — anything else is a real failure and must surface unchanged.
const RETRYABLE_STATUS_CODES = new Set([401, 404]);

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'number' ? code : undefined;
}

function isRetryableSessionError(error: unknown): boolean {
  const code = statusCodeOf(error);
  if (code !== undefined) return RETRYABLE_STATUS_CODES.has(code);
  return error instanceof Error && error.name === 'UnauthorizedError';
}

function toToolDescriptor(tool: {
  name: string;
  description?: string;
  inputSchema?: unknown;
}): IntegrationMcpToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema:
      typeof tool.inputSchema === 'object' && tool.inputSchema !== null
        ? (tool.inputSchema as Record<string, unknown>)
        : {},
  };
}

export class IntegrationMcpExecutor {
  private static instance: IntegrationMcpExecutor;

  private readonly resolver: McpConnectionResolver;
  private readonly sessionCache: McpSessionCache;
  private readonly createClient: typeof createAuthenticatedMcpClient;

  constructor(options: IntegrationMcpExecutorOptions = {}) {
    this.resolver = options.resolver ?? McpConnectionResolver.getInstance();
    this.sessionCache =
      options.sessionCache ??
      new McpSessionCache({
        maxEntries: DEFAULT_MAX_SESSIONS,
        idleTtlMs: DEFAULT_IDLE_TTL_MS,
      });
    this.createClient = options.createClient ?? createAuthenticatedMcpClient;
  }

  static getInstance(): IntegrationMcpExecutor {
    if (!IntegrationMcpExecutor.instance) {
      IntegrationMcpExecutor.instance = new IntegrationMcpExecutor();
    }
    return IntegrationMcpExecutor.instance;
  }

  async listTools(request: McpExecutionRequest): Promise<IntegrationMcpToolDescriptor[]> {
    return this.withSession(request, async (session) => {
      const { tools } = await session.client.listTools();
      return tools.map(toToolDescriptor);
    });
  }

  /**
   * Lists a server's tools with no acting user, for building the shared catalog.
   * The session is closed immediately rather than cached: discovery runs once at
   * boot, and keeping a credential-less session alive would occupy a cache slot
   * no execution can ever reuse.
   */
  async listCatalogTools(serverKey: string): Promise<IntegrationMcpToolDescriptor[]> {
    const connection = await this.resolver.resolveForCatalog(serverKey);
    const session = await this.openSession(connection);
    try {
      const { tools } = await session.client.listTools();
      return tools.map(toToolDescriptor);
    } finally {
      await session.close().catch((error: unknown) => {
        logger.warn('Failed to close catalog discovery session', {
          serverKey,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  async callTool(
    request: McpExecutionRequest,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    return this.withSession(request, async (session) =>
      session.client.callTool({ name: toolName, arguments: args })
    );
  }

  async invalidateConnection(connectionId: string): Promise<void> {
    await this.sessionCache.invalidateConnection(connectionId);
  }

  private sessionKey(
    request: McpExecutionRequest,
    connection: McpResolvedConnection
  ): McpSessionKey {
    return {
      serverKey: connection.serverKey,
      connectionId: connection.connectionId,
      projectId: request.projectId,
      agentId: request.agentId,
      // A public server has no credential to version; 0 keeps the key shape total
      // rather than making tokenVersion optional everywhere downstream.
      tokenVersion: connection.credential?.tokenVersion ?? 0,
    };
  }

  /**
   * Resolves the credential on EVERY call rather than caching it beside the
   * session, so a revoked binding stops working immediately instead of at the
   * next eviction.
   */
  private async withSession<T>(
    request: McpExecutionRequest,
    operation: (session: AuthenticatedMcpClient) => Promise<T>
  ): Promise<T> {
    const connection = await this.resolver.resolve(request);
    const key = this.sessionKey(request, connection);

    const session = await this.sessionCache.getOrCreate(key, () => this.openSession(connection));

    try {
      return await operation(session);
    } catch (error) {
      if (!isRetryableSessionError(error)) throw error;

      logger.info('Retrying MCP operation with a fresh session', {
        serverKey: connection.serverKey,
        status: statusCodeOf(error),
      });

      await this.sessionCache.invalidate(key);

      // A 401 is what a rotated-out token looks like, so the credential must be
      // resolved AGAIN — retrying with the same one can only fail identically.
      // The new tokenVersion also changes the key, so the refreshed session is
      // cached separately from the stale one.
      const refreshed = await this.resolver.resolve(request);
      const refreshedKey = this.sessionKey(request, refreshed);
      const retried = await this.sessionCache.getOrCreate(refreshedKey, () =>
        this.openSession(refreshed)
      );
      return operation(retried);
    }
  }

  private async openSession(connection: McpResolvedConnection): Promise<AuthenticatedMcpClient> {
    return this.createClient({
      url: connection.url,
      authHeaderName: connection.authHeaderName,
      authScheme: connection.authScheme,
      credential: connection.credential,
    });
  }
}
