/**
 * Tools Management API Client
 * Handles all tool-related operations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import type { SecurityLevel } from '@uaip/types';

export interface Tool {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  type: 'internal' | 'external' | 'mcp' | 'oauth';
  inputSchema?: any;
  outputSchema?: any;
  configuration?: any;
  requiredPermissions?: string[];
  securityLevel: SecurityLevel;
  maxRetries: number;
  timeout: number;
  isActive: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCreate {
  name: string;
  displayName: string;
  description: string;
  category: string;
  type?: 'internal' | 'external' | 'mcp' | 'oauth';
  inputSchema?: any;
  outputSchema?: any;
  configuration?: any;
  requiredPermissions?: string[];
  securityLevel?: SecurityLevel;
  maxRetries?: number;
  timeout?: number;
}

export interface ToolUpdate {
  displayName?: string;
  description?: string;
  category?: string;
  inputSchema?: any;
  outputSchema?: any;
  configuration?: any;
  requiredPermissions?: string[];
  securityLevel?: SecurityLevel;
  maxRetries?: number;
  timeout?: number;
  isActive?: boolean;
}

export interface ToolExecutionRequest {
  input: any;
  context?: any;
  options?: {
    timeout?: number;
    retries?: number;
  };
}

export interface ToolExecutionResponse {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: any;
  error?: string;
  metadata?: any;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

export interface ToolCategory {
  name: string;
  displayName: string;
  description?: string;
  toolCount: number;
}

export interface ToolRecommendation {
  tool: Tool;
  score: number;
  reason: string;
  relatedTools?: string[];
}

export interface ToolRelation {
  fromTool: string;
  toTool: string;
  relationType: 'depends_on' | 'similar_to' | 'alternative_to' | 'enhances';
  strength: number;
}

export interface ToolAnalytics {
  toolId: string;
  executionCount: number;
  successRate: number;
  averageExecutionTime: number;
  errorRate: number;
  usageByAgent: Record<string, number>;
  usageByUser: Record<string, number>;
  period: string;
}

export interface ToolListOptions {
  page?: number;
  limit?: number;
  category?: string;
  type?: string;
  isActive?: boolean;
  search?: string;
}

export const toolsAPI = {
  async list(options?: ToolListOptions): Promise<Tool[]> {
    return APIClient.get<Tool[]>(API_ROUTES.TOOLS.LIST, { params: options });
  },

  async get(id: string): Promise<Tool> {
    return APIClient.get<Tool>(`${API_ROUTES.TOOLS.GET}/${id}`);
  },

  async create(tool: ToolCreate): Promise<Tool> {
    return APIClient.post<Tool>(API_ROUTES.TOOLS.CREATE, tool);
  },

  async update(id: string, updates: ToolUpdate): Promise<Tool> {
    return APIClient.put<Tool>(`${API_ROUTES.TOOLS.UPDATE}/${id}`, updates);
  },

  async delete(id: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.TOOLS.DELETE}/${id}`);
  },

  async execute(id: string, request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    return APIClient.post<ToolExecutionResponse>(`${API_ROUTES.TOOLS.EXECUTE}/${id}/execute`, request);
  },

  async getExecutionStatus(toolId: string, executionId: string): Promise<ToolExecutionResponse> {
    return APIClient.get<ToolExecutionResponse>(`${API_ROUTES.TOOLS.GET}/${toolId}/executions/${executionId}`);
  },

  async getCategories(): Promise<ToolCategory[]> {
    return APIClient.get<ToolCategory[]>(API_ROUTES.TOOLS.CATEGORIES);
  },

  async getRecommendations(context?: any): Promise<ToolRecommendation[]> {
    return APIClient.post<ToolRecommendation[]>(API_ROUTES.TOOLS.RECOMMENDATIONS, { context });
  },

  async getRelations(toolId: string): Promise<ToolRelation[]> {
    return APIClient.get<ToolRelation[]>(`${API_ROUTES.TOOLS.RELATIONS}/${toolId}/relations`);
  },

  async createRelation(relation: ToolRelation): Promise<ToolRelation> {
    return APIClient.post<ToolRelation>(API_ROUTES.TOOLS.RELATIONS, relation);
  },

  async getAnalytics(toolId: string, days: number = 30): Promise<ToolAnalytics> {
    return APIClient.get<ToolAnalytics>(`${API_ROUTES.TOOLS.ANALYTICS}/${toolId}/analytics`, {
      params: { days }
    });
  },

  async validate(tool: ToolCreate): Promise<{ valid: boolean; errors?: string[] }> {
    return APIClient.post(`${API_ROUTES.TOOLS.VALIDATE}/validate`, tool);
  },

  async search(query: string, filters?: any): Promise<Tool[]> {
    return APIClient.get<Tool[]>(API_ROUTES.TOOLS.SEARCH, {
      params: { q: query, ...filters }
    });
  },

  async bulkCreate(tools: ToolCreate[]): Promise<Tool[]> {
    return APIClient.post<Tool[]>(`${API_ROUTES.TOOLS.CREATE}/bulk`, { tools });
  },

  async bulkUpdate(updates: { id: string; update: ToolUpdate }[]): Promise<Tool[]> {
    return APIClient.put<Tool[]>(`${API_ROUTES.TOOLS.UPDATE}/bulk`, { updates });
  },

  async exportTools(format: 'json' | 'yaml' = 'json'): Promise<Blob> {
    const response = await APIClient.get(`${API_ROUTES.TOOLS.LIST}/export`, {
      params: { format },
      responseType: 'blob'
    });
    return response;
  },

  async importTools(file: File): Promise<{ imported: number; errors?: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    return APIClient.post(`${API_ROUTES.TOOLS.CREATE}/import`, formData);
  }
};