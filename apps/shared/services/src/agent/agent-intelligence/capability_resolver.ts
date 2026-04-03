import {
  Capability,
  SecurityLevel,
  ToolCategory,
  ToolDefinition,
  CapabilityResolver,
  JSONSchema,
  ToolExample,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { CapabilityDiscoveryService } from '../../capability_discovery_service';
import { DatabaseService } from '../../database_service';
import { ToolService } from '../../services/tool_service';

// ============================================================================
// Plan-based resolution types
// ============================================================================

/**
 * A single capability requirement extracted from an execution plan step.
 *
 * Callers construct these from `ExecutionPlan.steps` (or equivalent) and pass
 * the slice to `resolveFromPlanSteps`.
 */
export interface PlanStepRequirement {
  /** Step identifier (from ExecutionPlan.steps[].id). */
  stepId: string;
  /**
   * Step type string from the plan (e.g. `'api'`, `'database'`,
   * `'tool_execution'`). The resolver maps this to a `ToolCategory`.
   */
  stepType: string;
  /** Human-readable description of what the step needs. */
  description: string;
  /**
   * Explicit category hint — when provided this overrides the
   * `stepType → ToolCategory` mapping.
   */
  category?: ToolCategory;
  /**
   * Whether this step is mandatory. Unresolved required steps appear in
   * `PlanCapabilityResolutionResult.unresolvedSteps`.
   */
  required: boolean;
}

/** Source breakdown for observability. */
export interface CapabilitySourceBreakdown {
  /** Tools discovered through dynamic registry lookup by category. */
  dynamic: number;
  /** Tools sourced from the agent's static `attachedTools` list. */
  fallback: number;
}

/**
 * Result returned by `resolveFromPlanSteps`.
 *
 * `resolvedTools` is the merged, deduplicated list that should be used for
 * execution. `unresolvedSteps` lists step IDs that are marked `required` but
 * for which no tool was found — the caller can surface these as capability
 * gaps.
 */
export interface PlanCapabilityResolutionResult {
  /** Merged, deduplicated `ToolDefinition` list (dynamic ∪ fallback). */
  resolvedTools: ToolDefinition[];
  /** Source counters for observability / debugging. */
  sourceBreakdown: CapabilitySourceBreakdown;
  /**
   * Step IDs for required steps where no matching tool was found in either
   * the dynamic lookup or the fallback list.
   */
  unresolvedSteps: string[];
}

// ============================================================================
// Step-type → ToolCategory mapping table
// ============================================================================

/**
 * Maps common plan step type strings to `ToolCategory` values.
 *
 * Entries are lower-cased so the lookup is case-insensitive. Add new
 * mappings here when new step types are introduced in the planning layer.
 */
const STEP_TYPE_TO_CATEGORY: Readonly<Record<string, ToolCategory>> = {
  // API / HTTP
  api: ToolCategory.API,
  http: ToolCategory.API,
  rest: ToolCategory.API,
  webhook: ToolCategory.API,
  // Database
  database: ToolCategory.DATABASE,
  db: ToolCategory.DATABASE,
  sql: ToolCategory.DATABASE,
  query: ToolCategory.DATABASE,
  // Web search / browsing
  web_search: ToolCategory.WEB_SEARCH,
  search: ToolCategory.WEB_SEARCH,
  browse: ToolCategory.WEB_SEARCH,
  scrape: ToolCategory.WEB_SEARCH,
  // Code execution
  code_execution: ToolCategory.CODE_EXECUTION,
  code: ToolCategory.CODE_EXECUTION,
  execute: ToolCategory.CODE_EXECUTION,
  script: ToolCategory.CODE_EXECUTION,
  run: ToolCategory.CODE_EXECUTION,
  // File system
  file_system: ToolCategory.FILE_SYSTEM,
  file: ToolCategory.FILE_SYSTEM,
  storage: ToolCategory.FILE_SYSTEM,
  filesystem: ToolCategory.FILE_SYSTEM,
  // Computation
  computation: ToolCategory.COMPUTATION,
  compute: ToolCategory.COMPUTATION,
  math: ToolCategory.COMPUTATION,
  calculate: ToolCategory.COMPUTATION,
  // Communication
  communication: ToolCategory.COMMUNICATION,
  email: ToolCategory.COMMUNICATION,
  message: ToolCategory.COMMUNICATION,
  notify: ToolCategory.COMMUNICATION,
  slack: ToolCategory.COMMUNICATION,
  // Knowledge graph
  knowledge_graph: ToolCategory.KNOWLEDGE_GRAPH,
  knowledge: ToolCategory.KNOWLEDGE_GRAPH,
  graph: ToolCategory.KNOWLEDGE_GRAPH,
  neo4j: ToolCategory.KNOWLEDGE_GRAPH,
  // Deployment
  deployment: ToolCategory.DEPLOYMENT,
  deploy: ToolCategory.DEPLOYMENT,
  release: ToolCategory.DEPLOYMENT,
  publish: ToolCategory.DEPLOYMENT,
  // Monitoring
  monitoring: ToolCategory.MONITORING,
  monitor: ToolCategory.MONITORING,
  observability: ToolCategory.MONITORING,
  metrics: ToolCategory.MONITORING,
  // Analysis
  analysis: ToolCategory.ANALYSIS,
  analyze: ToolCategory.ANALYSIS,
  analytics: ToolCategory.ANALYSIS,
  evaluate: ToolCategory.ANALYSIS,
  // Generation / artifacts
  generation: ToolCategory.GENERATION,
  generate: ToolCategory.GENERATION,
  artifact_generation: ToolCategory.GENERATION,
  artifact: ToolCategory.GENERATION,
  synthesize: ToolCategory.GENERATION,
  // System
  system: ToolCategory.SYSTEM,
  os: ToolCategory.SYSTEM,
  // Network
  network: ToolCategory.NETWORK,
  tcp: ToolCategory.NETWORK,
  // Development tooling
  development: ToolCategory.DEVELOPMENT,
  dev: ToolCategory.DEVELOPMENT,
  build: ToolCategory.DEVELOPMENT,
  lint: ToolCategory.DEVELOPMENT,
  test: ToolCategory.DEVELOPMENT,
  // MCP / generic tool execution
  mcp: ToolCategory.MCP,
  tool_execution: ToolCategory.MCP,
  tool: ToolCategory.MCP,
};

// ============================================================================
// Main resolver class
// ============================================================================

export class ToolRegistryCapabilityResolver implements CapabilityResolver {
  private capabilityDiscoveryService: CapabilityDiscoveryService;
  private toolService: ToolService | null = null;

  constructor(
    private toolRegistry: {
      lookup: (toolName: string) => Promise<ToolDefinition | null>;
      getTools: () => Promise<ToolDefinition[]>;
    },
    capabilityDiscoveryService?: CapabilityDiscoveryService
  ) {
    this.capabilityDiscoveryService =
      capabilityDiscoveryService || new CapabilityDiscoveryService(new DatabaseService());
  }

  // ─── CapabilityResolver interface ─────────────────────────────────────────

  async lookup(toolName: string): Promise<ToolDefinition | null> {
    try {
      const tool = await this.toolRegistry.lookup(toolName);
      if (!tool) {
        logger.warn(`Capability not found: ${toolName}`);
        return null;
      }
      return tool;
    } catch (error) {
      logger.error(`Error resolving capability ${toolName}:`, error);
      throw new Error(`Failed to resolve capability: ${toolName}`, { cause: error });
    }
  }

  async validateCapabilities(
    requiredCapabilities: string[]
  ): Promise<{ valid: boolean; missing: string[] }> {
    const missing: string[] = [];

    for (const capability of requiredCapabilities) {
      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const tool = await this.lookup(capability);
      if (!tool) {
        missing.push(capability);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  async getAvailableCapabilities(): Promise<string[]> {
    try {
      const tools = await this.toolRegistry.getTools();
      return tools.filter((tool) => tool.isEnabled).map((tool) => tool.name);
    } catch (error) {
      logger.error('Error getting available capabilities:', error);
      return [];
    }
  }

  /**
   * Resolves capabilities using the agent's static `toolRegistry` plus a
   * supplemental semantic search via `CapabilityDiscoveryService`.
   *
   * Prefer `resolveFromPlanSteps` when a typed execution plan is available,
   * as it performs targeted category-based lookups rather than a broad
   * semantic search.
   */
  async resolveCapabilities(
    agentId: string,
    context: Record<string, unknown>
  ): Promise<ToolDefinition[]> {
    const staticCapabilities = (await this.toolRegistry.getTools()).filter(
      (tool) => tool.isEnabled
    );
    const query = this.buildPlanNeedsDescription(context);

    let dynamicCapabilities: Capability[] = [];
    try {
      dynamicCapabilities = await this.capabilityDiscoveryService.searchCapabilities({
        query,
        limit: 5,
      });
    } catch (error) {
      logger.warn('Dynamic capability discovery failed; using static capabilities only', {
        agentId,
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const mappedDynamic = dynamicCapabilities.map((capability) =>
      this.mapCapabilityToToolDefinition(capability)
    );

    const deduplicated = new Map<string, ToolDefinition>();
    for (const tool of [...staticCapabilities, ...mappedDynamic]) {
      const key = `${tool.id}:${tool.name}`;
      if (!deduplicated.has(key)) {
        deduplicated.set(key, tool);
      }
    }

    return Array.from(deduplicated.values());
  }

  // ─── Plan-based dynamic resolution ────────────────────────────────────────

  /**
   * Resolves tool capabilities based on a plan's step requirements.
   *
   * Resolution strategy:
   * 1. Maps each step's `stepType` (or explicit `category`) to a `ToolCategory`.
   * 2. Issues targeted DB queries via `ToolService.findToolsByCategory` for
   *    every unique category derived from the plan.
   * 3. Supplements (or, on total failure, replaces) dynamic results with the
   *    agent's static `attachedTools` list.
   * 4. Returns a merged, deduplicated `ToolDefinition` list.
   *
   * @param steps        Requirements extracted from the execution plan steps.
   * @param attachedTools  The static tool list from agent creation — used as
   *                       the fallback when dynamic lookup fails or is empty.
   */
  async resolveFromPlanSteps(
    steps: PlanStepRequirement[],
    attachedTools: ToolDefinition[]
  ): Promise<PlanCapabilityResolutionResult> {
    logger.debug('Resolving capabilities from plan steps', {
      stepCount: steps.length,
      attachedToolCount: attachedTools.length,
    });

    // ── 1. Build category → step-IDs mapping (avoids duplicate queries) ──────
    const categoryToStepIds = new Map<ToolCategory, string[]>();
    const unmappedStepIds = new Set<string>();

    for (const step of steps) {
      const category = step.category ?? this.mapStepTypeToCategory(step.stepType);
      if (category !== null) {
        const existing = categoryToStepIds.get(category) ?? [];
        existing.push(step.stepId);
        categoryToStepIds.set(category, existing);
      } else {
        unmappedStepIds.add(step.stepId);
        logger.debug('No category mapping for plan step type', {
          stepId: step.stepId,
          stepType: step.stepType,
        });
      }
    }

    // ── 2. Dynamic registry lookup per category ───────────────────────────────
    const dynamicToolsById = new Map<string, ToolDefinition>();
    const resolvedCategoryStepIds = new Set<string>();

    for (const [category, stepIds] of categoryToStepIds) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one query per distinct category
        const tools = await this.lookupToolsByCategory(category);
        if (tools.length > 0) {
          for (const tool of tools) {
            dynamicToolsById.set(tool.id, tool);
          }
          for (const stepId of stepIds) {
            resolvedCategoryStepIds.add(stepId);
          }
          logger.debug('Dynamic category lookup succeeded', {
            category,
            toolCount: tools.length,
            stepIds,
          });
        } else {
          logger.debug('Dynamic category lookup returned no tools', { category, stepIds });
        }
      } catch (error) {
        logger.warn('Dynamic category lookup failed; will rely on attachedTools', {
          category,
          stepIds,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const dynamicTools = Array.from(dynamicToolsById.values());

    // ── 3. Compute unresolved required steps ──────────────────────────────────
    const unresolvedSteps = steps
      .filter(
        (s) =>
          s.required &&
          !resolvedCategoryStepIds.has(s.stepId) &&
          !unmappedStepIds.has(s.stepId)
      )
      .map((s) => s.stepId);

    if (unresolvedSteps.length > 0) {
      logger.warn('Required plan steps could not be dynamically resolved', { unresolvedSteps });
    }

    // ── 4. Merge dynamic results with attachedTools ───────────────────────────
    //
    // When dynamic lookup returns nothing at all, attachedTools acts as the
    // complete fallback. Otherwise, attachedTools supplements the dynamic set
    // with any enabled tools not already present (deduplicated by id).
    const enabledAttached = attachedTools.filter((t) => t.isEnabled);

    if (dynamicTools.length === 0 && enabledAttached.length > 0) {
      logger.info('Dynamic lookup yielded no results; using attachedTools as fallback', {
        attachedToolCount: enabledAttached.length,
      });
    }

    const deduplicated = new Map<string, ToolDefinition>();

    // Dynamic results take priority (inserted first)
    for (const tool of dynamicTools) {
      deduplicated.set(tool.id, tool);
    }

    // attachedTools fill gaps
    for (const tool of enabledAttached) {
      if (!deduplicated.has(tool.id)) {
        deduplicated.set(tool.id, tool);
      }
    }

    const resolvedTools = Array.from(deduplicated.values());

    // Count how many of the final set came from each source
    const dynamicIds = new Set(dynamicTools.map((t) => t.id));
    const fallbackCount = resolvedTools.filter((t) => !dynamicIds.has(t.id)).length;

    logger.info('Plan step capability resolution complete', {
      dynamicCount: dynamicTools.length,
      fallbackCount,
      totalResolved: resolvedTools.length,
      unresolvedRequiredSteps: unresolvedSteps.length,
    });

    return {
      resolvedTools,
      sourceBreakdown: {
        dynamic: dynamicTools.length,
        fallback: fallbackCount,
      },
      unresolvedSteps,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Lazily instantiates `ToolService` using the singleton pattern. */
  private getToolService(): ToolService {
    if (this.toolService === null) {
      this.toolService = ToolService.getInstance();
    }
    return this.toolService;
  }

  /**
   * Maps a plan step type string to a `ToolCategory`.
   *
   * The comparison is case-insensitive and supports underscore/hyphen variants
   * (e.g. `'web-search'` and `'web_search'` both resolve).
   *
   * Returns `null` when no mapping is found so callers can decide how to
   * handle unmapped step types without throwing.
   */
  private mapStepTypeToCategory(stepType: string): ToolCategory | null {
    const normalized = stepType.toLowerCase().replaceAll('-', '_');
    return STEP_TYPE_TO_CATEGORY[normalized] ?? null;
  }

  /**
   * Fetches enabled tools for a given `ToolCategory` from the control-plane
   * database via `ToolService`.
   *
   * The returned rows are mapped to `ToolDefinition` objects; rows that fail
   * the type check are silently skipped with a debug log.
   */
  private async lookupToolsByCategory(category: ToolCategory): Promise<ToolDefinition[]> {
    const rows = await this.getToolService().findToolsByCategory(category);

    const tools: ToolDefinition[] = [];
    for (const row of rows) {
      const tool = this.mapToolRowToDefinition(row);
      if (tool !== null && tool.isEnabled) {
        tools.push(tool);
      }
    }
    return tools;
  }

  /**
   * Type-safe mapping from a raw DB row (`Record<string, unknown>`) returned
   * by `ToolService.findToolsByCategory` to a typed `ToolDefinition`.
   *
   * Uses the `in` operator for narrowing — no type assertions.
   * Returns `null` if the row is missing required fields.
   */
  private mapToolRowToDefinition(row: Record<string, unknown>): ToolDefinition | null {
    if (
      !('id' in row) ||
      typeof row.id !== 'string' ||
      !('name' in row) ||
      typeof row.name !== 'string' ||
      !('description' in row) ||
      typeof row.description !== 'string' ||
      !('isEnabled' in row) ||
      typeof row.isEnabled !== 'boolean'
    ) {
      logger.debug('Tool row missing required fields; skipping', {
        id: 'id' in row ? row.id : '<missing>',
      });
      return null;
    }

    const category =
      'category' in row && typeof row.category === 'string'
        ? (row.category as ToolCategory)
        : ToolCategory.ANALYSIS;

    const securityLevel =
      'securityLevel' in row && typeof row.securityLevel === 'string'
        ? (row.securityLevel as SecurityLevel)
        : SecurityLevel.MEDIUM;

    const parameters: JSONSchema =
      'parameters' in row &&
      row.parameters !== null &&
      typeof row.parameters === 'object' &&
      !Array.isArray(row.parameters)
        ? (row.parameters as JSONSchema)
        : { type: 'object', properties: {} };

    const returnType: JSONSchema =
      'returnType' in row &&
      row.returnType !== null &&
      typeof row.returnType === 'object' &&
      !Array.isArray(row.returnType)
        ? (row.returnType as JSONSchema)
        : { type: 'object' };

    const examples: ToolExample[] = Array.isArray(row.examples)
      ? (row.examples as ToolExample[])
      : [];

    const costEstimateRaw =
      'costEstimate' in row && row.costEstimate !== null ? row.costEstimate : undefined;
    const costEstimate =
      costEstimateRaw !== undefined ? parseFloat(String(costEstimateRaw)) : undefined;

    const executionTimeEstimate =
      'executionTimeEstimate' in row && typeof row.executionTimeEstimate === 'number'
        ? row.executionTimeEstimate
        : undefined;

    const requiresApproval =
      'requiresApproval' in row && typeof row.requiresApproval === 'boolean'
        ? row.requiresApproval
        : false;

    const dependencies =
      'dependencies' in row && Array.isArray(row.dependencies)
        ? (row.dependencies as string[])
        : [];

    const version =
      'version' in row && typeof row.version === 'string' ? row.version : '1.0.0';

    const author =
      'author' in row && typeof row.author === 'string' ? row.author : 'tool-registry';

    const tags =
      'tags' in row && Array.isArray(row.tags) ? (row.tags as string[]) : [];

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category,
      parameters,
      returnType,
      examples,
      securityLevel,
      costEstimate,
      executionTimeEstimate,
      requiresApproval,
      dependencies,
      version,
      author,
      tags,
      isEnabled: row.isEnabled,
    };
  }

  private buildPlanNeedsDescription(context: Record<string, unknown>): string {
    if (typeof context?.planNeedsDescription === 'string' && context.planNeedsDescription.trim()) {
      return context.planNeedsDescription;
    }

    if (typeof context?.intent === 'string' && context.intent.trim()) {
      return context.intent;
    }

    if (typeof context?.message === 'string' && context.message.trim()) {
      return context.message;
    }

    return 'general tool support for agent execution';
  }

  private mapCapabilityToToolDefinition(capability: Capability): ToolDefinition {
    const minimumSecurityLevel = capability.securityRequirements?.minimumSecurityLevel;
    const securityLevel =
      minimumSecurityLevel === 'low'
        ? SecurityLevel.LOW
        : minimumSecurityLevel === 'high'
          ? SecurityLevel.HIGH
          : minimumSecurityLevel === 'critical'
            ? SecurityLevel.CRITICAL
            : SecurityLevel.MEDIUM;

    return {
      id: capability.id,
      name: capability.name,
      description: capability.description,
      category: ToolCategory.ANALYSIS,
      parameters: {
        type: 'object',
        properties: {},
      },
      returnType: {
        type: 'object',
      },
      examples: [],
      securityLevel,
      requiresApproval: capability.securityRequirements?.auditRequired ?? false,
      dependencies: capability.dependencies || [],
      version: capability.metadata?.version || '1.0.0',
      author: capability.metadata?.author || 'capability-discovery',
      tags: capability.metadata?.tags || [],
      isEnabled: capability.status === 'active',
    };
  }
}
