import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgents } from '../../../contexts/AgentContext';
import { uaipAPI } from '../../../utils/uaip-api';
import { DiscussionTrigger } from '../../DiscussionTrigger';
import { useWebSocket } from '../../../hooks/useUAIP';
import { 
  MessageSquare, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  Brain,
  Zap,
  Activity,
  Clock,
  Sparkles,
  Users
} from 'lucide-react';

interface ChatMessage {
  content: string;
  sender: 'user' | string; // 'user' or agent name
  timestamp: string;
  agentId?: string;
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
  capabilities?: Array<{
    id: string;
    name: string;
    category: string;
  }>;
}

interface ChatPortalProps {
  className?: string;
}

interface ChatResponse {
  response: string;
  agentName: string;
  confidence: number;
  model: string;
  tokensUsed: number;
  memoryEnhanced: boolean;
  knowledgeUsed: number;
  toolsExecuted?: Array<{
    toolId: string;
    toolName: string;
    success: boolean;
    result?: any;
    error?: string;
    timestamp: string;
  }>;
  availableCapabilities?: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
  }>;
  persona?: {
    name: string;
    role: string;
    personality: Record<string, number>;
    expertise: string[];
    communicationStyle: {
      tone: string;
      formality: string;
      enthusiasm: string;
    };
  };
  conversationContext: {
    messageCount: number;
    hasHistory: boolean;
    contextProvided: boolean;
  };
  timestamp: string;
}


export const ChatPortal: React.FC<ChatPortalProps> = ({ className }) => {
  const { agents } = useAgents();
  const { isConnected: isWebSocketConnected, sendMessage: sendWebSocketMessage, lastEvent } = useWebSocket();
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Array<{content: string; sender: string; timestamp: string}>>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const agentList = Object.values(agents);
  const selectedAgent = agentList.find(agent => agent.id === selectedAgentId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for WebSocket agent responses
  useEffect(() => {
    if (lastEvent && lastEvent.type === 'agent_response') {
      const { agentId, response, agentName, confidence, memoryEnhanced, knowledgeUsed, toolsExecuted } = lastEvent.payload;
      
      // Only handle responses for the currently selected agent
      if (agentId === selectedAgentId) {
        const agentMessage: ChatMessage = {
          content: response,
          sender: agentName,
          timestamp: new Date().toISOString(),
          agentId: agentId,
          confidence: confidence,
          memoryEnhanced: memoryEnhanced,
          knowledgeUsed: knowledgeUsed,
          toolsExecuted: toolsExecuted
        };

        setMessages(prev => [...prev, agentMessage]);
        setConversationHistory(prev => [...prev, { content: response, sender: agentName, timestamp: new Date().toISOString() }]);
        setIsLoading(false);
        setError(null);
      }
    }
  }, [lastEvent, selectedAgentId]);

  // Auto-select first agent if available and create conversation
  useEffect(() => {
    if (!selectedAgentId && agentList.length > 0) {
      setSelectedAgentId(agentList[0].id);
    }
  }, [agentList, selectedAgentId]);

  // Clear conversation when agent changes
  useEffect(() => {
    if (selectedAgentId) {
      setMessages([]);
      setConversationHistory([]);
      setError(null);
    }
  }, [selectedAgentId]);

  const sendMessage = useCallback(async () => {
    if (!currentMessage.trim() || !selectedAgentId || isLoading) return;

    // Check WebSocket connection
    if (!isWebSocketConnected) {
      setError('WebSocket not connected. Please wait for connection.');
      return;
    }

    const messageText = currentMessage.trim();
    const userMessage: ChatMessage = {
      content: messageText,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentMessage('');
    setIsLoading(true);
    setError(null);

    // Update conversation history
    setConversationHistory(prev => [...prev, { content: messageText, sender: 'user', timestamp: new Date().toISOString() }]);

    try {
      // Send message via WebSocket for real-time response
      const chatMessage = {
        type: 'agent_chat',
        payload: {
          agentId: selectedAgentId,
          message: messageText,
          conversationHistory: conversationHistory.slice(-10),
          context: {},
          messageId: `msg-${Date.now()}`,
          timestamp: new Date().toISOString()
        }
      };

      sendWebSocketMessage(chatMessage);
      console.log('Sent WebSocket message to agent:', selectedAgent?.name);

      // Set a fallback timeout in case WebSocket response doesn't arrive
      const timeoutId = setTimeout(() => {
        if (isLoading) {
          setIsLoading(false);
          setError('Agent response timed out. Please try again.');
        }
      }, 60000); // 60 second fallback timeout

      // Store timeout ID to clear it when response arrives
      const cleanup = () => clearTimeout(timeoutId);
      return cleanup;

    } catch (error) {
      console.error('WebSocket chat error:', error);
      
      let errorMessage = 'Failed to send message via WebSocket';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      setIsLoading(false);
      
      // Add error message to chat
      const errorChatMessage: ChatMessage = {
        content: `Sorry, I encountered an error: ${errorMessage}`,
        sender: selectedAgent?.name || 'System',
        timestamp: new Date().toISOString(),
        agentId: selectedAgentId
      };
      
      setMessages(prev => [...prev, errorChatMessage]);
    }
  }, [currentMessage, selectedAgentId, selectedAgent, isLoading, conversationHistory, isWebSocketConnected, sendWebSocketMessage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setConversationHistory([]);
    setError(null);
  }, []);

  return (
    <div className={`flex flex-col h-full space-y-4 ${className}`}>
      {/* Chat Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl rounded-2xl p-4 border border-slate-700/50"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center"
              animate={{ 
                boxShadow: [
                  '0 0 20px rgba(59, 130, 246, 0.3)',
                  '0 0 30px rgba(6, 182, 212, 0.4)',
                  '0 0 20px rgba(59, 130, 246, 0.3)'
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <MessageSquare className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <h3 className="text-lg font-bold text-white">Agent Chat</h3>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-400">
                  {selectedAgent ? `Chatting with ${selectedAgent.name}` : 'Select an agent to start chatting'}
                </p>
                <div className={`w-2 h-2 rounded-full ${isWebSocketConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span className={`text-xs ${isWebSocketConnected ? 'text-green-400' : 'text-red-400'}`}>
                  {isWebSocketConnected ? 'Real-time' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <DiscussionTrigger
                trigger={
                  <button className="px-3 py-1 text-xs bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Discuss
                  </button>
                }
                contextType="chat"
                contextData={{
                  chatHistory: messages.map(msg => ({
                    content: msg.content,
                    sender: msg.sender,
                    timestamp: msg.timestamp
                  })),
                  topic: selectedAgent ? `Chat with ${selectedAgent.name}` : 'Agent Chat Discussion'
                }}
                preselectedAgents={selectedAgentId ? [selectedAgentId] : []}
              />
            )}
            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                className="px-3 py-1 text-xs bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Agent Selector */}
        {agentList.length > 0 && (
          <div className="mt-4">
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50"
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
          <div className="mt-3 p-3 bg-slate-800/30 border border-slate-700/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-slate-300">Agent Capabilities</h4>
              <div className="flex items-center gap-1">
                <Activity className="w-3 h-3 text-green-400" />
                <span className="text-xs text-green-400">Enhanced</span>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedAgent.capabilities?.slice(0, 4).map((capability, index) => (
                <span
                  key={index}
                  className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded"
                >
                  {capability}
                </span>
              ))}
              {selectedAgent.capabilities && selectedAgent.capabilities.length > 4 && (
                <span className="text-xs px-2 py-1 bg-slate-600 text-slate-300 rounded">
                  +{selectedAgent.capabilities.length - 4} more
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-yellow-400" />
                <span className="text-slate-400">Knowledge</span>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-purple-400" />
                <span className="text-slate-400">Tools</span>
              </div>
              <div className="flex items-center gap-1">
                <Brain className="w-3 h-3 text-cyan-400" />
                <span className="text-slate-400">Memory</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Chat Messages */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 bg-gradient-to-br from-slate-800/30 to-slate-900/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden"
      >
        <div className="h-full flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <AnimatePresence>
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center h-32"
                >
                  <div className="text-center">
                    <Bot className="w-12 h-12 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400">
                      {selectedAgent ? `Start a conversation with ${selectedAgent.name}` : 'Select an agent to begin chatting'}
                    </p>
                  </div>
                </motion.div>
              )}

              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.sender !== 'user' && (
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  <div className={`max-w-[80%] ${message.sender === 'user' ? 'order-1' : ''}`}>
                    <div
                      className={`p-3 rounded-2xl ${
                        message.sender === 'user'
                          ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white ml-auto'
                          : 'bg-slate-700/50 text-white border border-slate-600/50'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{message.content}</p>
                      
                      {/* Agent message metadata */}
                      {message.sender !== 'user' && (
                        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-600/30 text-xs text-slate-400">
                          {message.confidence && (
                            <div className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{Math.round(message.confidence * 100)}%</span>
                            </div>
                          )}
                          {message.memoryEnhanced && (
                            <div className="flex items-center gap-1">
                              <Brain className="w-3 h-3" />
                              <span>Memory</span>
                            </div>
                          )}
                          {message.knowledgeUsed && message.knowledgeUsed > 0 && (
                            <div className="flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              <span>{message.knowledgeUsed} KB</span>
                            </div>
                          )}
                          {message.toolsExecuted && message.toolsExecuted.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              <span>{message.toolsExecuted.length} tools</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tool Execution Results */}
                      {message.sender !== 'user' && message.toolsExecuted && message.toolsExecuted.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-600/30">
                          <div className="text-xs text-slate-400 mb-1">Tools Executed:</div>
                          <div className="space-y-1">
                            {message.toolsExecuted.map((tool, toolIndex) => (
                              <div
                                key={toolIndex}
                                className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                                  tool.success 
                                    ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                }`}
                              >
                                <Zap className="w-3 h-3" />
                                <span className="font-medium">{tool.toolName}</span>
                                {tool.success ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : (
                                  <AlertCircle className="w-3 h-3" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="text-xs text-slate-500 mt-1 px-3">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>

                  {message.sender === 'user' && (
                    <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 justify-start"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-slate-700/50 border border-slate-600/50 rounded-2xl p-3">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Error Display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 py-2 bg-red-500/20 border-t border-red-500/30"
            >
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            </motion.div>
          )}

          {/* Message Input */}
          <div className="p-4 border-t border-slate-700/50">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={selectedAgent ? `Message ${selectedAgent.name}...` : "Select an agent first..."}
                  disabled={!selectedAgentId || isLoading}
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <motion.button
                onClick={sendMessage}
                disabled={!currentMessage.trim() || !selectedAgentId || isLoading}
                className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}; 