import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAgents } from '../contexts/AgentContext';
import type { Message } from '../types/agent';
import { ThoughtProcess } from './ThoughtProcess';
import { cn } from '../lib/utils';

interface DiscussionLogProps {
  className?: string;
}

export const DiscussionLog: React.FC<DiscussionLogProps> = ({ className }) => {
  const { agents } = useAgents();
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [threadMap, setThreadMap] = useState<Map<string, Message[]>>(new Map());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  
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
    
    setAllMessages(messages);
    setThreadMap(threads);
  }, [agents]);

  const getMessageStyle = (type: string, threadDepth: number = 0) => {
    const baseStyle = {
      thought: 'bg-gray-100 italic text-gray-600',
      response: 'bg-white',
      question: 'bg-blue-50 font-medium',
      system: 'bg-gray-50 text-gray-700 border-l-4 border-gray-300'
    }[type] || '';
    
    // Enhanced thread styling
    const threadStyle = threadDepth > 0 
      ? `ml-${Math.min(threadDepth * 4, 12)} border-l-2 border-gray-200 pl-3` 
      : '';
    
    return `${baseStyle} ${threadStyle}`;
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
    
    return (
      <div key={rootMessage.id} className="thread-container">
        {renderMessage(rootMessage)}
        {thread.length > 0 && (
          <div className="ml-4 mt-2">
            <button
              onClick={() => toggleThread(rootMessage.id)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              {isExpanded ? '▼' : '▶'} {thread.length} repl{thread.length === 1 ? 'y' : 'ies'}
            </button>
            {isExpanded && (
              <div className="mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
                {thread.map(msg => renderMessage(msg, true))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderMessage = (message: Message, isThreaded = false) => {
    const agent = Object.values(agents).find(a => a.name === message.sender);
    
    return (
      <div key={message.id} className="mb-3">
        <div 
          className={`rounded-lg p-4 shadow-sm ${getMessageStyle(message.type, isThreaded ? 1 : 0)}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800">
                {message.sender}
              </span>
              {agent && (
                <span className="text-sm text-gray-500">
                  ({agent.role})
                </span>
              )}
              {message.replyTo && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {allMessages.find(m => m.id === message.replyTo)?.sender}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500">
              {format(message.timestamp, 'MMM d, yyyy HH:mm:ss')}
            </span>
          </div>
          {message.type === 'thought' ? (
            <ThoughtProcess 
              messages={[message]}
              className="mt-2"
            />
          ) : (
            <div className="prose prose-sm max-w-none">
              {message.content}
            </div>
          )}
          {message.keywords && message.keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {message.keywords.map(keyword => (
                <span 
                  key={keyword}
                  className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs"
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

  return (
    <div className={cn("space-y-4", className)}>
      {allMessages.map(message => {
        // Only render root messages and their threads
        if (!message.threadRoot) {
          return message.id in threadMap ? renderThread(message) : renderMessage(message);
        }
        return null;
      })}
    </div>
  );
}; 