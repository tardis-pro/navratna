import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { uaipAPI } from '../../../utils/uaip-api';
import { useWebSocket } from '../../../hooks/useUAIP';
import { 
  MessageSquare, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  X,
  Minimize2,
  Maximize2,
  Plus
} from 'lucide-react';
import { Discussion, CreateDiscussionRequest, DiscussionMessage, MessageType } from '@uaip/types';

interface ChatWindow {
  id: string;
  agentId: string;
  agentName: string;
  discussionId?: string;
  messages: ChatMessage[];
  isMinimized: boolean;
  isLoading: boolean;
  error: string | null;
  hasLoadedHistory: boolean;
  totalMessages: number;
  canLoadMore: boolean;
}

interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'agent';
  senderName: string;
  timestamp: string;
  agentId?: string;
  messageType?: MessageType;
  metadata?: Record<string, any>;
}

interface MultiChatManagerProps {
  className?: string;
}

export const MultiChatManager: React.FC<MultiChatManagerProps> = ({ className }) => {
  const { agents } = useAgents();
  const { isConnected: isWebSocketConnected, sendMessage: sendWebSocketMessage, lastEvent } = useWebSocket();
  const [chatWindows, setChatWindows] = useState<ChatWindow[]>([]);
  const [currentMessage, setCurrentMessage] = useState<{ [windowId: string]: string }>({});

  // Listen for agent chat open events
  useEffect(() => {
    const handleOpenAgentChat = (event: CustomEvent) => {
      const { agentId, agentName, persona } = event.detail;
      openChatWindow(agentId, agentName);
    };

    window.addEventListener('openAgentChat', handleOpenAgentChat as EventListener);
    return () => {
      window.removeEventListener('openAgentChat', handleOpenAgentChat as EventListener);
    };
  }, []);

  // Listen for WebSocket agent responses
  useEffect(() => {
    if (lastEvent && lastEvent.type === 'agent_response') {
      const { agentId, response, agentName, confidence, memoryEnhanced, knowledgeUsed, toolsExecuted } = lastEvent.payload;
      
      // Find the chat window for this agent
      const targetWindow = chatWindows.find(w => w.agentId === agentId);
      if (targetWindow) {
        const agentMessage: ChatMessage = {
          id: `msg-${Date.now()}-agent`,
          content: response,
          sender: 'agent',
          senderName: agentName,
          timestamp: new Date().toISOString(),
          agentId: agentId,
          messageType: MessageType.MESSAGE,
          metadata: {
            confidence,
            memoryEnhanced,
            knowledgeUsed,
            toolsExecuted
          }
        };

        setChatWindows(prev => 
          prev.map(w => w.id === targetWindow.id ? { 
            ...w, 
            messages: [...w.messages, agentMessage],
            isLoading: false,
            error: null
          } : w)
        );
      }
    }
  }, [lastEvent, chatWindows]);


  const openChatWindow = useCallback(async (agentId: string, agentName: string) => {
    // Check if chat window already exists
    const existingWindow = chatWindows.find(w => w.agentId === agentId);
    if (existingWindow) {
      // Unminimize if minimized
      setChatWindows(prev => 
        prev.map(w => w.id === existingWindow.id ? { ...w, isMinimized: false } : w)
      );
      return;
    }

    // Create direct chat window (no discussion orchestration needed for 1-on-1 chats)
    const newWindow: ChatWindow = {
      id: `chat-${Date.now()}-${agentId}`,
      agentId,
      agentName,
      messages: [],
      isMinimized: false,
      isLoading: false,
      error: null,
      hasLoadedHistory: true, // Direct chat doesn't need history loading
      totalMessages: 0,
      canLoadMore: false
    };

    setChatWindows(prev => [...prev, newWindow]);
    setCurrentMessage(prev => ({ ...prev, [newWindow.id]: '' }));
    
    console.log('Opened direct chat with agent:', agentName);
  }, [chatWindows]);

  const closeChatWindow = useCallback((windowId: string) => {
    setChatWindows(prev => prev.filter(w => w.id !== windowId));
    setCurrentMessage(prev => {
      const newMessages = { ...prev };
      delete newMessages[windowId];
      return newMessages;
    });
  }, []);

  const minimizeChatWindow = useCallback((windowId: string) => {
    setChatWindows(prev => 
      prev.map(w => w.id === windowId ? { ...w, isMinimized: !w.isMinimized } : w)
    );
  }, []);

  const sendMessage = useCallback(async (windowId: string) => {
    const window = chatWindows.find(w => w.id === windowId);
    const messageText = currentMessage[windowId]?.trim();
    
    if (!window || !messageText || window.isLoading) return;

    // Check WebSocket connection
    if (!isWebSocketConnected) {
      setChatWindows(prev => 
        prev.map(w => w.id === windowId ? { 
          ...w, 
          error: 'WebSocket not connected. Please wait for connection.'
        } : w)
      );
      return;
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      content: messageText,
      sender: 'user',
      senderName: 'You',
      timestamp: new Date().toISOString(),
      messageType: MessageType.MESSAGE,
      metadata: { agentId: window.agentId }
    };

    // Add user message optimistically and clear input
    setChatWindows(prev => 
      prev.map(w => w.id === windowId ? { 
        ...w, 
        messages: [...w.messages, userMessage],
        isLoading: true,
        error: null
      } : w)
    );
    
    setCurrentMessage(prev => ({ ...prev, [windowId]: '' }));

    try {
      // Send message via WebSocket for real-time response
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
      console.log('Sent WebSocket message to agent:', window.agentName);

      // Set a fallback timeout in case WebSocket response doesn't arrive
      setTimeout(() => {
        setChatWindows(prev => 
          prev.map(w => {
            if (w.id === windowId && w.isLoading) {
              return {
                ...w,
                isLoading: false,
                error: 'Agent response timed out. Please try again.'
              };
            }
            return w;
          })
        );
      }, 60000); // 60 second fallback timeout

    } catch (error) {
      console.error('WebSocket chat error:', error);
      
      let errorMessage = 'Failed to send message via WebSocket';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setChatWindows(prev => 
        prev.map(w => w.id === windowId ? { 
          ...w, 
          isLoading: false,
          error: errorMessage
        } : w)
      );
    }
  }, [chatWindows, currentMessage, isWebSocketConnected, sendWebSocketMessage]);

  // Remove unused loadChatHistory function since we're using direct chats
  // Direct chats don't support history pagination (no persistent storage)

  const handleKeyPress = useCallback((windowId: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(windowId);
    }
  }, [sendMessage]);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback((windowId: string) => {
    const messagesContainer = document.getElementById(`messages-${windowId}`);
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, []);

  // Effect to scroll to bottom when messages change
  useEffect(() => {
    chatWindows.forEach(window => {
      if (!window.isMinimized) {
        scrollToBottom(window.id);
      }
    });
  }, [chatWindows, scrollToBottom]);

  // Memoize chat windows for performance
  const sortedChatWindows = useMemo(() => {
    return chatWindows.sort((a, b) => {
      // Sort by creation time (newer first), but keep minimized ones at the end
      if (a.isMinimized && !b.isMinimized) return 1;
      if (!a.isMinimized && b.isMinimized) return -1;
      return b.id.localeCompare(a.id);
    });
  }, [chatWindows]);

  return (
    <div className={`fixed bottom-0 right-0 z-50 flex items-end gap-2 p-4 ${className}`}>
      <AnimatePresence>
        {sortedChatWindows.map((window, index) => (
          <motion.div
            key={window.id}
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              height: window.isMinimized ? 'auto' : '500px'
            }}
            exit={{ opacity: 0, y: 100, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className={`bg-slate-800/95 backdrop-blur-md border border-slate-600/50 rounded-t-lg shadow-2xl ${
              window.isMinimized ? 'w-80' : 'w-80 h-96'
            }`}
            style={{ marginRight: `${index * 20}px` }}
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-600/50 bg-slate-700/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-white text-sm">{window.agentName}</div>
                  <div className="text-xs text-slate-400">
                    {window.isLoading ? 'Typing...' : 'Online'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => minimizeChatWindow(window.id)}
                  className="w-6 h-6 bg-slate-600/50 hover:bg-slate-500/50 rounded text-slate-300 hover:text-white transition-colors flex items-center justify-center"
                >
                  {window.isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => closeChatWindow(window.id)}
                  className="w-6 h-6 bg-red-500/30 hover:bg-red-500/50 rounded text-red-400 hover:text-red-300 transition-colors flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {!window.isMinimized && (
              <>
                {/* Messages */}
                <div 
                  id={`messages-${window.id}`}
                  className="flex-1 overflow-y-auto p-3 space-y-3 max-h-80"
                >
                  
                  {/* Loading History Indicator */}
                  {!window.hasLoadedHistory && (
                    <div className="flex justify-center items-center py-4">
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading chat history...
                      </div>
                    </div>
                  )}
                  {window.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                          message.sender === 'user'
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-700 text-slate-200'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{message.content}</div>
                        <div className={`text-xs mt-1 flex items-center justify-between ${
                          message.sender === 'user' ? 'text-blue-100' : 'text-slate-400'
                        }`}>
                          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                          {message.metadata && (
                            <div className="flex items-center gap-1">
                              {message.metadata.confidence && (
                                <span className="opacity-70">
                                  {Math.round(message.metadata.confidence * 100)}%
                                </span>
                              )}
                              {message.metadata.tokensUsed && (
                                <span className="opacity-70 text-xs">
                                  {message.metadata.tokensUsed}t
                                </span>
                              )}
                              {message.metadata.memoryEnhanced && (
                                <span className="opacity-70" title="Memory Enhanced">
                                  🧠
                                </span>
                              )}
                              {message.metadata.knowledgeUsed > 0 && (
                                <span className="opacity-70" title="Knowledge Used">
                                  📚
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {window.isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    </div>
                  )}

                  {window.error && (
                    <div className="flex justify-center">
                      <div className="bg-red-500/20 text-red-300 px-3 py-2 rounded-lg text-sm border border-red-500/30 max-w-xs">
                        <div className="flex items-center gap-2">
                          <span>⚠️</span>
                          <span>{window.error}</span>
                        </div>
                        <button
                          onClick={() => setChatWindows(prev => 
                            prev.map(w => w.id === window.id ? { ...w, error: null } : w)
                          )}
                          className="text-xs mt-1 underline hover:no-underline"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Conversation Context Info */}
                  {window.hasLoadedHistory && window.totalMessages > 0 && (
                    <div className="text-center">
                      <div className="text-xs text-slate-500 bg-slate-800/50 rounded-lg px-2 py-1 inline-block">
                        {window.messages.length} of {window.totalMessages} messages
                        {window.discussionId && (
                          <span className="ml-2">• Synced</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="p-3 border-t border-slate-600/50">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currentMessage[window.id] || ''}
                      onChange={(e) => setCurrentMessage(prev => ({ ...prev, [window.id]: e.target.value }))}
                      onKeyPress={(e) => handleKeyPress(window.id, e)}
                      placeholder={window.hasLoadedHistory ? "Type a message..." : "Loading..."}
                      className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600/30 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
                      disabled={window.isLoading || !window.hasLoadedHistory}
                    />
                    <button
                      onClick={() => sendMessage(window.id)}
                      disabled={!currentMessage[window.id]?.trim() || window.isLoading || !window.hasLoadedHistory}
                      className="px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
                      title={window.discussionId ? "Message will be saved" : "Message in memory only"}
                    >
                      {window.isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  
                  {/* Connection Status */}
                  <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      {window.discussionId ? (
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          Persistent Chat
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                          Memory Only
                        </span>
                      )}
                    </div>
                    {window.agentId && (
                      <span className="opacity-70">
                        Agent: {window.agentName}
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};