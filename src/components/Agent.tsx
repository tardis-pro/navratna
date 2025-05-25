import React, { useCallback, useEffect } from 'react';
import { useAgents } from '../contexts/AgentContext';
import { useDocument } from '../contexts/DocumentContext';
import { LLMService } from '../services/llm';
import { Message } from '../types/agent';
import { AgentAvatar } from './AgentAvatar';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { shouldPersonaActivate, getPersonaById } from '../data/personas';

interface AgentProps {
  id: string;
  className?: string;
}

export const Agent: React.FC<AgentProps> = ({ id, className }) => {
  const { agents, updateAgentState, getAllMessages, addMessage } = useAgents();
  const { documents, activeDocumentId } = useDocument();
  
  const agent = agents[id];
  if (!agent) return null;

  const persona = getPersonaById(id);
  
  // Helper function to limit conversation history to recent messages
  const getOptimizedHistory = (messages: Message[]): Message[] => {
    const MAX_RECENT_MESSAGES = 5;
    const MAX_TOTAL_MESSAGES = 15;
    
    if (messages.length <= MAX_TOTAL_MESSAGES) {
      return messages; // No need to optimize if under limit
    }
    
    // Separate different types of messages
    const systemMessages = messages.filter(m => m.type === "system");
    const conversationMessages = messages.filter(m => m.type !== "system" && m.type !== "thought");
    
    // Always keep system messages (document context, initial prompts)
    const preservedMessages = [...systemMessages];
    
    // Keep the most recent conversation messages
    const recentConversation = conversationMessages.slice(-MAX_RECENT_MESSAGES);
    
    // If we have room, add some earlier important messages (questions, key decisions)
    const remainingSlots = MAX_TOTAL_MESSAGES - preservedMessages.length - recentConversation.length;
    
    if (remainingSlots > 0 && conversationMessages.length > MAX_RECENT_MESSAGES) {
      const earlierMessages = conversationMessages.slice(0, -MAX_RECENT_MESSAGES);
      
      // Prioritize questions and important messages
      const importantEarlier = earlierMessages.filter(m => 
        m.content.includes('?') || 
        m.type === 'question' ||
        m.importance && m.importance > 0.7
      ).slice(-remainingSlots);
      
      preservedMessages.push(...importantEarlier);
    }
    
    // Add recent conversation
    preservedMessages.push(...recentConversation);
    
    // Sort by timestamp to maintain chronological order
    return preservedMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  };

  // Helper function to determine if agent should auto-respond
  const shouldAutoRespond = (lastMessage: Message): boolean => {
    if (!lastMessage || lastMessage.sender === id) return false;
    
    // Check if this persona should be triggered by the content
    const shouldActivate = shouldPersonaActivate(id, lastMessage.content);
    
    // Role-based response logic
    const isJunior = persona?.role === 'Junior Developer';
    const isTechLead = persona?.role === 'Tech Lead';
    const isQA = persona?.role === 'QA Engineer';
    const isSoftwareEngineer = persona?.role === 'Software Engineer';
    
    // Junior developers ask questions when complex topics arise or when they need clarification
    if (isJunior) {
      const complexKeywords = ['architecture', 'scalability', 'design patterns', 'system design', 'technical debt'];
      const hasComplexTopic = complexKeywords.some(keyword => 
        lastMessage.content.toLowerCase().includes(keyword)
      );
      
      // Also respond if someone mentions implementation without explaining it
      const needsClarification = lastMessage.content.includes('implement') || 
                                lastMessage.content.includes('build') ||
                                lastMessage.content.includes('create');
      
      return hasComplexTopic || needsClarification || shouldActivate;
    }
    
    // Tech Lead responds to questions from juniors or when architectural guidance is needed
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
  };

  const generateResponse = useCallback(async () => {
    if (agent.isThinking) return;

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
    const allMessages = getAllMessages();
    const lastMessage = allMessages[allMessages.length - 1];
    
    if (!lastMessage || agent.isThinking) return;
    
    // Check if any other agent is currently thinking to avoid simultaneous responses
    const isAnyAgentThinking = Object.values(agents).some(a => a.isThinking);
    if (isAnyAgentThinking) return;
    
    // Debug logging
    const shouldRespond = shouldAutoRespond(lastMessage);
    if (shouldRespond) {
      console.log(`${agent.name} (${persona?.role}) triggered by: "${lastMessage.content.substring(0, 50)}..."`);
    }
    
    // Add small delay to make conversation feel more natural
    const baseDelay = persona?.role === 'Junior Developer' ? 1000 : 2000;
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
  }, [getAllMessages().length, agent.isThinking, generateResponse, agents]);

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