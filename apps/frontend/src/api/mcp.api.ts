/**
 * MCP (Model Context Protocol) API Client
 * Handles all MCP-related operations including servers and tools
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  disabled: boolean;
  status: 'unknown' | 'running' | 'stopped' | 'error' | 'starting';
  toolCount?: number;
  uptime?: number;
}

export interface MCPTool {
  id: string;
  name: string;
  description: string;
  serverName: string;
  command: string;
  parameters: any;
  category: string;
}

export interface MCPStatus {
  configExists: boolean;
  configPath: string;
  servers: MCPServer[];
}

export interface MCPConfig {
  exists: boolean;
  config: any | null;
  serversCount?: number;
  servers?: string[];
  message?: string;
}

export interface MCPUploadResult {
  message: string;
  configPath: string;
  serversProcessed: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  installationResults: Array<{
    name: string;
    status: 'success' | 'error' | 'skipped';
    error?: string;
    pid?: number;
  }>;
  installationStatus: Record<string, string>;
  installationErrors: Record<string, string>;
  mergedServers: string[];
}

export const mcpAPI = {
  /**
   * Get current MCP server status
   */
  async getStatus(): Promise<MCPStatus> {
    return APIClient.get<MCPStatus>('/api/v1/mcp/status');
  },

  /**
   * Get MCP configuration
   */
  async getConfig(): Promise<MCPConfig> {
    return APIClient.get<MCPConfig>('/api/v1/mcp/config');
  },

  /**
   * Upload MCP configuration file
   */
  async uploadConfig(configFile: File): Promise<MCPUploadResult> {
    const formData = new FormData();
    formData.append('mcpConfig', configFile);
    
    return APIClient.post<MCPUploadResult>('/api/v1/mcp/upload-config', formData, {
      headers: {
        // Don't set Content-Type, let the browser set it for FormData
      }
    });
  },

  /**
   * Get all available MCP tools from configured servers
   */
  async getTools(): Promise<{
    tools: MCPTool[];
    count: number;
    servers: string[];
  }> {
    return APIClient.get<{
      tools: MCPTool[];
      count: number;
      servers: string[];
    }>('/api/v1/mcp/tools');
  },

  /**
   * Get tools from a specific MCP server
   */
  async getServerTools(serverName: string): Promise<{
    serverName: string;
    tools: MCPTool[];
    count: number;
  }> {
    return APIClient.get<{
      serverName: string;
      tools: MCPTool[];
      count: number;
    }>(`/api/v1/mcp/tools/${encodeURIComponent(serverName)}`);
  },

  /**
   * Create a new MCP tool
   */
  async createTool(toolData: {
    name: string;
    description: string;
    serverName: string;
    parameters?: any;
    category?: string;
  }): Promise<{ tool: MCPTool; message: string }> {
    return APIClient.post<{ tool: MCPTool; message: string }>('/api/v1/mcp/tools', toolData);
  },

  /**
   * Update an existing MCP tool
   */
  async updateTool(toolId: string, updates: {
    name?: string;
    description?: string;
    parameters?: any;
    enabled?: boolean;
  }): Promise<{
    toolId: string;
    message: string;
    updates: any;
  }> {
    return APIClient.put<{
      toolId: string;
      message: string;
      updates: any;
    }>(`/api/v1/mcp/tools/${toolId}`, updates);
  },

  /**
   * Delete an MCP tool
   */
  async deleteTool(toolId: string): Promise<{
    toolId: string;
    message: string;
  }> {
    return APIClient.delete<{
      toolId: string;
      message: string;
    }>(`/api/v1/mcp/tools/${toolId}`);
  },

  /**
   * Execute an MCP tool
   */
  async executeTool(toolId: string, parameters: any, agentId?: string): Promise<{
    toolId: string;
    result: any;
    message: string;
  }> {
    return APIClient.post<{
      toolId: string;
      result: any;
      message: string;
    }>(`/api/v1/mcp/tools/${toolId}/execute`, {
      parameters,
      agentId
    });
  },

  /**
   * Get tool schema
   */
  async getToolSchema(toolId: string): Promise<{
    toolId: string;
    schema: any;
  }> {
    return APIClient.get<{
      toolId: string;
      schema: any;
    }>(`/api/v1/mcp/tools/${toolId}/schema`);
  },

  /**
   * Get tool recommendations
   */
  async getToolRecommendations(toolId: string, limit: number = 5): Promise<{
    toolId: string;
    recommendations: any[];
    count: number;
  }> {
    return APIClient.get<{
      toolId: string;
      recommendations: any[];
      count: number;
    }>(`/api/v1/mcp/tools/${toolId}/recommendations`, {
      params: { limit }
    });
  },

  /**
   * Find tools by capability
   */
  async findToolsByCapability(capability: string): Promise<{
    capability: string;
    tools: MCPTool[];
    count: number;
  }> {
    return APIClient.get<{
      capability: string;
      tools: MCPTool[];
      count: number;
    }>(`/api/v1/mcp/tools/capabilities/${encodeURIComponent(capability)}`);
  },

  /**
   * Get tool dependency graph
   */
  async getToolDependencies(toolId: string): Promise<{
    toolId: string;
    dependencyGraph: any;
  }> {
    return APIClient.get<{
      toolId: string;
      dependencyGraph: any;
    }>(`/api/v1/mcp/tools/${toolId}/dependencies`);
  },

  /**
   * Restart an MCP server
   */
  async restartServer(serverName: string): Promise<{
    message: string;
    serverName: string;
    status: string;
  }> {
    return APIClient.post<{
      message: string;
      serverName: string;
      status: string;
    }>(`/api/v1/mcp/restart-server/${encodeURIComponent(serverName)}`);
  },

  /**
   * Check system requirements for MCP
   */
  async getSystemRequirements(): Promise<any> {
    return APIClient.get('/api/v1/mcp/system-requirements');
  },

  /**
   * Install a missing MCP tool
   */
  async installTool(toolName: string): Promise<{
    success: boolean;
    message: string;
    tool: string;
  }> {
    return APIClient.post<{
      success: boolean;
      message: string;
      tool: string;
    }>(`/api/v1/mcp/install-tool/${encodeURIComponent(toolName)}`);
  }
};