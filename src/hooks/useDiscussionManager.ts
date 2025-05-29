import { useState, useCallback, useEffect, useRef } from 'react';
import { DiscussionManager, TurnStrategy } from '../lib/DiscussionManager';
import { AgentState, Message } from '../types/agent';
import { useAgents } from '../contexts/AgentContext';
import { useDocument } from '../contexts/DocumentContext';
import { getModels, ModelOption } from '../components/ModelSelector';
import { migrateAgentModelIds, getModelOptionsForAgent } from '../utils/modelMigration';

interface UseDiscussionManagerProps {
  topic: string;
  maxRounds?: number;
  turnStrategy?: TurnStrategy;
  modelPreferences?: {
    preferredApiType?: 'ollama' | 'llmstudio';
    preferredServer?: string;
  };
}

interface UseDiscussionManagerReturn {
  currentTurn: string | null;
  isActive: boolean;
  history: Message[];
  currentRound: number;
  availableModels: ModelOption[];
  modelsLoading: boolean;
  addAgent: (agentId: string, state: AgentState) => void;
  removeAgent: (agentId: string) => void;
  setModerator: (agentId: string) => void;
  start: () => void;
  stop: () => void;
  addMessage: (agentId: string, content: string) => void;
  setInitialDocument: (document: string) => void;
  updateAgentModel: (agentId: string, modelId: string) => void;
  getAgentModelOptions: (agentId: string) => ModelOption[];
}

export const useDiscussionManager = ({
  topic,
  maxRounds = 3,
  turnStrategy = 'round-robin',
  modelPreferences
}: UseDiscussionManagerProps): UseDiscussionManagerReturn => {
  const agentContext = useAgents();
  const { documents, activeDocumentId } = useDocument();
  const managerRef = useRef<DiscussionManager | null>(null);
  
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [history, setHistory] = useState<Message[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Initialize DiscussionManager when agents are available
  useEffect(() => {
    // Always recreate the DiscussionManager when agents change
    // This ensures it sees newly added agents
    if (Object.keys(agentContext.agents).length > 0) {
      managerRef.current = new DiscussionManager(
        agentContext.agents,
        activeDocumentId ? documents[activeDocumentId] : null,
        (state) => {
          // Update local state when manager state changes
          setCurrentTurn(state.currentSpeakerId);
          setIsActive(state.isRunning);
          setHistory(state.messageHistory);
          setCurrentRound(state.currentRound);
        },
        (agentId, response) => {
          // Handle agent responses
          if (response) {
            const agent = agentContext.agents[agentId];
            if (agent) {
              agentContext.updateAgentState(agentId, {
                currentResponse: response,
                isThinking: false,
                error: null
              });
            }
          }
        },
        agentContext
      );
    } else {
      // Clear the manager if no agents
      managerRef.current = null;
    }
  }, [agentContext.agents, activeDocumentId, documents]);

  // Update document when it changes
  useEffect(() => {
    const activeDocument = activeDocumentId ? documents[activeDocumentId] : null;
    managerRef.current?.updateDocument(activeDocument);
  }, [documents, activeDocumentId]);

  // Update state when manager state changes
  const updateState = useCallback(() => {
    if (!managerRef.current) return;
    
    const state = managerRef.current.getState();
    const context = managerRef.current.getContext();
    setCurrentTurn(state.currentSpeakerId);
    setIsActive(state.isRunning);
    setHistory(state.messageHistory);
    setCurrentRound(context.currentRound);
  }, []);

  // Wrap manager methods to ensure state updates
  const addAgent = useCallback((agentId: string, state: AgentState) => {
    managerRef.current?.addAgent(state);
    updateState();
  }, [updateState]);

  const removeAgent = useCallback((agentId: string) => {
    managerRef.current?.removeAgent(agentId);
    updateState();
  }, [updateState]);

  const setModerator = useCallback((agentId: string) => {
    managerRef.current?.setModerator(agentId);
    updateState();
  }, [updateState]);

  const start = useCallback(() => {
    managerRef.current?.start();
    updateState();
  }, [updateState]);

  const stop = useCallback(() => {
    managerRef.current?.stop();
    updateState();
  }, [updateState]);

  const addMessage = useCallback((agentId: string, content: string) => {
    managerRef.current?.addMessage(agentId, content);
    updateState();
  }, [updateState]);

  const setInitialDocument = useCallback((document: string) => {
    managerRef.current?.setInitialDocument(document);
    updateState();
  }, [updateState]);

  // Update state when topic changes
  useEffect(() => {
    updateState();
  }, [topic, updateState]);

  // Update available models when model preferences change
  useEffect(() => {
    const loadModels = async () => {
      setModelsLoading(true);
      try {
        const models = await getModels();
        setAvailableModels(models);
        
        // Migrate existing agents to use server-specific model IDs
        if (Object.keys(agentContext.agents).length > 0) {
          const migratedAgents = migrateAgentModelIds(agentContext.agents, models);
          
          // Update any agents that were migrated
          Object.entries(migratedAgents).forEach(([agentId, migratedAgent]) => {
            const originalAgent = agentContext.agents[agentId];
            if (originalAgent && originalAgent.modelId !== migratedAgent.modelId) {
              agentContext.updateAgentState(agentId, { modelId: migratedAgent.modelId });
            }
          });
        }
      } catch (error) {
        console.error('Failed to load models:', error);
      } finally {
        setModelsLoading(false);
      }
    };
    
    loadModels();
  }, [agentContext]);

  const updateAgentModel = useCallback((agentId: string, modelId: string) => {
    const agent = agentContext.agents[agentId];
    if (agent) {
      // Extract API type from the model
      const selectedModel = availableModels.find(m => m.id === modelId);
      agentContext.updateAgentState(agentId, {
        modelId: modelId,
        isThinking: false,
        error: null
      });
      updateState();
    }
  }, [agentContext, availableModels, updateState]);

  const getAgentModelOptions = useCallback((agentId: string) => {
    const agent = agentContext.agents[agentId];
    if (agent) {
      return getModelOptionsForAgent(agent.modelId, availableModels);
    }
    return [];
  }, [agentContext, availableModels]);

  return {
    currentTurn,
    isActive,
    history,
    currentRound,
    availableModels,
    modelsLoading,
    addAgent,
    removeAgent,
    setModerator,
    start,
    stop,
    addMessage,
    setInitialDocument,
    updateAgentModel,
    getAgentModelOptions
  };
}; 