import { Decision } from './artifact';

// Knowledge Graph Core Types
export enum KnowledgeType {
  FACTUAL = 'FACTUAL',
  PROCEDURAL = 'PROCEDURAL',
  CONCEPTUAL = 'CONCEPTUAL',
  EXPERIENTIAL = 'EXPERIENTIAL',
  EPISODIC = 'EPISODIC',
  SEMANTIC = 'SEMANTIC'
}

// Knowledge Scope for three-layered architecture
export interface KnowledgeScope {
  userId?: string;    // User-specific knowledge
  agentId?: string;   // Agent-specific knowledge  
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
  AGENT_CONCEPT = 'AGENT_CONCEPT'
}

export enum SyncStatusType {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
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
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  organizationId?: string;
  accessLevel: string;
  // Three-layered knowledge architecture
  userId?: string;    // User-specific knowledge layer
  agentId?: string;   // Agent-specific knowledge layer
  summary?: string;   // Optional summary for large content
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
  };
  options?: {
    limit?: number;
    offset?: number;
    similarityThreshold?: number;
    includeRelationships?: boolean;
  };
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
    metadata?: Record<string, any>;
  };
  confidence?: number;
  createdBy?: string;
  organizationId?: string;
  accessLevel?: string;
}

export interface KnowledgeIngestResponse {
  items: KnowledgeItem[];
  processedCount: number;
  errors?: string[];
}

// Context and Classification
export interface ContextRequest {
  userRequest?: string;
  currentContext?: any;
  discussionHistory?: any[];
  userPreferences?: Record<string, any>;
  conversationHistory?: any[];
  agentCapabilities?: string[];
  relevantTags?: string[];
  timeRange?: DateRange;
  participantExpertise?: string[];
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
  userId?: string;    // User-specific relationship layer
  agentId?: string;   // Agent-specific relationship layer
  summary?: string;   // Optional summary for complex relationships
}

// Knowledge Sources
export interface KnowledgeSource {
  id: string;
  sourceType: SourceType;
  sourceIdentifier: string;
  sourceUrl?: string;
  lastSync?: Date;
  syncStatus: SyncStatusType;
  metadata: Record<string, any>;
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
      conversationHistory: any[];
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
    properties: Record<string, any>;
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
  context: Record<string, any>;
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
  metadata?: Record<string, any>;
}


export interface Outcome {
  id: string;
  description: string;
  type: string;
  success: boolean;
  impact: number;
  timestamp: Date;
  metadata?: Record<string, any>;
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
  lastOutcome?: any;
  currentContext?: Partial<WorkingMemory['currentContext']>;
  shortTermMemory?: Partial<WorkingMemory['shortTermMemory']>;
} 