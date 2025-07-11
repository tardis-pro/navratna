/**
 * Conversation Enhancement API Client
 * 
 * Provides frontend access to backend conversation enhancement services
 * including persona selection, contextual responses, and conversation analysis.
 */

import { API_BASE_URL } from '../config/apiConfig';

export interface ConversationEnhancementRequest {
  discussionId: string;
  availableAgentIds: string[];
  messageHistory: Array<{
    id: string;
    speaker: string;
    content: string;
    timestamp: Date;
    metadata?: any;
  }>;
  currentTopic: string;
  conversationState?: {
    activePersonaId: string | null;
    lastSpeakerContinuityCount: number;
    recentContributors: string[];
    conversationEnergy: number;
    needsClarification: boolean;
    topicStability: 'stable' | 'shifting' | 'diverging';
  };
  participantId?: string;
  enhancementType?: 'auto' | 'manual' | 'triggered';
  context?: any;
}

export interface ConversationEnhancementResult {
  success: boolean;
  data?: {
    selectedAgent: any;
    selectedPersona: any;
    enhancedResponse: string;
    contributionScores: Array<{
      personaId: string;
      score: number;
      reasons: string[];
    }>;
    updatedState: any;
    flowAnalysis: any;
    suggestions: string[];
    nextActions: string[];
  };
  error?: string;
}

export interface ConversationAnalysisRequest {
  discussionId: string;
  messageHistory: Array<{
    id: string;
    speaker: string;
    content: string;
    timestamp: Date;
    metadata?: any;
  }>;
  conversationState: {
    activePersonaId: string | null;
    lastSpeakerContinuityCount: number;
    recentContributors: string[];
    conversationEnergy: number;
    needsClarification: boolean;
    topicStability: 'stable' | 'shifting' | 'diverging';
  };
  analysisType: 'flow' | 'insights' | 'health' | 'patterns';
}

export interface HybridPersonaRequest {
  persona1Id: string;
  persona2Id: string;
  hybridConfig?: {
    name?: string;
    dominantTraits?: 'persona1' | 'persona2' | 'balanced';
    blendRatio?: number;
    customAttributes?: any;
  };
}

export interface ContextualResponseRequest {
  agentId: string;
  personaId: string;
  context: {
    recentTopics: string[];
    conversationMomentum: 'building' | 'stable' | 'declining' | 'clarifying' | 'deciding';
    overallTone: 'collaborative' | 'competitive' | 'analytical' | 'creative';
    topicShiftDetected: boolean;
    participantCount: number;
  };
  baseContent: string;
}

class ConversationEnhancementAPI {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/agent-intelligence/api/v1/conversation`;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    data?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = localStorage.getItem('authToken');

    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      }
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
  async analyzeConversation(request: ConversationAnalysisRequest): Promise<any> {
    return this.makeRequest('/analyze', 'POST', request);
  }

  /**
   * Create a hybrid persona by cross-breeding two existing personas
   */
  async createHybridPersona(request: HybridPersonaRequest): Promise<any> {
    return this.makeRequest('/hybrid-persona', 'POST', request);
  }

  /**
   * Generate a contextual response for a specific agent/persona
   */
  async generateContextualResponse(request: ContextualResponseRequest): Promise<any> {
    return this.makeRequest('/contextual-response', 'POST', request);
  }

  /**
   * Get available personas for a specific agent
   */
  async getAgentPersonas(agentId: string): Promise<any> {
    return this.makeRequest(`/personas/${agentId}`);
  }

  /**
   * Get conversation health metrics for a discussion
   */
  async getConversationHealth(discussionId: string): Promise<any> {
    return this.makeRequest(`/health/${discussionId}`);
  }

  /**
   * Get conversation flow analysis with suggestions
   */
  async getFlowAnalysis(
    discussionId: string,
    messageHistory: any[],
    conversationState: any
  ): Promise<any> {
    return this.analyzeConversation({
      discussionId,
      messageHistory,
      conversationState,
      analysisType: 'flow'
    });
  }

  /**
   * Get conversation insights and metrics
   */
  async getConversationInsights(
    discussionId: string,
    messageHistory: any[],
    conversationState: any
  ): Promise<any> {
    return this.analyzeConversation({
      discussionId,
      messageHistory,
      conversationState,
      analysisType: 'insights'
    });
  }

  /**
   * Get conversation pattern analysis
   */
  async getConversationPatterns(
    discussionId: string,
    messageHistory: any[],
    conversationState: any
  ): Promise<any> {
    return this.analyzeConversation({
      discussionId,
      messageHistory,
      conversationState,
      analysisType: 'patterns'
    });
  }
}

// Export singleton instance
export const conversationEnhancementAPI = new ConversationEnhancementAPI();

// Export for use in React hooks
export default conversationEnhancementAPI;