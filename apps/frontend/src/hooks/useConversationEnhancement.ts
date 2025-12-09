/**
 * useConversationEnhancement Hook
 *
 * React hook for accessing conversation enhancement functionality
 * from the backend service. Provides easy access to persona selection,
 * contextual responses, and conversation analysis.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  conversationEnhancementAPI,
  ConversationEnhancementRequest,
  ConversationAnalysisRequest,
} from '../api/conversationEnhancement.api';

export interface UseConversationEnhancementOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface ConversationState {
  activePersonaId: string | null;
  lastSpeakerContinuityCount: number;
  recentContributors: string[];
  conversationEnergy: number;
  needsClarification: boolean;
  topicStability: 'stable' | 'shifting' | 'diverging';
}

export const useConversationEnhancement = (options: UseConversationEnhancementOptions = {}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationHealth, setConversationHealth] = useState<any>(null);
  const [flowAnalysis, setFlowAnalysis] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);

  // Get enhanced contribution from agents
  const getEnhancedContribution = useCallback(async (request: ConversationEnhancementRequest) => {
    setLoading(true);
    setError(null);

    try {
      const result = await conversationEnhancementAPI.getEnhancedContribution(request);
      return result;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to get enhanced contribution';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Analyze conversation
  const analyzeConversation = useCallback(async (request: ConversationAnalysisRequest) => {
    setLoading(true);
    setError(null);

    try {
      const result = await conversationEnhancementAPI.analyzeConversation(request);

      // Update local state based on analysis type
      if (request.analysisType === 'health') {
        setConversationHealth(result.data);
      } else if (request.analysisType === 'flow') {
        setFlowAnalysis(result.data);
      } else if (request.analysisType === 'insights') {
        setInsights(result.data);
      }

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze conversation';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Create hybrid persona
  const createHybridPersona = useCallback(
    async (persona1Id: string, persona2Id: string, hybridConfig?: any) => {
      setLoading(true);
      setError(null);

      try {
        const result = await conversationEnhancementAPI.createHybridPersona({
          persona1Id,
          persona2Id,
          hybridConfig,
        });
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create hybrid persona';
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Generate contextual response
  const generateContextualResponse = useCallback(
    async (agentId: string, personaId: string, context: any, baseContent: string) => {
      setLoading(true);
      setError(null);

      try {
        const result = await conversationEnhancementAPI.generateContextualResponse({
          agentId,
          personaId,
          context,
          baseContent,
        });
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to generate contextual response';
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Get conversation health
  const getConversationHealth = useCallback(async (discussionId: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await conversationEnhancementAPI.getConversationHealth(discussionId);
      setConversationHealth(result.data);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get conversation health';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get agent personas
  const getAgentPersonas = useCallback(async (agentId: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await conversationEnhancementAPI.getAgentPersonas(agentId);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get agent personas';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize conversation state
  const initializeConversationState = useCallback((): ConversationState => {
    return {
      activePersonaId: null,
      lastSpeakerContinuityCount: 0,
      recentContributors: [],
      conversationEnergy: 0.5,
      needsClarification: false,
      topicStability: 'stable',
    };
  }, []);

  // Enhanced conversation flow analysis
  const getFlowAnalysis = useCallback(
    async (discussionId: string, messageHistory: any[], conversationState: ConversationState) => {
      const result = await analyzeConversation({
        discussionId,
        messageHistory,
        conversationState,
        analysisType: 'flow',
      });
      return result;
    },
    [analyzeConversation]
  );

  // Enhanced conversation insights
  const getConversationInsights = useCallback(
    async (discussionId: string, messageHistory: any[], conversationState: ConversationState) => {
      const result = await analyzeConversation({
        discussionId,
        messageHistory,
        conversationState,
        analysisType: 'insights',
      });
      return result;
    },
    [analyzeConversation]
  );

  // Auto-refresh functionality
  useEffect(() => {
    if (options.autoRefresh && options.refreshInterval) {
      const interval = setInterval(() => {
        // Auto-refresh logic could be implemented here
        // For now, we'll just clear errors
        setError(null);
      }, options.refreshInterval);

      return () => clearInterval(interval);
    }
  }, [options.autoRefresh, options.refreshInterval]);

  return {
    // State
    loading,
    error,
    conversationHealth,
    flowAnalysis,
    insights,

    // Methods
    getEnhancedContribution,
    analyzeConversation,
    createHybridPersona,
    generateContextualResponse,
    getConversationHealth,
    getAgentPersonas,
    initializeConversationState,
    getFlowAnalysis,
    getConversationInsights,

    // Utils
    clearError: () => setError(null),
    reset: () => {
      setLoading(false);
      setError(null);
      setConversationHealth(null);
      setFlowAnalysis(null);
      setInsights(null);
    },
  };
};

export default useConversationEnhancement;
