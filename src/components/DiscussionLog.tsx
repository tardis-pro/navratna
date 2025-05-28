import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAgents } from '../contexts/AgentContext';
import { useDiscussion } from '../contexts/DiscussionContext';
import type { Message } from '../types/agent';
import { ThoughtProcess } from './ThoughtProcess';
import { cn } from '../lib/utils';
import { shouldPersonaActivate, getActivationPhrase, contextualTriggers } from '../data/personas';
import { conversationFlow } from '../utils/conversationFlow';
import { MessageSquare, Brain, ChevronDown, ChevronRight, Reply, Clock, Tag, Zap, Link, HelpCircle, AlertTriangle, Target, Users, TrendingUp } from 'lucide-react';

// Function to parse and clean content with think tags
const parseMessageContent = (content: string, messageType: string): { displayContent: string; thoughtContent?: string } => {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  
  if (thinkMatch) {
    const thoughtContent = thinkMatch[1].trim();
    // Remove the think tags and their content from the main content
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    if (messageType === 'thought') {
      // For thought messages, show only the thought content
      return { displayContent: thoughtContent };
    } else {
      // For regular messages, show the clean content without think tags
      return { 
        displayContent: cleanContent || thoughtContent, // Fallback to thought if no other content
        thoughtContent: thoughtContent 
      };
    }
  }
  
  // No think tags found, return original content
  return { displayContent: content };
};

// Function to detect conversation patterns
const detectConversationPattern = (content: string): string | null => {
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('wait,') || lowerContent.includes('hold on')) return 'interruption';
  if (lowerContent.includes('building on') || lowerContent.includes('adding to')) return 'build-on';
  if (lowerContent.includes('can someone explain') || lowerContent.includes('i\'m not sure')) return 'clarification';
  if (lowerContent.includes('what about') || lowerContent.includes('how do we')) return 'concern';
  if (lowerContent.includes('from a') && lowerContent.includes('perspective')) return 'expertise';
  
  return null;
};

// Function to get triggered personas for a message
const getTriggeredPersonas = (content: string): string[] => {
  const triggered: string[] = [];
  
  Object.keys(contextualTriggers).forEach(personaId => {
    if (shouldPersonaActivate(personaId, content, contextualTriggers)) {
      triggered.push(personaId);
    }
  });
  
  return triggered;
};

interface DiscussionLogProps {
  className?: string;
  showThinkTokens?: boolean;
}

export const DiscussionLog: React.FC<DiscussionLogProps> = ({ className, showThinkTokens = true }) => {
  const { agents } = useAgents();
  const { history: discussionHistory } = useDiscussion();
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [threadMap, setThreadMap] = useState<Map<string, Message[]>>(new Map());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [conversationState, setConversationState] = useState(conversationFlow.getState());
  
  // Get messages from discussion history (contains ALL messages) instead of individual agent histories
  useEffect(() => {
    // Use the complete discussion history which contains all messages
    // This ensures the UI shows ALL messages while LLM gets optimized/limited history
    const messages = discussionHistory.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Build enhanced thread map
    const threads = new Map<string, Message[]>();
    messages.forEach(message => {
      if (message.threadRoot) {
        const thread = threads.get(message.threadRoot) || [];
        thread.push(message);
        threads.set(message.threadRoot, thread.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()));
      }
    });
    
    // Update conversation flow state
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const triggered = getTriggeredPersonas(lastMessage.content);
      conversationFlow.updateState(lastMessage.sender, lastMessage.content, triggered);
      setConversationState(conversationFlow.getState());
    }
    
    setAllMessages(messages);
    setThreadMap(threads);
  }, [discussionHistory]);

  const getPhaseIcon = (phase: string) => {
    const icons = {
      'discussion': MessageSquare,
      'planning': Target,
      'decision': AlertTriangle,
      'review': TrendingUp
    };
    return icons[phase] || MessageSquare;
  };

  const getPhaseColor = (phase: string) => {
    const colors = {
      'discussion': 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      'planning': 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
      'decision': 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
      'review': 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800'
    };
    return colors[phase] || colors.discussion;
  };

  const getMessageStyle = (type: string, threadDepth: number = 0, pattern?: string | null) => {
    let baseStyle = {
      thought: 'bg-slate-50 dark:bg-slate-800/50 border-l-4 border-slate-300 dark:border-slate-600',
      response: 'bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700',
      question: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800',
      system: 'bg-slate-50 dark:bg-slate-800/50 border-l-4 border-slate-300 dark:border-slate-600'
    }[type] || 'bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700';
    
    // Add pattern-specific styling
    if (pattern) {
      const patternStyles = {
        'interruption': 'border-l-4 border-orange-400 bg-orange-50 dark:bg-orange-900/20',
        'build-on': 'border-l-4 border-green-400 bg-green-50 dark:bg-green-900/20',
        'clarification': 'border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-900/20',
        'concern': 'border-l-4 border-red-400 bg-red-50 dark:bg-red-900/20',
        'expertise': 'border-l-4 border-purple-400 bg-purple-50 dark:bg-purple-900/20'
      };
      baseStyle = patternStyles[pattern] || baseStyle;
    }
    
    // Enhanced thread styling
    const threadStyle = threadDepth > 0 
      ? `ml-${Math.min(threadDepth * 6, 12)} border-l-2 border-slate-200 dark:border-slate-600 pl-4` 
      : '';
    
    return cn(baseStyle, threadStyle, 'transition-all duration-200 hover:shadow-md');
  };

  const getPatternIcon = (pattern: string | null) => {
    const icons = {
      'interruption': Zap,
      'build-on': Link,
      'clarification': HelpCircle,
      'concern': AlertTriangle,
      'expertise': Target
    };
    return pattern ? icons[pattern] : null;
  };

  const getPatternLabel = (pattern: string | null) => {
    const labels = {
      'interruption': 'Interruption',
      'build-on': 'Building On',
      'clarification': 'Clarification',
      'concern': 'Concern',
      'expertise': 'Expertise'
    };
    return pattern ? labels[pattern] : null;
  };

  const toggleThread = (threadId: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  };

  const renderThread = (rootMessage: Message) => {
    const thread = threadMap.get(rootMessage.id) || [];
    const isExpanded = expandedThreads.has(rootMessage.id);
    
    // Filter thread messages based on showThinkTokens setting
    const filteredThread = showThinkTokens 
      ? thread 
      : thread.filter(msg => msg.type !== 'thought');
    
    return (
      <div key={rootMessage.id} className="space-y-3">
        {renderMessage(rootMessage)}
        {filteredThread.length > 0 && (
          <div className="ml-6">
            <button
              onClick={() => toggleThread(rootMessage.id)}
              className="flex items-center space-x-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all duration-200"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span>{filteredThread.length} repl{filteredThread.length === 1 ? 'y' : 'ies'}</span>
            </button>
            {isExpanded && (
              <div className="mt-3 space-y-3">
                {filteredThread.map(msg => renderMessage(msg, true))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderMessage = (message: Message, isThreaded = false) => {
    // Filter out thought messages if showThinkTokens is false
    if (!showThinkTokens && message.type === 'thought') {
      return null;
    }

    const agent = Object.values(agents).find(a => a.name === message.sender);
    const pattern = detectConversationPattern(message.content);
    const triggeredPersonas = getTriggeredPersonas(message.content);
    const PatternIcon = getPatternIcon(pattern);
    
    // Parse content to handle think tags properly
    const { displayContent, thoughtContent } = parseMessageContent(message.content, message.type);

    return (
      <div key={message.id} className="group animate-fade-in-up"> 
        <div 
          className={cn(
            'rounded-xl p-6 shadow-sm backdrop-blur-sm', 
            getMessageStyle(message.type, isThreaded ? 1 : 0, pattern),
            'hover:shadow-lg transition-all duration-200'
          )}
        >
          {/* Message Header */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2"> 
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                {message.type === 'thought' ? (
                  <Brain className="w-4 h-4 text-white" />
                ) : (
                  <MessageSquare className="w-4 h-4 text-white" />
                )}
              </div>
              
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {message.sender}
                  </span>
                  {agent && (
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs rounded-full">
                      {agent.role}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2 mt-1">
                  {pattern && PatternIcon && (
                    <div className="flex items-center space-x-1 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-full">
                      <PatternIcon className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                      <span className="text-xs text-slate-600 dark:text-slate-400">{getPatternLabel(pattern)}</span>
                    </div>
                  )}
                  
                  {message.replyTo && (
                    <div className="flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400">
                      <Reply className="w-3 h-3" />
                      <span>{allMessages.find(m => m.id === message.replyTo)?.sender}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-3 h-3" />
              <span>{format(message.timestamp, 'HH:mm')}</span>
            </div>
          </div>
          
          {/* Message Content */}
          <div className={cn(
            "prose prose-sm max-w-none leading-relaxed",
            message.type === 'thought' 
              ? "text-slate-600 dark:text-slate-400 italic" 
              : "text-slate-800 dark:text-slate-200"
          )}>
            {displayContent}
          </div>
          
          {/* Show thought content indicator when think tokens are visible and there's hidden thought content */}
          {showThinkTokens && thoughtContent && message.type !== 'thought' && (
            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Brain className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Internal Reasoning:</span>
              </div>
              <div className="text-sm text-amber-700 dark:text-amber-300 italic">
                {thoughtContent}
              </div>
            </div>
          )}
          
          {/* Triggered Personas */}
          {triggeredPersonas.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Might trigger:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {triggeredPersonas.map(personaId => (
                  <span 
                    key={personaId}
                    className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-medium"
                  >
                    {personaId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Keywords */}
          {message.keywords && message.keywords.length > 0 && (
            <div className="mt-4 flex items-center space-x-2">
              <Tag className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <div className="flex flex-wrap gap-2">
                {message.keywords.map(keyword => (
                  <span 
                    key={keyword}
                    className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Filter messages based on showThinkTokens setting
  const filteredMessages = showThinkTokens 
    ? allMessages 
    : allMessages.filter(message => message.type !== 'thought');

  const PhaseIcon = getPhaseIcon(conversationState.conversationPhase);

  return (
    <div className={cn("p-6 space-y-6", className)}> 
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Discussion Log</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Real-time conversation history</p>
          </div>
        </div>
        
        {filteredMessages.length > 0 && (
          <div className="flex items-center space-x-2 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
            <MessageSquare className="w-3 h-3 text-slate-600 dark:text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{filteredMessages.length}</span>
          </div>
        )}
      </div>

      {/* Conversation Flow Indicator */}
      {filteredMessages.length > 0 && (
        <div className={cn(
          "p-4 rounded-xl border",
          getPhaseColor(conversationState.conversationPhase)
        )}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <PhaseIcon className="w-5 h-5" />
              <h3 className="font-semibold">Conversation Flow</h3>
            </div>
            <span className="px-3 py-1 bg-white/50 dark:bg-slate-800/50 rounded-full text-xs font-medium">
              {conversationState.conversationPhase.charAt(0).toUpperCase() + conversationState.conversationPhase.slice(1)}
            </span>
          </div>
          
          {conversationState.recentTopics.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium mb-2">Recent Topics:</div>
              <div className="flex flex-wrap gap-2">
                {conversationState.recentTopics.slice(0, 5).map(topic => (
                  <span key={topic} className="px-2 py-1 bg-white/50 dark:bg-slate-800/50 rounded-lg text-xs">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {conversationState.activePersonas.size > 0 && (
            <div>
              <div className="text-xs font-medium mb-2">Active Personas:</div>
              <div className="flex flex-wrap gap-2">
                {Array.from(conversationState.activePersonas).slice(0, 6).map(persona => (
                  <span key={persona} className="px-2 py-1 bg-white/50 dark:bg-slate-800/50 rounded-lg text-xs font-medium">
                    {persona.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Messages */}
      <div className="space-y-4 max-h-[500px] overflow-y-auto">
        {filteredMessages.length > 0 ? (
          filteredMessages.map(message => {
            // Only render root messages and their threads
            if (!message.threadRoot) {
              // Check if the message is a root of a thread in the map
              const isThreadRoot = threadMap.has(message.id);
              return isThreadRoot ? renderThread(message) : renderMessage(message);
            }
            return null;
          })
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 dark:text-slate-400 font-medium">No messages yet</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Start a discussion to see messages here</p>
          </div>
        )}
      </div>
    </div>
  );
}; 