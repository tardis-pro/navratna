// Tool Registry Service for Council of Nycea
// Manages tool registration, discovery, and metadata

import { 
  ToolDefinition, 
  ToolRegistry, 
  ToolCategory, 
  ToolEvent, 
  ToolEventHandler 
} from '../../types/tool';
import { baseTools } from './base-tools';

export class InMemoryToolRegistry implements ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private eventHandlers: Set<ToolEventHandler> = new Set();
  private initialized = false;

  constructor() {
    this.initializeBaseTools();
  }

  private async initializeBaseTools(): Promise<void> {
    if (this.initialized) return;
    
    console.log('Initializing tool registry with base tools...');
    for (const tool of baseTools) {
      await this.register(tool);
    }
    this.initialized = true;
    console.log(`Tool registry initialized with ${this.tools.size} tools`);
  }

  async register(tool: ToolDefinition): Promise<void> {
    // Validate tool definition
    this.validateToolDefinition(tool);
    
    // Check for conflicts
    if (this.tools.has(tool.id)) {
      const existing = this.tools.get(tool.id)!;
      if (existing.version === tool.version) {
        throw new Error(`Tool ${tool.id} version ${tool.version} already registered`);
      }
      console.log(`Updating tool ${tool.id} from version ${existing.version} to ${tool.version}`);
    }

    // Register the tool
    this.tools.set(tool.id, { ...tool });
    
    // Emit event
    await this.emitEvent({
      type: 'tool-registered',
      payload: { toolId: tool.id }
    });

    console.log(`Registered tool: ${tool.name} (${tool.id}) - ${tool.category}`);
  }

  async unregister(toolId: string): Promise<void> {
    if (!this.tools.has(toolId)) {
      throw new Error(`Tool ${toolId} not found`);
    }

    this.tools.delete(toolId);
    
    await this.emitEvent({
      type: 'tool-unregistered',
      payload: { toolId }
    });

    console.log(`Unregistered tool: ${toolId}`);
  }

  async get(toolId: string): Promise<ToolDefinition | null> {
    await this.initializeBaseTools();
    return this.tools.get(toolId) || null;
  }

  async getAll(): Promise<ToolDefinition[]> {
    await this.initializeBaseTools();
    return Array.from(this.tools.values()).filter(tool => tool.isEnabled);
  }

  async getByCategory(category: ToolCategory): Promise<ToolDefinition[]> {
    await this.initializeBaseTools();
    return Array.from(this.tools.values())
      .filter(tool => tool.category === category && tool.isEnabled);
  }

  async search(query: string): Promise<ToolDefinition[]> {
    await this.initializeBaseTools();
    const lowercaseQuery = query.toLowerCase();
    
    return Array.from(this.tools.values())
      .filter(tool => {
        if (!tool.isEnabled) return false;
        
        return (
          tool.name.toLowerCase().includes(lowercaseQuery) ||
          tool.description.toLowerCase().includes(lowercaseQuery) ||
          tool.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery)) ||
          tool.category.toLowerCase().includes(lowercaseQuery)
        );
      })
      .sort((a, b) => {
        // Prioritize exact name matches
        const aNameMatch = a.name.toLowerCase().includes(lowercaseQuery);
        const bNameMatch = b.name.toLowerCase().includes(lowercaseQuery);
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;
        
        // Then by category match
        const aCategoryMatch = a.category.toLowerCase().includes(lowercaseQuery);
        const bCategoryMatch = b.category.toLowerCase().includes(lowercaseQuery);
        if (aCategoryMatch && !bCategoryMatch) return -1;
        if (!aCategoryMatch && bCategoryMatch) return 1;
        
        // Finally alphabetically
        return a.name.localeCompare(b.name);
      });
  }

  async isEnabled(toolId: string): Promise<boolean> {
    const tool = await this.get(toolId);
    return tool?.isEnabled || false;
  }

  async setEnabled(toolId: string, enabled: boolean): Promise<void> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    tool.isEnabled = enabled;
    console.log(`Tool ${toolId} ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Tool discovery and recommendation methods
  async getToolsForCategory(category: ToolCategory): Promise<ToolDefinition[]> {
    return this.getByCategory(category);
  }

  async getRecommendedTools(context: string): Promise<ToolDefinition[]> {
    // Simple keyword-based recommendations
    const contextLower = context.toLowerCase();
    const tools = await this.getAll();
    
    return tools
      .filter(tool => {
        const relevanceScore = this.calculateRelevanceScore(tool, contextLower);
        return relevanceScore > 0.3; // Threshold for recommendation
      })
      .sort((a, b) => {
        const scoreA = this.calculateRelevanceScore(a, contextLower);
        const scoreB = this.calculateRelevanceScore(b, contextLower);
        return scoreB - scoreA;
      })
      .slice(0, 5); // Top 5 recommendations
  }

  private calculateRelevanceScore(tool: ToolDefinition, context: string): number {
    let score = 0;
    
    // Name match (highest weight)
    if (tool.name.toLowerCase().includes(context)) score += 1.0;
    
    // Description match
    if (tool.description.toLowerCase().includes(context)) score += 0.7;
    
    // Tag matches
    const tagMatches = tool.tags.filter(tag => 
      tag.toLowerCase().includes(context) || context.includes(tag.toLowerCase())
    );
    score += tagMatches.length * 0.5;
    
    // Category match
    if (tool.category.toLowerCase().includes(context)) score += 0.6;
    
    // Security level preference (safer tools get slight boost)
    if (tool.securityLevel === 'safe') score += 0.1;
    
    return Math.min(score, 2.0); // Cap at 2.0
  }

  // Event system
  addEventListener(handler: ToolEventHandler): void {
    this.eventHandlers.add(handler);
  }

  removeEventListener(handler: ToolEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  private async emitEvent(event: ToolEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Error in tool event handler:', error);
      }
    }
  }

  // Tool validation
  private validateToolDefinition(tool: ToolDefinition): void {
    if (!tool.id || typeof tool.id !== 'string') {
      throw new Error('Tool must have a valid string ID');
    }

    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a valid string name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('Tool must have a valid string description');
    }

    if (!tool.category) {
      throw new Error('Tool must have a valid category');
    }

    if (!tool.parameters || typeof tool.parameters !== 'object') {
      throw new Error('Tool must have valid parameter schema');
    }

    if (!tool.version || typeof tool.version !== 'string') {
      throw new Error('Tool must have a valid version string');
    }

    if (typeof tool.isEnabled !== 'boolean') {
      throw new Error('Tool must have a valid isEnabled boolean');
    }

    // Validate security level
    const validSecurityLevels = ['safe', 'moderate', 'restricted', 'dangerous'];
    if (!validSecurityLevels.includes(tool.securityLevel)) {
      throw new Error(`Tool security level must be one of: ${validSecurityLevels.join(', ')}`);
    }

    // Validate examples if present
    if (tool.examples) {
      for (const example of tool.examples) {
        if (!example.name || !example.description || !example.input) {
          throw new Error('Tool examples must have name, description, and input');
        }
      }
    }
  }

  // Statistics and metrics
  async getRegistryStats(): Promise<{
    totalTools: number;
    enabledTools: number;
    toolsByCategory: Record<ToolCategory, number>;
    toolsBySecurityLevel: Record<string, number>;
  }> {
    await this.initializeBaseTools();
    const tools = Array.from(this.tools.values());
    
    const toolsByCategory = tools.reduce((acc, tool) => {
      acc[tool.category] = (acc[tool.category] || 0) + 1;
      return acc;
    }, {} as Record<ToolCategory, number>);

    const toolsBySecurityLevel = tools.reduce((acc, tool) => {
      acc[tool.securityLevel] = (acc[tool.securityLevel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalTools: tools.length,
      enabledTools: tools.filter(t => t.isEnabled).length,
      toolsByCategory,
      toolsBySecurityLevel
    };
  }
}

// Singleton instance
export const toolRegistry = new InMemoryToolRegistry();

// Helper functions for tool discovery
export async function findToolsForTask(taskDescription: string): Promise<ToolDefinition[]> {
  return toolRegistry.getRecommendedTools(taskDescription);
}

export async function getToolsByCapability(capability: string): Promise<ToolDefinition[]> {
  return toolRegistry.search(capability);
}

export async function validateToolCall(toolId: string, parameters: any): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const tool = await toolRegistry.get(toolId);
  if (!tool) {
    return { valid: false, errors: [`Tool ${toolId} not found`] };
  }

  if (!tool.isEnabled) {
    return { valid: false, errors: [`Tool ${toolId} is disabled`] };
  }

  // Basic parameter validation could be implemented here
  // For now, just check if required parameters are present
  const errors: string[] = [];
  
  if (tool.parameters.required) {
    for (const requiredParam of tool.parameters.required) {
      if (!(requiredParam in parameters)) {
        errors.push(`Missing required parameter: ${requiredParam}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
} 