import { initializeDatabase, getIntelligencePool, closeDatabase } from '@uaip/shared-services';

import { ExternalServiceError, InternalServerError } from '@uaip/utils';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
const {
  TEI_EMBEDDING_URL = 'http://tei-embeddings:80',
  QDRANT_URL = 'http://qdrant:6333',
  QDRANT_COLLECTION = 'knowledge_embeddings',
  BATCH_SIZE = '20',
} = process.env;

const BATCH = parseInt(BATCH_SIZE, 10);

async function teiEmbed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${TEI_EMBEDDING_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: texts }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new InternalServerError(`TEI embed failed ${res.status}: ${txt}`);
  }
  const data: unknown = await res.json();
  if (Array.isArray(data)) return data.filter((row): row is number[] => Array.isArray(row));
  const asRecord = isRecord(data) ? data : {};
  const embeddings = Array.isArray(asRecord['embeddings']) ? asRecord['embeddings'] : null;
  return (embeddings ?? []).filter((row): row is number[] => Array.isArray(row));
}

async function qdrantCollectionInfo(): Promise<{ result?: { points_count?: number } }> {
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`);
  const raw: unknown = await res.json();
  const obj = isRecord(raw) ? raw : {};
  const result = isRecord(obj['result']) ? obj['result'] : undefined;
  return { result: result ? { points_count: typeof result.points_count === 'number' ? result.points_count : undefined } : undefined };
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
    throw new ExternalServiceError(`Qdrant upsert failed ${res.status}: ${txt}`);
  }
}

function uuidToUint(uuid: string, chunkIndex: number): number {
  const hex = uuid.replace(/-/g, '').slice(0, 13);
  return (parseInt(hex, 16) * 100 + chunkIndex) % Number.MAX_SAFE_INTEGER;
}

await initializeDatabase();
const pool = getIntelligencePool();

const result = await pool.query<{ id: string; content: string }>(
  `SELECT id, content FROM knowledge_items
   WHERE content IS NOT NULL AND LENGTH(TRIM(content)) > 0
   ORDER BY created_at DESC`
);
const rows = result.rows;

const info = await qdrantCollectionInfo();
const _existingCount = info.result?.points_count ?? 0;

let synced = 0;
let failed = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const texts: string[] = batch.map((r: { id: string; content: string }) =>
    r.content.replace(/\r\n/g, '\n').slice(0, 2000).trim()
  );
  const validBatch = batch.filter(
    (_: { id: string; content: string }, idx: number) => texts[idx].length > 0
  );
  const validTexts: string[] = texts.filter((t: string) => t.length > 0);
  if (validTexts.length === 0) continue;

  let embeddings: number[][];
  try {
    // oxlint-disable-next-line no-await-in-loop -- sequential batch processing required for per-batch error isolation
    embeddings = await teiEmbed(validTexts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  Batch ${i}–${i + validBatch.length} embed failed: ${msg}`);
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
    // oxlint-disable-next-line no-await-in-loop -- sequential batch processing required for per-batch error isolation
    await qdrantUpsert(points);
    synced += validBatch.length;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  Batch ${i}–${i + validBatch.length} upsert failed: ${msg}`);
    failed += validBatch.length;
    continue;
  }

  const pct = Math.round(((i + batch.length) / rows.length) * 100);
  process.stdout.write(
    `\r  ${i + batch.length}/${rows.length} (${pct}%)  synced=${synced} failed=${failed}  `
  );
}

const _after = await qdrantCollectionInfo();

await closeDatabase();
