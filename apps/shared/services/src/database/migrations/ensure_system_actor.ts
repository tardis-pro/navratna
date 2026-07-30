/**
 * Migration: Ensure the system actor identity exists.
 *
 * Platform-initiated work (workflow firing, RDLO approval gates, the dev loop)
 * creates operations with no human actor. `operations.agent_id` is verified by
 * CrossPlaneGuard, so without these rows those flows fail closed.
 *
 * CANONICAL DELIVERY is drizzle/migrations/0009_system_actor.sql — that is what
 * reaches production. This class is the programmatic equivalent, kept for dev
 * convenience (DatabaseSeeder calls run()) and for verify(), which services use
 * as a boot-time diagnostic. Keep the SQL in both places in step.
 *
 * Idempotent — safe to re-run.
 *
 * Standalone: bun apps/shared/services/src/database/migrations/ensure_system_actor.ts
 * Programmatic: await new EnsureSystemActor().run();
 */

import { createLogger } from '@uaip/utils';
import { initializePlanes, getControlPool, getIntelligencePool } from '../drizzle/clients/index';
import {
  ADMIN_ORG_ID,
  SYSTEM_AGENT_ID,
  SYSTEM_AGENT_NAME,
  SYSTEM_PERSONA_ID,
  SYSTEM_USER_EMAIL,
  SYSTEM_USER_ID,
} from '../drizzle/constants';

const logger = createLogger({
  serviceName: 'migration:ensure-system-actor',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export interface EnsureSystemActorResult {
  userCreated: boolean;
  personaCreated: boolean;
  agentCreated: boolean;
}

export class EnsureSystemActor {
  async run(): Promise<EnsureSystemActorResult> {
    const controlPool = getControlPool();
    const intelligencePool = getIntelligencePool();

    // The account must be unauthenticatable: is_active=false is enforced
    // centrally before any session is issued, and the hash never verifies.
    // DO UPDATE, not DO NOTHING: a row left active or with a usable password
    // hash by an earlier partial run would stay exploitable forever.
    const userResult = await controlPool.query(
      `INSERT INTO users (id, email, first_name, last_name, role, organization_id, password_hash, is_active)
       VALUES ($1, $2, 'System', 'Actor', 'system', $3, 'x', false)
       ON CONFLICT (id) DO UPDATE
         SET is_active = false,
             password_hash = 'x',
             email = EXCLUDED.email,
             role = 'system',
             organization_id = EXCLUDED.organization_id`,
      [SYSTEM_USER_ID, SYSTEM_USER_EMAIL, ADMIN_ORG_ID]
    );

    // personas before agents: agents.persona_id is NOT NULL and FKs personas.id.
    const personaResult = await intelligencePool.query(
      `INSERT INTO personas (id, name, role, description, background, system_prompt, created_by, organization_id)
       VALUES ($1, $2, 'system', 'Platform-initiated work', 'Automated platform actor.',
               'You are the platform system actor.', $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [SYSTEM_PERSONA_ID, SYSTEM_AGENT_NAME, SYSTEM_USER_ID, ADMIN_ORG_ID]
    );

    const agentResult = await intelligencePool.query(
      `INSERT INTO agents (id, name, description, role, persona_id, intelligence_config,
                           security_context, created_by, organization_id, is_active)
       VALUES ($1, $2, 'Platform-initiated work', 'assistant', $3, '{}'::jsonb,
               '{}'::jsonb, $4, $5, true)
       ON CONFLICT (id) DO NOTHING`,
      [SYSTEM_AGENT_ID, SYSTEM_AGENT_NAME, SYSTEM_PERSONA_ID, SYSTEM_USER_ID, ADMIN_ORG_ID]
    );

    const result: EnsureSystemActorResult = {
      userCreated: (userResult.rowCount ?? 0) > 0,
      personaCreated: (personaResult.rowCount ?? 0) > 0,
      agentCreated: (agentResult.rowCount ?? 0) > 0,
    };

    logger.info('System actor ensured', { ...result, systemAgentId: SYSTEM_AGENT_ID });
    return result;
  }

  /** Throws unless all three rows exist AND the user is unauthenticatable. */
  async verify(): Promise<void> {
    const { rows: userRows } = await getControlPool().query<{ id: string; is_active: boolean }>(
      `SELECT id, is_active FROM users WHERE id = $1 LIMIT 1`,
      [SYSTEM_USER_ID]
    );
    const { rows: personaRows } = await getIntelligencePool().query<{ id: string }>(
      `SELECT id FROM personas WHERE id = $1 LIMIT 1`,
      [SYSTEM_PERSONA_ID]
    );
    const { rows: agentRows } = await getIntelligencePool().query<{ id: string }>(
      `SELECT id FROM agents WHERE id = $1 LIMIT 1`,
      [SYSTEM_AGENT_ID]
    );

    const missing: string[] = [];
    if (userRows.length === 0) missing.push(`user:${SYSTEM_USER_ID}`);
    if (personaRows.length === 0) missing.push(`persona:${SYSTEM_PERSONA_ID}`);
    if (agentRows.length === 0) missing.push(`agent:${SYSTEM_AGENT_ID}`);

    if (missing.length > 0) {
      throw new Error(
        `System actor identity is incomplete (${missing.join(', ')}). ` +
          'Run the ensure_system_actor migration — platform-initiated operations will fail closed without it.'
      );
    }

    // Existence is not enough: an ACTIVE system user is a login-able superuser.
    if (userRows[0].is_active !== false) {
      throw new Error(
        `System actor ${SYSTEM_USER_ID} is active and therefore authenticatable. ` +
          'Re-run the ensure_system_actor migration to disable it.'
      );
    }
  }
}

async function main(): Promise<void> {
  try {
    await initializePlanes();
    const result = await new EnsureSystemActor().run();
    await new EnsureSystemActor().verify();
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
