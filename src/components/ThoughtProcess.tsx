import React, { useState, useMemo } from 'react';
import { cn } from '../lib/utils';
import type { Message } from '../types/agent';
import { ChevronDown, ChevronRight, Search, Clock } from 'lucide-react';

interface ThoughtProcessProps {
  messages: Message[];
  className?: string;
}

export const ThoughtProcess: React.FC<ThoughtProcessProps> = ({ messages, className }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Extract and parse thought process from messages
  const thoughtSteps = useMemo(() => {
    return messages
      .filter(m => m.type === 'thought')
      .map(message => {
        // Extract steps from <think> tags if present
        const thinkMatches = message.content.match(/<think>(.*?)<\/think>/gs);
        if (thinkMatches) {
          return thinkMatches.map(match => {
            const content = match.replace(/<\/?think>/g, '').trim();
            return { content, timestamp: message.timestamp };
          });
        }
        // Otherwise treat the whole message as a thought
        return [{
          content: message.content.replace('Thinking...', '').trim(),
          timestamp: message.timestamp
        }];
      })
      .flat()
      .filter(step => step.content.length > 0);
  }, [messages]);

  // Filter thoughts based on search
  const filteredThoughts = useMemo(() => {
    if (!searchQuery) return thoughtSteps;
    const query = searchQuery.toLowerCase();
    return thoughtSteps.filter(step => 
      step.content.toLowerCase().includes(query)
    );
  }, [thoughtSteps, searchQuery]);

  if (thoughtSteps.length === 0) return null;

  return (
    <div className={cn(
      "bg-gradient-to-br from-gray-50/95 to-gray-100/95 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-gray-200/50",
      "dark:from-gray-900/95 dark:to-gray-800/95 dark:border-gray-700/50",
      className
    )}>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 transition-colors"
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="font-medium">
            Thought Process ({thoughtSteps.length} steps)
          </span>
        </button>
        {isExpanded && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search thoughts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg 
                focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/40 
                placeholder-gray-400 dark:placeholder-gray-500
                transition-shadow"
            />
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="space-y-3 mt-4">
          {filteredThoughts.map((step, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-800/50 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700/50
                hover:shadow-md hover:border-gray-200 dark:hover:border-gray-600/50 transition-all duration-200"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 
                  flex items-center justify-center text-sm font-medium text-blue-600 dark:text-blue-400">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-800 dark:text-gray-200 prose prose-sm dark:prose-invert 
                    prose-p:leading-relaxed prose-p:my-0">
                    {step.content}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="w-3.5 h-3.5" />
                    {step.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}; 