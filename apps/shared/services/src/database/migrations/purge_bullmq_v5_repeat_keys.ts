/**
 * Migration: remove the legacy repeatable-job keys bullmq 5 left in Redis.
 *
 * bullmq 6 removed the whole legacy repeatable-job API — the `repeat` option on
 * Queue#add, the Repeat class, getRepeatableJobs() and removeRepeatableByKey().
 * Job Schedulers replace it, and WorkflowEngineService now uses
 * upsertJobScheduler / removeJobScheduler.
 *
 * That leaves a hazard on any Redis that ran v5: the `repeat:` hash and the
 * delayed jobs it spawned still exist, and the v6 API cannot see or remove them
 * — `removeJobScheduler` looks in a different keyspace. So they linger, and the
 * delayed entries can still fire, producing duplicate workflow runs alongside
 * the new schedulers.
 *
 * This removes the v5 repeat keyspace for the workflow queue. Job Schedulers are
 * re-registered from the database at boot by WorkflowEngineService.loadAll(), so
 * deleting them costs nothing beyond one restart.
 *
 * Standalone:
 *   bun .../purge_bullmq_v5_repeat_keys.ts                # dry run
 *   bun .../purge_bullmq_v5_repeat_keys.ts --apply
 */

import Redis from 'ioredis';
import { createLogger } from '@uaip/utils';
import { config } from '@uaip/config';

const logger = createLogger({
  serviceName: 'purge-bullmq-v5-repeat-keys',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

/**
 * Queues that carried repeatable jobs under v5. `workflow.definition.trigger` is
 * the only one WorkflowEngineService registered against.
 */
const QUEUES = ['workflow.definition.trigger'];

export interface PurgeRepeatKeysResult {
  found: string[];
  deleted: string[];
  dryRun: boolean;
}

export async function purgeBullmqV5RepeatKeys(options: {
  apply: boolean;
  redis?: Redis;
}): Promise<PurgeRepeatKeysResult> {
  const redis =
    options.redis ??
    new Redis({
      host: config.redis?.host ?? 'localhost',
      port: config.redis?.port ?? 6379,
      password: config.redis?.password ?? undefined,
      maxRetriesPerRequest: null,
    });

  const found: string[] = [];

  for (const queue of QUEUES) {
    // v5 stored repeatable metadata at bull:<queue>:repeat (a hash) and the
    // spawned delayed jobs under bull:<queue>:delayed. Only the repeat keyspace
    // is legacy — `delayed` is still used by v6, so it is deliberately NOT
    // touched here; orphaned delayed entries drain on their own once nothing
    // re-registers them.
    const pattern = `bull:${queue}:repeat*`;
    // oxlint-disable-next-line no-await-in-loop -- one small fixed queue list
    const keys = await scanKeys(redis, pattern);
    found.push(...keys);
  }

  if (found.length === 0) {
    logger.info('No bullmq v5 repeat keys found — nothing to do');
    if (!options.redis) await redis.quit();
    return { found, deleted: [], dryRun: !options.apply };
  }

  logger.info('Found legacy bullmq v5 repeat keys', { count: found.length, keys: found });

  if (!options.apply) {
    logger.info('DRY RUN — nothing deleted. Re-run with --apply to delete.');
    if (!options.redis) await redis.quit();
    return { found, deleted: [], dryRun: true };
  }

  await redis.del(...found);
  logger.info('Deleted legacy bullmq v5 repeat keys', { count: found.length });

  if (!options.redis) await redis.quit();
  return { found, deleted: found, dryRun: false };
}

/** SCAN rather than KEYS: KEYS blocks the server, and this runs against live Redis. */
async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = '0';
  do {
    // oxlint-disable-next-line no-await-in-loop -- cursor iteration is inherently sequential
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 250);
    found.push(...keys);
    cursor = next;
  } while (cursor !== '0');
  return found;
}

async function main(): Promise<void> {
  try {
    const result = await purgeBullmqV5RepeatKeys({ apply: process.argv.includes('--apply') });
    logger.info('Migration finished', {
      dryRun: result.dryRun,
      found: result.found.length,
      deleted: result.deleted.length,
    });
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
