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
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  type: 'thought' | 'response' | 'question';
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
} 