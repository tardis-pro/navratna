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
  persona?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  type: 'thought' | 'response' | 'question' | 'system';
  threadRoot?: string;
  threadDepth?: number;
  replyTo?: string;
  mentions?: string[];
  importance?: number;
  keywords?: string[];
  isAgreement?: boolean;
  isDisagreement?: boolean;
  summary?: string;
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

export interface Persona {
  id: string;
  name: string;
  role: string;
  description: string;
  traits: string[];
  expertise: string[];
  systemPrompt: string;
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
} 