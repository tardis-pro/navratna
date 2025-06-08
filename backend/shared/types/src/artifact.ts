// Artifact System Type Definitions for Council of Nycea
// This file defines the comprehensive type system for artifact generation and management

export type ArtifactType = 
  | 'code' | 'test' | 'documentation' | 'prd' | 'config' 
  | 'deployment' | 'script' | 'template' | 'report' | 'analysis';

export type ValidationStatus = 'valid' | 'invalid' | 'warning';

export interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  code: string;
  message: string;
  severity: 'warning' | 'info';
}

export interface ValidationResult {
  status: ValidationStatus;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  score: number;
}

export interface ArtifactMetadata {
  id?: string;
  title: string;
  description?: string;
  language?: string;
  framework?: string;
  targetFile?: string;
  estimatedEffort?: 'low' | 'medium' | 'high';
  tags: string[];
  version?: string;
  author?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TraceabilityInfo {
  conversationId: number;
  generatedBy: string;
  generatedAt: Date;
  generator: string;
  confidence: number;
  sourceMessages: string[];
}

export interface Artifact {
  type: string;
  content: string;
  metadata: ArtifactMetadata;
  traceability?: TraceabilityInfo;
  validation?: ValidationResult;
}

// Artifact Review System
export interface ArtifactReview {
  Id: number;
  artifactId: number;
  reviewerId: number;
  status: 'pending' | 'approved' | 'rejected' | 'needs-changes';
  score?: number;
  comments?: string;
  suggestions?: string[];
  reviewedAt?: Date;
  metadata?: Record<string, any>;
}

// Artifact Deployment System
export interface ArtifactDeployment {
  Id: number;
  artifactId: number;
  environment: string;
  status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'rolled-back';
  deployedBy: string;
  deployedAt?: Date;
  rollbackAt?: Date;
  deploymentConfig?: Record<string, any>;
  logs?: string[];
  metadata?: Record<string, any>;
}

// Generation triggers and context
export interface GenerationTrigger {
  type: 'command' | 'pattern' | 'phase_change';
  confidence: number;
  artifactType: string;
  context: string;
  detectedAt: string;
}

export interface ConversationPhase {
  current: string;
  confidence: number;
  suggestedActions: string[];
}

export interface Decision {
  Id: number;
  description: string;
  decidedBy?: string;
  decidedAt?: Date;
  impact?: 'low' | 'medium' | 'high';
  options?: string[];
  chosen?: string;
  reasoning?: string;
  timestamp?: Date;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface ActionItem {
  Id: number;
  description: string;
  assignedTo?: string;
  assignee?: string;
  dueDate?: Date;
  priority: 'low' | 'medium' | 'high';
  status?: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  createdAt?: string;
  metadata?: Record<string, any>;
}

export interface Requirement {
  Id: number;
  type: 'functional' | 'non_functional' | 'business_rule' | 'constraint';
  description: string;
  priority: 'must_have' | 'should_have' | 'could_have' | 'wont_have';
  source: string;
  extractedAt: string;
}

export interface ConversationSummary {
  keyPoints: string[];
  decisions: Decision[];
  actionItems: ActionItem[];
  participants: string[];
  phase: string;
  confidence: number;
}

// API interfaces
export interface ArtifactGenerationRequest {
  type: ArtifactType;
  context: ArtifactConversationContext;
  requirements?: string[];
  constraints?: string[];
  preferences?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ArtifactGenerationResponse {
  success: boolean;
  artifact?: Artifact;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: Record<string, any>;
}

// Template system - using different name to avoid conflict with capability.ts
export interface ArtifactGenerationTemplate {
  Id: number;
  name: string;
  description: string;
  type: ArtifactType;
  template: string;
  variables: Record<string, any>;
  examples: any[];
  tags: string[];
  version: string;
  author: string;
  isEnabled: boolean;
  metadata?: Record<string, any>;
}

// Conversation context for artifacts
export interface ArtifactConversationContext {
  conversationId: number;
  messages: ConversationMessage[];
  participants: Participant[];
  summary?: string;
  topics: string[];
  decisions: Decision[];
  actionItems: ActionItem[];
  metadata?: Record<string, any>;
}

export interface ConversationMessage {
  Id: number;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Legacy artifact message interface for backward compatibility
export interface ArtifactMessage {
  Id: number;
  content: string;
  timestamp: string;
  author: string;
  role: string;
}

export interface Participant {
  Id: number;
  name: string;
  role: string;
  type: 'human' | 'agent';
  metadata?: Record<string, any>;
} 