import { Persona } from './persona';
import { 
  ToolPermissionSet, 
  ToolUsageRecord, 
  ToolExecution, 
  ToolPreferences, 
  ToolBudget,
  ToolCapableMessage,
  ToolCall,
  ToolResult
} from './tool';

export interface AgentState {
  id: string;
  name: string;
  currentResponse: string | null;
  conversationHistory: Message[];
  isThinking: boolean;
  error: string | null;
  modelId: string;
  apiType: 'ollama' | 'llmstudio';
  role: string;
  persona?: Persona;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  
  // Tool-related properties (new)
  availableTools: string[];
  toolPermissions: ToolPermissionSet;
  toolUsageHistory: ToolUsageRecord[];
  currentToolExecution?: ToolExecution;
  toolPreferences: ToolPreferences;
  maxConcurrentTools: number;
  toolBudget?: ToolBudget;
  isUsingTool?: boolean; // Indicates if agent is currently executing a tool
}

export type ConversationPattern = 'interruption' | 'build-on' | 'clarification' | 'concern' | 'expertise';

export interface Message extends ToolCapableMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  type: 'thought' | 'response' | 'question' | 'system' | 'tool-call' | 'tool-result';
  threadRoot?: string;
  threadDepth?: number;
  replyTo?: string;
  mentions?: string[];
  importance?: number;
  keywords?: string[];
  isAgreement?: boolean;
  isDisagreement?: boolean;
  summary?: string;
  conversationPattern?: ConversationPattern;
  triggeredPersonas?: string[];
  sentiment?: {
    score: number;  // -1 to 1, where -1 is very negative, 1 is very positive
    keywords: string[];  // Words that influenced the sentiment
  };
  logicalAnalysis?: {
    fallacies: Array<{
      type: string;
      confidence: number;
      snippet: string;
    }>;
    hasValidArgument: boolean;
  };
}

export interface AgentProps {
  id: string;
  name: string;
  persona: Persona;
  onResponse: (response: string) => void;
  conversationHistory: Message[];
}

export interface AgentContextValue {
  agents: Record<string, AgentState>;
  addAgent: (agent: AgentState) => void;
  removeAgent: (id: string) => void;
  updateAgentState: (id: string, updates: Partial<AgentState>) => void;
  addMessage: (agentId: string, message: Message) => void;
  removeMessage: (agentId: string, messageId: string) => void;
  getAllMessages: () => Message[];
  
  // Tool-related methods (new)
  executeToolCall: (agentId: string, toolCall: ToolCall) => Promise<ToolResult>;
  approveToolExecution: (executionId: string, approverId: string) => Promise<boolean>;
  getToolUsageHistory: (agentId: string) => ToolUsageRecord[];
  updateToolPermissions: (agentId: string, permissions: Partial<ToolPermissionSet>) => void;
} 