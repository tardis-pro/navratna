import { useState, useCallback, useEffect, useRef } from 'react';
import { DiscussionManager, TurnStrategy } from '../lib/DiscussionManager';
import { AgentState, Message } from '../types/agent';
import { useAgents } from '../contexts/AgentContext';
import { useDocument } from '../contexts/DocumentContext';
import { softwareDevPersonas } from '../data/personas';

interface UseDiscussionManagerProps {
  topic: string;
  maxRounds?: number;
  turnStrategy?: TurnStrategy;
}

interface UseDiscussionManagerReturn {
  currentTurn: string | null;
  isActive: boolean;
  history: Message[];
  currentRound: number;
  addAgent: (agentId: string, state: AgentState) => void;
  removeAgent: (agentId: string) => void;
  setModerator: (agentId: string) => void;
  start: () => void;
  stop: () => void;
  addMessage: (agentId: string, content: string) => void;
  setInitialDocument: (document: string) => void;
}

export const useDiscussionManager = ({
  topic,
  maxRounds = 3,
  turnStrategy = 'round-robin'
}: UseDiscussionManagerProps): UseDiscussionManagerReturn => {
  const agentContext = useAgents();
  const { documents, activeDocumentId } = useDocument();
  const managerRef = useRef<DiscussionManager | null>(null);
  
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [history, setHistory] = useState<Message[]>([]);
  const [currentRound, setCurrentRound] = useState(0);

  // Initialize default agents if none exist
  useEffect(() => {
    if (Object.keys(agentContext.agents).length === 0) {
      const defaultAgents: Omit<AgentState, 'persona' | 'systemPrompt'>[] = [
        {
          id: 'ter',
          name: 'ter',
          role: 'Software Engineer',
          modelId: 'phi-4-mini-instruct',
          apiType: 'llmstudio' as const,
          isThinking: false,
          currentResponse: null,
          conversationHistory: [],
          error: null
        },
        {
          id: 'test',
          name: 'test',
          role: 'Junior Developer',
          modelId: 'cogito:14b',
          apiType: 'ollama' as const,
          isThinking: false,
          currentResponse: null,
          conversationHistory: [],
          error: null
        },
        {
          id: 'ssmartest',
          name: 'ssmartest',
          role: 'Tech Lead',
          modelId: 'openthinker2-7b',
          apiType: 'llmstudio' as const,
          isThinking: false,
          currentResponse: null,
          conversationHistory: [],
          error: null
        }
      ];

      // Add each default agent
      defaultAgents.forEach(agent => {
        const persona = softwareDevPersonas.find(p => p.role === agent.role);
        if (persona) {
          agentContext.addAgent({
            ...agent,
            persona: persona.description,
            systemPrompt: persona.systemPrompt
          });
        }
      });
    }
  }, [agentContext]);

  // Initialize DiscussionManager after agents are set up
  useEffect(() => {
    if (Object.keys(agentContext.agents).length > 0 && !managerRef.current) {
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
    }
  }, [agentContext.agents, activeDocumentId, documents, agentContext]);

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

  return {
    currentTurn,
    isActive,
    history,
    currentRound,
    addAgent,
    removeAgent,
    setModerator,
    start,
    stop,
    addMessage,
    setInitialDocument
  };
}; 