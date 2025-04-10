import React, { createContext, useContext, useReducer } from 'react';
import { AgentState, AgentContextValue, Message } from '../types/agent';

type AgentAction = 
  | { type: 'ADD_AGENT'; payload: AgentState }
  | { type: 'REMOVE_AGENT'; payload: string }
  | { type: 'UPDATE_AGENT'; payload: { id: string; updates: Partial<AgentState> } }
  | { type: 'ADD_MESSAGE'; payload: { agentId: string; message: Message } }
  | { type: 'REMOVE_MESSAGE'; payload: { agentId: string; messageId: string } };

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

function agentReducer(state: Record<string, AgentState>, action: AgentAction): Record<string, AgentState> {
  switch (action.type) {
    case 'ADD_AGENT':
      return {
        ...state,
        [action.payload.id]: {
          ...action.payload,
          conversationHistory: []
        }
      };
    case 'REMOVE_AGENT':
      const { [action.payload]: removed, ...rest } = state;
      return rest;
    case 'UPDATE_AGENT':
      const existingAgent = state[action.payload.id];
      if (!existingAgent) return state;
      return {
        ...state,
        [action.payload.id]: {
          ...existingAgent,
          ...action.payload.updates,
          conversationHistory: action.payload.updates.conversationHistory || existingAgent.conversationHistory
        }
      };
    case 'ADD_MESSAGE':
      const agent = state[action.payload.agentId];
      if (!agent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...agent,
          conversationHistory: [...agent.conversationHistory, action.payload.message]
        }
      };
    case 'REMOVE_MESSAGE':
      const targetAgent = state[action.payload.agentId];
      if (!targetAgent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...targetAgent,
          conversationHistory: targetAgent.conversationHistory.filter(
            msg => msg.id !== action.payload.messageId
          )
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

  const addMessage = (agentId: string, message: Message) => {
    dispatch({ type: 'ADD_MESSAGE', payload: { agentId, message } });
  };

  const removeMessage = (agentId: string, messageId: string) => {
    dispatch({ type: 'REMOVE_MESSAGE', payload: { agentId, messageId } });
  };

  const value: AgentContextValue = {
    agents,
    addAgent,
    removeAgent,
    updateAgentState,
    addMessage,
    removeMessage
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