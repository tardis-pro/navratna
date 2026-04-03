/**
 * Tools Management API Client
 * Handles all tool-related operations
 */

import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
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

const tools = gatewayClient.api.v1.tools;

export const toolsAPI = {
  async list(options?: ToolListOptions): Promise<Tool[]> {
    return edenWithCSRFRetry(() => tools.get({ query: options as Record<string, unknown> }));
  },

  async get(id: string): Promise<Tool> {
    return edenWithCSRFRetry(() => tools[id].get());
  },

  async create(tool: ToolCreate): Promise<Tool> {
    return edenWithCSRFRetry(() => tools.post(tool));
  },

  async update(id: string, updates: ToolUpdate): Promise<Tool> {
    return edenWithCSRFRetry(() => tools[id].put(updates));
  },

  async delete(id: string): Promise<void> {
    await edenWithCSRFRetry(() => tools[id].delete());
  },

  async execute(id: string, request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    return edenWithCSRFRetry(() => tools[id].execute.post(request));
  },

  async getExecutionStatus(toolId: string, executionId: string): Promise<ToolExecutionResponse> {
    return edenWithCSRFRetry(() => tools[toolId].executions[executionId].get());
  },

  async getCategories(): Promise<ToolCategory[]> {
    return edenWithCSRFRetry(() => tools.categories.get());
  },

  async getRecommendations(context?: unknown): Promise<ToolRecommendation[]> {
    return edenWithCSRFRetry(() => tools.recommendations.post({ context }));
  },

  async getRelations(toolId: string): Promise<ToolRelation[]> {
    return edenWithCSRFRetry(() => tools.relations[toolId].relations.get());
  },

  async createRelation(relation: ToolRelation): Promise<ToolRelation> {
    return edenWithCSRFRetry(() => tools.relations.post(relation));
  },

  async getAnalytics(toolId: string, days: number = 30): Promise<ToolAnalytics> {
    return edenWithCSRFRetry(() =>
      tools.analytics[toolId].analytics.get({ query: { days: days.toString() } })
    );
  },

  async validate(tool: ToolCreate): Promise<{ valid: boolean; errors?: string[] }> {
    return edenWithCSRFRetry(() => tools.validate.post(tool));
  },

  async search(query: string, filters?: unknown): Promise<Tool[]> {
    const queryParams: Record<string, string> = { q: query };
    if (filters && typeof filters === 'object') {
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null) queryParams[k] = String(v);
      }
    }
    return edenWithCSRFRetry(() => tools.get({ query: queryParams }));
  },

  async bulkCreate(toolList: ToolCreate[]): Promise<Tool[]> {
    return edenWithCSRFRetry(() => tools.bulk.post({ tools: toolList }));
  },

  async bulkUpdate(updates: { id: string; update: ToolUpdate }[]): Promise<Tool[]> {
    return edenWithCSRFRetry(() => tools.bulk.put({ updates }));
  },

  async exportTools(format: 'json' | 'yaml' = 'json'): Promise<Blob> {
    return edenRequest<Blob>(`/api/v1/tools/export?format=${format}`, {
      method: 'GET',
      responseType: 'blob',
    });
  },

  async importTools(file: File): Promise<{ imported: number; errors?: string[] }> {
    const formData = new FormData();
    formData.append('file', file);
    return edenRequest('/api/v1/tools/import', {
      method: 'POST',
      body: formData,
    });
  },
};
