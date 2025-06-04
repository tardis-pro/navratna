import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDiscussionManager, DiscussionManagerConfig } from '../hooks/useDiscussionManager';
import { AgentState, Message } from '../types/agent';
import { ModelOption } from '../components/ModelSelector';
import { discussionOrchestrationService } from '../services/DiscussionOrchestrationService';
import { ArtifactType } from '../types/artifact';

interface DiscussionContextValue {
  currentTurn: string | null;
  isActive: boolean;
  history: Message[];
  currentRound: number;
  discussionId: string | null;
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
  // Orchestration and Artifact capabilities
  operationId: string | null;
  analyzeConversation: () => Promise<{
    triggers: any[];
    phase: any;
    summary: any;
    suggestions: string[];
  }>;
  generateArtifact: (type: ArtifactType, parameters?: Record<string, any>) => Promise<any>;
  getAvailableArtifactTypes: () => string[];
  getOperationStatus: (operationId: string) => any;
  cancelOperation: (operationId: string) => Promise<void>;
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
  turnStrategy,
  children
}) => {
  const [operationId, setOperationId] = useState<string | null>(null);
  
  const config: DiscussionManagerConfig = {
    topic,
    maxRounds,
    turnStrategy
  };

  const discussionManager = useDiscussionManager(config);

  // Initialize operation when discussion starts
  useEffect(() => {
    if (discussionManager.isActive && discussionManager.discussionId && !operationId) {
      // Create a discussion management operation
      discussionOrchestrationService
        .createDiscussionOperation(discussionManager.discussionId, 'discussion_management')
        .then(setOperationId)
        .catch(error => console.error('Failed to create discussion operation:', error));
    }
  }, [discussionManager.isActive, discussionManager.discussionId, operationId]);

  const analyzeConversation = async () => {
    if (!discussionManager.discussionId) {
      throw new Error('No active discussion to analyze');
    }

    return await discussionOrchestrationService.analyzeConversation(
      discussionManager.discussionId,
      discussionManager.history
    );
  };

  const generateArtifact = async (type: ArtifactType, parameters: Record<string, any> = {}) => {
    if (!discussionManager.discussionId) {
      throw new Error('No active discussion for artifact generation');
    }

    return await discussionOrchestrationService.generateArtifactFromConversation(
      discussionManager.discussionId,
      discussionManager.history,
      type,
      parameters
    );
  };

  const getAvailableArtifactTypes = () => {
    return ['code', 'test', 'documentation', 'prd']; // From ArtifactFactory
  };

  const getOperationStatus = (operationId: string) => {
    return discussionOrchestrationService.getOperationStatus(operationId);
  };

  const cancelOperation = async (operationId: string) => {
    await discussionOrchestrationService.cancelOperation(operationId);
  };

  const contextValue: DiscussionContextValue = {
    currentTurn: discussionManager.currentTurn,
    isActive: discussionManager.isActive,
    history: discussionManager.history,
    currentRound: discussionManager.currentRound,
    discussionId: discussionManager.discussionId,
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
    operationId,
    analyzeConversation,
    generateArtifact,
    getAvailableArtifactTypes,
    getOperationStatus,
    cancelOperation,
    createAgentFromPersona: async (persona: any, name: string, modelId: string) => {
      // Implementation of createAgentFromPersona
      // This would integrate with the orchestration engine to create agents
      if (!discussionManager.discussionId) {
        throw new Error('No active discussion for agent creation');
      }

      // Create an operation for agent creation
      const agentOperationId = await discussionOrchestrationService.createDiscussionOperation(
        discussionManager.discussionId,
        'discussion_management',
        { action: 'create_agent', persona, name, modelId }
      );

      return { operationId: agentOperationId, agentId: `agent-${Date.now()}` };
    }
  };

  return (
    <DiscussionContext.Provider value={contextValue}>
      {children}
    </DiscussionContext.Provider>
  );
}; 