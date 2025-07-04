import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import {
  ConversationWebSocketEventType,
  ConversationIntelligenceEventType,
  Intent,
  PromptSuggestion,
  AutocompleteSuggestion
} from '@uaip/types';

interface UseConversationIntelligenceOptions {
  agentId: string;
  conversationId?: string;
  onIntentDetected?: (intent: Intent, toolPreview?: any) => void;
  onTopicGenerated?: (topicName: string, confidence: number) => void;
  onSuggestionsUpdated?: (suggestions: PromptSuggestion[]) => void;
  onAutocompleteResults?: (suggestions: AutocompleteSuggestion[]) => void;
}

interface ConversationIntelligenceState {
  connected: boolean;
  currentIntent: Intent | null;
  currentTopic: string | null;
  topicConfidence: number;
  promptSuggestions: PromptSuggestion[];
  autocompleteSuggestions: AutocompleteSuggestion[];
  loading: {
    intent: boolean;
    topic: boolean;
    suggestions: boolean;
    autocomplete: boolean;
  };
}

export const useConversationIntelligence = (options: UseConversationIntelligenceOptions) => {
  const {
    agentId,
    conversationId,
    onIntentDetected,
    onTopicGenerated,
    onSuggestionsUpdated,
    onAutocompleteResults
  } = options;

  const [state, setState] = useState<ConversationIntelligenceState>({
    connected: false,
    currentIntent: null,
    currentTopic: null,
    topicConfidence: 0,
    promptSuggestions: [],
    autocompleteSuggestions: [],
    loading: {
      intent: false,
      topic: false,
      suggestions: false,
      autocomplete: false
    }
  });

  const socketRef = useRef<Socket | null>(null);
  const { user } = useAuth();

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user?.token) return;

    const socket = io('/conversation-intelligence', {
      auth: { token: user.token },
      query: { agentId, conversationId }
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connected', (data) => {
      console.log('Connected to conversation intelligence:', data);
      setState(prev => ({ ...prev, connected: true }));
    });

    socket.on('disconnect', () => {
      setState(prev => ({ ...prev, connected: false }));
    });

    // Intent detection events
    socket.on(ConversationWebSocketEventType.INTENT_DETECTED, (data) => {
      setState(prev => ({
        ...prev,
        currentIntent: data.intent,
        loading: { ...prev.loading, intent: false }
      }));
      
      if (onIntentDetected) {
        onIntentDetected(data.intent, data.toolPreview);
      }
    });

    // Topic generation events
    socket.on(ConversationWebSocketEventType.TOPIC_GENERATED, (data) => {
      setState(prev => ({
        ...prev,
        currentTopic: data.topicName,
        topicConfidence: data.confidence,
        loading: { ...prev.loading, topic: false }
      }));
      
      if (onTopicGenerated) {
        onTopicGenerated(data.topicName, data.confidence);
      }
    });

    // Suggestions events
    socket.on(ConversationWebSocketEventType.SUGGESTIONS_UPDATED, (data) => {
      setState(prev => ({
        ...prev,
        promptSuggestions: data.prompts,
        loading: { ...prev.loading, suggestions: false }
      }));
      
      if (onSuggestionsUpdated) {
        onSuggestionsUpdated(data.prompts);
      }
    });

    // Autocomplete events
    socket.on(ConversationWebSocketEventType.AUTOCOMPLETE_RESULTS, (data) => {
      setState(prev => ({
        ...prev,
        autocompleteSuggestions: data.suggestions,
        loading: { ...prev.loading, autocomplete: false }
      }));
      
      if (onAutocompleteResults) {
        onAutocompleteResults(data.suggestions);
      }
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Conversation intelligence error:', error);
      setState(prev => ({
        ...prev,
        loading: {
          intent: false,
          topic: false,
          suggestions: false,
          autocomplete: false
        }
      }));
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [user?.token, agentId, conversationId, onIntentDetected, onTopicGenerated, onSuggestionsUpdated, onAutocompleteResults]);

  // Update conversation context
  const updateConversation = useCallback((newConversationId?: string, newAgentId?: string) => {
    if (!socketRef.current) return;

    socketRef.current.emit('update_conversation', {
      conversationId: newConversationId,
      agentId: newAgentId
    });
  }, []);

  // Request intent detection
  const detectIntent = useCallback((text: string, context?: any) => {
    if (!socketRef.current) return;

    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, intent: true }
    }));

    socketRef.current.emit('request_intent_detection', {
      text,
      conversationId,
      context
    });
  }, [conversationId]);

  // Request topic generation
  const generateTopic = useCallback((messages: Array<{ content: string; role: 'user' | 'assistant'; timestamp: Date }>, currentTopic?: string) => {
    if (!socketRef.current) return;

    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, topic: true }
    }));

    socketRef.current.emit('request_topic_generation', {
      messages,
      currentTopic
    });
  }, []);

  // Request prompt suggestions
  const requestPromptSuggestions = useCallback((conversationContext: any, count: number = 3) => {
    if (!socketRef.current) return;

    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, suggestions: true }
    }));

    socketRef.current.emit('request_prompt_suggestions', {
      conversationContext,
      count
    });
  }, []);

  // Request autocomplete
  const requestAutocomplete = useCallback((partial: string, context?: any, limit: number = 5) => {
    if (!socketRef.current || partial.length < 2) {
      setState(prev => ({
        ...prev,
        autocompleteSuggestions: []
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      loading: { ...prev.loading, autocomplete: true }
    }));

    socketRef.current.emit('autocomplete_query', {
      partial,
      context,
      limit
    });
  }, []);

  // Clear autocomplete suggestions
  const clearAutocomplete = useCallback(() => {
    setState(prev => ({
      ...prev,
      autocompleteSuggestions: []
    }));
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    updateConversation,
    detectIntent,
    generateTopic,
    requestPromptSuggestions,
    requestAutocomplete,
    clearAutocomplete
  };
};