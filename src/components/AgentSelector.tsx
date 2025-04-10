import React, { useState } from 'react';
import { AgentState } from '../types/agent';
import { useAgents } from '../contexts/AgentContext';
import { ModelOption } from './ModelSelector';
import { softwarePersonas, policyPersonas, personaPrompts } from '../data/personas';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

export const AgentSelector: React.FC = () => {
  const { agents, addAgent } = useAgents();
  const [selectedTab, setSelectedTab] = useState<'software' | 'policy'>('software');

  const handleAgentSelect = (agent: ModelOption) => {
    const newAgent: AgentState = {
      id: agent.id,
      name: agent.name,
      modelId: agent.id,
      apiType: agent.apiType,
      role: agent.name,
      systemPrompt: personaPrompts[agent.id],
      currentResponse: null,
      conversationHistory: [],
      isThinking: false,
      error: null,
    };
    addAgent(newAgent);
  };

  const isDisabled = Object.keys(agents).length >= 4; // Limit to 4 agents

  const renderPersonaOption = (persona: ModelOption) => {
    const isSelected = agents[persona.id] !== undefined;
    
    return (
      <Card
        key={persona.id}
        className={`p-4 cursor-pointer transition-all ${
          isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
        } ${isDisabled && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => {
          if (!isDisabled || isSelected) {
            handleAgentSelect(persona);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">{persona.name}</h3>
            <p className="text-sm text-gray-500">{persona.description}</p>
          </div>
          {isSelected && (
            <span className="text-blue-500 text-sm">Selected</span>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Select Agents</h2>
      <p className="text-sm text-gray-500">
        Choose up to 4 agents to participate in the discussion
      </p>

      <Tabs value={selectedTab} onValueChange={(value: 'software' | 'policy') => setSelectedTab(value)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="software">Software Development</TabsTrigger>
          <TabsTrigger value="policy">Policy Debate</TabsTrigger>
        </TabsList>
        <TabsContent value="software" className="space-y-2">
          {softwarePersonas.map(renderPersonaOption)}
        </TabsContent>
        <TabsContent value="policy" className="space-y-2">
          {policyPersonas.map(renderPersonaOption)}
        </TabsContent>
      </Tabs>

      {/* Display active agents */}
      {Object.values(agents).length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Active Agents</h3>
          <div className="space-y-2">
            {Object.values(agents).map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-2 bg-white rounded-md shadow-sm"
              >
                <div>
                  <div className="font-medium">{agent.name}</div>
                  <div className="text-sm text-gray-500">{agent.role}</div>
                </div>
                {agent.isThinking && (
                  <div className="animate-pulse text-gray-400">
                    Thinking...
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}; 