import React, { createContext, useContext, useReducer } from 'react';
import { AgentState, AgentContextValue, Message } from '../types/agent';
import { 
  ToolCall, 
  ToolResult, 
  ToolUsageRecord, 
  ToolPermissionSet,
  ToolPreferences,
  ToolBudget 
} from '../types/tool';
import { 
  executeToolCall as executeToolCallService, 
  getToolExecutionStatus,
  approveToolExecution as approveToolExecutionService 
} from '../services/tools/tool-execution-engine';

type AgentAction = 
  | { type: 'ADD_AGENT'; payload: AgentState }
  | { type: 'REMOVE_AGENT'; payload: string }
  | { type: 'UPDATE_AGENT'; payload: { id: string; updates: Partial<AgentState> } }
  | { type: 'ADD_MESSAGE'; payload: { agentId: string; message: Message } }
  | { type: 'REMOVE_MESSAGE'; payload: { agentId: string; messageId: string } }
  | { type: 'UPDATE_TOOL_PERMISSIONS'; payload: { agentId: string; permissions: Partial<ToolPermissionSet> } }
  | { type: 'ADD_TOOL_USAGE'; payload: { agentId: string; usage: ToolUsageRecord } };

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

// Helper function to create default tool properties for new agents
function createDefaultToolProperties(): {
  availableTools: string[];
  toolPermissions: ToolPermissionSet;
  toolUsageHistory: ToolUsageRecord[];
  toolPreferences: ToolPreferences;
  maxConcurrentTools: number;
  toolBudget?: ToolBudget;
} {
  return {
    availableTools: [
      'math-calculator',
      'text-analysis',
      'time-utility',
      'uuid-generator'
    ], // Default safe tools
    toolPermissions: {
      allowedTools: [
        'math-calculator',
        'text-analysis',
        'time-utility',
        'uuid-generator'
      ],
      deniedTools: [],
      maxCostPerHour: 100,
      maxExecutionsPerHour: 50,
      requireApprovalFor: ['restricted', 'dangerous'],
      canApproveTools: false
    },
    toolUsageHistory: [],
    toolPreferences: {
      preferredTools: {
        'computation': ['math-calculator', 'time-utility'],
        'analysis': ['text-analysis'],
        'api': [],
        'file-system': [],
        'database': [],
        'web-search': [],
        'code-execution': [],
        'communication': [],
        'knowledge-graph': [],
        'deployment': [],
        'monitoring': [],
        'generation': ['uuid-generator']
      },
      fallbackTools: {},
      timeoutPreference: 30000, // 30 seconds
      costLimit: 10 // Max cost per operation
    },
    maxConcurrentTools: 3,
    toolBudget: {
      dailyLimit: 200,
      hourlyLimit: 50,
      currentDailySpent: 0,
      currentHourlySpent: 0,
      resetTime: new Date()
    }
  };
}

function agentReducer(state: Record<string, AgentState>, action: AgentAction): Record<string, AgentState> {
  switch (action.type) {
    case 'ADD_AGENT': {
      // Ensure new agents have tool properties
      const toolProperties = createDefaultToolProperties();
      return {
        ...state,
        [action.payload.id]: {
          ...action.payload,
          ...toolProperties,
          conversationHistory: []
        }
      };
    }
    case 'REMOVE_AGENT': {
      const { [action.payload]: removed, ...rest } = state;
      return rest;
    }
    case 'UPDATE_AGENT': {
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
    }
    case 'ADD_MESSAGE': {
      const agent = state[action.payload.agentId];
      if (!agent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...agent,
          conversationHistory: [...agent.conversationHistory, action.payload.message]
        }
      };
    }
    case 'REMOVE_MESSAGE': {
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
    }
    case 'UPDATE_TOOL_PERMISSIONS': {
      const agent = state[action.payload.agentId];
      if (!agent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...agent,
          toolPermissions: {
            ...agent.toolPermissions,
            ...action.payload.permissions
          }
        }
      };
    }
    case 'ADD_TOOL_USAGE': {
      const agent = state[action.payload.agentId];
      if (!agent) return state;
      return {
        ...state,
        [action.payload.agentId]: {
          ...agent,
          toolUsageHistory: [...agent.toolUsageHistory, action.payload.usage]
        }
      };
    }
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

  const getAllMessages = (): Message[] => {
    const allMessages: Message[] = [];
    Object.values(agents).forEach(agent => {
      allMessages.push(...agent.conversationHistory);
    });
    // Sort by timestamp to get chronological order
    return allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  };

  // Tool-related methods
  const executeToolCall = async (agentId: string, toolCall: ToolCall): Promise<ToolResult> => {
    const agent = agents[agentId];
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Check if agent can use this tool
    if (!agent.toolPermissions.allowedTools.includes(toolCall.toolId)) {
      throw new Error(`Agent ${agentId} is not authorized to use tool ${toolCall.toolId}`);
    }

    // Check if tool is denied
    if (agent.toolPermissions.deniedTools.includes(toolCall.toolId)) {
      throw new Error(`Tool ${toolCall.toolId} is explicitly denied for agent ${agentId}`);
    }

    try {
      // Update agent state to show tool usage
      updateAgentState(agentId, { 
        isUsingTool: true,
        currentToolExecution: undefined // Will be set by execution engine
      });

      // Execute the tool call
      const execution = await executeToolCallService(toolCall, agentId);
      
      // Update current tool execution
      updateAgentState(agentId, { 
        currentToolExecution: execution 
      });

      // Wait for completion (for now, poll - in production use events)
      const result = await waitForExecution(execution.id);
      
      // Record usage
      const usage: ToolUsageRecord = {
        toolId: toolCall.toolId,
        agentId,
        timestamp: new Date(),
        success: result.success,
        executionTime: result.executionTime,
        cost: result.cost,
        errorType: result.error?.type
      };
      
      dispatch({ type: 'ADD_TOOL_USAGE', payload: { agentId, usage } });

      // Update agent state
      updateAgentState(agentId, { 
        isUsingTool: false,
        currentToolExecution: undefined 
      });

      return result;
    } catch (error) {
      // Update agent state on error
      updateAgentState(agentId, { 
        isUsingTool: false,
        currentToolExecution: undefined 
      });
      throw error;
    }
  };

  const approveToolExecution = async (executionId: string, approverId: string): Promise<boolean> => {
    return approveToolExecutionService(executionId, approverId);
  };

  const getToolUsageHistory = (agentId: string): ToolUsageRecord[] => {
    const agent = agents[agentId];
    return agent?.toolUsageHistory || [];
  };

  const updateToolPermissions = (agentId: string, permissions: Partial<ToolPermissionSet>) => {
    dispatch({ type: 'UPDATE_TOOL_PERMISSIONS', payload: { agentId, permissions } });
  };

  // Helper function to wait for tool execution completion
  async function waitForExecution(executionId: string): Promise<ToolResult> {
    // Simple polling implementation - in production, use WebSockets or events
    const maxAttempts = 30; // 30 seconds max wait
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const execution = await getToolExecutionStatus(executionId);
      if (!execution) {
        throw new Error(`Execution ${executionId} not found`);
      }

      if (execution.status === 'completed') {
        return {
          callId: execution.id,
          executionId: execution.id,
          success: true,
          result: execution.result,
          executionTime: execution.executionTimeMs || 0,
          cost: execution.cost
        };
      }

      if (execution.status === 'failed') {
        return {
          callId: execution.id,
          executionId: execution.id,
          success: false,
          error: execution.error,
          executionTime: execution.executionTimeMs || 0,
          cost: execution.cost
        };
      }

      // Wait 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error(`Tool execution ${executionId} timed out`);
  }

  const value: AgentContextValue = {
    agents,
    addAgent,
    removeAgent,
    updateAgentState,
    addMessage,
    removeMessage,
    getAllMessages,
    executeToolCall,
    approveToolExecution,
    getToolUsageHistory,
    updateToolPermissions
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