/**
 * Conversation Enhancement API Client
 *
 * Provides frontend access to backend conversation enhancement services
 * including persona selection, contextual responses, and conversation analysis.
 */

import { API_BASE_URL } from '../config/apiConfig';
import type {
  ConversationEnhancementRequest,
  ConversationEnhancementResult,
  ConversationAnalysisRequest,
  HybridPersonaRequest,
  ContextualResponseRequest,
} from '@uaip/types';

export type {
  ConversationEnhancementRequest,
  ConversationEnhancementResult,
  ConversationAnalysisRequest,
  HybridPersonaRequest,
  ContextualResponseRequest,
};

class ConversationEnhancementAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/agent-intelligence/api/v1/conversation`;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    data?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const config: RequestInit = {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (method === 'POST' && data) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`ConversationEnhancement API Error (${method} ${endpoint}):`, error);
      throw error;
    }
  }

  /**
   * Get enhanced conversation contribution from available agents
   */
  async getEnhancedContribution(
    request: ConversationEnhancementRequest
  ): Promise<ConversationEnhancementResult> {
    return this.makeRequest<ConversationEnhancementResult>('/enhance', 'POST', request);
  }

  /**
   * Analyze conversation patterns, flow, and health
   */
  async analyzeConversation(request: ConversationAnalysisRequest): Promise<unknown> {
    return this.makeRequest('/analyze', 'POST', request);
  }

  /**
   * Create a hybrid persona by cross-breeding two existing personas
   */
  async createHybridPersona(request: HybridPersonaRequest): Promise<unknown> {
    return this.makeRequest('/hybrid-persona', 'POST', request);
  }

  /**
   * Generate a contextual response for a specific agent/persona
   */
  async generateContextualResponse(request: ContextualResponseRequest): Promise<unknown> {
    return this.makeRequest('/contextual-response', 'POST', request);
  }

  /**
   * Get available personas for a specific agent
   */
  async getAgentPersonas(agentId: string): Promise<unknown> {
    return this.makeRequest(`/personas/${agentId}`);
  }

  /**
   * Get conversation health metrics for a discussion
   */
  async getConversationHealth(discussionId: string): Promise<unknown> {
    return this.makeRequest(`/health/${discussionId}`);
  }

  /**
   * Get conversation flow analysis with suggestions
   */
  async getFlowAnalysis(
    discussionId: string,
    messageHistory: unknown[],
    conversationState: unknown
  ): Promise<unknown> {
    return this.analyzeConversation({
      discussionId,
      messageHistory,
      conversationState,
      analysisType: 'flow',
    });
  }

  /**
   * Get conversation insights and metrics
   */
  async getConversationInsights(
    discussionId: string,
    messageHistory: unknown[],
    conversationState: unknown
  ): Promise<unknown> {
    return this.analyzeConversation({
      discussionId,
      messageHistory,
      conversationState,
      analysisType: 'insights',
    });
  }

  /**
   * Get conversation pattern analysis
   */
  async getConversationPatterns(
    discussionId: string,
    messageHistory: unknown[],
    conversationState: unknown
  ): Promise<unknown> {
    return this.analyzeConversation({
      discussionId,
      messageHistory,
      conversationState,
      analysisType: 'patterns',
    });
  }
}

// Export singleton instance
export const conversationEnhancementAPI = new ConversationEnhancementAPI();

// Export for use in React hooks
export default conversationEnhancementAPI;
