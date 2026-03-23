/**
 * sync-postgres-to-qdrant.ts
 *
 * One-shot: reads all knowledge_items from Postgres, embeds via TEI, upserts into Qdrant.
 * Run from inside the container (or locally with correct env):
 *
 *   bun run src/scripts/sync-postgres-to-qdrant.ts
 *
 * Or trigger via docker exec:
 *   docker exec uaip-agent-intelligence bun run /app/backend/services/agent-intelligence/src/scripts/sync-postgres-to-qdrant.ts
 */

import { DataSource } from 'typeorm';

const {
  POSTGRES_HOST = 'postgres',
  POSTGRES_PORT = '5432',
  POSTGRES_USER = 'uaip_user',
  POSTGRES_PASSWORD = 'uaip_password',
  POSTGRES_DB = 'uaip',
  TEI_EMBEDDING_URL = 'http://tei-embeddings:80',
  QDRANT_URL = 'http://qdrant:6333',
  QDRANT_COLLECTION = 'knowledge_embeddings',
  BATCH_SIZE = '20',
} = process.env;

const BATCH = parseInt(BATCH_SIZE, 10);

// ─── TEI helper ─────────────────────────────────────────────────────────────

async function teiEmbed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${TEI_EMBEDDING_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: texts }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`TEI embed failed ${res.status}: ${txt}`);
  }
  const data: unknown = await res.json();
  if (Array.isArray(data)) {
    return data as number[][];
  }
  const asRecord = data as Record<string, unknown>;
  const embeddings = Array.isArray(asRecord.embeddings) ? asRecord.embeddings : null;
  return (embeddings ?? []) as number[][];
}

// ─── Qdrant helpers ──────────────────────────────────────────────────────────

async function qdrantCollectionInfo(): Promise<{ result?: { points_count?: number } }> {
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`);
  return res.json() as Promise<{ result?: { points_count?: number } }>;
}

async function qdrantUpsert(
  points: Array<{ id: number; vector: number[]; payload: Record<string, unknown> }>
): Promise<void> {
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Qdrant upsert failed ${res.status}: ${txt}`);
  }
}

// Derive a deterministic uint53 from a UUID string + chunk index
function uuidToUint(uuid: string, chunkIndex: number): number {
  const hex = uuid.replace(/-/g, '').slice(0, 13);
  return (parseInt(hex, 16) * 100 + chunkIndex) % Number.MAX_SAFE_INTEGER;
}

// ─── main ────────────────────────────────────────────────────────────────────

const ds = new DataSource({
  type: 'postgres',
  host: POSTGRES_HOST,
  port: parseInt(POSTGRES_PORT),
  username: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
  database: POSTGRES_DB,
  synchronize: false,
  logging: false,
});

await ds.initialize();

const rows: Array<{ id: string; content: string }> = await ds.query(
  `SELECT id, content FROM knowledge_items
   WHERE content IS NOT NULL AND LENGTH(TRIM(content)) > 0
   ORDER BY created_at DESC`
);

const info = await qdrantCollectionInfo();
const _existingCount = info.result?.points_count ?? 0;

let synced = 0;
let failed = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);

  // Truncate to 2000 chars — TEI CPU model has a token limit
  const texts = batch.map((r) => r.content.replace(/\r\n/g, '\n').slice(0, 2000).trim());

  // Skip empty texts that could slip through
  const validBatch = batch.filter((_, idx) => texts[idx].length > 0);
  const validTexts = texts.filter((t) => t.length > 0);
  if (validTexts.length === 0) continue;

  let embeddings: number[][];
  try {
    // oxlint-disable-next-line no-await-in-loop -- sequential processing required
    embeddings = await teiEmbed(validTexts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  ⚠️  Batch ${i}–${i + validBatch.length} embed failed: ${msg}`);
    failed += validBatch.length;
    continue;
  }

  const points = validBatch.map((row, idx) => ({
    id: uuidToUint(row.id, 0),
    vector: embeddings[idx],
    payload: {
      knowledge_item_id: row.id,
      chunk_index: 0,
      created_at: new Date().toISOString(),
    },
  }));

  try {
    // oxlint-disable-next-line no-await-in-loop -- sequential processing required
    await qdrantUpsert(points);
    synced += validBatch.length;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  ⚠️  Batch ${i}–${i + validBatch.length} upsert failed: ${msg}`);
    failed += validBatch.length;
    continue;
  }

  const pct = Math.round(((i + batch.length) / rows.length) * 100);
  process.stdout.write(
    `\r  ⏳ ${i + batch.length}/${rows.length} (${pct}%)  synced=${synced} failed=${failed}  `
  );
}

const _after = await qdrantCollectionInfo();

await ds.destroy();
