import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAgents } from './AgentContext';
import { useAuth } from './AuthContext';
import uaipAPI from '@/utils/uaip-api';

// Import shared types
import {
  DiscussionParticipant,
  DiscussionMessage,
  Discussion,
  DiscussionStatus,
  TurnStrategy,
  CreateDiscussionRequest,
  MessageType
} from '@uaip/types';

// Import frontend-specific message type
import { Message } from '@/types/frontend-extensions';

interface DiscussionProviderProps {
  topic?: string;
  maxRounds?: number;
  turnStrategy?: TurnStrategy;
  children: React.ReactNode;
}

interface TurnInfo {
  participantId: string;
  startedAt?: Date;
  expectedEndAt?: Date;
  turnNumber: number;
}

interface DiscussionContextType {
  // State
  isActive: boolean;
  isWebSocketConnected: boolean;
  participants: DiscussionParticipant[];
  messages: Message[];
  currentTurn: TurnInfo | null;
  discussionId: string | null;
  isLoading: boolean;
  lastError: string | null;

  // Actions
  start: (topic?: string, agentIds?: string[], enhancedContext?: any) => Promise<void>;
  stop: () => Promise<void>;
  addMessage: (content: string, agentId?: string) => Promise<void>;
}

const DiscussionContext = createContext<DiscussionContextType | null>(null);

export const useDiscussion = (): DiscussionContextType => {
  const context = useContext(DiscussionContext);
  if (!context) {
    throw new Error('useDiscussion must be used within a DiscussionProvider');
  }
  return context;
};

export const DiscussionProvider: React.FC<DiscussionProviderProps> = ({
  topic,
  maxRounds,
  turnStrategy = TurnStrategy.ROUND_ROBIN,
  children
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState<boolean>(true); // Assume connected for now
  const [participants, setParticipants] = useState<DiscussionParticipant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTurn, setCurrentTurn] = useState<TurnInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [discussionId, setDiscussionId] = useState<string | null>(null);
  
  const { agents } = useAgents();
  const { user } = useAuth();

  const start = async (topic?: string, agentIds?: string[], enhancedContext?: any) => {
    if (isActive) {
      console.warn('Discussion is already active');
      return;
    }

    if (!isWebSocketConnected) {
      console.warn('Cannot start discussion: WebSocket not connected');
      return;
    }

    if (!user?.id) {
      console.error('Cannot start discussion: User not authenticated');
      setLastError('User not authenticated');
      return;
    }

    try {
      setIsLoading(true);
      setLastError(null);

      // Use provided topic or default
      const discussionTopic = topic || 'General Discussion';
      
      // Get available agents
      const availableAgents = Object.values(agents).filter(agent => agent.isActive);
      
      if (availableAgents.length === 0) {
        throw new Error('No active agents available for discussion');
      }

      // Use provided agent IDs or select first few available agents
      const selectedAgentIds = agentIds && agentIds.length > 0 
        ? agentIds.filter(id => availableAgents.some(agent => agent.id === id))
        : availableAgents.slice(0, 3).map(agent => agent.id);

      if (selectedAgentIds.length === 0) {
        throw new Error('No valid agents available for discussion');
      }

      if (selectedAgentIds.length < 2) {
        console.warn(`Only ${selectedAgentIds.length} agent(s) available, proceeding with minimum participants`);
      }

      console.log('Starting discussion with agents:', selectedAgentIds);

      // Check if discussion already exists and is active
      if (discussionId) {
        try {
          const existingDiscussion = await uaipAPI.discussions.get(discussionId);
          if (existingDiscussion && existingDiscussion.status === 'active') {
            console.log('Discussion is already active, joining existing discussion');
            setIsActive(true);
            return;
          }
        } catch (error) {
          console.warn('Could not check existing discussion status:', error);
    }
      }

      // Create new discussion if none exists or existing one is not active
      let currentDiscussionId = discussionId;
      
      if (!currentDiscussionId) {
        const createRequest: CreateDiscussionRequest = {
          title: `Discussion: ${discussionTopic}`,
          description: enhancedContext?.purpose 
            ? `${enhancedContext.purpose} discussion to generate ${enhancedContext.targetArtifact}: ${discussionTopic}`
            : `Automated discussion on ${discussionTopic}`,
          topic: discussionTopic,
          createdBy: user.id, // Use actual logged-in user ID (guaranteed to exist due to check above)
          initialParticipants: selectedAgentIds.map(agentId => ({
            agentId,
            role: 'participant' as const
          })),
          settings: {
            maxTurns: maxRounds,
            maxDuration: 3600, // 1 hour default
            strategyConfig: {
              type: 'round_robin' as const,
              skipInactive: true,
              maxSkips: 1
            },
            metadata: enhancedContext ? {
              discussionPurpose: enhancedContext.purpose,
              targetArtifact: enhancedContext.targetArtifact,
              contextType: enhancedContext.contextType,
              originalContext: enhancedContext.originalContext,
              additionalContext: enhancedContext.additionalContext,
              expectedOutcome: enhancedContext.expectedOutcome
            } : undefined
          },
          turnStrategy: {
            strategy: TurnStrategy.ROUND_ROBIN,
            config: {
              type: 'round_robin' as const,
              skipInactive: true,
              maxSkips: 1
            }
          }
        };
        
        console.log('Creating discussion with request:', {
          title: createRequest.title,
          topic: createRequest.topic,
          createdBy: createRequest.createdBy,
          participantCount: createRequest.initialParticipants.length,
          turnStrategy: createRequest.turnStrategy
        });
        
        const newDiscussion = await uaipAPI.discussions.create(createRequest);
        currentDiscussionId = newDiscussion.id;
        setDiscussionId(currentDiscussionId);
      }

      // Try to start the discussion, but handle the case where it's already active
      try {
        await uaipAPI.discussions.start(currentDiscussionId, user?.id);
        console.log('Discussion started successfully');
      } catch (error: any) {
        if (error.message?.includes('cannot be started from status: active')) {
          console.log('Discussion is already active, proceeding...');
        } else {
          throw error;
        }
      }

      // Set discussion as active
      setIsActive(true);
      
      console.log('Discussion setup completed - participants were added during creation');

    } catch (error) {
      console.error('Failed to start discussion:', error);
      
      // Enhanced error logging for validation failures
      if (error instanceof Error) {
        if (error.message.includes('Validation failed')) {
          console.error('Discussion validation failed. Check required fields:', {
            requiredFields: ['title', 'topic', 'createdBy', 'initialParticipants (min 1)'],
            providedData: {
              title: discussionTopic ? `Discussion: ${discussionTopic}` : 'MISSING',
              topic: discussionTopic || 'MISSING',
              createdBy: user?.id || 'MISSING',
              participantCount: selectedAgentIds?.length || 0
            }
          });
        }
        setLastError(error.message);
      } else {
        setLastError('Failed to start discussion');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const stop = async () => {
    if (!isActive || !discussionId) {
      return;
    }

    try {
      setIsLoading(true);
      await uaipAPI.discussions.end(discussionId);
      setIsActive(false);
      setDiscussionId(null);
      setParticipants([]);
      setMessages([]);
      setCurrentTurn(null);
      console.log('Discussion stopped successfully');
    } catch (error) {
      console.error('Failed to stop discussion:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to stop discussion');
    } finally {
      setIsLoading(false);
    }
  };

  const addMessage = async (content: string, agentId?: string) => {
    if (!isActive || !discussionId) {
      console.warn('Cannot add message: discussion not active');
      return;
    }

    try {
      const message = await uaipAPI.discussions.sendMessage(discussionId, {
        content,
        messageType: MessageType.MESSAGE,
        metadata: agentId ? { agentId } : {}
      });

      // Add to local messages
      const newMessage: Message = {
        id: message.id,
        content: message.content,
        sender: agentId || 'user',
        timestamp: new Date(message.createdAt),
        type: 'response' // Map to frontend message type
      };
      
      setMessages(prev => [...prev, newMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      setLastError(error instanceof Error ? error.message : 'Failed to send message');
    }
  };

  const value: DiscussionContextType = {
    isActive,
    isWebSocketConnected,
    participants,
    messages,
    currentTurn,
    discussionId,
    isLoading,
    lastError,
    start,
    stop,
    addMessage
  };

  return (
    <DiscussionContext.Provider value={value}>
      {children}
    </DiscussionContext.Provider>
  );
}; 