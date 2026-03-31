/**
 * Tools Management API Client
 * Handles all tool-related operations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/api_config';
import type {
  Tool,
  ToolCreate,
  ToolUpdate,
  ToolExecutionRequest,
  ToolExecutionResponse,
  ToolCategory,
  ToolRecommendation,
  ToolRelation,
  ToolAnalytics,
  ToolListOptions,
} from '@uaip/contracts/api';

export type {
  Tool,
  ToolCreate,
  ToolUpdate,
  ToolExecutionRequest,
  ToolExecutionResponse,
  ToolCategory,
  ToolRecommendation,
  ToolRelation,
  ToolAnalytics,
  ToolListOptions,
};

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
    return APIClient.post<ToolExecutionResponse>(
      `${API_ROUTES.TOOLS.EXECUTE}/${id}/execute`,
      request
    );
  },

  async getExecutionStatus(toolId: string, executionId: string): Promise<ToolExecutionResponse> {
    return APIClient.get<ToolExecutionResponse>(
      `${API_ROUTES.TOOLS.GET}/${toolId}/executions/${executionId}`
    );
  },

  async getCategories(): Promise<ToolCategory[]> {
    return APIClient.get<ToolCategory[]>(API_ROUTES.TOOLS.CATEGORIES);
  },

  async getRecommendations(context?: unknown): Promise<ToolRecommendation[]> {
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
      params: { days },
    });
  },

  async validate(tool: ToolCreate): Promise<{ valid: boolean; errors?: string[] }> {
    return APIClient.post(`${API_ROUTES.TOOLS.VALIDATE}/validate`, tool);
  },

  async search(query: string, filters?: unknown): Promise<Tool[]> {
    return APIClient.get<Tool[]>(API_ROUTES.TOOLS.SEARCH, {
      params: { q: query, ...filters },
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
      responseType: 'blob',
    });
    return response;
  },

  async importTools(file: File): Promise<{ imported: number; errors?: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    return APIClient.post(`${API_ROUTES.TOOLS.CREATE}/import`, formData);
  },
};
