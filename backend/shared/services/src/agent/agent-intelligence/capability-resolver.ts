import { Capability, SecurityLevel, ToolCategory, ToolDefinition } from '@uaip/types';
import { logger } from '@uaip/utils';
import { CapabilityDiscoveryService } from '../../capabilityDiscoveryService';
import { DatabaseService } from '../../databaseService';

export interface CapabilityResolver {
  lookup(toolName: string): Promise<ToolDefinition | null>;
  validateCapabilities(
    requiredCapabilities: string[]
  ): Promise<{ valid: boolean; missing: string[] }>;
  getAvailableCapabilities(): Promise<string[]>;
}

export class ToolRegistryCapabilityResolver implements CapabilityResolver {
  private capabilityDiscoveryService: CapabilityDiscoveryService;

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
      throw new Error(`Failed to resolve capability: ${toolName}`);
    }
  }

  async validateCapabilities(
    requiredCapabilities: string[]
  ): Promise<{ valid: boolean; missing: string[] }> {
    const missing: string[] = [];

    for (const capability of requiredCapabilities) {
      // oxlint-ignore-next-line no-await-in-loop -- sequential processing required
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

  async resolveCapabilities(agentId: string, context: any): Promise<ToolDefinition[]> {
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

  private buildPlanNeedsDescription(context: any): string {
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
