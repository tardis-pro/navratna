import React, { useCallback } from 'react';
import { useAgents } from '../contexts/AgentContext';
import { useDocument } from '../contexts/DocumentContext';
import { LLMService } from '../services/llm';
import { Message } from '../types/agent';
import { AgentAvatar } from './AgentAvatar';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

interface AgentProps {
  id: string;
  className?: string;
}

export const Agent: React.FC<AgentProps> = ({ id, className }) => {
  const { agents, updateAgentState } = useAgents();
  const { documents, activeDocumentId } = useDocument();
  
  const agent = agents[id];
  if (!agent) return null;

  const generateResponse = useCallback(async () => {
    if (agent.isThinking) return;

    try {
      // Set thinking state
      updateAgentState(id, { isThinking: true, error: null });

      // Get active document if any
      const activeDocument = activeDocumentId ? documents[activeDocumentId] : null;

      // Generate response
      const response = await LLMService.generateResponse(
        agent,
        activeDocument,
        agent.conversationHistory
      );

      if (response.error) {
        throw new Error(response.error);
      }

      // Create new message
      const newMessage: Message = {
        id: crypto.randomUUID(),
        content: response.content,
        sender: agent.name,
        timestamp: new Date(),
        type: 'response',
      };

      // Update agent state with new message
      updateAgentState(id, {
        isThinking: false,
        currentResponse: response.content,
        conversationHistory: [...agent.conversationHistory, newMessage],
      });
    } catch (error) {
      updateAgentState(id, {
        isThinking: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }, [agent, id, activeDocumentId, documents, updateAgentState]);

  const lastMessage = agent.conversationHistory[agent.conversationHistory.length - 1];
  const isMyTurn = lastMessage?.sender !== id;

  const renderThoughtBubble = () => {
    if (!agent.isThinking) return null;
    
    return (
      <div className="flex items-center space-x-2 text-gray-500 animate-pulse">
        <span>Thinking</span>
        <span className="flex space-x-1">
          <span className="w-1 h-1 bg-gray-500 rounded-full" />
          <span className="w-1 h-1 bg-gray-500 rounded-full" />
          <span className="w-1 h-1 bg-gray-500 rounded-full" />
        </span>
      </div>
    );
  };

  const renderMessages = () => {
    return agent.conversationHistory
      .filter(msg => msg.sender === id)
      .map((message) => (
        <div key={message.id} className="mt-2">
          <div className="text-sm text-gray-500">
            {message.timestamp.toLocaleTimeString()}
          </div>
          <div className="mt-1 prose prose-sm">
            {message.content}
          </div>
        </div>
      ));
  };

  return (
    <Card className={`p-4 max-w-xl ${className}`}>
      <div className="flex items-center space-x-4 mb-4">
        <AgentAvatar name={agent.name} className="h-12 w-12" />
        <div>
          <h3 className="font-medium">{agent.name}</h3>
          <div className="flex space-x-2 mt-1">
            <Badge variant="outline">{agent.role}</Badge>
            {isMyTurn && <Badge variant="secondary">Your turn</Badge>}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {renderMessages()}
        {renderThoughtBubble()}
        {agent.error && (
          <div className="text-red-500 text-sm">
            Error: {agent.error}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={generateResponse}
          disabled={agent.isThinking}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
        >
          {agent.isThinking ? 'Thinking...' : 'Generate Response'}
        </button>
      </div>

      {agent.currentResponse && (
        <div className="mt-4 p-4 bg-gray-50 rounded-md prose prose-sm max-w-none">
          {agent.currentResponse}
        </div>
      )}
    </Card>
  );
}; 