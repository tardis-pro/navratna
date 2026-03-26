import { KnowledgeType, SourceType } from './knowledge_graph';

// ─── Constellation Types ─────────────────────────────────────────────

/** A constellation is a group of semantically related knowledge items */
export interface Constellation {
  id: string;
  name: string;
  description: string;
  knowledgeType: KnowledgeType;
  items: ConstellationItem[];
  relevanceScore: number;
  confidence: number;
  tags: string[];
  health: ConstellationHealth;
  metadata: ConstellationMetadata;
}

export interface ConstellationItem {
  id: string;
  title: string;
  content: string;
  knowledgeType: KnowledgeType;
  sourceType: SourceType;
  confidence: number;
  tags: string[];
  relevanceScore: number;
  createdAt: string;
  updatedAt: string;
}

export type ConstellationHealth =
  | 'stable'
  | 'active'
  | 'processing'
  | 'conflicted'
  | 'ambiguous'
  | 'validated'
  | 'stale';

export interface ConstellationMetadata {
  itemCount: number;
  averageConfidence: number;
  dominantSourceType: SourceType;
  lastUpdated: string;
  clusterSimilarity: number;
}

export interface ConstellationRequest {
  query?: string;
  limit?: number;
  minSimilarity?: number;
  includeItems?: boolean;
}

export interface ConstellationResponse {
  constellations: Constellation[];
  totalItems: number;
  query: string;
  clusteredAt: string;
}

// ─── Health → Expression Mapping ─────────────────────────────────────

export const CONSTELLATION_HEALTH_EXPRESSION_MAP = {
  stable: 'calm',
  active: 'attentive',
  processing: 'working',
  conflicted: 'alarmed',
  ambiguous: 'confused',
  validated: 'satisfied',
  stale: 'strained',
} as const;

export type ConstellationExpressionMap = typeof CONSTELLATION_HEALTH_EXPRESSION_MAP;

// ─── Force Layout Types ──────────────────────────────────────────────

export interface ForceLayoutConfig {
  gravity: number;
  springStrength: number;
  repulsion: number;
  friction: number;
  centerX: number;
  centerY: number;
}

export const DEFAULT_FORCE_LAYOUT_CONFIG: ForceLayoutConfig = {
  gravity: 0.3,
  springStrength: 0.5,
  repulsion: 0.8,
  friction: 0.85,
  centerX: 0,
  centerY: 0,
};

// ─── Jira Outcome Types ──────────────────────────────────────────────

export interface JiraOutcomeEvent {
  issueKey: string;
  issueId: string;
  projectKey: string;
  transitionName: string;
  fromStatus: string;
  toStatus: string;
  operationId: string;
  agentId: string;
  timestamp: string;
  metadata: Record<string, string>;
}

export type JiraOperationStatus = 'success' | 'failure';

export interface JiraOperationOutcome {
  operationType: string;
  issueKey: string;
  issueId: string;
  projectKey: string;
  status: JiraOperationStatus;
  agentId: string;
  operationId: string;
  result: Record<string, string | number | boolean>;
  timestamp: string;
}
