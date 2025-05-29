// MCP Tool Bridge for Council of Nycea
// Bridges MCP servers with the agent tool system

import { ToolDefinition, ToolCall, ToolResult, ToolCategory } from '../../types/tool';
import { 
  MCPServerCapabilities, 
  MCPTool, 
  MCPToolCall, 
  MCPToolResult,
  MCPServerInstance 
} from '../../types/mcp';
import { mcpServerManager } from './mcp-server-manager';
import { toolRegistry } from '../tools/tool-registry';

export class MCPToolBridge {
  private bridgedTools: Map<string, { serverId: string; mcpTool: MCPTool }> = new Map();

  /**
   * Converts MCP tools to our tool system format and registers them
   */
  async registerMCPServerTools(serverId: string): Promise<void> {
    const capabilities = await mcpServerManager.getCapabilities(serverId);
    if (!capabilities?.tools) {
      console.log(`No tools found for MCP server ${serverId}`);
      return;
    }

    for (const mcpTool of capabilities.tools) {
      const toolDefinition = this.convertMCPToolToToolDefinition(serverId, mcpTool);
      
      try {
        await toolRegistry.register(toolDefinition);
        this.bridgedTools.set(toolDefinition.id, { serverId, mcpTool });
        console.log(`Registered MCP tool: ${toolDefinition.name} from server ${serverId}`);
      } catch (error) {
        console.error(`Failed to register MCP tool ${mcpTool.name}:`, error);
      }
    }
  }

  /**
   * Unregisters all tools from an MCP server
   */
  async unregisterMCPServerTools(serverId: string): Promise<void> {
    const toolsToRemove: string[] = [];
    
    for (const [toolId, { serverId: toolServerId }] of this.bridgedTools.entries()) {
      if (toolServerId === serverId) {
        toolsToRemove.push(toolId);
      }
    }

    for (const toolId of toolsToRemove) {
      try {
        await toolRegistry.unregister(toolId);
        this.bridgedTools.delete(toolId);
        console.log(`Unregistered MCP tool: ${toolId}`);
      } catch (error) {
        console.error(`Failed to unregister MCP tool ${toolId}:`, error);
      }
    }
  }

  /**
   * Executes an MCP tool through the bridge
   */
  async executeMCPTool(toolId: string, parameters: Record<string, any>): Promise<any> {
    const bridgedTool = this.bridgedTools.get(toolId);
    if (!bridgedTool) {
      throw new Error(`MCP tool ${toolId} not found`);
    }

    const { serverId, mcpTool } = bridgedTool;

    // Convert our tool call to MCP format
    const mcpToolCall: MCPToolCall = {
      name: mcpTool.name,
      arguments: parameters
    };

    // Call the MCP server
    const mcpResult = await mcpServerManager.callTool(serverId, mcpToolCall);

    // Convert MCP result to our format
    return this.convertMCPResultToToolResult(mcpResult);
  }

  /**
   * Checks if a tool ID belongs to an MCP server
   */
  isMCPTool(toolId: string): boolean {
    return this.bridgedTools.has(toolId);
  }

  /**
   * Gets the MCP server ID for a tool
   */
  getMCPServerForTool(toolId: string): string | null {
    const bridgedTool = this.bridgedTools.get(toolId);
    return bridgedTool?.serverId || null;
  }

  /**
   * Converts MCP tool to our ToolDefinition format
   */
  private convertMCPToolToToolDefinition(serverId: string, mcpTool: MCPTool): ToolDefinition {
    return {
      id: `mcp-${serverId}-${mcpTool.name}`,
      name: mcpTool.name,
      description: mcpTool.description,
      category: this.inferToolCategory(mcpTool),
      parameters: mcpTool.inputSchema || { type: 'object', properties: {}, additionalProperties: true },
      returnType: mcpTool.outputSchema || { type: 'object', additionalProperties: true },
      examples: [], // MCP tools don't typically include examples
      securityLevel: this.inferSecurityLevel(mcpTool),
      costEstimate: 5, // Default cost for MCP tools
      executionTimeEstimate: 5000, // 5 seconds default
      requiresApproval: this.requiresApproval(mcpTool),
      dependencies: [],
      version: '1.0.0',
      author: `MCP Server: ${serverId}`,
      tags: ['mcp', serverId, ...this.extractTags(mcpTool)],
      isEnabled: true
    };
  }

  /**
   * Infers tool category from MCP tool
   */
  private inferToolCategory(mcpTool: MCPTool): ToolCategory {
    const name = mcpTool.name.toLowerCase();
    const description = mcpTool.description.toLowerCase();

    if (name.includes('file') || name.includes('read') || name.includes('write') || description.includes('file')) {
      return 'file-system';
    }
    if (name.includes('git') || name.includes('repo') || description.includes('repository')) {
      return 'code-execution';
    }
    if (name.includes('search') || name.includes('web') || description.includes('search')) {
      return 'web-search';
    }
    if (name.includes('db') || name.includes('sql') || name.includes('query') || description.includes('database')) {
      return 'database';
    }
    if (name.includes('api') || name.includes('http') || description.includes('api')) {
      return 'api';
    }
    if (name.includes('memory') || name.includes('store') || description.includes('memory')) {
      return 'knowledge-graph';
    }

    return 'api'; // Default category
  }

  /**
   * Infers security level from MCP tool
   */
  private inferSecurityLevel(mcpTool: MCPTool): 'safe' | 'moderate' | 'restricted' | 'dangerous' {
    const name = mcpTool.name.toLowerCase();
    const description = mcpTool.description.toLowerCase();

    // Dangerous operations
    if (name.includes('delete') || name.includes('remove') || name.includes('exec') || 
        description.includes('delete') || description.includes('execute') || description.includes('run')) {
      return 'dangerous';
    }

    // Restricted operations
    if (name.includes('write') || name.includes('create') || name.includes('update') ||
        description.includes('write') || description.includes('modify') || description.includes('change')) {
      return 'restricted';
    }

    // Moderate operations
    if (name.includes('read') || name.includes('get') || name.includes('list') ||
        description.includes('access') || description.includes('fetch')) {
      return 'moderate';
    }

    // Safe operations (search, calculation, etc.)
    return 'safe';
  }

  /**
   * Determines if tool requires approval
   */
  private requiresApproval(mcpTool: MCPTool): boolean {
    const securityLevel = this.inferSecurityLevel(mcpTool);
    return securityLevel === 'dangerous' || securityLevel === 'restricted';
  }

  /**
   * Extracts tags from MCP tool
   */
  private extractTags(mcpTool: MCPTool): string[] {
    const tags: string[] = [];
    const text = (mcpTool.name + ' ' + mcpTool.description).toLowerCase();

    // Common patterns
    const patterns = [
      'file', 'git', 'database', 'sql', 'web', 'search', 'api', 'http',
      'memory', 'storage', 'read', 'write', 'create', 'delete', 'update'
    ];

    for (const pattern of patterns) {
      if (text.includes(pattern)) {
        tags.push(pattern);
      }
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Converts MCP result to our tool result format
   */
  private convertMCPResultToToolResult(mcpResult: MCPToolResult): any {
    if (mcpResult.isError) {
      throw new Error(mcpResult.content[0]?.text || 'MCP tool execution failed');
    }

    // If single text content, return as string
    if (mcpResult.content.length === 1 && mcpResult.content[0].type === 'text') {
      return mcpResult.content[0].text;
    }

    // Multiple content items, return structured result
    return {
      content: mcpResult.content,
      type: 'mcp-result'
    };
  }

  /**
   * Sets up automatic tool registration for MCP servers
   */
  setupAutoRegistration(): void {
    mcpServerManager.addEventListener(async (event) => {
      switch (event.type) {
        case 'server-started':
          // Wait a moment for server to be ready
          setTimeout(async () => {
            try {
              await this.registerMCPServerTools(event.payload.serverId);
            } catch (error) {
              console.error(`Failed to auto-register tools for ${event.payload.serverId}:`, error);
            }
          }, 2000);
          break;

        case 'server-stopped':
          await this.unregisterMCPServerTools(event.payload.serverId);
          break;

        case 'capabilities-updated':
          // Re-register tools when capabilities change
          await this.unregisterMCPServerTools(event.payload.serverId);
          await this.registerMCPServerTools(event.payload.serverId);
          break;
      }
    });
  }

  /**
   * Gets all bridged tools from a specific server
   */
  getToolsByServer(serverId: string): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    
    for (const [toolId, { serverId: toolServerId }] of this.bridgedTools.entries()) {
      if (toolServerId === serverId) {
        // Get the full tool definition from registry
        toolRegistry.get(toolId).then(tool => {
          if (tool) tools.push(tool);
        });
      }
    }

    return tools;
  }

  /**
   * Gets statistics about bridged tools
   */
  getBridgeStats(): {
    totalBridgedTools: number;
    toolsByServer: Record<string, number>;
    toolsByCategory: Record<string, number>;
  } {
    const toolsByServer: Record<string, number> = {};
    const toolsByCategory: Record<string, number> = {};

    for (const { serverId } of this.bridgedTools.values()) {
      toolsByServer[serverId] = (toolsByServer[serverId] || 0) + 1;
    }

    // Get categories by querying the registry
    this.bridgedTools.forEach(async (_, toolId) => {
      const tool = await toolRegistry.get(toolId);
      if (tool) {
        toolsByCategory[tool.category] = (toolsByCategory[tool.category] || 0) + 1;
      }
    });

    return {
      totalBridgedTools: this.bridgedTools.size,
      toolsByServer,
      toolsByCategory
    };
  }
}

// Singleton instance
export const mcpToolBridge = new MCPToolBridge();

// Set up auto-registration
mcpToolBridge.setupAutoRegistration(); 