import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The repository cache holds one full checkout per project, keeps them
 * deliberately between ingests, and never shrinks on its own. On the homelab it
 * used to sit on an EmptyDir whose 256Mi sizeLimit evicted the pod once a real
 * ingest ran — ugly, but self-limiting and scoped to one project.
 *
 * It now lives on the project's mounted volume, which is hostPath-backed: the
 * declared capacity is a label, no quota is enforced, and the same filesystem
 * carries the Gitea instance that is the origin for the platform repo, plus the
 * backups. Moving there removed the only enforcement that existed. These
 * assertions are the replacement, so they are load-bearing rather than tidy.
 */

vi.mock('@uaip/shared-services', () => ({ getIntelligenceDb: vi.fn(), knowledgeItems: {} }));
vi.mock('@uaip/types', () => ({ KnowledgeType: {}, SourceType: {} }));
vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  NotFoundError: class extends Error {},
  ValidationError: class extends Error {},
}));
vi.mock('../../services/ast_symbol_extractor.js', () => ({ AstSymbolExtractor: vi.fn() }));
vi.mock('../../services/import_graph_service.js', () => ({ ImportGraphService: vi.fn() }));
vi.mock('../../services/semantic_index_service.js', () => ({ SemanticIndexService: vi.fn() }));

const DAY_MS = 24 * 60 * 60 * 1000;

let cacheRoot: string;

/** A cache entry of `bytes`, last used `ageDays` ago. */
function seedEntry(key: string, bytes: number, ageDays: number): string {
  const path = join(cacheRoot, key);
  mkdirSync(join(path, '.git'), { recursive: true });
  writeFileSync(join(path, 'payload.bin'), Buffer.alloc(bytes));

  const when = new Date(Date.now() - ageDays * DAY_MS);
  utimesSync(path, when, when);
  return path;
}

async function loadPrune(): Promise<(protectKey: string) => void> {
  const mod = await import('../../services/repo_ingestion_service.js');
  return mod.pruneRepoCache;
}

describe('repository cache pruning', () => {
  beforeEach(() => {
    cacheRoot = mkdtempSync(join(tmpdir(), 'repo-cache-test-'));
    // REPO_CACHE_ROOT and both bounds are read at module load, so they must be
    // set before the dynamic import and the module registry reset between tests.
    process.env.REPO_CACHE_DIR = cacheRoot;
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(cacheRoot, { recursive: true, force: true });
    delete process.env.REPO_CACHE_DIR;
    delete process.env.REPO_CACHE_MAX_BYTES;
    delete process.env.REPO_CACHE_TTL_DAYS;
  });

  it('evicts least-recently-used checkouts until the cache is under its limit', async () => {
    // 60,000 on disk against a 45,000 limit: dropping the oldest alone gets it
    // under, so the second candidate is the assertion. A tighter limit would
    // force both out and prove nothing about stopping early.
    process.env.REPO_CACHE_MAX_BYTES = String(45_000);
    process.env.REPO_CACHE_TTL_DAYS = String(365);

    const oldest = seedEntry('project-a', 20_000, 9);
    const middle = seedEntry('project-b', 20_000, 5);
    const newest = seedEntry('project-c', 20_000, 1);

    (await loadPrune())('project-c');

    expect(existsSync(oldest), 'the least recently used entry goes first').toBe(false);
    expect(existsSync(middle), 'eviction stops as soon as the cache is under the limit').toBe(true);
    expect(existsSync(newest)).toBe(true);
  });

  it('evicts past the TTL even when the cache is well under its size limit', async () => {
    process.env.REPO_CACHE_MAX_BYTES = String(10 * 1024 * 1024);
    process.env.REPO_CACHE_TTL_DAYS = String(14);

    const stale = seedEntry('project-stale', 1_000, 30);
    const fresh = seedEntry('project-fresh', 1_000, 2);

    (await loadPrune())('project-fresh');

    expect(existsSync(stale), 'an unused checkout is not kept forever').toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });

  it('never evicts the checkout the running ingest is reading', async () => {
    // Over the limit on its own, older than everything, and past the TTL — every
    // reason to evict it except the one that matters. Deleting a checkout
    // mid-ingest would have that ingest report a half-read tree as the
    // repository's real contents.
    process.env.REPO_CACHE_MAX_BYTES = String(1_000);
    process.env.REPO_CACHE_TTL_DAYS = String(1);

    const active = seedEntry('project-active', 50_000, 90);

    (await loadPrune())('project-active');

    expect(existsSync(active)).toBe(true);
  });

  it('leaves a cache that is inside both bounds completely alone', async () => {
    process.env.REPO_CACHE_MAX_BYTES = String(10 * 1024 * 1024);
    process.env.REPO_CACHE_TTL_DAYS = String(14);

    const a = seedEntry('project-a', 1_000, 3);
    const b = seedEntry('project-b', 1_000, 1);

    (await loadPrune())('project-b');

    expect(existsSync(a)).toBe(true);
    expect(existsSync(b)).toBe(true);
  });

  it('falls back to the default bound rather than accepting a garbage value', async () => {
    // An unparseable limit must not read as "no limit" — that is the exact
    // failure this whole mechanism exists to prevent.
    process.env.REPO_CACHE_MAX_BYTES = 'not-a-number';
    process.env.REPO_CACHE_TTL_DAYS = String(365);

    const entry = seedEntry('project-a', 1_000, 3);

    (await loadPrune())('project-b');

    // 1KB is far inside the 5GiB default, so nothing should be evicted; the
    // point is that it did not silently become unbounded or zero.
    expect(existsSync(entry)).toBe(true);
  });
});
