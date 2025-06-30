import { ToolDefinition } from '@uaip/types';
import { logger } from '@uaip/utils';

export interface CapabilityResolver {
  lookup(toolName: string): Promise<ToolDefinition | null>;
  validateCapabilities(requiredCapabilities: string[]): Promise<{ valid: boolean; missing: string[] }>;
  getAvailableCapabilities(): Promise<string[]>;
}

export class ToolRegistryCapabilityResolver implements CapabilityResolver {
  constructor(private toolRegistry: { lookup: (toolName: string) => Promise<ToolDefinition | null>; getTools: () => Promise<ToolDefinition[]> }) {}

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

  async validateCapabilities(requiredCapabilities: string[]): Promise<{ valid: boolean; missing: string[] }> {
    const missing: string[] = [];
    
    for (const capability of requiredCapabilities) {
      const tool = await this.lookup(capability);
      if (!tool) {
        missing.push(capability);
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }

  async getAvailableCapabilities(): Promise<string[]> {
    try {
      const tools = await this.toolRegistry.getTools();
      return tools
        .filter(tool => tool.isEnabled)
        .map(tool => tool.name);
    } catch (error) {
      logger.error('Error getting available capabilities:', error);
      return [];
    }
  }
}