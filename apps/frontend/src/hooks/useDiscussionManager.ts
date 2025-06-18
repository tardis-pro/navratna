import { useState, useEffect, useCallback, useRef } from 'react';
import { uaipAPI, generateUUID, TurnStrategy, DiscussionEvent } from '../utils/uaip-api';
import { AgentState, Message } from '../types/agent';
import { DocumentContext } from '../types/document';
import { useAuth } from '../contexts/AuthContext';
import { useAgents } from '../contexts/AgentContext';

export interface DiscussionManagerConfig {
  topic: string;
  maxRounds?: number;
  turnStrategy?: 'round_robin' | 'moderated' | 'context_aware';
}

export interface DiscussionState {
  isRunning: boolean;
  currentSpeakerId: string | null;
  turnQueue: string[];
  messageHistory: Message[];
  currentRound: number;
  lastError: string | null;
}

export interface DiscussionManagerHook {
  currentTurn: string | null;
  isActive: boolean;
  history: Message[];
  currentRound: number;
  state: DiscussionState;
  discussionId: string | null;
  addAgent: (agentId: string, state: AgentState) => Promise<void>;
  removeAgent: (agentId: string) => Promise<void>;
  setModerator: (agentId: string) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  addMessage: (agentId: string, content: string) => Promise<void>;
  setInitialDocument: (document: string) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  reset: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
  getDiscussionAnalytics: () => {
    totalMessages: number;
    participantCount: number;
    averageResponseTime: number;
    topicCoverage: string[];
  };
}

// WebSocket event types are now imported from uaip-api service

export function useDiscussionManager(config: DiscussionManagerConfig): DiscussionManagerHook {
  const { user: currentUser, isLoading, isAuthenticated } = useAuth();
  const { agents } = useAgents();
  const user = currentUser.user;
  const [discussionId, setDiscussionId] = useState<string | null>(null);
  const [state, setState] = useState<DiscussionState>({
    isRunning: false,
    currentSpeakerId: null,
    turnQueue: [],
    messageHistory: [],
    currentRound: 0,
    lastError: null,
  });
  const [document, setDocument] = useState<DocumentContext | null>(null);
  const [moderatorId, setModeratorId] = useState<string | null>(null);
  
  const refreshDiscussion = useCallback(async () => {
    if (!discussionId) return;
    
    try {
      const discussion = await uaipAPI.discussions.get(discussionId);
      
      // Update state based on backend discussion
      setState(prev => ({
        ...prev,
        isRunning: discussion.status === 'active',
        currentSpeakerId: discussion.currentTurnAgentId || null,
        currentRound: discussion.state?.currentTurn || 0,
      }));
      
      // Fetch messages
      const messages = await uaipAPI.discussions.getMessages(discussionId);
      const frontendMessages: Message[] = messages.map(msg => ({
        id: msg.id,
        content: msg.content,
        sender: msg.participantId,
        timestamp: new Date(msg.createdAt),
        type: msg.messageType === 'message' ? 'response' : msg.messageType as any,
        replyTo: msg.replyTo,
      }));
      
      setState(prev => ({
        ...prev,
        messageHistory: frontendMessages
      }));
      
    } catch (error) {
      console.error('Failed to refresh discussion:', error);
      setState(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }, [discussionId]);
  const handleDiscussionEvent = useCallback((event: DiscussionEvent) => {
    switch (event.type) {
      case 'message_added':
        // Convert backend message to frontend format
        const backendMessage = event.data.message || event.data;
        const frontendMessage: Message = {
          id: backendMessage.id,
          content: backendMessage.content,
          sender: backendMessage.participantId,
          timestamp: new Date(backendMessage.createdAt || backendMessage.timestamp),
          type: backendMessage.messageType === 'message' ? 'response' : backendMessage.messageType,
          replyTo: backendMessage.replyTo,
        };
        
        setState(prev => ({
          ...prev,
          messageHistory: [...prev.messageHistory, frontendMessage]
        }));
        break;
        
      case 'turn_started':
      case 'turn_ended':
        setState(prev => ({
          ...prev,
          currentSpeakerId: event.data.currentParticipantId || event.data.participantId,
          currentRound: event.data.turnNumber || prev.currentRound + 1
        }));
        break;
        
      case 'participant_joined':
        // Refresh discussion data to get updated participants
        refreshDiscussion();
        break;
        
      case 'participant_left':
        // Refresh discussion data
        refreshDiscussion();
        break;
    }
  }, [refreshDiscussion]);


  // Initialize WebSocket connection for real-time updates
  useEffect(() => {
    if (discussionId) {
      console.log('🔌 Setting up WebSocket listeners for discussion:', discussionId);
      
      try {
        // Use the global WebSocket client from uaipAPI
        const wsClient = uaipAPI.websocket;
        
        // Join the discussion room
        wsClient.joinDiscussion(discussionId);
        
        // Add event listeners for discussion events
        const handleDiscussionEventWrapper = (event: DiscussionEvent) => {
          // Only handle events for our specific discussion
          if (event.discussionId === discussionId) {
            console.log('📨 Discussion event received:', event);
            handleDiscussionEvent(event);
          }
        };

        // Listen for all discussion events
        wsClient.addEventListener('*', handleDiscussionEventWrapper);

        // Cleanup on unmount
        return () => {
          console.log('🔌 Removing WebSocket listeners for discussion:', discussionId);
          wsClient.removeEventListener('*', handleDiscussionEventWrapper);
          wsClient.leaveDiscussion(discussionId);
        };
      } catch (error) {
        console.error('🔌 Failed to initialize WebSocket connection:', error);
        setState(prev => ({
          ...prev,
          lastError: `WebSocket connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }));
        
        // Continue without WebSocket - the hook will still work for basic operations
        // Users will just need to manually refresh to see updates
      }
    }
  }, [discussionId, handleDiscussionEvent]);

  const createDiscussion = useCallback(async () => {
    try {
      // Just use the current hook values - the ref approach isn't working
      console.log('🔍 Creating discussion - Using direct hook values:', {
        user,
        hasUser: !!user,
        userId: user?.id,
        userType: typeof user,
        userKeys: user ? Object.keys(user) : 'N/A',
        isLoading,
        isAuthenticated,
        agentCount: Object.keys(agents).length
      });

      // Check if auth is still loading
      if (isLoading) {
        throw new Error('Authentication is still loading, please wait...');
      }

      // Check if user is authenticated
      if (!isAuthenticated) {
        throw new Error('User is not authenticated - please log in');
      }

      // Ensure we have a valid user ID
      if (!user?.id) {
        console.error('❌ User authentication issue:', {
          user,
          userType: typeof user,
          userKeys: user ? Object.keys(user) : 'N/A',
          isLoading,
          isAuthenticated
        });
        throw new Error(`User authenticated but missing ID - user: ${JSON.stringify(user)}`);
      }

      console.log('✅ Using userId:', user.id);

      // Create proper TurnStrategyConfig based on the strategy
      const turnStrategyConfig = (() => {
        const strategy = config.turnStrategy || 'round_robin';
        switch (strategy) {
          case 'round_robin':
            return {
              strategy: TurnStrategy.ROUND_ROBIN,
              config: {
                type: 'round_robin' as const,
                skipInactive: true,
                maxSkips: 3
              }
            };
          case 'moderated':
            return {
              strategy: TurnStrategy.MODERATED,
              config: {
                type: 'moderated' as const,
                moderatorId: moderatorId || user.id, // Use actual moderator or user ID
                requireApproval: true,
                autoAdvance: false
              }
            };
          case 'context_aware':
            return {
              strategy: TurnStrategy.CONTEXT_AWARE,
              config: {
                type: 'context_aware' as const,
                relevanceThreshold: 0.7,
                expertiseWeight: 0.3,
                engagementWeight: 0.2
              }
            };
          default:
            return {
              strategy: TurnStrategy.ROUND_ROBIN,
              config: {
                type: 'round_robin' as const,
                skipInactive: true,
                maxSkips: 3
              }
            };
        }
      })();

      // Get actual agents from context instead of generating fake ones
      const agentEntries = Object.entries(agents);
      const initialParticipants = agentEntries.slice(0, 2).map(([agentId, agentState]) => ({
        personaId: agentState.personaId , // Use actual persona ID or fallback to agent ID
        agentId: agentId, // Use actual agent ID
        role: moderatorId === agentId ? 'moderator' : 'participant'
      }));

      // If no agents available, create discussion without initial participants
      // (they can be added later via addAgent)
      const discussion = await uaipAPI.discussions.create({
        title: `Discussion: ${config.topic}`,
        description: `A collaborative discussion about ${config.topic}`,
        topic: config.topic,
        createdBy: user.id, // Use actual authenticated user ID
        turnStrategy: turnStrategyConfig,
        initialParticipants: initialParticipants // Use actual agents or empty array
      });
      
      setDiscussionId(discussion.id);
      return discussion.id;
    } catch (error) {
      console.error('Failed to create discussion:', error);
      setState(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Failed to create discussion'
      }));
      throw error;
    }
  }, [config, user, agents, moderatorId, isLoading, isAuthenticated]);

  const addAgent = useCallback(async (agentId: string, agentState: AgentState) => {
    try {
      let currentDiscussionId = discussionId;
      
      // Create discussion if it doesn't exist
      if (!currentDiscussionId) {
        currentDiscussionId = await createDiscussion();
      }
      
      // Validate that we have proper IDs
      if (!agentState.personaId) {
        throw new Error(`Agent ${agentId} does not have a valid persona ID`);
      }
      
      // Add participant to backend discussion
      await uaipAPI.discussions.addParticipant(currentDiscussionId, {
        personaId: agentState.personaId, // Use actual persona ID
        agentId: agentId, // Use the provided agent ID
        role: moderatorId === agentId ? 'moderator' : 'participant'
      });
      
      // Note: We don't need to update local agents state anymore since we're using AgentContext
      // The WebSocket will handle the participant.joined event
    } catch (error) {
      console.error('Failed to add agent:', error);
      setState(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Failed to add agent'
      }));
    }
  }, [discussionId, createDiscussion, moderatorId]);

  const removeAgent = useCallback(async (agentId: string) => {
    if (!discussionId) return;
    
    try {
      // Find participant by agent ID
      const discussion = await uaipAPI.discussions.get(discussionId);
      const participant = discussion.participants.find(p => p.agentId === agentId);
      
      if (participant) {
        await uaipAPI.discussions.removeParticipant(discussionId, participant.id);
      }
      
      // Note: We don't need to update local agents state anymore since we're using AgentContext
      
      // The WebSocket will handle the participant.left event
    } catch (error) {
      console.error('Failed to remove agent:', error);
      setState(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Failed to remove agent'
      }));
    }
  }, [discussionId]);

  const setModerator = useCallback((agentId: string) => {
    setModeratorId(agentId);
  }, []);

  const start = useCallback(async () => {
    try {
      let currentDiscussionId = discussionId;
      
      // Create discussion if it doesn't exist
      if (!currentDiscussionId) {
        currentDiscussionId = await createDiscussion();
      }
      
      // Start the discussion
      await uaipAPI.discussions.start(currentDiscussionId);
      
      // The WebSocket will handle the discussion.started event
    } catch (error) {
      console.error('Failed to start discussion:', error);
      setState(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Failed to start discussion'
      }));
    }
  }, [discussionId, createDiscussion]);

  const stop = useCallback(async () => {
    if (!discussionId) return;
    
    try {
      await uaipAPI.discussions.end(discussionId);
      
      // The WebSocket will handle the discussion.ended event
    } catch (error) {
      console.error('Failed to stop discussion:', error);
      setState(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Failed to stop discussion'
      }));
    }
  }, [discussionId]);

  const addMessage = useCallback(async (agentId: string, content: string) => {
    if (!discussionId) {
      throw new Error('No active discussion');
    }
    
    try {
      // Find participant by agent ID
      const discussion = await uaipAPI.discussions.get(discussionId);
      const participant = discussion.participants.find(p => p.agentId === agentId);
      
      if (!participant) {
        throw new Error('Agent is not a participant in this discussion');
      }
      
      // Send message through backend
      await uaipAPI.discussions.sendMessage(discussionId, {
        content,
        messageType: 'message',
        metadata: {
          agentId,
          timestamp: new Date().toISOString()
        }
      });
      
      // The WebSocket will handle the message.sent event
    } catch (error) {
      console.error('Failed to send message:', error);
      setState(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Failed to send message'
      }));
      throw error;
    }
  }, [discussionId]);

  const setInitialDocument = useCallback((documentContent: string) => {
    const documentContext: DocumentContext = {
      id: 'initial-document',
      title: 'Discussion Topic',
      content: documentContent,
      type: 'general',
      metadata: {
        createdAt: new Date(),
        lastModified: new Date()
      },
      tags: []
    };
    
    setDocument(documentContext);
  }, []);

  const pause = useCallback(async () => {
    if (!discussionId) return;
    
    try {
      await uaipAPI.discussions.update(discussionId, { status: 'paused' });
      // The WebSocket will handle the status.changed event
    } catch (error) {
      console.error('Failed to pause discussion:', error);
      setState(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Failed to pause discussion'
      }));
    }
  }, [discussionId]);

  const resume = useCallback(async () => {
    if (!discussionId) return;
    
    try {
      await uaipAPI.discussions.update(discussionId, { status: 'active' });
      // The WebSocket will handle the status.changed event
    } catch (error) {
      console.error('Failed to resume discussion:', error);
      setState(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Failed to resume discussion'
      }));
    }
  }, [discussionId]);

  const reset = useCallback(async () => {
    try {
      if (discussionId) {
        await uaipAPI.discussions.end(discussionId);
      }
      
      // Close WebSocket connection
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      
      setDiscussionId(null);
      setState({
        isRunning: false,
        currentSpeakerId: null,
        turnQueue: [],
        messageHistory: [],
        currentRound: 0,
        lastError: null,
      });
      // Note: We don't need to clear agents state since we're using AgentContext
    } catch (error) {
      console.error('Failed to reset discussion:', error);
      setState(prev => ({
        ...prev,
        lastError: error instanceof Error ? error.message : 'Failed to reset discussion'
      }));
    }
  }, [discussionId]);

  const syncWithBackend = useCallback(async () => {
    // Sync with backend by refreshing discussion data
    if (discussionId) {
      await refreshDiscussion();
    }
  }, [discussionId, refreshDiscussion]);

  const getDiscussionAnalytics = useCallback(() => {
    // Compute analytics from current state
    const totalMessages = state.messageHistory.length;
    const participantCount = Object.keys(agents).length;
    
    // Calculate average response time (simplified - time between consecutive messages)
    let totalResponseTime = 0;
    let responseCount = 0;
    
    for (let i = 1; i < state.messageHistory.length; i++) {
      const currentMsg = state.messageHistory[i];
      const prevMsg = state.messageHistory[i - 1];
      
      if (currentMsg.sender !== prevMsg.sender) {
        const responseTime = currentMsg.timestamp.getTime() - prevMsg.timestamp.getTime();
        totalResponseTime += responseTime;
        responseCount++;
      }
    }
    
    const averageResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;
    
    // Extract topics from message content (simplified - look for key phrases)
    const topicKeywords = new Set<string>();
    state.messageHistory.forEach(message => {
      const content = message.content.toLowerCase();
      // Simple topic extraction - look for common discussion topics
      const topics = [
        'ai', 'artificial intelligence', 'machine learning', 'neural network',
        'algorithm', 'data', 'model', 'training', 'prediction', 'analysis',
        'automation', 'optimization', 'performance', 'efficiency', 'innovation',
        'technology', 'development', 'implementation', 'strategy', 'solution'
      ];
      
      topics.forEach(topic => {
        if (content.includes(topic)) {
          topicKeywords.add(topic);
        }
      });
    });
    
    return {
      totalMessages,
      participantCount,
      averageResponseTime,
      topicCoverage: Array.from(topicKeywords)
    };
  }, [state.messageHistory, agents]);

  return {
    currentTurn: state.currentSpeakerId,
    isActive: state.isRunning,
    history: state.messageHistory,
    currentRound: state.currentRound,
    state,
    discussionId,
    addAgent,
    removeAgent,
    setModerator,
    start,
    stop,
    addMessage,
    setInitialDocument,
    pause,
    resume,
    reset,
    syncWithBackend,
    getDiscussionAnalytics
  };
} 