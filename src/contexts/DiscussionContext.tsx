import React, { createContext, useContext } from 'react';
import { useDiscussionManager } from '../hooks/useDiscussionManager';
import { TurnStrategy } from '../lib/DiscussionManager';
import { AgentState, Message } from '../types/agent';

interface DiscussionContextValue {
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

interface DiscussionProviderProps {
  topic: string;
  maxRounds?: number;
  turnStrategy?: TurnStrategy;
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
  const discussionManager = useDiscussionManager({
    topic,
    maxRounds,
    turnStrategy
  });

  return (
    <DiscussionContext.Provider value={discussionManager}>
      {children}
    </DiscussionContext.Provider>
  );
}; 