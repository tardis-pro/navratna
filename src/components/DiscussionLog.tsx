import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAgents } from '../contexts/AgentContext';
import type { Message } from '../types/agent';

interface DiscussionLogProps {
  className?: string;
}

export const DiscussionLog: React.FC<DiscussionLogProps> = ({ className }) => {
  const { agents } = useAgents();
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  
  // Get messages from all agents and combine them
  useEffect(() => {
    const messages = Object.values(agents).flatMap(agent => 
      agent.conversationHistory
    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    setAllMessages(messages);
  }, [agents]);

  const getMessageStyle = (type: Message['type']) => {
    switch (type) {
      case 'thought':
        return 'bg-gray-100 italic text-gray-600';
      case 'response':
        return 'bg-white';
      case 'question':
        return 'bg-blue-50 font-medium';
      case 'system':
        return 'bg-gray-50 text-gray-700 border-l-4 border-gray-300';
      default:
        return '';
    }
  };

  return (
    <div className={`flex flex-col gap-4 p-4 overflow-y-auto ${className}`}>
      {allMessages.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          No messages yet. Start the discussion to see agent interactions.
        </div>
      ) : (
        allMessages.map((message) => {
          const agent = Object.values(agents).find(a => a.name === message.sender);
          
          return (
            <div 
              key={message.id}
              className={`rounded-lg p-4 shadow-sm ${getMessageStyle(message.type)}`}
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
                </div>
                <span className="text-xs text-gray-500">
                  {format(message.timestamp, 'MMM d, yyyy HH:mm:ss')}
                </span>
              </div>
              
              <div className="prose prose-sm max-w-none">
                {message.type === 'thought' && '💭 '}
                {message.type === 'question' && '❓ '}
                {message.content}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}; 