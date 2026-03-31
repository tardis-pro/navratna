export type {
  FrontendMessage as Message,
  FrontendConversationPattern as ConversationPattern,
  MessageSearchOptions,
  FrontendDiscussionEvent as DiscussionEvent,
  PersonaDisplay,
  PersonaSearchResponse,
  DiscussionSearchResponse,
  DiscussionParticipantCreate,
  DiscussionMessageCreate,
  FrontendAgentState as AgentState,
  FrontendAgentProps as AgentProps,
  FrontendModelProvider as ModelProvider,
  FrontendModelInfo as ModelInfo,
  FrontendAgentContextValue as AgentContextValue,
} from '@uaip/types';

import type { Agent, Persona } from '@uaip/types';
import type { FrontendAgentState } from '@uaip/types';
import { AgentRole, LLMProviderType, SecurityLevel } from '@uaip/types';

export const createAgentStateFromShared = (
  sharedAgent: Agent,
  persona?: Persona
): FrontendAgentState => {
  return {
    ...sharedAgent,
    role: sharedAgent.role || AgentRole.ASSISTANT,
    currentResponse: null,
    conversationHistory: [],
    isThinking: false,
    error: null,
    modelId: sharedAgent.modelId || 'unknown',
    apiType: sharedAgent.apiType || LLMProviderType.OLLAMA,
    persona,
    availableTools: [],
    toolPermissions: {
      allowedTools: [],
      deniedTools: [],
      requireApprovalFor: [SecurityLevel.HIGH, SecurityLevel.CRITICAL],
      canApproveTools: false,
      maxCostPerHour: 100,
      maxExecutionsPerHour: 50,
    },
    toolUsageHistory: [],
    toolPreferences: {
      preferredTools: {
        api: [],
        computation: [],
        'file-system': [],
        database: [],
        'web-search': [],
        'code-execution': [],
        communication: [],
        'knowledge-graph': [],
        deployment: [],
        monitoring: [],
        analysis: [],
        generation: [],
        system: [],
        network: [],
        development: [],
        mcp: [],
      },
      fallbackTools: {},
      timeoutPreference: 30000,
      costLimit: 10,
    },
    maxConcurrentTools: 1,
    isUsingTool: false,
  };
};
