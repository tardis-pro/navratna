import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { useAuth } from '../../../contexts/AuthContext';
import { uaipAPI } from '../../../utils/uaip_api';
import { DiscussionTrigger } from '../../DiscussionTrigger';
import { useEnhancedWebSocket } from '../../../hooks/use_enhanced_web_socket';
import { useStreamingChat } from '../../../hooks/use_streaming_chat';
import { discussionsAPI } from '../../../api/discussions_api';
import {
  ChatComposer,
  type ChatComposerSubmitPayload,
} from '../../chat/ChatComposer';
import { PromptSuggestions } from '../../chat/PromptSuggestions';
import { ConversationTopicDisplay } from '../../chat/ConversationTopicDisplay';
import { useConversationIntelligence } from '../../../hooks/use_conversation_intelligence';
import {
  MessageSquare,
  Users,
  LayoutGrid,
  Maximize,
  AlertCircle,
} from 'lucide-react';
import {
  DiscussionMessage,
  MessageType,
  ThreadState,
  StreamChunk,
} from '@uaip/types';
import type { ChatMessage } from '../../chat/chat.types';
import type {
  AgentChatResponseView,
  ChatWindow,
  UnifiedChatSystemProps,
} from './UnifiedChatSystem.types';
import { ThreadContainer } from '../../chat/ThreadContainer';
import { FloatingThreadContainer } from '../../chat/FloatingThreadContainer';
import { CompanionPane } from '../../chat/CompanionPane';
import { ContextChipBar, type ContextChip } from '../../chat/ContextChipBar';
import { ProjectCompanion } from '../../chat/ProjectCompanion';
import { DocCompanion } from '../../chat/DocCompanion';
import { useToast } from '../../../hooks';
import { knowledgeAPI } from '../../../api/knowledge_api';
import { logger } from '@/utils/browser_logger';
import { useWhatsApp } from '../../../hooks/use_whats_app';
import { getWebSocketURL } from '../../../config/api_config';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toToolsExecuted(v: unknown): ChatMessage['toolsExecuted'] {
  if (!Array.isArray(v)) return undefined;
  return v.flatMap((item) => {
    if (!isRecord(item)) return [];
    const toolId = typeof item.toolId === 'string' ? item.toolId : undefined;
    const toolName = typeof item.toolName === 'string' ? item.toolName : undefined;
    const success = typeof item.success === 'boolean' ? item.success : undefined;
    if (!toolId || !toolName || success === undefined) return [];
    return [
      {
        toolId,
        toolName,
        success,
        result: item.result,
        error: typeof item.error === 'string' ? item.error : undefined,
        timestamp:
          typeof item.timestamp === 'string' ? item.timestamp : new Date().toISOString(),
      },
    ];
  });
}

function toToolsWithheld(v: unknown): ChatMessage['toolsWithheld'] {
  if (!Array.isArray(v)) return undefined;
  const withheld = v.flatMap((item) => {
    if (!isRecord(item)) return [];
    const toolId = typeof item.toolId === 'string' ? item.toolId : undefined;
    const toolName = typeof item.toolName === 'string' ? item.toolName : undefined;
    if (!toolId || !toolName) return [];
    return [
      {
        toolId,
        toolName,
        reasoning: typeof item.reasoning === 'string' ? item.reasoning : undefined,
      },
    ];
  });
  return withheld.length > 0 ? withheld : undefined;
}

/**
 * generateAgentResponse returns confidence / toolsExecuted / suggestedTools as
 * FLAT fields, not under a `metadata` envelope, so reading only `response.metadata`
 * silently rendered every message with no confidence and no tool footer. The flat
 * response is the fallback; an explicit metadata key still wins where one exists.
 */
function readAgentChatMetadata(response: AgentChatResponseView): Record<string, unknown> {
  return { ...(response as Record<string, unknown>), ...(response.metadata ?? {}) };
}

function readAgentName(response: AgentChatResponseView, fallback: string): string {
  const metadata = readAgentChatMetadata(response);
  return typeof metadata.agentName === 'string' ? metadata.agentName : fallback;
}

function readConfidence(response: AgentChatResponseView): number | undefined {
  const metadata = readAgentChatMetadata(response);
  return typeof metadata.confidence === 'number' ? metadata.confidence : undefined;
}

function readMemoryEnhanced(response: AgentChatResponseView): boolean | undefined {
  const metadata = readAgentChatMetadata(response);
  return typeof metadata.memoryEnhanced === 'boolean' ? metadata.memoryEnhanced : undefined;
}

function readKnowledgeUsed(response: AgentChatResponseView): number | undefined {
  const metadata = readAgentChatMetadata(response);
  return typeof metadata.knowledgeUsed === 'number' ? metadata.knowledgeUsed : undefined;
}

/**
 * Restores a 1:1 chat from the server. Direct chat is persisted by the chat
 * endpoint itself, NOT as a discussion — the browser cannot write the agent's
 * turn, because the discussion write route refuses to let one participant post
 * as another.
 */
const loadAgentChatHistory = async (
  agentId: string,
  agentName: string
): Promise<ChatMessage[]> => {
  try {
    const history = await uaipAPI.agents.getChatHistory(agentId);
    return history.messages.map((message) => ({
      id: message.id,
      content: message.content,
      sender: message.role === 'assistant' ? 'agent' : 'user',
      senderName: message.role === 'assistant' ? agentName : 'You',
      timestamp: message.createdAt,
      messageType: MessageType.MESSAGE,
      ...(message.role === 'assistant' ? { agentId } : {}),
    }));
  } catch (error) {
    logger.error('Failed to load the agent chat history:', error);
    return [];
  }
};

// Helper function to convert discussion messages to chat messages
const convertDiscussionMessagesToChatMessages = (messages: DiscussionMessage[]): ChatMessage[] => {
  return messages.map((msg) => ({
    id: msg.id,
    content: msg.content,
    sender: msg.metadata?.sender || (msg.metadata?.agentId ? 'agent' : 'user'),
    senderName: msg.metadata?.senderName || 'Unknown',
    timestamp: (msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt) || new Date().toISOString(),
    agentId: msg.metadata?.agentId,
    messageType: msg.messageType,
    confidence: msg.metadata?.confidence,
    memoryEnhanced: msg.metadata?.memoryEnhanced,
    knowledgeUsed: msg.metadata?.knowledgeUsed,
    toolsExecuted: msg.metadata?.toolsExecuted,
    metadata: msg.metadata,
  }));
};

export const UnifiedChatSystem: React.FC<UnifiedChatSystemProps> = ({
  className,
  mode = 'hybrid',
  defaultAgentId,
}) => {
  const { agents, modelState, loadModels } = useAgents();
  const { isAuthenticated, user } = useAuth();
  const {
    isConnected: isWebSocketConnected,
    sendMessage: sendWebSocketMessage,
    lastEvent,
    connect,
  } = useEnhancedWebSocket();

  const { toast } = useToast();
  const { state: waState } = useWhatsApp();

  // State management
  const [chatWindows, setChatWindows] = useState<ChatWindow[]>([]);
  const [currentMessage, setCurrentMessage] = useState<{ [windowId: string]: string }>({});
  const [viewMode, setViewMode] = useState<'floating' | 'portal'>(
    mode === 'portal' ? 'portal' : 'floating'
  );
  const [selectedAgentId, setSelectedAgentId] = useState<string>(defaultAgentId || '');
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [portalMessages, setPortalMessages] = useState<ChatMessage[]>([]);
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ content: string; sender: string; timestamp: string }>
  >([]);
  const [conversationTopics, setConversationTopics] = useState<{ [windowId: string]: string }>({});
  const [conversationIds, setConversationIds] = useState<{ [windowId: string]: string }>({});

  // Enhanced AI Sidekick State
  const [windowPositions, setWindowPositions] = useState<{
    [windowId: string]: { x: number; y: number };
  }>({});
  const [windowSizes, setWindowSizes] = useState<{
    [windowId: string]: { width: number; height: number };
  }>({});
  const [windowSnapMode, _setWindowSnapMode] = useState<{
    [windowId: string]: 'none' | 'edge' | 'corner';
  }>({});
  const [_thinkingParticles, setThinkingParticles] = useState<{ [windowId: string]: boolean }>({});
  const [_confidenceMetrics, setConfidenceMetrics] = useState<{ [windowId: string]: number }>({});
  const [_knowledgeSources, setKnowledgeSources] = useState<{ [windowId: string]: string[] }>({});
  const [_toolExecutionProgress, setToolExecutionProgress] = useState<{
    [windowId: string]: Array<{
      toolName: string;
      progress: number;
      status: 'running' | 'completed' | 'failed';
    }>;
  }>({});
  const [_memoryEnhancementBadges, setMemoryEnhancementBadges] = useState<{
    [windowId: string]: boolean;
  }>({});
  const [_quickActionsPanelOpen, setQuickActionsPanelOpen] = useState<{
    [windowId: string]: boolean;
  }>({});
  const [_contextualSuggestions, setContextualSuggestions] = useState<{
    [windowId: string]: string[];
  }>({});
  const [isResizing, setIsResizing] = useState<{ [windowId: string]: boolean }>({});
  const [isDragging, setIsDragging] = useState<{ [windowId: string]: boolean }>({});
  const [focusedWindow, setFocusedWindow] = useState<string | null>(null);
  const [loadingStates, setLoadingStates] = useState<{
    [windowId: string]: { isLoading: boolean; loadingText?: string; progress?: number };
  }>({});
  const [typingIndicators, setTypingIndicators] = useState<{ [windowId: string]: boolean }>({});

  // Companion pane state — only used by portal mode. Holds the id of the
  // message the user last asked to expand; the live ChatMessage is read from
  // `portalMessages` on render so updates stream through.
  const [companionMessageId, setCompanionMessageId] = useState<string | null>(null);

  // Context companion state — activated when user clicks a context chip
  // (project/task/doc). Overrides the message companion while active.
  const [activeContextChip, setActiveContextChip] = useState<ContextChip | null>(null);

  // The project the user is currently working inside. Sent with every chat call:
  // an integration MCP tool's credential is bound to a (project, agent) pair, so
  // without it the resolver refuses every such tool.
  // NO fallback to chip.id: that is a locally generated `cmd-*` key, not a project
  // uuid. Falling back to it sends an id that matches no binding, which reads as
  // "integration tools are broken" rather than "no project is selected".
  const activeProjectId =
    activeContextChip?.type === 'project' ? activeContextChip.resourceId : undefined;

  // Portal-mode streaming state. `streamingMessageId` points at the placeholder
  // ChatMessage inside `portalMessages` whose `content` is being updated in
  // real-time by `useStreamingChat`'s onChunk callback. The bubble for this id
  // receives `isStreaming={true}` which forces code blocks to render as plain
  // <pre> until the stream ends (MarkdownRenderer override).
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // Stable streaming handlers. The hook's onChunk/onComplete/onError are
  // memoized with empty deps so the underlying socket effect never re-runs;
  // the actual work is dispatched via streamingHandlersRef.current which is
  // rewritten per stream when a new placeholder message is created.
  interface StreamingHandlers {
    placeholderId: string | null;
    append: (delta: string) => void;
    finalize: (finalContent: string, interrupted: boolean) => void;
    fail: (error: string) => void;
  }
  const streamingHandlersRef = useRef<StreamingHandlers>({
    placeholderId: null,
    append: () => {},
    finalize: () => {},
    fail: () => {},
  });

  const handleStreamingChunk = useCallback((chunk: StreamChunk) => {
    const delta = chunk?.content ?? '';
    streamingHandlersRef.current.append(delta);
  }, []);

  const handleStreamingComplete = useCallback((finalContent: string) => {
    streamingHandlersRef.current.finalize(finalContent, false);
  }, []);

  const handleStreamingError = useCallback((error: string) => {
    streamingHandlersRef.current.fail(error);
  }, []);

  const {
    isStreaming: _isAgentStreaming,
    cancelStream: cancelAgentStream,
  } = useStreamingChat({
    baseUrl: getWebSocketURL(),
    token: '',
    onChunk: handleStreamingChunk,
    onComplete: handleStreamingComplete,
    onError: handleStreamingError,
  });

  const lastExpandedIdRef = useRef<string | null>(null);

  const expandMessage = useCallback((message: ChatMessage) => {
    lastExpandedIdRef.current = message.id;
    setCompanionMessageId(message.id);
  }, []);

  const closeCompanion = useCallback(() => {
    setCompanionMessageId(null);
    setActiveContextChip(null);
    const composerHost = document.querySelector<HTMLElement>('[data-companion-composer]');
    const focusable = composerHost?.querySelector<HTMLElement>(
      'textarea, [contenteditable="true"], input:not([type="hidden"])'
    );
    focusable?.focus();
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const handleContextChipClick = useCallback((chip: ContextChip) => {
    setActiveContextChip((prev) => (prev?.id === chip.id ? null : chip));
    setCompanionMessageId(null);
  }, []);

  const handleContextChipRemove = useCallback((chipId: string) => {
    setActiveContextChip((prev) => (prev?.id === chipId ? null : prev));
  }, []);

  const toggleCompanion = useCallback(() => {
    const lastId = lastExpandedIdRef.current;
    setCompanionMessageId((current) => (current ? null : lastId));
  }, []);

  // Track processed message IDs to prevent duplicates
  const processedMessageIds = useRef<Set<string>>(new Set());

  // Track which agents have open windows to ensure uniqueness
  const openAgentWindows = useRef<Set<string>>(new Set());

  function openChatWindow(agentId: string, agentName: string): void {
    void openChatWindowImpl(agentId, agentName);
  }

  const agentList = Object.values(agents);  const selectedAgent = agentList.find((agent) => agent.id === selectedAgentId);

  // Enhanced AI Sidekick Refs
  const windowRefs = useRef<{ [windowId: string]: HTMLDivElement | null }>({});
  const draggingRef = useRef<{ windowId: string; offset: { x: number; y: number } } | null>(null);
  const resizingRef = useRef<{
    windowId: string;
    startSize: { width: number; height: number };
    startMouse: { x: number; y: number };
  } | null>(null);
  const _keyboardShortcutsRef = useRef<{ [key: string]: () => void }>({});
  const contextualAnalysisRef = useRef<{
    [windowId: string]: { sentiment: number; complexity: number; urgency: number };
  }>({});
  const loadingTimeouts = useRef<{ [windowId: string]: ReturnType<typeof setInterval> }>({});

  // Conversation Intelligence for portal mode
  const _portalConversationIntelligence = useConversationIntelligence({
    agentId: selectedAgentId,
    conversationId: conversationIds['portal'],
    onTopicGenerated: (topic: string, _confidence: number) => {
      setConversationTopics((prev) => ({ ...prev, portal: topic }));
    },
  });

  // Conversation Intelligence for floating windows
  const _floatingConversationIntelligence = useMemo(() => {
    type ConversationIntelligenceMap = Record<string, { agentId: string; conversationId: string; topic: string }>;
    return chatWindows.reduce<ConversationIntelligenceMap>(
      (acc, window) => {
        acc[window.id] = {
          agentId: window.agentId,
          conversationId: window.sessionId || '',
          topic: conversationTopics[window.id] || window.agentName,
        };
        return acc;
      },
      {}
    );
  }, [chatWindows, conversationTopics]);

  // Connect WebSocket only when authenticated
  useEffect(() => {
    if (isAuthenticated && !isWebSocketConnected) {
      connect();
    }
  }, [isAuthenticated, isWebSocketConnected, connect]);

  // Global keyboard shortcuts for the companion pane.
  //   Cmd/Ctrl+\ — toggle open/closed for the last-expanded message
  //   Esc        — close and refocus the composer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (companionMessageId) {
          event.preventDefault();
          closeCompanion();
        }
        return;
      }
      if (event.key === '\\' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleCompanion();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [companionMessageId, closeCompanion, toggleCompanion]);

  const companionMessage = useMemo<ChatMessage | null>(() => {
    if (!companionMessageId) return null;
    return portalMessages.find((m) => m.id === companionMessageId) ?? null;
  }, [companionMessageId, portalMessages]);

  // Listen for WebSocket agent responses
  useEffect(() => {
    if (lastEvent && lastEvent.type === 'agent_response') {
      const wsPayload: Record<string, unknown> = isRecord(lastEvent.payload) ? lastEvent.payload : {};
      const agentId = typeof wsPayload.agentId === 'string' ? wsPayload.agentId : '';
      const response = typeof wsPayload.response === 'string' ? wsPayload.response : '';
      const agentName = typeof wsPayload.agentName === 'string' ? wsPayload.agentName : '';
      const confidence = typeof wsPayload.confidence === 'number' ? wsPayload.confidence : undefined;
      const memoryEnhanced = typeof wsPayload.memoryEnhanced === 'boolean' ? wsPayload.memoryEnhanced : undefined;
      const knowledgeUsed = typeof wsPayload.knowledgeUsed === 'number' ? wsPayload.knowledgeUsed : undefined;
      const toolsExecuted = toToolsExecuted(wsPayload.toolsExecuted);
      const messageId = typeof wsPayload.messageId === 'string' ? wsPayload.messageId : undefined;

      // Prevent duplicate processing of the same message
      if (messageId && processedMessageIds.current.has(messageId)) {
        return;
      }

      // Mark message as processed
      if (messageId) {
        processedMessageIds.current.add(messageId);
        // Clean up old message IDs to prevent memory leaks (keep last 100)
        if (processedMessageIds.current.size > 100) {
          const idsArray = Array.from(processedMessageIds.current);
          processedMessageIds.current = new Set(idsArray.slice(-50));
        }
      }

      const agentMessage: ChatMessage = {
        id: `msg-${Date.now()}-agent`,
        content: response,
        sender: 'agent',
        senderName: agentName,
        timestamp: new Date().toISOString(),
        agentId: agentId,
        messageType: MessageType.MESSAGE,
        confidence,
        memoryEnhanced,
        knowledgeUsed,
        toolsExecuted,
        metadata: {
          confidence,
          memoryEnhanced,
          knowledgeUsed,
          toolsExecuted,
        },
      };

      // Update floating windows using functional state update to avoid stale closure
      setChatWindows((prev) => {
        const targetWindow = prev.find((w) => w.agentId === agentId);

        if (!targetWindow) {
          return prev; // No window found, no update needed
        }

        // Clear loading states for floating window
        if (loadingTimeouts.current[targetWindow.id]) {
          clearInterval(loadingTimeouts.current[targetWindow.id]);
          delete loadingTimeouts.current[targetWindow.id];
        }
        setLoadingStates((prevLoadingStates) => {
          const newStates = { ...prevLoadingStates };
          delete newStates[targetWindow.id];
          return newStates;
        });
        setTypingIndicators((prevTyping) => ({ ...prevTyping, [targetWindow.id]: false }));

        return prev.map((w) =>
          w.id === targetWindow.id
            ? {
                ...w,
                messages: [...w.messages, agentMessage],
                isLoading: false,
                error: null,
              }
            : w
        );
      });

      // Update portal mode if current agent
      if (viewMode === 'portal' && agentId === selectedAgentId) {
        setPortalMessages((prev) => [...prev, agentMessage]);
        setConversationHistory((prev) => [
          ...prev,
          { content: response, sender: agentName, timestamp: new Date().toISOString() },
        ]);

        // Clear loading states for portal mode
        const portalWindowId = 'portal';
        if (loadingTimeouts.current[portalWindowId]) {
          clearInterval(loadingTimeouts.current[portalWindowId]);
          delete loadingTimeouts.current[portalWindowId];
        }
        setLoadingStates((prev) => {
          const newStates = { ...prev };
          delete newStates[portalWindowId];
          return newStates;
        });
        setTypingIndicators((prev) => ({ ...prev, [portalWindowId]: false }));
      }
    }
  }, [lastEvent, viewMode, selectedAgentId]);

  // Define openChatWindowWithSession function for resuming specific discussions
  const openChatWindowWithSession = useCallback(
    async (agentId: string, agentName: string, discussionId: string) => {
      // Check if a chat window already exists for this agent (by agentId, not discussionId).
      // Keying on agentId ensures only one window per agent regardless of which session is open.
      const existingWindow = chatWindows.find((w) => w.agentId === agentId);
      if (existingWindow) {
        // Focus/restore existing window
        setChatWindows((prev) =>
          prev.map((w) => (w.agentId === agentId ? { ...w, isMinimized: false } : w))
        );
        return;
      }

      try {
        // Get the existing discussion
        const discussion = await discussionsAPI.get(discussionId);
        if (!discussion) {
          throw new Error(`Discussion ${discussionId} not found`);
        }

        // Set up conversation ID for this window
        const windowId = `chat-${Date.now()}-${agentId}`;
        setConversationIds((prev) => ({ ...prev, [windowId]: discussion.id }));

        // Load existing messages from the specific discussion
        const existingMessages = await discussionsAPI.getMessages(discussionId, { limit: 50 });

        // Convert discussion messages to chat messages
        const chatMessages = convertDiscussionMessagesToChatMessages(existingMessages);

        // Create new floating chat window with existing discussion data
        const newWindow: ChatWindow = {
          id: windowId,
          agentId,
          agentName,
          discussionId: discussion.id,
          messages: chatMessages,
          isMinimized: false,
          isLoading: false,
          error: null,
          hasLoadedHistory: true,
          totalMessages: chatMessages.length,
          canLoadMore: existingMessages.length >= 50,
          mode: 'floating',
        };

        // Track this agent so openChatWindow's ref-based guard also knows about this window.
        openAgentWindows.current.add(agentId);
        setChatWindows((prev) => [...prev, newWindow]);
        setCurrentMessage((prev) => ({ ...prev, [newWindow.id]: '' }));

        // Set initial window size
        setWindowSizes((prev) => ({
          ...prev,
          [newWindow.id]: { width: 320, height: 400 },
        }));
      } catch (error) {
        logger.error('Failed to open chat discussion:', error);

        // Fallback to creating a new chat window
        openChatWindow(agentId, agentName);
      }
    },
    [chatWindows, openChatWindow]
  );

  // Define openChatWindow function before it's used
  const openChatWindowImpl = useCallback(
    async (agentId: string, agentName: string) => {
      // Check if chat window already exists for this agent
      if (openAgentWindows.current.has(agentId)) {
        // Focus/restore existing window
        setChatWindows((prev) =>
          prev.map((w) => (w.agentId === agentId ? { ...w, isMinimized: false } : w))
        );
        return;
      }

      try {
        const windowId = `chat-${Date.now()}-${agentId}`;

        // Restored from the agent-chat store, which the chat endpoint writes —
        // the same transcript the portal shows, so both views stay in sync.
        const chatMessages = await loadAgentChatHistory(agentId, agentName);

        // Create new floating chat window
        const newWindow: ChatWindow = {
          id: windowId,
          agentId,
          agentName,
          messages: chatMessages,
          isMinimized: false,
          isLoading: false,
          error: null,
          hasLoadedHistory: true,
          totalMessages: chatMessages.length,
          canLoadMore: false,
          mode: 'floating',
        };

        // Add agent to tracking set
        openAgentWindows.current.add(agentId);

        setChatWindows((prev) => [...prev, newWindow]);
        setCurrentMessage((prev) => ({ ...prev, [newWindow.id]: '' }));

        // Set initial window size
        setWindowSizes((prev) => ({
          ...prev,
          [newWindow.id]: { width: 320, height: 400 },
        }));
      } catch (error) {
        logger.error('Failed to open chat window:', error);

        // Fallback: the window still works, it just opens without prior history.
        const newWindow: ChatWindow = {
          id: `chat-${Date.now()}-${agentId}`,
          agentId,
          agentName,
          messages: [],
          isMinimized: false,
          isLoading: false,
          error: 'Failed to load the conversation history',
          hasLoadedHistory: true,
          totalMessages: 0,
          canLoadMore: false,
          mode: 'floating',
        };

        // Add agent to tracking set (fallback case)
        openAgentWindows.current.add(agentId);

        setChatWindows((prev) => [...prev, newWindow]);
        setCurrentMessage((prev) => ({ ...prev, [newWindow.id]: '' }));

        // Set initial window size
        setWindowSizes((prev) => ({
          ...prev,
          [newWindow.id]: { width: 320, height: 400 },
        }));
      }
    },
    [user?.id]
  );

  // Keep tracking set in sync with actual windows
  useEffect(() => {
    const currentAgentIds = new Set(chatWindows.map((w) => w.agentId));
    openAgentWindows.current = currentAgentIds;
  }, [chatWindows]);

  // Define openNewChatWindow function for forced new chats
  const openNewChatWindow = useCallback(
    async (agentId: string, agentName: string) => {
      try {
        const windowId = `chat-${Date.now()}-${agentId}-new`;

        // Opens with a blank pane by request, but the underlying conversation is
        // the same durable one — the server keys it by (user, agent).
        const newWindow: ChatWindow = {
          id: windowId,
          agentId,
          agentName,
          messages: [],
          isMinimized: false,
          isLoading: false,
          error: null,
          hasLoadedHistory: true,
          totalMessages: 0,
          canLoadMore: false,
          mode: 'floating',
        };

        setChatWindows((prev) => [...prev, newWindow]);
        setCurrentMessage((prev) => ({ ...prev, [newWindow.id]: '' }));

        // Set initial window size
        setWindowSizes((prev) => ({
          ...prev,
          [newWindow.id]: { width: 320, height: 400 },
        }));
      } catch (error) {
        logger.error('Failed to create new chat window:', error);

        // Fallback to non-persistent chat
        const newWindow: ChatWindow = {
          id: `chat-${Date.now()}-${agentId}-new`,
          agentId,
          agentName,
          messages: [],
          isMinimized: false,
          isLoading: false,
          error: 'Failed to open the chat window',
          hasLoadedHistory: true,
          totalMessages: 0,
          canLoadMore: false,
          mode: 'floating',
        };

        setChatWindows((prev) => [...prev, newWindow]);
        setCurrentMessage((prev) => ({ ...prev, [newWindow.id]: '' }));

        // Set initial window size
        setWindowSizes((prev) => ({
          ...prev,
          [newWindow.id]: { width: 320, height: 400 },
        }));
      }
    },
    [user?.id]
  );

  // Enhanced send functions for conversation intelligence integration
  const sendFloatingMessageWithText = useCallback(
    async (windowId: string, messageText: string, intent?: unknown) => {
      const window = chatWindows.find((w) => w.id === windowId);

      if (!window || !messageText?.trim() || window.isLoading) return;

      const trimmedMessage = messageText.trim();

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        content: trimmedMessage,
        sender: 'user',
        senderName: 'You',
        timestamp: new Date().toISOString(),
        messageType: MessageType.MESSAGE,
        metadata: { agentId: window.agentId, intent },
      };

      setChatWindows((prev) =>
        prev.map((w) =>
          w.id === windowId
            ? {
                ...w,
                messages: [...w.messages, userMessage],
                isLoading: true,
                error: null,
              }
            : w
        )
      );

      // Set loading state with typing indicator
      setLoadingStates((prev) => ({
        ...prev,
        [windowId]: {
          isLoading: true,
          loadingText: 'Agent is thinking...',
          progress: 0,
        },
      }));
      setTypingIndicators((prev) => ({ ...prev, [windowId]: true }));

      // Simulate progress updates
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 25;
        if (progress < 90) {
          setLoadingStates((prev) => ({
            ...prev,
            [windowId]: {
              ...prev[windowId],
              progress: Math.min(progress, 90),
            },
          }));
        }
      }, 200);

      // Store interval for cleanup
      if (loadingTimeouts.current[windowId]) {
        clearInterval(loadingTimeouts.current[windowId]);
      }
      loadingTimeouts.current[windowId] = progressInterval;

      // Both turns are persisted server-side by the chat endpoint, keyed by this
      // id. The browser cannot write them itself — the discussion write route
      // forbids posting as another participant, so the agent turn was never
      // storable from here.
      const clientTurnId = crypto.randomUUID();

      const snapshotMsgs = window.messages.slice(-10).map((m) => ({
        content: m.content,
        sender: m.sender === 'user' ? 'user' : m.senderName,
        timestamp: m.timestamp,
      }));

      const clearFloatingLoadingState = () => {
        if (loadingTimeouts.current[windowId]) {
          clearInterval(loadingTimeouts.current[windowId]);
          delete loadingTimeouts.current[windowId];
        }
        setLoadingStates((prev) => {
          const copy = { ...prev };
          delete copy[windowId];
          return copy;
        });
        setTypingIndicators((prev) => ({ ...prev, [windowId]: false }));
      };

      const appendFloatingMsg = async (restResponse: Awaited<ReturnType<typeof uaipAPI.agents.chat>>) => {
        const agentMessage: ChatMessage = {
          id: `msg-${Date.now()}-agent`,
          content: restResponse.response,
          sender: 'agent',
          senderName: readAgentName(restResponse, window.agentName),
          timestamp: new Date().toISOString(),
          messageType: MessageType.MESSAGE,
          confidence: readConfidence(restResponse),
          memoryEnhanced: readMemoryEnhanced(restResponse),
          knowledgeUsed: readKnowledgeUsed(restResponse),
          toolsExecuted: toToolsExecuted(readAgentChatMetadata(restResponse).toolsExecuted),
          toolsWithheld: toToolsWithheld(readAgentChatMetadata(restResponse).suggestedTools),
          agentId: window.agentId,
        };

        setChatWindows((prev) =>
          prev.map((w) =>
            w.id === windowId ? { ...w, messages: [...w.messages, agentMessage], isLoading: false, error: null } : w
          )
        );
        clearFloatingLoadingState();
      };

      try {
        // Always REST. The WebSocket branch emitted `agent_chat`, which the server
        // republishes as `agent.chat.request` — an event with ZERO subscribers, so
        // no reply ever came and this path only cost a 6s dead wait before falling
        // back to exactly this call.
        const restResponse = await uaipAPI.agents.chat(window.agentId, {
          message: trimmedMessage,
          conversationHistory: snapshotMsgs,
          clientTurnId,
          context: { intent },
          projectId: activeProjectId,
        });
        await appendFloatingMsg(restResponse);
      } catch (error) {
        logger.error('Chat error:', error);
        clearFloatingLoadingState();
        setChatWindows((prev) =>
          prev.map((w) =>
            w.id === windowId
              ? { ...w, isLoading: false, error: 'Failed to send message. Please try again.' }
              : w
          )
        );
      }
    },
    [activeProjectId, chatWindows]
  );

  // Aborts an in-flight portal agent stream. Wired to the abort button on
  // the streaming MessageBubble. Idempotent — safe to call when nothing is
  // streaming (the hook is a no-op in that case).
  const abortPortalStream = useCallback(() => {
    if (!streamingMessageId) return;
    cancelAgentStream();
    const interruptedId = streamingMessageId;
    setPortalMessages((prev) =>
      prev.map((m) =>
        m.id === interruptedId
          ? { ...m, content: m.content ? `${m.content}\n\n_— stopped by user —_` : '_— stopped by user —_' }
          : m
      )
    );
    setStreamingMessageId(null);
    streamingHandlersRef.current = {
      placeholderId: null,
      append: () => {},
      finalize: () => {},
      fail: () => {},
    };
    setTypingIndicators((prev) => ({ ...prev, portal: false }));
    setLoadingStates((prev) => {
      const copy = { ...prev };
      delete copy.portal;
      return copy;
    });
  }, [streamingMessageId, cancelAgentStream]);

  const sendPortalMessageWithText = useCallback(
    async (messageText: string, intent?: unknown) => {
      if (!messageText?.trim() || !selectedAgentId) return;

      const trimmedMessage = messageText.trim();

      if (/^https?:\/\/\S+$/i.test(trimmedMessage)) {
        setPortalMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            content: trimmedMessage,
            sender: 'user',
            senderName: 'You',
            timestamp: new Date().toISOString(),
            messageType: MessageType.MESSAGE,
          },
        ]);
        try {
          const res = await knowledgeAPI.importUrl(trimmedMessage);
          const ok = !res.errors || res.errors.length === 0;
          toast({
            title: ok ? 'URL imported' : 'URL import failed',
            description: ok
              ? `Imported ${res.imported || 1} item${(res.imported || 1) > 1 ? 's' : ''} from ${trimmedMessage} to knowledge base.`
              : res.errors!.join('\n'),
            variant: ok ? undefined : 'destructive',
          });
        } catch (err) {
          toast({
            title: 'URL import failed',
            description: err instanceof Error ? err.message : String(err),
            variant: 'destructive',
          });
        }
        return;
      }

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        content: trimmedMessage,
        sender: 'user',
        senderName: 'You',
        timestamp: new Date().toISOString(),
        messageType: MessageType.MESSAGE,
      };

      setPortalMessages((prev) => [...prev, userMessage]);
      setConversationHistory((prev) => [
        ...prev,
        { content: trimmedMessage, sender: 'user', timestamp: new Date().toISOString() },
      ]);

      // Identifies this turn for the whole request lifecycle: the server pairs the
      // user message with its reply under this id, so a retry returns the stored
      // answer instead of generating a second one.
      const clientTurnId = crypto.randomUUID();

      // Set loading state for portal mode
      const portalWindowId = 'portal';
      setLoadingStates((prev) => ({
        ...prev,
        [portalWindowId]: {
          isLoading: true,
          loadingText: 'Agent is thinking...',
          progress: 0,
        },
      }));
      setTypingIndicators((prev) => ({ ...prev, [portalWindowId]: true }));

      // Simulate progress updates
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 25;
        if (progress < 90) {
          setLoadingStates((prev) => ({
            ...prev,
            [portalWindowId]: {
              ...prev[portalWindowId],
              progress: Math.min(progress, 90),
            },
          }));
        }
      }, 200);

      // Store interval for cleanup
      if (loadingTimeouts.current[portalWindowId]) {
        clearInterval(loadingTimeouts.current[portalWindowId]);
      }
      loadingTimeouts.current[portalWindowId] = progressInterval;

      const clearPortalLoadingState = () => {
        if (loadingTimeouts.current[portalWindowId]) {
          clearInterval(loadingTimeouts.current[portalWindowId]);
          delete loadingTimeouts.current[portalWindowId];
        }
        setLoadingStates((prev) => {
          const copy = { ...prev };
          delete copy[portalWindowId];
          return copy;
        });
        setTypingIndicators((prev) => ({ ...prev, [portalWindowId]: false }));
      };

      const appendPortalAgentMessage = (restResponse: Awaited<ReturnType<typeof uaipAPI.agents.chat>>) => {
        const agentMessage: ChatMessage = {
          id: `msg-${Date.now()}-agent`,
          content: restResponse.response,
          sender: 'agent',
          senderName: readAgentName(restResponse, selectedAgent?.name || 'Assistant'),
          timestamp: new Date().toISOString(),
          messageType: MessageType.MESSAGE,
          confidence: readConfidence(restResponse),
          memoryEnhanced: readMemoryEnhanced(restResponse),
          knowledgeUsed: readKnowledgeUsed(restResponse),
          toolsExecuted: toToolsExecuted(readAgentChatMetadata(restResponse).toolsExecuted),
          toolsWithheld: toToolsWithheld(readAgentChatMetadata(restResponse).suggestedTools),
        };
        setPortalMessages((prev) => [...prev, agentMessage]);
        setConversationHistory((prev) => [
          ...prev,
          { content: restResponse.response, sender: 'agent', timestamp: new Date().toISOString() },
        ]);
        clearPortalLoadingState();
      };

      try {
        const restResponse = await uaipAPI.agents.chat(selectedAgentId, {
          message: trimmedMessage,
          conversationHistory: conversationHistory.slice(-10),
          clientTurnId,
          context: { intent },
          projectId: activeProjectId,
          model: selectedModel,
        });
        appendPortalAgentMessage(restResponse);
      } catch (error) {
        logger.error('Portal chat error:', error);

        // Clear loading states on error
        if (loadingTimeouts.current[portalWindowId]) {
          clearInterval(loadingTimeouts.current[portalWindowId]);
          delete loadingTimeouts.current[portalWindowId];
        }
        setLoadingStates((prev) => {
          const newStates = { ...prev };
          delete newStates[portalWindowId];
          return newStates;
        });
        setTypingIndicators((prev) => ({ ...prev, [portalWindowId]: false }));
        setStreamingMessageId(null);
        streamingHandlersRef.current = {
          placeholderId: null,
          append: () => {},
          finalize: () => {},
          fail: () => {},
        };

        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}-error`,
          content: 'Sorry, I encountered an error. Please try again.',
          sender: 'system',
          senderName: 'System',
          timestamp: new Date().toISOString(),
          messageType: MessageType.MESSAGE,
        };
        setPortalMessages((prev) => [...prev, errorMessage]);
      }
    },
    [
      activeProjectId,
      selectedAgentId,
      conversationHistory,
      selectedAgent?.name,
    ]
  );

  // Listen for agent chat open events
  useEffect(() => {
    const handleOpenAgentChat = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const { agentId, agentName, sessionId } = event.detail;
      if (sessionId) {
        // Resume specific session
        openChatWindowWithSession(agentId, agentName, sessionId);
      } else {
        openChatWindow(agentId, agentName);
      }
    };

    const handleOpenNewAgentChat = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const { agentId, agentName, forceNew } = event.detail;
      if (forceNew) {
        openNewChatWindow(agentId, agentName);
      } else {
        openChatWindow(agentId, agentName);
      }
    };

    window.addEventListener('openAgentChat', handleOpenAgentChat);
    window.addEventListener('openNewAgentChat', handleOpenNewAgentChat);

    return () => {
      window.removeEventListener('openAgentChat', handleOpenAgentChat);
      window.removeEventListener('openNewAgentChat', handleOpenNewAgentChat);
    };
  }, [openChatWindow, openChatWindowWithSession, openNewChatWindow]);

  // Auto-select first agent for portal mode
  useEffect(() => {
    if (viewMode === 'portal' && !selectedAgentId && agentList.length > 0) {
      setSelectedAgentId(agentList[0].id);
    }
  }, [agentList, selectedAgentId, viewMode]);


  // Rebind the portal to the selected agent's durable discussion and restore its
  // transcript. The clear is only the interim state while the load is in flight —
  // leaving it cleared is what made every reopened thread read "no messages yet".
  useEffect(() => {
    if (viewMode !== 'portal' || !selectedAgentId) return;

    let cancelled = false;
    setPortalMessages([]);
    setConversationHistory([]);

    const agentName = agents[selectedAgentId]?.name || 'Assistant';

    void (async () => {
      const restored = await loadAgentChatHistory(selectedAgentId, agentName);
      if (cancelled) return;

      setPortalMessages(restored);
      setConversationHistory(
        restored.map((message) => ({
          content: message.content,
          sender: message.sender === 'user' ? 'user' : 'agent',
          timestamp: message.timestamp,
        }))
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedAgentId, viewMode, agents]);

  const closeChatWindow = useCallback(
    async (windowId: string) => {
      let windowToClose: ChatWindow | undefined;

      setChatWindows((prev) => {
        windowToClose = prev.find((w) => w.id === windowId);
        if (windowToClose) {
          // Remove agent from tracking set when window is closed
          openAgentWindows.current.delete(windowToClose.agentId);
        }
        return prev.filter((w) => w.id !== windowId);
      });

      // Clean up WebSocket connection for this specific chat
      if (windowToClose && isWebSocketConnected) {
        try {
          // Send a cleanup message to the server to close this specific chat session
          sendWebSocketMessage('chat_window_closed', {
            agentId: windowToClose.agentId,
            discussionId: windowToClose.discussionId,
            conversationId: conversationIds[windowId],
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          logger.error('Error notifying server of chat window closure:', error);
        }
      }

      // No local persistence to clear - everything is now handled by backend discussions
      setCurrentMessage((prev) => {
        const newMessages = { ...prev };
        delete newMessages[windowId];
        return newMessages;
      });

      // Clean up window-specific state
      setWindowPositions((prev) => {
        const newPositions = { ...prev };
        delete newPositions[windowId];
        return newPositions;
      });
      setWindowSizes((prev) => {
        const newSizes = { ...prev };
        delete newSizes[windowId];
        return newSizes;
      });
      setLoadingStates((prev) => {
        const newStates = { ...prev };
        delete newStates[windowId];
        return newStates;
      });
      setTypingIndicators((prev) => {
        const newIndicators = { ...prev };
        delete newIndicators[windowId];
        return newIndicators;
      });
      setIsDragging((prev) => {
        const newDragging = { ...prev };
        delete newDragging[windowId];
        return newDragging;
      });
      setIsResizing((prev) => {
        const newResizing = { ...prev };
        delete newResizing[windowId];
        return newResizing;
      });

      if (loadingTimeouts.current[windowId]) {
        clearInterval(loadingTimeouts.current[windowId]);
        delete loadingTimeouts.current[windowId];
      }
      // Clean up conversation intelligence data
      setConversationTopics((prev) => {
        const newTopics = { ...prev };
        delete newTopics[windowId];
        return newTopics;
      });
      setConversationIds((prev) => {
        const newIds = { ...prev };
        delete newIds[windowId];
        return newIds;
      });

      // Clear enhanced AI sidekick state
      setThinkingParticles((prev) => {
        const newParticles = { ...prev };
        delete newParticles[windowId];
        return newParticles;
      });
      setConfidenceMetrics((prev) => {
        const newMetrics = { ...prev };
        delete newMetrics[windowId];
        return newMetrics;
      });
      setKnowledgeSources((prev) => {
        const newSources = { ...prev };
        delete newSources[windowId];
        return newSources;
      });
      setToolExecutionProgress((prev) => {
        const newProgress = { ...prev };
        delete newProgress[windowId];
        return newProgress;
      });
      setMemoryEnhancementBadges((prev) => {
        const newBadges = { ...prev };
        delete newBadges[windowId];
        return newBadges;
      });
      setQuickActionsPanelOpen((prev) => {
        const newPanels = { ...prev };
        delete newPanels[windowId];
        return newPanels;
      });
      setContextualSuggestions((prev) => {
        const newSuggestions = { ...prev };
        delete newSuggestions[windowId];
        return newSuggestions;
      });

      // Clean up window refs
      if (windowRefs.current[windowId]) {
        delete windowRefs.current[windowId];
      }

      // Clear contextual analysis data
      if (contextualAnalysisRef.current[windowId]) {
        delete contextualAnalysisRef.current[windowId];
      }
    },
    [isWebSocketConnected, sendWebSocketMessage, conversationIds]
  );

  const minimizeChatWindow = useCallback((windowId: string) => {
    setChatWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, isMinimized: !w.isMinimized } : w))
    );
  }, []);

  const _sendFloatingMessage = useCallback(
    async (windowId: string) => {
      const window = chatWindows.find((w) => w.id === windowId);
      const messageText = currentMessage[windowId]?.trim();

      if (!window || !messageText || window.isLoading) return;

      // Remove the WebSocket requirement - we'll handle fallback in the send logic

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        content: messageText,
        sender: 'user',
        senderName: 'You',
        timestamp: new Date().toISOString(),
        messageType: MessageType.MESSAGE,
        metadata: { agentId: window.agentId },
      };

      setChatWindows((prev) =>
        prev.map((w) =>
          w.id === windowId
            ? {
                ...w,
                messages: [...w.messages, userMessage],
                isLoading: true,
                error: null,
              }
            : w
        )
      );

      setCurrentMessage((prev) => ({ ...prev, [windowId]: '' }));

      const clientTurnId = crypto.randomUUID();

      const snapshotMessages = window.messages.slice(-10).map((m) => ({
        content: m.content,
        sender: m.sender === 'user' ? 'user' : m.senderName,
        timestamp: m.timestamp,
      }));

      const appendFloatingAgentMessage = async (restResponse: Awaited<ReturnType<typeof uaipAPI.agents.chat>>) => {
        const agentMessage: ChatMessage = {
          id: `msg-${Date.now()}-agent`,
          content: restResponse.response,
          sender: 'agent',
          senderName: readAgentName(restResponse, window.agentName),
          timestamp: new Date().toISOString(),
          messageType: MessageType.MESSAGE,
          confidence: readConfidence(restResponse),
          memoryEnhanced: readMemoryEnhanced(restResponse),
          knowledgeUsed: readKnowledgeUsed(restResponse),
          toolsExecuted: toToolsExecuted(readAgentChatMetadata(restResponse).toolsExecuted),
          toolsWithheld: toToolsWithheld(readAgentChatMetadata(restResponse).suggestedTools),
          agentId: window.agentId,
        };

        setChatWindows((prev) =>
          prev.map((w) =>
            w.id === windowId ? { ...w, messages: [...w.messages, agentMessage], isLoading: false, error: null } : w
          )
        );

      };

      try {
        // Always REST — see the note on the other floating-window sender: the
        // `agent_chat` socket event has no subscriber, so it never replies.
        const restResponse = await uaipAPI.agents.chat(window.agentId, {
          message: messageText,
          conversationHistory: snapshotMessages,
          clientTurnId,
          context: {},
          projectId: activeProjectId,
        });
        await appendFloatingAgentMessage(restResponse);
      } catch (error) {
        logger.error('Chat error:', error);
        setChatWindows((prev) =>
          prev.map((w) =>
            w.id === windowId
              ? {
                  ...w,
                  isLoading: false,
                  error: 'Failed to send message. Please try again.',
                }
              : w
          )
        );
      }
    },
    [activeProjectId, chatWindows, currentMessage]
  );

  const _sendPortalMessage = useCallback(async () => {
    const messageText = currentMessage['portal']?.trim();
    if (!messageText || !selectedAgentId) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      content: messageText,
      sender: 'user',
      senderName: 'You',
      timestamp: new Date().toISOString(),
      messageType: MessageType.MESSAGE,
    };

    setPortalMessages((prev) => [...prev, userMessage]);
    setCurrentMessage((prev) => ({ ...prev, portal: '' }));
    setConversationHistory((prev) => [
      ...prev,
      { content: messageText, sender: 'user', timestamp: new Date().toISOString() },
    ]);

    // Set loading state for portal mode
    const portalWindowId = 'portal';
    setLoadingStates((prev) => ({
      ...prev,
      [portalWindowId]: {
        isLoading: true,
        loadingText: 'Agent is thinking...',
        progress: 0,
      },
    }));
    setTypingIndicators((prev) => ({ ...prev, [portalWindowId]: true }));

    try {
      // Always REST. This branch previously emitted `agent_chat` over the socket
      // with NO fallback timer at all, so a WebSocket-connected portal chat hung
      // on "Agent is thinking..." forever — `agent.chat.request` has no subscriber.
      const restResponse = await uaipAPI.agents.chat(selectedAgentId, {
        message: messageText,
        model: selectedModel,
        conversationHistory: conversationHistory.slice(-10),
        context: {},
        projectId: activeProjectId,
      });

      const agentMessage: ChatMessage = {
        id: `msg-${Date.now()}-agent`,
        content: restResponse.response,
        sender: 'agent',
        senderName: readAgentName(restResponse, selectedAgent?.name || 'Assistant'),
        timestamp: new Date().toISOString(),
        messageType: MessageType.MESSAGE,
        confidence: readConfidence(restResponse),
        memoryEnhanced: readMemoryEnhanced(restResponse),
        knowledgeUsed: readKnowledgeUsed(restResponse),
        toolsExecuted: toToolsExecuted(readAgentChatMetadata(restResponse).toolsExecuted),
        toolsWithheld: toToolsWithheld(readAgentChatMetadata(restResponse).suggestedTools),
      };

      setPortalMessages((prev) => [...prev, agentMessage]);
      setConversationHistory((prev) => [
        ...prev,
        { content: restResponse.response, sender: 'agent', timestamp: new Date().toISOString() },
      ]);

      setLoadingStates((prev) => {
        const newStates = { ...prev };
        delete newStates[portalWindowId];
        return newStates;
      });
      setTypingIndicators((prev) => ({ ...prev, [portalWindowId]: false }));
    } catch (error) {
      logger.error('Portal chat error:', error);

      // Clear loading states on error
      setLoadingStates((prev) => {
        const newStates = { ...prev };
        delete newStates[portalWindowId];
        return newStates;
      });
      setTypingIndicators((prev) => ({ ...prev, [portalWindowId]: false }));

      // Add error message to chat
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        content: 'Sorry, I encountered an error. Please try again.',
        sender: 'system',
        senderName: 'System',
        timestamp: new Date().toISOString(),
        messageType: MessageType.MESSAGE,
      };
      setPortalMessages((prev) => [...prev, errorMessage]);
    }
  }, [activeProjectId, currentMessage, selectedAgentId, conversationHistory]);

  const clearPortalConversation = useCallback(() => {
    setPortalMessages([]);
    setConversationHistory([]);
  }, []);

  // Auto-scroll for floating windows
  const scrollToBottom = useCallback((windowId: string) => {
    const messagesContainer = document.getElementById(`messages-${windowId}`);
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, []);

  useEffect(() => {
    chatWindows.forEach((window) => {
      if (!window.isMinimized) {
        scrollToBottom(window.id);
      }
    });
  }, [chatWindows, scrollToBottom]);

  const sortedChatWindows = useMemo(() => {
    return chatWindows.sort((a, b) => {
      if (a.isMinimized && !b.isMinimized) return 1;
      if (!a.isMinimized && b.isMinimized) return -1;
      return b.id.localeCompare(a.id);
    });
  }, [chatWindows]);

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus chat with Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (chatWindows.length > 0) {
          const latestWindow = chatWindows[chatWindows.length - 1];
          setFocusedWindow(latestWindow.id);
          const inputElement = document.querySelector(`#chat-input-${latestWindow.id}`);
          if (inputElement instanceof HTMLInputElement) {
            inputElement.focus();
          }
        }
      }

      // Toggle all windows minimize with Cmd+M / Ctrl+M
      if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault();
        const allMinimized = chatWindows.every((w) => w.isMinimized);
        setChatWindows((prev) => prev.map((w) => ({ ...w, isMinimized: !allMinimized })));
      }

      // Close all windows with Cmd+W / Ctrl+W
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        setChatWindows([]);
        openAgentWindows.current.clear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatWindows]);

  // Contextual analysis for enhanced AI features
  const _analyzeMessageContext = useCallback((message: string) => {
    const sentiment = message.includes('?') ? 0.3 : message.includes('!') ? 0.8 : 0.5;
    const complexity =
      message.split(' ').length > 20 ? 0.8 : message.split(' ').length > 10 ? 0.6 : 0.4;
    const urgency =
      message.toLowerCase().includes('urgent') || message.toLowerCase().includes('asap')
        ? 0.9
        : 0.3;
    return { sentiment, complexity, urgency };
  }, []);

  // Enhanced window positioning with smart cascade and collision detection
  const calculateWindowPosition = useCallback(
    (windowId: string, index: number) => {
      const windowWidth = windowSizes[windowId]?.width || 320;
      const windowHeight = windowSizes[windowId]?.height || 400;
      const padding = 20;
      const titleBarHeight = 40;

      // If position already set, use it
      if (windowPositions[windowId]) {
        return windowPositions[windowId];
      }

      const snapMode = windowSnapMode[windowId] || 'none';

      if (snapMode === 'edge') {
        return {
          x: window.innerWidth - windowWidth - padding,
          y: 50 + index * (titleBarHeight + 10),
        };
      } else if (snapMode === 'corner') {
        return {
          x: window.innerWidth - windowWidth - padding,
          y: window.innerHeight - windowHeight - padding,
        };
      }

      // Smart cascade positioning to avoid overlap
      const cascadeOffset = 30;
      const baseX = window.innerWidth - windowWidth - padding;
      const baseY = window.innerHeight - windowHeight - padding;

      // Calculate position based on existing windows to avoid collision
      let proposedX = baseX - index * cascadeOffset;
      let proposedY = baseY - index * cascadeOffset;

      // Ensure window stays within viewport
      proposedX = Math.max(padding, Math.min(proposedX, window.innerWidth - windowWidth - padding));
      proposedY = Math.max(
        padding + titleBarHeight,
        Math.min(proposedY, window.innerHeight - windowHeight - padding)
      );

      return { x: proposedX, y: proposedY };
    },
    [windowPositions, windowSizes, windowSnapMode]
  );

  // Mouse event handlers for dragging and resizing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, windowId: string, action: 'drag' | 'resize') => {
      e.preventDefault();
      const windowElement = windowRefs.current[windowId];
      if (!windowElement) return;

      const rect = windowElement.getBoundingClientRect();

      if (action === 'drag') {
        setIsDragging((prev) => ({ ...prev, [windowId]: true }));
        draggingRef.current = {
          windowId,
          offset: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        };
      } else if (action === 'resize') {
        setIsResizing((prev) => ({ ...prev, [windowId]: true }));
        resizingRef.current = {
          windowId,
          startSize: { width: rect.width, height: rect.height },
          startMouse: { x: e.clientX, y: e.clientY },
        };
      }

      setFocusedWindow(windowId);
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingRef.current) {
        const { windowId, offset } = draggingRef.current;
        const newPosition = {
          x: e.clientX - offset.x,
          y: e.clientY - offset.y,
        };

        // Constrain to viewport
        const windowWidth = windowSizes[windowId]?.width || 320;
        const windowHeight = windowSizes[windowId]?.height || 400;
        newPosition.x = Math.max(0, Math.min(newPosition.x, window.innerWidth - windowWidth));
        newPosition.y = Math.max(0, Math.min(newPosition.y, window.innerHeight - windowHeight));

        setWindowPositions((prev) => ({ ...prev, [windowId]: newPosition }));
      }

      if (resizingRef.current) {
        const { windowId, startSize, startMouse } = resizingRef.current;
        const deltaX = e.clientX - startMouse.x;
        const deltaY = e.clientY - startMouse.y;

        const newSize = {
          width: Math.max(280, Math.min(startSize.width + deltaX, window.innerWidth * 0.8)),
          height: Math.max(300, Math.min(startSize.height + deltaY, window.innerHeight * 0.8)),
        };

        setWindowSizes((prev) => ({ ...prev, [windowId]: newSize }));
      }
    },
    [windowSizes]
  );

  const handleMouseUp = useCallback(() => {
    if (draggingRef.current) {
      const windowId = draggingRef.current.windowId;
      setIsDragging((prev) => ({ ...prev, [windowId]: false }));
      draggingRef.current = null;
    }

    if (resizingRef.current) {
      const windowId = resizingRef.current.windowId;
      setIsResizing((prev) => ({ ...prev, [windowId]: false }));
      resizingRef.current = null;
    }
  }, []);

  // Add global mouse event listeners
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const cancelTyping = useCallback((windowId: string) => {
    if (loadingTimeouts.current[windowId]) {
      clearInterval(loadingTimeouts.current[windowId]);
      delete loadingTimeouts.current[windowId];
    }
    setLoadingStates((prev) => {
      const newStates = { ...prev };
      delete newStates[windowId];
      return newStates;
    });
    setTypingIndicators((prev) => ({ ...prev, [windowId]: false }));
  }, []);

  // Render floating windows with ultimate AI sidekick features
  const renderFloatingWindows = () => (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <AnimatePresence>
        {sortedChatWindows.map((window, index) => {
          const position = calculateWindowPosition(window.id, index);
          const size = windowSizes[window.id] || { width: 320, height: 400 };
          const isLoading = window.isLoading || loadingStates[window.id]?.isLoading;
          const isDrag = isDragging[window.id];
          const isResize = isResizing[window.id];

          const composerThreadState: ThreadState = !isWebSocketConnected
            ? ThreadState.OFFLINE
            : waState !== 'connected'
              ? ThreadState.WA_DISCONNECTED
              : window.hasLoadedHistory && window.error
                ? ThreadState.ERROR
                : isLoading
                  ? ThreadState.LOADING
                  : ThreadState.ACTIVE;

          const composer = (
            <div
              data-companion-composer
              className="p-4 border-t border-border/40 bg-gradient-to-r from-muted/50 to-muted/70 relative"
            >
              <ChatComposer
                agentId={window.agentId}
                conversationId={window.sessionId}
                placeholder="Type a message..."
                disabled={isLoading}
                disabledReason={
                  waState !== 'connected'
                      ? 'WhatsApp not connected — message will be queued'
                      : undefined
                }
                threadState={composerThreadState}
                onRetry={() => {
                  setChatWindows((prev) =>
                    prev.map((w) =>
                      w.id === window.id ? { ...w, error: null } : w
                    )
                  );
                }}
                onSubmit={(payload: ChatComposerSubmitPayload) => {
                  sendFloatingMessageWithText(window.id, payload.text, payload.intent);
                }}
              />

              {window.error && composerThreadState !== ThreadState.ERROR && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 p-2 bg-red-500/20 border border-red-500/30 rounded-md text-red-400 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3 h-3" />
                    {window.error}
                  </div>
                </motion.div>
              )}
            </div>
          );

          return (
            <FloatingThreadContainer
              key={window.id}
              chrome={{
                agentName: window.agentName,
                isLoading: Boolean(isLoading),
                isMinimized: window.isMinimized,
                isFocused: focusedWindow === window.id,
                isDragging: Boolean(isDrag),
                isResizing: Boolean(isResize),
                position,
                size,
              }}
              messages={window.messages}
              composer={composer}
              streamId={`messages-${window.id}`}
              typing={{
                isTyping: typingIndicators[window.id] || false,
                loadingText: loadingStates[window.id]?.loadingText,
                progress: loadingStates[window.id]?.progress,
              }}
              onCancelTyping={() => cancelTyping(window.id)}
              agentName={window.agentName}
              suggestions={[
                `What can ${window.agentName} help me with?`,
                'Summarize my latest discussion',
                'Brainstorm three ideas with me',
              ]}
              onSelectSuggestion={(text) => sendFloatingMessageWithText(window.id, text)}
              containerRef={(el) => {
                windowRefs.current[window.id] = el;
              }}
              onFocus={() => setFocusedWindow(window.id)}
              onMinimize={() => minimizeChatWindow(window.id)}
              onClose={() => closeChatWindow(window.id)}
              onDragHandleMouseDown={(e) => handleMouseDown(e, window.id, 'drag')}
              onResizeHandleMouseDown={(e) => handleMouseDown(e, window.id, 'resize')}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );

  // Render portal mode
  const renderPortalMode = () => (
    <div className={`flex h-full min-h-0 flex-col ${className ?? ''}`}>
      {/* Chat Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-20 shrink-0 border-b border-border/70 bg-card/80 px-3 py-2.5 backdrop-blur-xl sm:px-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <ConversationTopicDisplay
                  conversationId={conversationIds['portal'] || ''}
                  agentId={selectedAgentId}
                  initialTopic={
                    conversationTopics['portal'] ||
                    (selectedAgent ? `Chat with ${selectedAgent.name}` : 'Agent Chat')
                  }
                  onTopicChange={(newTopic) => {
                    setConversationTopics((prev) => ({ ...prev, portal: newTopic }));
                  }}
                  className="truncate text-sm font-semibold text-foreground"
                />
                <div
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${isWebSocketConnected ? 'bg-emerald-400' : 'bg-red-400'}`}
                />
                <span
                  className={`shrink-0 text-[11px] ${isWebSocketConnected ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {isWebSocketConnected ? 'Live' : 'Offline'}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {selectedAgent?.role || 'Select an agent to begin'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {portalMessages.length > 0 && (
              <DiscussionTrigger
                trigger={
                  <button
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Start discussion from chat"
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Discuss</span>
                  </button>
                }
                contextType="chat"
                contextData={{
                  chatHistory: portalMessages.map((msg) => ({
                    content: msg.content,
                    sender: msg.sender,
                    timestamp: msg.timestamp,
                  })),
                  topic: selectedAgent
                    ? `Chat with ${selectedAgent.name}`
                    : 'Agent Chat Discussion',
                }}
                preselectedAgents={selectedAgentId ? [selectedAgentId] : []}
              />
            )}
            {portalMessages.length > 0 && (
              <button
                onClick={clearPortalConversation}
                className="inline-flex h-8 items-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setViewMode(viewMode === 'floating' ? 'portal' : 'floating')}
              className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
              aria-label={viewMode === 'floating' ? 'Use portal chat' : 'Float chat'}
            >
              {viewMode === 'floating' ? (
                <LayoutGrid className="h-3.5 w-3.5" />
              ) : (
                <Maximize className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{viewMode === 'floating' ? 'Portal' : 'Float'}</span>
            </button>
          </div>
        </div>

        {agentList.length > 0 && (
          <div className="mt-2 flex items-start justify-end gap-2">
            {selectedAgent && (
              <details className="group relative shrink-0">
                <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-border/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  Capabilities
                  <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {selectedAgent.capabilities?.length ?? 0}
                  </span>
                </summary>
                <div className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-border bg-popover p-3 shadow-2xl">
                  <p className="mb-2 text-xs font-medium text-foreground">{selectedAgent.name} can help with</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAgent.capabilities?.map((capability) => (
                      <span
                        key={`${selectedAgent.id}-capability-${capability}`}
                        className="rounded-md border border-border/70 bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground"
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    Knowledge, tools, and memory are applied contextually while you chat.
                  </p>
                </div>
              </details>
            )}

          </div>
        )}
      </motion.div>

      {/* Chat Messages */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative min-h-0 flex-1 overflow-hidden bg-background"
        style={{ minHeight: 0 }}
      >
        <div className="relative h-full">
          <ThreadContainer
            messages={portalMessages}
            mode="portal"
            typing={{
              isTyping: typingIndicators['portal'] || false,
              loadingText: loadingStates['portal']?.loadingText,
              progress: loadingStates['portal']?.progress,
            }}
            onCancelTyping={() => cancelTyping('portal')}
            streamingMessageId={streamingMessageId}
            onAbortStream={abortPortalStream}
            agentName={selectedAgent?.name}
            suggestions={
              selectedAgent
                ? [
                    `What can ${selectedAgent.name} help me with?`,
                    'Summarize my latest discussion',
                    'Brainstorm three ideas with me',
                  ]
                : []
            }
            onSelectSuggestion={(text) => sendPortalMessageWithText(text)}
            onExpandMessage={expandMessage}
            companion={
              activeContextChip ? (
                activeContextChip.type === 'project' ? (
                  <ProjectCompanion
                    projectId={activeContextChip.resourceId || activeContextChip.id}
                    projectName={activeContextChip.label}
                    onClose={closeCompanion}
                  />
                ) : (
                  <DocCompanion
                    docId={activeContextChip.resourceId || activeContextChip.id}
                    docTitle={activeContextChip.label}
                    content=""
                    onClose={closeCompanion}
                  />
                )
              ) : companionMessage ? (
                <CompanionPane
                  message={companionMessage}
                  onClose={closeCompanion}
                />
              ) : null
            }
            companionOpen={activeContextChip !== null || (companionMessageId !== null && companionMessage !== null)}
            composer={
              <motion.div
                data-companion-composer
                className="relative border-t border-border/70 bg-card/80 p-3 backdrop-blur-xl sm:p-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {selectedAgent && (
                  <details className="mb-2">
                    <summary className="w-fit cursor-pointer list-none rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      Prompt ideas
                    </summary>
                    <PromptSuggestions
                      agentId={selectedAgentId}
                      conversationContext={{
                        currentTopic:
                          conversationTopics['portal'] || `Chat with ${selectedAgent.name}`,
                        recentMessages: portalMessages.slice(-5).map((msg) => ({
                          content: msg.content,
                          role: msg.sender === 'user' ? 'user' : 'assistant',
                          timestamp: new Date(msg.timestamp),
                        })),
                      }}
                      onSelectPrompt={(prompt) => {
                        sendPortalMessageWithText(prompt);
                      }}
                      className="mt-2"
                    />
                  </details>
                )}

                <ContextChipBar
                  chips={activeContextChip ? [activeContextChip] : []}
                  activeChipId={activeContextChip?.id}
                  onChipClick={handleContextChipClick}
                  onRemove={handleContextChipRemove}
                  className="px-0"
                />

                <ChatComposer
                  agentId={selectedAgentId}
                  conversationId={conversationIds['portal']}
                  placeholder={
                    selectedAgent ? `Message ${selectedAgent.name}...` : 'Select an agent first...'
                  }
                  disabled={
                    (typingIndicators['portal'] ?? false) ||
                    (loadingStates['portal']?.isLoading ?? false)
                  }
                  disabledReason={
                    waState !== 'connected'
                        ? 'WhatsApp not connected — message will be queued'
                        : undefined
                  }
                  threadState={
                    !isWebSocketConnected
                      ? ThreadState.OFFLINE
                      : waState !== 'connected'
                        ? ThreadState.WA_DISCONNECTED
                        : (loadingStates['portal']?.isLoading ?? false)
                          ? ThreadState.LOADING
                          : ThreadState.ACTIVE
                  }
                  onChipClick={(chip) => handleContextChipClick({
                    id: chip.id,
                    type: chip.type,
                    label: chip.label,
                    // Forwarding this is what makes the chip addressable: without it
                    // activeProjectId is undefined and every integration tool is
                    // withheld from the turn.
                    ...(chip.resourceId ? { resourceId: chip.resourceId } : {}),
                  })}
                  models={modelState.models}
                  modelsLoading={modelState.loadingModels}
                  model={selectedModel}
                  agentDefaultModel={selectedAgent?.modelId}
                  onModelChange={setSelectedModel}
                  onSubmit={(payload: ChatComposerSubmitPayload) => {
                    sendPortalMessageWithText(payload.text, payload.intent);
                  }}
                />
              </motion.div>
            }
          />
        </div>
      </motion.div>
    </div>
  );

  // Main render logic
  if (mode === 'floating') {
    return renderFloatingWindows();
  } else if (mode === 'portal') {
    // Portal mode can switch between portal and floating views
    return viewMode === 'portal' ? renderPortalMode() : renderFloatingWindows();
  } else {
    // Hybrid mode - show both
    return (
      <>
        {viewMode === 'portal' ? renderPortalMode() : renderFloatingWindows()}
        {/* Always show floating windows */}
        {viewMode === 'portal' && renderFloatingWindows()}
      </>
    );
  }
};
