import React, { createContext, useContext, useReducer } from 'react';
import { AgentState, AgentContextValue } from '../types/agent';

type AgentAction = 
  | { type: 'ADD_AGENT'; payload: AgentState }
  | { type: 'REMOVE_AGENT'; payload: string }
  | { type: 'UPDATE_AGENT'; payload: { id: string; updates: Partial<AgentState> } };

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

function agentReducer(state: Record<string, AgentState>, action: AgentAction): Record<string, AgentState> {
  switch (action.type) {
    case 'ADD_AGENT':
      return {
        ...state,
        [action.payload.id]: action.payload
      };
    case 'REMOVE_AGENT':
      const { [action.payload]: removed, ...rest } = state;
      return rest;
    case 'UPDATE_AGENT':
      return {
        ...state,
        [action.payload.id]: {
          ...state[action.payload.id],
          ...action.payload.updates
        }
      };
    default:
      return state;
  }
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [agents, dispatch] = useReducer(agentReducer, {});

  const addAgent = (agent: AgentState) => {
    dispatch({ type: 'ADD_AGENT', payload: agent });
  };

  const removeAgent = (id: string) => {
    dispatch({ type: 'REMOVE_AGENT', payload: id });
  };

  const updateAgentState = (id: string, updates: Partial<AgentState>) => {
    dispatch({ type: 'UPDATE_AGENT', payload: { id, updates } });
  };

  const value: AgentContextValue = {
    agents,
    addAgent,
    removeAgent,
    updateAgentState
  };

  return (
    <AgentContext.Provider value={value}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgents() {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error('useAgents must be used within an AgentProvider');
  }
  return context;
} 