import { Decision } from './artifact';

// Knowledge Graph Core Types
export enum KnowledgeType {
  FACTUAL = 'FACTUAL',
  PROCEDURAL = 'PROCEDURAL',
  CONCEPTUAL = 'CONCEPTUAL',
  EXPERIENTIAL = 'EXPERIENTIAL',
  EPISODIC = 'EPISODIC',
  SEMANTIC = 'SEMANTIC',
  REPO_CONTEXT = 'repo-context',
  CODE_SYMBOL = 'code-symbol',
}

// Knowledge Scope for three-layered architecture
export interface KnowledgeScope {
  userId?: string; // User-specific knowledge
  agentId?: string; // Agent-specific knowledge
  // When both are null, it's general knowledge
}

export enum SourceType {
  GIT_REPOSITORY = 'GIT_REPOSITORY',
  FILE_SYSTEM = 'FILE_SYSTEM',
  AGENT_INTERACTION = 'AGENT_INTERACTION',
  OPERATION = 'OPERATION',
  DISCUSSION = 'DISCUSSION',
  EXTERNAL_API = 'EXTERNAL_API',
  USER_INPUT = 'USER_INPUT',
  AGENT_EPISODE = 'AGENT_EPISODE',
  AGENT_CONCEPT = 'AGENT_CONCEPT',
  CLUSTERED = 'CLUSTERED',
  CHAT_IMPORT = 'CHAT_IMPORT',
  AST_EXTRACTION = 'ast-extraction',
}

export enum SyncStatusType {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Core Knowledge Item
export interface KnowledgeItem {
  id: string;
  content: string;
  type: KnowledgeType;
  sourceType: SourceType;
  sourceIdentifier: string;
  sourceUrl?: string;
  tags: string[];
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  organizationId?: string;
  accessLevel: string;
  // Three-layered knowledge architecture
  userId?: string; // User-specific knowledge layer
  agentId?: string; // Agent-specific knowledge layer
  summary?: string; // Optional summary for large content
}

// Knowledge Search Interfaces
export interface KnowledgeSearchRequest {
  query: string;
  filters?: {
    tags?: string[];
    types?: KnowledgeType[];
    confidence?: number;
    dateRange?: DateRange;
    sourceTypes?: SourceType[];
    createdBy?: string;
    organizationId?: string;
    agentId?: string;
    userId?: string;
  };
  options?: {
    limit?: number;
    offset?: number;
    similarityThreshold?: number;
    includeRelationships?: boolean;
  };
  scope?: KnowledgeScope;
  timestamp: number;
}

export interface KnowledgeSearchResponse {
  items: KnowledgeItem[];
  totalCount: number;
  searchMetadata: {
    query: string;
    processingTime: number;
    similarityScores: number[];
    filtersApplied: string[];
  };
}

// Knowledge Ingestion Interfaces
export interface KnowledgeIngestRequest {
  content: string;
  type?: KnowledgeType;
  tags?: string[];
  source: {
    type: SourceType;
    identifier: string;
    url?: string;
    metadata?: Record<string, unknown>;
  };
  confidence?: number;
  createdBy?: string;
  organizationId?: string;
  accessLevel?: string;
}

export interface KnowledgeIngestResponse {
  items?: KnowledgeItem[];
  processedCount?: number;
  errors?: string[];
  conversationsFound?: number;
  knowledgeExtracted?: number;
  processingTime?: number;
  success?: boolean;
}

// Context and Classification
export interface ContextMessage {
  sender: string;
  content: string;
  role?: string;
  timestamp?: Date | string;
  metadata?: Record<string, unknown>;
}

export interface ContextDocument {
  title?: string;
  content?: string;
  language?: string;
  [key: string]: unknown;
}

export interface ContextRequest {
  userRequest?: string;
  currentContext?: ContextDocument;
  discussionHistory?: ContextMessage[];
  userPreferences?: Record<string, unknown>;
  conversationHistory?: ContextMessage[];
  agentCapabilities?: string[];
  relevantTags?: string[];
  timeRange?: DateRange;
  participantExpertise?: string[];
  language?: string;
}

export interface KnowledgeClassification {
  type: KnowledgeType;
  tags: string[];
  confidence: number;
  topics: string[];
  entities: string[];
}

// Knowledge Relationships
export interface KnowledgeRelationship {
  id: string;
  sourceItemId: string;
  targetItemId: string;
  relationshipType: string;
  confidence: number;
  createdAt: Date;
  // Three-layered knowledge architecture
  userId?: string; // User-specific relationship layer
  agentId?: string; // Agent-specific relationship layer
  summary?: string; // Optional summary for complex relationships
}

// Knowledge Sources
export interface KnowledgeSource {
  id: string;
  sourceType: SourceType;
  sourceIdentifier: string;
  sourceUrl?: string;
  lastSync?: Date;
  syncStatus: SyncStatusType;
  metadata: Record<string, unknown>;
}

// Vector Embeddings
export interface KnowledgeEmbedding {
  id: string;
  knowledgeItemId: string;
  embeddingVector: number[];
  modelVersion: string;
  chunkIndex: number;
  createdAt: Date;
}

// Utility Types
export interface DateRange {
  start: Date;
  end: Date;
}

export interface KnowledgeFilters {
  tags?: string[];
  types?: KnowledgeType[];
  confidence?: number;
  timeRange?: DateRange;
  sourceTypes?: SourceType[];
}

// Agent Memory Types
export interface WorkingMemory {
  agentId: string;
  sessionId: string;
  currentContext: {
    activeDiscussion?: {
      discussionId: string;
      topic: string;
      participants: string[];
      myRole: string;
      conversationHistory: unknown[];
      currentGoals: string[];
    };
    activeOperation?: {
      operationId: string;
      type: string;
      progress: number;
      currentStep: string;
      resources: string[];
      constraints: string[];
    };
    activeThoughts: {
      reasoning: string[];
      hypotheses: string[];
      nextActions: string[];
      uncertainties: string[];
    };
  };
  shortTermMemory: {
    recentInteractions: Interaction[];
    temporaryLearnings: TemporaryLearning[];
    contextualCues: ContextualCue[];
    emotionalState: EmotionalState;
  };
  workingSet: {
    relevantKnowledge: KnowledgeReference[];
    activeSkills: string[];
    availableTools: string[];
    currentStrategy: string;
  };
  metadata: {
    lastUpdated: Date;
    sessionStarted: Date;
    memoryPressure: number;
    consolidationNeeded: boolean;
  };
}

export interface Episode {
  agentId: string;
  episodeId: string;
  type: 'discussion' | 'operation' | 'learning' | 'problem_solving' | 'collaboration';
  context: {
    when: Date;
    where: string;
    who: string[];
    what: string;
    why: string;
    how: string;
    operationType?: string;
  };
  experience: {
    actions: Action[];
    decisions: Decision[];
    outcomes: Outcome[];
    emotions: EmotionalResponse[];
    learnings: string[];
  };
  significance: {
    importance: number;
    novelty: number;
    success: number;
    impact: number;
  };
  connections: {
    relatedEpisodes: string[];
    triggeredBy: string[];
    ledTo: string[];
    similarTo: string[];
  };
}

export interface SemanticMemory {
  agentId: string;
  concept: string;
  knowledge: {
    definition: string;
    properties: Record<string, unknown>;
    relationships: ConceptRelationship[];
    examples: string[];
    counterExamples: string[];
  };
  confidence: number;
  sources: {
    episodeIds: string[];
    externalSources: string[];
    reinforcements: number;
  };
  usage: {
    timesAccessed: number;
    lastUsed: Date;
    successRate: number;
    contexts: string[];
  };
}

// Supporting Types
export interface Interaction {
  id: string;
  type: string;
  description: string;
  timestamp: Date;
  participants: string[];
  context: Record<string, unknown>;
  success: boolean;
  impact: number;
  novelty: number;
  emotionalIntensity: number;
  emotionalResponse: EmotionalResponse;
  actions?: Action[];
  decisions?: Decision[];
  outcomes?: Outcome[];
  learnings?: string[];
  method?: string;
}

export interface TemporaryLearning {
  concept: string;
  description: string;
  confidence: number;
  source: string;
  timestamp: Date;
}

export interface ContextualCue {
  type: string;
  value: string;
  relevance: number;
  timestamp: Date;
}

export interface EmotionalState {
  mood: string;
  confidence: number;
  engagement: number;
  stress: number;
}

export interface KnowledgeReference {
  itemId: string;
  relevance: number;
  lastAccessed: Date;
}

export interface Action {
  id: string;
  description: string;
  type: string;
  timestamp: Date;
  success: boolean;
  metadata?: Record<string, unknown>;
}

export interface Outcome {
  id: string;
  description: string;
  type: string;
  success: boolean;
  impact: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface EmotionalResponse {
  emotion: string;
  intensity: number;
  trigger: string;
  timestamp: Date;
}

export interface ConceptRelationship {
  relatedConcept: string;
  relationshipType: string;
  strength: number;
}

// Query Types
export interface EpisodicQuery {
  description: string;
  limit?: number;
  minSignificance?: number;
  timeRange?: DateRange;
  episodeTypes?: string[];
}

// Agent Lifecycle Types
export interface AgentState {
  agentId: string;
  status: 'idle' | 'active' | 'busy' | 'error' | 'offline';
  currentActivity?: {
    type: 'discussion' | 'operation' | 'analysis' | 'learning';
    context: string;
    startedAt: Date;
    estimatedDuration?: number;
  };
  capabilities: string[];
  performance: {
    responseTime: number;
    successRate: number;
    lastActivity: Date;
  };
  context: {
    currentDiscussions: string[];
    activeOperations: string[];
    recentInteractions: string[];
  };
}

export interface AgentActivity {
  agentId: string;
  type: 'message_sent' | 'operation_executed' | 'decision_made' | 'knowledge_accessed';
  context: {
    discussionId?: string;
    operationId?: string;
    targetService?: string;
  };
  metadata: {
    duration: number;
    success: boolean;
    errorCode?: string;
    performance: {
      responseTime: number;
      resourceUsage: number;
    };
  };
  timestamp: Date;
}

export interface AgentInteraction {
  agentId: string;
  interactionType: 'discussion_participation' | 'operation_execution' | 'knowledge_query';
  context: string;
  outcome: 'success' | 'failure' | 'partial';
  learningPoints: string[];
  performanceMetrics: {
    efficiency: number;
    accuracy: number;
    userSatisfaction?: number;
  };
  timestamp: Date;
}

export interface AgentMetrics {
  agentId: string;
  timeRange: DateRange;
  totalActivities: number;
  successRate: number;
  averageResponseTime: number;
  performanceScore: number;
  learningProgress: number;
}

export interface ConsolidationResult {
  consolidated: boolean;
  reason?: string;
  episodesCreated?: number;
  conceptsLearned?: number;
  connectionsFormed?: number;
}

// QuestionForge Entity Types
export interface Assumption {
  id: string;
  stakeholderId: string;
  stakeholderName: string;
  content: string;
  projectBriefId: string;
  confidence: number;
  evidence?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Contradiction {
  id: string;
  projectBriefId: string;
  assumptionAId: string;
  assumptionBId: string;
  assumptionAContent: string;
  assumptionBContent: string;
  stakeholderAId: string;
  stakeholderAName: string;
  stakeholderBId: string;
  stakeholderBName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  resolution?: string;
  status: 'identified' | 'investigating' | 'resolved' | 'dismissed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Question {
  id: string;
  projectBriefId: string;
  stakeholderId?: string;
  stakeholderName?: string;
  category: QuestionCategory;
  text: string;
  intent: string;
  priority: number;
  phase: QuestionPhase;
  tags: string[];
  status: QuestionStatus;
  usageCount: number;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum QuestionCategory {
  STAKEHOLDER_ROLE = 'stakeholder_role',
  GOAL_MOTIVATION = 'goal_motivation',
  CONSTRAINT_LIMIT = 'constraint_limit',
  DECISION_PROCESS = 'decision_process',
  RISK_PERCEPTION = 'risk_perception',
  PRIORITY_TRADEoff = 'priority_tradeoff',
  ASSUMPTION_REVEAL = 'assumption_reveal',
  CONTRADICTION_EXPLORE = 'contradiction_explore',
  STAKEHOLDER_ALIGNMENT = 'stakeholder_alignment',
  UNEXPECTED_INSIGHT = 'unexpected_insight',
}

export enum QuestionPhase {
  DISCOVERY = 'discovery',
  INVESTIGATION = 'investigation',
  CLARIFICATION = 'clarification',
  VALIDATION = 'validation',
  SYNTHESIS = 'synthesis',
}

export enum QuestionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  VALIDATED = 'validated',
  ARCHIVED = 'archived',
}

export interface QuestionPack {
  id: string;
  projectBriefId: string;
  stakeholderId?: string;
  stakeholderName?: string;
  questions: Question[];
  totalQuestions: number;
  priorityQuestions: Question[];
  createdAt: Date;
  updatedAt: Date;
}

// Memory Update Types
export interface WorkingMemoryUpdate {
  currentInput?: string;
  retrievedEpisodes?: Episode[];
  relevantConcepts?: SemanticMemory[];
  lastInteraction?: {
    input: string;
    response: string;
    timestamp: Date;
    confidence: number;
  };
  lastOutcome?: unknown;
  currentContext?: Partial<WorkingMemory['currentContext']>;
  shortTermMemory?: Partial<WorkingMemory['shortTermMemory']>;
  // Additional properties for agent services
  environment?: Record<string, unknown>;
  agentState?: Record<string, unknown>;
  knowledgeUpdated?: Record<string, unknown>;
}

// ============================================================================
// Knowledge Clustering Types (moved from backend/shared/services)
// ============================================================================

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    content: string;
    knowledgeType: KnowledgeType;
    tags: string[];
    confidence: number;
    sourceType: string;
    originalMetadata: Record<string, unknown>;
  };
}

export interface SourceMetadata {
  id: string;
  sourceType: string;
  confidence: number;
  originalMetadata: Record<string, unknown>;
}

export interface KnowledgeCluster {
  clusterId: string;
  primaryVector: QdrantPoint;
  similarChunks: QdrantPoint[];
  consolidatedContent: string;
  confidence: number;
  sources: SourceMetadata[];
  consolidatedType: KnowledgeType;
  consolidatedTags: string[];
  averageConfidence: number;
}

export interface ClusteringResult {
  totalClusters: number;
  totalOriginalItems: number;
  totalConsolidatedItems: number;
  reductionRatio: number;
  averageClusterSize: number;
  clusters: KnowledgeCluster[];
}

// ============================================================================
// Chat Ingestion Types (moved from backend/shared/services)
// ============================================================================

export interface FileData {
  id: string;
  name: string;
  content: string;
  size: number;
  type: 'claude' | 'gpt' | 'whatsapp' | 'generic';
  userId: string;
}

export interface BatchJob {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  filesProcessed: number;
  totalFiles: number;
  extractedItems: number;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  options: ProcessingOptions;
}

export interface ProcessingOptions {
  batchSize?: number;
  concurrency?: number;
  extractKnowledge?: boolean;
  saveToGraph?: boolean;
  generateEmbeddings?: boolean;
}

export interface ProcessingResult {
  fileId: string;
  success: boolean;
  conversationsFound: number;
  knowledgeExtracted: number;
  error?: string;
  processingTime: number;
}

export interface BatchResult {
  jobId: string;
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalKnowledgeExtracted: number;
  totalProcessingTime: number;
  errors: string[];
}

// Chat Parser Types
export interface ParsedMessage {
  id: string;
  timestamp: Date;
  sender: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'system';
  metadata: Record<string, unknown>;
}

export interface ParsedConversation {
  id: string;
  platform: 'claude' | 'gpt' | 'whatsapp' | 'generic';
  title?: string;
  participants: string[];
  messages: ParsedMessage[];
  metadata: {
    totalMessages: number;
    dateRange: { start: Date; end: Date };
    fileSize: number;
    originalFilename: string;
    parsedAt: Date;
  };
}

export interface ChatParsingResult {
  conversations: ParsedConversation[];
  totalMessages: number;
  totalConversations: number;
  parsingErrors: string[];
  processingTime: number;
  detectedPlatform: string;
}

// Chat Knowledge Extractor Types
export interface ChatConversationContext {
  conversationId: string;
  participantCount: number;
  messageIndex: number;
  totalMessages: number;
  timeRange: { start: Date; end: Date };
  platform: string;
}

// Alias for backward compatibility with services that use ConversationContext

export interface ExtractedKnowledge {
  content: string;
  type: KnowledgeType;
  confidence: number;
  context: ChatConversationContext;
  tags: string[];
  metadata: {
    extractionMethod: string;
    sourceMessages: string[];
    participants: string[];
    domain?: string;
  };
}

export interface QAPair {
  id: string;
  question: string;
  answer: string;
  context: ChatConversationContext;
  confidence: number;
  tags: string[];
  participants: { questioner: string; answerer: string };
}

export interface DecisionPoint {
  id: string;
  decision: string;
  reasoning: string[];
  alternatives: string[];
  outcome?: string;
  context: ChatConversationContext;
  confidence: number;
  participants: string[];
}

export interface ExpertiseArea {
  domain: string;
  participant: string;
  evidenceMessages: string[];
  confidence: number;
  skills: string[];
  context: ChatConversationContext;
}

export interface LearningMoment {
  id: string;
  learner: string;
  teacher: string;
  topic: string;
  content: string;
  learningType: 'explanation' | 'correction' | 'guidance' | 'example' | 'discovery';
  context: ChatConversationContext;
  confidence: number;
}

export interface KnowledgeExtractionResult {
  extractedKnowledge: ExtractedKnowledge[];
  qaPairs: QAPair[];
  decisionPoints: DecisionPoint[];
  expertiseAreas: ExpertiseArea[];
  learningMoments: LearningMoment[];
  extractionMetrics: {
    totalMessagesProcessed: number;
    knowledgeItemsExtracted: number;
    avgConfidence: number;
    processingTime: number;
    extractionMethods: Record<string, number>;
  };
}

// Health and Sync Types
export interface QdrantHealthStatus {
  isConnected: boolean;
  collectionExists: boolean;
  pointsCount: number;
  postgresItemsCount: number;
  syncNeeded: boolean;
  lastError?: string;
}

export interface SimplifiedSyncResult {
  totalFromNeo4j: number;
  totalToQdrant: number;
  totalClustered: number;
  totalToPostgres: number;
  clustersCreated: number;
  reductionRatio: number;
  errors: string[];
  syncTimestamp: Date;
}

export interface Neo4jKnowledgeItem {
  id: string;
  content: string;
  type: string;
  tags: string[];
  confidence: number;
  sourceType: string;
  metadata: Record<string, unknown>;
}

export interface BootstrapConfig {
  enableAutoSync: boolean;
  syncOnStartup: boolean;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
  useSimplifiedSync: boolean;
}

export interface BootstrapStatus {
  syncResult: SimplifiedSyncResult;
  clusteringEnabled: boolean;
  totalReduction: number;
  finalKnowledgeItems: number;
}

// Qdrant vector store types
export type MemoryCollectionType = 'episodic' | 'semantic';

export interface CollectionOptions {
  collection?: MemoryCollectionType;
}

export interface VectorSearchOptions {
  limit: number;
  threshold?: number;
  filters?: Record<string, unknown>;
  tenantId?: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

// Knowledge ingestion types
export interface IngestionOptions {
  batchSize?: number;
  overwrite?: boolean;
  generateEmbeddings?: boolean;
  skipDuplicates?: boolean;
}

export interface IngestionResult {
  processed: number;
  skipped: number;
  errors: string[];
  duration: number;
}
