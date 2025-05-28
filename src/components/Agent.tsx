import React, { useCallback, useEffect } from 'react';
import { useAgents } from '../contexts/AgentContext';
import { useDocument } from '../contexts/DocumentContext';
import { LLMService } from '../services/llm';
import { Message } from '../types/agent';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { AgentAvatar } from './AgentAvatar';
import { Persona } from '../types/persona';

interface AgentProps {
  id: string;
  className?: string;
}

export const Agent: React.FC<AgentProps> = ({ id, className }) => {
  const { agents, updateAgentState, getAllMessages, addMessage } = useAgents();
  const { documents, activeDocumentId } = useDocument();
  
  const agent = agents[id];

  // Get persona safely without conditional hook usage
  const persona: Persona | undefined = agent?.persona as Persona | undefined;

  const getOptimizedHistory = (messages: Message[]): Message[] => {
    // Keep last 20 messages to maintain context but not overwhelm the model
    const recentMessages = messages.slice(-20);
    
    // Include system messages and important context
    const systemMessages = messages.filter(msg => msg.type === 'system');
    
    // Combine system messages with recent conversation
    const combinedMessages = [...systemMessages, ...recentMessages]
      .filter((msg, index, arr) => 
        // Remove duplicates based on content and timestamp
        arr.findIndex(m => m.content === msg.content && m.timestamp.getTime() === msg.timestamp.getTime()) === index
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return combinedMessages;
  };

  const shouldAutoRespond = useCallback((lastMessage: Message): boolean => {
    if (!agent || !persona) return false;
    
    // Skip if it's my own message
    if (lastMessage.sender === agent.name) return false;
    
    // Skip if no conversation history
    const allMessages = getAllMessages();
    if (allMessages.length === 0) return false;
    
    // Basic role-based activation logic
    const isJuniorDev = persona.role.includes('Junior Developer');
    const isTechLead = persona.role.includes('Tech Lead') || persona.role.includes('Technical Lead');
    const isQA = persona.role.includes('QA') || persona.role.includes('Quality');
    const isSoftwareEngineer = persona.role.includes('Software Engineer');
    
    // Check if this agent should naturally respond based on context
    const shouldActivate = persona.expertise.some(skill => 
      lastMessage.content.toLowerCase().includes(skill.toLowerCase())
    );
    
    // Junior Developer asks questions and responds to guidance
    if (isJuniorDev) {
      const isGuidanceFromSenior = lastMessage.sender.includes('Lead') || 
                                   lastMessage.sender.includes('Senior') ||
                                   lastMessage.sender.includes('Architect');
      
      const shouldAskQuestion = Math.random() < 0.3; // 30% chance to ask follow-up
      
      return (isGuidanceFromSenior && shouldAskQuestion) || shouldActivate;
    }
    
    // Tech Lead provides guidance when technical decisions need to be made
    if (isTechLead) {
      const isQuestionFromJunior = lastMessage.content.includes('?') && 
        (lastMessage.sender.includes('Junior') || lastMessage.sender.includes('junior'));
      
      const needsArchitecturalGuidance = shouldActivate || 
        lastMessage.content.toLowerCase().includes('how do we') ||
        lastMessage.content.toLowerCase().includes('what about');
      
      return isQuestionFromJunior || needsArchitecturalGuidance;
    }
    
    // QA Engineer interrupts when quality concerns arise
    if (isQA) {
      const qualityKeywords = ['feature', 'implement', 'build', 'create', 'change', 'update'];
      const hasQualityConcern = qualityKeywords.some(keyword => 
        lastMessage.content.toLowerCase().includes(keyword)
      );
      
      const missingTestingMention = !lastMessage.content.toLowerCase().includes('test') &&
                                   !lastMessage.content.toLowerCase().includes('quality');
      
      return (hasQualityConcern && missingTestingMention) || shouldActivate;
    }
    
    // Software Engineer responds to implementation questions or when code quality is discussed
    if (isSoftwareEngineer) {
      const isImplementationQuestion = lastMessage.content.includes('?') && 
        (lastMessage.content.toLowerCase().includes('implement') ||
         lastMessage.content.toLowerCase().includes('code') ||
         lastMessage.content.toLowerCase().includes('how'));
      
      return isImplementationQuestion || shouldActivate;
    }
    
    // Other roles respond based on their triggers
    return shouldActivate;
  }, [agent, persona, getAllMessages]);

  const generateResponse = useCallback(async () => {
    if (!agent || agent.isThinking) return;

    try {
      // Set thinking state
      updateAgentState(id, { isThinking: true, error: null });

      // Get active document if any
      const activeDocument = activeDocumentId ? documents[activeDocumentId] : null;

      // Get the full conversation history from all agents, not just this agent's messages
      const allMessages = getAllMessages();
      const optimizedHistory = getOptimizedHistory(allMessages);

      console.log(`${agent.name} generating response with ${optimizedHistory.length} messages from full conversation`);

      // Generate response
      const response = await LLMService.generateResponse(
        agent,
        activeDocument,
        optimizedHistory
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

      // Add message to global conversation so all agents can see it
      addMessage(id, newMessage);

      // Update agent state (but don't duplicate the conversation history)
      updateAgentState(id, {
        isThinking: false,
        currentResponse: response.content,
      });
    } catch (error) {
      updateAgentState(id, {
        isThinking: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }, [agent, id, activeDocumentId, documents, updateAgentState, getAllMessages, addMessage]);

  // Auto-response effect
  useEffect(() => {
    if (!agent || !persona) return;
    
    const allMessages = getAllMessages();
    const lastMessage = allMessages[allMessages.length - 1];
    
    if (!lastMessage || agent.isThinking) return;
    
    // Check if any other agent is currently thinking to avoid simultaneous responses
    const isAnyAgentThinking = Object.values(agents).some(a => a.isThinking);
    if (isAnyAgentThinking) return;
    
    // Debug logging
    const shouldRespond = shouldAutoRespond(lastMessage);
    if (shouldRespond) {
      console.log(`${agent.name} (${persona.role}) triggered by: "${lastMessage.content.substring(0, 50)}..."`);
    }
    
    // Add small delay to make conversation feel more natural
    const baseDelay = persona.role === 'Junior Developer' ? 1000 : 2000;
    const randomDelay = Math.random() * 1000; // Add 0-1 second random delay
    const responseDelay = baseDelay + randomDelay;
    
    if (shouldRespond) {
      const timer = setTimeout(() => {
        // Double-check no one else started thinking while we were waiting
        const stillNoOneThinking = !Object.values(agents).some(a => a.isThinking);
        if (stillNoOneThinking) {
          console.log(`${agent.name} starting to generate response...`);
          generateResponse();
        }
      }, responseDelay);
      
      return () => clearTimeout(timer);
    }
  }, [agent, persona, getAllMessages, shouldAutoRespond, generateResponse, agents]);

  // Early return if agent doesn't exist
  if (!agent) {
    return null;
  }

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