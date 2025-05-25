import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAgents } from '../contexts/AgentContext';
import type { Message } from '../types/agent';
import { ThoughtProcess } from './ThoughtProcess';
import { cn } from '../lib/utils';
import { shouldPersonaActivate, getActivationPhrase, contextualTriggers } from '../data/personas';
import { conversationFlow } from '../utils/conversationFlow';

// Function to parse thought content
const parseThoughtContent = (content: string): string => {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  return thinkMatch ? thinkMatch[1].trim() : content; // Return content inside tags or original if no tags
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
    if (shouldPersonaActivate(personaId, content)) {
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
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [threadMap, setThreadMap] = useState<Map<string, Message[]>>(new Map());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [conversationState, setConversationState] = useState(conversationFlow.getState());
  
  // Get messages from all agents and combine them
  useEffect(() => {
    const messages = Object.values(agents).flatMap(agent => 
      agent.conversationHistory
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
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
  }, [agents]);

  const getPhaseIcon = (phase: string) => {
    const icons = {
      'discussion': '💬',
      'planning': '📋',
      'decision': '⚖️',
      'review': '📝'
    };
    return icons[phase] || '💬';
  };

  const getPhaseColor = (phase: string) => {
    const colors = {
      'discussion': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      'planning': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      'decision': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      'review': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
    };
    return colors[phase] || colors.discussion;
  };

  const getMessageStyle = (type: string, threadDepth: number = 0, pattern?: string | null) => {
    let baseStyle = {
      thought: 'bg-gray-100 dark:bg-gray-800 italic text-gray-600 dark:text-gray-400 border-l-4 border-gray-300 dark:border-gray-600',
      response: 'bg-white dark:bg-gray-750',
      question: 'bg-blue-50 dark:bg-blue-900/30 font-medium text-blue-700 dark:text-blue-300',
      system: 'bg-gray-50 dark:bg-gray-850 text-gray-700 dark:text-gray-300 border-l-4 border-gray-300 dark:border-gray-600'
    }[type] || 'bg-white dark:bg-gray-750';
    
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
      ? `ml-${Math.min(threadDepth * 4, 12)} border-l-2 border-gray-200 dark:border-gray-600 pl-3` 
      : '';
    
    return cn(baseStyle, threadStyle, 'transition-colors duration-150 ease-in-out');
  };

  const getPatternIcon = (pattern: string | null) => {
    const icons = {
      'interruption': '⚡',
      'build-on': '🔗',
      'clarification': '❓',
      'concern': '⚠️',
      'expertise': '🎯'
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
      <div key={rootMessage.id} className="thread-container">
        {renderMessage(rootMessage)}
        {filteredThread.length > 0 && (
          <div className="ml-4 mt-2">
            <button
              onClick={() => toggleThread(rootMessage.id)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              {isExpanded ? '▼' : '▶'} {filteredThread.length} repl{filteredThread.length === 1 ? 'y' : 'ies'}
            </button>
            {isExpanded && (
              <div className="mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
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
    
    // Parse content if it's a thought message
    const displayContent = message.type === 'thought' ? parseThoughtContent(message.content) : message.content;

    return (
      <div key={message.id} className="mb-4 group"> 
        <div 
          className={cn(
            `rounded-lg p-4 shadow-sm dark:shadow-md`, 
            getMessageStyle(message.type, isThreaded ? 1 : 0, pattern),
            'hover:shadow-md dark:hover:shadow-lg transition-shadow duration-200 ease-in-out'
          )}
        >
          <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1"> 
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 dark:text-gray-100">
                {message.sender}
              </span>
              {agent && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({agent.role})
                </span>
              )}
              {pattern && (
                <span className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
                  <span>{getPatternIcon(pattern)}</span>
                  <span className="text-gray-600 dark:text-gray-300">{getPatternLabel(pattern)}</span>
                </span>
              )}
              {message.replyTo && (
                <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {allMessages.find(m => m.id === message.replyTo)?.sender}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {format(message.timestamp, 'PPpp')}
            </span>
          </div>
          
          {message.type === 'thought' ? (
            <div className="prose prose-sm max-w-none dark:prose-invert text-gray-600 dark:text-gray-400 italic mt-1">
              {displayContent}
            </div>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert text-gray-800 dark:text-gray-200 mt-1">
              {displayContent} 
            </div>
          )}
          
          {/* Show triggered personas */}
          {triggeredPersonas.length > 0 && (
            <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800 rounded border-l-4 border-blue-400">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                🎯 This might trigger:
              </div>
              <div className="flex flex-wrap gap-1">
                {triggeredPersonas.map(personaId => (
                  <span 
                    key={personaId}
                    className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium"
                  >
                    {personaId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {message.keywords && message.keywords.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5"> 
              {message.keywords.map(keyword => (
                <span 
                  key={keyword}
                  className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-xs font-medium"
                >
                  {keyword}
                </span>
              ))}
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

  return (
    <div className={cn("space-y-5", className)}> 
      {/* Conversation Flow Indicator */}
      {filteredMessages.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Conversation Flow</h3>
            <span className={cn("px-3 py-1 rounded-full text-xs font-medium", getPhaseColor(conversationState.conversationPhase))}>
              {getPhaseIcon(conversationState.conversationPhase)} {conversationState.conversationPhase.charAt(0).toUpperCase() + conversationState.conversationPhase.slice(1)}
            </span>
          </div>
          
          {conversationState.recentTopics.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Recent Topics:</div>
              <div className="flex flex-wrap gap-1">
                {conversationState.recentTopics.slice(0, 5).map(topic => (
                  <span key={topic} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-xs">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {conversationState.activePersonas.size > 0 && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Active Personas:</div>
              <div className="flex flex-wrap gap-1">
                {Array.from(conversationState.activePersonas).slice(0, 6).map(persona => (
                  <span key={persona} className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs font-medium">
                    {persona.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {filteredMessages.map(message => {
        // Only render root messages and their threads
        if (!message.threadRoot) {
          // Check if the message is a root of a thread in the map
          const isThreadRoot = threadMap.has(message.id);
          return isThreadRoot ? renderThread(message) : renderMessage(message);
        }
        return null;
      })}
    </div>
  );
}; 