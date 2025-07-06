import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { useAuth } from '../../../contexts/AuthContext';
import { uaipAPI } from '../../../utils/uaip-api';
import { DiscussionTrigger } from '../../DiscussionTrigger';
import { useEnhancedWebSocket } from '../../../hooks/useEnhancedWebSocket';
import { chatPersistenceService, ChatSession, PersistentChatMessage } from '../../../services/ChatPersistenceService';
import { SmartInputField } from '../../chat/SmartInputField';
import { PromptSuggestions } from '../../chat/PromptSuggestions';
import { ConversationTopicDisplay } from '../../chat/ConversationTopicDisplay';
import { useConversationIntelligence } from '../../../hooks/useConversationIntelligence';
import '../../../styles/ai-sidekick.css';
import {
  MessageSquare,
  Send,
  Bot,
  User,
  Loader2,
  X,
  Minimize2,
  Maximize2,
  Plus,
  Brain,
  Zap,
  Database,
  Sparkles,
  Users,
  Activity,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  Maximize,
  Settings,
  Command,
  Cpu,
  Target,
  Layers,
  Flame,
  Wand2,
  Eye,
  Clock,
  TrendingUp,
  Shield,
  Lightbulb,
  Keyboard,
  Focus,
  Gauge,
  Atom,
  Telescope,
  Radar,
  MonitorSpeaker,
  Headphones,
  Mic
} from 'lucide-react';
import { Discussion, CreateDiscussionRequest, DiscussionMessage, MessageType } from '@uaip/types';

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'agent';
  senderName: string;
  timestamp: string;
  agentId?: string;
  messageType?: MessageType;
  confidence?: number;
  memoryEnhanced?: boolean;
  knowledgeUsed?: number;
  toolsExecuted?: Array<{
    toolId: string;
    toolName: string;
    success: boolean;
    result?: any;
    error?: string;
    timestamp: string;
  }>;
  metadata?: Record<string, any>;
}

interface ChatWindow {
  id: string;
  agentId: string;
  agentName: string;
  sessionId?: string;
  discussionId?: string;
  messages: ChatMessage[];
  isMinimized: boolean;
  isLoading: boolean;
  error: string | null;
  hasLoadedHistory: boolean;
  totalMessages: number;
  canLoadMore: boolean;
  mode: 'floating' | 'portal';
  isPersistent: boolean;
}

interface UnifiedChatSystemProps {
  className?: string;
  mode?: 'floating' | 'portal' | 'hybrid';
  defaultAgentId?: string;
}

export const UnifiedChatSystem: React.FC<UnifiedChatSystemProps> = ({
  className,
  mode = 'hybrid',
  defaultAgentId
}) => {
  const { agents } = useAgents();
  const { isAuthenticated, user } = useAuth();
  const { 
    isConnected: isWebSocketConnected, 
    sendMessage: sendWebSocketMessage, 
    lastEvent,
    connectionType,
    authStatus,
    error: wsError,
    addEventListener,
    connect
  } = useEnhancedWebSocket();

  // State management
  const [chatWindows, setChatWindows] = useState<ChatWindow[]>([]);
  const [currentMessage, setCurrentMessage] = useState<{ [windowId: string]: string }>({});
  const [viewMode, setViewMode] = useState<'floating' | 'portal'>(mode === 'portal' ? 'portal' : 'floating');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(defaultAgentId || '');
  const [portalMessages, setPortalMessages] = useState<ChatMessage[]>([]);
  const [conversationHistory, setConversationHistory] = useState<Array<{ content: string; sender: string; timestamp: string }>>([]);
  const [conversationTopics, setConversationTopics] = useState<{ [windowId: string]: string }>({});
  const [conversationIds, setConversationIds] = useState<{ [windowId: string]: string }>({});
  
  // Enhanced AI Sidekick State
  const [windowPositions, setWindowPositions] = useState<{ [windowId: string]: { x: number; y: number } }>({});
  const [windowSnapMode, setWindowSnapMode] = useState<{ [windowId: string]: 'none' | 'edge' | 'corner' }>({});
  const [thinkingParticles, setThinkingParticles] = useState<{ [windowId: string]: boolean }>({});
  const [confidenceMetrics, setConfidenceMetrics] = useState<{ [windowId: string]: number }>({});
  const [knowledgeSources, setKnowledgeSources] = useState<{ [windowId: string]: string[] }>({});
  const [toolExecutionProgress, setToolExecutionProgress] = useState<{ [windowId: string]: Array<{ toolName: string; progress: number; status: 'running' | 'completed' | 'failed' }> }>({});
  const [memoryEnhancementBadges, setMemoryEnhancementBadges] = useState<{ [windowId: string]: boolean }>({});
  const [quickActionsPanelOpen, setQuickActionsPanelOpen] = useState<{ [windowId: string]: boolean }>({});
  const [contextualSuggestions, setContextualSuggestions] = useState<{ [windowId: string]: string[] }>({});
  const [isResizing, setIsResizing] = useState<{ [windowId: string]: boolean }>({});
  const [focusedWindow, setFocusedWindow] = useState<string | null>(null);
  
  // Track processed message IDs to prevent duplicates
  const processedMessageIds = useRef<Set<string>>(new Set());

  // Track which agents have open windows to ensure uniqueness
  const openAgentWindows = useRef<Set<string>>(new Set());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentList = Object.values(agents);
  const selectedAgent = agentList.find(agent => agent.id === selectedAgentId);
  
  // Enhanced AI Sidekick Refs
  const windowRefs = useRef<{ [windowId: string]: HTMLDivElement | null }>({});
  const draggingRef = useRef<{ windowId: string; offset: { x: number; y: number } } | null>(null);
  const keyboardShortcutsRef = useRef<{ [key: string]: () => void }>({});
  const contextualAnalysisRef = useRef<{ [windowId: string]: { sentiment: number; complexity: number; urgency: number } }>({});

  // Conversation Intelligence for portal mode
  const portalConversationIntelligence = useConversationIntelligence({
    agentId: selectedAgentId,
    conversationId: conversationIds['portal'],
    onTopicGenerated: (topic: string, confidence: number) => {
      setConversationTopics(prev => ({ ...prev, portal: topic }));
    }
  });

  // Conversation Intelligence for floating windows
  const floatingConversationIntelligence = useMemo(() => {
    return chatWindows.reduce((acc, window) => {
      acc[window.id] = {
        agentId: window.agentId,
        conversationId: window.sessionId || '',
        topic: conversationTopics[window.id] || window.agentName
      };
      return acc;
    }, {} as Record<string, { agentId: string; conversationId: string; topic: string }>);
  }, [chatWindows, conversationTopics]);

  // Connect WebSocket only when authenticated
  useEffect(() => {
    if (isAuthenticated && !isWebSocketConnected) {
      console.log('User authenticated, connecting WebSocket...');
      connect();
    }
  }, [isAuthenticated, isWebSocketConnected, connect]);

  // Listen for WebSocket agent responses
  useEffect(() => {
    if (lastEvent && lastEvent.type === 'agent_response') {
      const { agentId, response, agentName, confidence, memoryEnhanced, knowledgeUsed, toolsExecuted, messageId } = lastEvent.payload;
      
      // Prevent duplicate processing of the same message
      if (messageId && processedMessageIds.current.has(messageId)) {
        console.log('🚫 Duplicate agent response ignored:', messageId);
        return;
      }
      
      console.log('🔥 WebSocket agent_response received:', lastEvent);
      
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
          toolsExecuted
        }
      };

      // Update floating windows using functional state update to avoid stale closure
      let targetWindowForPersistence: ChatWindow | null = null;
      
      setChatWindows(prev => {
        const targetWindow = prev.find(w => w.agentId === agentId);
        console.log('🎯 Looking for target window with agentId:', agentId, 'Found:', !!targetWindow, 'Chat windows:', prev.map(w => ({ id: w.id, agentId: w.agentId, agentName: w.agentName })));
        
        if (!targetWindow) {
          return prev; // No window found, no update needed
        }

        // Store reference for persistence outside of state update
        targetWindowForPersistence = targetWindow;

        return prev.map(w => w.id === targetWindow.id ? {
          ...w,
          messages: [...w.messages, agentMessage],
          isLoading: false,
          error: null
        } : w);
      });

      // Persist agent message if session exists
      if (targetWindowForPersistence?.sessionId) {
        const persistentMessage: PersistentChatMessage = {
          id: agentMessage.id,
          content: agentMessage.content,
          sender: agentMessage.sender,
          senderName: agentMessage.senderName,
          timestamp: agentMessage.timestamp,
          agentId: agentMessage.agentId,
          messageType: agentMessage.messageType,
          confidence: agentMessage.confidence,
          memoryEnhanced: agentMessage.memoryEnhanced,
          knowledgeUsed: agentMessage.knowledgeUsed,
          toolsExecuted: agentMessage.toolsExecuted,
          metadata: agentMessage.metadata
        };
        
        chatPersistenceService.addMessage(targetWindowForPersistence.sessionId, persistentMessage).catch(error => {
          console.error('Failed to persist agent message:', error);
        });
      }

      // Update portal mode if current agent
      if (viewMode === 'portal' && agentId === selectedAgentId) {
        setPortalMessages(prev => [...prev, agentMessage]);
        setConversationHistory(prev => [...prev, { content: response, sender: agentName, timestamp: new Date().toISOString() }]);
      }
    }
  }, [lastEvent, viewMode, selectedAgentId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [portalMessages]);

  // Define openChatWindow function before it's used
  const openChatWindow = useCallback(async (agentId: string, agentName: string) => {
    // Check if chat window already exists for this agent
    if (openAgentWindows.current.has(agentId)) {
      console.log(`Chat window for agent ${agentName} (${agentId}) already exists - focusing existing window`);
      // Focus/restore existing window
      setChatWindows(prev =>
        prev.map(w => w.agentId === agentId ? { ...w, isMinimized: false } : w)
      );
      return;
    }

    console.log(`Creating new chat window for agent ${agentName} (${agentId})`);

    try {
      // Create or get existing chat session
      const session = await chatPersistenceService.createChatSession(agentId, agentName, true);
      
      // Set up conversation ID for this window
      const windowId = `chat-${Date.now()}-${agentId}`;
      setConversationIds(prev => ({ ...prev, [windowId]: session.id }));
      
      // Load existing messages
      const existingMessages = await chatPersistenceService.getMessages(session.id);
      
      // Convert persistent messages to chat messages
      const chatMessages: ChatMessage[] = existingMessages.map(msg => ({
        id: msg.id,
        content: msg.content,
        sender: msg.sender,
        senderName: msg.senderName,
        timestamp: msg.timestamp,
        agentId: msg.agentId,
        messageType: msg.messageType,
        confidence: msg.confidence,
        memoryEnhanced: msg.memoryEnhanced,
        knowledgeUsed: msg.knowledgeUsed,
        toolsExecuted: msg.toolsExecuted,
        metadata: msg.metadata
      }));

      // Create new floating chat window
      const newWindow: ChatWindow = {
        id: windowId,
        agentId,
        agentName,
        sessionId: session.id,
        discussionId: session.discussionId,
        messages: chatMessages,
        isMinimized: false,
        isLoading: false,
        error: null,
        hasLoadedHistory: true,
        totalMessages: session.messageCount,
        canLoadMore: existingMessages.length >= 50,
        mode: 'floating',
        isPersistent: session.isPersistent
      };

      // Add agent to tracking set
      openAgentWindows.current.add(agentId);
      
      setChatWindows(prev => [...prev, newWindow]);
      setCurrentMessage(prev => ({ ...prev, [newWindow.id]: '' }));

      console.log(`Opened ${session.isPersistent ? 'persistent' : 'temporary'} chat with agent:`, agentName);
    } catch (error) {
      console.error('Failed to open chat window:', error);
      
      // Fallback to non-persistent chat
      const newWindow: ChatWindow = {
        id: `chat-${Date.now()}-${agentId}`,
        agentId,
        agentName,
        messages: [],
        isMinimized: false,
        isLoading: false,
        error: 'Failed to create persistent chat session',
        hasLoadedHistory: true,
        totalMessages: 0,
        canLoadMore: false,
        mode: 'floating',
        isPersistent: false
      };

      // Add agent to tracking set (fallback case)
      openAgentWindows.current.add(agentId);
      
      setChatWindows(prev => [...prev, newWindow]);
      setCurrentMessage(prev => ({ ...prev, [newWindow.id]: '' }));
    }
  }, []); // Remove chatWindows dependency to prevent stale closures

  // Keep tracking set in sync with actual windows
  useEffect(() => {
    const currentAgentIds = new Set(chatWindows.map(w => w.agentId));
    openAgentWindows.current = currentAgentIds;
  }, [chatWindows]);

  // Define openNewChatWindow function for forced new chats
  const openNewChatWindow = useCallback(async (agentId: string, agentName: string) => {
    console.log(`Creating NEW chat window for agent ${agentName} (${agentId}) - ignoring existing sessions`);

    try {
      // Force create a new session without checking for existing ones
      const session = await chatPersistenceService.createChatSession(agentId, agentName, true, true);
      
      // Set up conversation ID for this window
      const windowId = `chat-${Date.now()}-${agentId}-new`;
      setConversationIds(prev => ({ ...prev, [windowId]: session.id }));
      
      // Create new floating chat window
      const newWindow: ChatWindow = {
        id: windowId,
        agentId,
        agentName,
        sessionId: session.id,
        discussionId: session.discussionId,
        messages: [], // Always start with empty messages for new chats
        isMinimized: false,
        isLoading: false,
        error: null,
        hasLoadedHistory: true,
        totalMessages: 0,
        canLoadMore: false,
        mode: 'floating',
        isPersistent: session.isPersistent
      };

      setChatWindows(prev => [...prev, newWindow]);
      setCurrentMessage(prev => ({ ...prev, [newWindow.id]: '' }));

      console.log(`Opened NEW ${session.isPersistent ? 'persistent' : 'temporary'} chat with agent:`, agentName);
    } catch (error) {
      console.error('Failed to create new chat window:', error);
      
      // Fallback to non-persistent chat
      const newWindow: ChatWindow = {
        id: `chat-${Date.now()}-${agentId}-new`,
        agentId,
        agentName,
        messages: [],
        isMinimized: false,
        isLoading: false,
        error: 'Failed to create persistent chat session',
        hasLoadedHistory: true,
        totalMessages: 0,
        canLoadMore: false,
        mode: 'floating',
        isPersistent: false
      };
      
      setChatWindows(prev => [...prev, newWindow]);
      setCurrentMessage(prev => ({ ...prev, [newWindow.id]: '' }));
    }
  }, []);

  // Enhanced send functions for conversation intelligence integration
  const sendFloatingMessageWithText = useCallback(async (windowId: string, messageText: string, intent?: any) => {
    const window = chatWindows.find(w => w.id === windowId);

    if (!window || !messageText?.trim() || window.isLoading) return;

    const trimmedMessage = messageText.trim();

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      content: trimmedMessage,
      sender: 'user',
      senderName: 'You',
      timestamp: new Date().toISOString(),
      messageType: MessageType.MESSAGE,
      metadata: { agentId: window.agentId, intent }
    };

    setChatWindows(prev =>
      prev.map(w => w.id === windowId ? {
        ...w,
        messages: [...w.messages, userMessage],
        isLoading: true,
        error: null
      } : w)
    );

    // Persist user message if session exists
    if (window.sessionId) {
      try {
        const persistentMessage: PersistentChatMessage = {
          id: userMessage.id,
          content: userMessage.content,
          sender: userMessage.sender,
          senderName: userMessage.senderName,
          timestamp: userMessage.timestamp,
          agentId: userMessage.agentId,
          messageType: userMessage.messageType,
          metadata: userMessage.metadata
        };
        await chatPersistenceService.addMessage(window.sessionId, persistentMessage);
      } catch (error) {
        console.error('Failed to persist user message:', error);
      }
    }

    try {
      console.log('💭 Floating chat send status:', { 
        isWebSocketConnected, 
        connectionType, 
        authStatus, 
        wsError,
        agentId: window.agentId 
      });
      
      if (isWebSocketConnected) {
        const chatMessage = {
          agentId: window.agentId,
          message: trimmedMessage,
          conversationHistory: window.messages.slice(-10).map(m => ({
            content: m.content,
            sender: m.sender === 'user' ? 'user' : m.senderName,
            timestamp: m.timestamp
          })),
          context: { intent },
          messageId: `msg-${Date.now()}`,
          timestamp: new Date().toISOString()
        };

        // Send directly as 'agent_chat' event instead of wrapped message
        sendWebSocketMessage('agent_chat', chatMessage);
        console.log('🚀 Floating chat message sent via WebSocket:', chatMessage);
      } else {
        console.log('WebSocket not connected, using direct API call for floating chat');
        
        const response = await uaipAPI.client.agents.chat(window.agentId, {
          message: trimmedMessage,
          conversationHistory: window.messages.slice(-10).map(m => ({
            content: m.content,
            sender: m.sender === 'user' ? 'user' : m.senderName,
            timestamp: m.timestamp
          })),
          context: { intent }
        });

        if (response.success && response.data) {
          const agentMessage: ChatMessage = {
            id: `msg-${Date.now()}-agent`,
            content: response.data.response,
            sender: 'agent',
            senderName: response.data.agentName || window.agentName,
            timestamp: new Date().toISOString(),
            messageType: MessageType.MESSAGE,
            confidence: response.data.confidence,
            memoryEnhanced: response.data.memoryEnhanced,
            knowledgeUsed: response.data.knowledgeUsed,
            toolsExecuted: response.data.toolsExecuted,
            agentId: window.agentId
          };

          setChatWindows(prev =>
            prev.map(w => w.id === windowId ? {
              ...w,
              messages: [...w.messages, agentMessage],
              isLoading: false,
              error: null
            } : w)
          );

          if (window.sessionId) {
            try {
              const persistentMessage: PersistentChatMessage = {
                id: agentMessage.id,
                content: agentMessage.content,
                sender: agentMessage.sender,
                senderName: agentMessage.senderName,
                timestamp: agentMessage.timestamp,
                agentId: agentMessage.agentId,
                messageType: agentMessage.messageType,
                confidence: agentMessage.confidence,
                memoryEnhanced: agentMessage.memoryEnhanced,
                knowledgeUsed: agentMessage.knowledgeUsed,
                toolsExecuted: agentMessage.toolsExecuted,
                metadata: agentMessage.metadata
              };
              await chatPersistenceService.addMessage(window.sessionId, persistentMessage);
            } catch (error) {
              console.error('Failed to persist agent message:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setChatWindows(prev =>
        prev.map(w => w.id === windowId ? {
          ...w,
          isLoading: false,
          error: 'Failed to send message. Please try again.'
        } : w)
      );
    }
  }, [chatWindows, isWebSocketConnected, sendWebSocketMessage]);

  const sendPortalMessageWithText = useCallback(async (messageText: string, intent?: any) => {
    if (!messageText?.trim() || !selectedAgentId) return;

    const trimmedMessage = messageText.trim();

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      content: trimmedMessage,
      sender: 'user',
      senderName: 'You',
      timestamp: new Date().toISOString(),
      messageType: MessageType.MESSAGE
    };

    setPortalMessages(prev => [...prev, userMessage]);
    setConversationHistory(prev => [...prev, { content: trimmedMessage, sender: 'user', timestamp: new Date().toISOString() }]);

    try {
      if (isWebSocketConnected) {
        const chatMessage = {
          type: 'agent_chat',
          payload: {
            agentId: selectedAgentId,
            message: trimmedMessage,
            conversationHistory: conversationHistory.slice(-10),
            context: { intent },
            messageId: `msg-${Date.now()}`,
            timestamp: new Date().toISOString()
          }
        };
        
        sendWebSocketMessage(chatMessage);
        console.log('Message sent via WebSocket');
      } else {
        console.log('WebSocket not connected, using direct API call');
        
        const response = await uaipAPI.client.agents.chat(selectedAgentId, {
          message: trimmedMessage,
          conversationHistory: conversationHistory.slice(-10),
          context: { intent }
        });

        if (response.success && response.data) {
          const agentMessage: ChatMessage = {
            id: `msg-${Date.now()}-agent`,
            content: response.data.response,
            sender: 'agent',
            senderName: response.data.agentName || 'Assistant',
            timestamp: new Date().toISOString(),
            messageType: MessageType.MESSAGE,
            confidence: response.data.confidence,
            memoryEnhanced: response.data.memoryEnhanced,
            knowledgeUsed: response.data.knowledgeUsed,
            toolsExecuted: response.data.toolsExecuted
          };

          setPortalMessages(prev => [...prev, agentMessage]);
          setConversationHistory(prev => [...prev, { 
            content: response.data.response, 
            sender: 'agent', 
            timestamp: new Date().toISOString() 
          }]);
        }
      }
    } catch (error) {
      console.error('Portal chat error:', error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        content: 'Sorry, I encountered an error. Please try again.',
        sender: 'system',
        senderName: 'System',
        timestamp: new Date().toISOString(),
        messageType: MessageType.MESSAGE
      };
      setPortalMessages(prev => [...prev, errorMessage]);
    }
  }, [selectedAgentId, conversationHistory, isWebSocketConnected, sendWebSocketMessage]);

  // Listen for agent chat open events
  useEffect(() => {
    const handleOpenAgentChat = (event: CustomEvent) => {
      const { agentId, agentName, sessionId } = event.detail;
      if (sessionId) {
        // Resume specific session - TODO: Implement session resumption
        openChatWindow(agentId, agentName);
      } else {
        openChatWindow(agentId, agentName);
      }
    };

    const handleOpenNewAgentChat = (event: CustomEvent) => {
      const { agentId, agentName, forceNew } = event.detail;
      if (forceNew) {
        openNewChatWindow(agentId, agentName);
      } else {
        openChatWindow(agentId, agentName);
      }
    };

    window.addEventListener('openAgentChat', handleOpenAgentChat as EventListener);
    window.addEventListener('openNewAgentChat', handleOpenNewAgentChat as EventListener);
    
    return () => {
      window.removeEventListener('openAgentChat', handleOpenAgentChat as EventListener);
      window.removeEventListener('openNewAgentChat', handleOpenNewAgentChat as EventListener);
    };
  }, [openChatWindow, openNewChatWindow]);

  // Auto-select first agent for portal mode
  useEffect(() => {
    if (viewMode === 'portal' && !selectedAgentId && agentList.length > 0) {
      setSelectedAgentId(agentList[0].id);
    }
  }, [agentList, selectedAgentId, viewMode]);

  // Clear portal conversation when agent changes
  useEffect(() => {
    if (viewMode === 'portal' && selectedAgentId) {
      setPortalMessages([]);
      setConversationHistory([]);
      // Generate new conversation ID for portal mode
      const portalConversationId = `portal-${selectedAgentId}-${Date.now()}`;
      setConversationIds(prev => ({ ...prev, portal: portalConversationId }));
    }
  }, [selectedAgentId, viewMode]);

  const closeChatWindow = useCallback((windowId: string) => {
    setChatWindows(prev => {
      const windowToClose = prev.find(w => w.id === windowId);
      if (windowToClose) {
        console.log(`Closing chat window for agent ${windowToClose.agentName} (${windowToClose.agentId})`);
        // Remove agent from tracking set when window is closed
        openAgentWindows.current.delete(windowToClose.agentId);
      }
      return prev.filter(w => w.id !== windowId);
    });
    setCurrentMessage(prev => {
      const newMessages = { ...prev };
      delete newMessages[windowId];
      return newMessages;
    });
    // Clean up conversation intelligence data
    setConversationTopics(prev => {
      const newTopics = { ...prev };
      delete newTopics[windowId];
      return newTopics;
    });
    setConversationIds(prev => {
      const newIds = { ...prev };
      delete newIds[windowId];
      return newIds;
    });
  }, []);

  const minimizeChatWindow = useCallback((windowId: string) => {
    setChatWindows(prev =>
      prev.map(w => w.id === windowId ? { ...w, isMinimized: !w.isMinimized } : w)
    );
  }, []);

  const sendFloatingMessage = useCallback(async (windowId: string) => {
    const window = chatWindows.find(w => w.id === windowId);
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
      metadata: { agentId: window.agentId }
    };

    setChatWindows(prev =>
      prev.map(w => w.id === windowId ? {
        ...w,
        messages: [...w.messages, userMessage],
        isLoading: true,
        error: null
      } : w)
    );

    setCurrentMessage(prev => ({ ...prev, [windowId]: '' }));

    // Persist user message if session exists
    if (window.sessionId) {
      try {
        const persistentMessage: PersistentChatMessage = {
          id: userMessage.id,
          content: userMessage.content,
          sender: userMessage.sender,
          senderName: userMessage.senderName,
          timestamp: userMessage.timestamp,
          agentId: userMessage.agentId,
          messageType: userMessage.messageType,
          metadata: userMessage.metadata
        };
        await chatPersistenceService.addMessage(window.sessionId, persistentMessage);
      } catch (error) {
        console.error('Failed to persist user message:', error);
      }
    }

    try {
      if (isWebSocketConnected) {
        // Try WebSocket first
        const chatMessage = {
          type: 'agent_chat',
          payload: {
            agentId: window.agentId,
            message: messageText,
            conversationHistory: window.messages.slice(-10).map(m => ({
              content: m.content,
              sender: m.sender === 'user' ? 'user' : m.senderName,
              timestamp: m.timestamp
            })),
            context: {},
            messageId: `msg-${Date.now()}`,
            timestamp: new Date().toISOString()
          }
        };

        sendWebSocketMessage(chatMessage);
        console.log('Floating chat message sent via WebSocket');
      } else {
        // Fallback to direct API call
        console.log('WebSocket not connected, using direct API call for floating chat');
        
        const response = await uaipAPI.client.agents.chat(window.agentId, {
          message: messageText,
          conversationHistory: window.messages.slice(-10).map(m => ({
            content: m.content,
            sender: m.sender === 'user' ? 'user' : m.senderName,
            timestamp: m.timestamp
          })),
          context: {}
        });

        if (response.success && response.data) {
          const agentMessage: ChatMessage = {
            id: `msg-${Date.now()}-agent`,
            content: response.data.response,
            sender: 'agent',
            senderName: response.data.agentName || window.agentName,
            timestamp: new Date().toISOString(),
            messageType: MessageType.MESSAGE,
            confidence: response.data.confidence,
            memoryEnhanced: response.data.memoryEnhanced,
            knowledgeUsed: response.data.knowledgeUsed,
            toolsExecuted: response.data.toolsExecuted,
            agentId: window.agentId
          };

          setChatWindows(prev =>
            prev.map(w => w.id === windowId ? {
              ...w,
              messages: [...w.messages, agentMessage],
              isLoading: false,
              error: null
            } : w)
          );

          // Persist agent message if session exists
          if (window.sessionId) {
            try {
              const persistentMessage: PersistentChatMessage = {
                id: agentMessage.id,
                content: agentMessage.content,
                sender: agentMessage.sender,
                senderName: agentMessage.senderName,
                timestamp: agentMessage.timestamp,
                agentId: agentMessage.agentId,
                messageType: agentMessage.messageType,
                confidence: agentMessage.confidence,
                memoryEnhanced: agentMessage.memoryEnhanced,
                knowledgeUsed: agentMessage.knowledgeUsed,
                toolsExecuted: agentMessage.toolsExecuted,
                metadata: agentMessage.metadata
              };
              await chatPersistenceService.addMessage(window.sessionId, persistentMessage);
            } catch (error) {
              console.error('Failed to persist agent message:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setChatWindows(prev =>
        prev.map(w => w.id === windowId ? {
          ...w,
          isLoading: false,
          error: 'Failed to send message. Please try again.'
        } : w)
      );
    }
  }, [chatWindows, currentMessage, isWebSocketConnected, sendWebSocketMessage]);

  const sendPortalMessage = useCallback(async () => {
    const messageText = currentMessage['portal']?.trim();
    if (!messageText || !selectedAgentId) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      content: messageText,
      sender: 'user',
      senderName: 'You',
      timestamp: new Date().toISOString(),
      messageType: MessageType.MESSAGE
    };

    setPortalMessages(prev => [...prev, userMessage]);
    setCurrentMessage(prev => ({ ...prev, portal: '' }));
    setConversationHistory(prev => [...prev, { content: messageText, sender: 'user', timestamp: new Date().toISOString() }]);

    try {
      if (isWebSocketConnected) {
        // Try WebSocket first
        const chatMessage = {
          agentId: selectedAgentId,
          message: messageText,
          conversationHistory: conversationHistory.slice(-10),
          context: {},
          messageId: `msg-${Date.now()}`,
          timestamp: new Date().toISOString()
        };
        
        sendWebSocketMessage('agent_chat', chatMessage);
        console.log('🚀 Portal message sent via WebSocket:', chatMessage);
      } else {
        // Fallback to direct API call
        console.log('WebSocket not connected, using direct API call');
        
        const response = await uaipAPI.client.agents.chat(selectedAgentId, {
          message: messageText,
          conversationHistory: conversationHistory.slice(-10),
          context: {}
        });

        if (response.success && response.data) {
          const agentMessage: ChatMessage = {
            id: `msg-${Date.now()}-agent`,
            content: response.data.response,
            sender: 'agent',
            senderName: response.data.agentName || 'Assistant',
            timestamp: new Date().toISOString(),
            messageType: MessageType.MESSAGE,
            confidence: response.data.confidence,
            memoryEnhanced: response.data.memoryEnhanced,
            knowledgeUsed: response.data.knowledgeUsed,
            toolsExecuted: response.data.toolsExecuted
          };

          setPortalMessages(prev => [...prev, agentMessage]);
          setConversationHistory(prev => [...prev, { 
            content: response.data.response, 
            sender: 'agent', 
            timestamp: new Date().toISOString() 
          }]);
        }
      }
    } catch (error) {
      console.error('Portal chat error:', error);
      // Add error message to chat
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        content: 'Sorry, I encountered an error. Please try again.',
        sender: 'system',
        senderName: 'System',
        timestamp: new Date().toISOString(),
        messageType: MessageType.MESSAGE
      };
      setPortalMessages(prev => [...prev, errorMessage]);
    }
  }, [currentMessage, selectedAgentId, conversationHistory, isWebSocketConnected, sendWebSocketMessage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent, windowId: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (windowId === 'portal') {
        sendPortalMessage();
      } else {
        sendFloatingMessage(windowId);
      }
    }
  }, [sendPortalMessage, sendFloatingMessage]);

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
    chatWindows.forEach(window => {
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
          const inputElement = document.querySelector(`#chat-input-${latestWindow.id}`) as HTMLInputElement;
          inputElement?.focus();
        }
      }
      
      // Toggle all windows minimize with Cmd+M / Ctrl+M
      if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault();
        const allMinimized = chatWindows.every(w => w.isMinimized);
        setChatWindows(prev => prev.map(w => ({ ...w, isMinimized: !allMinimized })));
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
  const analyzeMessageContext = useCallback((message: string) => {
    const sentiment = message.includes('?') ? 0.3 : message.includes('!') ? 0.8 : 0.5;
    const complexity = message.split(' ').length > 20 ? 0.8 : message.split(' ').length > 10 ? 0.6 : 0.4;
    const urgency = message.toLowerCase().includes('urgent') || message.toLowerCase().includes('asap') ? 0.9 : 0.3;
    return { sentiment, complexity, urgency };
  }, []);
  
  // Enhanced window positioning with snap-to-edge
  const calculateWindowPosition = useCallback((windowId: string, index: number) => {
    const basePosition = { x: window.innerWidth - 350, y: window.innerHeight - 450 };
    const snapMode = windowSnapMode[windowId] || 'none';
    
    if (snapMode === 'edge') {
      return { x: window.innerWidth - 350, y: 50 + (index * 30) };
    } else if (snapMode === 'corner') {
      return { x: window.innerWidth - 350, y: window.innerHeight - 450 };
    }
    
    return windowPositions[windowId] || { x: basePosition.x - (index * 20), y: basePosition.y };
  }, [windowPositions, windowSnapMode]);
  
  // Render floating windows with ultimate AI sidekick features
  const renderFloatingWindows = () => (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <AnimatePresence>
        {sortedChatWindows.map((window, index) => (
          <motion.div
            key={window.id}
            className="fixed bottom-4 right-4 w-80 h-96 bg-slate-800 rounded-lg p-4 text-white pointer-events-auto flex flex-col"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-cyan-400">{window.agentName}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => minimizeChatWindow(window.id)}
                  className="p-1 hover:bg-slate-700 rounded"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => closeChatWindow(window.id)}
                  className="p-1 hover:bg-slate-700 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!window.isMinimized && (
              <>
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto mb-4 space-y-2">
                  {window.messages.length === 0 ? (
                    <div className="text-center text-slate-400 text-sm py-8">
                      Start a conversation...
                    </div>
                  ) : (
                    window.messages.map((msg, idx) => (
                      <div key={msg.id || `msg-${idx}-${msg.timestamp || Date.now()}`} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-2 rounded-lg text-sm ${
                          msg.sender === 'user' 
                            ? 'bg-cyan-600 text-white' 
                            : 'bg-slate-700 text-slate-200'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Input Area */}
                <SmartInputField
                  agentId={window.agentId}
                  conversationId={window.sessionId}
                  placeholder="Type a message..."
                  onSubmit={(text, intent) => {
                    sendFloatingMessageWithText(window.id, text, intent);
                  }}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 text-sm"
                />
              </>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );


  // Render portal mode
  const renderPortalMode = () => (
    <div className={`flex flex-col h-full space-y-6 ${className}`}>
      {/* Chat Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden bg-gradient-to-br from-slate-900/60 via-blue-900/30 to-purple-900/20 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/20"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div
              className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(59, 130, 246, 0.3)',
                  '0 0 30px rgba(6, 182, 212, 0.4)',
                  '0 0 20px rgba(59, 130, 246, 0.3)'
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <MessageSquare className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <div className="flex items-center gap-3">
                <ConversationTopicDisplay
                  conversationId={conversationIds['portal'] || ''}
                  agentId={selectedAgentId}
                  initialTopic={conversationTopics['portal'] || (selectedAgent ? `Chat with ${selectedAgent.name}` : 'Agent Chat')}
                  onTopicChange={(newTopic) => {
                    setConversationTopics(prev => ({ ...prev, portal: newTopic }));
                  }}
                  className="text-xl font-bold text-white"
                />
              </div>
              <div className="flex items-center gap-3">
                <p className="text-slate-300">
                  {selectedAgent ? `Chatting with ${selectedAgent.name}` : 'Select an agent to start chatting'}
                </p>
                <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span className={`text-xs ${isWebSocketConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isWebSocketConnected ? 'Real-time' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {portalMessages.length > 0 && (
              <DiscussionTrigger
                trigger={
                  <button
                    className="px-4 py-2 text-sm bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 rounded-xl border border-cyan-500/30 hover:from-cyan-500/30 hover:to-blue-500/30 transition-all flex items-center gap-2 hover:scale-105 active:scale-95"
                  >
                    <Users className="w-4 h-4" />
                    Discuss
                  </button>
                }
                contextType="chat"
                contextData={{
                  chatHistory: portalMessages.map(msg => ({
                    content: msg.content,
                    sender: msg.sender,
                    timestamp: msg.timestamp
                  })),
                  topic: selectedAgent ? `Chat with ${selectedAgent.name}` : 'Agent Chat Discussion'
                }}
                preselectedAgents={selectedAgentId ? [selectedAgentId] : []}
              />
            )}
            {portalMessages.length > 0 && (
              <button
                onClick={clearPortalConversation}
                className="px-4 py-2 text-sm bg-red-500/20 text-red-400 rounded-xl border border-red-500/30 hover:bg-red-500/30 transition-colors hover:scale-105 active:scale-95"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setViewMode(viewMode === 'floating' ? 'portal' : 'floating')}
              className="px-4 py-2 text-sm bg-slate-700/50 text-slate-300 rounded-xl border border-slate-600/30 hover:bg-slate-600/50 transition-colors flex items-center gap-2 hover:scale-105 active:scale-95"
            >
              {viewMode === 'floating' ? <LayoutGrid className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              {viewMode === 'floating' ? 'Portal' : 'Float'}
            </button>
          </div>
        </div>

        {/* Agent Selector */}
        {agentList.length > 0 && (
          <div className="mt-6">
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-600/30 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-all duration-300 hover:scale-[1.01] focus:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.6), rgba(30, 58, 138, 0.3))'
              }}
            >
              <option value="">Select an agent...</option>
              {agentList.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Agent Capabilities Display */}
        {selectedAgent && (
          <motion.div
            className="mt-4 p-4 bg-slate-800/30 border border-slate-700/30 rounded-xl"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-300">Agent Capabilities</h4>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-400">Enhanced</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {selectedAgent.capabilities?.slice(0, 6).map((capability, index) => (
                <motion.span
                  key={`${selectedAgent.id}-capability-${capability}-${index}`}
                  className="text-xs px-3 py-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-300 rounded-lg border border-blue-500/30"
                  whileHover={{ scale: 1.05 }}
                >
                  {capability}
                </motion.span>
              ))}
              {selectedAgent.capabilities && selectedAgent.capabilities.length > 6 && (
                <span className="text-xs px-3 py-1 bg-slate-600/50 text-slate-400 rounded-lg border border-slate-500/30">
                  +{selectedAgent.capabilities.length - 6} more
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                <span className="text-slate-400">Knowledge</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400" />
                <span className="text-slate-400">Tools</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-cyan-400" />
                <span className="text-slate-400">Memory</span>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Chat Messages */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 relative overflow-hidden bg-gradient-to-br from-slate-900/60 via-blue-900/30 to-purple-900/20 backdrop-blur-xl rounded-2xl border border-cyan-500/20"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5" />
        <div className="relative h-full flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(59, 130, 246, 0.3) transparent' }}>
            <AnimatePresence>
              {portalMessages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center h-32"
                >
                  <div className="text-center">
                    <motion.div
                      className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center"
                      animate={{
                        rotate: [0, 5, -5, 0],
                        scale: [1, 1.05, 1]
                      }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      <Bot className="w-8 h-8 text-slate-400" />
                    </motion.div>
                    <p className="text-slate-400 text-lg">
                      {selectedAgent ? `Start a conversation with ${selectedAgent.name}` : 'Select an agent to begin chatting'}
                    </p>
                  </div>
                </motion.div>
              )}

              {portalMessages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: index * 0.05,
                    type: "spring",
                    stiffness: 200
                  }}
                  className={`flex gap-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.sender !== 'user' && (
                    <motion.div
                      className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                    >
                      <Bot className="w-5 h-5 text-white" />
                    </motion.div>
                  )}

                  <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-1' : ''}`}>
                    <motion.div
                      className={`relative overflow-hidden rounded-2xl ${message.sender === 'user'
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white ml-auto'
                        : 'bg-slate-800/50 text-white border border-slate-600/30'
                        }`}
                      whileHover={{ scale: 1.01, y: -1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <div className="p-4">
                        <p className="text-sm leading-relaxed">{message.content}</p>

                        {/* Agent message metadata */}
                        {message.sender !== 'user' && (
                          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-600/30 text-xs text-slate-400">
                            {message.confidence && (
                              <div className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>{Math.round(message.confidence * 100)}%</span>
                              </div>
                            )}
                            {message.memoryEnhanced && (
                              <div className="flex items-center gap-1">
                                <Brain className="w-3 h-3 text-purple-400" />
                                <span>Memory</span>
                              </div>
                            )}
                            {message.knowledgeUsed && message.knowledgeUsed > 0 && (
                              <div className="flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-yellow-400" />
                                <span>{message.knowledgeUsed} KB</span>
                              </div>
                            )}
                            {message.toolsExecuted && message.toolsExecuted.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Zap className="w-3 h-3 text-cyan-400" />
                                <span>{message.toolsExecuted.length} tools</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Tool Execution Results */}
                        {message.sender !== 'user' && message.toolsExecuted && message.toolsExecuted.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-600/30">
                            <div className="text-xs text-slate-400 mb-2">Tools Executed:</div>
                            <div className="space-y-2">
                              {message.toolsExecuted.map((tool, toolIndex) => (
                                <motion.div
                                  key={`${tool.name || 'tool'}-${toolIndex}-${tool.timestamp || Date.now()}`}
                                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${tool.success
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    }`}
                                  whileHover={{ scale: 1.02 }}
                                >
                                  <Zap className="w-3 h-3" />
                                  <span className="font-medium">{tool.toolName}</span>
                                  {tool.success ? (
                                    <CheckCircle2 className="w-3 h-3" />
                                  ) : (
                                    <AlertCircle className="w-3 h-3" />
                                  )}
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>

                    <div className="text-xs text-slate-500 mt-2 px-4">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>

                  {message.sender === 'user' && (
                    <motion.div
                      className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center flex-shrink-0"
                      whileHover={{ scale: 1.1, rotate: -5 }}
                    >
                      <User className="w-5 h-5 text-white" />
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <motion.div
            className="p-6 border-t border-cyan-500/20 bg-gradient-to-r from-slate-800/60 to-blue-900/30 backdrop-blur-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {/* Prompt Suggestions */}
            <div className="mb-4">
              <PromptSuggestions
                agentId={selectedAgentId}
                conversationContext={{
                  currentTopic: conversationTopics['portal'] || (selectedAgent ? `Chat with ${selectedAgent.name}` : 'Agent Chat'),
                  recentMessages: portalMessages.slice(-5).map(msg => ({
                    content: msg.content,
                    role: msg.sender === 'user' ? 'user' : 'assistant',
                    timestamp: new Date(msg.timestamp)
                  }))
                }}
                onSelectPrompt={(prompt) => {
                  // Auto-submit the selected prompt
                  sendPortalMessageWithText(prompt);
                }}
                className="mb-2"
              />
            </div>
            
            <div className="flex gap-4 items-end">
              <SmartInputField
                agentId={selectedAgentId}
                conversationId={conversationIds['portal']}
                placeholder={selectedAgent ? `Message ${selectedAgent.name}...` : "Select an agent first..."}
                onSubmit={(text, intent) => {
                  // Use a custom sendMessage function that handles the smart input properly
                  sendPortalMessageWithText(text, intent);
                }}
                className="w-full bg-slate-800/50 border border-slate-600/30 rounded-xl px-4 py-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-[1.01] focus:scale-[1.02]"
              />
            </div>
          </motion.div>
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