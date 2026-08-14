/**
 * Migration: Ensure every active agent has the safe built-in tool bindings.
 *
 * The tool-calling loop (UserLLMService.runWithTools) short-circuits when an
 * agent has zero bindings, so an agent with an empty assigned_mcp_tools column
 * can never call ANY tool — it answers "I don't have access to a live clock"
 * because, given its bindings, that is true. The executors for these tools have
 * existed in BaseToolExecutor all along; nothing ever wrote the bindings.
 *
 * Scope is deliberately minimal: time-utility and math-calculator are pure,
 * in-process, side-effect-free primitives (SecurityLevel.LOW, no approval).
 * shell-exec / http-request are NEVER auto-assigned — shell execution and SSRF
 * surface must remain an explicit per-agent operator decision.
 *
 * Idempotent and multi-instance safe: the tool_definitions upsert is
 * ON CONFLICT DO NOTHING on the unique name, and each binding append is a
 * single UPDATE guarded by a jsonb containment probe, so two instances booting
 * concurrently cannot double-append.
 *
 * The binding's toolId is the tool NAME, mirroring how the native shell-exec
 * registration sets id = name: agent_chat_routes' loadToolSchema resolves
 * non-UUID ids via findToolByName, and UnifiedToolRegistry dispatches
 * BaseToolExecutor.execute on the same name (the seed name IS the dispatch key).
 *
 * Standalone: bun apps/shared/services/src/database/migrations/ensure_default_agent_tools.ts
 * Programmatic: await new EnsureDefaultAgentTools().run();
 */

import { sql } from 'drizzle-orm';
import { createLogger } from '@uaip/utils';
import { SecurityLevel, ToolCategory } from '@uaip/types';
import { getControlDb, getIntelligenceDb, initializePlanes } from '../drizzle/clients/index';
import { toolDefinitions } from '../drizzle/schemas/control_schema';
import { ONBOARDING_GUIDE_AGENT_ID } from '../drizzle/constants';

const logger = createLogger({
  serviceName: 'migration:ensure-default-agent-tools',
  environment: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
});

export interface DefaultAgentToolBinding {
  toolId: string;
  toolName: string;
  serverName: string;
  enabled: boolean;
  requiresApproval: boolean;
}

export interface EnsureDefaultAgentToolsResult {
  toolDefinitionsEnsured: number;
  bindingsAppended: number;
}

interface DefaultToolSpec {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: Record<string, unknown>;
}

/**
 * Only pure computation goes here. Anything that touches the network, the
 * filesystem, a shell, or a third-party credential must be assigned explicitly
 * by an operator, never by a boot-time default.
 */
const DEFAULT_TOOLS: DefaultToolSpec[] = [
  {
    name: 'time-utility',
    description:
      'Date/time utility: get the current date and time, parse dates, add/subtract time units, and compute differences between dates',
    category: ToolCategory.SYSTEM,
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['current', 'parse', 'add', 'subtract', 'diff'],
          description: "Use 'current' for the current date and time",
        },
        timezone: { type: 'string' },
        format: { type: 'string', enum: ['ISO', 'date', 'time', 'locale', 'short'] },
        dateString: { type: 'string' },
        amount: { type: 'number' },
        unit: { type: 'string' },
        date: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'math-calculator',
    description:
      'Evaluate arithmetic: add, subtract, multiply, divide, power, sqrt, sin, cos, tan over a list of operands',
    category: ToolCategory.COMPUTATION,
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['add', 'subtract', 'multiply', 'divide', 'power', 'sqrt', 'sin', 'cos', 'tan'],
        },
        operands: { type: 'array', items: { type: 'number' } },
      },
      required: ['operation', 'operands'],
    },
  },
];

export const defaultToolBinding = (toolName: string): DefaultAgentToolBinding => ({
  toolId: toolName,
  toolName,
  serverName: 'native',
  enabled: true,
  requiresApproval: false,
});

export class EnsureDefaultAgentTools {
  async run(): Promise<EnsureDefaultAgentToolsResult> {
    const toolDefinitionsEnsured = await this.ensureToolDefinitions();
    const bindingsAppended = await this.ensureBindings();

    const result: EnsureDefaultAgentToolsResult = { toolDefinitionsEnsured, bindingsAppended };
    logger.info('Default agent tools ensured', { ...result });
    return result;
  }

  /**
   * The chat path resolves schemas from tool_definitions by name, so the rows
   * must exist in whichever deployment boots first — this cannot rely on
   * capability-registry's in-memory registration happening on another service.
   */
  private async ensureToolDefinitions(): Promise<number> {
    const db = getControlDb();
    let ensured = 0;

    for (const spec of DEFAULT_TOOLS) {
      // oxlint-disable-next-line no-await-in-loop -- two fixed rows, sequential is fine
      const inserted = await db
        .insert(toolDefinitions)
        .values({
          name: spec.name,
          description: spec.description,
          category: spec.category,
          parameters: spec.parameters,
          returnType: { type: 'object' },
          securityLevel: SecurityLevel.LOW,
          requiresApproval: false,
          isEnabled: true,
          version: '1.0.0',
          author: 'system',
          tags: ['native', 'default'],
        })
        .onConflictDoNothing({ target: toolDefinitions.name })
        .returning({ id: toolDefinitions.id });
      ensured += inserted.length;
    }
    return ensured;
  }

  /**
   * One guarded UPDATE per tool: appends the binding to every active agent that
   * does not already carry a binding with this toolName. The containment probe
   * makes the statement idempotent, and being a single statement makes it safe
   * under concurrent multi-instance boot (memory: in-process locks cannot
   * serialize writers here).
   *
   * The onboarding guide is excluded: it is a server-driven interviewer whose
   * prompt forbids tool use, and widening its capabilities would widen the
   * prompt-injection surface of the interview.
   */
  private async ensureBindings(): Promise<number> {
    const db = getIntelligenceDb();
    let appended = 0;

    for (const spec of DEFAULT_TOOLS) {
      const binding = defaultToolBinding(spec.name);
      const bindingJson = JSON.stringify([binding]);
      const probeJson = JSON.stringify([{ toolName: spec.name }]);

      // oxlint-disable-next-line no-await-in-loop -- two fixed tools, sequential is fine
      const result = await db.execute(sql`
        UPDATE agents
        SET assigned_mcp_tools = COALESCE(assigned_mcp_tools, '[]'::jsonb) || ${bindingJson}::jsonb,
            updated_at = NOW()
        WHERE is_active = true
          AND id != ${ONBOARDING_GUIDE_AGENT_ID}
          AND NOT (COALESCE(assigned_mcp_tools, '[]'::jsonb) @> ${probeJson}::jsonb)
      `);
      appended += result.rowCount ?? 0;
    }
    return appended;
  }

  /** Throws unless the tool definitions exist — bindings resolve by name at chat time. */
  async verify(): Promise<void> {
    const db = getControlDb();
    const names = DEFAULT_TOOLS.map((spec) => spec.name);
    const rows = await db
      .select({ name: toolDefinitions.name })
      .from(toolDefinitions)
      .where(sql`${toolDefinitions.name} = ANY(${names})`);

    const found = new Set(rows.map((row) => row.name));
    const missing = names.filter((name) => !found.has(name));
    if (missing.length > 0) {
      throw new Error(
        `Default tool definitions missing: ${missing.join(', ')}. ` +
          'Agent bindings resolve schemas by these names; chat tool-calling will silently drop them.'
      );
    }
  }
}

async function main(): Promise<void> {
  try {
    await initializePlanes();
    const result = await new EnsureDefaultAgentTools().run();
    await new EnsureDefaultAgentTools().verify();
    logger.info('Migration finished', { ...result });
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
