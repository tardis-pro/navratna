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
  DiscussionMessage as _DiscussionMessage,
  Discussion as _Discussion,
  DiscussionStatus as _DiscussionStatus,
  TurnStrategy,
  MessageType,
} from '@uaip/types';

// Import frontend-specific message type
import { Message } from '@/types/frontend_extensions';
import { logger } from '@/utils/browser_logger';
import {
  buildDiscussionCreateRequest,
  type DiscussionStartContext,
} from '@/utils/discussion_request';

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

interface DiscussionStartResult {
  discussionId: string;
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
  start: (
    topic?: string,
    agentIds?: string[],
    enhancedContext?: DiscussionStartContext
  ) => Promise<DiscussionStartResult | undefined>;
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
          const payloadAny: any = lastEvent.payload; // oxlint-disable-line @typescript-eslint/no-explicit-any -- payload is unknown; PendingApprovalRequest is the expected runtime shape
          const approval: PendingApprovalRequest = payloadAny;
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
    async (topic?: string, agentIds?: string[], enhancedContext?: DiscussionStartContext) => {
      if (isActive) {
        logger.warn('Discussion is already active');
        return undefined;
      }

      if (!user?.id) {
        logger.error('Cannot start discussion: User not authenticated');
        setLastError('User not authenticated');
        return undefined;
      }

      try {
        setIsLoading(true);
        setLastError(null);

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

        const createRequest = buildDiscussionCreateRequest({
          topic,
          userId: user.id,
          selectedAgentIds,
          maxRounds,
          context: enhancedContext,
        });
        const newDiscussion = await uaipAPI.discussions.create(createRequest);
        if (!newDiscussion.id) throw new Error('Created discussion did not include an ID');

        setDiscussionId(newDiscussion.id);
        setParticipants(newDiscussion.participants ?? []);
        if (isWebSocketConnected) {
          sendWebSocketMessage('join_discussion', { discussionId: newDiscussion.id });
        }

        await uaipAPI.discussions.start(newDiscussion.id, user.id);
        setIsActive(true);
        setIsLoading(false);
        return { discussionId: newDiscussion.id };
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
        return undefined;
      }
    },
    [
      isActive,
      isWebSocketConnected,
      user?.id,
      agents,
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

      await uaipAPI.discussions.end(discussionId);
      if (isWebSocketConnected) {
        sendWebSocketMessage('leave_discussion', { discussionId });
      }
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
