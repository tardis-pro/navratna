import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAgents } from './AgentContext';
import { useAuth } from './AuthContext';
import { useEnhancedWebSocket } from '@/hooks/useEnhancedWebSocket';
import uaipAPI from '@/utils/uaip-api';

// Import shared types
import {
  DiscussionParticipant,
  DiscussionMessage,
  Discussion,
  DiscussionStatus,
  TurnStrategy,
  CreateDiscussionRequest,
  MessageType,
} from '@uaip/types';

// Import frontend-specific message type
import { Message } from '@/types/frontend-extensions';

interface DiscussionProviderProps {
  topic?: string;
  maxRounds?: number;
  turnStrategy?: TurnStrategy;
  children: React.ReactNode;
}

interface TurnInfo {
  participantId: string;
  startedAt?: Date;
  expectedEndAt?: Date;
  turnNumber: number;
}

interface DiscussionContextType {
  // State
  isActive: boolean;
  isWebSocketConnected: boolean;
  websocketError: string | null;
  participants: DiscussionParticipant[];
  messages: Message[];
  history: Message[]; // Historical messages from database
  currentTurn: TurnInfo | null;
  discussionId: string | null;
  isLoading: boolean;
  lastError: string | null;

  // Actions
  start: (topic?: string, agentIds?: string[], enhancedContext?: any) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: (discussionId: string) => Promise<void>;
  addMessage: (content: string, agentId?: string) => Promise<void>;
  loadHistory: (discussionId: string) => Promise<void>;
}

const DiscussionContext = createContext<DiscussionContextType | null>(null);
const TITLE_PREFIX = 'Discussion: ';
const MAX_TITLE_LENGTH = 255;
const MAX_TOPIC_LENGTH = 1000;

const truncateText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
};

export const useDiscussion = (): DiscussionContextType => {
  const context = useContext(DiscussionContext);
  if (!context) {
    throw new Error('useDiscussion must be used within a DiscussionProvider');
  }
  return context;
};

export const DiscussionProvider: React.FC<DiscussionProviderProps> = ({
  topic,
  maxRounds,
  turnStrategy = TurnStrategy.ROUND_ROBIN,
  children,
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState<boolean>(false);
  const [websocketError, setWebsocketError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<DiscussionParticipant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<Message[]>([]);
  const [currentTurn, setCurrentTurn] = useState<TurnInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [discussionId, setDiscussionId] = useState<string | null>(null);

  const { agents } = useAgents();
  const { user } = useAuth();

  // WebSocket connection for discussion orchestration
  const {
    isConnected: wsConnected,
    sendMessage: sendWebSocketMessage,
    lastEvent,
    authStatus,
    error: wsError,
  } = useEnhancedWebSocket();

  // Sync WebSocket connection status
  useEffect(() => {
    setIsWebSocketConnected(wsConnected);
  }, [wsConnected]);

  useEffect(() => {
    setWebsocketError(wsError || null);
  }, [wsError]);

  // Listen for discussion events
  useEffect(() => {
    if (lastEvent) {
      console.log('📡 Discussion WebSocket event received:', lastEvent);

      switch (lastEvent.type) {
        case 'joined_discussion':
          console.log('✅ Joined discussion room:', lastEvent.payload);
          break;

        case 'discussion_started':
          console.log('✅ Discussion started event received:', lastEvent.payload);
          setIsActive(true);
          setLastError(null);
          setIsLoading(false); // Clear loading state on success
          break;

        case 'message_received':
          console.log('💬 Message received event:', lastEvent.payload);
          // Handle both direct message format and orchestration service event format
          const messageData = lastEvent.payload?.message || lastEvent.payload?.data?.message;
          if (messageData) {
            const newMessage: Message = {
              id: messageData.id,
              content: messageData.content,
              sender: messageData.metadata?.agentName || messageData.participantId || 'agent',
              timestamp: new Date(messageData.createdAt || messageData.timestamp),
              type: 'response',
              agentId: messageData.metadata?.agentId,
              confidence: messageData.metadata?.confidence,
              metadata: messageData.metadata,
            };
            // Add to both real-time messages and history for immediate display
            setMessages((prev) => [...prev, newMessage]);
            setHistory((prev) => [...prev, newMessage]);
          }
          break;

        case 'participant_joined':
          console.log('👥 Participant joined:', lastEvent.payload);
          break;

        case 'participant_left':
          console.log('👥 Participant left:', lastEvent.payload);
          break;

        case 'turn_changed':
          console.log('🔄 Turn changed:', lastEvent.payload);
          // Handle both legacy format (currentTurn) and new format (data with nextParticipantId)
          const turnData = lastEvent.payload?.currentTurn || lastEvent.payload?.data;
          if (turnData) {
            setCurrentTurn({
              participantId: turnData.participantId || turnData.nextParticipantId,
              startedAt: turnData.startedAt ? new Date(turnData.startedAt) : new Date(),
              expectedEndAt: turnData.expectedEndAt ? new Date(turnData.expectedEndAt) : new Date(Date.now() + 60000),
              turnNumber: turnData.turnNumber || 0,
            });
          }
          break;

        case 'error':
          console.error('❌ Discussion error:', lastEvent.payload);
          setLastError(lastEvent.payload.message || 'Discussion error occurred');
          setIsLoading(false);
          break;

        default:
          console.log('🔹 Other discussion event:', lastEvent.type, lastEvent.payload);
          break;
      }
    }
  }, [lastEvent]);

  // Add timeout mechanism for WebSocket operations
  useEffect(() => {
    if (isLoading && discussionId) {
      const timeout = setTimeout(() => {
        console.warn('⏰ Discussion start timeout - no response received within 10 seconds');
        setLastError('Discussion start timeout. Please try again.');
        setIsLoading(false);
      }, 10000); // 10 second timeout

      return () => clearTimeout(timeout);
    }
  }, [isLoading, discussionId]);

  const start = async (topic?: string, agentIds?: string[], enhancedContext?: any) => {
    if (isActive) {
      console.warn('Discussion is already active');
      return;
    }

    if (!isWebSocketConnected) {
      console.warn('Cannot start discussion: WebSocket not connected');
      setLastError('WebSocket not connected. Please check your connection.');
      return;
    }

    if (!user?.id) {
      console.error('Cannot start discussion: User not authenticated');
      setLastError('User not authenticated');
      return;
    }

    try {
      setIsLoading(true);
      setLastError(null);

      // Use provided topic or default
      const rawTopic = topic || 'General Discussion';
      const discussionTopic = truncateText(rawTopic, MAX_TOPIC_LENGTH);
      const titleTopic = truncateText(rawTopic, MAX_TITLE_LENGTH - TITLE_PREFIX.length);
      const discussionTitle = `${TITLE_PREFIX}${titleTopic}`;

      // Get available agents
      const availableAgents = Object.values(agents).filter((agent) => agent.isActive);

      if (availableAgents.length === 0) {
        throw new Error('No active agents available for discussion');
      }

      // Use provided agent IDs or select first few available agents
      const selectedAgentIds =
        agentIds && agentIds.length > 0
          ? agentIds.filter((id) => availableAgents.some((agent) => agent.id === id))
          : availableAgents.slice(0, 3).map((agent) => agent.id);

      if (selectedAgentIds.length === 0) {
        throw new Error('No valid agents available for discussion');
      }

      if (selectedAgentIds.length < 2) {
        console.warn(
          `Only ${selectedAgentIds.length} agent(s) available, proceeding with minimum participants`
        );
      }

      console.log('🎯 Creating discussion with agents:', selectedAgentIds);

      // STEP 1: Create discussion via agent-intelligence API (existing behavior)
      let currentDiscussionId = discussionId;

      if (!currentDiscussionId) {
        const createRequest: CreateDiscussionRequest = {
          title: discussionTitle,
          description: enhancedContext?.purpose
            ? `${enhancedContext.purpose} discussion to generate ${enhancedContext.targetArtifact}: ${discussionTopic}`
            : `Automated discussion on ${discussionTopic}`,
          topic: discussionTopic,
          createdBy: user.id,
          initialParticipants: selectedAgentIds.map((agentId) => ({
            agentId,
            role: 'participant' as const,
          })),
          settings: {
            maxTurns: maxRounds,
            maxDuration: 3600, // 1 hour default
            strategyConfig: {
              type: 'round_robin' as const,
              skipInactive: true,
              maxSkips: 1,
            },
            metadata: enhancedContext
              ? {
                  discussionPurpose: enhancedContext.purpose,
                  targetArtifact: enhancedContext.targetArtifact,
                  contextType: enhancedContext.contextType,
                  originalContext: enhancedContext.originalContext,
                  additionalContext: enhancedContext.additionalContext,
                  expectedOutcome: enhancedContext.expectedOutcome,
                }
              : undefined,
          },
          turnStrategy: {
            strategy: TurnStrategy.ROUND_ROBIN,
            config: {
              type: 'round_robin' as const,
              skipInactive: true,
              maxSkips: 1,
            },
          },
        };

        console.log('📝 Creating discussion via agent-intelligence API:', {
          title: createRequest.title,
          topic: createRequest.topic,
          createdBy: createRequest.createdBy,
          participantCount: createRequest.initialParticipants.length,
        });

        const newDiscussion = await uaipAPI.discussions.create(createRequest);
        currentDiscussionId = newDiscussion.id;
        setDiscussionId(currentDiscussionId);
        console.log('✅ Discussion created successfully:', currentDiscussionId);
      }

      // STEP 2: Join discussion room via WebSocket
      console.log('🏠 Joining discussion room via WebSocket:', {
        discussionId: currentDiscussionId,
      });

      // Join the discussion room to receive events
      sendWebSocketMessage('join_discussion', {
        discussionId: currentDiscussionId,
      });

      // STEP 3: Start discussion via WebSocket to discussion-orchestration (new behavior)
      console.log('🚀 Starting discussion via WebSocket:', {
        discussionId: currentDiscussionId,
        startedBy: user.id,
      });

      // Send WebSocket message to start discussion
      sendWebSocketMessage('start_discussion', {
        discussionId: currentDiscussionId,
        startedBy: user.id,
      });

      console.log('📡 WebSocket start_discussion event sent - waiting for confirmation...');

      // Note: The discussion will be marked as active when we receive the 'discussion_started' event
      // This is handled in the useEffect that listens to WebSocket events
    } catch (error) {
      console.error('❌ Failed to start discussion:', error);

      // Enhanced error logging for validation failures
      if (error instanceof Error) {
        if (error.message.includes('Validation failed')) {
          console.error('Discussion validation failed. Check required fields:', {
            requiredFields: ['title', 'topic', 'createdBy', 'initialParticipants (min 1)'],
            providedData: {
              title: `Discussion: ${topic || 'General Discussion'}`,
              topic: topic || 'General Discussion',
              createdBy: user?.id || 'MISSING',
              participantCount: agentIds?.length || 0,
            },
          });
        }
        setLastError(error.message);
      } else {
        setLastError('Failed to start discussion');
      }
      setIsLoading(false);
    }
  };

  const stop = async () => {
    if (!isActive || !discussionId) {
      return;
    }

    try {
      setIsLoading(true);

      // Stop the discussion via WebSocket
      if (isWebSocketConnected) {
        sendWebSocketMessage('stop_discussion', {
          discussionId: discussionId,
        });
      }

      // Leave the discussion room via WebSocket
      if (isWebSocketConnected) {
        sendWebSocketMessage('leave_discussion', {
          discussionId: discussionId,
        });
      }

      await uaipAPI.discussions.end(discussionId);
      setIsActive(false);
      setDiscussionId(null);
      setParticipants([]);
      setMessages([]);
      setCurrentTurn(null);
      console.log('Discussion stopped successfully');
    } catch (error) {
      console.error('Failed to stop discussion:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to stop discussion');
    } finally {
      setIsLoading(false);
    }
  };

  const pause = async () => {
    if (!isActive || !discussionId) {
      return;
    }

    try {
      setIsLoading(true);

      // Pause the discussion via WebSocket
      if (isWebSocketConnected) {
        sendWebSocketMessage('pause_discussion', {
          discussionId: discussionId,
        });
      }

      setLastError(null);
    } catch (error) {
      console.error('Failed to pause discussion:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to pause discussion');
    } finally {
      setIsLoading(false);
    }
  };

  const resume = async (discussionId: string) => {
    if (!discussionId) {
      return;
    }
    setDiscussionId(discussionId);
    try {
      setIsLoading(true);

      // Resume the discussion via WebSocket
      if (isWebSocketConnected) {
        sendWebSocketMessage('resume_discussion', {
          discussionId: discussionId,
        });
      }

      setLastError(null);
    } catch (error) {
      console.error('Failed to resume discussion:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to resume discussion');
    } finally {
      setIsLoading(false);
    }
  };

  const addMessage = async (content: string, agentId?: string) => {
    if (!isActive || !discussionId) {
      console.warn('Cannot add message: discussion not active');
      return;
    }

    if (!isWebSocketConnected) {
      console.warn('Cannot add message: WebSocket not connected');
      setLastError('WebSocket not connected. Please check your connection.');
      return;
    }

    try {
      if (agentId) {
        console.warn('Agent ID provided for WebSocket message; metadata is not supported.');
      }

      sendWebSocketMessage('send_message', {
        discussionId,
        content,
        messageType: MessageType.MESSAGE,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to send message');
    }
  };

  // Track last load time to prevent too frequent calls
  const lastLoadTimeRef = useRef<number>(0);
  const loadHistoryRef = useRef<string | null>(null);

  const loadHistory = useCallback(async (discussionId: string) => {
    // Prevent loading the same discussion multiple times in quick succession
    if (loadHistoryRef.current === discussionId) {
      return;
    }

    // Throttle requests to once every 5 seconds for better UX
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 5000) {
      // 5 second throttle
      console.log('Throttling loadHistory call - waiting 5 seconds between calls');
      return;
    }

    try {
      setIsLoading(true);
      setLastError(null);
      loadHistoryRef.current = discussionId;
      lastLoadTimeRef.current = now;

      console.log('Loading discussion history for:', discussionId);

      // Fetch messages from the existing API endpoint
      const response = await uaipAPI.discussions.getMessages(discussionId, { limit: 1000 });
      console.log('API response for getMessages:', response);

      // Transform backend DiscussionMessage[] to frontend Message[]
      const transformedHistory: Message[] = response.map((msg) => ({
        id: msg.id,
        content: msg.content,
        sender: msg.metadata?.agentName || msg.participant?.agentId || 'unknown',
        timestamp: new Date(msg.createdAt),
        type: msg.messageType === MessageType.MESSAGE ? 'response' : 'system',
        agentId: msg.metadata?.agentId,
        confidence: msg.metadata?.confidence,
        metadata: msg.metadata,
      }));

      setHistory(transformedHistory);
      console.log(`Loaded ${transformedHistory.length} historical messages`);
    } catch (error) {
      console.error('Failed to load discussion history:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        discussionId,
      });
      setLastError(
        `Failed to load discussion history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      setHistory([]); // Clear history on error
    } finally {
      setIsLoading(false);
      loadHistoryRef.current = null;
    }
  }, []);

  const value: DiscussionContextType = {
    isActive,
    isWebSocketConnected,
    websocketError:
      websocketError || (authStatus === 'failed' ? 'WebSocket authentication failed' : null),
    participants,
    messages,
    history,
    currentTurn,
    discussionId,
    isLoading,
    lastError,
    start,
    stop,
    pause,
    resume,
    addMessage,
    loadHistory,
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isWebSocketConnected && discussionId) {
        sendWebSocketMessage('leave_discussion', {
          discussionId: discussionId,
        });
      }
    };
  }, [isWebSocketConnected, discussionId, sendWebSocketMessage]);

  return <DiscussionContext.Provider value={value}>{children}</DiscussionContext.Provider>;
};
