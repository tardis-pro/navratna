/**
 * Migration: Backfill Agent chatConfig Defaults (issue #264)
 *
 * Updates agents missing `configuration.chatConfig` with safe defaults.
 * Idempotent — agents that already have chatConfig are skipped.
 *
 * Standalone: bun apps/shared/services/src/database/migrations/backfill_agent_chat_config.ts
 * Programmatic:
 *   const result = await new BackfillAgentChatConfig().run();
 */

import { createLogger } from '@uaip/utils';
import { initializePlanes, getIntelligencePool } from '../drizzle/clients/index';

const logger = createLogger({
  serviceName: 'migration:backfill-agent-chat-config',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

const DEFAULT_CHAT_CONFIG = {
  enableKnowledgeAccess: true,
  enableMemory: true,
  enableLearning: true,
  confidenceThreshold: 0.5,
  maxTokens: 2048,
} as const;

export interface BackfillResult {
  updated: number;
  skipped: number;
}

export class BackfillAgentChatConfig {
  async run(): Promise<BackfillResult> {
    const pool = getIntelligencePool();

    const { rows: countRows } = await pool.query<{ total: string; has_config: string }>(
      `SELECT
         COUNT(*)                                              AS total,
         COUNT(*) FILTER (
           WHERE configuration IS NOT NULL
             AND configuration ? 'chatConfig'
             AND jsonb_typeof(configuration -> 'chatConfig') <> 'null'
         )                                                    AS has_config
       FROM agents`
    );

    const totalAgents = parseInt(countRows[0]?.total ?? '0', 10);
    const alreadyConfigured = parseInt(countRows[0]?.has_config ?? '0', 10);

    if (totalAgents === 0) {
      logger.info('Backfill skipped — no agents found in the intelligence plane');
      return { updated: 0, skipped: 0 };
    }

    if (alreadyConfigured === totalAgents) {
      logger.info('Backfill skipped — all agents already have chatConfig', {
        count: totalAgents,
      });
      return { updated: 0, skipped: totalAgents };
    }

    const { rows: updateRows } = await pool.query<{ updated_count: string }>(
      `WITH updated AS (
         UPDATE agents
         SET
           configuration = COALESCE(configuration, '{}'::jsonb)
             || jsonb_build_object(
                  'chatConfig', jsonb_build_object(
                    'enableKnowledgeAccess', $1::boolean,
                    'enableMemory',          $2::boolean,
                    'enableLearning',        $3::boolean,
                    'confidenceThreshold',   $4::numeric,
                    'maxTokens',             $5::integer
                  )
                ),
           updated_at = NOW()
         WHERE
           configuration IS NULL
           OR NOT (configuration ? 'chatConfig')
           OR jsonb_typeof(configuration -> 'chatConfig') = 'null'
         RETURNING id
       )
       SELECT COUNT(*) AS updated_count FROM updated`,
      [
        DEFAULT_CHAT_CONFIG.enableKnowledgeAccess,
        DEFAULT_CHAT_CONFIG.enableMemory,
        DEFAULT_CHAT_CONFIG.enableLearning,
        DEFAULT_CHAT_CONFIG.confidenceThreshold,
        DEFAULT_CHAT_CONFIG.maxTokens,
      ]
    );

    const updated = parseInt(updateRows[0]?.updated_count ?? '0', 10);

    logger.info('Agent chatConfig backfill complete', {
      updated,
      skipped: alreadyConfigured,
      total: totalAgents,
      defaults: DEFAULT_CHAT_CONFIG,
    });

    return { updated, skipped: alreadyConfigured };
  }
}

async function main(): Promise<void> {
  try {
    await initializePlanes();
    const result = await new BackfillAgentChatConfig().run();
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
