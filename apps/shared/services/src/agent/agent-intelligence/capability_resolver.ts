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

export interface PlanStepRequirement {
  stepId: string;
  /**
   * Step type string from the plan (e.g. `'api'`, `'database'`,
   * `'tool_execution'`). The resolver maps this to a `ToolCategory`.
   * Normalized to lowercase + underscores before lookup.
   */
  stepType: string;
  description: string;
  /**
   * Explicit category override — when provided, skips the stepType→category
   * mapping and uses this value directly.
   */
  category?: ToolCategory;
  /**
   * When `true`, unresolved steps are reported in
   * `PlanCapabilityResolutionResult.unresolvedSteps`.
   */
  required: boolean;
}

export interface CapabilitySourceBreakdown {
  dynamic: number;
  fallback: number;
}

export interface PlanCapabilityResolutionResult {
  resolvedTools: ToolDefinition[];
  sourceBreakdown: CapabilitySourceBreakdown;
  unresolvedSteps: string[];
}

const TOOL_CATEGORIES: string[] = Object.values(ToolCategory);
const SECURITY_LEVELS: string[] = Object.values(SecurityLevel);

function isToolCategory(v: unknown): v is ToolCategory {
  return typeof v === 'string' && TOOL_CATEGORIES.includes(v);
}

function isSecurityLevel(v: unknown): v is SecurityLevel {
  return typeof v === 'string' && SECURITY_LEVELS.includes(v);
}

const STEP_TYPE_TO_CATEGORY: Readonly<Record<string, ToolCategory>> = {
  api: ToolCategory.API,
  http: ToolCategory.API,
  rest: ToolCategory.API,
  webhook: ToolCategory.API,
  database: ToolCategory.DATABASE,
  db: ToolCategory.DATABASE,
  sql: ToolCategory.DATABASE,
  query: ToolCategory.DATABASE,
  web_search: ToolCategory.WEB_SEARCH,
  search: ToolCategory.WEB_SEARCH,
  browse: ToolCategory.WEB_SEARCH,
  scrape: ToolCategory.WEB_SEARCH,
  code_execution: ToolCategory.CODE_EXECUTION,
  code: ToolCategory.CODE_EXECUTION,
  execute: ToolCategory.CODE_EXECUTION,
  script: ToolCategory.CODE_EXECUTION,
  run: ToolCategory.CODE_EXECUTION,
  file_system: ToolCategory.FILE_SYSTEM,
  file: ToolCategory.FILE_SYSTEM,
  storage: ToolCategory.FILE_SYSTEM,
  filesystem: ToolCategory.FILE_SYSTEM,
  computation: ToolCategory.COMPUTATION,
  compute: ToolCategory.COMPUTATION,
  math: ToolCategory.COMPUTATION,
  calculate: ToolCategory.COMPUTATION,
  communication: ToolCategory.COMMUNICATION,
  email: ToolCategory.COMMUNICATION,
  message: ToolCategory.COMMUNICATION,
  notify: ToolCategory.COMMUNICATION,
  slack: ToolCategory.COMMUNICATION,
  knowledge_graph: ToolCategory.KNOWLEDGE_GRAPH,
  knowledge: ToolCategory.KNOWLEDGE_GRAPH,
  graph: ToolCategory.KNOWLEDGE_GRAPH,
  neo4j: ToolCategory.KNOWLEDGE_GRAPH,
  deployment: ToolCategory.DEPLOYMENT,
  deploy: ToolCategory.DEPLOYMENT,
  release: ToolCategory.DEPLOYMENT,
  publish: ToolCategory.DEPLOYMENT,
  monitoring: ToolCategory.MONITORING,
  monitor: ToolCategory.MONITORING,
  observability: ToolCategory.MONITORING,
  metrics: ToolCategory.MONITORING,
  analysis: ToolCategory.ANALYSIS,
  analyze: ToolCategory.ANALYSIS,
  analytics: ToolCategory.ANALYSIS,
  evaluate: ToolCategory.ANALYSIS,
  generation: ToolCategory.GENERATION,
  generate: ToolCategory.GENERATION,
  artifact_generation: ToolCategory.GENERATION,
  artifact: ToolCategory.GENERATION,
  synthesize: ToolCategory.GENERATION,
  system: ToolCategory.SYSTEM,
  os: ToolCategory.SYSTEM,
  network: ToolCategory.NETWORK,
  tcp: ToolCategory.NETWORK,
  development: ToolCategory.DEVELOPMENT,
  dev: ToolCategory.DEVELOPMENT,
  build: ToolCategory.DEVELOPMENT,
  lint: ToolCategory.DEVELOPMENT,
  test: ToolCategory.DEVELOPMENT,
  mcp: ToolCategory.MCP,
  tool_execution: ToolCategory.MCP,
  tool: ToolCategory.MCP,
};

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

    const enabledAttached = attachedTools.filter((t) => t.isEnabled);

    if (dynamicTools.length === 0 && enabledAttached.length > 0) {
      logger.info('Dynamic lookup yielded no results; using attachedTools as fallback', {
        attachedToolCount: enabledAttached.length,
      });
    }

    const deduplicated = new Map<string, ToolDefinition>();

    for (const tool of dynamicTools) {
      deduplicated.set(tool.id, tool);
    }

    for (const tool of enabledAttached) {
      if (!deduplicated.has(tool.id)) {
        deduplicated.set(tool.id, tool);
      }
    }

    const resolvedTools = Array.from(deduplicated.values());
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

  private getToolService(): ToolService {
    if (this.toolService === null) {
      this.toolService = ToolService.getInstance();
    }
    return this.toolService;
  }

  private mapStepTypeToCategory(stepType: string): ToolCategory | null {
    const normalized = stepType.toLowerCase().replaceAll('-', '_');
    return STEP_TYPE_TO_CATEGORY[normalized] ?? null;
  }

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

    const category = isToolCategory(row.category) ? row.category : ToolCategory.ANALYSIS;

    const securityLevel = isSecurityLevel(row.securityLevel)
      ? row.securityLevel
      : SecurityLevel.MEDIUM;

    const parametersRaw =
      'parameters' in row &&
      row.parameters !== null &&
      typeof row.parameters === 'object' &&
      !Array.isArray(row.parameters)
        ? row.parameters
        : { type: 'object', properties: {} };
    const parameters: JSONSchema = parametersRaw as JSONSchema;

    const returnTypeRaw =
      'returnType' in row &&
      row.returnType !== null &&
      typeof row.returnType === 'object' &&
      !Array.isArray(row.returnType)
        ? row.returnType
        : { type: 'object' };
    const returnType: JSONSchema = returnTypeRaw as JSONSchema;

    const examples: ToolExample[] = Array.isArray(row.examples)
      ? row.examples.filter(
          (e): e is ToolExample => typeof e === 'object' && e !== null
        )
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
        ? row.dependencies.filter((d): d is string => typeof d === 'string')
        : [];

    const version =
      'version' in row && typeof row.version === 'string' ? row.version : '1.0.0';

    const author =
      'author' in row && typeof row.author === 'string' ? row.author : 'tool-registry';

    const tags =
      'tags' in row && Array.isArray(row.tags)
        ? row.tags.filter((t): t is string => typeof t === 'string')
        : [];

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
