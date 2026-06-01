import { ADMIN_ORG_ID } from '../drizzle/constants';
import { logger } from '@uaip/utils';

type ScrollPoint = {
  id: string | number;
  payload?: Record<string, unknown>;
};

type BackfillResult = {
  collection: string;
  pointsUpdated: number;
  pointsSkipped: number;
};

const COLLECTIONS = ['knowledge_embeddings_episodic', 'knowledge_embeddings', 'code_symbols'] as const;
const BATCH_SIZE = 100;

async function scrollBatch(
  qdrantUrl: string,
  collection: string,
  offset: string | number | null
): Promise<{ points: ScrollPoint[]; nextPageOffset: string | number | null }> {
  const body: Record<string, unknown> = { limit: BATCH_SIZE, with_payload: true, with_vector: false };
  if (offset !== null) {
    body['offset'] = offset;
  }
  const response = await fetch(`${qdrantUrl}/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 404) {
      return { points: [], nextPageOffset: null };
    }
    throw new Error(`Qdrant scroll failed for ${collection}: ${response.statusText}`);
  }
  const data: unknown = await response.json();
  if (typeof data !== 'object' || data === null || !('result' in data)) {
    return { points: [], nextPageOffset: null };
  }
  const result = (data as { result: unknown }).result;
  if (typeof result !== 'object' || result === null) {
    return { points: [], nextPageOffset: null };
  }
  const r = result as Record<string, unknown>;
  const rawPoints: unknown = r['points'];
  const nextOffset: unknown = r['next_page_offset'];
  const points: ScrollPoint[] = Array.isArray(rawPoints)
    ? rawPoints
        .filter(
          (item): item is { id: string | number; payload?: Record<string, unknown> } =>
            typeof item === 'object' && item !== null && 'id' in item
        )
        .map((p) => ({ id: p.id, payload: p.payload }))
    : [];
  const nextPageOffset =
    typeof nextOffset === 'string' || typeof nextOffset === 'number' ? nextOffset : null;
  return { points, nextPageOffset };
}

async function setPayloadBatch(
  qdrantUrl: string,
  collection: string,
  pointIds: Array<string | number>
): Promise<void> {
  const response = await fetch(`${qdrantUrl}/collections/${collection}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: { tenant_id: ADMIN_ORG_ID },
      points: pointIds,
    }),
  });
  if (!response.ok) {
    throw new Error(`Qdrant setPayload failed for ${collection}: ${response.statusText}`);
  }
}

async function backfillCollection(
  qdrantUrl: string,
  collection: string
): Promise<BackfillResult> {
  let offset: string | number | null = null;
  let pointsUpdated = 0;
  let pointsSkipped = 0;

  do {
    // oxlint-disable-next-line no-await-in-loop -- cursor-based pagination requires sequential fetches
    const { points, nextPageOffset } = await scrollBatch(qdrantUrl, collection, offset);
    if (points.length === 0) {
      break;
    }

    const needsBackfill = points.filter((p) => !p.payload?.['tenant_id']);
    const alreadyTagged = points.length - needsBackfill.length;
    pointsSkipped += alreadyTagged;

    if (needsBackfill.length > 0) {
      const ids = needsBackfill.map((p) => p.id);
      // oxlint-disable-next-line no-await-in-loop -- must complete setPayload before reading next cursor page
      await setPayloadBatch(qdrantUrl, collection, ids);
      pointsUpdated += needsBackfill.length;
      logger.info('Backfilled Qdrant batch', { collection, batchSize: needsBackfill.length, totalUpdated: pointsUpdated });
    }

    offset = nextPageOffset;
  } while (offset !== null);

  return { collection, pointsUpdated, pointsSkipped };
}

export async function backfillQdrantTenantIds(qdrantUrl?: string): Promise<BackfillResult[]> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: backfillQdrantTenantIds() must not run in production. ' +
        'Apply via a coordinated maintenance window instead.'
    );
  }

  const url = qdrantUrl ?? process.env.QDRANT_URL ?? 'http://localhost:6333';
  logger.info('Starting Qdrant tenant_id backfill', { url, orgId: ADMIN_ORG_ID });

  const results: BackfillResult[] = [];

  for (const collection of COLLECTIONS) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- sequential per-collection backfill avoids overwhelming Qdrant
      const result = await backfillCollection(url, collection);
      results.push(result);
      logger.info('Backfill complete for collection', result);
    } catch (err) {
      logger.error('Backfill failed for collection', {
        collection,
        error: err instanceof Error ? err.message : String(err),
      });
      results.push({ collection, pointsUpdated: 0, pointsSkipped: 0 });
    }
  }

  const totalUpdated = results.reduce((sum, r) => sum + r.pointsUpdated, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.pointsSkipped, 0);
  logger.info('Qdrant tenant_id backfill finished', { totalUpdated, totalSkipped, collections: results.length });

  return results;
}
