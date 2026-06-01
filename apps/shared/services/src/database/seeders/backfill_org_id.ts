import { getControlDb, getIntelligenceDb } from '../drizzle/clients/index';
import { ADMIN_ORG_ID } from '../drizzle/constants';
import { sql } from 'drizzle-orm';
import { logger } from '@uaip/utils';

type BackfillResult = {
  table: string;
  rowsUpdated: number;
};

type PlaneUpdate = {
  table: string;
  query: ReturnType<typeof sql>;
};

export async function backfillOrganizationIds(): Promise<BackfillResult[]> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: backfillOrganizationIds() must not run in production. ' +
        'Apply targeted SQL via a coordinated migration instead.'
    );
  }

  const controlDb = getControlDb();
  const intelligenceDb = getIntelligenceDb();

  const controlUpdates: PlaneUpdate[] = [
    {
      table: 'users',
      query: sql`UPDATE users SET organization_id = ${ADMIN_ORG_ID}::uuid WHERE organization_id IS NULL`,
    },
  ];

  const intelligenceUpdates: PlaneUpdate[] = [
    {
      table: 'agents',
      query: sql`UPDATE agents SET organization_id = ${ADMIN_ORG_ID}::uuid WHERE organization_id IS NULL`,
    },
    {
      table: 'personas',
      query: sql`UPDATE personas SET organization_id = ${ADMIN_ORG_ID}::uuid WHERE organization_id IS NULL`,
    },
    {
      table: 'discussions',
      query: sql`UPDATE discussions SET organization_id = ${ADMIN_ORG_ID}::uuid WHERE organization_id IS NULL`,
    },
    {
      table: 'artifacts',
      query: sql`UPDATE artifacts SET organization_id = ${ADMIN_ORG_ID}::uuid WHERE organization_id IS NULL`,
    },
    {
      table: 'knowledge_items',
      query: sql`UPDATE knowledge_items SET organization_id = ${ADMIN_ORG_ID}::uuid WHERE organization_id IS NULL`,
    },
    {
      table: 'llm_providers',
      query: sql`UPDATE llm_providers SET organization_id = ${ADMIN_ORG_ID}::uuid WHERE organization_id IS NULL`,
    },
    {
      table: 'llm_models',
      query: sql`UPDATE llm_models SET organization_id = ${ADMIN_ORG_ID}::uuid WHERE organization_id IS NULL`,
    },
    {
      table: 'short_links',
      query: sql`UPDATE short_links SET organization_id = ${ADMIN_ORG_ID}::uuid WHERE organization_id IS NULL`,
    },
  ];

  const runUpdates = async (
    updates: PlaneUpdate[],
    executor: typeof controlDb | typeof intelligenceDb
  ): Promise<BackfillResult[]> => {
    const pairs = await Promise.all(
      updates.map(async ({ table, query }) => {
        const result = await executor.execute(query);
        return { table, rowsUpdated: result.rowCount ?? 0 };
      })
    );
    pairs.forEach(({ table, rowsUpdated }) => {
      logger.info('Backfill complete', { table, rowsUpdated, orgId: ADMIN_ORG_ID });
    });
    return pairs;
  };

  const [controlResults, intelligenceResults] = await Promise.all([
    runUpdates(controlUpdates, controlDb),
    runUpdates(intelligenceUpdates, intelligenceDb),
  ]);

  const results = [...controlResults, ...intelligenceResults];

  logger.info('Organization ID backfill finished', {
    tables: results.length,
    totalRowsUpdated: results.reduce((sum, r) => sum + r.rowsUpdated, 0),
  });

  return results;
}
