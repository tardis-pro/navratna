import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from '@uaip/utils';

export interface McpCredential {
  accessToken: string;
  tokenVersion: number;
}

export interface McpSessionKey {
  serverKey: string;
  connectionId: string;
  projectId: string;
  agentId: string;
  tokenVersion: number;
}

export interface AuthenticatedMcpClientOptions {
  url: string;
  authHeaderName?: string;
  authScheme?: string;
  credential?: McpCredential;
  clientName?: string;
  clientVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface AuthenticatedMcpClient {
  client: Client;
  transport: StreamableHTTPClientTransport;
  sessionId: string | undefined;
  close(): Promise<void>;
}

export interface McpSessionCacheOptions {
  maxEntries: number;
  idleTtlMs: number;
  now?: () => number;
}

interface McpSessionCacheEntry {
  connectionId: string;
  client: AuthenticatedMcpClient;
  lastUsed: number;
}

const DEFAULT_AUTH_HEADER_NAME = 'Authorization';
const DEFAULT_AUTH_SCHEME = 'Bearer';
const DEFAULT_CLIENT_NAME = 'uaip-capability-registry';
const DEFAULT_CLIENT_VERSION = '1.0.0';

// NUL cannot occur in a uuid, a server key, or an HTTP header value, so it is safe
// as a field separator — without it, `a|b` and `ab|` would collide into one key.
const KEY_SEPARATOR = '\u0000';

export function serializeSessionKey(key: McpSessionKey): string {
  return [
    key.serverKey,
    key.connectionId,
    key.projectId,
    key.agentId,
    String(key.tokenVersion),
  ].join(KEY_SEPARATOR);
}

export function buildAuthHeaders(options: AuthenticatedMcpClientOptions): Record<string, string> {
  if (!options.credential) return {};

  const headerName = options.authHeaderName || DEFAULT_AUTH_HEADER_NAME;
  const scheme = options.authScheme ?? DEFAULT_AUTH_SCHEME;
  const token = options.credential.accessToken;

  return { [headerName]: scheme ? `${scheme} ${token}` : token };
}

export async function createAuthenticatedMcpClient(
  options: AuthenticatedMcpClientOptions
): Promise<AuthenticatedMcpClient> {
  const transport = new StreamableHTTPClientTransport(new URL(options.url), {
    requestInit: { headers: buildAuthHeaders(options) },
    ...(options.fetchImpl ? { fetch: options.fetchImpl } : {}),
  });

  const client = new Client({
    name: options.clientName ?? DEFAULT_CLIENT_NAME,
    version: options.clientVersion ?? DEFAULT_CLIENT_VERSION,
  });

  try {
    await client.connect(transport);
  } catch (error) {
    await transport.close().catch(() => undefined);
    throw error;
  }

  return {
    client,
    transport,
    sessionId: transport.sessionId,
    async close(): Promise<void> {
      await client.close();
    },
  };
}

export class McpSessionCache {
  private readonly maxEntries: number;
  private readonly idleTtlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, McpSessionCacheEntry>();
  private readonly inFlight = new Map<string, Promise<AuthenticatedMcpClient>>();

  constructor(options: McpSessionCacheOptions) {
    this.maxEntries = options.maxEntries;
    this.idleTtlMs = options.idleTtlMs;
    this.now = options.now ?? (() => Date.now());
  }

  size(): number {
    return this.entries.size;
  }

  async getOrCreate(
    key: McpSessionKey,
    factory: () => Promise<AuthenticatedMcpClient>
  ): Promise<AuthenticatedMcpClient> {
    const serialized = serializeSessionKey(key);

    await this.expireIdle();

    const cached = this.entries.get(serialized);
    if (cached) {
      cached.lastUsed = this.now();
      return cached.client;
    }

    const pending = this.inFlight.get(serialized);
    if (pending) return pending;

    // Registered before the first await so a concurrent caller joins this attempt
    // rather than opening a second session to the same server for the same binding.
    const attempt = factory();
    this.inFlight.set(serialized, attempt);

    let client: AuthenticatedMcpClient;
    try {
      client = await attempt;
    } catch (error) {
      this.inFlight.delete(serialized);
      throw error;
    }
    this.inFlight.delete(serialized);

    this.entries.set(serialized, {
      connectionId: key.connectionId,
      client,
      lastUsed: this.now(),
    });
    await this.enforceCapacity();

    return client;
  }

  async invalidate(key: McpSessionKey): Promise<void> {
    await this.evict(serializeSessionKey(key));
  }

  async invalidateConnection(connectionId: string): Promise<void> {
    const doomed = Array.from(this.entries.entries())
      .filter(([, entry]) => entry.connectionId === connectionId)
      .map(([serialized]) => serialized);

    await Promise.all(doomed.map((serialized) => this.evict(serialized)));
  }

  private async evict(serialized: string): Promise<void> {
    const entry = this.entries.get(serialized);
    this.inFlight.delete(serialized);
    if (!entry) return;

    this.entries.delete(serialized);
    try {
      await entry.client.close();
    } catch (error) {
      // A session that is already gone server-side must not block eviction — the
      // entry is dropped either way, otherwise a dead session would be cached forever.
      logger.warn('Failed to close evicted MCP session', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async expireIdle(): Promise<void> {
    const cutoff = this.now() - this.idleTtlMs;
    const expired = Array.from(this.entries.entries())
      .filter(([, entry]) => entry.lastUsed <= cutoff)
      .map(([serialized]) => serialized);

    await Promise.all(expired.map((serialized) => this.evict(serialized)));
  }

  private async enforceCapacity(): Promise<void> {
    while (this.entries.size > this.maxEntries) {
      let lruKey: string | undefined;
      let lruLastUsed = Number.POSITIVE_INFINITY;

      for (const [serialized, entry] of this.entries) {
        if (entry.lastUsed < lruLastUsed) {
          lruLastUsed = entry.lastUsed;
          lruKey = serialized;
        }
      }

      if (lruKey === undefined) return;
      // oxlint-disable-next-line no-await-in-loop -- each eviction must complete before the next LRU scan, otherwise the same entry is chosen twice
      await this.evict(lruKey);
    }
  }
}
