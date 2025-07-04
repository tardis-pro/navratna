import React, { useState } from 'react';
import { useAgents } from '../contexts/AgentContext';
import { useDiscussion } from '../contexts/DiscussionContext';
import { Play, Users, MessageSquare, Bot, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface DiscussionStarterProps {
  className?: string;
  discussionTopic?: string;
}

export const DiscussionStarter: React.FC<DiscussionStarterProps> = ({
  className,
  discussionTopic = "AI and Technology Innovation"
}) => {
  const { agents } = useAgents();
  const agentList = Object.values(agents);
  const { 
    isActive, 
    discussionId, 
    participants, 
    start, 
    lastError,
    isWebSocketConnected 
  } = useDiscussion();
  
  const [isStarting, setIsStarting] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  const handleStartDiscussion = async () => {
    if (isStarting || isActive) return;
    
    setIsStarting(true);
    try {
      // Start discussion with selected agents
      const agentIds = selectedAgents.length > 0 ? selectedAgents : agentList.slice(0, 3).map(a => a.id);
      await start(discussionTopic, agentIds);
    } catch (error) {
      console.error('Failed to start discussion:', error);
    } finally {
      setIsStarting(false);
    }
  };

  const handleAgentSelection = (agentId: string) => {
    setSelectedAgents(prev => 
      prev.includes(agentId) 
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const availableAgents = agentList.filter(agent => agent.status === 'active');

  return (
    <div className={cn("space-y-4 p-4 border rounded-lg", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Discussion Control
        </h3>
        
        <div className="flex items-center gap-2 text-sm">
          <div className={cn(
            "flex items-center gap-1",
            isWebSocketConnected ? "text-green-600" : "text-red-600"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full",
              isWebSocketConnected ? "bg-green-500" : "bg-red-500"
            )} />
            {isWebSocketConnected ? "Connected" : "Disconnected"}
          </div>
        </div>
      </div>

      {/* Agent Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Select Agents for Discussion:</label>
        <div className="grid grid-cols-2 gap-2">
          {availableAgents.map(agent => (
            <div
              key={agent.id}
              className={cn(
                "flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-gray-50",
                selectedAgents.includes(agent.id) ? "border-blue-500 bg-blue-50" : "border-gray-200"
              )}
              onClick={() => handleAgentSelection(agent.id)}
            >
              <Bot className="w-4 h-4" />
              <span className="text-sm">{agent.name}</span>
              {selectedAgents.includes(agent.id) && (
                <CheckCircle className="w-4 h-4 text-blue-500 ml-auto" />
              )}
            </div>
          ))}
        </div>
        {availableAgents.length === 0 && (
          <p className="text-sm text-gray-500">No active agents available</p>
        )}
      </div>

      {/* Discussion Topic */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Discussion Topic:</label>
        <input
          type="text"
          value={discussionTopic}
          onChange={(e) => {/* Topic is controlled by parent */}}
          className="w-full p-2 border rounded text-sm"
          placeholder="Enter discussion topic..."
          disabled={isActive}
        />
      </div>

      {/* Status Display */}
      {isActive && (
        <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-700">
            Discussion active with {participants.length} participants
          </span>
        </div>
      )}

      {lastError && (
        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-700">{lastError}</span>
        </div>
      )}

      {/* Start Button */}
      <button
        onClick={handleStartDiscussion}
        disabled={isStarting || isActive || !isWebSocketConnected || availableAgents.length === 0}
        className={cn(
          "w-full flex items-center justify-center gap-2 px-4 py-2 rounded font-medium transition-colors",
          isActive || !isWebSocketConnected || availableAgents.length === 0
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700"
        )}
      >
        {isStarting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Starting Discussion...
          </>
        ) : isActive ? (
          <>
            <Users className="w-4 h-4" />
            Discussion Active
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Initiate Discussion
          </>
        )}
      </button>
    </div>
  );
}; 