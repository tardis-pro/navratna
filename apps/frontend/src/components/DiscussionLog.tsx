import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAgents } from '../contexts/AgentContext';
import { useDiscussion } from '../contexts/DiscussionContext';
import type { Message } from '../types/agent';
import { cn } from '../lib/utils';
import { MessageSquare, Brain, Clock, User, Play, Users, AlertCircle, Loader2 } from 'lucide-react';

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
  const { 
    history, 
    isActive, 
    discussionId, 
    participants, 
    start, 
    lastError,
    isWebSocketConnected,
    websocketError 
  } = useDiscussion();
  
  const [isStarting, setIsStarting] = useState(false);
  const [initializationStatus, setInitializationStatus] = useState<{
    hasAgents: boolean;
    hasParticipants: boolean;
    hasDiscussion: boolean;
    isConnected: boolean;
  }>({
    hasAgents: false,
    hasParticipants: false,
    hasDiscussion: false,
    isConnected: false
  });

  // Monitor initialization status
  useEffect(() => {
    setInitializationStatus({
      hasAgents: Object.keys(agents).length > 0,
      hasParticipants: participants.length > 0,
      hasDiscussion: !!discussionId,
      isConnected: isWebSocketConnected
    });
  }, [agents, participants, discussionId, isWebSocketConnected]);

  // Auto-start discussion when conditions are met
  useEffect(() => {
    const { hasAgents, hasParticipants, hasDiscussion, isConnected } = initializationStatus;
    
    // Only auto-start if we have agents but no active discussion
    if (hasAgents && !isActive && !isStarting && !hasDiscussion) {
      console.log('🚀 Auto-starting discussion with available agents');
      handleStartDiscussion();
    }
  }, [initializationStatus, isActive, isStarting]);

  const handleStartDiscussion = async () => {
    if (isStarting || isActive) return;
    
    setIsStarting(true);
    try {
      console.log('🎬 Starting discussion...', { 
        agentCount: Object.keys(agents).length,
        participants: participants.length 
      });
      
      await start();
      console.log('✅ Discussion started successfully');
    } catch (error) {
      console.error('❌ Failed to start discussion:', error);
    } finally {
      setIsStarting(false);
    }
  };
  // Filter and sort messages - handle empty history
  const messages = (history || [])
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

  const renderInitializationStatus = () => {
    const { hasAgents, hasParticipants, hasDiscussion, isConnected } = initializationStatus;
    
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Users className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Discussion Status
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              System initialization and connection status
            </p>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Available Agents</span>
            <div className="flex items-center space-x-2">
              {hasAgents ? (
                <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                  {Object.keys(agents).length} agents
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 text-sm">
                  No agents available
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Discussion Participants</span>
            <div className="flex items-center space-x-2">
              {hasParticipants ? (
                <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                  {participants.length} participants
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 text-sm">
                  No participants
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Discussion Session</span>
            <div className="flex items-center space-x-2">
              {hasDiscussion ? (
                <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                  Active
                </span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400 text-sm">
                  Not started
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">WebSocket Connection</span>
            <div className="flex items-center space-x-2">
              {isConnected ? (
                <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                  Connected
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400 text-sm">
                  Disconnected
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Error Display */}
        {(lastError || websocketError) && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-medium text-red-800 dark:text-red-200">
                Error
              </span>
            </div>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">
              {lastError || websocketError}
            </p>
          </div>
        )}
        
        {/* Start Discussion Button */}
        {hasAgents && !isActive && !hasDiscussion && (
          <div className="mt-4">
            <button
              onClick={handleStartDiscussion}
              disabled={isStarting}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Starting Discussion...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Start Discussion</span>
                </>
              )}
            </button>
          </div>
        )}
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
                {isActive ? 'Active discussion' : 'Real-time conversation history'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Connection Status Indicator */}
            <div className="flex items-center space-x-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                isWebSocketConnected ? "bg-green-500" : "bg-red-500"
              )} />
              <span className="text-xs text-slate-500">
                {isWebSocketConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            
            {messages.length > 0 && (
              <div className="flex items-center space-x-2 text-sm text-slate-500">
                <MessageSquare className="w-4 h-4" />
                <span>{messages.length} messages</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Show initialization status if no messages */}
      {messages.length === 0 && renderInitializationStatus()}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="p-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {messages.map(renderMessage)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 