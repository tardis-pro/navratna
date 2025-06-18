import { ModelOption, findModelsByName, extractModelName } from '@/components/ModelSelector';
import { AgentState } from '@/types/agent';

// Migration utility to update agents with legacy model IDs
export const migrateAgentModelIds = (
  agents: Record<string, AgentState>, 
  allModels: ModelOption[]
): Record<string, AgentState> => {
  const migratedAgents: Record<string, AgentState> = {};

  Object.entries(agents).forEach(([agentId, agent]) => {
    const migratedAgent = { ...agent };
    
    // Check if the model ID is already server-prefixed
    if (!agent.modelId.includes('://')) {
      // This is a legacy model ID, try to find a matching model
      const matchingModels = findModelsByName(allModels, agent.modelId);
      
      if (matchingModels.length > 0) {
        // Prefer the first available model (you could add more sophisticated logic here)
        migratedAgent.modelId = matchingModels[0].id;
        console.log(`Migrated agent ${agentId} from ${agent.modelId} to ${matchingModels[0].id}`);
        
        // If multiple models found, log the options
        if (matchingModels.length > 1) {
          console.warn(`Multiple servers have model "${agent.modelId}". Using ${matchingModels[0].source}. Available options:`, 
            matchingModels.map(m => m.source));
        }
      } else {
        console.warn(`No model found for agent ${agentId} with model ID: ${agent.modelId}`);
      }
    }
    
    migratedAgents[agentId] = migratedAgent;
  });

  return migratedAgents;
};

// Helper to get available model options for an agent based on model name
export const getModelOptionsForAgent = (
  agentModelId: string, 
  allModels: ModelOption[]
): ModelOption[] => {
  const modelName = extractModelName(agentModelId);
  return findModelsByName(allModels, modelName);
};

// Helper to suggest better model assignments based on role or preferences
export const suggestModelForAgent = (
  agent: AgentState, 
  allModels: ModelOption[],
  preferences?: {
    preferredApiType?: 'ollama' | 'llmstudio';
    preferredServer?: string;
  }
): ModelOption | null => {
  const modelName = extractModelName(agent.modelId);
  const availableModels = findModelsByName(allModels, modelName);
  
  if (availableModels.length === 0) return null;
  if (availableModels.length === 1) return availableModels[0];
  
  // Apply preferences if provided
  if (preferences?.preferredApiType) {
    const filtered = availableModels.filter(m => m.apiType === preferences.preferredApiType);
    if (filtered.length > 0) return filtered[0];
  }
  
  if (preferences?.preferredServer) {
    const filtered = availableModels.filter(m => m.source === preferences.preferredServer);
    if (filtered.length > 0) return filtered[0];
  }
  
  // Default to first available
  return availableModels[0];
}; 