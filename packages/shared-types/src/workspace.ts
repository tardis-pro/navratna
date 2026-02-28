export enum WorkspaceStatus {
  INITIALIZING = 'initializing',
  READY = 'ready',
  BUSY = 'busy',
  STOPPED = 'stopped',
  ERROR = 'error',
}

export enum CodingSessionStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  COMPACTING = 'compacting',
  CLOSED = 'closed',
  ERROR = 'error',
}

export enum CodingLLMProviderType {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  OPENAI_CODEX = 'openai-codex',
  GITHUB_COPILOT = 'github-copilot',
  GOOGLE_GEMINI = 'google',
  GOOGLE_GEMINI_CLI = 'google-gemini-cli',
  GROQ = 'groq',
  MISTRAL = 'mistral',
  OPENROUTER = 'openrouter',
}

export interface Workspace {
  id: string;
  projectId: string;
  userId: string;
  status: WorkspaceStatus;
  githubRepo: string; // owner/repo format e.g. "acme/my-project"
  githubCloneUrl: string; // https clone URL
  dockerContainerId?: string;
  workingBranch: string; // current active branch
  workspacePath: string; // path inside container e.g. /workspace/proj-id
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt?: Date;
  metadata?: Record<string, any>;
}

export interface CodingSession {
  id: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  status: CodingSessionStatus;
  piSessionId?: string; // pi-coding-agent JSONL session ID
  llmProvider: CodingLLMProviderType;
  llmModel: string; // e.g. "claude-sonnet-4-20250514"
  totalTokens: number;
  totalCost: number; // USD
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  metadata?: Record<string, any>;
}

export interface LLMProviderCredential {
  id: string;
  userId: string;
  provider: CodingLLMProviderType;
  credentialType: 'api_key' | 'oauth';
  // api_key fields
  apiKey?: string; // encrypted at rest
  // oauth fields
  accessToken?: string; // encrypted at rest
  refreshToken?: string; // encrypted at rest
  tokenExpiresAt?: Date;
  // common
  isActive: boolean;
  connectedAt: Date;
  lastUsedAt?: Date;
  metadata?: Record<string, any>;
}
