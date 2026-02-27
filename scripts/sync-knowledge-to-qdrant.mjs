#!/usr/bin/env node
/**
 * sync-knowledge-to-qdrant.mjs
 *
 * One-shot script: reads all knowledge_items from Postgres,
 * generates TEI embeddings in batches, upserts into Qdrant.
 *
 * Usage (from repo root):
 *   node scripts/sync-knowledge-to-qdrant.mjs
 *
 * Env vars (defaults match docker-compose):
 *   POSTGRES_HOST  POSTGRES_PORT  POSTGRES_USER  POSTGRES_PASSWORD  POSTGRES_DB
 *   TEI_EMBEDDING_URL   (http://localhost:8080 or http://tei-embeddings:80)
 *   QDRANT_URL          (http://localhost:6333)
 *   QDRANT_COLLECTION   (knowledge_embeddings)
 *   BATCH_SIZE          (32 — max per TEI request)
 */

import pg from 'pg';

const {
  POSTGRES_HOST = 'localhost',
  POSTGRES_PORT = '5432',
  POSTGRES_USER = 'uaip_user',
  POSTGRES_PASSWORD = 'uaip_password',
  POSTGRES_DB = 'uaip',
  TEI_EMBEDDING_URL = 'http://localhost:8080',
  QDRANT_URL = 'http://localhost:6333',
  QDRANT_COLLECTION = 'knowledge_embeddings',
  BATCH_SIZE = '32',
} = process.env;

const BATCH = parseInt(BATCH_SIZE, 10);

// ─── helpers ────────────────────────────────────────────────────────────────

async function teiEmbed(texts) {
  const res = await fetch(`${TEI_EMBEDDING_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: texts }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`TEI embed failed ${res.status}: ${txt}`);
  }
  const data = await res.json();
  // TEI returns float[][] or {embeddings: float[][]}
  return Array.isArray(data) ? data : (data.embeddings ?? data);
}

async function qdrantUpsert(points) {
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
  return res.json();
}

// Qdrant needs integer IDs — derive a deterministic uint53 from UUID
function uuidToInt(uuid, chunkIndex) {
  // Use first 12 hex chars of UUID as base-16, then xor chunk index
  const base = parseInt(uuid.replace(/-/g, '').slice(0, 13), 16);
  return (base * 100 + chunkIndex) % Number.MAX_SAFE_INTEGER;
}

// ─── main ───────────────────────────────────────────────────────────────────

const pool = new pg.Pool({
  host: POSTGRES_HOST,
  port: parseInt(POSTGRES_PORT),
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
  database: POSTGRES_DB,
});

try {
  console.log('Connecting to Postgres…');
  const client = await pool.connect();

  const { rows: items } = await client.query(
    `SELECT id, content FROM knowledge_items
     WHERE content IS NOT NULL AND LENGTH(TRIM(content)) > 0
     ORDER BY "createdAt" DESC`
  );
  client.release();

  console.log(`Found ${items.length} knowledge items to sync.`);
  if (items.length === 0) {
    console.log('Nothing to sync. Exiting.');
    process.exit(0);
  }

  let synced = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);

    // TEI can't handle very long texts — truncate at 512 tokens (~2000 chars)
    const texts = batch.map((r) => r.content.slice(0, 2000));

    let embeddings;
    try {
      embeddings = await teiEmbed(texts);
    } catch (err) {
      console.error(`  Batch ${i}-${i + batch.length} embed failed:`, err.message);
      failed += batch.length;
      continue;
    }

    // Build Qdrant points — each item → one vector (chunk_index = 0)
    const points = batch.map((row, idx) => ({
      id: uuidToInt(row.id, 0),
      vector: embeddings[idx],
      payload: {
        knowledge_item_id: row.id,
        chunk_index: 0,
        created_at: new Date().toISOString(),
      },
    }));

    try {
      await qdrantUpsert(points);
      synced += batch.length;
    } catch (err) {
      console.error(`  Batch ${i}-${i + batch.length} upsert failed:`, err.message);
      failed += batch.length;
      continue;
    }

    const pct = Math.round(((i + batch.length) / items.length) * 100);
    process.stdout.write(`\r  Progress: ${i + batch.length}/${items.length} (${pct}%)  `);
  }

  console.log(`\n\nSync complete. Synced: ${synced}, Failed: ${failed}`);

  // Verify
  const colRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`);
  const colData = await colRes.json();
  console.log(`Qdrant collection now has ${colData.result?.points_count ?? '?'} points.`);
} finally {
  await pool.end();
}
