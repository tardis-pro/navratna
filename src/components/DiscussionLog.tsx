import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAgents } from '../contexts/AgentContext';
import type { Message } from '../types/agent';
import { ThoughtProcess } from './ThoughtProcess';
import { cn } from '../lib/utils';

// Function to parse thought content
const parseThoughtContent = (content: string): string => {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  return thinkMatch ? thinkMatch[1].trim() : content; // Return content inside tags or original if no tags
};

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
      thought: 'bg-gray-100 dark:bg-gray-800 italic text-gray-600 dark:text-gray-400 border-l-4 border-gray-300 dark:border-gray-600', // Adjusted thought style
      response: 'bg-white dark:bg-gray-750', // Adjusted response style
      question: 'bg-blue-50 dark:bg-blue-900/30 font-medium text-blue-700 dark:text-blue-300', // Adjusted question style
      system: 'bg-gray-50 dark:bg-gray-850 text-gray-700 dark:text-gray-300 border-l-4 border-gray-300 dark:border-gray-600' // Adjusted system style
    }[type] || 'bg-white dark:bg-gray-750'; // Default style
    
    // Enhanced thread styling (minor adjustments)
    const threadStyle = threadDepth > 0 
      ? `ml-${Math.min(threadDepth * 4, 12)} border-l-2 border-gray-200 dark:border-gray-600 pl-3` 
      : '';
    
    // Added transition for smoother hover effects (if any)
    return cn(baseStyle, threadStyle, 'transition-colors duration-150 ease-in-out');
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
    
    // Parse content if it's a thought message
    const displayContent = message.type === 'thought' ? parseThoughtContent(message.content) : message.content;

    return (
      // Slightly increased bottom margin for better spacing
      <div key={message.id} className="mb-4 group"> 
        <div 
          // Applied rounded-xl for a softer look, increased padding, adjusted shadow
          className={cn(
            `rounded-lg p-4 shadow-sm dark:shadow-md`, 
            getMessageStyle(message.type, isThreaded ? 1 : 0),
            'hover:shadow-md dark:hover:shadow-lg transition-shadow duration-200 ease-in-out' // Added hover shadow
          )}
        >
          {/* Adjusted spacing and alignment */}
          <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1"> 
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-800 dark:text-gray-100">
                {message.sender}
              </span>
              {agent && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({agent.role}) {/* Kept role display */}
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
              {format(message.timestamp, 'PPpp')} {/* Using a more comprehensive format */}
            </span>
          </div>
          {message.type === 'thought' ? (
            // Display parsed thought content directly
            <div className="prose prose-sm max-w-none dark:prose-invert text-gray-600 dark:text-gray-400 italic mt-1">
              {displayContent}
            </div>
          ) : (
            // Adjusted prose styles for better dark mode support
            <div className="prose prose-sm max-w-none dark:prose-invert text-gray-800 dark:text-gray-200 mt-1">
              {displayContent} 
            </div>
          )}
          {message.keywords && message.keywords.length > 0 && (
            // Adjusted keyword styling
            <div className="mt-3 flex flex-wrap gap-1.5"> 
              {message.keywords.map(keyword => (
                <span 
                  key={keyword}
                  className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-xs font-medium" // Enhanced badge style
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
    // Added slightly more spacing between messages
    <div className={cn("space-y-5", className)}> 
      {allMessages.map(message => {
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