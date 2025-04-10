import { useState, useCallback, useEffect } from 'react';
import { DiscussionManager, TurnStrategy } from '../lib/DiscussionManager';
import { AgentState, Message } from '../types/agent';

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
  const [manager] = useState(() => new DiscussionManager(topic, maxRounds, turnStrategy));
  const [currentTurn, setCurrentTurn] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [history, setHistory] = useState<Message[]>([]);
  const [currentRound, setCurrentRound] = useState(0);

  // Update state when manager state changes
  const updateState = useCallback(() => {
    const context = manager.getContext();
    setCurrentTurn(manager.getCurrentTurn());
    setIsActive(context.isActive);
    setHistory(context.history);
    setCurrentRound(context.currentRound);
  }, [manager]);

  // Wrap manager methods to ensure state updates
  const addAgent = useCallback((agentId: string, state: AgentState) => {
    manager.addAgent(agentId, state);
    updateState();
  }, [manager, updateState]);

  const removeAgent = useCallback((agentId: string) => {
    manager.removeAgent(agentId);
    updateState();
  }, [manager, updateState]);

  const setModerator = useCallback((agentId: string) => {
    manager.setModerator(agentId);
    updateState();
  }, [manager, updateState]);

  const start = useCallback(() => {
    manager.start();
    updateState();
  }, [manager, updateState]);

  const stop = useCallback(() => {
    manager.stop();
    updateState();
  }, [manager, updateState]);

  const addMessage = useCallback((agentId: string, content: string) => {
    manager.addMessage(agentId, content);
    updateState();
  }, [manager, updateState]);

  const setInitialDocument = useCallback((document: string) => {
    manager.setInitialDocument(document);
    updateState();
  }, [manager, updateState]);

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