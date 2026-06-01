import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { ToolGraphDatabase } from '../tool_graph_database';
import { ADMIN_ORG_ID, ADMIN_ORG_NAME } from '../drizzle/constants';

const NODE_LABELS = ['Tool', 'MCPServer', 'Agent'] as const;

async function backfillNeo4jTenant(): Promise<void> {
  logger.info('Starting Neo4j tenant backfill', { adminOrgId: ADMIN_ORG_ID });

  const db = new ToolGraphDatabase(config.database.neo4j);
  await db.verifyConnectivity(3);

  await db.createTenantNode(ADMIN_ORG_ID, ADMIN_ORG_NAME);
  logger.info('Admin :Tenant node ensured');

  for (const label of NODE_LABELS) {
    // oxlint-disable-next-line no-await-in-loop -- sequential by design, label order matters
    const setCount = await db.executeWithRetry(async (session) => {
      const result = await session.run(
        `MATCH (n:${label})
         WHERE n.tenantId IS NULL
         SET n.tenantId = $tenantId
         RETURN count(n) AS updated`,
        { tenantId: ADMIN_ORG_ID }
      );
      return result.records[0]?.get('updated')?.toNumber() ?? 0;
    }, `Backfill tenantId on ${label}`);
    logger.info(`Set tenantId on ${label} nodes`, { count: setCount });

    // oxlint-disable-next-line no-await-in-loop -- sequential by design, label order matters
    const ownsCount = await db.executeWithRetry(async (session) => {
      const result = await session.run(
        `MATCH (t:Tenant {id: $tenantId})
         MATCH (n:${label} {tenantId: $tenantId})
         WHERE NOT (t)-[:OWNS]->(n)
         MERGE (t)-[:OWNS]->(n)
         RETURN count(n) AS linked`,
        { tenantId: ADMIN_ORG_ID }
      );
      return result.records[0]?.get('linked')?.toNumber() ?? 0;
    }, `Backfill OWNS rels for ${label}`);
    logger.info(`Created OWNS relationships for ${label} nodes`, { count: ownsCount });
  }

  await db.close();
  logger.info('Neo4j tenant backfill complete');
}

backfillNeo4jTenant().catch((err) => {
  logger.error('Neo4j tenant backfill failed', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
