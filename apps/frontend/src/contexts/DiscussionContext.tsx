import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useAgents } from './AgentContext';
import { useAuth } from './AuthContext';
import { useEnhancedWebSocket } from '@/hooks/use_enhanced_web_socket';
import uaipAPI from '@/utils/uaip_api';

// Import shared types
import {
  DiscussionParticipant,
  _DiscussionMessage,
  _Discussion,
  _DiscussionStatus,
  TurnStrategy,
  CreateDiscussionRequest,
  MessageType,
} from '@uaip/types';

// Import frontend-specific message type
import { Message } from '@/types/frontend_extensions';
import { logger } from '@/utils/browser_logger';

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

interface PendingApprovalRequest {
  approvalId: string;
  agentId: string;
  toolId: string;
  toolDescription: string;
  riskLevel: string;
  parameters?: unknown;
  securityLevel?: string;
  timestamp?: string;
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
  pendingApprovals: PendingApprovalRequest[];

  // Actions
  start: (topic?: string, agentIds?: string[], enhancedContext?: unknown) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: (discussionId: string) => Promise<void>;
  addMessage: (content: string, agentId?: string) => Promise<void>;
  loadHistory: (discussionId: string) => Promise<void>;
  dismissApproval: (approvalId: string) => void;
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
  _topic,
  maxRounds,
  _turnStrategy = TurnStrategy.ROUND_ROBIN,
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
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalRequest[]>([]);

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
      switch (lastEvent.type) {
        case 'joined_discussion':
          break;

        case 'discussion_started':
          setIsActive(true);
          setLastError(null);
          setIsLoading(false); // Clear loading state on success
          break;

        case 'message_received':
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
          break;

        case 'participant_left':
          break;

        case 'turn_changed':
          // Handle both legacy format (currentTurn) and new format (data with nextParticipantId)
          const turnData = lastEvent.payload?.currentTurn || lastEvent.payload?.data;
          if (turnData) {
            setCurrentTurn({
              participantId: turnData.participantId || turnData.nextParticipantId,
              startedAt: turnData.startedAt ? new Date(turnData.startedAt) : new Date(),
              expectedEndAt: turnData.expectedEndAt
                ? new Date(turnData.expectedEndAt)
                : new Date(Date.now() + 60000),
              turnNumber: turnData.turnNumber || 0,
            });
          }
          break;

        case 'error':
          logger.error('❌ Discussion error:', lastEvent.payload);
          setLastError(lastEvent.payload.message || 'Discussion error occurred');
          setIsLoading(false);
          break;

        case 'approval_required': {
          // @ts-expect-error -- lastEvent.payload is unknown; PendingApprovalRequest is the expected runtime shape for approval_required events
          const approval: PendingApprovalRequest = lastEvent.payload;
          if (!approval?.approvalId || !approval?.agentId) {
            break;
          }

          setPendingApprovals((prev) => {
            const existing = prev.find((entry) => entry.approvalId === approval.approvalId);
            if (existing) {
              return prev;
            }
            return [...prev, approval];
          });
          break;
        }

        default:
          break;
      }
    }
  }, [lastEvent]);

  // Add timeout mechanism for WebSocket operations
  useEffect(() => {
    if (isLoading && discussionId) {
      const timeout = setTimeout(() => {
        logger.warn('⏰ Discussion start timeout - no response received within 10 seconds');
        setLastError('Discussion start timeout. Please try again.');
        setIsLoading(false);
      }, 10000); // 10 second timeout

      return () => clearTimeout(timeout);
    }
  }, [isLoading, discussionId]);

  const start = useCallback(
    async (topic?: string, agentIds?: string[], enhancedContext?: unknown) => {
      if (isActive) {
        logger.warn('Discussion is already active');
        return;
      }

      if (!isWebSocketConnected) {
        logger.warn('Cannot start discussion: WebSocket not connected');
        setLastError('WebSocket not connected. Please check your connection.');
        return;
      }

      if (!user?.id) {
        logger.error('Cannot start discussion: User not authenticated');
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
          logger.warn(
            `Only ${selectedAgentIds.length} agent(s) available, proceeding with minimum participants`
          );
        }

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

          const newDiscussion = await uaipAPI.discussions.create(createRequest);
          currentDiscussionId = newDiscussion.id;
          setDiscussionId(currentDiscussionId);
        }

        // STEP 2: Join discussion room via WebSocket

        // Join the discussion room to receive events
        sendWebSocketMessage('join_discussion', {
          discussionId: currentDiscussionId,
        });

        // STEP 3: Start discussion via WebSocket to discussion-orchestration (new behavior)

        // Send WebSocket message to start discussion
        sendWebSocketMessage('start_discussion', {
          discussionId: currentDiscussionId,
          startedBy: user.id,
        });

        // Note: The discussion will be marked as active when we receive the 'discussion_started' event
        // This is handled in the useEffect that listens to WebSocket events
      } catch (error) {
        logger.error('❌ Failed to start discussion:', error);

        // Enhanced error logging for validation failures
        if (error instanceof Error) {
          if (error.message.includes('Validation failed')) {
            logger.error('Discussion validation failed. Check required fields:', {
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
    },
    [
      isActive,
      isWebSocketConnected,
      user?.id,
      agents,
      discussionId,
      maxRounds,
      sendWebSocketMessage,
    ]
  );

  const stop = useCallback(async () => {
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
    } catch (error) {
      logger.error('Failed to stop discussion:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to stop discussion');
    } finally {
      setIsLoading(false);
    }
  }, [isActive, discussionId, isWebSocketConnected, sendWebSocketMessage]);

  const pause = useCallback(async () => {
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
      logger.error('Failed to pause discussion:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to pause discussion');
    } finally {
      setIsLoading(false);
    }
  }, [isActive, discussionId, isWebSocketConnected, sendWebSocketMessage]);

  const resume = useCallback(
    async (discussionIdParam: string) => {
      if (!discussionIdParam) {
        return;
      }
      setDiscussionId(discussionIdParam);
      try {
        setIsLoading(true);

        // Resume the discussion via WebSocket
        if (isWebSocketConnected) {
          sendWebSocketMessage('resume_discussion', {
            discussionId: discussionIdParam,
          });
        }

        setLastError(null);
      } catch (error) {
        logger.error('Failed to resume discussion:', error);
        setLastError(error instanceof Error ? error.message : 'Failed to resume discussion');
      } finally {
        setIsLoading(false);
      }
    },
    [isWebSocketConnected, sendWebSocketMessage]
  );

  const addMessage = useCallback(
    async (content: string, agentId?: string) => {
      if (!isActive || !discussionId) {
        logger.warn('Cannot add message: discussion not active');
        return;
      }

      if (!isWebSocketConnected) {
        logger.warn('Cannot add message: WebSocket not connected');
        setLastError('WebSocket not connected. Please check your connection.');
        return;
      }

      try {
        if (agentId) {
          logger.warn('Agent ID provided for WebSocket message; metadata is not supported.');
        }

        sendWebSocketMessage('send_message', {
          discussionId,
          content,
          messageType: MessageType.MESSAGE,
        });
      } catch (error) {
        logger.error('Failed to send message:', error);
        setLastError(error instanceof Error ? error.message : 'Failed to send message');
      }
    },
    [isActive, discussionId, isWebSocketConnected, sendWebSocketMessage]
  );

  // Track last load time to prevent too frequent calls
  const lastLoadTimeRef = useRef<number>(0);
  const loadHistoryRef = useRef<string | null>(null);

  const loadHistory = useCallback(async (discussionIdParam: string) => {
    // Prevent loading the same discussion multiple times in quick succession
    if (loadHistoryRef.current === discussionIdParam) {
      return;
    }

    // Throttle requests to once every 5 seconds for better UX
    const now = Date.now();
    if (now - lastLoadTimeRef.current < 5000) {
      // 5 second throttle

      return;
    }

    try {
      setIsLoading(true);
      setLastError(null);
      loadHistoryRef.current = discussionIdParam;
      lastLoadTimeRef.current = now;

      // Fetch messages from the existing API endpoint
      const response = await uaipAPI.discussions.getMessages(discussionIdParam, { limit: 1000 });

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
    } catch (error) {
      logger.error('Failed to load discussion history:', error);
      logger.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        discussionId: discussionIdParam,
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

  const dismissApproval = useCallback((approvalId: string) => {
    setPendingApprovals((prev) => prev.filter((approval) => approval.approvalId !== approvalId));
  }, []);

  const value: DiscussionContextType = useMemo(
    () => ({
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
      pendingApprovals,
      start,
      stop,
      pause,
      resume,
      addMessage,
      loadHistory,
      dismissApproval,
    }),
    [
      isActive,
      isWebSocketConnected,
      websocketError,
      authStatus,
      participants,
      messages,
      history,
      currentTurn,
      discussionId,
      isLoading,
      lastError,
      pendingApprovals,
      start,
      stop,
      pause,
      resume,
      addMessage,
      loadHistory,
      dismissApproval,
    ]
  );

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
