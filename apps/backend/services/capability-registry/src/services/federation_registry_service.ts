/**
 * Federation Registry Service
 *
 * Discovers and tracks subdomain MCP servers across the TARDIS federation.
 * Crawls .well-known/mcp.json manifests, validates them, stores subdomains
 * and their tools, and registers federated tools in the ToolRegistry.
 */

import { logger } from '@uaip/utils';
import { EventBusService } from '@uaip/infra';
import { getControlDb, eq, and, like, or, sql, desc } from '@uaip/shared-services/drizzle/clients';
import {
  federatedSubdomains,
  federatedTools,
} from '@uaip/shared-services/drizzle/control';
import type {
  FederatedSubdomain,
  NewFederatedSubdomain,
  FederatedTool,
  NewFederatedTool,
} from '@uaip/shared-services/drizzle/control';
import { z } from 'zod';
import { federatedToolSecurityLevel } from '../utils/federated_tool_security.js';

// ---------------------------------------------------------------------------
// Manifest validation schema
// ---------------------------------------------------------------------------

const mcpAuthSchema = z.object({
  type: z.enum(['tardis-jwt', 'bearer', 'api-key', 'none']),
  jwks_url: z.string().url().optional(),
  header: z.string().optional(),
});

const mcpToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.unknown()).refine(
    (s) => s.type === 'object',
    { message: 'inputSchema.type must be "object"' }
  ),
});

const mcpManifestSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'name must be lowercase alphanumeric with hyphens'),
  description: z.string().min(1),
  version: z.string().min(1),
  subdomain: z.string().min(1),
  mcp: z.object({
    url: z.string().url(),
    transport: z.enum(['streamable-http', 'sse', 'stdio']),
    auth: mcpAuthSchema,
  }),
  tools: z.array(mcpToolSchema),
  health: z.string().url(),
  icon: z.string().url().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type MCPManifest = z.infer<typeof mcpManifestSchema>;


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SubdomainStatus = 'discovered' | 'healthy' | 'degraded' | 'down' | 'deregistered';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FederationRegistryService {
  private static instance: FederationRegistryService | null = null;
  private eventBusService: EventBusService | null = null;

  private constructor() {}

  static getInstance(): FederationRegistryService {
    if (!FederationRegistryService.instance) {
      FederationRegistryService.instance = new FederationRegistryService();
    }
    return FederationRegistryService.instance;
  }

  /**
   * Initialise with optional event bus — called from feature.ts initialize hook.
   */
  async initialize(options?: { eventBusService?: EventBusService }): Promise<void> {
    if (options?.eventBusService) {
      this.eventBusService = options.eventBusService;
    }

    if (this.eventBusService) {
      await this.setupEventSubscriptions();
    }

    logger.info('FederationRegistryService initialized');
  }

  private getDb() {
    return getControlDb();
  }

  // ─── Event Subscriptions ─────────────────────────────────────────────────

  private async setupEventSubscriptions(): Promise<void> {
    if (!this.eventBusService) return;

    try {
      await this.eventBusService.subscribe('federation.crawl.requested', async () => {
        await this.crawlAll();
      });

      await this.eventBusService.subscribe('federation.health.check', async () => {
        await this.checkAllHealth();
      });

      logger.info('FederationRegistry event subscriptions configured');
    } catch (error) {
      logger.error('Failed to setup FederationRegistry event subscriptions', { error });
    }
  }

  // ─── Crawling ────────────────────────────────────────────────────────────

  /**
   * Fetch and parse .well-known/mcp.json from a subdomain URL.
   * If the subdomain is already known, updates it; otherwise inserts.
   */
  async crawlSubdomain(subdomainHost: string): Promise<{
    success: boolean;
    subdomain?: FederatedSubdomain;
    error?: string;
  }> {
    const manifestUrl = `https://${subdomainHost}/.well-known/mcp.json`;
    logger.info(`Crawling federation manifest: ${manifestUrl}`);

    try {
      const response = await fetch(manifestUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const msg = `HTTP ${response.status} from ${manifestUrl}`;
        logger.warn(msg);
        await this.markSubdomainStatus(subdomainHost, 'down');
        return { success: false, error: msg };
      }

      const raw = await response.json();
      const parsed = mcpManifestSchema.safeParse(raw);

      if (!parsed.success) {
        const errors = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        logger.warn(`Invalid manifest from ${subdomainHost}: ${errors}`);
        return { success: false, error: `Validation failed: ${errors}` };
      }

      const manifest = parsed.data;
      const subdomain = await this.upsertSubdomain(manifest);
      await this.syncTools(subdomain.id, manifest.tools);

      // Emit event for other services
      if (this.eventBusService) {
        await this.eventBusService.publish('federation.subdomain.crawled', {
          subdomainId: subdomain.id,
          subdomain: subdomain.subdomain,
          toolsCount: manifest.tools.length,
        });
      }

      return { success: true, subdomain };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to crawl ${subdomainHost}: ${msg}`);
      await this.markSubdomainStatus(subdomainHost, 'down');
      return { success: false, error: msg };
    }
  }

  /**
   * Crawl all known subdomains. Intended to be called by a BullMQ repeatable job.
   */
  async crawlAll(): Promise<{ total: number; success: number; failed: number }> {
    const db = this.getDb();
    const subdomains = await db
      .select()
      .from(federatedSubdomains)
      .where(
        and(
          sql`${federatedSubdomains.status} != 'deregistered'`
        )
      );

    let success = 0;
    let failed = 0;

    for (const sub of subdomains) {
      // eslint-disable-next-line no-await-in-loop -- sequential to avoid stampede
      const result = await this.crawlSubdomain(sub.subdomain);
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    logger.info(`Federation crawl complete: ${success} ok, ${failed} failed of ${subdomains.length}`);
    return { total: subdomains.length, success, failed };
  }

  // ─── Registration ────────────────────────────────────────────────────────

  /**
   * Manual registration of a subdomain from its manifest payload.
   */
  async registerSubdomain(
    manifest: MCPManifest,
    options?: { registeredBy?: string }
  ): Promise<FederatedSubdomain> {
    const parsed = mcpManifestSchema.parse(manifest);
    const subdomain = await this.upsertSubdomain(parsed, {
      autoDiscovered: false,
      registeredBy: options?.registeredBy,
    });
    await this.syncTools(subdomain.id, parsed.tools);

    if (this.eventBusService) {
      await this.eventBusService.publish('federation.subdomain.registered', {
        subdomainId: subdomain.id,
        subdomain: subdomain.subdomain,
        toolsCount: parsed.tools.length,
      });
    }

    logger.info(`Subdomain manually registered: ${subdomain.subdomain}`);
    return subdomain;
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  async getSubdomains(filters?: {
    status?: SubdomainStatus;
    category?: string;
    search?: string;
  }): Promise<FederatedSubdomain[]> {
    const db = this.getDb();
    const conditions = [];

    if (filters?.status) {
      conditions.push(eq(federatedSubdomains.status, filters.status));
    }
    if (filters?.category) {
      conditions.push(eq(federatedSubdomains.category, filters.category));
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        or(
          like(federatedSubdomains.name, term),
          like(federatedSubdomains.description, term),
          like(federatedSubdomains.subdomain, term)
        )
      );
    }

    const query = conditions.length > 0
      ? db.select().from(federatedSubdomains).where(and(...conditions))
      : db.select().from(federatedSubdomains);

    return await query.orderBy(desc(federatedSubdomains.createdAt));
  }

  async getSubdomainById(id: string): Promise<FederatedSubdomain | null> {
    const db = this.getDb();
    const rows = await db
      .select()
      .from(federatedSubdomains)
      .where(eq(federatedSubdomains.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async getSubdomainTools(subdomainId: string): Promise<FederatedTool[]> {
    const db = this.getDb();
    return await db
      .select()
      .from(federatedTools)
      .where(eq(federatedTools.subdomainId, subdomainId))
      .orderBy(federatedTools.toolName);
  }

  async getAllFederatedTools(filters?: {
    category?: string;
    search?: string;
    activeOnly?: boolean;
  }): Promise<(FederatedTool & { subdomainName?: string; subdomainHost?: string })[]> {
    const db = this.getDb();
    const conditions = [];

    if (filters?.activeOnly !== false) {
      conditions.push(eq(federatedTools.isActive, true));
    }
    if (filters?.category) {
      conditions.push(eq(federatedTools.category, filters.category));
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        or(
          like(federatedTools.toolName, term),
          like(federatedTools.description, term)
        )
      );
    }

    const rows = await db
      .select({
        tool: federatedTools,
        subdomainName: federatedSubdomains.name,
        subdomainHost: federatedSubdomains.subdomain,
      })
      .from(federatedTools)
      .innerJoin(federatedSubdomains, eq(federatedTools.subdomainId, federatedSubdomains.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return rows.map((r) => ({
      ...r.tool,
      subdomainName: r.subdomainName,
      subdomainHost: r.subdomainHost,
    }));
  }

  async searchTools(query: string): Promise<(FederatedTool & { subdomainName?: string; subdomainHost?: string })[]> {
    return this.getAllFederatedTools({ search: query });
  }

  // ─── Health ──────────────────────────────────────────────────────────────

  async checkHealth(subdomainId: string): Promise<{
    status: SubdomainStatus;
    latencyMs: number;
  }> {
    const db = this.getDb();
    const rows = await db
      .select()
      .from(federatedSubdomains)
      .where(eq(federatedSubdomains.id, subdomainId))
      .limit(1);

    const sub = rows[0];
    if (!sub) {
      return { status: 'down', latencyMs: 0 };
    }

    if (!sub.healthEndpoint) {
      return { status: 'degraded', latencyMs: 0 };
    }

    const start = Date.now();
    let newStatus: SubdomainStatus;

    try {
      const resp = await fetch(sub.healthEndpoint, {
        signal: AbortSignal.timeout(5_000),
      });
      const latencyMs = Date.now() - start;

      if (resp.ok) {
        newStatus = 'healthy';
        await db
          .update(federatedSubdomains)
          .set({
            status: newStatus,
            lastHealthyAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(federatedSubdomains.id, subdomainId));
      } else {
        newStatus = 'degraded';
        await db
          .update(federatedSubdomains)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(federatedSubdomains.id, subdomainId));
      }

      return { status: newStatus, latencyMs };
    } catch {
      const latencyMs = Date.now() - start;
      newStatus = 'down';
      await db
        .update(federatedSubdomains)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(federatedSubdomains.id, subdomainId));

      return { status: newStatus, latencyMs };
    }
  }

  /**
   * Check all non-deregistered subdomains. Suitable for a BullMQ repeatable job.
   */
  async checkAllHealth(): Promise<{
    total: number;
    healthy: number;
    degraded: number;
    down: number;
  }> {
    const db = this.getDb();
    const subs = await db
      .select()
      .from(federatedSubdomains)
      .where(sql`${federatedSubdomains.status} != 'deregistered'`);

    let healthy = 0;
    let degraded = 0;
    let down = 0;

    for (const sub of subs) {
      // eslint-disable-next-line no-await-in-loop -- sequential to avoid stampede
      const result = await this.checkHealth(sub.id);
      if (result.status === 'healthy') healthy++;
      else if (result.status === 'degraded') degraded++;
      else down++;
    }

    logger.info(`Federation health check: ${healthy} healthy, ${degraded} degraded, ${down} down`);
    return { total: subs.length, healthy, degraded, down };
  }

  /**
   * Federation health summary — counts by status.
   */
  async getHealthSummary(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    totalTools: number;
  }> {
    const db = this.getDb();
    const subs = await db.select().from(federatedSubdomains);

    const byStatus: Record<string, number> = {};
    for (const sub of subs) {
      byStatus[sub.status] = (byStatus[sub.status] ?? 0) + 1;
    }

    const toolRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(federatedTools)
      .where(eq(federatedTools.isActive, true));

    return {
      total: subs.length,
      byStatus,
      totalTools: Number(toolRows[0]?.count ?? 0),
    };
  }

  // ─── Deregistration ──────────────────────────────────────────────────────

  async deregisterSubdomain(subdomainId: string): Promise<void> {
    const db = this.getDb();
    await db
      .update(federatedSubdomains)
      .set({ status: 'deregistered' as const, updatedAt: new Date() })
      .where(eq(federatedSubdomains.id, subdomainId));

    // Deactivate all its tools
    await db
      .update(federatedTools)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(federatedTools.subdomainId, subdomainId));

    if (this.eventBusService) {
      await this.eventBusService.publish('federation.subdomain.deregistered', { subdomainId });
    }

    logger.info(`Subdomain deregistered: ${subdomainId}`);
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────

  private async upsertSubdomain(
    manifest: MCPManifest,
    options?: { autoDiscovered?: boolean; registeredBy?: string }
  ): Promise<FederatedSubdomain> {
    const db = this.getDb();

    const existing = await db
      .select()
      .from(federatedSubdomains)
      .where(eq(federatedSubdomains.subdomain, manifest.subdomain))
      .limit(1);

    const now = new Date();

    if (existing[0]) {
      const updated = await db
        .update(federatedSubdomains)
        .set({
          name: manifest.name,
          description: manifest.description,
          mcpManifestUrl: `https://${manifest.subdomain}/.well-known/mcp.json`,
          mcpServerUrl: manifest.mcp.url,
          transport: manifest.mcp.transport,
          status: 'healthy' as const,
          toolsCount: manifest.tools.length,
          lastCrawlAt: now,
          lastHealthyAt: now,
          healthEndpoint: manifest.health,
          iconUrl: manifest.icon ?? null,
          category: manifest.category ?? null,
          tags: manifest.tags ?? [],
          manifestVersion: manifest.version,
          authType: manifest.mcp.auth.type,
          authConfig: manifest.mcp.auth as unknown as Record<string, unknown>,
          updatedAt: now,
        })
        .where(eq(federatedSubdomains.id, existing[0].id))
        .returning();

      return updated[0];
    }

    const inserted = await db
      .insert(federatedSubdomains)
      .values({
        name: manifest.name,
        subdomain: manifest.subdomain,
        description: manifest.description,
        mcpManifestUrl: `https://${manifest.subdomain}/.well-known/mcp.json`,
        mcpServerUrl: manifest.mcp.url,
        transport: manifest.mcp.transport,
        status: 'healthy' as const,
        toolsCount: manifest.tools.length,
        lastCrawlAt: now,
        lastHealthyAt: now,
        healthEndpoint: manifest.health,
        iconUrl: manifest.icon,
        category: manifest.category,
        tags: manifest.tags ?? [],
        manifestVersion: manifest.version,
        authType: manifest.mcp.auth.type,
        authConfig: manifest.mcp.auth as unknown as Record<string, unknown>,
        autoDiscovered: options?.autoDiscovered ?? true,
        registeredBy: options?.registeredBy,
      } satisfies NewFederatedSubdomain)
      .returning();

    return inserted[0];
  }

  /**
   * Sync tools for a subdomain — insert new, deactivate removed, update existing.
   */
  private async syncTools(
    subdomainId: string,
    manifestTools: MCPManifest['tools']
  ): Promise<void> {
    const db = this.getDb();

    const existingTools = await db
      .select()
      .from(federatedTools)
      .where(eq(federatedTools.subdomainId, subdomainId));

    const existingByName = new Map(existingTools.map((t) => [t.toolName, t]));
    const manifestByName = new Set(manifestTools.map((t) => t.name));
    const now = new Date();

    // Deactivate tools no longer in manifest
    for (const existing of existingTools) {
      if (!manifestByName.has(existing.toolName)) {
        // eslint-disable-next-line no-await-in-loop
        await db
          .update(federatedTools)
          .set({ isActive: false, updatedAt: now })
          .where(eq(federatedTools.id, existing.id));
      }
    }

    // Upsert tools from manifest
    for (const tool of manifestTools) {
      const existing = existingByName.get(tool.name);
      if (existing) {
        // eslint-disable-next-line no-await-in-loop
        await db
          .update(federatedTools)
          .set({
            description: tool.description,
            inputSchema: tool.inputSchema as Record<string, unknown>,
            isActive: true,
            updatedAt: now,
          })
          .where(eq(federatedTools.id, existing.id));
      } else {
        // eslint-disable-next-line no-await-in-loop
        await db
          .insert(federatedTools)
          .values({
            subdomainId,
            toolName: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema as Record<string, unknown>,
            isActive: true,
          } satisfies NewFederatedTool);
      }
    }

    // Emit tool-level events for ToolRegistry integration
    if (this.eventBusService) {
      for (const tool of manifestTools) {
        // eslint-disable-next-line no-await-in-loop
        await this.eventBusService.publish('tool.register', {
          source: 'federation',
          tool: {
            id: `federation:${subdomainId}:${tool.name}`,
            // `name` IS the dispatch key (tool_definitions.name is UNIQUE;
            // UnifiedToolRegistry resolves non-uuid ids via findToolByName and
            // the mesh routes on this string — same contract as
            // buildMcpToolRegistration's `mcp-<server>-<tool>`). The bare
            // producer-local name would collide across producers AND lose the
            // producer binding the federation descriptor resolves from.
            name: `federation:${subdomainId}:${tool.name}`,
            displayName: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            category: 'api',
            version: '1.0.0',
            securityLevel: federatedToolSecurityLevel(tool.name),
            isEnabled: true,
            tags: ['federation'],
          },
        });
      }
    }
  }

  private async markSubdomainStatus(
    subdomainHost: string,
    status: SubdomainStatus
  ): Promise<void> {
    try {
      const db = this.getDb();
      await db
        .update(federatedSubdomains)
        .set({ status, updatedAt: new Date() })
        .where(eq(federatedSubdomains.subdomain, subdomainHost));
    } catch (error) {
      logger.warn(`Failed to mark subdomain ${subdomainHost} as ${status}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
