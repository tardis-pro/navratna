import React from 'react';
import { format } from 'date-fns';
import { useAgents } from '../contexts/AgentContext';
import { useDiscussion } from '../contexts/DiscussionContext';
import type { Message } from '../types/agent';
import { cn } from '../lib/utils';
import { MessageSquare, Brain, Clock, User } from 'lucide-react';

// Function to parse and clean content with think tags
const parseMessageContent = (content: string, showThoughts: boolean): string => {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  
  if (thinkMatch && showThoughts) {
    // Show both thought and regular content
    const thoughtContent = thinkMatch[1].trim();
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    if (cleanContent && thoughtContent) {
      return `${cleanContent}\n\n💭 ${thoughtContent}`;
    }
    return thoughtContent || cleanContent;
  }
  
  // Remove think tags and return clean content
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || content;
};

interface DiscussionLogProps {
  className?: string;
  showThinkTokens?: boolean;
}

export const DiscussionLog: React.FC<DiscussionLogProps> = ({ 
  className, 
  showThinkTokens = false 
}) => {
  const { agents } = useAgents();
  const { history } = useDiscussion();

  // Filter and sort messages
  const messages = history
    .filter(message => showThinkTokens || message.type !== 'thought')
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const getAgentColor = (sender: string) => {
    const colors = [
      'from-blue-500 to-blue-600',
      'from-green-500 to-green-600', 
      'from-purple-500 to-purple-600',
      'from-orange-500 to-orange-600',
      'from-pink-500 to-pink-600',
      'from-indigo-500 to-indigo-600'
    ];
    
    const agentNames = Object.values(agents).map(a => a.name);
    const index = agentNames.indexOf(sender);
    return colors[index % colors.length] || colors[0];
  };

  const renderMessage = (message: Message) => {
    const agent = Object.values(agents).find(a => a.name === message.sender);
    const isThought = message.type === 'thought';
    const content = parseMessageContent(message.content, showThinkTokens);
    
    return (
      <div key={message.id} className="group">
        <div className={cn(
          "p-4 rounded-lg transition-all duration-200",
          isThought 
            ? "bg-slate-50 dark:bg-slate-800/50 border-l-4 border-slate-300 dark:border-slate-600"
            : "bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 hover:shadow-sm"
        )}>
          {/* Message Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br",
                getAgentColor(message.sender)
              )}>
                {isThought ? (
                  <Brain className="w-4 h-4 text-white" />
                ) : (
                  <User className="w-4 h-4 text-white" />
                )}
              </div>
              
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-slate-900 dark:text-white">
                    {message.sender}
                  </span>
                  {agent && (
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs rounded-full">
                      {agent.role}
                    </span>
                  )}
                  {isThought && (
                    <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs rounded-full">
                      thinking
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-3 h-3" />
              <span>{format(message.timestamp, 'HH:mm:ss')}</span>
            </div>
          </div>
          
          {/* Message Content */}
          <div className={cn(
            "text-sm leading-relaxed whitespace-pre-wrap",
            isThought 
              ? "text-slate-600 dark:text-slate-400 italic" 
              : "text-slate-800 dark:text-slate-200"
          )}>
            {content}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Discussion Log
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Real-time conversation history
              </p>
            </div>
          </div>
          
          {messages.length > 0 && (
            <div className="flex items-center space-x-2 text-sm text-slate-500">
              <MessageSquare className="w-4 h-4" />
              <span>{messages.length} messages</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="p-4">
          {messages.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {messages.map(renderMessage)}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">No messages yet</p>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                Start a discussion to see messages here
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 