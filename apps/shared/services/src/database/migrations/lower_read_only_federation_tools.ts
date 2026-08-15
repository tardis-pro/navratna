/**
 * Migration: set `tool_definitions.security_level` to 'low' for the four
 * read-only federation evidence tools.
 *
 * COMPANION TO THE SYNC-TIME RULE, not a replacement for it.
 * federatedToolSecurityLevel() decides the level when syncTools registers a
 * tool, which is the durable half — without it a later re-sync would restore
 * 'medium' and silently expire this. But syncTools only runs on a successful
 * crawl, and every federated subdomain currently fails to crawl (12 of 12), so
 * the rows already in the table would keep their old level indefinitely. This
 * fixes the rows that exist; the sync rule keeps the ones written later.
 *
 * WHY THESE FOUR ONLY. They return findings, log lines, HTTP status breakdowns
 * and a release list — they change nothing. Write-capable tools on the same
 * servers (create_task, restart, rollback, write_dev_file) are deliberately left
 * at 'medium': platform-initiated work resolves to security level 1 and cannot
 * be raised (resolveSecurityLevel returns 1 for any inactive user, and
 * EnsureSystemActor keeps the system account inactive so it cannot be logged
 * into), so lowering a write tool would let an unauthenticatable caller act
 * rather than merely look.
 *
 * Matched by NAME SUFFIX because the registry id is
 * `federation:<subdomainId>:<toolName>` and the subdomain ids differ per
 * producer — several producers expose the same four tools. The suffix match is
 * anchored with ':' so a tool merely ENDING in one of these names
 * (`custom_find_anomalies`) is not caught.
 *
 * Control plane. Idempotent — it is a targeted UPDATE, safe to re-run.
 *
 * Standalone: bun apps/shared/services/src/database/migrations/lower_read_only_federation_tools.ts
 * Programmatic: await new LowerReadOnlyFederationTools().run();
 */

import { createLogger } from '@uaip/utils';
import { READ_ONLY_FEDERATION_TOOL_NAMES } from '@uaip/types';
import { initializePlanes, getControlPool } from '../drizzle/clients/index';

const logger = createLogger({
  serviceName: 'migration:lower-read-only-federation-tools',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});


/**
 * The same tool is registered under TWO id shapes by two different paths, and
 * matching only one of them is a silent no-op:
 *
 *   federation:<subdomainId>:<toolName>   syncTools, colon-delimited
 *   mcp-<serverName>-<toolName>           the MCP registration path, hyphens
 *
 * The first round of this migration matched `%:<name>` only. It updated 20 rows,
 * logged a confident success, and changed nothing that mattered — the row the
 * nightly triage actually resolves is `mcp-navratna-tardis-agent-find_anomalies`,
 * which has no colon in it and stayed at 'medium'.
 *
 * The hyphen pattern is anchored on the `mcp-` prefix rather than a bare
 * `%-<name>`, which would also swallow `federation:x:custom-find_anomalies`.
 */
export function readOnlyToolPatterns(): string[] {
  return READ_ONLY_FEDERATION_TOOL_NAMES.flatMap((n) => [`%:${n}`, `mcp-%-${n}`]);
}

export class LowerReadOnlyFederationTools {
  async run(): Promise<{ updated: number }> {
    const client = await getControlPool().connect();

    try {
      const patterns = readOnlyToolPatterns();
      const result = await client.query(
        `UPDATE tool_definitions
            SET security_level = 'low'
          WHERE security_level <> 'low'
            AND name LIKE ANY($1::text[])`,
        [patterns]
      );

      const updated = result.rowCount ?? 0;
      logger.info('Read-only federation tools lowered', {
        updated,
        names: READ_ONLY_FEDERATION_TOOL_NAMES,
      });
      return { updated };
    } finally {
      client.release();
    }
  }
}

async function main(): Promise<void> {
  try {
    await initializePlanes();
    const result = await new LowerReadOnlyFederationTools().run();
    logger.info('Migration finished', result);
    process.exit(0);
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
