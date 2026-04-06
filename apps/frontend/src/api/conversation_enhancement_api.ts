import { edenRequest } from './eden';
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
    return edenRequest<ConversationEnhancementResult>(`${BASE}/enhance`, { method: 'POST', body: request });
  },

  async analyzeConversation(request: ConversationAnalysisRequest): Promise<unknown> {
    return edenRequest(`${BASE}/analyze`, { method: 'POST', body: request });
  },

  async createHybridPersona(request: HybridPersonaRequest): Promise<unknown> {
    return edenRequest(`${BASE}/hybrid-persona`, { method: 'POST', body: request });
  },

  async generateContextualResponse(request: ContextualResponseRequest): Promise<unknown> {
    return edenRequest(`${BASE}/contextual-response`, { method: 'POST', body: request });
  },

  async getAgentPersonas(agentId: string): Promise<unknown> {
    return edenRequest(`${BASE}/personas/${agentId}`, { method: 'GET' });
  },

  async getConversationHealth(discussionId: string): Promise<unknown> {
    return edenRequest(`${BASE}/health/${discussionId}`, { method: 'GET' });
  },

  async getFlowAnalysis(
    discussionId: string,
    messageHistory: unknown[],
    conversationState: unknown
  ): Promise<unknown> {
    return edenRequest(`${BASE}/analyze`, {
      method: 'POST',
      body: { discussionId, messageHistory, conversationState, analysisType: 'flow' },
    });
  },

  async getConversationInsights(
    discussionId: string,
    messageHistory: unknown[],
    conversationState: unknown
  ): Promise<unknown> {
    return edenRequest(`${BASE}/analyze`, {
      method: 'POST',
      body: { discussionId, messageHistory, conversationState, analysisType: 'insights' },
    });
  },

  async getConversationPatterns(
    discussionId: string,
    messageHistory: unknown[],
    conversationState: unknown
  ): Promise<unknown> {
    return edenRequest(`${BASE}/analyze`, {
      method: 'POST',
      body: { discussionId, messageHistory, conversationState, analysisType: 'patterns' },
    });
  },
};

export default conversationEnhancementAPI;
