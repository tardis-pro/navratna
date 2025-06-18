import React from 'react';
import { useAgents } from '../contexts/AgentContext';
import { AgentSettings } from './AgentSettings';

export const SettingsContent: React.FC = () => {
  const { agents, updateAgentState } = useAgents();

  const handleRefreshAgents = () => {
    // This could trigger a refresh from the backend if needed
    console.log('Refreshing agents...');
  };

  return (
    <AgentSettings 
      agents={agents}
      onUpdateAgent={updateAgentState}
      onRefreshAgents={handleRefreshAgents}
    />
  );
}; 