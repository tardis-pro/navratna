/**
 * Agent Intelligence API Client
 * Handles all agent-related operations
 */

import { coreClient, edenWithCSRFRetry, edenRequest, unwrapEden as _unwrapEden } from './eden';
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

const agents = coreClient.api.v1.agents

export const agentsAPI = {
  async list(options?: AgentListOptions): Promise<Agent[]> {
    return edenWithCSRFRetry(() => agents.get({ query: options }));
  },

  async get(id: string): Promise<Agent> {
    return edenWithCSRFRetry(() => agents({ agentId: id }).get());
  },

  async create(agent: AgentCreate): Promise<Agent> {
    return edenWithCSRFRetry(() => agents.post(agent));
  },

  async update(id: string, updates: AgentUpdate): Promise<Agent> {
    return edenWithCSRFRetry(() => agents({ agentId: id }).put(updates));
  },

  async delete(id: string): Promise<void> {
    return edenWithCSRFRetry(() => agents({ agentId: id }).delete());
  },

  async analyze(id: string, request: AgentAnalysisRequest): Promise<AgentAnalysisResult> {
    return edenWithCSRFRetry(() => agents({ agentId: id }).analyze.post(request));
  },

  async plan(id: string, request: AgentPlanRequest): Promise<ExecutionPlan> {
    return edenWithCSRFRetry(() => agents({ agentId: id }).plan.post(request));
  },

  async getCapabilities(id: string): Promise<string[]> {
    return edenWithCSRFRetry(() => agents({ agentId: id }).capabilities.get());
  },

  async learn(
    id: string,
    data: AgentLearningData
  ): Promise<{ success: boolean; message?: string }> {
    return edenWithCSRFRetry(() => agents({ agentId: id }).learn.post(data));
  },

  async participate(
    id: string,
    request: AgentParticipationRequest
  ): Promise<{ success: boolean; turnId?: string }> {
    return edenRequest(`/api/v1/agents/${id}/participate`, { method: 'POST', body: request });
  },

  async chat(id: string, request: AgentChatRequest): Promise<AgentChatResponse> {
    return edenWithCSRFRetry(() => agents({ agentId: id }).chat.post(request));
  },

  async resolveApproval(
    agentId: string,
    approvalId: string,
    payload: { approved: boolean; reason?: string }
  ): Promise<{ success?: boolean; message?: string }> {
    return edenWithCSRFRetry(() => agents({ agentId }).approvals({ approvalId }).post(payload));
  },

  async getMetrics(id: string, days: number = 30): Promise<Record<string, unknown>> {
    return edenRequest(`/api/v1/agents/${id}/metrics?days=${days}`, { method: 'GET' });
  },

  async assignTool(agentId: string, toolId: string, permissions?: unknown): Promise<void> {
    return edenRequest(`/api/v1/agents/${agentId}/tools/${toolId}`, {
      method: 'POST',
      body: permissions ?? {},
    });
  },

  async removeTool(agentId: string, toolId: string): Promise<void> {
    return edenRequest(`/api/v1/agents/${agentId}/tools/${toolId}`, { method: 'DELETE' });
  },

  async getTools(id: string): Promise<unknown[]> {
    return edenRequest(`/api/v1/agents/${id}/tools`, { method: 'GET' });
  },

  async executeTool(agentId: string, toolName: string, input: unknown): Promise<unknown> {
    return edenRequest(`/api/v1/agents/${agentId}/tools/${toolName}/execute`, {
      method: 'POST',
      body: input,
    });
  },

  health: {
    async check(): Promise<AgentHealthCheck> {
      return edenRequest('/api/v1/agents/health', { method: 'GET' });
    },
  },
};
