// Artifact System Type Definitions for Navratna
// This file defines the comprehensive type system for artifact generation and management

export type ArtifactType = 
  | 'code' | 'test' | 'documentation' | 'prd' | 'config' 
  | 'deployment' | 'script' | 'template' | 'report' | 'analysis'
  | 'code-diff' | 'workflow';

export type ValidationStatus = 'pending' | 'valid' | 'invalid' | 'warning';

export interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
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
  issues?: ValidationError[]; // For backward compatibility
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
  generatedBy?: string; // Added for service tracking
  template?: string; // Added for template tracking
}

export interface TraceabilityInfo {
  conversationId: string;
  generatedBy: string;
  generatedAt: Date;
  generator: string;
  confidence: number;
  sourceMessages: string[];
}

export interface Artifact {
  id?: string; // Added id property
  type: string;
  content: string;
  metadata: ArtifactMetadata;
  traceability?: TraceabilityInfo;
  validation?: ValidationResult;
}

// Artifact Review System
export interface ArtifactReview {
  id: string;
  artifactId: string;
  reviewerId: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs-changes';
  score?: number;
  comments?: string;
  suggestions?: string[];
  reviewedAt?: Date;
  metadata?: Record<string, any>;
}

// Artifact Deployment System
export interface ArtifactDeployment {
  id: string;
  artifactId: string;
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

// Conversation phase information with details
export interface ConversationPhaseInfo {
  current: ConversationPhase;
  confidence: number;
  suggestedActions: string[];
}

// For backward compatibility - this is what ConversationAnalyzer expects
export interface ConversationPhaseDetails {
  current: string;
  confidence: number;
  suggestedActions: string[];
}

export interface Decision {
  id: string;
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
  id: string;
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
  id: string;
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
  options?: { // Added options property
    template?: string;
    language?: string;
    framework?: string;
  };
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
  id: string;
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
  language?: string; // Added language property
  framework?: string; // Added framework property
}

// Extended conversation context for artifacts
export interface ArtifactConversationContext {
  conversationId: string;
  messages: ConversationMessage[];
  participants: Participant[];
  summary?: string;
  topics: string[];
  decisions: Decision[];
  actionItems: ActionItem[];
  metadata?: Record<string, any>;
  // Added properties for artifact generation
  agent?: {
    id: string;
    name?: string;
    type?: string;
  };
  persona?: {
    role: string;
    communicationStyle?: string;
    name?: string;
  };
  discussion?: {
    id: string;
    messages: ConversationMessage[];
    participants?: Participant[];
  };
  technical?: {
    language?: string;
    framework?: string;
    requirements?: string[];
  };
}

export interface ConversationMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Legacy artifact message interface for backward compatibility
export interface ArtifactMessage {
  id: string;
  content: string;
  timestamp: string;
  author: string;
  role: string;
}

export interface Participant {
  id: string;
  name: string;
  role: string;
  type: 'human' | 'agent';
  metadata?: Record<string, any>;
}

// Additional types for conversation-driven artifact generation
export type ConversationPhase = 'discussion' | 'clarification' | 'decision' | 'implementation' | 'review';

// Agent and Persona types for artifact services
export interface AgentPreferences {
  codeStyle?: string;
  testingFramework?: string;
  documentationFormat?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
} 