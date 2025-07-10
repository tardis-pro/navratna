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
  const [windowSizes, setWindowSizes] = useState<{ [windowId: string]: { width: number; height: number } }>({});
  const [windowSnapMode, setWindowSnapMode] = useState<{ [windowId: string]: 'none' | 'edge' | 'corner' }>({});
  const [thinkingParticles, setThinkingParticles] = useState<{ [windowId: string]: boolean }>({});
  const [confidenceMetrics, setConfidenceMetrics] = useState<{ [windowId: string]: number }>({});
  const [knowledgeSources, setKnowledgeSources] = useState<{ [windowId: string]: string[] }>({});
  const [toolExecutionProgress, setToolExecutionProgress] = useState<{ [windowId: string]: Array<{ toolName: string; progress: number; status: 'running' | 'completed' | 'failed' }> }>({});
  const [memoryEnhancementBadges, setMemoryEnhancementBadges] = useState<{ [windowId: string]: boolean }>({});
  const [quickActionsPanelOpen, setQuickActionsPanelOpen] = useState<{ [windowId: string]: boolean }>({});
  const [contextualSuggestions, setContextualSuggestions] = useState<{ [windowId: string]: string[] }>({});
  const [isResizing, setIsResizing] = useState<{ [windowId: string]: boolean }>({});
  const [isDragging, setIsDragging] = useState<{ [windowId: string]: boolean }>({});
  const [focusedWindow, setFocusedWindow] = useState<string | null>(null);
  const [loadingStates, setLoadingStates] = useState<{ [windowId: string]: { isLoading: boolean; loadingText?: string; progress?: number } }>({});
  const [typingIndicators, setTypingIndicators] = useState<{ [windowId: string]: boolean }>({});
  
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
  const resizingRef = useRef<{ windowId: string; startSize: { width: number; height: number }; startMouse: { x: number; y: number } } | null>(null);
  const keyboardShortcutsRef = useRef<{ [key: string]: () => void }>({});
  const contextualAnalysisRef = useRef<{ [windowId: string]: { sentiment: number; complexity: number; urgency: number } }>({});
  const loadingTimeouts = useRef<{ [windowId: string]: NodeJS.Timeout }>({});

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

        // Clear loading states for floating window
        if (loadingTimeouts.current[targetWindow.id]) {
          clearInterval(loadingTimeouts.current[targetWindow.id]);
          delete loadingTimeouts.current[targetWindow.id];
        }
        setLoadingStates(prevLoadingStates => {
          const newStates = { ...prevLoadingStates };
          delete newStates[targetWindow.id];
          return newStates;
        });
        setTypingIndicators(prevTyping => ({ ...prevTyping, [targetWindow.id]: false }));

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
        
        // Clear loading states for portal mode
        const portalWindowId = 'portal';
        if (loadingTimeouts.current[portalWindowId]) {
          clearInterval(loadingTimeouts.current[portalWindowId]);
          delete loadingTimeouts.current[portalWindowId];
        }
        setLoadingStates(prev => {
          const newStates = { ...prev };
          delete newStates[portalWindowId];
          return newStates;
        });
        setTypingIndicators(prev => ({ ...prev, [portalWindowId]: false }));
      }
    }
  }, [lastEvent, viewMode, selectedAgentId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [portalMessages]);

  // Define openChatWindowWithSession function for resuming specific sessions
  const openChatWindowWithSession = useCallback(async (agentId: string, agentName: string, sessionId: string) => {
    // Check if chat window already exists for this specific session
    const existingWindow = chatWindows.find(w => w.sessionId === sessionId);
    if (existingWindow) {
      console.log(`Chat window for session ${sessionId} already exists - focusing existing window`);
      // Focus/restore existing window
      setChatWindows(prev =>
        prev.map(w => w.sessionId === sessionId ? { ...w, isMinimized: false } : w)
      );
      return;
    }

    console.log(`Opening existing chat session ${sessionId} with agent ${agentName} (${agentId})`);

    try {
      // Get the existing session
      const session = chatPersistenceService.getChatSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Set up conversation ID for this window
      const windowId = `chat-${Date.now()}-${agentId}`;
      setConversationIds(prev => ({ ...prev, [windowId]: session.id }));
      
      // Load existing messages from the specific session
      const existingMessages = await chatPersistenceService.getMessages(sessionId);
      
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

      // Create new floating chat window with existing session data
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

      // Note: Not adding to agent tracking set since this is a specific session
      
      setChatWindows(prev => [...prev, newWindow]);
      setCurrentMessage(prev => ({ ...prev, [newWindow.id]: '' }));
      
      // Set initial window size
      setWindowSizes(prev => ({ 
        ...prev, 
        [newWindow.id]: { width: 320, height: 400 } 
      }));

      console.log(`Resumed ${session.isPersistent ? 'persistent' : 'temporary'} chat session with agent:`, agentName, `(${chatMessages.length} messages loaded)`);
    } catch (error) {
      console.error('Failed to open chat session:', error);
      
      // Fallback to creating a new chat window
      console.log('Falling back to new chat window...');
      openChatWindow(agentId, agentName);
    }
  }, [chatWindows]);

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
      
      // Set initial window size
      setWindowSizes(prev => ({ 
        ...prev, 
        [newWindow.id]: { width: 320, height: 400 } 
      }));

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
      
      // Set initial window size
      setWindowSizes(prev => ({ 
        ...prev, 
        [newWindow.id]: { width: 320, height: 400 } 
      }));
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
      
      // Set initial window size
      setWindowSizes(prev => ({ 
        ...prev, 
        [newWindow.id]: { width: 320, height: 400 } 
      }));

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
      
      // Set initial window size
      setWindowSizes(prev => ({ 
        ...prev, 
        [newWindow.id]: { width: 320, height: 400 } 
      }));
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
    
    // Set loading state with typing indicator
    setLoadingStates(prev => ({
      ...prev,
      [windowId]: { 
        isLoading: true, 
        loadingText: 'Agent is thinking...', 
        progress: 0 
      }
    }));
    setTypingIndicators(prev => ({ ...prev, [windowId]: true }));
    
    // Simulate progress updates
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 25;
      if (progress < 90) {
        setLoadingStates(prev => ({
          ...prev,
          [windowId]: { 
            ...prev[windowId],
            progress: Math.min(progress, 90)
          }
        }));
      }
    }, 200);
    
    // Store interval for cleanup
    if (loadingTimeouts.current[windowId]) {
      clearInterval(loadingTimeouts.current[windowId]);
    }
    loadingTimeouts.current[windowId] = progressInterval;

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
          
          // Clear loading states
          if (loadingTimeouts.current[windowId]) {
            clearInterval(loadingTimeouts.current[windowId]);
            delete loadingTimeouts.current[windowId];
          }
          setLoadingStates(prev => {
            const newStates = { ...prev };
            delete newStates[windowId];
            return newStates;
          });
          setTypingIndicators(prev => ({ ...prev, [windowId]: false }));

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
      
      // Clear loading states on error
      if (loadingTimeouts.current[windowId]) {
        clearInterval(loadingTimeouts.current[windowId]);
        delete loadingTimeouts.current[windowId];
      }
      setLoadingStates(prev => {
        const newStates = { ...prev };
        delete newStates[windowId];
        return newStates;
      });
      setTypingIndicators(prev => ({ ...prev, [windowId]: false }));
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
    
    // Set loading state for portal mode
    const portalWindowId = 'portal';
    setLoadingStates(prev => ({
      ...prev,
      [portalWindowId]: { 
        isLoading: true, 
        loadingText: 'Agent is thinking...', 
        progress: 0 
      }
    }));
    setTypingIndicators(prev => ({ ...prev, [portalWindowId]: true }));
    
    // Simulate progress updates
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 25;
      if (progress < 90) {
        setLoadingStates(prev => ({
          ...prev,
          [portalWindowId]: { 
            ...prev[portalWindowId],
            progress: Math.min(progress, 90)
          }
        }));
      }
    }, 200);
    
    // Store interval for cleanup
    if (loadingTimeouts.current[portalWindowId]) {
      clearInterval(loadingTimeouts.current[portalWindowId]);
    }
    loadingTimeouts.current[portalWindowId] = progressInterval;

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
          
          // Clear loading states for direct API response
          if (loadingTimeouts.current[portalWindowId]) {
            clearInterval(loadingTimeouts.current[portalWindowId]);
            delete loadingTimeouts.current[portalWindowId];
          }
          setLoadingStates(prev => {
            const newStates = { ...prev };
            delete newStates[portalWindowId];
            return newStates;
          });
          setTypingIndicators(prev => ({ ...prev, [portalWindowId]: false }));
        }
      }
    } catch (error) {
      console.error('Portal chat error:', error);
      
      // Clear loading states on error
      if (loadingTimeouts.current[portalWindowId]) {
        clearInterval(loadingTimeouts.current[portalWindowId]);
        delete loadingTimeouts.current[portalWindowId];
      }
      setLoadingStates(prev => {
        const newStates = { ...prev };
        delete newStates[portalWindowId];
        return newStates;
      });
      setTypingIndicators(prev => ({ ...prev, [portalWindowId]: false }));
      
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
        // Resume specific session
        openChatWindowWithSession(agentId, agentName, sessionId);
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
  }, [openChatWindow, openChatWindowWithSession, openNewChatWindow]);

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
    
    // Clean up window-specific state
    setWindowPositions(prev => {
      const newPositions = { ...prev };
      delete newPositions[windowId];
      return newPositions;
    });
    setWindowSizes(prev => {
      const newSizes = { ...prev };
      delete newSizes[windowId];
      return newSizes;
    });
    setLoadingStates(prev => {
      const newStates = { ...prev };
      delete newStates[windowId];
      return newStates;
    });
    setTypingIndicators(prev => {
      const newIndicators = { ...prev };
      delete newIndicators[windowId];
      return newIndicators;
    });
    setIsDragging(prev => {
      const newDragging = { ...prev };
      delete newDragging[windowId];
      return newDragging;
    });
    setIsResizing(prev => {
      const newResizing = { ...prev };
      delete newResizing[windowId];
      return newResizing;
    });
    
    // Clear any ongoing loading timeouts
    if (loadingTimeouts.current[windowId]) {
      clearInterval(loadingTimeouts.current[windowId]);
      delete loadingTimeouts.current[windowId];
    }
    
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
    
    // Set loading state for portal mode
    const portalWindowId = 'portal';
    setLoadingStates(prev => ({
      ...prev,
      [portalWindowId]: { 
        isLoading: true, 
        loadingText: 'Agent is thinking...', 
        progress: 0 
      }
    }));
    setTypingIndicators(prev => ({ ...prev, [portalWindowId]: true }));

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
          
          // Clear loading states for direct API response
          setLoadingStates(prev => {
            const newStates = { ...prev };
            delete newStates[portalWindowId];
            return newStates;
          });
          setTypingIndicators(prev => ({ ...prev, [portalWindowId]: false }));
        }
      }
    } catch (error) {
      console.error('Portal chat error:', error);
      
      // Clear loading states on error
      setLoadingStates(prev => {
        const newStates = { ...prev };
        delete newStates[portalWindowId];
        return newStates;
      });
      setTypingIndicators(prev => ({ ...prev, [portalWindowId]: false }));
      
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
  
  // Enhanced window positioning with smart cascade and collision detection
  const calculateWindowPosition = useCallback((windowId: string, index: number) => {
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
        y: 50 + (index * (titleBarHeight + 10)) 
      };
    } else if (snapMode === 'corner') {
      return { 
        x: window.innerWidth - windowWidth - padding, 
        y: window.innerHeight - windowHeight - padding 
      };
    }
    
    // Smart cascade positioning to avoid overlap
    const cascadeOffset = 30;
    const baseX = window.innerWidth - windowWidth - padding;
    const baseY = window.innerHeight - windowHeight - padding;
    
    // Calculate position based on existing windows to avoid collision
    let proposedX = baseX - (index * cascadeOffset);
    let proposedY = baseY - (index * cascadeOffset);
    
    // Ensure window stays within viewport
    proposedX = Math.max(padding, Math.min(proposedX, window.innerWidth - windowWidth - padding));
    proposedY = Math.max(padding + titleBarHeight, Math.min(proposedY, window.innerHeight - windowHeight - padding));
    
    return { x: proposedX, y: proposedY };
  }, [windowPositions, windowSizes, windowSnapMode]);
  
  // Mouse event handlers for dragging and resizing
  const handleMouseDown = useCallback((e: React.MouseEvent, windowId: string, action: 'drag' | 'resize') => {
    e.preventDefault();
    const windowElement = windowRefs.current[windowId];
    if (!windowElement) return;

    const rect = windowElement.getBoundingClientRect();
    
    if (action === 'drag') {
      setIsDragging(prev => ({ ...prev, [windowId]: true }));
      draggingRef.current = {
        windowId,
        offset: { x: e.clientX - rect.left, y: e.clientY - rect.top }
      };
    } else if (action === 'resize') {
      setIsResizing(prev => ({ ...prev, [windowId]: true }));
      resizingRef.current = {
        windowId,
        startSize: { width: rect.width, height: rect.height },
        startMouse: { x: e.clientX, y: e.clientY }
      };
    }
    
    setFocusedWindow(windowId);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingRef.current) {
      const { windowId, offset } = draggingRef.current;
      const newPosition = {
        x: e.clientX - offset.x,
        y: e.clientY - offset.y
      };
      
      // Constrain to viewport
      const windowWidth = windowSizes[windowId]?.width || 320;
      const windowHeight = windowSizes[windowId]?.height || 400;
      newPosition.x = Math.max(0, Math.min(newPosition.x, window.innerWidth - windowWidth));
      newPosition.y = Math.max(0, Math.min(newPosition.y, window.innerHeight - windowHeight));
      
      setWindowPositions(prev => ({ ...prev, [windowId]: newPosition }));
    }
    
    if (resizingRef.current) {
      const { windowId, startSize, startMouse } = resizingRef.current;
      const deltaX = e.clientX - startMouse.x;
      const deltaY = e.clientY - startMouse.y;
      
      const newSize = {
        width: Math.max(280, Math.min(startSize.width + deltaX, window.innerWidth * 0.8)),
        height: Math.max(300, Math.min(startSize.height + deltaY, window.innerHeight * 0.8))
      };
      
      setWindowSizes(prev => ({ ...prev, [windowId]: newSize }));
    }
  }, [windowSizes]);

  const handleMouseUp = useCallback(() => {
    if (draggingRef.current) {
      const windowId = draggingRef.current.windowId;
      setIsDragging(prev => ({ ...prev, [windowId]: false }));
      draggingRef.current = null;
    }
    
    if (resizingRef.current) {
      const windowId = resizingRef.current.windowId;
      setIsResizing(prev => ({ ...prev, [windowId]: false }));
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

  // Typing indicator component
  const TypingIndicator: React.FC<{ windowId: string }> = ({ windowId }) => {
    const isTyping = typingIndicators[windowId] || false;
    const loadingState = loadingStates[windowId];
    
    if (!isTyping && !loadingState?.isLoading) return null;
    
    const handleCancel = () => {
      // Clear loading states
      if (loadingTimeouts.current[windowId]) {
        clearInterval(loadingTimeouts.current[windowId]);
        delete loadingTimeouts.current[windowId];
      }
      setLoadingStates(prev => {
        const newStates = { ...prev };
        delete newStates[windowId];
        return newStates;
      });
      setTypingIndicators(prev => ({ ...prev, [windowId]: false }));
    };
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg border border-slate-600/30 mb-2"
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-cyan-400 rounded-full"
              animate={{
                y: [0, -8, 0],
                opacity: [0.4, 1, 0.4]
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>
        <span className="text-xs text-slate-400 flex-1">
          {loadingState?.loadingText || 'Agent is typing...'}
        </span>
        {loadingState?.progress && loadingState.progress > 0 && (
          <div className="flex-1 bg-slate-600 rounded-full h-1 ml-2">
            <motion.div
              className="bg-cyan-400 h-1 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${loadingState.progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}
        <button
          onClick={handleCancel}
          className="ml-2 p-1 hover:bg-slate-600/50 rounded text-slate-400 hover:text-white transition-colors"
          title="Cancel"
        >
          <X className="w-3 h-3" />
        </button>
      </motion.div>
    );
  };

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
          
          return (
            <motion.div
              key={window.id}
              ref={(el) => { windowRefs.current[window.id] = el; }}
              className={`fixed bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-slate-800/95 
                         backdrop-blur-xl rounded-xl border border-slate-600/30 text-white pointer-events-auto 
                         flex flex-col shadow-2xl shadow-black/50 overflow-hidden
                         ${focusedWindow === window.id ? 'ring-2 ring-cyan-500/50 z-10' : 'z-0'}
                         ${isDrag ? 'cursor-grabbing scale-105' : 'cursor-default'}
                         ${isResize ? 'select-none' : ''}`}
              style={{
                left: position.x,
                top: position.y,
                width: size.width,
                height: window.isMinimized ? 'auto' : size.height,
                zIndex: focusedWindow === window.id ? 60 : 50
              }}
              initial={{ 
                opacity: 0, 
                scale: 0.8,
                y: 100,
                rotateX: -15
              }}
              animate={{ 
                opacity: 1, 
                scale: isDrag ? 1.05 : isResize ? 1.02 : 1,
                y: 0,
                rotateX: 0
              }}
              exit={{ 
                opacity: 0, 
                scale: 0.8,
                y: 100,
                rotateX: 15
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30
              }}
              whileHover={{ 
                scale: isDrag || isResize ? undefined : 1.01,
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)"
              }}
              onClick={() => setFocusedWindow(window.id)}
            >
              {/* Animated background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 opacity-50" />
              
              {/* Chat Header */}
              <div 
                className="relative flex items-center justify-between p-4 bg-gradient-to-r from-slate-700/50 to-slate-800/50 border-b border-slate-600/30 cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => handleMouseDown(e, window.id, 'drag')}
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center"
                    animate={{
                      boxShadow: isLoading ? [
                        '0 0 10px rgba(6, 182, 212, 0.5)',
                        '0 0 20px rgba(6, 182, 212, 0.8)',
                        '0 0 10px rgba(6, 182, 212, 0.5)'
                      ] : '0 0 10px rgba(6, 182, 212, 0.3)'
                    }}
                    transition={{
                      duration: 2,
                      repeat: isLoading ? Infinity : 0
                    }}
                  >
                    <Bot className="w-4 h-4 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">{window.agentName}</h3>
                    <div className="flex items-center gap-2 text-xs">
                      <div className={`w-1.5 h-1.5 rounded-full ${window.isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
                      <span className="text-slate-400">
                        {window.isLoading ? 'Processing...' : 'Online'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      minimizeChatWindow(window.id);
                    }}
                    className="p-1.5 hover:bg-slate-600/50 rounded-md transition-colors group"
                    title="Minimize"
                  >
                    <Minimize2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeChatWindow(window.id);
                    }}
                    className="p-1.5 hover:bg-red-500/20 rounded-md transition-colors group"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-400" />
                  </button>
                </div>
              </div>

              {!window.isMinimized && (
                <>
                  {/* Messages Area */}
                  <div 
                    id={`messages-${window.id}`}
                    className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
                    style={{ 
                      scrollbarWidth: 'thin', 
                      scrollbarColor: 'rgba(59, 130, 246, 0.3) transparent' 
                    }}
                  >
                    <AnimatePresence>
                      {window.messages.length === 0 ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-center text-slate-400 text-sm py-8"
                        >
                          <motion.div
                            className="w-12 h-12 mx-auto mb-3 bg-slate-700/50 rounded-full flex items-center justify-center"
                            animate={{ 
                              rotate: [0, 10, -10, 0],
                              scale: [1, 1.1, 1]
                            }}
                            transition={{
                              duration: 4,
                              repeat: Infinity,
                              ease: "easeInOut"
                            }}
                          >
                            <MessageSquare className="w-6 h-6 text-slate-500" />
                          </motion.div>
                          <p>Start a conversation...</p>
                        </motion.div>
                      ) : (
                        window.messages.map((msg, idx) => (
                          <motion.div 
                            key={msg.id || `msg-${idx}-${msg.timestamp || Date.now()}`}
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ 
                              delay: idx * 0.03,
                              type: "spring",
                              stiffness: 400,
                              damping: 25
                            }}
                            className={`flex items-start gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            {msg.sender !== 'user' && (
                              <motion.div 
                                className="w-6 h-6 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                                whileHover={{ scale: 1.1, rotate: 5 }}
                              >
                                <Bot className="w-3 h-3 text-white" />
                              </motion.div>
                            )}
                            
                            <motion.div 
                              className={`max-w-[75%] p-3 rounded-xl text-sm leading-relaxed ${
                                msg.sender === 'user' 
                                  ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white' 
                                  : 'bg-slate-700/80 text-slate-100 border border-slate-600/50'
                              }`}
                              whileHover={{ 
                                scale: 1.02,
                                boxShadow: msg.sender === 'user' 
                                  ? '0 8px 25px rgba(6, 182, 212, 0.3)'
                                  : '0 8px 25px rgba(0, 0, 0, 0.3)'
                              }}
                            >
                              <p>{msg.content}</p>
                              
                              {/* Message metadata for agent responses */}
                              {msg.sender !== 'user' && (msg.confidence || msg.memoryEnhanced || msg.knowledgeUsed || msg.toolsExecuted?.length) && (
                                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-600/30 text-xs">
                                  {msg.confidence && (
                                    <div className="flex items-center gap-1 text-emerald-400">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>{Math.round(msg.confidence * 100)}%</span>
                                    </div>
                                  )}
                                  {msg.memoryEnhanced && (
                                    <div className="flex items-center gap-1 text-purple-400">
                                      <Brain className="w-3 h-3" />
                                      <span>Memory</span>
                                    </div>
                                  )}
                                  {msg.knowledgeUsed && msg.knowledgeUsed > 0 && (
                                    <div className="flex items-center gap-1 text-yellow-400">
                                      <Sparkles className="w-3 h-3" />
                                      <span>{msg.knowledgeUsed} KB</span>
                                    </div>
                                  )}
                                  {msg.toolsExecuted && msg.toolsExecuted.length > 0 && (
                                    <div className="flex items-center gap-1 text-cyan-400">
                                      <Zap className="w-3 h-3" />
                                      <span>{msg.toolsExecuted.length} tools</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </motion.div>
                            
                            {msg.sender === 'user' && (
                              <motion.div 
                                className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                                whileHover={{ scale: 1.1, rotate: -5 }}
                              >
                                <User className="w-3 h-3 text-white" />
                              </motion.div>
                            )}
                          </motion.div>
                        ))
                      )}
                    </AnimatePresence>
                    
                    {/* Typing Indicator */}
                    <TypingIndicator windowId={window.id} />
                  </div>

                  {/* Input Area */}
                  <div className="p-4 border-t border-slate-600/30 bg-gradient-to-r from-slate-800/50 to-slate-700/50">
                    <SmartInputField
                      agentId={window.agentId}
                      conversationId={window.sessionId}
                      placeholder="Type a message..."
                      onSubmit={(text, intent) => {
                        sendFloatingMessageWithText(window.id, text, intent);
                      }}
                      disabled={isLoading}
                      className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    />
                    
                    {window.error && (
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

                  {/* Resize Handle */}
                  <div
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-50 hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleMouseDown(e, window.id, 'resize')}
                  >
                    <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-slate-400" />
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
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
            
            {/* Typing Indicator for Portal Mode */}
            <TypingIndicator windowId="portal" />

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