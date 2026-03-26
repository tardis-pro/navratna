/**
 * Agent Intelligence API Client
 * Handles all agent-related operations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/api_config';
import type {
  Agent,
  AgentCreate,
  AgentUpdate,
  AgentAnalysisResult,
  ExecutionPlan,
} from '@uaip/contracts/api';
import type {
  AgentHealthCheck,
  AgentListOptions,
  AgentAnalysisRequest,
  AgentPlanRequest,
  AgentLearningData,
  AgentParticipationRequest,
  AgentChatRequest,
  AgentChatResponse,
} from '@uaip/contracts/api';

export type {
  AgentHealthCheck,
  AgentListOptions,
  AgentAnalysisRequest,
  AgentPlanRequest,
  AgentLearningData,
  AgentParticipationRequest,
  AgentChatRequest,
  AgentChatResponse,
};

export const agentsAPI = {
  async list(options?: AgentListOptions): Promise<Agent[]> {
    return APIClient.get<Agent[]>(API_ROUTES.AGENTS.LIST, { params: options });
  },

  async get(id: string): Promise<Agent> {
    return APIClient.get<Agent>(`${API_ROUTES.AGENTS.GET}/${id}`);
  },

  async create(agent: AgentCreate): Promise<Agent> {
    return APIClient.post<Agent>(API_ROUTES.AGENTS.CREATE, agent);
  },

  async update(id: string, updates: AgentUpdate): Promise<Agent> {
    return APIClient.put<Agent>(`${API_ROUTES.AGENTS.UPDATE}/${id}`, updates);
  },

  async delete(id: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.AGENTS.DELETE}/${id}`);
  },

  async analyze(id: string, request: AgentAnalysisRequest): Promise<AgentAnalysisResult> {
    return APIClient.post<AgentAnalysisResult>(
      `${API_ROUTES.AGENTS.ANALYZE}/${id}/analyze`,
      request
    );
  },

  async plan(id: string, request: AgentPlanRequest): Promise<ExecutionPlan> {
    return APIClient.post<ExecutionPlan>(`${API_ROUTES.AGENTS.PLAN}/${id}/plan`, request);
  },

  async getCapabilities(id: string): Promise<string[]> {
    return APIClient.get<string[]>(`${API_ROUTES.AGENTS.CAPABILITIES}/${id}/capabilities`);
  },

  async learn(
    id: string,
    data: AgentLearningData
  ): Promise<{ success: boolean; message?: string }> {
    return APIClient.post(`${API_ROUTES.AGENTS.LEARN}/${id}/learn`, data);
  },

  async participate(
    id: string,
    request: AgentParticipationRequest
  ): Promise<{ success: boolean; turnId?: string }> {
    return APIClient.post(`${API_ROUTES.AGENTS.PARTICIPATE}/${id}/participate`, request);
  },

  async chat(id: string, request: AgentChatRequest): Promise<AgentChatResponse> {
    return APIClient.post<AgentChatResponse>(`${API_ROUTES.AGENTS.CHAT}/${id}/chat`, request);
  },

  async getMetrics(id: string, days: number = 30): Promise<Record<string, unknown>> {
    return APIClient.get(`${API_ROUTES.AGENTS.GET}/${id}/metrics`, { params: { days } });
  },

  async assignTool(agentId: string, toolId: string, permissions?: unknown): Promise<void> {
    return APIClient.post(`${API_ROUTES.AGENTS.GET}/${agentId}/tools/${toolId}`, permissions || {});
  },

  async removeTool(agentId: string, toolId: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.AGENTS.GET}/${agentId}/tools/${toolId}`);
  },

  async getTools(id: string): Promise<unknown[]> {
    return APIClient.get(`${API_ROUTES.AGENTS.GET}/${id}/tools`);
  },

  async executeTool(agentId: string, toolName: string, input: unknown): Promise<unknown> {
    return APIClient.post(`${API_ROUTES.AGENTS.GET}/${agentId}/tools/${toolName}/execute`, input);
  },

  health: {
    async check(): Promise<AgentHealthCheck> {
      return APIClient.get<AgentHealthCheck>(`${API_ROUTES.AGENTS.HEALTH}/health`);
    },
  },
};
