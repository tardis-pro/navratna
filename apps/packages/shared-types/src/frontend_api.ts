import type { RiskLevel } from './security.js';
import type { AgentAnalysis } from './agent.js';
import type { AgentChatThreadSummary } from './agent_chat.js';
import type { Question, QuestionPack, Assumption, Contradiction } from './knowledge_graph.js';
import type { NormalizedBrief as QFNormalizedBrief } from './questionforge.js';

interface PolicyRule {
  id?: string;
  type: 'allow' | 'deny' | 'require_approval';
  resource: string;
  action: string;
  conditions?: Record<string, unknown>;
  riskLevel?: RiskLevel;
}

export interface UserPersonaData {
  workStyle: 'collaborative' | 'independent' | 'hybrid';
  communicationPreference: 'brief' | 'detailed' | 'visual';
  domainExpertise: string[];
  toolPreferences: string[];
  workflowStyle: 'structured' | 'flexible' | 'experimental';
  problemSolvingApproach: 'analytical' | 'creative' | 'pragmatic';
  decisionMaking: 'quick' | 'deliberate' | 'consensus';
  learningStyle: 'hands-on' | 'theoretical' | 'collaborative';
  timeManagement: 'deadline-driven' | 'flexible' | 'time-blocked';
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
}

export interface OnboardingProgress {
  isCompleted: boolean;
  currentStep: number;
  completedSteps: string[];
  startedAt?: Date;
  completedAt?: Date;
  responses: Record<string, unknown>;
}

export interface BehavioralPatterns {
  sessionDuration: number;
  activeHours: string[];
  frequentlyUsedTools: string[];
  preferredAgents: string[];
  workflowPatterns: string[];
  interactionStyle: 'direct' | 'exploratory' | 'methodical';
  feedbackPreference: 'immediate' | 'summary' | 'detailed';
}

export interface UserPersonaUpdate {
  personaData?: Partial<UserPersonaData>;
  onboardingProgress?: Partial<OnboardingProgress>;
  behavioralPatterns?: Partial<BehavioralPatterns>;
}

export interface UserPersonaResponse {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  userPersona?: UserPersonaData;
  onboardingProgress?: OnboardingProgress;
  behavioralPatterns?: BehavioralPatterns;
  updatedAt: string;
}

export interface PersonaRecommendations {
  recommendedTools: Array<{
    id: string;
    name: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  recommendedAgents: Array<{
    id: string;
    name: string;
    reason: string;
    compatibility: number;
  }>;
  workflowSuggestions: Array<{
    id: string;
    title: string;
    description: string;
    steps: string[];
  }>;
  uiCustomizations: {
    layout: string;
    density: 'compact' | 'comfortable' | 'spacious';
    theme: 'default' | 'focus' | 'creative';
    notifications: 'minimal' | 'standard' | 'detailed';
  };
}

export interface PersonaInsights {
  completionRate: number;
  strongestTraits: string[];
  growthAreas: string[];
  personalityType: string;
  workStyleMatch: number;
  recommendations: PersonaRecommendations;
}

export interface KnowledgeUploadRequest {
  title: string;
  content: string;
  type?: 'document' | 'concept' | 'entity' | 'relation';
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface KnowledgeSearchResult {
  item: {
    id: string;
    title: string;
    content: string;
    type: 'document' | 'concept' | 'entity' | 'relation';
    category?: string;
    tags?: string[];
    embedding?: number[];
    metadata?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
  };
  score: number;
  highlights?: string[];
  relatedItems?: string[];
}

export interface KnowledgeRelation {
  id: string;
  fromId: string;
  toId: string;
  relationType: string;
  strength?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface KnowledgeStats {
  totalItems: number;
  itemsByType: Record<string, number>;
  itemsByCategory: Record<string, number>;
  totalRelations: number;
  recentUploads: number;
  storageUsed: number;
  topTags: Array<{
    tag: string;
    count: number;
  }>;
}

export interface KnowledgeGraph {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    properties?: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
    properties?: Record<string, unknown>;
  }>;
}

export interface MessageRequest {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface TurnRequest {
  participantId: string;
  action: 'pass' | 'complete';
  reason?: string;
}

export interface DiscussionListOptions {
  page?: number;
  limit?: number;
  status?: string | string[];
  participantId?: string;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface AgentHealthCheck {
  status: string;
  message?: string;
  timestamp: string;
  dependencies?: {
    [key: string]: {
      status: string;
      message?: string;
    };
  };
}

export interface AgentListOptions {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  search?: string;
}

export interface AgentLearningData {
  executionId: string;
  outcome: 'success' | 'failure' | 'partial';
  feedback?: string;
  metrics?: Record<string, unknown>;
}

export interface AgentParticipationRequest {
  discussionId: string;
  message?: string;
  turnData?: unknown;
}

/**
 * One prior turn of a direct agent chat, as the UI keeps it locally. `sender` is
 * the coarse UI role ('user' | 'agent'), NOT a user id — the backend maps it onto
 * the canonical ChatMessage `type` before the turn reaches the model.
 */
export interface AgentChatHistoryEntry {
  content: string;
  sender: string;
  timestamp: string;
}

export interface AgentChatHistoryMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface AgentChatHistoryResponse {
  conversationId: string | null;
  messages: AgentChatHistoryMessage[];
}

export interface AgentChatRequest {
  message: string;
  conversationId?: string;
  /**
   * Pairs the user turn with its reply so a retry replays the stored answer
   * instead of generating (and billing) a second one. Generated once per send.
   */
  clientTurnId?: string;
  /**
   * Prior turns of this conversation. The chat endpoint is stateless, so history
   * omitted here is history the model never sees. Both this facade payload and the
   * route's Elysia body schema must carry the field — either one dropping it
   * silently reduces the turn to a single message.
   */
  conversationHistory?: AgentChatHistoryEntry[];
  context?: unknown;
  /**
   * Scope for tools whose credential is bound to a (project, agent) pair. Omitting
   * it makes every integration MCP tool unusable, because the resolver selects the
   * credential from that binding. Authorized server-side against the caller.
   */
  projectId?: string;
  /**
   * Provider-native model name overriding the agent's for THIS TURN only, so a
   * switch never rewrites the shared agent row. The credential still comes from
   * the user's own provider, resolved server-side.
   */
  model?: string;
  /**
   * Which of the user's threads this turn belongs to. Omit to keep resolving to
   * the pre-threads conversation, which the server derives from the agent id.
   */
  threadKey?: string;
  /**
   * Agents summoned by @mention. Each is authorized server-side against the
   * caller's assignments, so an id the user cannot reach is simply ignored.
   */
  mentionedAgentIds?: string[];
}

export interface AgentChatThreadListResponse {
  threads: AgentChatThreadSummary[];
}

export interface AgentChatThreadPatch {
  title?: string;
  /** Null clears the override so the thread falls back to the agent's model. */
  model?: string | null;
  archived?: boolean;
}

export interface AgentChatReplyView {
  agentId: string;
  agentName: string;
  content: string;
  messageId: string | null;
}

export interface AgentChatResponse {
  response: string;
  conversationId: string;
  timestamp: string;
  /**
   * One entry per agent that answered. Present whenever the turn was persisted;
   * `response` mirrors the first so a single-agent caller needs no change.
   */
  replies?: AgentChatReplyView[];
  metadata?: Record<string, unknown>;
}

export interface MCPStatus {
  configExists: boolean;
  configPath: string;
  servers: Array<{
    name: string;
    command: string;
    args: string[];
    disabled: boolean;
    status: 'unknown' | 'running' | 'stopped' | 'error' | 'starting';
    toolCount?: number;
    uptime?: number;
  }>;
}

export interface MCPConfig {
  exists: boolean;
  config: unknown | null;
  serversCount?: number;
  servers?: string[];
  message?: string;
}

export interface MCPUploadResult {
  message: string;
  configPath: string;
  serversProcessed: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  installationResults: Array<{
    name: string;
    status: 'success' | 'error' | 'skipped';
    error?: string;
    pid?: number;
  }>;
  installationStatus: Record<string, string>;
  installationErrors: Record<string, string>;
  mergedServers: string[];
}

export interface SecurityRule {
  id: string;
  type: 'allow' | 'deny' | 'require_approval';
  resource: string;
  action: string;
  conditions?: Record<string, unknown>;
  riskLevel?: RiskLevel;
}

export interface PolicyCreate {
  name: string;
  description?: string;
  rules: PolicyRule[];
  priority?: number;
  isActive?: boolean;
}

export interface PolicyUpdate {
  name?: string;
  description?: string;
  rules?: PolicyRule[];
  priority?: number;
  isActive?: boolean;
}

export interface TaskProgressUpdate {
  completionPercentage: number;
  timeSpent?: number;
}

// WorkflowDefinition / WorkflowTrigger / WorkflowExecution / WorkflowStepExecution
// were removed from this file: they described `triggers[]`, `isActive` and a generic
// step `action`, none of which the backend or `workflow_definitions` ever accepted.
// The canonical, executor-accurate contract lives in ./workflow_api.ts.

export interface OperationListOptions {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  priority?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: 'createdAt' | 'startedAt' | 'completedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ToolAnalytics {
  toolId: string;
  executionCount: number;
  successRate: number;
  averageExecutionTime: number;
  errorRate: number;
  usageByAgent: Record<string, number>;
  usageByUser: Record<string, number>;
  period: string;
}

export interface ToolExecutionRequest {
  input: unknown;
  context?: unknown;
  options?: {
    timeout?: number;
    retries?: number;
  };
}

export interface ToolExecutionResponse {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: unknown;
  error?: string;
  metadata?: unknown;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

export interface ToolListOptions {
  page?: number;
  limit?: number;
  category?: string;
  type?: string;
  isActive?: boolean;
  search?: string;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  type: string;
  visibility?: 'public' | 'private' | 'internal';
  recommendedAgents?: string[];
  settings?: unknown;
  metadata?: unknown;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  status?: string;
  type?: string;
  visibility?: 'public' | 'private' | 'internal';
  recommendedAgents?: string[];
  settings?: unknown;
  metadata?: unknown;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: string;
  joinedAt: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  content?: string;
  type: string;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListOptions {
  page?: number;
  limit?: number;
  status?: string;
  visibility?: 'public' | 'private' | 'internal';
  ownerId?: string;
  memberId?: string;
  search?: string;
}

export interface LLMContextAnalysis {
  topics: string[];
  entities: Array<{
    text: string;
    type: string;
    confidence: number;
  }>;
  sentiment: {
    score: number;
    label: 'positive' | 'negative' | 'neutral';
  };
  summary?: string;
}

export interface UserLLMProvider {
  id: string;
  userId: string;
  provider: string;
  apiKey?: string;
  configuration?: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
  models?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonaCreate {
  name: string;
  description?: string;
  traits?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  isActive?: boolean;
}

export interface PersonaUpdate {
  name?: string;
  description?: string;
  traits?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  isActive?: boolean;
}

export interface PersonaSearchRequest {
  query?: string;
  tags?: string[];
  traits?: Record<string, unknown>;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface PersonaListOptions {
  page?: number;
  limit?: number;
  isActive?: boolean;
  search?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditLogOptions {
  page?: number;
  limit?: number;
  eventType?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  result?: 'success' | 'failure';
  startDate?: string;
  endDate?: string;
  sortBy?: 'timestamp' | 'eventType' | 'userId';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditExportOptions {
  format: 'csv' | 'json' | 'pdf';
  eventType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  includeMetadata?: boolean;
}

export interface PasswordResetRequest {
  email: string;
}

export interface UserListOptions {
  page?: number;
  limit?: number;
  role?: string;
  isActive?: boolean;
  isLocked?: boolean;
  search?: string;
  sortBy?: 'email' | 'name' | 'createdAt' | 'lastLoginAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ConversationEnhancementRequest {
  discussionId: string;
  availableAgentIds: string[];
  messageHistory: Array<{
    id: string;
    speaker: string;
    content: string;
    timestamp: Date;
    metadata?: unknown;
  }>;
  currentTopic: string;
  conversationState?: {
    activePersonaId: string | null;
    lastSpeakerContinuityCount: number;
    recentContributors: string[];
    conversationEnergy: number;
    needsClarification: boolean;
    topicStability: 'stable' | 'shifting' | 'diverging';
  };
  participantId?: string;
  enhancementType?: 'auto' | 'manual' | 'triggered';
  context?: unknown;
}

export interface ConversationEnhancementResult {
  success: boolean;
  data?: {
    selectedAgent: unknown;
    selectedPersona: unknown;
    enhancedResponse: string;
    contributionScores: Array<{
      personaId: string;
      score: number;
      reasons: string[];
    }>;
    updatedState: unknown;
    flowAnalysis: unknown;
    suggestions: string[];
    nextActions: string[];
  };
  error?: string;
}

export interface ConversationAnalysisRequest {
  discussionId: string;
  messageHistory: Array<{
    id: string;
    speaker: string;
    content: string;
    timestamp: Date;
    metadata?: unknown;
  }>;
  conversationState: {
    activePersonaId: string | null;
    lastSpeakerContinuityCount: number;
    recentContributors: string[];
    conversationEnergy: number;
    needsClarification: boolean;
    topicStability: 'stable' | 'shifting' | 'diverging';
  };
  analysisType: 'flow' | 'insights' | 'health' | 'patterns';
}

export interface HybridPersonaRequest {
  persona1Id: string;
  persona2Id: string;
  hybridConfig?: {
    name?: string;
    dominantTraits?: 'persona1' | 'persona2' | 'balanced';
    blendRatio?: number;
    customAttributes?: unknown;
  };
}

export interface ContextualResponseRequest {
  agentId: string;
  personaId: string;
  context: {
    recentTopics: string[];
    conversationMomentum: 'building' | 'stable' | 'declining' | 'clarifying' | 'deciding';
    overallTone: 'collaborative' | 'competitive' | 'analytical' | 'creative';
    topicShiftDetected: boolean;
    participantCount: number;
  };
  baseContent: string;
}

export interface ApprovalWorkflowCreate {
  resourceType: string;
  resourceId: string;
  action: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  expiresIn?: number;
}

export interface ApprovalDecisionRequest {
  /**
   * See APPROVAL_DECISIONS in security.ts. `approve_with_edits` approves — it
   * differs from `approve` only in that it carries what the approver changed.
   */
  decision: 'approve' | 'approve_with_edits' | 'reject';
  reason?: string;
  /** Required when decision is 'approve_with_edits', rejected otherwise. */
  edits?: {
    diff: string;
    summary?: string;
  };
}

export interface ApprovalListOptions {
  page?: number;
  limit?: number;
  status?: 'pending' | 'approved' | 'rejected' | 'expired';
  requesterId?: string;
  approverId?: string;
  resourceType?: string;
  riskLevel?: RiskLevel;
  sortBy?: 'createdAt' | 'updatedAt' | 'expiresAt';
  sortOrder?: 'asc' | 'desc';
}

export interface CapabilityCreate {
  name: string;
  type: string;
  description?: string;
  provider: string;
  configuration?: Record<string, unknown>;
  requiredPermissions?: string[];
  dependencies?: string[];
  tags?: string[];
}

export interface CapabilityUpdate {
  name?: string;
  description?: string;
  configuration?: Record<string, unknown>;
  requiredPermissions?: string[];
  dependencies?: string[];
  tags?: string[];
  status?: string;
}

export interface CapabilityCategory {
  name: string;
  displayName: string;
  description?: string;
  capabilityCount: number;
  icon?: string;
}

export interface CapabilityDependency {
  capabilityId: string;
  dependsOn: string[];
  optional?: string[];
  conflicts?: string[];
}

export interface CapabilityValidation {
  valid: boolean;
  errors?: Array<{
    field: string;
    message: string;
  }>;
  warnings?: Array<{
    field: string;
    message: string;
  }>;
}

export interface CapabilityListOptions {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  provider?: string;
  tags?: string[];
  search?: string;
}

export interface ForgeRequest {
  projectBriefText: string;
  inputType?: string;
  stakeholderRoles?: string[];
  agentPersonaIds?: string[];
}

export interface ForgeResult {
  projectBriefId: string;
  normalizedBrief: NormalizedBrief;
  debateResult: CouncilDebateResult;
  questionPacks: Record<string, QuestionPack>;
  topAssumptions: Assumption[];
  contradictions: Contradiction[];
  interviewScripts: Record<string, InterviewScript>;
  metadata: {
    totalQuestions: number;
    totalAssumptions: number;
    totalContradictions: number;
    processingTimeMs: number;
  };
}

export type NormalizedBrief = QFNormalizedBrief;

export interface CouncilDebateResult {
  debateId: string;
  round1Analyses: AgentAnalysis[];
  round2Challenges: Array<{
    challengerId: string;
    targetId: string;
    challenge: string;
    mergedQuestions: string[];
    escalatedBlockers: string[];
  }>;
  synthesizedQuestions: Question[];
  contradictions: Contradiction[];
  consensusPoints: string[];
  unresolvedDisagreements: string[];
}

export interface InterviewScript {
  stakeholderRole: string;
  questions: Question[];
  totalQuestions: number;
}

export interface InterviewSession {
  id: string;
  projectBriefId: string;
  stakeholderRole: string;
  stakeholderName?: string;
  questions: Question[];
  currentQuestionIndex: number;
  answers: InterviewAnswer[];
  status: 'pending' | 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface InterviewAnswer {
  questionId: string;
  answer: string;
  confidence?: number;
  followUpNeeded: boolean;
  resolvedAssumptions: string[];
  newContradictions: string[];
  capturedAt: string;
}

export interface InterviewResult {
  sessionId: string;
  stakeholderRole: string;
  totalQuestions: number;
  answeredQuestions: number;
  resolvedAssumptions: Assumption[];
  newContradictions: Contradiction[];
  unresolvedQuestions: Question[];
  suggestedFollowUps: string[];
  completedAt: string;
}
