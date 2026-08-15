/**
 * Migration: give a Navratna project an identity, and bind its MCP server row to
 * it.
 *
 * Three gaps closed together (worklist N-11):
 *
 *  1. `projects` held only UAT junk — no row corresponded to any tardis project,
 *     so there was nothing for an MCP server to belong to.
 *  2. `mcp_servers` had no project column. Registration was global and keyed by
 *     URL, so `navratna-tardis-agent` served exactly one project by accident of
 *     hostname. Nothing in the data said which project, and a second project's
 *     agent would have been indistinguishable from the first.
 *  3. Nothing linked the two.
 *
 * `mcp_servers.project_id` is the ownership boundary:
 * McpConnectionResolver.resolve() now refuses a call whose request.projectId
 * does not match a project-scoped row. NULL still means "shared across all
 * projects", which is how public servers (e.g. cloudflare-docs) stay reachable.
 *
 * The tardis side keeps its half of the link: add `navratna.projectId` to the
 * tardis project record, alongside the slug / gitea.repo / sonar.projectKey it
 * already co-locates. This migration prints the id to use.
 *
 * Idempotent: the project is matched by slug and reused if present, and the
 * server binding is a guarded UPDATE.
 *
 * Standalone:
 *   bun apps/shared/services/src/database/migrations/link_project_to_mcp_server.ts \
 *     --slug navratna --server-key navratna --owner <userId>
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { createLogger } from '@uaip/utils';
import { getControlDb, initializePlanes } from '../drizzle/clients/index';
import { mcpServers, projects, users } from '../drizzle/schemas/control_schema';

const logger = createLogger({
  serviceName: 'link-project-to-mcp-server',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export interface LinkProjectOptions {
  /** Project slug, matching the tardis project slug. */
  slug: string;
  /** Human-readable project name. Defaults to the slug. */
  name?: string;
  /** mcp_servers.server_key of the server to bind. */
  serverKey: string;
  /** Owner user id. Defaults to the first admin found. */
  ownerId?: string;
}

export interface LinkProjectResult {
  projectId: string;
  projectCreated: boolean;
  serverKey: string;
  serverBound: boolean;
  /** Set when the server row was already bound to a DIFFERENT project. */
  conflict?: string;
}

export class LinkProjectToMcpServer {
  async run(options: LinkProjectOptions): Promise<LinkProjectResult> {
    const db = getControlDb();
    const name = options.name ?? options.slug;

    const [existingProject] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, options.slug))
      .limit(1);

    let projectId = existingProject?.id;
    let projectCreated = false;

    if (!projectId) {
      const ownerId = options.ownerId ?? (await this.firstAdminId());
      if (!ownerId) {
        throw new Error(
          'No owner available: pass --owner <userId>, or create an admin user first.'
        );
      }

      const [created] = await db
        .insert(projects)
        .values({ slug: options.slug, name, ownerId })
        .returning({ id: projects.id });

      projectId = created.id;
      projectCreated = true;
      logger.info('Created project', { slug: options.slug, projectId, ownerId });
    } else {
      logger.info('Reusing existing project', { slug: options.slug, projectId });
    }

    const [server] = await db
      .select({ projectId: mcpServers.projectId })
      .from(mcpServers)
      .where(eq(mcpServers.serverKey, options.serverKey))
      .limit(1);

    if (!server) {
      throw new Error(
        `No mcp_servers row with server_key "${options.serverKey}". Register the server first.`
      );
    }

    if (server.projectId && server.projectId !== projectId) {
      // Never silently re-home a server: its tools are already bound to agents in
      // the current owner's project.
      logger.error('MCP server is already bound to a different project', {
        serverKey: options.serverKey,
        currentProjectId: server.projectId,
        requestedProjectId: projectId,
      });
      return {
        projectId,
        projectCreated,
        serverKey: options.serverKey,
        serverBound: false,
        conflict: server.projectId,
      };
    }

    let serverBound = false;
    if (!server.projectId) {
      // Guarded on IS NULL so two instances running this concurrently cannot
      // both claim the row.
      const result = await db
        .update(mcpServers)
        .set({ projectId, updatedAt: new Date() })
        .where(and(eq(mcpServers.serverKey, options.serverKey), isNull(mcpServers.projectId)))
        .returning({ id: mcpServers.id });
      serverBound = result.length > 0;
      logger.info('Bound MCP server to project', {
        serverKey: options.serverKey,
        projectId,
        bound: serverBound,
      });
    }

    return { projectId, projectCreated, serverKey: options.serverKey, serverBound };
  }

  private async firstAdminId(): Promise<string | undefined> {
    const db = getControlDb();
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.role} = 'admin'`)
      .limit(1);
    return admin?.id;
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  try {
    const slug = arg('slug');
    const serverKey = arg('server-key');
    if (!slug || !serverKey) {
      logger.error('Usage: --slug <slug> --server-key <key> [--name <name>] [--owner <userId>]');
      process.exit(1);
    }

    await initializePlanes();
    const result = await new LinkProjectToMcpServer().run({
      slug,
      serverKey,
      name: arg('name'),
      ownerId: arg('owner'),
    });

    logger.info('Migration finished', { ...result });
    logger.info(
      `Add this to the tardis project record:  navratna.projectId = ${result.projectId}`
    );
    process.exit(result.conflict ? 2 : 0);
  } catch (error) {
    logger.error('Migration failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

const isBunRuntime = 'Bun' in globalThis;
const isMain = isBunRuntime
  ? (import.meta as { main?: boolean }).main === true
  : typeof require !== 'undefined' && require.main === module;

if (isMain) {
  void main();
}
