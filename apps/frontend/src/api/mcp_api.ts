/**
 * MCP (Model Context Protocol) API Client
 * Handles all MCP-related operations including servers and tools
 */

import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
import type {
  MCPServer,
  MCPTool,
  MCPStatus,
  MCPConfig,
  MCPUploadResult,
} from '@uaip/contracts/api';

export type { MCPServer, MCPTool, MCPStatus, MCPConfig, MCPUploadResult };

const mcp = gatewayClient.api.v1.mcp;

export const mcpAPI = {
  async getStatus(): Promise<MCPStatus> {
    return edenWithCSRFRetry(() => mcp.status.get());
  },

  async getConfig(): Promise<MCPConfig> {
    return edenWithCSRFRetry(() => mcp.config.get());
  },

  async uploadConfig(configFile: File): Promise<MCPUploadResult> {
    const formData = new FormData();
    formData.append('mcpConfig', configFile);
    return edenRequest<MCPUploadResult>('/api/v1/mcp/upload-config', {
      method: 'POST',
      body: formData,
    });
  },

  async getTools(): Promise<{
    tools: MCPTool[];
    count: number;
    servers: string[];
  }> {
    return edenWithCSRFRetry(() => mcp.tools.get());
  },

  async getServerTools(serverName: string): Promise<{
    serverName: string;
    tools: MCPTool[];
    count: number;
  }> {
    return edenWithCSRFRetry(() => mcp.servers[serverName].tools.get());
  },

  async createTool(toolData: {
    name: string;
    description: string;
    serverName: string;
    parameters?: unknown;
    category?: string;
  }): Promise<{ tool: MCPTool; message: string }> {
    return edenWithCSRFRetry(() => mcp.tools.post(toolData));
  },

  async updateTool(
    toolId: string,
    updates: {
      name?: string;
      description?: string;
      parameters?: unknown;
      enabled?: boolean;
    }
  ): Promise<{
    toolId: string;
    message: string;
    updates: unknown;
  }> {
    return edenWithCSRFRetry(() => mcp.tools[toolId].put(updates));
  },

  async deleteTool(toolId: string): Promise<{
    toolId: string;
    message: string;
  }> {
    return edenWithCSRFRetry(() => mcp.tools[toolId].delete());
  },

  async executeTool(
    toolId: string,
    parameters: unknown,
    agentId?: string
  ): Promise<{
    toolId: string;
    result: unknown;
    message: string;
  }> {
    return edenWithCSRFRetry(() =>
      mcp.tools[toolId].execute.post({ parameters, agentId })
    );
  },

  async getToolSchema(toolId: string): Promise<{
    toolId: string;
    schema: unknown;
  }> {
    return edenWithCSRFRetry(() => mcp.tools[toolId].schema.get());
  },

  async getToolRecommendations(
    toolId: string,
    limit: number = 5
  ): Promise<{
    toolId: string;
    recommendations: unknown[];
    count: number;
  }> {
    return edenWithCSRFRetry(() =>
      mcp.tools[toolId].recommendations.get({ query: { limit } })
    );
  },

  async findToolsByCapability(capability: string): Promise<{
    capability: string;
    tools: MCPTool[];
    count: number;
  }> {
    return edenWithCSRFRetry(() => mcp.tools.capabilities[capability].get());
  },

  async getToolDependencies(toolId: string): Promise<{
    toolId: string;
    dependencyGraph: unknown;
  }> {
    return edenWithCSRFRetry(() => mcp.tools[toolId].dependencies.get());
  },

  async restartServer(serverName: string): Promise<{
    message: string;
    serverName: string;
    status: string;
  }> {
    return edenWithCSRFRetry(() => mcp.servers[serverName].restart.post());
  },

  async installTool(toolName: string): Promise<{
    success: boolean;
    message: string;
    tool: string;
  }> {
    return edenWithCSRFRetry(() => mcp['install-tool'][toolName].post());
  },
};
