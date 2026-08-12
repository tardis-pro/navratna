import { eq } from 'drizzle-orm';
import type { InferInsertModel } from 'drizzle-orm';
import { logger } from '@uaip/utils';
import { MCPServerType, SecurityLevel, type McpCredentialMode } from '@uaip/types';
import { getControlDb } from '../drizzle/clients/index';
import {
  integrationProviders,
  mcpServers,
  oauthProviders,
} from '../drizzle/schemas/control_schema';
import { BaseSeed } from './base_seed';

type IntegrationProviderInsert = InferInsertModel<typeof integrationProviders>;
type McpServerInsert = InferInsertModel<typeof mcpServers>;

export interface IntegrationCatalogEntry {
  key: string;
  displayName: string;
  description: string;
  mcpUrl: string;
  credentialMode: McpCredentialMode;
  /** Matches oauth_providers.name. Omitted for a server that needs no credential. */
  oauthProviderName?: string;
  authHeaderName?: string;
  authScheme?: string;
}

/**
 * The entire provider catalog. Adding an integration is one entry here (or one
 * row inserted by an operator) — there is deliberately no per-provider code
 * path, so a new provider needs no new service, adapter or route.
 */
export const INTEGRATION_CATALOG: IntegrationCatalogEntry[] = [
  {
    key: 'github',
    displayName: 'GitHub',
    description: 'GitHub repositories, issues and pull requests via the official MCP server',
    mcpUrl: 'https://api.githubcopilot.com/mcp/',
    credentialMode: 'caller_connection',
    oauthProviderName: 'GitHub',
  },
  {
    key: 'gitea',
    displayName: 'Gitea',
    description: 'Gitea repositories, issues and pull requests via the Gitea API',
    mcpUrl: '', // Gitea MCP URL is instance-specific; set via GITEA_URL env
    credentialMode: 'server_connection',
  },
  {
    key: 'slack',
    displayName: 'Slack',
    description: 'Slack channels, messages and users via the official MCP server',
    mcpUrl: 'https://mcp.slack.com/mcp',
    credentialMode: 'caller_connection',
    oauthProviderName: 'Slack',
  },
  {
    key: 'jira',
    displayName: 'Jira',
    description: 'Jira issues and projects via the Atlassian MCP server',
    mcpUrl: 'https://mcp.atlassian.com/v1/mcp/authv2',
    credentialMode: 'caller_connection',
    oauthProviderName: 'Jira',
  },
  {
    key: 'confluence',
    displayName: 'Confluence',
    description: 'Confluence pages and spaces via the Atlassian MCP server',
    mcpUrl: 'https://mcp.atlassian.com/v1/mcp/authv2',
    credentialMode: 'caller_connection',
    oauthProviderName: 'Confluence',
  },
  {
    key: 'cloudflare',
    displayName: 'Cloudflare',
    description: 'Cloudflare Workers, DNS and account resources via the official MCP server',
    mcpUrl: 'https://mcp.cloudflare.com/mcp',
    credentialMode: 'caller_connection',
    oauthProviderName: 'Cloudflare',
  },
  {
    key: 'vercel',
    displayName: 'Vercel',
    description: 'Vercel projects and deployments via the official MCP server',
    mcpUrl: 'https://mcp.vercel.com',
    credentialMode: 'caller_connection',
    oauthProviderName: 'Vercel',
  },
  {
    key: 'google-calendar',
    displayName: 'Google Calendar',
    description: 'Google Calendar events and availability via the official MCP server',
    mcpUrl: 'https://calendarmcp.googleapis.com/mcp/v1',
    credentialMode: 'caller_connection',
    oauthProviderName: 'Google',
  },
  {
    key: 'cloudflare-docs',
    displayName: 'Cloudflare Docs',
    description: 'Cloudflare documentation search — public, requires no credential',
    mcpUrl: 'https://docs.mcp.cloudflare.com/mcp',
    credentialMode: 'none',
  },
];

export interface IntegrationProviderSeedResult {
  providersSeeded: string[];
  providersUpdated: string[];
  serversSeeded: string[];
  serversUpdated: string[];
}

export class IntegrationProviderSeed extends BaseSeed {
  private db = getControlDb();

  constructor(private readonly catalog: IntegrationCatalogEntry[] = INTEGRATION_CATALOG) {
    super('IntegrationProviders');
  }

  async seed(): Promise<IntegrationProviderSeedResult> {
    const result: IntegrationProviderSeedResult = {
      providersSeeded: [],
      providersUpdated: [],
      serversSeeded: [],
      serversUpdated: [],
    };

    for (const entry of this.catalog) {
      // oxlint-disable-next-line no-await-in-loop -- each provider is an independent upsert; the catalog is tiny and sequential keeps the log readable
      const providerId = await this.upsertProvider(entry, result);
      // oxlint-disable-next-line no-await-in-loop -- see above
      await this.upsertServer(entry, providerId, result);
    }

    logger.info('Integration provider seeding complete', result);
    return result;
  }

  private async resolveOAuthProviderId(entry: IntegrationCatalogEntry): Promise<string | null> {
    if (!entry.oauthProviderName) return null;

    const [row] = await this.db
      .select({ id: oauthProviders.id })
      .from(oauthProviders)
      .where(eq(oauthProviders.name, entry.oauthProviderName))
      .limit(1);

    // A provider whose OAuth credentials are not configured is still catalogued, so
    // the UI can list it as available-but-unconfigured rather than hiding it.
    return row?.id ?? null;
  }

  private async upsertProvider(
    entry: IntegrationCatalogEntry,
    result: IntegrationProviderSeedResult
  ): Promise<string> {
    const oauthProviderId = await this.resolveOAuthProviderId(entry);

    const values: IntegrationProviderInsert = {
      key: entry.key,
      displayName: entry.displayName,
      oauthProviderId,
      enabled: true,
      metadata: { description: entry.description, mcpUrl: entry.mcpUrl },
    };

    const [existing] = await this.db
      .select({ id: integrationProviders.id })
      .from(integrationProviders)
      .where(eq(integrationProviders.key, entry.key))
      .limit(1);

    if (existing) {
      await this.db
        .update(integrationProviders)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(integrationProviders.id, existing.id));
      result.providersUpdated.push(entry.key);
      return existing.id;
    }

    const [inserted] = await this.db
      .insert(integrationProviders)
      .values(values)
      .returning({ id: integrationProviders.id });

    result.providersSeeded.push(entry.key);
    return inserted.id;
  }

  private async upsertServer(
    entry: IntegrationCatalogEntry,
    providerId: string,
    result: IntegrationProviderSeedResult
  ): Promise<void> {
    const values: McpServerInsert = {
      name: entry.displayName,
      description: entry.description,
      type: MCPServerType.API,
      transportType: 'streamable-http',
      url: entry.mcpUrl,
      providerId,
      serverKey: entry.key,
      credentialMode: entry.credentialMode,
      authHeaderName: entry.authHeaderName ?? null,
      authScheme: entry.authScheme ?? null,
      enabled: true,
      autoStart: false,
      author: 'navratna',
      version: '1.0.0',
      // A remote server acts with the user's own account on a third-party system,
      // so it is never rated below HIGH regardless of which provider it is.
      securityLevel: SecurityLevel.HIGH,
      requiresApproval: false,
    };

    const [existing] = await this.db
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(eq(mcpServers.serverKey, entry.key))
      .limit(1);

    if (existing) {
      // serverKey is deliberately not in the update set: discovered tool ids embed
      // it, so rewriting it would orphan every agent binding referencing them.
      const { serverKey: _immutable, ...mutable } = values;
      await this.db
        .update(mcpServers)
        .set({ ...mutable, updatedAt: new Date() })
        .where(eq(mcpServers.id, existing.id));
      result.serversUpdated.push(entry.key);
      return;
    }

    await this.db.insert(mcpServers).values(values);
    result.serversSeeded.push(entry.key);
  }
}
