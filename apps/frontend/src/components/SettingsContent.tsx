import React, { useState } from 'react';
import { useAgents } from '../contexts/AgentContext';
import { AgentSettings } from './AgentSettings';
import { ModelProviderSettings } from './ModelProviderSettings';
import { Button } from './ui/button';
import { Bot, Server, Settings, Users } from 'lucide-react';

type SettingsTab = 'agents' | 'providers' | 'general';

export const SettingsContent: React.FC = () => {
  const { agents, updateAgentState } = useAgents();
  const [activeTab, setActiveTab] = useState<SettingsTab>('agents');

  const handleRefreshAgents = () => {
    // This could trigger a refresh from the backend if needed
    console.log('Refreshing agents...');
  };

  return (
    <div className="space-y-6">
      {/* Settings Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 pb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Settings
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Configure your AI agents, model providers, and system preferences
        </p>
      </div>

      {/* Settings Tabs */}
      <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        <Button
          variant={activeTab === 'agents' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('agents')}
          className="flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Bot className="w-4 h-4" />
          Agent Settings
        </Button>
        <Button
          variant={activeTab === 'providers' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('providers')}
          className="flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Server className="w-4 h-4" />
          Model Providers
        </Button>
        <Button
          variant={activeTab === 'general' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('general')}
          className="flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Settings className="w-4 h-4" />
          General
        </Button>
      </div>

      {/* Settings Content */}
      <div className="min-h-[500px]">
        {activeTab === 'agents' && (
          <AgentSettings 
            agents={agents}
            onUpdateAgent={updateAgentState}
            onRefreshAgents={handleRefreshAgents}
          />
        )}
        
        {activeTab === 'providers' && (
          <ModelProviderSettings />
        )}
        
        {activeTab === 'general' && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Settings className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                General Settings
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                General settings coming soon...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 