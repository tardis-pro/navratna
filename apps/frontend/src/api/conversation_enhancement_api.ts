import { APIClient } from './client';
import type {
  ConversationEnhancementRequest,
  ConversationEnhancementResult,
  ConversationAnalysisRequest,
  HybridPersonaRequest,
  ContextualResponseRequest,
} from '@uaip/contracts/api';

export type {
  ConversationEnhancementRequest,
  ConversationEnhancementResult,
  ConversationAnalysisRequest,
  HybridPersonaRequest,
  ContextualResponseRequest,
};

const BASE = '/api/v1/conversation';

export const conversationEnhancementAPI = {
  async getEnhancedContribution(
    request: ConversationEnhancementRequest
  ): Promise<ConversationEnhancementResult> {
    return APIClient.post<ConversationEnhancementResult>(`${BASE}/enhance`, request);
  },

  async analyzeConversation(request: ConversationAnalysisRequest): Promise<unknown> {
    return APIClient.post(`${BASE}/analyze`, request);
  },

  async createHybridPersona(request: HybridPersonaRequest): Promise<unknown> {
    return APIClient.post(`${BASE}/hybrid-persona`, request);
  },

  async generateContextualResponse(request: ContextualResponseRequest): Promise<unknown> {
    return APIClient.post(`${BASE}/contextual-response`, request);
  },

  async getAgentPersonas(agentId: string): Promise<unknown> {
    return APIClient.get(`${BASE}/personas/${agentId}`);
  },

  async getConversationHealth(discussionId: string): Promise<unknown> {
    return APIClient.get(`${BASE}/health/${discussionId}`);
  },

  async getFlowAnalysis(
    discussionId: string,
    messageHistory: unknown[],
    conversationState: unknown
  ): Promise<unknown> {
    return APIClient.post(`${BASE}/analyze`, {
      discussionId,
      messageHistory,
      conversationState,
      analysisType: 'flow',
    } as ConversationAnalysisRequest);
  },

  async getConversationInsights(
    discussionId: string,
    messageHistory: unknown[],
    conversationState: unknown
  ): Promise<unknown> {
    return APIClient.post(`${BASE}/analyze`, {
      discussionId,
      messageHistory,
      conversationState,
      analysisType: 'insights',
    } as ConversationAnalysisRequest);
  },

  async getConversationPatterns(
    discussionId: string,
    messageHistory: unknown[],
    conversationState: unknown
  ): Promise<unknown> {
    return APIClient.post(`${BASE}/analyze`, {
      discussionId,
      messageHistory,
      conversationState,
      analysisType: 'patterns',
    } as ConversationAnalysisRequest);
  },
};

export default conversationEnhancementAPI;
