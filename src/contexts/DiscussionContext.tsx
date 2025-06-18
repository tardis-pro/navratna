import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDiscussionManager, DiscussionManagerConfig } from '../hooks/useDiscussionManager';
import { AgentState, Message } from '../types/agent';
import { ModelOption } from '../components/ModelSelector';
import { ArtifactType } from '../types/artifact';
import uaipAPI, { 
  DiscussionEvent, 
  Discussion, 
  DiscussionParticipant, 
  DiscussionMessage,
  TurnInfo,
  Persona
} from '@/utils/uaip-api';

// Discussion Orchestration Flow - Only discussion-related functionality
interface DiscussionOrchestrationFlow {
  createDiscussion: (params: any) => Promise<any>;
  manageParticipants: (discussionId: string, participants: any) => Promise<any>;
  routeMessage: (discussionId: string, message: any) => Promise<any>;
  manageTurn: (discussionId: string) => Promise<any>;
  getDiscussionState: (discussionId: string) => Promise<any>;
  getMessageHistory: (discussionId: string, pagination?: any) => Promise<any>;
  searchDiscussions: (query: string) => Promise<any>;
  analyzeDiscussion: (discussionId: string) => Promise<any>;
  moderateDiscussion: (discussionId: string, action: any) => Promise<any>;
  exportDiscussion: (discussionId: string, format: string) => Promise<any>;
  analyzeSentiment: (discussionId: string) => Promise<any>;
  extractTopics: (discussionId: string) => Promise<any>;
  summarizeDiscussion: (discussionId: string) => Promise<any>;
  getParticipantInsights: (discussionId: string) => Promise<any>;
  getDiscussionTemplates: () => Promise<any>;
  detectConflicts: (discussionId: string) => Promise<any>;
  scheduleDiscussion: (schedule: any) => Promise<any>;
  measureQuality: (discussionId: string) => Promise<any>;
  archiveDiscussion: (discussionId: string) => Promise<any>;
  transcribeDiscussion: (discussionId: string) => Promise<any>;
  branchDiscussion: (discussionId: string, branchPoint: any) => Promise<any>;
  trackEngagement: (discussionId: string) => Promise<any>;
  getRecommendations: (userId: string) => Promise<any>;
  optimizeTurnStrategy: (discussionId: string) => Promise<any>;
}

interface DiscussionContextValue {
  currentTurn: string | null;
  isActive: boolean;
  history: Message[];
  currentRound: number;
  discussionId: string | null;
  discussion: Discussion | null;
  participants: DiscussionParticipant[];
  currentTurnInfo: TurnInfo | null;
  addAgent: (agentId: string, state: AgentState) => Promise<void>;
  removeAgent: (agentId: string) => Promise<void>;
  setModerator: (agentId: string) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  addMessage: (agentId: string, content: string) => Promise<void>;
  setInitialDocument: (document: string) => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  reset: () => Promise<void>;
  syncWithBackend: () => Promise<void>;
  lastError: string | null;
  // Model-related properties
  availableModels: ModelOption[];
  modelsLoading: boolean;
  modelsError: string | null;
  createAgentFromPersona?: (persona: any, name: string, modelId: string) => Promise<any>;
  // Discussion orchestration capabilities
  analyzeConversation: () => Promise<{
    triggers: any[];
    phase: any;
    summary: any;
    suggestions: string[];
  }>;
  generateArtifact: (type: ArtifactType, parameters?: Record<string, any>) => Promise<any>;
  getAvailableArtifactTypes: () => string[];
  
  // Discussion Orchestration Flow Integration
  discussionOrchestration: DiscussionOrchestrationFlow;
  
  // WebSocket connection status
  isWebSocketConnected: boolean;
  websocketError: string | null;
}

interface DiscussionProviderProps {
  topic: string;
  maxRounds?: number;
  turnStrategy?: 'round_robin' | 'moderated' | 'context_aware';
  children: React.ReactNode;
}

const DiscussionContext = createContext<DiscussionContextValue | null>(null);

export const useDiscussion = (): DiscussionContextValue => {
  const context = useContext(DiscussionContext);
  if (!context) {
    throw new Error('useDiscussion must be used within a DiscussionProvider');
  }
  return context;
};

export const DiscussionProvider: React.FC<DiscussionProviderProps> = ({
  topic,
  maxRounds,
  turnStrategy = 'round_robin',
  children
}) => {
  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [participants, setParticipants] = useState<DiscussionParticipant[]>([]);
  const [currentTurnInfo, setCurrentTurnInfo] = useState<TurnInfo | null>(null);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState<boolean>(false);
  const [websocketError, setWebsocketError] = useState<string | null>(null);
  
  const config: DiscussionManagerConfig = {
    topic,
    maxRounds,
    turnStrategy
  };

  const discussionManager = useDiscussionManager(config);

  // Monitor WebSocket connection status
  useEffect(() => {
    try {
      const wsClient = uaipAPI.websocket;
      setIsWebSocketConnected(wsClient.isConnected());
      setWebsocketError(null);
    } catch (error) {
      setIsWebSocketConnected(false);
      setWebsocketError(error instanceof Error ? error.message : 'WebSocket connection failed');
    }
  }, [discussionManager.discussionId]);

  // Sync discussion data when discussionId changes
  useEffect(() => {
    if (discussionManager.discussionId) {
      syncDiscussionData();
    }
  }, [discussionManager.discussionId]);

  const syncDiscussionData = async () => {
    if (!discussionManager.discussionId) return;
    
    try {
      // Get full discussion data
      const discussionData = await uaipAPI.discussions.get(discussionManager.discussionId);
      setDiscussion(discussionData);
      setParticipants(discussionData.participants);
      
      // Get current turn info
      try {
        const turnInfo = await uaipAPI.discussions.getCurrentTurn(discussionManager.discussionId);
        setCurrentTurnInfo(turnInfo);
      } catch (error) {
        console.warn('Could not get turn info:', error);
        setCurrentTurnInfo(null);
      }
    } catch (error) {
      console.error('Failed to sync discussion data:', error);
    }
  };

  // Execute actual discussion orchestration flows
  const executeDiscussionOrchestrationFlow = async (flow: string, params: any) => {
    switch (flow) {
      case 'createDiscussion':
        return await uaipAPI.discussions.create(params);
      case 'getDiscussionState':
        return await uaipAPI.discussions.get(params.discussionId);
      case 'getMessageHistory':
        return await uaipAPI.discussions.getMessages(params.discussionId, params.pagination);
      case 'searchDiscussions':
        return await uaipAPI.discussions.list({ query: params.query });
      case 'manageTurn':
        await uaipAPI.discussions.advanceTurn(params.discussionId);
        return await uaipAPI.discussions.getCurrentTurn(params.discussionId);
      case 'manageParticipants':
        if (params.action === 'add') {
          return await uaipAPI.discussions.addParticipant(params.discussionId, params.participant);
        } else if (params.action === 'remove') {
          return await uaipAPI.discussions.removeParticipant(params.discussionId, params.participantId);
        }
        break;
      case 'routeMessage':
        return await uaipAPI.discussions.sendMessage(params.discussionId, params.message);
      case 'archiveDiscussion':
        return await uaipAPI.discussions.update(params.discussionId, { status: 'archived' });
      default:
        // For flows not yet implemented in the API, return mock data
        return await mockDiscussionApiCall(flow, params);
    }
  };

  // Mock API call function for discussion flows not yet implemented
  const mockDiscussionApiCall = async (flow: string, params: any) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 200));
    
    // Mock different responses based on flow
    if (flow === 'analyzeSentiment') {
      return {
        overall: 'positive',
        timeline: [
          { timestamp: Date.now() - 60000, sentiment: 'neutral' },
          { timestamp: Date.now() - 30000, sentiment: 'positive' },
          { timestamp: Date.now(), sentiment: 'positive' }
        ]
      };
    }
    
    if (flow === 'analyzeDiscussion') {
      return {
        triggers: ['question', 'decision_point'],
        phase: 'active_discussion',
        summary: 'Discussion is progressing well with good participation',
        suggestions: ['Consider summarizing key points', 'Ask for consensus on main topic']
      };
    }
    
    // Default mock response
    return { 
      success: true, 
      flow, 
      params, 
      timestamp: new Date().toISOString(),
      data: `Mock result for discussion ${flow}`
    };
  };

  // Discussion Orchestration Flows - Using real UAIP APIs
  const discussionOrchestration: DiscussionOrchestrationFlow = {
    createDiscussion: (params) => executeDiscussionOrchestrationFlow('createDiscussion', params),
    manageParticipants: (discussionId, participants) => executeDiscussionOrchestrationFlow('manageParticipants', { discussionId, participants }),
    routeMessage: (discussionId, message) => executeDiscussionOrchestrationFlow('routeMessage', { discussionId, message }),
    manageTurn: (discussionId) => executeDiscussionOrchestrationFlow('manageTurn', { discussionId }),
    getDiscussionState: (discussionId) => executeDiscussionOrchestrationFlow('getDiscussionState', { discussionId }),
    getMessageHistory: (discussionId, pagination) => executeDiscussionOrchestrationFlow('getMessageHistory', { discussionId, pagination }),
    searchDiscussions: (query) => executeDiscussionOrchestrationFlow('searchDiscussions', { query }),
    analyzeDiscussion: (discussionId) => executeDiscussionOrchestrationFlow('analyzeDiscussion', { discussionId }),
    moderateDiscussion: (discussionId, action) => executeDiscussionOrchestrationFlow('moderateDiscussion', { discussionId, action }),
    exportDiscussion: (discussionId, format) => executeDiscussionOrchestrationFlow('exportDiscussion', { discussionId, format }),
    analyzeSentiment: (discussionId) => executeDiscussionOrchestrationFlow('analyzeSentiment', { discussionId }),
    extractTopics: (discussionId) => executeDiscussionOrchestrationFlow('extractTopics', { discussionId }),
    summarizeDiscussion: (discussionId) => executeDiscussionOrchestrationFlow('summarizeDiscussion', { discussionId }),
    getParticipantInsights: (discussionId) => executeDiscussionOrchestrationFlow('getParticipantInsights', { discussionId }),
    getDiscussionTemplates: () => executeDiscussionOrchestrationFlow('getDiscussionTemplates', {}),
    detectConflicts: (discussionId) => executeDiscussionOrchestrationFlow('detectConflicts', { discussionId }),
    scheduleDiscussion: (schedule) => executeDiscussionOrchestrationFlow('scheduleDiscussion', schedule),
    measureQuality: (discussionId) => executeDiscussionOrchestrationFlow('measureQuality', { discussionId }),
    archiveDiscussion: (discussionId) => executeDiscussionOrchestrationFlow('archiveDiscussion', { discussionId }),
    transcribeDiscussion: (discussionId) => executeDiscussionOrchestrationFlow('transcribeDiscussion', { discussionId }),
    branchDiscussion: (discussionId, branchPoint) => executeDiscussionOrchestrationFlow('branchDiscussion', { discussionId, branchPoint }),
    trackEngagement: (discussionId) => executeDiscussionOrchestrationFlow('trackEngagement', { discussionId }),
    getRecommendations: (userId) => executeDiscussionOrchestrationFlow('getRecommendations', { userId }),
    optimizeTurnStrategy: (discussionId) => executeDiscussionOrchestrationFlow('optimizeTurnStrategy', { discussionId }),
  };

  // Legacy functions adapted for discussion orchestration
  const analyzeConversation = async () => {
    if (!discussionManager.discussionId) {
      throw new Error('No active discussion to analyze');
    }

    return await discussionOrchestration.analyzeDiscussion(discussionManager.discussionId);
  };

  const generateArtifact = async (type: ArtifactType, parameters: Record<string, any> = {}) => {
    if (!discussionManager.discussionId) {
      throw new Error('No active discussion for artifact generation');
    }

    // This would call artifact service - for now return mock
    return await mockDiscussionApiCall('generateArtifact', {
      discussionId: discussionManager.discussionId,
      messages: discussionManager.history,
      type,
      parameters
    });
  };

  const getAvailableArtifactTypes = () => {
    return ['code', 'test', 'documentation', 'prd'];
  };

  const contextValue: DiscussionContextValue = {
    currentTurn: discussionManager.currentTurn,
    isActive: discussionManager.isActive,
    history: discussionManager.history,
    currentRound: discussionManager.currentRound,
    discussionId: discussionManager.discussionId,
    discussion,
    participants,
    currentTurnInfo,
    addAgent: discussionManager.addAgent,
    removeAgent: discussionManager.removeAgent,
    setModerator: discussionManager.setModerator,
    start: discussionManager.start,
    stop: discussionManager.stop,
    addMessage: discussionManager.addMessage,
    setInitialDocument: discussionManager.setInitialDocument,
    pause: discussionManager.pause,
    resume: discussionManager.resume,
    reset: discussionManager.reset,
    syncWithBackend: discussionManager.syncWithBackend,
    lastError: discussionManager.state.lastError,
    availableModels: [],
    modelsLoading: false,
    modelsError: null,
    analyzeConversation,
    generateArtifact,
    getAvailableArtifactTypes,
    createAgentFromPersona: async (persona: any, name: string, modelId: string) => {
      if (!discussionManager.discussionId) {
        throw new Error('No active discussion for agent creation');
      }

      // Add participant to discussion
      const participant = await uaipAPI.discussions.addParticipant(
        discussionManager.discussionId,
        {
          personaId: persona.id,
          agentId: `agent-${Date.now()}`, // Generate agent ID
          role: 'participant'
        }
      );

      return { participant, agentId: participant.agentId };
    },
    
    // Discussion Orchestration Flow Integration
    discussionOrchestration,
    
    // WebSocket connection status
    isWebSocketConnected,
    websocketError,
  };

  return (
    <DiscussionContext.Provider value={contextValue}>
      {children}
    </DiscussionContext.Provider>
  );
}; 