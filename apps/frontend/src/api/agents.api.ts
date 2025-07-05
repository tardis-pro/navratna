/**
 * Agent Intelligence API Client
 * Handles all agent-related operations
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import type {
  Agent,
  AgentRole,
  AgentCreate,
  AgentUpdate,
  AgentIntelligenceConfig,
  AgentSecurityContext,
  ConversationContext,
  ContextAnalysis,
  AgentAnalysisResult,
  ExecutionPlan,
  SecurityLevel,
  AgentStatus,
  AgentContextData
} from '@uaip/types';

export interface AgentHealthCheck {
  status: string;
  message?: string;
  timestamp: string;
  dependencies?: {
    [key: string]: {
      status: string;
      message?: string;
    };
  };
}

export interface AgentListOptions {
  page?: number;
  limit?: number;
  role?: AgentRole;
  status?: AgentStatus;
  search?: string;
}

export interface AgentAnalysisRequest {
  context: ContextAnalysis;
  conversationHistory?: ConversationContext[];
  securityContext?: AgentSecurityContext;
}

export interface AgentPlanRequest {
  context: ContextAnalysis;
  conversationHistory?: ConversationContext[];
  agentSecurityContext?: AgentSecurityContext;
  options?: {
    includeRiskAssessment?: boolean;
    includeCostEstimate?: boolean;
  };
}

export interface AgentLearningData {
  executionId: string;
  outcome: 'success' | 'failure' | 'partial';
  feedback?: string;
  metrics?: Record<string, any>;
}

export interface AgentParticipationRequest {
  discussionId: string;
  message?: string;
  turnData?: any;
}

export interface AgentChatRequest {
  message: string;
  conversationId?: string;
  context?: AgentContextData;
}

export interface AgentChatResponse {
  response: string;
  conversationId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

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
    return APIClient.post<AgentAnalysisResult>(`${API_ROUTES.AGENTS.ANALYZE}/${id}/analyze`, request);
  },

  async plan(id: string, request: AgentPlanRequest): Promise<ExecutionPlan> {
    return APIClient.post<ExecutionPlan>(`${API_ROUTES.AGENTS.PLAN}/${id}/plan`, request);
  },

  async getCapabilities(id: string): Promise<string[]> {
    return APIClient.get<string[]>(`${API_ROUTES.AGENTS.CAPABILITIES}/${id}/capabilities`);
  },

  async learn(id: string, data: AgentLearningData): Promise<{ success: boolean; message?: string }> {
    return APIClient.post(`${API_ROUTES.AGENTS.LEARN}/${id}/learn`, data);
  },

  async participate(id: string, request: AgentParticipationRequest): Promise<{ success: boolean; turnId?: string }> {
    return APIClient.post(`${API_ROUTES.AGENTS.PARTICIPATE}/${id}/participate`, request);
  },

  async chat(id: string, request: AgentChatRequest): Promise<AgentChatResponse> {
    return APIClient.post<AgentChatResponse>(`${API_ROUTES.AGENTS.CHAT}/${id}/chat`, request);
  },

  async getMetrics(id: string, days: number = 30): Promise<Record<string, any>> {
    return APIClient.get(`${API_ROUTES.AGENTS.GET}/${id}/metrics`, { params: { days } });
  },

  async assignTool(agentId: string, toolId: string, permissions?: any): Promise<void> {
    return APIClient.post(`${API_ROUTES.AGENTS.GET}/${agentId}/tools/${toolId}`, permissions || {});
  },

  async removeTool(agentId: string, toolId: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.AGENTS.GET}/${agentId}/tools/${toolId}`);
  },

  async getTools(id: string): Promise<any[]> {
    return APIClient.get(`${API_ROUTES.AGENTS.GET}/${id}/tools`);
  },

  async executeTool(agentId: string, toolName: string, input: any): Promise<any> {
    return APIClient.post(`${API_ROUTES.AGENTS.GET}/${agentId}/tools/${toolName}/execute`, input);
  },

  health: {
    async check(): Promise<AgentHealthCheck> {
      return APIClient.get<AgentHealthCheck>(`${API_ROUTES.AGENTS.HEALTH}/health`);
    }
  }
};